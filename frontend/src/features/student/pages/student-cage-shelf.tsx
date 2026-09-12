import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { LayoutGrid, Star, Search, PanelLeft, PanelLeftClose, Info, ClipboardList, Scan, Activity } from "lucide-react";
import { AdminFullWidthPage } from "@/components/ui/AdminFullWidthPage";
import { CageColorProvider } from "@/features/cage-shelf/components/CageColorContext";
import CageShelfLegend from "@/features/cage-shelf/components/CageShelfLegend";
import { ShelfGrid } from "@/features/cage-shelf/components/ShelfGrid";
import CageOpSelectBanner from "@/features/cage-shelf/components/CageOpSelectBanner";
import CageModeIsland, { modeBorderColor, useIslandVariant, type CageModeKey } from "@/features/cage-shelf/components/CageModeIsland";
import CageOperationDialog from "@/features/cage-shelf/components/CageOperationDialog";
import { useCageOpSelect, buildCageOpMarks, mergeReservationMarks, type CageOpLabel } from "@/features/cage-shelf/useCageOpSelect";
import BatchTransferPanel from "@/features/cage-shelf/components/BatchTransferPanel";
import { resolveCageType, groupKeyOf } from "@/features/cage-shelf/components/CageCellOverlays";
import { CampusTree, buildTree } from "@/features/cage-shelf/components/CampusTree";
import { displayPosition, CAGE_BOX_ACTIONS, cageBoxAction, actionsFromFormValues, parseStatusZone, statusZoneKey } from "@/features/cage-shelf/constants";
import { DEFAULT_COLORS } from "@/features/cage-shelf/components/CageColorContext";
import { fetchCageInfoValues, type CageInfoValueRow } from "@/features/cage-shelf/api/cageForm.api";
import { fetchFullTree, fetchLocalShelfGridByShelveId, fetchMyClaims, fetchPoolCells, claimCage, cancelClaim, confirmClaim, lookupCode, locateTargetOf, fetchCageModeVisible, fetchCageOpMarkers, saveCageDivision, searchPersonnelByKeyword, submitCageTransfer, localEdit, type CageShelfCell, type CageShelfTreeNode, type CageClaimItem, type PoolCell, type CageBoxAction } from "@/api/domains/cageShelf.api";
import { fetchStudentMobileSpecialStatusOverview } from "@/api/domains/studentMobile.api";
import { fetchActiveCageReservations } from "@/api/domains/animalOrderCage.api";
import MobileScanDialog from "@/pages/mobile/MobileScanDialog";
import MobileSpecialStatusPanel from "@/pages/mobile/MobileSpecialStatusPanel";
import toast from "react-hot-toast";
import { fetchPinnedCageShelves, toggleCageShelfPin, type PinnedCageShelfDetail } from "../api/student.api";
import { CellDetailPanel } from "./cage-shelf-detail-panel";
import { batchOf, removeItem, upsertItem, setParams, clearBatch, groupItems, applyResults, summarize, type PendingBatch, type PendingByMode, type PendingItem, type SubmitResult } from "@/features/cage-shelf/pendingBatch";
import StudentModeDrawer, { type StudentZone } from "@/features/student/components/StudentModeDrawer";
import StudentSearchSelect, { type SearchOption } from "@/features/student/components/StudentSearchSelect";
import StudentModeTabs from "@/features/student/components/StudentModeTabs";
import { fetchMyGroupMembers } from "@/api/domains/referenceData.api";
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
  const [divisionMode, setDivisionMode] = useState(false);
  const [divisionSubmitting, setDivisionSubmitting] = useState(false);
  const [divisionBoxSelect, setDivisionBoxSelect] = useState(false);
  const divisionBoxAnchorRef = useRef<{ sid: string; x: number; y: number } | null>(null);
  const [claimReloadKey, setClaimReloadKey] = useState(0);

  // ── 状态模式（edit）：与管理端同一套机制 ──
  // 编辑缓存是状态模式的唯一真相源：网格配色、抽屉缩略图、待提交批次三者都由它派生。
  const [editMode, setEditMode] = useState(false);
  const [scanCache, setScanCache] = useState<Map<string, { cell: CageShelfCell; code: string; initialActions: Set<CageBoxAction>; currentActions: Set<CageBoxAction> }>>(new Map());
  const [lastScannedKey, setLastScannedKey] = useState<string | null>(null);
  const [editDialogCell, setEditDialogCell] = useState<CageShelfCell | null>(null);
  const [editDialogShelfId, setEditDialogShelfId] = useState("");
  /** 表单值(cage_info_value)：状态标记的唯一真相源，弹窗据此反向使能按钮 */
  const [editFormValues, setEditFormValues] = useState<CageInfoValueRow[] | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);

  // ── 待提交缓冲：申请预约 / 划分按模式分开存，提交逐条汇总 ──
  const [pendingByMode, setPendingByMode] = useState<PendingByMode>({});
  const patchPending = useCallback((m: string, fn: (b: PendingBatch) => PendingBatch) => {
    setPendingByMode((prev) => ({ ...prev, [m]: fn(batchOf(prev, m)) }));
  }, []);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [bufferSelected, setBufferSelected] = useState<Set<string>>(new Set());
  const claimBatch = batchOf(pendingByMode, "studentClaim");
  const divisionBatch = batchOf(pendingByMode, "division");
  const editBatch = batchOf(pendingByMode, "edit");

  // ── 扫码 / 特殊状态总览（对齐 H5、小程序）──
  const [scanOpen, setScanOpen] = useState(false);
  const [specialOpen, setSpecialOpen] = useState(false);

  // ── 模式可见性：后端算好身份后下发（null=尚未加载，回退全显示）──
  // 只在**学生账号**下生效：教职工镜像看学生页时后端下发的是教职工模式列表，
  // 拿它过滤会把「申请预约」滤掉（该页始终是学生页，模式集合应固定为学生的三个）。
  const [allowedModes, setAllowedModes] = useState<string[] | null>(null);
  /** 状态模式的动作白名单（后端收窄时下发；缺省 = 不限制，见 modeActions 注释） */
  const [editActionNames, setEditActionNames] = useState<string[] | null>(null);
  /**
   * 是否学生视角。教职工镜像看学生页时为 false —— 「只能标记本人笼位」是学生专属闸门，
   * 教职工视角笼位不下发 mine，不加这道判断会把教职工全挡掉。
   * 默认 false（未知时放行），与 allowedModes 的 null=回退全显示同一口径。
   */
  const [isStudentView, setIsStudentView] = useState(false);
  useEffect(() => {
    fetchCageModeVisible()
      .then(r => {
        setIsStudentView(r.isStudent);
        // 空数组与不下发同义 = 不限制（只有收窄时才下发命中的那几个 action）
        const ids = r.modeActions?.edit;
        setEditActionNames(ids && ids.length > 0 ? ids : null);
        setAllowedModes(r.isStudent ? r.modes : null);
      })
      .catch(() => setAllowedModes(null));
  }, []);
  const canClaim = allowedModes == null || allowedModes.includes("studentClaim");
  const canConfirm = allowedModes == null || allowedModes.includes("confirm");
  /** 划分模式：管家专属（后端下发的能力位；具体写权限由后端二次校验） */
  const canDivide = allowedModes == null || allowedModes.includes("division");
  /** 状态模式：动作按钮由后端白名单过滤（当前学生只放 COHABITATION，以后加动作只改后端） */
  const canEdit = allowedModes == null || allowedModes.includes("edit");
  const editActions = useMemo(
    () => (editActionNames ? CAGE_BOX_ACTIONS.filter(a => editActionNames.includes(a.action)) : CAGE_BOX_ACTIONS),
    [editActionNames],
  );

  /* ---- 模式悬浮岛：与管理端同一套组件、同一份模式元数据、同一个形态选择 ---- */
  const [islandVariant, toggleIslandVariant] = useIslandVariant();
  const rightPanelRef = useRef<HTMLDivElement | null>(null);
  const currentMode: CageModeKey = confirmMode ? "confirm" : claimMode ? "studentClaim" : divisionMode ? "division" : editMode ? "edit" : "view";
  /** 圈圈形态收缩时只占一个小圆钮，不需要留白；横向程序坞才需要 */
  const islandPadStyle = islandVariant === "dock" ? { paddingBottom: 88 } : undefined;
  const modeGlow = modeBorderColor(currentMode);
  const modeGlowProps = modeGlow ? { glowColor: modeGlow } : {};
  /** 学生端可用的模式：查看恒有，申请/确认/状态按后端下发的能力 */
  const islandModes = useMemo<CageModeKey[]>(() => {
    const list: CageModeKey[] = ["view"];
    if (canClaim) list.push("studentClaim");
    if (canConfirm) list.push("confirm");
    if (canEdit) list.push("edit");
    if (canDivide) list.push("division");
    return list;
  }, [canClaim, canConfirm, canEdit, canDivide]);
  const switchMode = (k: CageModeKey) => {
    setClaimMode(k === "studentClaim");
    setConfirmMode(k === "confirm");
    setDivisionMode(k === "division");
    setEditMode(k === "edit");
    setDivisionBoxSelect(false);
    divisionBoxAnchorRef.current = null;
    if (k !== "studentClaim" && k !== "division") {
      setPoolCells(new Map());
    }
    // 唯一会「自动弹」的时机：切进这个模式那一下。点格子永远不弹（见 handleClaimToggle/handleDivisionToggle）
    /*
      状态模式也必须自动弹：色区就在抽屉右栏，抽屉不开就没有落点。
      编辑缓存**不在这里清** —— 它同时是待提交那批改动的真相源（配色 + 每格初始快照），
      清了缓存留着批次，再切回状态模式颜色全丢。
    */
    setDrawerOpen(k === "studentClaim" || k === "division" || k === "edit");
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
    const label = `${sid} (${x},${y})`;
    const already = claimBatch.items.some((it) => it.cageId === aid);
    patchPending("studentClaim", (b) => (already ? removeItem(b, aid) : upsertItem(b, { cageId: aid, label, shelveId: sid, x, y })));
  };

  /**
   * 当前模式的缓冲 → 「sid:x:y」反查（喂给网格的 selectedCells，格子上才出绿勾）。
   * **按当前模式取批次**：只查申请预约的话划分模式选完格子网格上没有任何标记；
   * 两个批次混着查又会让「另一模式暂存的格子」在本模式里也亮着，串色。
   */
  const bufferedSelectedKeys = useMemo(() => {
    const items = currentMode === "division" ? divisionBatch.items : currentMode === "studentClaim" ? claimBatch.items : [];
    const s = new Set<string>();
    for (const it of items) {
      if (it.x != null && it.y != null) s.add(`${it.shelveId}:${it.x}:${it.y}`);
    }
    return s;
  }, [currentMode, claimBatch.items, divisionBatch.items]);

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
    const aid = cellIdByKey.get(key);

    if (divisionBoxSelect) {
      const anchor = divisionBoxAnchorRef.current;
      if (!anchor || anchor.sid !== sid) {
        if (!eligible(x, y)) { void appAlert(badHint); return; }
        divisionBoxAnchorRef.current = { sid, x, y };
        if (aid) patchPending("division", (b) => upsertItem(b, { cageId: aid, label: `${sid} (${x},${y})`, shelveId: sid, x, y }));
        return;
      }
      const minX = Math.min(anchor.x, x), maxX = Math.max(anchor.x, x);
      const minY = Math.min(anchor.y, y), maxY = Math.max(anchor.y, y);
      patchPending("division", (b) => {
        let next = b;
        for (let cx = minX; cx <= maxX; cx++)
          for (let cy = minY; cy <= maxY; cy++)
            if (eligible(cx, cy)) {
              const id = cellIdByKey.get(`${sid}:${cx}:${cy}`);
              if (id) next = upsertItem(next, { cageId: id, label: `${sid} (${cx},${cy})`, shelveId: sid, x: cx, y: cy });
            }
        return next;
      });
      divisionBoxAnchorRef.current = null;
      setDivisionBoxSelect(false);
      return;
    }
    if (!aid) return;
    const already = divisionBatch.items.some((it) => it.cageId === aid);
    if (!already && !eligible(x, y)) { void appAlert(badHint); return; }
    patchPending("division", (b) => (already ? removeItem(b, aid) : upsertItem(b, { cageId: aid, label: `${sid} (${x},${y})`, shelveId: sid, x, y })));
  };

  /** 划分的人员区域（accountId → 姓名），随批次参数持久化，关抽屉不丢 */
  const divisionPersons = (divisionBatch.params.persons as Record<string, string> | undefined) ?? {};
  const divisionZones: StudentZone[] = useMemo(
    () => Object.entries(divisionPersons).map(([key, name]) => ({ key, title: name })),
    [divisionPersons],
  );
  const divisionUnassigned = useMemo(
    () => divisionBatch.items.filter((it) => !it.assigneeAccountId),
    [divisionBatch.items],
  );
  const divisionItemsByZone = useMemo(() => {
    const m = new Map<string, PendingItem[]>();
    for (const it of divisionBatch.items) {
      if (!it.assigneeAccountId) continue;
      const arr = m.get(it.assigneeAccountId);
      if (arr) arr.push(it); else m.set(it.assigneeAccountId, [it]);
    }
    return m;
  }, [divisionBatch.items]);

  /** 把若干缓冲条目落定到某人员；accountId=null 表示退回缓冲区 */
  const dropDivisionToPerson = (cageIds: string[], accountId: string | null) => {
    patchPending("division", (b) => {
      let next = b;
      for (const id of cageIds) {
        const it = next.items.find((x) => x.cageId === id);
        if (it) next = upsertItem(next, { ...it, assigneeAccountId: accountId ?? undefined });
      }
      return next;
    });
  };

  /** 选人数据源：有关键词走全局搜索，空串则列本课题组名单 */
  const searchDivisionPerson = useCallback(
    async (kw: string): Promise<SearchOption[]> => {
      if (kw) return (await searchPersonnelByKeyword(kw)).map((p) => ({ key: p.accountId, label: p.name, subtitle: p.projectGroupName || undefined }));
      return (await fetchMyGroupMembers()).map((m) => ({ key: m.accountId, label: m.name, subtitle: m.jobNumber || undefined }));
    },
    [],
  );

  /** 划分提交：按人员分组，每组一次 saveCageDivision（接口一次一人） */
  const submitDivision = async () => {
    const groups = groupItems(divisionBatch.items.filter((it) => it.assigneeAccountId), (it) => it.assigneeAccountId!);
    if (groups.size === 0) { void appAlert("请先把笼位拖到人员上"); return; }
    setDivisionSubmitting(true);
    const failed: string[] = [];
    let okCount = 0;
    for (const [accountId, g] of groups) {
      const name = divisionPersons[accountId] ?? "";
      const cageIds = g.map((it) => it.cageId);
      if (cageIds.length === 0) continue;
      try { await saveCageDivision(cageIds, [{ id: accountId, name }]); okCount += cageIds.length; }
      catch (e: any) { failed.push(e?.message || "保存划分失败"); }
    }
    setDivisionSubmitting(false);
    setClaimReloadKey((k) => k + 1);
    if (failed.length > 0) toast.error(`${okCount} 个成功、${failed.length} 组失败：${failed[0]}`);
    else { toast.success(`已划分 ${okCount} 个笼位`); patchPending("division", () => clearBatch()); }
  };

  const submitClaims = async () => {
    const items = claimBatch.items;
    if (items.length === 0) return;
    setClaimSubmitting(true);
    const okIds: string[] = [];
    const failed: Array<{ cageId: string; reason: string }> = [];
    for (const it of items) {
      const pc = poolCells.get(it.cageId);
      if (!pc) { failed.push({ cageId: it.cageId, reason: "该笼位已不在可申请池中" }); continue; }
      const idxId = shelfIndexIdByShelveId.get(String(pc.shelveId));
      if (!idxId) { failed.push({ cageId: it.cageId, reason: "未找到笼架索引" }); continue; }
      try { await claimCage(it.cageId, idxId); okIds.push(it.cageId); }
      catch (e: any) { failed.push({ cageId: it.cageId, reason: e?.message || "申请失败" }); }
    }
    setClaimSubmitting(false);
    patchPending("studentClaim", (b) => {
      let next = b;
      for (const id of okIds) next = removeItem(next, id);
      for (const f of failed) {
        const it = next.items.find((x) => x.cageId === f.cageId);
        if (it) next = { ...next, failed: [...next.failed.filter((x) => x.cageId !== f.cageId), { cageId: f.cageId, label: it.label, reason: f.reason }] };
      }
      return next;
    });
    // 只移除真正申请成功的笼位；失败的保留在池中，避免视觉上像被占用
    if (okIds.length > 0) {
      setPoolCells((prev) => {
        const n = new Map(prev);
        for (const aid of okIds) n.delete(aid);
        return n;
      });
      setClaimReloadKey((k) => k + 1);
      setBufferSelected(new Set());
    }
    if (failed.length > 0) await appAlert(`${okIds.length} 个成功、${failed.length} 个失败。${failed[0]?.reason ?? ""}`);
    else await appAlert(`申请已提交：${okIds.length} 个`);
  };

  /**
   * 网格点格子的统一入口。
   * 非查看模式下点击格子是「选位」语义（申请预约/划分），**不能顺带弹出详情**——
   * 否则每点一个笼位就顶一层详情面板，选位根本没法连点。
   * 查看模式才开详情。
   */
  const handleGridCellClick = (c: any, sid: string) => {
    if (confirmMode) { void handleConfirmCell(c); return; }
    if (claimMode || divisionMode || editMode) return;
    setShelfId(sid);
    setCell(c);
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
  /**
   * 已被订单预定的笼位：外观上还是空笼位，网格上必须标出来，
   * 否则认领/分笼/转移这些模式会把它当可选，选完才在服务端被拒。
   * 与管理端笼架页共用同一套标记渲染（mergeReservationMarks）。
   */
  const { data: cageReservations = [] } = useQuery({
    queryKey: ["cage-reservations", "active"],
    queryFn: fetchActiveCageReservations,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });
  const opMarkWithReservations = useMemo(
    () => mergeReservationMarks(opMarkByCageId, cageReservations),
    [opMarkByCageId, cageReservations],
  );
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
  /* ---- 批量转移（与后台同构）：先多次选源 → 下一步 → 按顺序点目标 ---------- */
  /** 笼架元数据（批量转移面板里「在哪」那行文案用） */
  const shelfMetaBySid = useMemo(() => {
    const m = new Map<string, any>();
    for (const d of details) { const sid = String(d.shelfMeta?.shelveId ?? ""); if (sid) m.set(sid, d.shelfMeta); }
    const sd = shelfDetail?.shelfMeta?.shelveId;
    if (sd) m.set(String(sd), shelfDetail!.shelfMeta);
    return m;
  }, [details, shelfDetail]);
  const labelOfCell = useCallback((sid: string, c: any): CageOpLabel | undefined => {
    if (!c) return undefined;
    const meta = shelfMetaBySid.get(sid);
    return { position: String(c.position ?? ""), where: [meta?.campusName, meta?.roomName, meta?.shelveName].filter(Boolean).join(" / ") };
  }, [shelfMetaBySid]);
  const handleBatchToggle = useCallback((sid: string, x: number, y: number) => {
    const id = cellIdByKey.get(`${sid}:${x}:${y}`);
    if (!id) return;
    if (opSel.phase === "sources") opSel.toggleBatchSource(id, labelOfCell(sid, findCellByKey(sid, x, y) ?? {}), groupKeyOf(findCellByKey(sid, x, y) ?? {}));
    else opSel.toggleBatchTarget(id);
  }, [cellIdByKey, findCellByKey, labelOfCell, opSel.phase, opSel.toggleBatchSource, opSel.toggleBatchTarget]);
  /** 源池：只有「饲养中」且与已选源同课题组的笼位可点（先选一个源后池自动收窄，后端还会再拦一道） */
  const batchSourcePool = useMemo(() => {
    const m = new Map<string, any>();
    const add = (grid: any[], sid: string) => {
      for (const c of grid ?? []) {
        const id = cellIdByKey.get(`${sid}:${c.x}:${c.y}`);
        if (!id) continue;
        if (resolveCageType(c) !== 3) continue;
        if (opSel.batchGroup && groupKeyOf(c) !== opSel.batchGroup) continue;
        m.set(id, c);
      }
    };
    for (const d of details) add(d.grid, String(d.shelfMeta?.shelveId ?? ""));
    if (shelfDetail) add(shelfDetail.grid, String(shelfDetail.shelfMeta?.shelveId ?? ""));
    return m;
  }, [details, shelfDetail, cellIdByKey, opSel.batchGroup]);
  const batchSelectedCells = useMemo(() => {
    const ids = opSel.phase === "sources" ? opSel.sourceOrder : opSel.targetOrder;
    const s = new Set<string>();
    for (const id of ids) { const k = keyByCageId.get(id); if (k) s.add(k); }
    return s;
  }, [opSel.phase, opSel.sourceOrder, opSel.targetOrder, keyByCageId]);
  const [batchSubmitting, setBatchSubmitting] = useState(false);
  /** 按顺序逐条调单目标接口：每条独立校验，部分失败只影响它自己，结果汇总提示 */
  const handleBatchSubmit = useCallback(async () => {
    const list = opSel.pairs.filter((p) => p.targetId);
    if (list.length === 0) return;
    setBatchSubmitting(true);
    const failed: string[] = [];
    let done = 0, toReview = 0;
    for (const p of list) {
      try {
        /* 后端逐条判定：学生提交且接收方配置要求审核 → 只落待审单，不立即生效。
           必须分开计数，否则「转了待审」会被误报成「已完成」。 */
        const res = await submitCageTransfer({ fromAnimalCageId: p.sourceId, toAnimalCageId: p.targetId! });
        if (res?.needApproval) toReview++; else done++;
      } catch (e: any) { failed.push(`${p.sourceLabel?.position ?? p.sourceId}：${e?.message || "失败"}`); }
    }
    setBatchSubmitting(false);
    const okPart = `已完成 ${done} 个笼位`;
    const reviewPart = toReview > 0 ? `${toReview} 个已提交待审核` : "";
    const failPart = failed.length > 0 ? `${failed.length} 个失败：${failed.slice(0, 3).join("；")}${failed.length > 3 ? "…" : ""}` : "";
    const msg = [okPart, reviewPart, failPart].filter(Boolean).join("，");
    if (failed.length === 0) toast.success(msg); else toast.error(msg, { duration: 8000 });
    opSel.cancel();
    setClaimReloadKey((k) => k + 1);
    void qc.invalidateQueries({ queryKey: ["cage-op", "markers"] });
  }, [opSel, qc]);
  /** 定位到某笼位：切房间 + 滚到该笼架（跨房间配对时在网格上找到它） */
  const locateCage = useCallback((cageId: string) => {
    const key = keyByCageId.get(cageId);
    if (!key) return;
    const [sid] = key.split(":");
    for (const [rid, shelves] of roomShelveMap) {
      if (shelves.some((s: any) => String(s.shelveId) === sid)) {
        if (rid !== aRid) { setTab("filter"); setARid(rid); setARname(rid); setShelfDetail(null); }
        break;
      }
    }
    setTimeout(() => document.getElementById(`shelf-${sid}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 350);
  }, [keyByCageId, roomShelveMap, aRid]);
  const opGridProps = {
    opMarkerByCageId: opMarkWithReservations,
    ...(opActive ? (opSel.batch ? {
      selectable: true,
      selectedCells: batchSelectedCells,
      onToggleCell: handleBatchToggle,
      allocMode: true,
      clickMode: "toggle" as const,
      claimMode: true,
      poolCells: (opSel.phase === "targets" ? opSel.batchPoolForGrid : batchSourcePool) as Map<string, any>,
      restrictSelectToPool: true,
      pairColorByCageId: opSel.pairColorByCageId,
      onCellClick: undefined,
    } : {
      selectable: true,
      selectedCells: opSelectedCells,
      onToggleCell: handleOpToggle,
      allocMode: true,
      clickMode: "toggle" as const,
      claimMode: true,
      poolCells: opSel.eligibleMap as Map<string, any>,
      restrictSelectToPool: true,
      onCellClick: undefined,
    }) : {}),
  };

  /* ══════════════════════════════════════════════════════════
     状态模式（edit）—— 点格子攒进待提交、拖到右侧色区标记、统一提交
     机制与管理端 AdminCageShelfPage 的状态模式同构：编辑缓存是唯一真相源，
     缓存 → 批次单向同步，提交逐条串行走 /local/edit。
     ══════════════════════════════════════════════════════════ */
  const cageIdOfCell = useCallback((c: any) => String(c?.id ?? c?.animalCageId ?? ""), []);

  /** cageId → 位置信息（加入待提交时用；跨房间，所以按全部已加载的架子建） */
  const itemMetaByCageId = useMemo(() => {
    const m = new Map<string, { label: string; shelveId: string; x: number; y: number; roomId: string | null }>();
    const add = (d: any) => {
      const meta = d?.shelfMeta;
      if (!meta) return;
      for (const c of d?.grid ?? []) {
        const id = cageIdOfCell(c);
        if (!id) continue;
        const pos = displayPosition(String(c.position ?? `${c.x}-${c.y}`));
        m.set(id, {
          label: `${[meta.campusName, meta.roomName, meta.shelveName].filter(Boolean).join(" / ")} (${pos})`,
          shelveId: String(meta.shelveId ?? ""),
          x: Number(c.x),
          y: Number(c.y),
          roomId: meta.roomId != null ? String(meta.roomId) : null,
        });
      }
    };
    for (const d of details) add(d);
    add(shelfDetail);
    return m;
  }, [details, shelfDetail, cageIdOfCell]);

  /**
   * 状态模式的准入闸门（点格子 / 扫码两条入口共用）：
   *   - 只有「饲养中(3)」「异常(4)」有可标的状态，其余类型拒绝；
   *   - 认领在办（待审批/待确认/释放审批中）或挂着待审分笼转移的笼位状态还没定下来，拒绝；
   *   - 学生视角只能标本人在用的笼位（mine 由后端判定并下发；教职工视角不下发该字段，
   *     所以必须先判 isStudentView，否则会把教职工全挡掉）。
   * 返回 null = 放行。
   */
  const editGateReason = useCallback((c: any): string | null => {
    const ct = resolveCageType(c);
    if (ct !== 3 && ct !== 4) return "当前状态不可编辑";
    const cageId = cageIdOfCell(c);
    if (cageId && opMarkWithReservations.has(cageId)) return "该笼位有待审的分笼/转移请求，请先等它审完";
    // confirmed 是已落定的认领（本人正在用），不算中间态，否则自己的笼位反倒标不了
    const st = c?.claimStatus;
    if (st === "pending_approval" || st === "locked" || st === "pending_release_approval") return "该笼位正在认领流程中，暂不能标记状态";
    if (isStudentView && !c?.mine) return "只能标记本人使用中的笼位";
    return null;
  }, [cageIdOfCell, opMarkWithReservations, isStudentView]);

  /** 缓冲区只留**还没落到任何色区**的笼位：落了色的已由色区认领，再挂缓冲就是重复一份 */
  const editStagedItems = useMemo(
    () => editBatch.items.filter(it => (it.actions?.length ?? 0) + (it.removedActions?.length ?? 0) === 0),
    [editBatch.items],
  );
  /** 右栏色区 = 每个可用动作一枚「标记区」+ 一枚「撤销区」，颜色就是该状态在网格上的配色 */
  const editZones: StudentZone[] = useMemo(
    () => editActions.flatMap(({ action, label, statusCode }) => {
      const color = (DEFAULT_COLORS[statusCode] ?? DEFAULT_COLORS.NORMAL).border;
      return [
        { key: statusZoneKey(action, true), title: label, subtitle: "标记该状态", color },
        { key: statusZoneKey(action, false), title: `撤销${label}`, subtitle: "取消该状态色", color, variant: "cancel" as const },
      ];
    }),
    [editActions],
  );
  /** zone.key → 条目（状态模式下一个笼位可同时挂在多个色区：改了 3 个状态就出现在 3 枚标记区里） */
  const editItemsByZone = useMemo(() => {
    const m = new Map<string, PendingItem[]>();
    const push = (k: string, it: PendingItem) => { const arr = m.get(k); if (arr) arr.push(it); else m.set(k, [it]); };
    for (const it of editBatch.items) {
      for (const a of it.actions ?? []) push(`add:${a}`, it);
      for (const a of it.removedActions ?? []) push(`del:${a}`, it);
    }
    return m;
  }, [editBatch.items]);
  /** 抽屉缩略图的缓存查表：色区与缓冲区共用这一份，两栏的实时配色不会再漂 */
  const editCacheOfItem = useCallback((it: PendingItem) => {
    if (it.x == null || it.y == null) return undefined;
    const e = scanCache.get(`${it.shelveId}:${it.x}:${it.y}`);
    return e ? { initialActions: e.initialActions, currentActions: e.currentActions } : undefined;
  }, [scanCache]);
  /** 网格上的「已进待提交」标记：从批次反查（只靠工具栏计数看不出选了哪几个） */
  const editSelectedCells = useMemo(() => {
    const s = new Set<string>();
    for (const it of editBatch.items) { const k = keyByCageId.get(it.cageId); if (k) s.add(k); }
    return s;
  }, [editBatch.items, keyByCageId]);

  /**
   * 把某个动作按 on/off 写进编辑缓存。**不 toggle** —— 落区语义要求显式方向，
   * 否则「拖回同一个区」会变成反选。缓存是唯一真相源，edit 批次由下面的 effect 从这里拉。
   */
  const applyEditAction = useCallback(async (cell: any, sid: string, action: CageBoxAction, on: boolean) => {
    const ck = `${sid}:${cell.x}:${cell.y}`;
    const code = String(cell?.cageBoxCode ?? "");
    let fallback: Set<CageBoxAction> | null = null;
    // 本地数据源的状态真相源是表单值：没缓存过就得先拉一次，才知道「原本有没有这个状态」
    if (!scanCache.has(ck)) {
      const cageId = cageIdOfCell(cell);
      const rows = cageId ? await fetchCageInfoValues(cageId).catch(() => null) : null;
      fallback = actionsFromFormValues(rows);
    }
    setScanCache(prev => {
      const next = new Map(prev);
      const e = next.get(ck);
      const init = e ? e.initialActions : (fallback ?? new Set<CageBoxAction>());
      const cur = new Set(e ? e.currentActions : init);
      if (on) cur.add(action); else cur.delete(action);
      // 改回原样就别留一条零差异的缓存：同步 effect 会把批次条目摘掉，缓存却还挂着
      const same = cur.size === init.size && [...cur].every(x => init.has(x));
      if (same) next.delete(ck);
      else next.set(ck, e ? { ...e, currentActions: cur } : { cell, code, initialActions: init, currentActions: cur });
      return next;
    });
    setLastScannedKey(ck);
  }, [cageIdOfCell, scanCache]);

  /**
   * 状态模式：条目连同它的编辑缓存一起摘掉。
   * 只摘批次的话，同步 effect 下一轮会按缓存把它加回来 —— 删了等于没删。
   */
  const removeEditItem = useCallback((cageId: string) => {
    const key = keyByCageId.get(cageId);
    patchPending("edit", (b) => removeItem(b, cageId));
    if (key) setScanCache(prev => { if (!prev.has(key)) return prev; const n = new Map(prev); n.delete(key); return n; });
  }, [keyByCageId, patchPending]);

  /** 点格子 / 扫码：把笼位加入待提交（已在缓冲里则移出）；闸门同一道 */
  const addEditPending = useCallback((cell: any, metaHint?: { label: string; shelveId: string; x: number; y: number; roomId: string | null }) => {
    const reason = editGateReason(cell);
    if (reason) { toast.error(reason); return; }
    const cageId = cageIdOfCell(cell);
    if (!cageId) return;
    if (editBatch.items.some(it => it.cageId === cageId)) { removeEditItem(cageId); return; }
    const meta = metaHint ?? itemMetaByCageId.get(cageId);
    if (!meta) { toast.error("该笼位缺少位置信息，无法加入待提交"); return; }
    patchPending("edit", (b) => upsertItem(b, { cageId, ...meta }));
    // 点格子只入缓冲、不自动弹抽屉 —— 唯一自动弹的时机是「切进这个模式」（见 switchMode）
  }, [editGateReason, cageIdOfCell, editBatch.items, itemMetaByCageId, removeEditItem, patchPending]);

  /** 网格点格子（状态模式拖色区）：进/出待提交缓冲 */
  const handleEditToggle = (sid: string, x: number, y: number) => {
    const c = findCellByKey(sid, x, y);
    if (c) addEditPending(c);
  };

  /** 从 details / shelfDetail 反查某格所属笼架（动作弹窗要靠它拼缓存键） */
  const findShelfIdForCell = (cell: CageShelfCell): string => {
    for (const d of details) { const sid = String(d.shelfMeta?.shelveId ?? ""); for (const c of d.grid ?? []) if (c.x === cell.x && c.y === cell.y) return sid; }
    if (shelfDetail) { const sid = String(shelfDetail.shelfMeta?.shelveId ?? ""); for (const c of shelfDetail.grid ?? []) if (c.x === cell.x && c.y === cell.y) return sid; }
    return "";
  };
  /**
   * 打开某笼位的动作弹窗。表单值(cage_info_value)是状态标记的唯一真相源，
   * 弹窗据此反向使能按钮，所以打开时先拉一次。
   */
  const openEditCell = useCallback((cell: CageShelfCell, sidHint?: string) => {
    const cageId = cageIdOfCell(cell);
    setEditFormValues(null);
    if (cageId) fetchCageInfoValues(cageId).then(setEditFormValues).catch(() => setEditFormValues(null));
    setEditDialogCell(cell);
    setEditDialogShelfId(sidHint ?? "");
  }, [cageIdOfCell]);
  /** 抽屉磁贴点开动作弹窗（与网格点击不同：那条路只进退缓冲） */
  const openEditItemById = useCallback((cageId: string) => {
    const key = keyByCageId.get(cageId);
    if (!key) { toast.error("该笼位不在当前视图，请切到它所在笼架再编辑"); return; }
    const [sid, sx, sy] = key.split(":");
    const c: any = findCellByKey(sid, Number(sx), Number(sy));
    if (!c) { toast.error("该笼位不在当前视图，请切到它所在笼架再编辑"); return; }
    openEditCell(c as CageShelfCell, sid);
  }, [keyByCageId, openEditCell]);

  /**
   * 状态模式拖放：fromZone 决定「拖回缓冲区」时撤销哪一个动作；
   * 拖到另一个区则先把来源撤销、再落到新位置，所以重复拖是幂等的。
   */
  const handleEditZoneDrop = useCallback((cageIds: string[], zoneKey: string | null, fromZone: string | null): boolean => {
    const to = parseStatusZone(zoneKey);
    const from = parseStatusZone(fromZone);
    // 只对「待提交」里的笼位生效：勾选集可能留着早已移出批次的陈旧 id
    const staged = new Set(batchOf(pendingByMode, "edit").items.map(it => it.cageId));
    let applied = 0;
    for (const id of cageIds) {
      if (!staged.has(id)) continue;
      const key = keyByCageId.get(id);
      if (!key) { toast.error("该笼位不在当前视图，先切到它所在的笼架再操作"); continue; }
      const [sid, sx, sy] = key.split(":");
      const cell: any = findCellByKey(sid, Number(sx), Number(sy));
      if (!cell) { toast.error("该笼位不在当前视图，先切到它所在的笼架再操作"); continue; }
      if (from) void applyEditAction(cell, sid, from.action, !from.on);
      if (to) void applyEditAction(cell, sid, to.action, to.on);
      applied += 1;
    }
    // 陈旧的勾选项不算「没放成」，真正落地的有东西就可以清掉勾选
    return applied > 0;
  }, [pendingByMode, keyByCageId, applyEditAction]);

  /** 动作弹窗里点一个状态：has = 点之前是否已标记，决定这次是标记还是取消 */
  const toggleEditStatus = (cell: CageShelfCell, sid: string, action: CageBoxAction, has: boolean) => {
    void applyEditAction(cell, sid, action, !has);
  };

  /**
   * 状态模式：把编辑缓存里的差异同步进 edit 批次（缓存的 currentActions 就是「目标状态全集」）。
   * 两条规则保证批次与缓存永不脱节：
   *   1) 缓存里**有**的笼位：按差异更新；改回原样只清差异，条目留在待提交（用户是显式暂存它的）；
   *   2) 缓存里**没有**的笼位：一律不许带差异 —— 缓存被删掉后批次若还留着差异，
   *      就成了「磁贴挂在色区里、网格却没颜色」的幽灵条目。
   */
  useEffect(() => {
    if (!editMode) return;
    patchPending("edit", (b) => {
      let next = b;
      const cached = new Set<string>();
      for (const [key, e] of scanCache) {
        const cageId = cageIdOfCell(e.cell);
        if (!cageId) continue;
        cached.add(cageId);
        const meta = itemMetaByCageId.get(cageId);
        if (!meta || !next.items.some(x => x.cageId === cageId)) continue;
        const toAdd = [...e.currentActions].filter(a => !e.initialActions.has(a));
        const toRemove = [...e.initialActions].filter(a => !e.currentActions.has(a));
        next = upsertItem(next, toAdd.length || toRemove.length
          ? { cageId, ...meta, shelveId: key.split(":")[0] || meta.shelveId, cageBoxCode: e.code, actions: toAdd, removedActions: toRemove }
          : { cageId, ...meta, actions: [], removedActions: [] });
      }
      for (const it of next.items) {
        if (cached.has(it.cageId)) continue;
        if ((it.actions?.length ?? 0) > 0 || (it.removedActions?.length ?? 0) > 0) {
          next = upsertItem(next, { ...it, actions: [], removedActions: [] });
        }
      }
      return next;
    });
  }, [scanCache, editMode, itemMetaByCageId, patchPending, cageIdOfCell]);

  /** 状态模式：逐笼位提交动作（学生页只有本地数据源，走 /local/edit），成功的移出、失败的留原因 */
  const runEditPending = useCallback(async (items: PendingItem[]): Promise<SubmitResult[]> => {
    const rows: SubmitResult[] = [];
    for (const it of items) {
      try {
        for (const a of it.actions ?? []) await localEdit(it.cageId, cageBoxAction(a as CageBoxAction).statusField, true, it.cageBoxCode);
        for (const a of it.removedActions ?? []) await localEdit(it.cageId, cageBoxAction(a as CageBoxAction).statusField, false, it.cageBoxCode);
        rows.push({ cageId: it.cageId, ok: true });
      } catch (e) {
        rows.push({ cageId: it.cageId, ok: false, reason: e instanceof Error ? e.message : "操作失败" });
      }
    }
    return rows;
  }, []);

  const submitEdit = async () => {
    const items = editBatch.items;
    if (items.length === 0) return;
    setEditSubmitting(true);
    let results: SubmitResult[] = [];
    try { results = await runEditPending(items); }
    catch (e) { const reason = e instanceof Error ? e.message : "提交失败"; results = items.map(i => ({ cageId: i.cageId, ok: false, reason })); }
    finally { setEditSubmitting(false); }
    // 提交成功的笼位在服务端已是新状态：缓存留着的话，同步 effect 下一轮又会把条目加回待提交
    const done = new Set(results.filter(r => r.ok).map(r => r.cageId));
    if (done.size > 0) {
      setScanCache(prev => {
        const n = new Map(prev);
        for (const [k, e] of n) if (done.has(cageIdOfCell(e.cell))) n.delete(k);
        return n;
      });
    }
    const sum = summarize(results);
    patchPending("edit", (b) => applyResults(b, results));
    if (sum.failed === 0) toast.success(`已提交 ${sum.ok} 个`);
    else toast.error(`${sum.ok} 个成功、${sum.failed} 个失败（原因见抽屉）`);
    setClaimReloadKey(k => k + 1);
  };

  /** 状态模式的网格接线：点格子进退缓冲，格子按编辑缓存实时配色（点开详情由弹窗代替） */
  const editGridProps = editMode ? {
    selectable: true,
    selectedCells: editSelectedCells,
    onToggleCell: handleEditToggle,
    allocMode: true,
    clickMode: "toggle" as const,
    scanCache,
    lastScannedKey,
    editMode: true,
    onCellClick: undefined,
  } : {};

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
      if (hit) {
        // 状态模式：扫码等同点格子（进/出待提交），闸门也同一道；不能再顺带弹出详情
        if (editMode) {
          const m = d?.shelfMeta;
          addEditPending(hit, {
            label: `${[m?.campusName, m?.roomName, m?.shelveName].filter(Boolean).join(" / ")} (${displayPosition(String(hit.position ?? `${hit.x}-${hit.y}`))})`,
            shelveId: t.shelveId,
            x: Number(hit.x),
            y: Number(hit.y),
            roomId: t.roomId != null ? String(t.roomId) : null,
          });
          return;
        }
        setShelfId(t.shelveId); setCell(hit as CageShelfCell);
      }
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
                {divisionMode && <>
                  <span className="text-[10px] font-semibold text-[var(--app-color-text-tertiary)]">已选 {divisionBatch.items.length} 个笼位</span>
                  <button onClick={() => { setDivisionBoxSelect(v => !v); divisionBoxAnchorRef.current = null; }}
                    className={`rounded-student-sm px-2 py-1 text-[11px] font-semibold transition ${divisionBoxSelect ? "bg-amber-500 text-white shadow-sm" : "border border-dashed border-[var(--app-color-border-default)] text-[var(--app-color-text-tertiary)]"}`}>
                    {divisionBoxSelect ? "框选中 · 点击两格" : "⬜ 矩形框选"}
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
            {opActive && <CageOpSelectBanner sel={opSel} allowBatch />}
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
                  return <div key={sid || idx} id={`shelf-${sid}`}><ShelfGrid title={d.shelfMeta?.shelveName ?? `笼架 ${idx + 1}`} detail={d} loading={false} emptyHint="暂无笼架数据" isBookmarked={isBm} alertMap={new Map()} onToggleBookmark={sid !== "" ? () => toggleBm(sid) : undefined} claimMode={claimMode||divisionMode} poolCells={divisionMode?divisionPoolCells:poolCells} myClaimCageIds={confirmMode ? myLockedCageIds : undefined} selectable={claimMode||divisionMode} selectedCells={bufferedSelectedKeys} onToggleCell={claimMode ? handleClaimToggle : divisionMode ? handleDivisionToggle : undefined} allocMode={claimMode||divisionMode} clickMode={claimMode || divisionMode ? "toggle" : undefined} onCellClick={(c: any) => handleGridCellClick(c, sid)} {...opGridProps} {...modeGlowProps} {...editGridProps} /></div>;
                })}</div>}
              </>}

              {/* SHELF MODE */}
              {viewMode === "shelf" && <div className="flex gap-3 h-full min-h-0">
                <div className="w-1/2 flex flex-col min-w-0">
                  {shelfLoading && <div className="flex-1 rounded-student-lg border border-dashed border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] grid place-items-center text-sm text-[var(--app-color-text-tertiary)]">加载笼架…</div>}
                  {!shelfLoading && !shelfDetail && <div className="flex-1 rounded-student-lg border border-dashed border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] flex flex-col items-center justify-center text-sm text-[var(--app-color-text-tertiary)]"><LayoutGrid className="h-10 w-10 mb-3 opacity-20" />点击左侧笼架<br /><span className="text-[11px]">选中后显示该笼架 8x10 笼位</span></div>}
                  {!shelfLoading && shelfDetail && <ShelfGrid title={shelfDetail.shelfMeta?.shelveName || "笼架"} detail={shelfDetail} loading={false} emptyHint="暂无数据" claimMode={claimMode||divisionMode} poolCells={divisionMode?divisionPoolCells:poolCells} myClaimCageIds={confirmMode ? myLockedCageIds : undefined} alertMap={new Map()} selectable={claimMode||divisionMode} selectedCells={bufferedSelectedKeys} onToggleCell={claimMode ? handleClaimToggle : divisionMode ? handleDivisionToggle : undefined} allocMode={claimMode||divisionMode} clickMode={claimMode || divisionMode ? "toggle" : undefined} onCellClick={(c: any) => handleGridCellClick(c, String(shelfDetail.shelfMeta?.shelveId ?? ""))} {...opGridProps} {...modeGlowProps} {...editGridProps} />}
                </div>
                <div className="w-1/2 flex flex-col min-w-0">
                  {cell ? <CellDetailPanel cell={cell} opMarkByCageId={opMarkWithReservations} gridMeta={shelfDetail?.shelfMeta ?? null} shelveId={shelfId ?? ""} onClose={() => setCell(null)} onStartOp={(k, s) => { setClaimMode(false); setConfirmMode(false); setCell(null); setShelfId(null); void opSel.start(k, s); }} onChanged={() => setClaimReloadKey(k => k + 1)} canDivide={canDivide} /> :
                    <div className="flex-1 rounded-student-lg border border-dashed border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] flex flex-col items-center justify-center text-sm text-[var(--app-color-text-tertiary)]"><div className="text-4xl mb-3 opacity-20">📋</div>笼盒详情预备画面<br /><span className="text-[11px]">点击左侧笼位格子显示笼盒信息</span></div>}
                </div>
              </div>}
            </>}

            {tab === "bookmarks" && <>
              {pinned.size === 0 && !bmLoading && <div className="rounded-student-lg border border-dashed border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] h-full flex flex-col items-center justify-center text-center text-sm text-[var(--app-color-text-tertiary)]"><Star className="h-10 w-10 mx-auto mb-3 opacity-20" />暂无收藏的笼架<br /><span className="text-[11px]">在筛选页面将笼架加入收藏后在此处查看</span></div>}
              {!bmLoading && bmList.length > 0 && <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">{bmList.map(b => {
                const sid = b.shelfMeta.shelveId;
                return <div key={sid}><ShelfGrid title={b.shelfMeta.shelveName || sid} detail={b} loading={false} emptyHint="暂无数据" isBookmarked={true} alertMap={new Map()} onToggleBookmark={() => toggleBm(sid)} claimMode={claimMode||divisionMode} poolCells={divisionMode?divisionPoolCells:poolCells} myClaimCageIds={confirmMode ? myLockedCageIds : undefined} selectable={claimMode||divisionMode} selectedCells={bufferedSelectedKeys} onToggleCell={claimMode ? handleClaimToggle : divisionMode ? handleDivisionToggle : undefined} allocMode={claimMode||divisionMode} clickMode={claimMode || divisionMode ? "toggle" : undefined} onCellClick={(c: any) => handleGridCellClick(c, sid)} {...opGridProps} {...modeGlowProps} {...editGridProps} /></div>;
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
          <CellDetailPanel cell={cell} opMarkByCageId={opMarkWithReservations} gridMeta={null} shelveId={shelfId ?? ""} onClose={() => { setCell(null); setShelfId(null); }} onStartOp={(k, s) => { setClaimMode(false); setConfirmMode(false); setCell(null); setShelfId(null); void opSel.start(k, s); }} onChanged={() => setClaimReloadKey(k => k + 1)} canDivide={canDivide} />
        </div>
      </div>, document.body)}
      {/*
        状态模式：动作弹窗（缓冲/色区磁贴点开都在这里改动作）。
        与管理端同构（色块预览 + 已标记/已变更状态文案），皮走学生端令牌那套变量。
      */}
      {editDialogCell && (() => {
        const sid = editDialogShelfId || findShelfIdForCell(editDialogCell);
        const entry = scanCache.get(`${sid}:${editDialogCell.x}:${editDialogCell.y}`);
        const serverActions = actionsFromFormValues(editFormValues);
        return createPortal(
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={() => setEditDialogCell(null)}>
            <div className="w-full max-w-xs rounded-student-lg bg-[var(--app-color-surface-container)] p-4 shadow-[var(--student-shadow-modal)]" onClick={(e) => e.stopPropagation()}>
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-semibold text-[var(--app-color-text-primary)]">选择操作 · {displayPosition(editDialogCell.position)}</div>
                <button className="text-xs text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-text-primary)]" onClick={() => setEditDialogCell(null)}>关闭</button>
              </div>
              <div className="flex flex-col gap-2">
                {editActions.map(({ action: a, label, statusCode }) => {
                  const c = DEFAULT_COLORS[statusCode] ?? DEFAULT_COLORS.NORMAL;
                  const has = entry ? entry.currentActions.has(a) : serverActions.has(a);
                  const init = entry ? entry.initialActions.has(a) : serverActions.has(a);
                  const changed = has !== init;
                  return (
                    <button key={a} type="button" onClick={() => toggleEditStatus(editDialogCell, sid, a, has)}
                      className="flex items-center gap-2 rounded-student-md border-2 px-3 py-2.5 text-sm font-semibold transition hover:brightness-95"
                      style={{ borderColor: has ? c.border : "var(--app-color-border-default)", background: "var(--app-color-surface-container)" }}>
                      {/* 色块预览：选中即用该状态的底色/描边，与网格上显示的色一致 */}
                      <span className="h-5 w-8 shrink-0 rounded border-2" style={{ backgroundColor: has ? c.bg : "#f1f5f9", borderColor: has ? c.border : "#cbd5e1" }} />
                      <span className="flex-1 text-left text-[var(--app-color-text-primary)]">{label}</span>
                      <span className="text-[11px]" style={{ color: changed ? "var(--student-warning)" : has ? c.border : "var(--app-color-text-tertiary)" }}>
                        {changed ? "已变更" : has ? "已标记" : "点击标记"}
                      </span>
                    </button>
                  );
                })}
                {editActions.length === 0 && <div className="px-1 py-2 text-center text-[11px] text-[var(--app-color-text-tertiary)]">当前身份没有可标记的状态</div>}
              </div>
              <div className="mt-2 text-[10px] leading-snug text-[var(--app-color-text-tertiary)]">改完在「状态待提交」抽屉里统一提交</div>
            </div>
          </div>, document.body);
      })()}
      {/* 批量转移面板（与后台同一个组件）：多次选源 → 下一步 → 按顺序点目标 → 逐条提交 */}
      {opSel.batch && (
        <BatchTransferPanel
          pairs={opSel.pairs}
          phase={opSel.phase}
          loading={opSel.loading}
          error={opSel.error}
          submitting={batchSubmitting}
          onReorder={(a, b) => (opSel.phase === "sources" ? opSel.swapSources(a, b) : opSel.swapTargets(a, b))}
          onNext={opSel.confirmSources}
          onBack={opSel.backToSources}
          onRemoveSource={(id) => opSel.toggleBatchSource(id)}
          onClearTarget={opSel.toggleBatchTarget}
          onLocate={locateCage}
          onSubmit={handleBatchSubmit}
          onCancel={opSel.cancel}
        />
      )}
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
      {/* 抽屉关着时，右边缘留一排书签标签（每个带缓冲的模式一枚），点谁切到谁并展开抽屉 */}
      {!drawerOpen && (
        <StudentModeTabs
          allowed={islandModes}
          counts={{ studentClaim: claimBatch.items.length, division: divisionBatch.items.length, edit: editBatch.items.length }}
          onPick={(k) => switchMode(k)}
        />
      )}
      {/* 申请预约：缓冲抽屉（无目标区域） */}
      {drawerOpen && currentMode === "studentClaim" && (
        <StudentModeDrawer
          title="申请预约待提交"
          items={claimBatch.items}
          selected={bufferSelected}
          onToggle={(cageId) => setBufferSelected((p) => { const n = new Set(p); n.has(cageId) ? n.delete(cageId) : n.add(cageId); return n; })}
          onToggleAll={() => setBufferSelected((p) => (p.size > 0 && claimBatch.items.every((i) => p.has(i.cageId)) ? new Set() : new Set(claimBatch.items.map((i) => i.cageId))))}
          onRemove={(cageId) => patchPending("studentClaim", (b) => removeItem(b, cageId))}
          onAssignSelected={() => {}}
          onUnassignAll={() => {}}
          onDrop={() => {}}
          cellOf={(it) => (it.x != null && it.y != null ? findCellByKey(it.shelveId, it.x, it.y) : undefined)}
          shelfNameOf={(it) => (details.find((d) => String(d.shelfMeta?.shelveId) === it.shelveId)?.shelfMeta?.shelveName) ?? shelfDetail?.shelfMeta?.shelveName}
          onSubmit={() => void submitClaims()}
          submitting={claimSubmitting}
          onClose={() => setDrawerOpen(false)}
        />
      )}
      {/* 划分：缓冲抽屉 + 右栏人员区域 */}
      {drawerOpen && currentMode === "division" && (
        <StudentModeDrawer
          title="划分待提交"
          items={divisionUnassigned}
          selected={bufferSelected}
          zones={divisionZones}
          itemsByZone={divisionItemsByZone}
          needsTarget
          targetKeyOf={(it) => it.assigneeAccountId}
          targetNoun="人员"
          onToggle={(cageId) => setBufferSelected((p) => { const n = new Set(p); n.has(cageId) ? n.delete(cageId) : n.add(cageId); return n; })}
          onToggleAll={() => setBufferSelected((p) => (p.size > 0 && divisionUnassigned.every((i) => p.has(i.cageId)) ? new Set() : new Set(divisionUnassigned.map((i) => i.cageId))))}
          onRemove={(cageId) => patchPending("division", (b) => removeItem(b, cageId))}
          onAssignSelected={(zoneKey) => { dropDivisionToPerson([...bufferSelected], zoneKey); setBufferSelected(new Set()); }}
          onUnassignAll={(zoneKey) => {
            dropDivisionToPerson((divisionItemsByZone.get(zoneKey) ?? []).map((i) => i.cageId), null);
            patchPending("division", (b) => setParams(b, { persons: Object.fromEntries(Object.entries(divisionPersons).filter(([k]) => k !== zoneKey)) }));
          }}
          onDrop={(ids, zoneKey) => dropDivisionToPerson(ids, zoneKey)}
          cellOf={(it) => (it.x != null && it.y != null ? findCellByKey(it.shelveId, it.x, it.y) : undefined)}
          shelfNameOf={(it) => (details.find((d) => String(d.shelfMeta?.shelveId) === it.shelveId)?.shelfMeta?.shelveName) ?? shelfDetail?.shelfMeta?.shelveName}
          zonesHeader={
            <div className="shrink-0 border-b border-[var(--app-color-border-default)] p-2">
              <StudentSearchSelect
                search={searchDivisionPerson}
                placeholder="搜索姓名 / 工号"
                excludeKeys={Object.keys(divisionPersons)}
                onPick={(o) => patchPending("division", (b) => setParams(b, { persons: { ...divisionPersons, [o.key]: o.label } }))}
              />
            </div>
          }
          onSubmit={() => void submitDivision()}
          submitting={divisionSubmitting}
          onClose={() => setDrawerOpen(false)}
        />
      )}
      {/* 状态：缓冲抽屉 + 右栏状态色区（拖到色区即标记，拖到虚线区即撤销） */}
      {drawerOpen && currentMode === "edit" && (
        <StudentModeDrawer
          title="状态待提交"
          items={editStagedItems}
          selected={bufferSelected}
          zones={editZones}
          itemsByZone={editItemsByZone}
          onToggle={(cageId) => setBufferSelected((p) => { const n = new Set(p); n.has(cageId) ? n.delete(cageId) : n.add(cageId); return n; })}
          onToggleAll={() => setBufferSelected((p) => (p.size > 0 && editStagedItems.every((i) => p.has(i.cageId)) ? new Set() : new Set(editStagedItems.map((i) => i.cageId))))}
          onRemove={removeEditItem}
          onAssignSelected={(zoneKey) => { if (handleEditZoneDrop([...bufferSelected], zoneKey, null)) setBufferSelected(new Set()); }}
          onUnassignAll={(zoneKey) => { handleEditZoneDrop((editItemsByZone.get(zoneKey) ?? []).map((i) => i.cageId), null, zoneKey); }}
          onDrop={(ids, zoneKey, fromZone) => { handleEditZoneDrop(ids, zoneKey, fromZone ?? null); }}
          cellOf={(it) => (it.x != null && it.y != null ? findCellByKey(it.shelveId, it.x, it.y) : undefined)}
          shelfNameOf={(it) => (details.find((d) => String(d.shelfMeta?.shelveId) === it.shelveId)?.shelfMeta?.shelveName) ?? shelfDetail?.shelfMeta?.shelveName}
          cacheOf={editCacheOfItem}
          onOpen={openEditItemById}
          zonesHeader={
            <div className="shrink-0 border-b border-[var(--app-color-border-default)] p-2 text-[10px] leading-snug text-[var(--app-color-text-tertiary)]">
              拖笼位到对应色区即标记，拖到虚线区即撤销
            </div>
          }
          onSubmit={() => void submitEdit()}
          submitting={editSubmitting}
          onClose={() => setDrawerOpen(false)}
        />
      )}
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
