import { useState, useMemo, useEffect, useRef } from "react";
import { LayoutGrid, Star, Search, PanelLeft, PanelLeftClose, Info, ClipboardList, Scan, Activity } from "lucide-react";
import { AdminFullWidthPage } from "@/components/ui/AdminFullWidthPage";
import { CageColorProvider } from "@/features/cage-shelf/components/CageColorContext";
import CageShelfLegend from "@/features/cage-shelf/components/CageShelfLegend";
import { ShelfGrid } from "@/features/cage-shelf/components/ShelfGrid";
import CageOpSelectBanner from "@/features/cage-shelf/components/CageOpSelectBanner";
import CageModeIsland, { modeBorderColor, useIslandVariant, type CageModeKey } from "@/features/cage-shelf/components/CageModeIsland";
import CageOperationDialog from "@/features/cage-shelf/components/CageOperationDialog";
import { useCageOpSelect, buildCageOpMarks } from "@/features/cage-shelf/useCageOpSelect";
import { CampusTree, buildTree } from "@/features/cage-shelf/components/CampusTree";
import { displayPosition } from "@/features/cage-shelf/constants";
import { fetchFullTree, fetchLocalShelfGridByShelveId, fetchMyClaims, fetchPoolCells, claimCage, cancelClaim, confirmClaim, lookupCode, locateTargetOf, fetchCageModeVisible, fetchCageOpMarkers, saveCageDivision, type CageShelfCell, type CageShelfTreeNode, type CageClaimItem, type PoolCell } from "@/api/domains/cageShelf.api";
import { fetchStudentMobileSpecialStatusOverview } from "@/api/domains/studentMobile.api";
import MobileScanDialog from "@/pages/mobile/MobileScanDialog";
import MobileSpecialStatusPanel from "@/pages/mobile/MobileSpecialStatusPanel";
import toast from "react-hot-toast";
import { fetchPinnedCageShelves, toggleCageShelfPin, type PinnedCageShelfDetail } from "../api/student.api";
import { CellDetailPanel } from "./cage-shelf-detail-panel";
import { PersonnelPicker } from "@/components/admin/PersonnelPicker";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createPortal } from "react-dom";

import { appAlert } from "@/lib/appDialog";
/* ================================================================== */
/*  Main Page — uses shared ShelfGrid / CampusTree / CellButton         */
/* ================================================================== */

export default function StudentCageShelfPage() {
  const [tab, setTab] = useState<"filter" | "bookmarks" | "claims">("filter");
  const [myClaims, setMyClaims] = useState<CageClaimItem[]>([]);
  const [claimsLoading, setClaimsLoading] = useState(false);

  const loadMyClaims = async () => { setClaimsLoading(true); try { setMyClaims(await fetchMyClaims()); } catch { setMyClaims([]); } finally { setClaimsLoading(false); } };
  useEffect(() => { loadMyClaims(); }, []);

  const CLAIM_STATUS_LABEL: Record<string, string> = {
    pending_approval: "审批中", locked: "已锁定", confirmed: "已确认",
    pending_release_approval: "释放审批中", rejected: "已驳回", cancelled: "已取消", released: "已释放",
  };
  const CLAIM_STATUS_COLOR: Record<string, string> = {
    pending_approval: "text-[var(--student-warning)] bg-[var(--student-warning-soft)] border-[var(--student-warning-soft)]",
    locked: "text-[var(--student-accent-telemetry)] bg-[var(--student-accent-telemetry-soft)] border-[var(--student-accent-telemetry-soft)]",
    confirmed: "text-[var(--student-success)] bg-[var(--student-success-soft)] border-[var(--student-success-soft)]",
    pending_release_approval: "text-[var(--student-accent-alert)] bg-[var(--student-accent-alert-soft)] border-[var(--student-accent-alert-soft)]",
    rejected: "text-[var(--student-error)] bg-[var(--student-error-soft)] border-[var(--student-error-soft)]",
    cancelled: "text-[var(--student-mute)] bg-[var(--student-canvas-soft)] border-[var(--student-hairline)]",
    released: "text-[var(--student-mute)] bg-[var(--student-canvas-soft)] border-[var(--student-hairline)]",
  };
  const claimLocation = (c: CageClaimItem) => {
    const parts = [c.campusName, c.roomName, c.shelveName].filter(Boolean);
    const pos = c.positionX != null && c.positionY != null ? displayPosition(`${c.positionX}-${c.positionY}`) : "";
    const base = parts.length ? parts.join(" / ") : `笼位 #${c.animalCageId}`;
    return pos ? `${base} · ${pos}` : base;
  };
  // 我的申请按 校区/房间 分组（条目内不再重复房间名，只留笼架·格位）
  const claimShort = (c: CageClaimItem) => {
    const pos = c.positionX != null && c.positionY != null ? displayPosition(`${c.positionX}-${c.positionY}`) : "";
    return [c.shelveName, pos].filter(Boolean).join(" · ") || `笼位 #${c.animalCageId}`;
  };
  const claimGroups = useMemo(() => {
    const m = new Map<string, CageClaimItem[]>();
    for (const c of myClaims) {
      const key = [c.campusName, c.roomName].filter(Boolean).join(" / ") || "未指定房间";
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(c);
    }
    return Array.from(m.entries());
  }, [myClaims]);
  const [collapsed, setCollapsed] = useState(false);
  const [viewMode, setViewMode] = useState<"room" | "shelf">("room");
  const [search, setSearch] = useState("");
  const [legend, setLegend] = useState(false);

  /**
   * 左栏视图与 tab 解耦：「我的申请」只是右栏的一个视图，左栏没有对应列表。
   * 若直接跟 tab 走，切到 claims 时两个分支都不成立 → CampusTree 被卸载、列表清空、滚动位置丢失。
   * 所以记住最后一个非 claims 的视图，切到 claims 时左栏保持不变。
   */
  const [leftView, setLeftView] = useState<"filter" | "bookmarks">("filter");
  useEffect(() => { if (tab !== "claims") setLeftView(tab); }, [tab]);

  // Tree
  const emptyTree = useMemo(() => [] as CageShelfTreeNode[], []);
  const { data: fullTree = emptyTree } = useQuery({ queryKey: ["cageShelfFullTree"], queryFn: fetchFullTree, staleTime: 10 * 60 * 1000 });
  const tree = useMemo(() => buildTree(fullTree), [fullTree]);
  const [exp, setExp] = useState<Set<string>>(new Set());
  const expInited = useRef(false);
  useEffect(() => {
    if (expInited.current || tree.length === 0) return;
    const keys = new Set<string>();
    for (const c of tree) { keys.add(c.key); for (const n of c.children) { keys.add(n.key); } }
    setExp(keys);
    expInited.current = true;
  }, [tree]);

  // Room → shelves map
  const roomShelveMap = useMemo(() => {
    const m = new Map<string, { shelveId: string; shelveName: string }[]>();
    for (const r of fullTree) { const rid = String(r.roomId ?? ""); if (!rid) continue; if (!m.has(rid)) m.set(rid, []); m.get(rid)!.push({ shelveId: String(r.shelveId ?? ""), shelveName: r.shelveName || String(r.shelveId) }); }
    return m;
  }, [fullTree]);

  // shelveId(字符串) → cage_shelf_index.id（shelfIndexId）
  const shelfIndexIdByShelveId = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of fullTree) {
      const sid = String(r.shelveId ?? "");
      if (sid && r.id != null) m.set(sid, r.id);
    }
    return m;
  }, [fullTree]);

  const [aRid, setARid] = useState(""); const [aRname, setARname] = useState("");
  const [details, setDetails] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [cell, setCell] = useState<CageShelfCell | null>(null);
  const [shelfId, setShelfId] = useState<string | null>(null);

  // ── 申请模式（申请预约 = 预约审核）──
  const [claimMode, setClaimMode] = useState(false);
  // ── 认领模式（到场确认）──
  const [confirmMode, setConfirmMode] = useState(false);
  // 本人待确认到位的笼位：认领模式下高亮，学生不必逐格猜哪个是自己的
  const myLockedCageIds = useMemo(
    () => new Set(myClaims.filter(c => c.claimStatus === "locked").map(c => String(c.animalCageId))),
    [myClaims],
  );
  const [poolCells, setPoolCells] = useState<Map<string, PoolCell>>(new Map()); // animalCageId → PoolCell
  const [claimSubmitting, setClaimSubmitting] = useState(false);
  const [claimSelected, setClaimSelected] = useState<Set<string>>(new Set());
  const [divisionMode, setDivisionMode] = useState(false);
  const [divisionPickerOpen, setDivisionPickerOpen] = useState(false);
  const [divisionSubmitting, setDivisionSubmitting] = useState(false);
  const [divisionBoxSelect, setDivisionBoxSelect] = useState(false);
  const divisionBoxAnchorRef = useRef<{ sid: string; x: number; y: number } | null>(null);
  const [claimReloadKey, setClaimReloadKey] = useState(0);

  // ── 扫码 / 特殊状态总览（对齐 H5、小程序）──
  const [scanOpen, setScanOpen] = useState(false);
  const [specialOpen, setSpecialOpen] = useState(false);

  // ── 模式可见性：后端算好身份后下发（null=尚未加载，回退全显示）──
  // 只在**学生账号**下生效：教职工镜像看学生页时后端下发的是教职工模式列表，
  // 拿它过滤会把「申请预约」滤掉（该页始终是学生页，模式集合应固定为学生的三个）。
  const [allowedModes, setAllowedModes] = useState<string[] | null>(null);
  useEffect(() => {
    fetchCageModeVisible()
      .then(r => setAllowedModes(r.isStudent ? r.modes : null))
      .catch(() => setAllowedModes(null));
  }, []);
  const canClaim = allowedModes == null || allowedModes.includes("studentClaim");
  const canConfirm = allowedModes == null || allowedModes.includes("confirm");
  /** 划分模式：管家专属（后端下发的能力位；具体写权限由后端二次校验） */
  const canDivide = allowedModes == null || allowedModes.includes("division");

  /* ---- 模式悬浮岛：与管理端同一套组件、同一份模式元数据、同一个形态选择 ---- */
  const [islandVariant, toggleIslandVariant] = useIslandVariant();
  const rightPanelRef = useRef<HTMLDivElement | null>(null);
  const currentMode: CageModeKey = confirmMode ? "confirm" : claimMode ? "studentClaim" : divisionMode ? "division" : "view";
  /** 圈圈形态收缩时只占一个小圆钮，不需要留白；横向程序坞才需要 */
  const islandPadStyle = islandVariant === "dock" ? { paddingBottom: 88 } : undefined;
  const modeGlow = modeBorderColor(currentMode);
  const modeGlowProps = modeGlow ? { glowColor: modeGlow } : {};
  /** 学生端可用的模式：查看恒有，申请/确认按后端下发的能力 */
  const islandModes = useMemo<CageModeKey[]>(() => {
    const list: CageModeKey[] = ["view"];
    if (canClaim) list.push("studentClaim");
    if (canConfirm) list.push("confirm");
    if (canDivide) list.push("division");
    return list;
  }, [canClaim, canConfirm, canDivide]);
  const switchMode = (k: CageModeKey) => {
    setClaimMode(k === "studentClaim");
    setConfirmMode(k === "confirm");
    setDivisionMode(k === "division");
    setDivisionBoxSelect(false);
    divisionBoxAnchorRef.current = null;
    if (k !== "studentClaim" && k !== "division") {
      setPoolCells(new Map());
      setClaimSelected(new Set());
    }
  };

  // 进入申请模式时，加载当前房间所有架子的池数据
  useEffect(() => {
    if (!claimMode || !aRid) { setPoolCells(new Map()); return; }
    const shelves = roomShelveMap.get(aRid) ?? [];
    if (shelves.length === 0) return;
    (async () => {
      const all: PoolCell[] = [];
      for (const s of shelves) {
        try {
          const idxId = shelfIndexIdByShelveId.get(String(s.shelveId));
          if (idxId) {
            const cells = await fetchPoolCells(idxId);
            all.push(...cells);
          } else {
            console.warn("[claim] 未找到 shelfIndexId，shelveId=", s.shelveId);
          }
        } catch { /* shelf may not be synced yet */ }
      }
      const m = new Map<string, PoolCell>();
      for (const c of all) m.set(String(c.animalCageId), c);
      setPoolCells(m);
    })();
  }, [claimMode, aRid, fullTree, roomShelveMap, shelfIndexIdByShelveId]);

  const handleClaimToggle = (sid: string, x: number, y: number, _shiftKey?: boolean) => {
    const key = `${sid}:${x}:${y}`;
    const aid = cellIdByKey.get(key);
    if (!aid || !poolCells.has(aid)) {
      void appAlert("该笼位不在你的可申请范围内，无法申请。");
      return;
    }
    setClaimSelected((prev) => {
      const n = new Set(prev);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });
  };

  /** 勾选集合 → animalCageId（划分与申请共用同一个 selected 集合） */
  const selectedCageIds = () => {
    const ids: string[] = [];
    for (const key of claimSelected) {
      const aid = cellIdByKey.get(key);
      if (aid) ids.push(aid);
    }
    return ids;
  };

  const findCellByKey = (sid: string, x: number, y: number) => {
    for (const d of details) {
      if (String(d.shelfMeta?.shelveId) === sid) return d.grid?.find((c: any) => c.x === x && c.y === y);
    }
    if (shelfDetail && String(shelfDetail.shelfMeta?.shelveId) === sid) {
      return shelfDetail.grid?.find((c: any) => c.x === x && c.y === y);
    }
    return undefined;
  };

  /** 划分模式勾选：单击切换 / 框选按钮点两格成矩形。type1（等待分配）不可划 —— 底层约束 */
  const handleDivisionToggle = (sid: string, x: number, y: number, _shiftKey?: boolean) => {
    const eligible = (cx: number, cy: number) => {
      const id = cellIdByKey.get(`${sid}:${cx}:${cy}`);
      if (!id) return false;
      const c: any = findCellByKey(sid, cx, cy);
      return (c?.cageTypeCode ?? c?.animalCageType) !== 1;
    };
    const badHint = "待分配状态的笼位未归属课题组，不能划分";
    const key = `${sid}:${x}:${y}`;
    const patch = (fn: (n: Set<string>) => void) =>
      setClaimSelected(prev => { const n = new Set(prev); fn(n); return n; });

    if (divisionBoxSelect) {
      const anchor = divisionBoxAnchorRef.current;
      if (!anchor || anchor.sid !== sid) {
        if (!eligible(x, y)) { void appAlert(badHint); return; }
        divisionBoxAnchorRef.current = { sid, x, y };
        patch(n => n.add(key));
        return;
      }
      const minX = Math.min(anchor.x, x), maxX = Math.max(anchor.x, x);
      const minY = Math.min(anchor.y, y), maxY = Math.max(anchor.y, y);
      patch(n => {
        for (let cx = minX; cx <= maxX; cx++)
          for (let cy = minY; cy <= maxY; cy++)
            if (eligible(cx, cy)) n.add(`${sid}:${cx}:${cy}`);
      });
      divisionBoxAnchorRef.current = null;
      setDivisionBoxSelect(false);
      return;
    }
    if (!claimSelected.has(key) && !eligible(x, y)) { void appAlert(badHint); return; }
    patch(n => { n.has(key) ? n.delete(key) : n.add(key); });
  };

  /** 划分提交：多笼位 × 多人 = 全部配对 */
  const submitDivision = async (ids: string[], names: string[]) => {
    const cageIds = selectedCageIds();
    if (cageIds.length === 0) { void appAlert("请先勾选笼位"); return; }
    if (ids.length === 0) { void appAlert("请选择要划分的人员"); return; }
    setDivisionSubmitting(true);
    try {
      await saveCageDivision(cageIds, ids.map((id, i) => ({ id, name: names[i] ?? "" })));
      toast.success(`已把 ${cageIds.length} 个笼位划分给 ${ids.length} 人`);
      setClaimSelected(new Set());
      setDivisionPickerOpen(false);
      setClaimReloadKey(k => k + 1);
    } catch (e: any) {
      toast.error(e?.message || "保存划分失败");
    } finally {
      setDivisionSubmitting(false);
    }
  };

  const submitClaims = async () => {
    if (claimSelected.size === 0) return;
    const keys = Array.from(claimSelected);
    setClaimSubmitting(true);
    let ok = 0, fail = 0;
    const okIds = new Set<string>();
    const errors: string[] = [];
    for (const key of keys) {
      const aid = cellIdByKey.get(key);
      if (!aid) { fail++; errors.push("无法定位笼位ID"); continue; }
      const pc = poolCells.get(aid);
      if (!pc) { fail++; errors.push("该笼位已不在可申请池中"); continue; }
      const idxId = shelfIndexIdByShelveId.get(String(pc.shelveId));
      if (!idxId) { fail++; errors.push("未找到笼架索引"); continue; }
      try { await claimCage(aid, idxId); ok++; okIds.add(aid); }
      catch (e: any) { fail++; errors.push(e?.message || "申请失败"); }
    }
    setClaimSubmitting(false);
    setClaimSelected(new Set());
    // 只移除真正申请成功的笼位；失败的保留在池中，避免视觉上像被占用
    if (okIds.size > 0) {
      setPoolCells((prev) => {
        const n = new Map(prev);
        for (const aid of okIds) n.delete(aid);
        return n;
      });
    }
    if (ok > 0) setClaimReloadKey((k) => k + 1);
    const firstErr = errors[0];
    if (ok > 0 && fail > 0) {
      await appAlert(`已提交 ${ok} 个申请；${fail} 个失败。${firstErr ? `失败原因：${firstErr}` : ""}`);
    } else if (ok > 0) {
      await appAlert(`申请已提交：${ok} 个`);
    } else {
      await appAlert(firstErr || `申请失败 ${fail} 个`);
    }
  };

  // 认领模式（到场确认）：点击自己 locked 的笼位确认到位
  const handleConfirmCell = async (c: any) => {
    const st = c.claimStatus;
    const claimId = c.activeClaimId;
    if (st === "locked" && claimId) {
      try {
        await confirmClaim(claimId);
        await appAlert("已确认到位");
        setClaimReloadKey(k => k + 1);
      } catch (e: any) {
        await appAlert(e.message);
      }
    } else if (st === "confirmed") {
      await appAlert("该笼位已到位");
    } else if (st === "pending_approval") {
      await appAlert("该笼位待审批");
    } else {
      await appAlert("该笼位无待确认的认领");
    }
  };

  useEffect(() => {
    if (!aRid) { setDetails([]); return; }
    const shelves = roomShelveMap.get(aRid) ?? [];
    if (shelves.length === 0) { setDetails([]); return; }
    let cancelled = false; setLoading(true);
    void (async () => {
      try {
        const results = await Promise.all(shelves.map(s => fetchLocalShelfGridByShelveId(String(s.shelveId)).catch(() => null)));
        if (cancelled) return;
        setDetails(results.filter((r): r is any => r !== null));
        setLoading(false);
      } catch { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [aRid, fullTree, claimReloadKey]);

  // Bookmarks
  const [pinned, setPinned] = useState<Set<string>>(new Set());
  const [bmList, setBmList] = useState<PinnedCageShelfDetail[]>([]);
  const [bmLoading, setBmLoading] = useState(false);

  const toggleBm = async (sid: string) => { try { const r = await toggleCageShelfPin(sid); setPinned(p => { const n = new Set(p); if (r.isPinned) n.add(sid); else n.delete(sid); return n; }); if (r.isPinned) { if (tab === "bookmarks") await loadBm(); } else { setBmList(p => p.filter(b => b.shelfMeta.shelveId !== sid)); } } catch {/* ignore */} };
  const loadBm = async () => { setBmLoading(true); try { const list = await fetchPinnedCageShelves(); setBmList(list); setPinned(new Set(list.map(b => b.shelfMeta.shelveId))); } catch { } finally { setBmLoading(false); } };
  useEffect(() => { if (tab === "bookmarks") loadBm(); }, [tab]);

  // Shelf detail
  const [shelfDetail, setShelfDetail] = useState<any>(null);
  const [shelfLoading, setShelfLoading] = useState(false);

  // `${shelveId}:${x}:${y}` → animalCageId（雪花，字符串）
  const cellIdByKey = useMemo(() => {
    const m = new Map<string, string>();
    const add = (d: any) => {
      const sid = String(d?.shelfMeta?.shelveId ?? "");
      for (const c of d?.grid ?? []) {
        const aid = String((c as any).id ?? (c as any).animalCageId ?? "");
        if (sid && aid) m.set(`${sid}:${c.x}:${c.y}`, aid);
      }
    };
    for (const d of details) add(d);
    if (shelfDetail) add(shelfDetail);
    return m;
  }, [details, shelfDetail]);

  /** 划分模式的可选高亮：非 type1 且有笼位ID的格子 → 复用认领池那套绿环机制标出「哪些能划」 */
  const divisionPoolCells = useMemo(() => {
    if (!divisionMode) return undefined;
    const m = new Map<string, PoolCell>();
    const add = (grid: any[]) => {
      for (const c of grid ?? []) {
        const id = String(c.id ?? c.animalCageId ?? "");
        const ct = c.cageTypeCode ?? c.animalCageType;
        if (id && ct !== 1) m.set(id, c as PoolCell);
      }
    };
    for (const d of details) add(d.grid);
    if (shelfDetail) add(shelfDetail.grid);
    return m;
  }, [divisionMode, details, shelfDetail]);

  /* ---- 分笼 / 转移：选位模式 ---- */
  const opSel = useCageOpSelect();
  const opActive = opSel.active;
  const qc = useQueryClient();
  /** 待审分笼/转移的中间态：学生只看得到自己提交的（后端按身份过滤） */
  const { data: pendingOps = [] } = useQuery({
    queryKey: ["cage-op", "markers"],
    queryFn: fetchCageOpMarkers,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });
  const opMarkByCageId = useMemo(() => buildCageOpMarks(pendingOps), [pendingOps]);
  const keyByCageId = useMemo(() => {
    const m = new Map<string, string>();
    for (const [k, id] of cellIdByKey) m.set(id, k);
    return m;
  }, [cellIdByKey]);
  const opSelectedCells = useMemo(() => {
    const s = new Set<string>();
    for (const id of opSel.selected) {
      const k = keyByCageId.get(id);
      if (k) s.add(k);
    }
    return s;
  }, [opSel.selected, keyByCageId]);
  const handleOpToggle = (sid: string, x: number, y: number) => {
    const id = cellIdByKey.get(`${sid}:${x}:${y}`);
    if (id) opSel.toggle(id);
  };
  const opGridProps = {
    opMarkerByCageId: opMarkByCageId,
    ...(opActive ? {
      selectable: true,
      selectedCells: opSelectedCells,
      onToggleCell: handleOpToggle,
      allocMode: true,
      clickMode: "toggle" as const,
      claimMode: true,
      poolCells: opSel.eligibleMap as Map<string, any>,
      restrictSelectToPool: true,
      onCellClick: undefined,
    } : {}),
  };

  // 点左栏目录即「看这个房间/笼架」，必须把右栏切回筛选视图：
  // 「我的申请」状态下左栏仍显示目录，不切回来就会变成点了没反应的死点击
  const onOpenRoom = (roomId: string, roomName: string) => { setTab("filter"); setARid(roomId); setARname(roomName); setShelfDetail(null); };
  const onOpenShelf = async (shelveId: string, _overrideRoomId?: string) => { setTab("filter"); setShelfLoading(true); setShelfDetail(null); try { const d = await fetchLocalShelfGridByShelveId(shelveId); setShelfDetail(d); } catch { setShelfDetail(null); } finally { setShelfLoading(false); } };

  /** 扫码结果：定位到房间/笼架并打开该笼位详情（对齐 H5 handleResidentScan 的「纯定位」分支） */
  const handleScanResult = async (text: string) => {
    setScanOpen(false);
    const code = (text || "").trim();
    if (!code) return;
    let r: Awaited<ReturnType<typeof lookupCode>>;
    try {
      r = await lookupCode(code);
    } catch (e: any) {
      toast.error(e?.message || "扫码查询失败");
      return;
    }
    if (r.type === "NOT_FOUND") { toast.error("未找到对应笼位"); return; }
    // 两种命中形态（CAGE_CELL 嵌在 cageCell 里 / LEGACY_CAGE_BOX 平铺）统一在这里归一，
    // 别自己读顶层字段 —— 笼盒码的定位信息不在顶层
    const t = locateTargetOf(r);
    if (!t) { toast.error(r.message || "该编码无法定位到笼位"); return; }
    if (!t.shelveId) { toast.error("该编码未关联笼架"); return; }
    setTab("filter");
    setViewMode("shelf");
    if (t.roomId) { setARid(t.roomId); setARname(t.roomName || t.roomId); }
    setShelfLoading(true);
    setShelfDetail(null);
    try {
      const d = await fetchLocalShelfGridByShelveId(t.shelveId);
      setShelfDetail(d);
      const hit = (d?.grid ?? []).find((c: any) => Number(c.x) === Number(t.positionX) && Number(c.y) === Number(t.positionY));
      if (hit) { setShelfId(t.shelveId); setCell(hit as CageShelfCell); }
      else toast.error("已定位到笼架，但未找到该格位");
    } catch (e: any) {
      setShelfDetail(null);
      toast.error(e?.message || "定位失败");
    } finally {
      setShelfLoading(false);
    }
  };

  // Cell detail modal
  const [cellModal, setCellModal] = useState(false);

  return (
    <CageColorProvider>
      <style>{`.cage-scroll::-webkit-scrollbar{width:4px;height:4px}.cage-scroll::-webkit-scrollbar-track{background:transparent}.cage-scroll::-webkit-scrollbar-thumb{background:var(--student-border);border-radius:4px}.cage-scroll::-webkit-scrollbar-thumb:hover{background:var(--student-mute)}.cage-scroll{scrollbar-width:thin;scrollbar-color:var(--student-border) transparent}`}</style>
      <AdminFullWidthPage>
        <div className="flex gap-2" style={{ height: "calc(100dvh - var(--student-chrome-offset) - 8px)" }}>
        {/* LEFT PANEL */}
        <div className={`shrink-0 flex-col gap-1.5 transition-all h-full ${collapsed ? 'hidden' : 'flex w-48 xl:w-52'}`}>
          {!collapsed && <div className="shrink-0 flex items-center gap-1 rounded-student-sm border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-1.5 py-1">
            <Search className="h-3.5 w-3.5 shrink-0 text-[var(--app-color-text-tertiary)]" /><input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索…" className="flex-1 min-w-0 bg-transparent text-[11px] outline-none text-[var(--app-color-text-primary)] placeholder:text-[var(--app-color-text-tertiary)]" />
          </div>}
          {!collapsed && <div className="cage-scroll flex-1 min-h-0 overflow-y-auto overflow-x-hidden rounded-student-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-1.5">
            {leftView === "filter" && <CampusTree tree={tree} exp={exp} search={search} onToggle={k => setExp(p => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; })} onOpenRoom={onOpenRoom} viewMode={viewMode} onOpenShelf={onOpenShelf} alertStatusesByShelf={new Map()} alertStatusesByRoom={new Map()} />}
            {leftView === "bookmarks" && <>
              {bmLoading && <div className="text-[var(--app-color-text-tertiary)] py-4 text-center text-[11px]">加载中…</div>}
              {!bmLoading && bmList.length === 0 && <div className="text-[var(--app-color-text-tertiary)] py-4 text-center text-[11px]">暂无收藏</div>}
              {!bmLoading && bmList.map(b => <button key={b.shelfMeta.shelveId} onClick={() => { setTab("filter"); onOpenRoom(String(b.roomId ?? ""), b.shelfMeta.roomName); }} className="w-full text-left rounded-student-md border border-[var(--student-border)] bg-[var(--student-canvas)] px-2 py-1.5 mb-1 hover:border-[var(--student-primary)] transition">
                <div className="flex items-center gap-1"><Star className="h-2.5 w-2.5 shrink-0 fill-amber-400 text-amber-400" /><span className="truncate text-[11px] font-medium text-[var(--student-ink)]">{b.shelfMeta.shelveName}</span></div>
                <div className="text-[10px] text-[var(--app-color-text-tertiary)] mt-0.5">{b.shelfMeta.campusName} · {b.shelfMeta.roomName}</div>
              </button>)}
            </>}
          </div>}
        </div>

        {/* RIGHT PANEL */}
        <div ref={rightPanelRef} className="flex-1 min-w-0 grid grid-rows-[auto_1fr] h-full pr-1 overflow-hidden">
          <div className="shrink-0 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setCollapsed(v => !v)} className="shrink-0 rounded p-1 text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-text-primary)] hover:bg-[var(--app-color-surface-container)]" title={collapsed ? "展开侧栏" : "收起侧栏"}>
                  {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                </button>
                <div className="flex items-center gap-1 rounded-student-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-1">
                  <button onClick={() => setTab("bookmarks")} className={`flex items-center gap-1 rounded-student-sm px-2.5 py-1 text-[11px] font-semibold transition ${tab === "bookmarks" ? "bg-[var(--app-color-accent-hover)] text-white shadow-sm" : "text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-text-primary)]"}`}><Star className="h-3 w-3" />收藏</button>
                  <button onClick={() => setTab("filter")} className={`flex items-center gap-1 rounded-student-sm px-2.5 py-1 text-[11px] font-semibold transition ${tab === "filter" ? "bg-[var(--app-color-accent-hover)] text-white shadow-sm" : "text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-text-primary)]"}`}><LayoutGrid className="h-3 w-3" />筛选</button>
                  <button onClick={() => { setTab("claims"); loadMyClaims(); }} className={`flex items-center gap-1 rounded-student-sm px-2.5 py-1 text-[11px] font-semibold transition ${tab === "claims" ? "bg-[var(--app-color-accent-hover)] text-white shadow-sm" : "text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-text-primary)]"}`}><ClipboardList className="h-3 w-3" />我的申请</button>
                </div>
                {tab === "filter" && <div className="flex items-center gap-1 rounded-student-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-1">
                  <button onClick={() => setViewMode("room")} className={`rounded-student-sm px-2.5 py-1 text-[11px] font-semibold transition ${viewMode === "room" ? "bg-[var(--app-color-accent-hover)] text-white shadow-sm" : "text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-text-primary)]"}`}>全房间</button>
                  <button onClick={() => setViewMode("shelf")} className={`rounded-student-sm px-2.5 py-1 text-[11px] font-semibold transition ${viewMode === "shelf" ? "bg-[var(--app-color-accent-hover)] text-white shadow-sm" : "text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-text-primary)]"}`}>单笼架</button>
                </div>}
                {/* 模式切换已移到右下角的「模式悬浮岛」（见文件末尾 CageModeIsland），
                    与管理端共用同一套组件与说明 */}
                {claimMode && claimSelected.size > 0 && (
                  <button onClick={submitClaims} disabled={claimSubmitting}
                    className="rounded-student-sm px-2.5 py-1 text-[11px] font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                    {claimSubmitting ? "提交中…" : `提交申请(${claimSelected.size})`}
                  </button>
                )}
                {divisionMode && <>
                  <span className="text-[10px] font-semibold text-[var(--app-color-text-tertiary)]">已选 {claimSelected.size} 个笼位</span>
                  <button onClick={() => { setDivisionBoxSelect(v => !v); divisionBoxAnchorRef.current = null; }}
                    className={`rounded-student-sm px-2 py-1 text-[11px] font-semibold transition ${divisionBoxSelect ? "bg-amber-500 text-white shadow-sm" : "border border-dashed border-[var(--app-color-border-default)] text-[var(--app-color-text-tertiary)]"}`}>
                    {divisionBoxSelect ? "框选中 · 点击两格" : "⬜ 矩形框选"}
                  </button>
                  <button onClick={() => setDivisionPickerOpen(true)} disabled={claimSelected.size === 0 || divisionSubmitting}
                    className="rounded-student-sm px-2.5 py-1 text-[11px] font-semibold bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50">
                    {divisionSubmitting ? "提交中…" : "选择人员并划分"}
                  </button>
                  <button onClick={() => setClaimSelected(new Set())} disabled={claimSelected.size === 0}
                    className="rounded-student-sm px-2 py-1 text-[11px] font-semibold border border-[var(--app-color-border-default)] text-[var(--app-color-text-tertiary)] disabled:opacity-40">
                    清除
                  </button>
                </>}
              </div>
              <div className="flex items-center gap-1">
                <div className="flex items-center gap-1 rounded-student-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-1">
                <button onClick={() => setScanOpen(true)} className="flex items-center gap-1 rounded-student-sm px-2 py-1 text-[10px] text-[var(--app-color-text-tertiary)] transition hover:bg-[var(--app-color-surface-hover)] hover:text-[var(--app-color-text-primary)]" title="扫码定位"><Scan className="h-3 w-3" />扫码</button>
                <button onClick={() => setSpecialOpen(true)} className="flex items-center gap-1 rounded-student-sm px-2 py-1 text-[10px] text-[var(--app-color-text-tertiary)] transition hover:bg-[var(--app-color-surface-hover)] hover:text-[var(--app-color-text-primary)]" title="特殊状态总览"><Activity className="h-3 w-3" />特殊状态</button>
                <button onClick={() => setLegend(v => !v)} className={`flex items-center gap-1 rounded-student-sm px-2 py-1 text-[10px] transition ${legend ? "bg-[var(--app-color-accent-hover)] text-white" : "text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-text-primary)]"}`}><Info className="h-3 w-3" />图例{legend ? " ▲" : " ▼"}</button>
                </div>
              </div>
            </div>
            {legend && <CageShelfLegend />}
            {opActive && <CageOpSelectBanner sel={opSel} />}
          </div>

          <div className="cage-scroll flex-1 min-h-0 overflow-y-auto space-y-2" style={islandPadStyle}>
            {tab === "filter" && <>
              {/* ROOM MODE */}
              {viewMode === "room" && <>
                {!aRid && <div className="rounded-student-lg border border-dashed border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] h-full flex flex-col items-center justify-center text-center text-sm text-[var(--app-color-text-tertiary)]"><LayoutGrid className="h-10 w-10 mx-auto mb-3 opacity-20" />展开左侧目录，点击房间下的笼架<br /><span className="text-[11px]">点击笼架后加载该房间所有笼架详情</span></div>}
                {loading && <div className="rounded-student-lg border border-dashed border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-4 text-center text-sm text-[var(--app-color-text-tertiary)]">正在加载房间笼架（{details.length}）…</div>}
                {!loading && aRid && details.length === 0 && <div className="rounded-student-lg border border-amber-200/90 bg-amber-50/80 p-4 text-sm text-amber-900">当前房间暂无笼架数据</div>}
                {details.length > 0 && <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">{details.map((d, idx) => {
                  const sid = String(d.shelfMeta?.shelveId ?? ""), isBm = sid !== "" && pinned.has(sid);
                  return <div key={sid || idx} id={`shelf-${sid}`}><ShelfGrid title={d.shelfMeta?.shelveName ?? `笼架 ${idx + 1}`} detail={d} loading={false} emptyHint="暂无笼架数据" isBookmarked={isBm} alertMap={new Map()} onToggleBookmark={sid !== "" ? () => toggleBm(sid) : undefined} claimMode={claimMode||divisionMode} poolCells={divisionMode?divisionPoolCells:poolCells} myClaimCageIds={confirmMode ? myLockedCageIds : undefined} selectable={claimMode||divisionMode} selectedCells={claimSelected} onToggleCell={claimMode ? handleClaimToggle : divisionMode ? handleDivisionToggle : undefined} allocMode={claimMode||divisionMode} clickMode={claimMode ? "toggle" : undefined} onCellClick={(c: any) => { if (confirmMode) { void handleConfirmCell(c); } else { setShelfId(sid); setCell(c); } }} {...opGridProps} {...modeGlowProps} /></div>;
                })}</div>}
              </>}

              {/* SHELF MODE */}
              {viewMode === "shelf" && <div className="flex gap-3 h-full min-h-0">
                <div className="w-1/2 flex flex-col min-w-0">
                  {shelfLoading && <div className="flex-1 rounded-student-lg border border-dashed border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] grid place-items-center text-sm text-[var(--app-color-text-tertiary)]">加载笼架…</div>}
                  {!shelfLoading && !shelfDetail && <div className="flex-1 rounded-student-lg border border-dashed border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] flex flex-col items-center justify-center text-sm text-[var(--app-color-text-tertiary)]"><LayoutGrid className="h-10 w-10 mb-3 opacity-20" />点击左侧笼架<br /><span className="text-[11px]">选中后显示该笼架 8x10 笼位</span></div>}
                  {!shelfLoading && shelfDetail && <ShelfGrid title={shelfDetail.shelfMeta?.shelveName || "笼架"} detail={shelfDetail} loading={false} emptyHint="暂无数据" claimMode={claimMode||divisionMode} poolCells={divisionMode?divisionPoolCells:poolCells} myClaimCageIds={confirmMode ? myLockedCageIds : undefined} alertMap={new Map()} selectable={claimMode||divisionMode} selectedCells={claimSelected} onToggleCell={claimMode ? handleClaimToggle : divisionMode ? handleDivisionToggle : undefined} allocMode={claimMode||divisionMode} clickMode={claimMode ? "toggle" : undefined} onCellClick={(c: any) => { if (confirmMode) { void handleConfirmCell(c); } else { setShelfId(String(shelfDetail.shelfMeta?.shelveId ?? "")); setCell(c); } }} {...opGridProps} {...modeGlowProps} />}
                </div>
                <div className="w-1/2 flex flex-col min-w-0">
                  {cell ? <CellDetailPanel cell={cell} opMarkByCageId={opMarkByCageId} gridMeta={shelfDetail?.shelfMeta ?? null} shelveId={shelfId ?? ""} onClose={() => setCell(null)} onStartOp={(k, s) => { setClaimMode(false); setConfirmMode(false); setCell(null); setShelfId(null); void opSel.start(k, s); }} onChanged={() => setClaimReloadKey(k => k + 1)} canDivide={canDivide} /> :
                    <div className="flex-1 rounded-student-lg border border-dashed border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] flex flex-col items-center justify-center text-sm text-[var(--app-color-text-tertiary)]"><div className="text-4xl mb-3 opacity-20">📋</div>笼盒详情预备画面<br /><span className="text-[11px]">点击左侧笼位格子显示笼盒信息</span></div>}
                </div>
              </div>}
            </>}

            {tab === "bookmarks" && <>
              {pinned.size === 0 && !bmLoading && <div className="rounded-student-lg border border-dashed border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] h-full flex flex-col items-center justify-center text-center text-sm text-[var(--app-color-text-tertiary)]"><Star className="h-10 w-10 mx-auto mb-3 opacity-20" />暂无收藏的笼架<br /><span className="text-[11px]">在筛选页面将笼架加入收藏后在此处查看</span></div>}
              {!bmLoading && bmList.length > 0 && <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">{bmList.map(b => {
                const sid = b.shelfMeta.shelveId;
                return <div key={sid}><ShelfGrid title={b.shelfMeta.shelveName || sid} detail={b} loading={false} emptyHint="暂无数据" isBookmarked={true} alertMap={new Map()} onToggleBookmark={() => toggleBm(sid)} claimMode={claimMode||divisionMode} poolCells={divisionMode?divisionPoolCells:poolCells} myClaimCageIds={confirmMode ? myLockedCageIds : undefined} selectable={claimMode||divisionMode} selectedCells={claimSelected} onToggleCell={claimMode ? handleClaimToggle : divisionMode ? handleDivisionToggle : undefined} allocMode={claimMode||divisionMode} clickMode={claimMode ? "toggle" : undefined} onCellClick={(c: any) => { if (confirmMode) { void handleConfirmCell(c); } else { setCell(c); setShelfId(sid); } }} {...opGridProps} {...modeGlowProps} /></div>;
              })}</div>}
            </>}

            {tab === "claims" && <>
              {claimsLoading && <div className="rounded-student-lg border border-dashed border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] h-full flex items-center justify-center text-sm text-[var(--app-color-text-tertiary)]">加载中…</div>}
              {!claimsLoading && myClaims.length === 0 && <div className="rounded-student-lg border border-dashed border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] h-full flex flex-col items-center justify-center text-center text-sm text-[var(--app-color-text-tertiary)]"><ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-20" />暂无申请记录<br /><span className="text-[11px]">在筛选页面选择笼位后点击申请</span></div>}
              {!claimsLoading && myClaims.length > 0 && <div className="space-y-3">
                {claimGroups.map(([room, items]) => (
                  <div key={room}>
                    <div className="flex items-center gap-1.5 px-1 pb-1.5">
                      <span className="text-[11px] font-semibold text-[var(--app-color-text-tertiary)]">{room}</span>
                      <span className="text-[10px] text-[color-mix(in_srgb,var(--app-color-text-tertiary)_60%,transparent)]">{items.length}</span>
                    </div>
                    <div className="space-y-1.5">
                      {items.map(c => (
                        <div key={c.id} className="flex items-center gap-2 rounded-student-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-3 py-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[12px] font-semibold truncate text-[var(--app-color-text-primary)]">{claimShort(c)}</span>
                              <span className={`inline-flex items-center shrink-0 px-1.5 py-0.5 rounded-full text-[9px] font-semibold border ${CLAIM_STATUS_COLOR[c.claimStatus] || "text-[var(--app-color-text-tertiary)] bg-[var(--app-color-surface-hover)] border-[var(--app-color-border-default)]"}`}>{CLAIM_STATUS_LABEL[c.claimStatus] || c.claimStatus}</span>
                            </div>
                            <div className="text-[10px] truncate text-[var(--app-color-text-tertiary)]">
                              申请时间：{c.createdAt?.substring(0, 16)?.replace("T", " ")}
                              {c.claimStatus === "rejected" && c.latestRejectReason ? <span className="text-[var(--student-error)]"> · 驳回：{c.latestRejectReason}</span> : null}
                            </div>
                          </div>
                          <div className="shrink-0 flex items-center gap-1">
                            {/* 学生仅在审核完毕前可取消；审核通过后不再提供取消/释放，释放由教职工发起 */}
                            {c.claimStatus === "pending_approval" && (
                              <button onClick={async () => { try { await cancelClaim(c.id); loadMyClaims(); } catch (e: any) { await appAlert(e.message); } }}
                                className="rounded-student-sm px-2 py-1 text-[10px] font-semibold border border-red-300 text-red-600 hover:bg-red-50">取消</button>
                            )}
                            {c.claimStatus === "locked" && (
                              <button onClick={async () => { try { await confirmClaim(c.id); loadMyClaims(); setClaimReloadKey(k => k + 1); } catch (e: any) { await appAlert(e.message); } }}
                                className="rounded-student-sm px-2 py-1 text-[10px] font-semibold bg-emerald-600 text-white hover:bg-emerald-700">确认到位</button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>}
            </>}
          </div>
        </div>
      </div>
      </AdminFullWidthPage>

      {cell && viewMode !== "shelf" && createPortal(<div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={() => { setCell(null); setShelfId(null); }}>
        <div className="w-full max-w-xl max-h-[85vh] overflow-y-auto rounded-student-lg bg-[var(--app-color-surface-container)] p-4 shadow-[var(--student-shadow-modal)]" onClick={e => e.stopPropagation()}>
          <div className="mb-2 flex items-center justify-between"><div className="text-sm font-semibold text-[var(--app-color-text-primary)]">笼盒详情 · 格位 {displayPosition(cell.position)}</div><button className="text-xs text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-text-primary)]" onClick={() => { setCell(null); setShelfId(null); }}>关闭</button></div>
          <CellDetailPanel cell={cell} opMarkByCageId={opMarkByCageId} gridMeta={null} shelveId={shelfId ?? ""} onClose={() => { setCell(null); setShelfId(null); }} onStartOp={(k, s) => { setClaimMode(false); setConfirmMode(false); setCell(null); setShelfId(null); void opSel.start(k, s); }} onChanged={() => setClaimReloadKey(k => k + 1)} canDivide={canDivide} />
        </div>
      </div>, document.body)}
      <CageOperationDialog
        open={opSel.confirmOpen}
        op={opSel.kind ?? "divide"}
        source={opSel.source}
        picked={opSel.picked}
        onClose={opSel.closeConfirm}
        onDone={() => { opSel.cancel(); setClaimReloadKey(k => k + 1); void qc.invalidateQueries({ queryKey: ["cage-op", "markers"] }); }}
      />
      <MobileScanDialog open={scanOpen} onClose={() => setScanOpen(false)} onResult={handleScanResult} />
      <MobileSpecialStatusPanel open={specialOpen} onClose={() => setSpecialOpen(false)} apiFn={fetchStudentMobileSpecialStatusOverview} />
      {/* 划分：选人（限定本课题组，多选）→ 全量覆盖所选笼位的名单 */}
      {divisionPickerOpen && <PersonnelPicker
        groupNames={[aRid || "本课题组"]}
        onClose={() => setDivisionPickerOpen(false)}
        onConfirm={(ids, names) => { void submitDivision(ids, names); }}
      />}
      {/* 模式悬浮岛：与管理端同一套组件、同一份模式元数据；给出说明是因为
          「申请预约」「确认」光看名字分不清谁在做什么 */}
      <CageModeIsland
        current={currentMode}
        allowed={islandModes}
        onPick={switchMode}
        variant={islandVariant}
        anchorRef={rightPanelRef}
        onToggleVariant={toggleIslandVariant}
      />
    </CageColorProvider>
  );
}
