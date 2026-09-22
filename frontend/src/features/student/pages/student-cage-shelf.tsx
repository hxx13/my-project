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
import { displayPosition, CAGE_BOX_ACTIONS, detailParentsLast, cageBoxAction, actionsFromFormValues, parseStatusZone, statusZoneKey, detailZoneKey, parseDetailZone, severityZoneKey, parseSeverityZone, SEVERITY_CLEAR_ZONE, detailPhotoKey, SPECIAL_DETAIL_DICT, SPECIAL_DETAIL_CANONICAL, HEALTH_SEVERITY_DICT, HEALTH_SEVERITY_CANONICAL, HEALTH_CHECK_ACTION, HEALTH_ITCH_CANONICAL, HEALTH_ITCH_LABEL, HEALTH_ITCH_TRUE, detailCodesOfValues, severityOfValues, itchOfValues } from "@/features/cage-shelf/constants";
import StatusPhotoStrip from "@/features/cage-shelf/components/StatusPhotoStrip";
import { DEFAULT_COLORS } from "@/features/cage-shelf/components/CageColorContext";
import { fetchCageInfoValues, fetchCageInfoCodelist, type CageInfoValueRow, type CageCodelistItem } from "@/features/cage-shelf/api/cageForm.api";
import { fetchFullTree, fetchLocalShelfGridByShelveId, fetchMyClaims, fetchPoolCells, claimCage, confirmClaim, lookupCode, locateTargetOf, fetchCageModeVisible, fetchCageOpMarkers, saveCageDivision, searchPersonnelByKeyword, localEdit, localArchiveCage, saveStatusDetail, type CageShelfCell, type CageShelfTreeNode, type CageClaimItem, type PoolCell, type CageBoxAction } from "@/api/domains/cageShelf.api";
import { fetchStudentMobileSpecialStatusOverview } from "@/api/domains/studentMobile.api";
import { authHttp } from "@/api/core/authHttp";
import { fetchActiveCageReservations } from "@/api/domains/animalOrderCage.api";
import MobileScanDialog from "@/pages/mobile/MobileScanDialog";
import MobileSpecialStatusPanel from "@/pages/mobile/MobileSpecialStatusPanel";
import toast from "react-hot-toast";
import { useTreeExpansion } from "@/features/cage-shelf/useTreeExpansion";
import { useRoomBookmarks } from "@/features/cage-shelf/useRoomBookmarks";
import { useShelfBookmarks } from "@/features/cage-shelf/useShelfBookmarks";
import { CellDetailPanel } from "./cage-shelf-detail-panel";
import MyCageRequestsDialog from "@/features/student/components/MyCageRequestsDialog";
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
  const [tab, setTab] = useState<"filter" | "bookmarks">("filter");
  const [myClaims, setMyClaims] = useState<CageClaimItem[]>([]);
  const [claimsLoading, setClaimsLoading] = useState(false);
  /** 「我的申请」是弹窗（不是 tab）：它跟主区网格无关，塞进 grid 主区会被撑满高度的空占位顶下去 */
  const [requestsOpen, setRequestsOpen] = useState(false);

  const loadMyClaims = async () => { setClaimsLoading(true); try { setMyClaims(await fetchMyClaims()); } catch { setMyClaims([]); } finally { setClaimsLoading(false); } };
  useEffect(() => { loadMyClaims(); }, []);

  const [collapsed, setCollapsed] = useState(false);
  const [viewMode, setViewMode] = useState<"room" | "shelf">("room");
  const [search, setSearch] = useState("");
  const [legend, setLegend] = useState(false);

  /**
   * 左栏视图跟随 tab（收藏只换过滤、不换组件 —— 切视图不卸载，展开与滚动位置都留着）。
   */
  const [leftView, setLeftView] = useState<"filter" | "bookmarks">("filter");
  useEffect(() => { setLeftView(tab); }, [tab]);

  // Tree
  const emptyTree = useMemo(() => [] as CageShelfTreeNode[], []);
  const { data: fullTree = emptyTree } = useQuery({ queryKey: ["cageShelfFullTree"], queryFn: fetchFullTree, staleTime: 10 * 60 * 1000 });
  const tree = useMemo(() => buildTree(fullTree), [fullTree]);
  /**
   * 左侧树展开态：**存后端**（跟账号走，换设备也记得）；房间级收藏：房间名后的星标 + 收藏视图过滤。
   * 与管理端共用同一对 hook（2026-09-19 口径：收藏粒度从笼架改到房间）。
   */
  const { exp, toggleNode, expandKeys } = useTreeExpansion("cageShelfTreeExpanded");
  const { rooms: bookmarkedRooms, toggleRoom } = useRoomBookmarks();
  const { shelves: bookmarkedShelves, toggleShelf: toggleBookmarkShelf } = useShelfBookmarks();
  const expInited = useRef(false);
  useEffect(() => {
    if (expInited.current || tree.length === 0) return;
    const keys = new Set<string>();
    for (const c of tree) { keys.add(c.key); for (const n of c.children) { keys.add(n.key); } }
    expandKeys(keys);
    expInited.current = true;
  }, [tree, expandKeys]);

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
  /** 归档模式：学生只能归档**本人占用**的笼位（UI 与后端双重把关，后端那道在 /local/archive） */
  const [archiveMode, setArchiveMode] = useState(false);
  const [archiveSubmitting, setArchiveSubmitting] = useState(false);
  const [archiveBoxSelect, setArchiveBoxSelect] = useState(false);
  const archiveBoxAnchorRef = useRef<{ sid: string; x: number; y: number } | null>(null);
  const [claimReloadKey, setClaimReloadKey] = useState(0);

  // ── 状态模式（edit）：与管理端同一套机制 ──
  // 编辑缓存是状态模式的唯一真相源：网格配色、抽屉缩略图、待提交批次三者都由它派生。
  const [editMode, setEditMode] = useState(false);
  /**
   * 状态模式下的点子方式（对齐管理端的「直接改 / 拖色区」，但学生侧不即时写盘）：
   * 两种方式**点格子都会把该格放进缓冲区**（拖色区那条批量路要人肉往里选），
   * 区别只在弹不弹动作弹窗 —— 特殊饲养明细只存在于弹窗里，所以「弹窗编辑」这条必须有。
   *  - 弹窗编辑（默认）：点格子 → 入缓冲区 + 打开动作弹窗（选动作与明细）；
   *  - 拖色区：点格子 → 只进/出缓冲区（不弹窗），拖到色区批量标记。
   * 改动一律进「状态待提交」，提交仍是抽屉里那个统一按钮。
   */
  const [editPointMode, setEditPointMode] = useState(true);
  const [scanCache, setScanCache] = useState<Map<string, { cell: CageShelfCell; code: string; initialActions: Set<CageBoxAction>; currentActions: Set<CageBoxAction>;
    /** 特殊饲养明细：进缓存时的服务端选中集合 / 当前目标集合（item_code）。可选 = 本次不动明细。 */
    initialDetails?: Set<string>; currentDetails?: Set<string>;
    /** 健康异常严重程度：进缓存时的服务端值 / 当前值（互斥单选，null = 未选）。可选 = 本次不动。 */
    initialSeverity?: string | null; currentSeverity?: string | null;
    /** 健康异常「瘙痒」（布尔子值）：进缓存时的服务端值 / 当前值。可选 = 本次不改。 */
    initialItch?: boolean; currentItch?: boolean }>>(new Map());
  const [lastScannedKey, setLastScannedKey] = useState<string | null>(null);
  /** 特殊饲养明细的可选项（码表维护、可增长）—— 只在「需特殊饲养」开着时渲染。 */
  const [specialDetailOptions, setSpecialDetailOptions] = useState<CageCodelistItem[]>([]);
  /** 健康异常严重程度的可选项（同样走码表，互斥单选）。 */
  const [severityOptions, setSeverityOptions] = useState<CageCodelistItem[]>([]);
  useEffect(() => {
    fetchCageInfoCodelist(SPECIAL_DETAIL_DICT).then((d) => setSpecialDetailOptions(d.items ?? [])).catch(() => {});
    fetchCageInfoCodelist(HEALTH_SEVERITY_DICT).then((d) => setSeverityOptions(d.items ?? [])).catch(() => {});
  }, []);
  const [editDialogCell, setEditDialogCell] = useState<CageShelfCell | null>(null);
  const [editDialogShelfId, setEditDialogShelfId] = useState("");
  /** 表单值(cage_info_value)：状态标记的唯一真相源，弹窗据此反向使能按钮 */
  const [editFormValues, setEditFormValues] = useState<CageInfoValueRow[] | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  /**
   * 状态专属照片，**按归属的状态分桶**：key = 状态表单字段名（`needs_division` …）或明细的 `SF_<item_code>`。
   * 与管理端同款：每个状态一枚上传按钮，各传各的，远端不会再把一份照片摊进每个状态。
   */
  const [statusPhotos, setStatusPhotos] = useState<Record<string, string[]>>({});
  const [actionNote, setActionNote] = useState("");
  /**
   * 用户**真的动过**的 key / 备注 —— 写盘只写这些。
   * 整份写回会把这段时间里别人改过的 key 一起盖成陈旧值（没动过的人也赢了）。
   */
  const [dirtyPhotoKeys, setDirtyPhotoKeys] = useState<Set<string>>(new Set());
  const [noteDirty, setNoteDirty] = useState(false);
  /** 照片条改一张 = 只把**那个 key** 标脏 */
  const setPhotosFor = useCallback((key: string, urls: string[]) => {
    setStatusPhotos((p) => ({ ...p, [key]: urls }));
    setDirtyPhotoKeys((p) => { const n = new Set(p); n.add(key); return n; });
  }, []);
  const [annotateSubmitting, setAnnotateSubmitting] = useState(false);

  // 打开动作弹窗时把该笼位已存的照片/备注捞回来（弹窗是唯一的照片入口）
  useEffect(() => {
    if (!editDialogCell) return;
    setStatusPhotos({}); setActionNote("");
    setDirtyPhotoKeys(new Set()); setNoteDirty(false);
    const cageId = cageIdOfCell(editDialogCell);
    if (!cageId) return;
    authHttp.get(`/local/annotate/${cageId}`).then((r) => {
      if (!r.data?.success) return;
      const sp = r.data.data?.statusPhotos;
      if (!sp) return;
      try {
        const parsed = typeof sp === "string" ? JSON.parse(sp) : sp;
        if (typeof parsed?._note === "string") setActionNote(parsed._note);
        const byKey: Record<string, string[]> = {};
        for (const k of Object.keys(parsed ?? {})) if (k !== "_note" && Array.isArray(parsed[k])) byKey[k] = parsed[k];
        setStatusPhotos(byKey);
      } catch { setStatusPhotos({}); }
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editDialogCell]);

  /**
   * 照片 + 备注写盘：只覆盖本次动过的 key，其余原样带回去。
   * 备注清空即删键（否则用户改不掉已经写下的备注）。
   */
  const saveAnnotation = useCallback(async (cageId: string) => {
    if (dirtyPhotoKeys.size === 0 && !noteDirty) return; // 没动过就不发请求
    /* 服务端那份为底，只有动过的 key 才用当前值盖上去；读不到就退回打开时加载的快照兜底 */
    let sp: Record<string, unknown> = { ...statusPhotos };
    try {
      const r = await authHttp.get(`/local/annotate/${cageId}`);
      if (r.data?.success && r.data.data?.statusPhotos) {
        const parsed = typeof r.data.data.statusPhotos === "string" ? JSON.parse(r.data.data.statusPhotos) : r.data.data.statusPhotos;
        if (parsed && typeof parsed === "object") sp = { ...parsed };
      }
    } catch { /* 读不到就用打开时那份 */ }
    for (const k of dirtyPhotoKeys) sp[k] = statusPhotos[k] ?? [];
    if (noteDirty) { if (actionNote.trim()) sp._note = actionNote; else delete sp._note; }
    await authHttp.post("/local/annotate", { animalCageId: cageId, statusPhotos: JSON.stringify(sp) });
    setDirtyPhotoKeys(new Set()); setNoteDirty(false);
  }, [statusPhotos, actionNote, dirtyPhotoKeys, noteDirty]);

  /**
   * 弹窗编辑：备注与照片也**即时写盘**（与状态类改动同一口径，2026-09-18 用户定）。
   * 防抖 600ms —— 备注每敲一个字发一次请求受不了；照片是一次性事件，搭同一趟车。
   * saveAnnotation 成功后自己会清脏标记，这里不用管。
   */
  const directAnnotateTimer = useRef<number | null>(null);
  useEffect(() => {
    if (!editMode || !editPointMode || !editDialogCell) return;
    const cageId = cageIdOfCell(editDialogCell);
    if (!cageId || (dirtyPhotoKeys.size === 0 && !noteDirty)) return;
    directAnnotateTimer.current = window.setTimeout(() => {
      /* 失败必须出声：学生身份写状态照片会被服务端 403（CageLocalController 显式排除学生），
         静默吞掉就成了「备注看着像存上了、其实没有」。 */
      void saveAnnotation(cageId).catch((e) => {
        toast.error(`标注保存失败：${e instanceof Error ? e.message : "未知原因"}`);
      });
    }, 600);
    return () => { if (directAnnotateTimer.current) window.clearTimeout(directAnnotateTimer.current); };
  }, [dirtyPhotoKeys, noteDirty, statusPhotos, actionNote, editMode, editPointMode, editDialogCell, saveAnnotation]);

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
  const archiveBatch = batchOf(pendingByMode, "archive");

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
    // 模式入口按**当前房间**算：切房间要重算。未进房间（aRid 空）= 不限定区域，后端取并集。
    // 区域组长把某模式在本房关掉后，学生进这个房间就看不到该模式入口（不是等提交才拒）。
    const row = fullTree.find((r) => String(r.roomId ?? "") === aRid);
    fetchCageModeVisible(
      aRid
        ? {
            roomId: aRid,
            floorId: row?.floorId != null ? String(row.floorId) : undefined,
            campusId: row?.campusId != null ? String(row.campusId) : undefined,
          }
        : undefined,
    )
      .then(r => {
        setIsStudentView(r.isStudent);
        // 空数组与不下发同义 = 不限制（只有收窄时才下发命中的那几个 action）
        const ids = r.modeActions?.edit;
        setEditActionNames(ids && ids.length > 0 ? ids : null);
        setAllowedModes(r.isStudent ? r.modes : null);
      })
      .catch(() => setAllowedModes(null));
  }, [aRid, fullTree]);
  const canClaim = allowedModes == null || allowedModes.includes("studentClaim");
  const canConfirm = allowedModes == null || allowedModes.includes("confirm");
  /** 划分模式：管家专属（后端下发的能力位；具体写权限由后端二次校验） */
  const canDivide = allowedModes == null || allowedModes.includes("division");
  /** 状态模式：动作按钮由后端白名单过滤（当前学生只放 COHABITATION，以后加动作只改后端） */
  const canEdit = allowedModes == null || allowedModes.includes("edit");
  /** 归档模式：学生只能归档**本人占用**的笼位（区域组长可逐区关掉这个入口） */
  const canArchive = allowedModes == null || allowedModes.includes("archive");
  /**
   * 学生侧**不开放**的两个动作：需分笼、动物转移（用户 2026-09-14 口径：这两个禁用学生侧）。
   *
   * 后端 `CageModeVisibilityService.STUDENT_EDIT_ACTIONS` 里本来就没有它们，但那条白名单**缺席时**
   * 前端会回退成「全部动作」（fail-open），于是这两个也跟着露出来。这里再兜一道：
   * 不管白名单来没来，学生页两个都不渲染。（教职工要用请走后台的笼架页。）
   */
  const STUDENT_HIDDEN_ACTIONS: CageBoxAction[] = ["DIVIDE", "TRANSFER"];
  const editActions = useMemo(
    () => (editActionNames ? CAGE_BOX_ACTIONS.filter(a => editActionNames.includes(a.action)) : CAGE_BOX_ACTIONS)
      .filter(a => !STUDENT_HIDDEN_ACTIONS.includes(a.action)),
    [editActionNames],
  );

  /* ---- 模式悬浮岛：与管理端同一套组件、同一份模式元数据、同一个形态选择 ---- */
  const [islandVariant, toggleIslandVariant] = useIslandVariant();
  const rightPanelRef = useRef<HTMLDivElement | null>(null);
  const currentMode: CageModeKey = confirmMode ? "confirm" : claimMode ? "studentClaim" : divisionMode ? "division" : editMode ? "edit" : archiveMode ? "archive" : "view";
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
    if (canArchive) list.push("archive");
    return list;
  }, [canClaim, canConfirm, canEdit, canDivide, canArchive]);
  const switchMode = (k: CageModeKey) => {
    setClaimMode(k === "studentClaim");
    setConfirmMode(k === "confirm");
    setDivisionMode(k === "division");
    setEditMode(k === "edit");
    setArchiveMode(k === "archive");
    setDivisionBoxSelect(false);
    divisionBoxAnchorRef.current = null;
    setArchiveBoxSelect(false);
    archiveBoxAnchorRef.current = null;
    if (k !== "studentClaim" && k !== "division") {
      setPoolCells(new Map());
    }
    // 唯一会「自动弹」的时机：切进这个模式那一下。点格子永远不弹（见 handleClaimToggle/handleDivisionToggle）
    /*
      状态模式也必须自动弹：色区就在抽屉右栏，抽屉不开就没有落点。
      编辑缓存**不在这里清** —— 它同时是待提交那批改动的真相源（配色 + 每格初始快照），
      清了缓存留着批次，再切回状态模式颜色全丢。
    */
    setDrawerOpen(k === "studentClaim" || k === "division" || k === "edit" || k === "archive");
  };

  /**
   * 切到「弹窗编辑」就把抽屉收起来：弹窗是那时的主战场，抽屉横在右边挡视野（2026-09-19 用户口径）。
   * 只认「模式变化」这一下 —— 之后用户自己点开就随他，不会每轮渲染又把它关掉；
   * 切走再切回状态模式时这个 effect 会重新跑，所以「自动收起」在每次进入弹窗编辑时都成立。
   */
  useEffect(() => { if (currentMode === "edit" && editPointMode) setDrawerOpen(false); }, [currentMode, editPointMode]);

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
    const items = currentMode === "division" ? divisionBatch.items
      : currentMode === "studentClaim" ? claimBatch.items
      : currentMode === "archive" ? archiveBatch.items
      : [];
    const s = new Set<string>();
    for (const it of items) {
      if (it.x != null && it.y != null) s.add(`${it.shelveId}:${it.x}:${it.y}`);
    }
    return s;
  }, [currentMode, claimBatch.items, divisionBatch.items, archiveBatch.items]);

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

  /**
   * 归档模式勾选：单击切换 / 框选按钮点两格成矩形。
   *
   * 只收**本人占用**的笼位（与后端 `/local/archive` 那道闸同口径，把拒绝提前到点击那一下），
   * 且只有「饲养中」才谈得上归档（空笼盒无需归档 —— 与管理端同判据）。
   */
  const handleArchiveToggle = (sid: string, x: number, y: number, _shiftKey?: boolean) => {
    const cellAt = (cx: number, cy: number) => findCellByKey(sid, cx, cy) as any;
    const notMine = (c: any) => isStudentView && !c?.mine;
    const eligible = (cx: number, cy: number) => {
      const c = cellAt(cx, cy);
      if (!c || c.empty) return false;
      if (notMine(c)) return false;
      return (c.cageTypeCode ?? c.animalCageType) === 3;
    };
    const hintOf = (cx: number, cy: number) => {
      const c = cellAt(cx, cy);
      if (c && notMine(c)) return "只能归档本人使用中的笼位";
      return "该笼位当前无笼盒/未占用，无需归档";
    };
    const key = `${sid}:${x}:${y}`;
    const aid = cellIdByKey.get(key);

    if (archiveBoxSelect) {
      const anchor = archiveBoxAnchorRef.current;
      if (!anchor || anchor.sid !== sid) {
        if (!eligible(x, y)) { void appAlert(hintOf(x, y)); return; }
        archiveBoxAnchorRef.current = { sid, x, y };
        if (aid) patchPending("archive", (b) => upsertItem(b, { cageId: aid, label: `${sid} (${x},${y})`, shelveId: sid, x, y }));
        return;
      }
      const minX = Math.min(anchor.x, x), maxX = Math.max(anchor.x, x);
      const minY = Math.min(anchor.y, y), maxY = Math.max(anchor.y, y);
      patchPending("archive", (b) => {
        let next = b;
        for (let cx = minX; cx <= maxX; cx++)
          for (let cy = minY; cy <= maxY; cy++)
            if (eligible(cx, cy)) {
              const id = cellIdByKey.get(`${sid}:${cx}:${cy}`);
              if (id) next = upsertItem(next, { cageId: id, label: `${sid} (${cx},${cy})`, shelveId: sid, x: cx, y: cy });
            }
        return next;
      });
      archiveBoxAnchorRef.current = null;
      setArchiveBoxSelect(false);
      return;
    }
    if (!aid) return;
    const already = archiveBatch.items.some((it) => it.cageId === aid);
    if (!already && !eligible(x, y)) { void appAlert(hintOf(x, y)); return; }
    patchPending("archive", (b) => (already ? removeItem(b, aid) : upsertItem(b, { cageId: aid, label: `${sid} (${x},${y})`, shelveId: sid, x, y })));
  };

  /** 划分的人员区域（accountId → 姓名），随批次参数持久化，关抽屉不丢 */  const divisionPersons = (divisionBatch.params.persons as Record<string, string> | undefined) ?? {};
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
   * 归档提交：逐个调 `/local/archive`（一次一个笼位）。
   * **不在这里做归属校验** —— 后端那道闸才是权威（认领人/实验员是不是本人），
   * 这里只负责把成功的移出批次、失败的留着重试。
   */
  const submitArchive = async () => {
    const items = archiveBatch.items;
    if (items.length === 0) return;
    setArchiveSubmitting(true);
    const okIds: string[] = [];
    const failed: Array<{ cageId: string; reason: string }> = [];
    for (const it of items) {
      try { await localArchiveCage(it.cageId); okIds.push(it.cageId); }
      catch (e: any) { failed.push({ cageId: it.cageId, reason: e?.message || "归档失败" }); }
    }
    setArchiveSubmitting(false);
    patchPending("archive", (b) => {
      let next = b;
      for (const id of okIds) next = removeItem(next, id);
      for (const f of failed) {
        const it = next.items.find((x) => x.cageId === f.cageId);
        if (it) next = { ...next, failed: [...next.failed.filter((x) => x.cageId !== f.cageId), { cageId: f.cageId, label: it.label, reason: f.reason }] };
      }
      return next;
    });
    if (okIds.length > 0) {
      setClaimReloadKey((k) => k + 1);   // 归档后笼位变空笼盒，网格要重拉
      setBufferSelected(new Set());
    }
    if (failed.length > 0) await appAlert(`${okIds.length} 个成功、${failed.length} 个失败。${failed[0]?.reason ?? ""}`);
    else if (okIds.length > 0) await appAlert(`已归档 ${okIds.length} 个笼位`);
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

  // 收藏已改房间级（顶部 useRoomBookmarks）：笼架级 pin 那套（pinned/bmList/loadBm）退役。
  /**
   * 进「收藏」视图：自动展开**收藏顺序里的第一个房间**（否则左侧只剩几个孤零零的房间节点）。
   */
  useEffect(() => {
    if (leftView !== "bookmarks") return;
    // 优先展开第一个收藏的房间；一个房间都没收藏（只收藏了笼架）就展开那架所属的房间
    let targetRoom = [...bookmarkedRooms][0] ?? "";
    if (!targetRoom) {
      const firstShelf = [...bookmarkedShelves][0];
      if (firstShelf) targetRoom = String(fullTree.find(r => String(r.shelveId) === firstShelf)?.roomId ?? "");
    }
    if (!targetRoom) return;
    const row = fullTree.find(r => String(r.roomId) === targetRoom);
    if (!row) return;
    const keys = new Set<string>();
    if (row.campusId) keys.add(`c:${row.campusId}`);
    if (row.areaId) keys.add(`a:${row.areaId}`);
    if (row.floorId) keys.add(`f:${row.floorId}`);
    keys.add(`r:${targetRoom}`);
    expandKeys(keys);
  }, [leftView, bookmarkedRooms, bookmarkedShelves, fullTree, expandKeys]);

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
  /* 批量转移：选位一次配多对，确认时弹 CageOperationDialog 批量模式（每对一张转移单，一次提交全部） */
  const [batchConfirmOpen, setBatchConfirmOpen] = useState(false);
  const handleBatchSubmit = useCallback(() => {
    const list = opSel.pairs.filter((p) => p.targetId);
    if (list.length === 0) return;
    setBatchConfirmOpen(true);
  }, [opSel.pairs]);
  const handleBatchConfirmDone = useCallback(() => {
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
  /**
   * 严重程度色区落点：把某一档写进编辑缓存（**互斥单选**，value=null 表示清空），
   * 同时落「瘙痒」这个布尔子值（itch）。
   * 落某一档时**顺手把父状态「健康异常」也标上**（严重程度写盘要求父状态开着）。
   *
   * <p>定义位置刻意靠前：下面 `editSeverityZones` 的勾选框要引用它（useCallback 的依赖数组
   * 在渲染期求值，引用后面才声明的 const 会直接报 TDZ）。
   */
  const applyEditSeverity = useCallback(async (cell: any, sid: string, value: string | null, itch: boolean) => {
    const ck = `${sid}:${cell.x}:${cell.y}`;
    const code = String(cell?.cageBoxCode ?? "");
    let fallbackActions: Set<CageBoxAction> | null = null;
    let fallbackSeverity: string | null = null;
    let fallbackItch: boolean | null = null;
    if (!scanCache.has(ck)) {
      const cageId = cageIdOfCell(cell);
      const rows = cageId ? await fetchCageInfoValues(cageId).catch(() => null) : null;
      fallbackActions = actionsFromFormValues(rows);
      fallbackSeverity = severityOfValues(rows);
      fallbackItch = itchOfValues(rows);
    }
    setScanCache(prev => {
      const next = new Map(prev);
      const e = next.get(ck);
      const initA = e ? e.initialActions : (fallbackActions ?? new Set<CageBoxAction>());
      const initS = e ? (e.initialSeverity ?? null) : fallbackSeverity;
      const initI = e ? (e.initialItch ?? false) : (fallbackItch ?? false);
      const curA = new Set(e ? e.currentActions : initA);
      if (value) curA.add("HEALTH_CHECK");
      const same = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every(x => b.has(x));
      if (same(curA, initA) && same(e?.currentDetails ?? new Set<string>(), e?.initialDetails ?? new Set<string>())
          && (value ?? null) === (initS ?? null) && itch === initI) {
        next.delete(ck);
      } else {
        next.set(ck, e
          ? { ...e, currentActions: curA, initialSeverity: initS, currentSeverity: value, initialItch: initI, currentItch: itch }
          : { cell, code, initialActions: initA, currentActions: curA, initialSeverity: initS, currentSeverity: value,
              initialItch: initI, currentItch: itch });
      }
      return next;
    });
  }, [cageIdOfCell, scanCache]);

  /** 严重程度各档的「瘙痒」页面级偏好：区里空着时记住上次勾选，拖新笼位进来就按它落。 */
  const [severityItchPref, setSeverityItchPref] = useState<Record<string, boolean>>({});

  /** 某个 (笼位按需查) 的缓存条目 —— 色区勾选框要按它判断「这档的笼位是否都带瘙痒」 */
  const cacheOfCageId = useCallback(
    (cageId: string) => {
      const key = keyByCageId.get(cageId);
      return key ? scanCache.get(key) : undefined;
    },
    [keyByCageId, scanCache],
  );

  /** 某档此刻该不该显示勾上：该档**有笼位就以它们为准**（全部带瘙痒才算），空档回落到偏好。 */
  const itchOnFor = useCallback((code: string): boolean => {
    const cached = editBatch.items
      .filter((it) => cacheOfCageId(it.cageId)?.currentSeverity === code);
    if (cached.length > 0) return cached.every((it) => cacheOfCageId(it.cageId)?.currentItch === true);
    return !!severityItchPref[code];
  }, [editBatch.items, cacheOfCageId, severityItchPref]);

  /**
   * 勾/取消某档的「瘙痒」：记住偏好，并把**该档已有的笼位**一并改成同样状态 ——
   * 只改偏好不动已有笼位的话，用户勾了却发现拖进去的那批没变，只能一枚枚重拖。
   */
  const toggleZoneItch = useCallback((code: string, next: boolean) => {
    setSeverityItchPref((p) => ({ ...p, [code]: next }));
    for (const it of editBatch.items) {
      if (cacheOfCageId(it.cageId)?.currentSeverity !== code) continue;
      const key = keyByCageId.get(it.cageId);
      if (!key) continue;
      const [sid2, sx, sy] = key.split(":");
      const cell = findCellByKey(sid2, Number(sx), Number(sy));
      if (!cell) continue;
      void applyEditSeverity(cell, sid2, code, next);
    }
  }, [editBatch.items, cacheOfCageId, keyByCageId, applyEditSeverity]);

  /**
   * 明细色区（折叠在「需特殊饲养」/「撤销需特殊饲养」两张卡里）：
   * 标记区挂父状态那张卡、撤销区挂撤销那张卡，各管一个方向。配色沿用父状态。
   */
  const editDetailZones = useMemo(() => {
    const color = (DEFAULT_COLORS.SPECIAL_FEEDING ?? DEFAULT_COLORS.NORMAL).border;
    return {
      marks: specialDetailOptions.map((o): StudentZone => (
        { key: detailZoneKey(o.itemCode, true), title: o.itemLabel, subtitle: "标记该明细", color }
      )),
      cancels: specialDetailOptions.map((o): StudentZone => (
        { key: detailZoneKey(o.itemCode, false), title: `撤销${o.itemLabel}`, subtitle: "取消该明细", color, variant: "cancel" as const }
      )),
    };
  }, [specialDetailOptions]);
  /**
   * 严重程度色区（折叠在「健康异常」/「撤销健康异常」两张卡里）：标记区**一档一个**（互斥），
   * 撤销区**只有一个**（清空）。配色沿用父状态「健康异常」。
   */
  const editSeverityZones = useMemo(() => {
    const color = (DEFAULT_COLORS.HEALTH_ABNORMAL ?? DEFAULT_COLORS.NORMAL).border;
    return {
      marks: severityOptions.map((o): StudentZone => (
        {
          key: severityZoneKey(o.itemCode), title: o.itemLabel, subtitle: "标记该严重程度", color,
          /* 每档右上角一枚「瘙痒」勾选框：勾上 = 该档 + 瘙痒 */
          extraCheck: {
            checked: itchOnFor(o.itemCode),
            label: HEALTH_ITCH_LABEL,
            onChange: (next: boolean) => toggleZoneItch(o.itemCode, next),
          },
        }
      )),
      cancels: [
        { key: SEVERITY_CLEAR_ZONE, title: "撤销严重程度", subtitle: "清空严重程度", color, variant: "cancel" as const },
      ] as StudentZone[],
    };
  }, [severityOptions, itchOnFor, toggleZoneItch]);
  /** 右栏色区 = 每个可用动作一枚「标记区」+ 一枚「撤销区」，颜色就是该状态在网格上的配色 */
  const editZones: StudentZone[] = useMemo(
    () => detailParentsLast(editActions).flatMap(({ action, label, statusCode }) => {
      const color = (DEFAULT_COLORS[statusCode] ?? DEFAULT_COLORS.NORMAL).border;
      /* 子区挂在对应父状态名下（父状态没开放就整块不出现，与弹窗里的强绑定同口径） */
      const marks = action === "SPECIAL_BREEDING"
        ? (editDetailZones.marks.length > 0 ? editDetailZones.marks : undefined)
        : action === "HEALTH_CHECK"
          ? (editSeverityZones.marks.length > 0 ? editSeverityZones.marks : undefined)
          : undefined;
      const cancels = action === "SPECIAL_BREEDING"
        ? (editDetailZones.cancels.length > 0 ? editDetailZones.cancels : undefined)
        : action === "HEALTH_CHECK"
          ? editSeverityZones.cancels
          : undefined;
      /* 展开那一行的名词：明细归明细、严重程度归严重程度 */
      const childrenLabel = action === "SPECIAL_BREEDING" ? "明细" : action === "HEALTH_CHECK" ? "严重程度" : undefined;
      return [
        { key: statusZoneKey(action, true), title: label, subtitle: "标记该状态", color, children: marks, childrenLabel },
        { key: statusZoneKey(action, false), title: `撤销${label}`, subtitle: "取消该状态色", color, variant: "cancel" as const, children: cancels, childrenLabel },
      ];
    }),
    [editActions, editDetailZones, editSeverityZones],
  );
  /** zone.key → 条目（状态模式下一个笼位可同时挂在多个色区：改了 3 个状态就出现在 3 枚标记区里） */
  const editItemsByZone = useMemo(() => {
    const m = new Map<string, PendingItem[]>();
    const push = (k: string, it: PendingItem) => { const arr = m.get(k); if (arr) arr.push(it); else m.set(k, [it]); };
    for (const it of editBatch.items) {
      for (const a of it.actions ?? []) push(`add:${a}`, it);
      for (const a of it.removedActions ?? []) push(`del:${a}`, it);
      /* 明细区按**缓存的差异**分流：批次里 `details` 是目标全集，只有对比初值才知道是加还是撤 */
      const e = it.x != null && it.y != null ? scanCache.get(`${it.shelveId}:${it.x}:${it.y}`) : undefined;
      if (e) {
        for (const c of e.currentDetails ?? []) if (!(e.initialDetails ?? new Set<string>()).has(c)) push(detailZoneKey(c, true), it);
        for (const c of e.initialDetails ?? []) if (!(e.currentDetails ?? new Set<string>()).has(c)) push(detailZoneKey(c, false), it);
        /* 严重程度区同理，但互斥单选：设了值落那一档的标记区；清空落唯一的撤销区 */
        if (e.currentSeverity) push(severityZoneKey(e.currentSeverity), it);
        else if (e.initialSeverity) push(SEVERITY_CLEAR_ZONE, it);
      }
    }
    return m;
  }, [editBatch.items, scanCache]);
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
   * 明细色区落点：把某个明细项按 on/off 写进编辑缓存（与 {@link applyEditAction} 同一套语义）。
   *
   * 落「标记」时**顺手把父状态「需特殊饲养」也标上** —— 服务端的门槛是父状态必须开着
   * （CageInfoValueService 会拒「父关着还往明细上写」），不补这一步拖进明细区必然提交失败。
   * 撤销明细**不动**父状态：可能还有别的明细项要留着。
   */
  const applyEditDetail = useCallback(async (cell: any, sid: string, itemCode: string, on: boolean) => {
    const ck = `${sid}:${cell.x}:${cell.y}`;
    const code = String(cell?.cageBoxCode ?? "");
    let fallbackActions: Set<CageBoxAction> | null = null;
    let fallbackDetails: Set<string> | null = null;
    if (!scanCache.has(ck)) {
      const cageId = cageIdOfCell(cell);
      const rows = cageId ? await fetchCageInfoValues(cageId).catch(() => null) : null;
      fallbackActions = actionsFromFormValues(rows);
      fallbackDetails = detailCodesOfValues(rows);
    }
    setScanCache(prev => {
      const next = new Map(prev);
      const e = next.get(ck);
      const initA = e ? e.initialActions : (fallbackActions ?? new Set<CageBoxAction>());
      const initD = e?.initialDetails ?? (fallbackDetails ?? new Set<string>());
      const curA = new Set(e ? e.currentActions : initA);
      const curD = new Set(e?.currentDetails ?? initD);
      if (on) { curD.add(itemCode); curA.add("SPECIAL_BREEDING"); } else { curD.delete(itemCode); }
      const same = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every(x => b.has(x));
      if (same(curA, initA) && same(curD, initD)) next.delete(ck);
      else next.set(ck, e
        ? { ...e, currentActions: curA, initialDetails: initD, currentDetails: curD }
        : { cell, code, initialActions: initA, currentActions: curA, initialDetails: initD, currentDetails: curD });
      return next;
    });
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

  /**
   * 点格子 / 扫码：把笼位加入待提交（已在缓冲里则移出）；闸门同一道。
   *
   * @param keepIfPresent 已在缓冲里就**保持**、不要 toggle 掉。逐格编辑那条路要它 ——
   *        点格子既入缓冲区又开弹窗，「点开看一眼」不该把刚选好的条目摘掉。
   */
  const addEditPending = useCallback((cell: any, metaHint?: { label: string; shelveId: string; x: number; y: number; roomId: string | null }, keepIfPresent = false) => {
    const reason = editGateReason(cell);
    if (reason) { toast.error(reason); return; }
    const cageId = cageIdOfCell(cell);
    if (!cageId) return;
    if (editBatch.items.some(it => it.cageId === cageId)) {
      if (keepIfPresent) return;
      removeEditItem(cageId);
      return;
    }
    const meta = metaHint ?? itemMetaByCageId.get(cageId);
    if (!meta) { toast.error("该笼位缺少位置信息，无法加入待提交"); return; }
    patchPending("edit", (b) => upsertItem(b, { cageId, ...meta }));
    // 点格子只入缓冲、不自动弹抽屉 —— 唯一自动弹的时机是「切进这个模式」（见 switchMode）
  }, [editGateReason, cageIdOfCell, editBatch.items, itemMetaByCageId, removeEditItem, patchPending]);

  /**
   * 网格点格子（状态模式统一入口）—— 「拖色区」先把格子放进缓冲区，
   * 否则那条批量路没法用鼠标把人肉选进缓冲区；
   * **弹窗编辑不进缓冲区**：改动点一下就已经写盘了（2026-09-19 用户口径），
   * 再挂一个没有差异的条目只会让抽屉显示「待提交 N 个笼位」，点提交还什么都不做。
   */
  const handleEditCellClick = (sid: string, x: number, y: number) => {
    const c = findCellByKey(sid, x, y);
    if (!c) return;
    const reason = editGateReason(c);
    if (reason) { toast.error(reason); return; }
    if (editPointMode) { openEditCell(c as CageShelfCell, sid); return; }
    addEditPending(c, undefined, editPointMode);
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
   * 色区 / 明细区 / 严重程度区各认各的前缀，一个笼位可以同时挂几边的差异。
   */
  const handleEditZoneDrop = useCallback((cageIds: string[], zoneKey: string | null, fromZone: string | null): boolean => {
    const to = parseStatusZone(zoneKey);
    const from = parseStatusZone(fromZone);
    const toD = parseDetailZone(zoneKey);
    const fromD = parseDetailZone(fromZone);
    const toS = parseSeverityZone(zoneKey);
    const fromS = parseSeverityZone(fromZone);
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
      if (fromD) void applyEditDetail(cell, sid, fromD.itemCode, !fromD.on);
      if (toD) void applyEditDetail(cell, sid, toD.itemCode, toD.on);
      /* 严重程度互斥：从标记区被拖走（含拖到别的档）= 清空，再按落点设新值；从撤销区拖走无事可做。
         瘙痒按**落点那一档的勾选框**落（空档回落到页面偏好）。 */
      if (fromS) void applyEditSeverity(cell, sid, null, false);
      if (toS) void applyEditSeverity(cell, sid, toS.itemCode, toS.itemCode ? itchOnFor(toS.itemCode) : false);
      applied += 1;
    }
    // 陈旧的勾选项不算「没放成」，真正落地的有东西就可以清掉勾选
    return applied > 0;
  }, [pendingByMode, keyByCageId, applyEditAction, applyEditDetail, applyEditSeverity, itchOnFor]);

  /** 动作弹窗里点一个状态：has = 点之前是否已标记，决定这次是标记还是取消 */
  const toggleEditStatus = (cell: CageShelfCell, sid: string, action: CageBoxAction, has: boolean) => {
    void applyEditAction(cell, sid, action, !has);
  };


  /**
   * 特殊饲养明细：勾/取消一项 → 写编辑缓存，由同步 effect 派生进「待提交」，提交时整体覆盖写盘。
   *
   * 新建缓存条目时**先拉一次服务端表单值**播种动作集合：不拉的话动作集合是空的，
   * 面板会把「已标记的需特殊饲养」显示成未标记，而明细块的强绑定判据读的就是它 → 勾一下块就消失。
   */
  const toggleEditDetail = useCallback(async (cell: CageShelfCell, sid: string, itemCode: string) => {
    const ck = `${sid}:${cell.x}:${cell.y}`;
    let serverRows: CageInfoValueRow[] | null | undefined;
    if (!scanCache.has(ck)) {
      const cageId = cageIdOfCell(cell);
      serverRows = cageId ? await fetchCageInfoValues(cageId).catch(() => null) : null;
    }
    setScanCache((prev) => {
      const next = new Map(prev);
      const e = next.get(ck);
      const rows = serverRows ?? editFormValues;
      const initial = e?.initialDetails ?? detailCodesOfValues(rows);
      const cur = new Set(e?.currentDetails ?? initial);
      if (cur.has(itemCode)) cur.delete(itemCode); else cur.add(itemCode);
      const same = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((v) => b.has(v));
      if (e && same(cur, initial) && same(e.currentActions, e.initialActions)) {
        next.delete(ck);
      } else if (e) {
        next.set(ck, { ...e, initialDetails: initial, currentDetails: cur });
      } else {
        const srv = actionsFromFormValues(rows);
        next.set(ck, {
          cell, code: "", initialActions: new Set(srv), currentActions: new Set(srv),
          initialDetails: initial, currentDetails: cur,
        });
      }
      return next;
    });
  }, [cageIdOfCell, scanCache, editFormValues]);

  /**
   * 状态模式：把编辑缓存里的差异同步进 edit 批次（缓存的 currentActions 就是「目标状态全集」）。
   * 两条规则保证批次与缓存永不脱节：
   *   1) 缓存里**有**的笼位：按差异更新；改回原样只清差异，条目留在待提交（用户是显式暂存它的）；
   *   2) 缓存里**没有**的笼位：一律不许带差异 —— 缓存被删掉后批次若还留着差异，
   *      就成了「磁贴挂在色区里、网格却没颜色」的幽灵条目。
   */
  useEffect(() => {
    if (!editMode) return;
    // 弹窗编辑（点格子开弹窗）：改动即时写盘（见下面那条 effect），不进「待提交」
    if (editPointMode) return;
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
        /* 明细同理：只有真的改了才带目标集合；没改显式置 undefined（upsertItem 是合并，
           不显式覆盖旧的 details 会一直粘着）。 */
        const detailChanged = (e.initialDetails !== undefined || e.currentDetails !== undefined)
          && !((e.currentDetails ?? new Set()).size === (e.initialDetails ?? new Set()).size
            && [...(e.currentDetails ?? [])].every(v => (e.initialDetails ?? new Set<string>()).has(v)));
        const details = detailChanged ? [...(e.currentDetails ?? [])] : undefined;
        /* 健康异常严重程度（互斥单选）：只有真的改了才带上目标值，null = 清空，undefined = 本次不动。 */
        const severity = (e.currentSeverity ?? null) !== (e.initialSeverity ?? null)
          ? (e.currentSeverity || null)
          : undefined;
        /* 瘙痒（布尔子值）同理：只有真的改了才带，没改显式 undefined。 */
        const itch = Boolean(e.currentItch) !== Boolean(e.initialItch) ? Boolean(e.currentItch) : undefined;
        next = upsertItem(next, toAdd.length || toRemove.length
          ? { cageId, ...meta, shelveId: key.split(":")[0] || meta.shelveId, cageBoxCode: e.code, actions: toAdd, removedActions: toRemove, details, severity, itch }
          : { cageId, ...meta, actions: [], removedActions: [], details, severity, itch });
      }
      for (const it of next.items) {
        if (cached.has(it.cageId)) continue;
        if ((it.actions?.length ?? 0) > 0 || (it.removedActions?.length ?? 0) > 0
            || it.details !== undefined || it.severity !== undefined || it.itch !== undefined) {
          next = upsertItem(next, { ...it, actions: [], removedActions: [], details: undefined, severity: undefined, itch: undefined });
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
        // 特殊饲养明细（多选）与健康异常严重程度（单选）：整体覆盖写本地表单（undefined = 本次不动）
        if (it.details !== undefined) await saveStatusDetail(it.cageId, SPECIAL_DETAIL_CANONICAL, it.details);
        if (it.severity !== undefined) {
          await saveStatusDetail(it.cageId, HEALTH_SEVERITY_CANONICAL, it.severity ? [it.severity] : []);
        }
        if (it.itch !== undefined) {
          await saveStatusDetail(it.cageId, HEALTH_ITCH_CANONICAL, it.itch ? [HEALTH_ITCH_TRUE] : []);
        }
        for (const a of it.actions ?? []) await localEdit(it.cageId, cageBoxAction(a as CageBoxAction).statusField, true, it.cageBoxCode);
        for (const a of it.removedActions ?? []) await localEdit(it.cageId, cageBoxAction(a as CageBoxAction).statusField, false, it.cageBoxCode);
        rows.push({ cageId: it.cageId, ok: true });
      } catch (e) {
        rows.push({ cageId: it.cageId, ok: false, reason: e instanceof Error ? e.message : "操作失败" });
      }
    }
    return rows;
  }, []);

  /**
   * 弹窗编辑：缓存里一出现差异就**立刻写盘**，成功后把基线推平（initial = current）。
   *
   * 推平而不是删条目：网格底色由 currentActions 算，推平不影响观感；差异一消失，
   * 上面那条同步 effect 与抽屉的「待提交」就都不会再收它（弹窗模式下那两条路空转）。
   * 失败则把 current 回滚成 initial —— 宁可让用户看到颜色弹回去，也不留假颜色。
   */
  const directWriteKeys = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!editMode || !editPointMode) return;
    for (const [key, e] of scanCache) {
      const cageId = cageIdOfCell(e.cell);
      const meta = cageId ? itemMetaByCageId.get(cageId) : undefined;
      if (!cageId || !meta || directWriteKeys.current.has(key)) continue;
      const toAdd = [...e.currentActions].filter(a => !e.initialActions.has(a));
      const toRemove = [...e.initialActions].filter(a => !e.currentActions.has(a));
      const detailChanged = (e.initialDetails !== undefined || e.currentDetails !== undefined)
        && !((e.currentDetails ?? new Set()).size === (e.initialDetails ?? new Set()).size
          && [...(e.currentDetails ?? [])].every(v => (e.initialDetails ?? new Set<string>()).has(v)));
      const details = detailChanged ? [...(e.currentDetails ?? [])] : undefined;
      const severity = (e.currentSeverity ?? null) !== (e.initialSeverity ?? null)
        ? (e.currentSeverity || null) : undefined;
      const itch = Boolean(e.currentItch) !== Boolean(e.initialItch) ? Boolean(e.currentItch) : undefined;
      if (!toAdd.length && !toRemove.length && details === undefined && severity === undefined && itch === undefined) continue;
      directWriteKeys.current.add(key);
      void runEditPending([{
        cageId, ...meta,
        shelveId: key.split(":")[0] || meta.shelveId,
        cageBoxCode: e.code,
        actions: toAdd, removedActions: toRemove, details, severity, itch,
      }]).then((results) => {
        const ok = !!results[0]?.ok;
        setScanCache(prev => {
          const n = new Map(prev);
          const cur = n.get(key);
          if (!cur) return prev;
          if (ok) {
            /* 只推平**这次真的写进去**的那部分，不是「推平到 current」：
               写盘期间用户又点了别的状态时那份差异还没写，推平到 current 会把它悄悄抹掉。 */
            const base = new Set(cur.initialActions);
            for (const a of toAdd) base.add(a);
            for (const a of toRemove) base.delete(a);
            n.set(key, {
              ...cur,
              initialActions: base,
              initialDetails: details === undefined ? cur.initialDetails : new Set(details),
              initialSeverity: severity === undefined ? cur.initialSeverity : (severity ?? null),
              initialItch: itch === undefined ? cur.initialItch : !!itch,
            });
          } else {
            n.set(key, {
              ...cur,
              currentActions: new Set(cur.initialActions),
              currentDetails: new Set(cur.initialDetails ?? []),
              currentSeverity: cur.initialSeverity ?? null,
              currentItch: !!cur.initialItch,
            });
          }
          return n;
        });
        if (!ok) { toast.error(`保存失败：${results[0]?.reason ?? "未知原因"}`); return; }
        // 与批量提交后同款收尾：让服务端派生的那部分界面（角标、抽屉计数）跟上
        setClaimReloadKey(k => k + 1);
      }).finally(() => { directWriteKeys.current.delete(key); });
    }
  }, [scanCache, editMode, editPointMode, itemMetaByCageId, runEditPending, cageIdOfCell]);

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
    onToggleCell: handleEditCellClick,
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
          {/* 一棵树两种视图：只换 onlyBookmarked，不换组件 —— 切视图不卸载，展开与滚动位置都留着。
              「收藏」视图只画收藏过的房间（房间名后的 ☆ 切换），进视图自动展开第一个。 */}
          {!collapsed && <div className="cage-scroll flex-1 min-h-0 overflow-y-auto overflow-x-hidden rounded-student-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-1.5">
            <CampusTree tree={tree} exp={exp} search={search} onToggle={toggleNode} onOpenRoom={onOpenRoom} viewMode={viewMode} onOpenShelf={onOpenShelf} alertStatusesByShelf={new Map()} alertStatusesByRoom={new Map()}
              bookmark={{ bookmarkedRooms, bookmarkedShelves, onToggleBookmarkRoom: toggleRoom, onToggleBookmarkShelf: toggleBookmarkShelf, onlyBookmarked: leftView === "bookmarks" }} />
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
                  <button onClick={() => { setRequestsOpen(true); loadMyClaims(); }} className="flex items-center gap-1 rounded-student-sm px-2.5 py-1 text-[11px] font-semibold transition text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-text-primary)]" title="认领 / 分笼 / 转移 / 审核申请"><ClipboardList className="h-3 w-3" />我的申请</button>
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
                {editMode && <>
                  <span className="text-[10px] font-semibold text-[var(--app-color-text-tertiary)]">已选 {editBatch.items.length} 个笼位</span>
                  {/* 特殊饲养明细只能在动作弹窗里选 —— 逐格编辑模式下点格子就开弹窗，所以这条入口必须有 */}
                  <button
                    onClick={() => setEditPointMode(v => !v)}
                    title={editPointMode
                      ? "点格子：入缓冲区并打开动作弹窗（明细在里面选）"
                      : "点格子：只进/出缓冲区（不弹窗），拖到色区标记"}
                    className={`rounded-student-sm px-2 py-1 text-[11px] font-semibold transition ${editPointMode ? "bg-[var(--app-color-accent-hover)] text-white shadow-sm" : "border border-dashed border-[var(--app-color-border-default)] text-[var(--app-color-text-tertiary)]"}`}
                  >
                    {editPointMode ? "弹窗编辑" : "拖色区"}
                  </button>
                </>}
                {archiveMode && <>
                  <span className="text-[10px] font-semibold text-[var(--app-color-text-tertiary)]">已选 {archiveBatch.items.length} 个笼位</span>
                  <button onClick={() => { setArchiveBoxSelect(v => !v); archiveBoxAnchorRef.current = null; }}
                    className={`rounded-student-sm px-2 py-1 text-[11px] font-semibold transition ${archiveBoxSelect ? "bg-amber-500 text-white shadow-sm" : "border border-dashed border-[var(--app-color-border-default)] text-[var(--app-color-text-tertiary)]"}`}>
                    {archiveBoxSelect ? "框选中 · 点击两格" : "⬜ 矩形框选"}
                  </button>
                </>}
              </div>
              <div className="flex items-center gap-1">
                <div className="flex items-center gap-1 rounded-student-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-1">
                <button onClick={() => setScanOpen(true)} className="flex items-center gap-1 rounded-student-sm px-2 py-1 text-[10px] text-[var(--app-color-text-tertiary)] transition hover:bg-[var(--student-canvas-soft-2)] hover:text-[var(--app-color-text-primary)]" title="扫码定位"><Scan className="h-3 w-3" />扫码</button>
                <button onClick={() => setSpecialOpen(true)} className="flex items-center gap-1 rounded-student-sm px-2 py-1 text-[10px] text-[var(--app-color-text-tertiary)] transition hover:bg-[var(--student-canvas-soft-2)] hover:text-[var(--app-color-text-primary)]" title="特殊状态总览"><Activity className="h-3 w-3" />特殊状态</button>
                <button onClick={() => setLegend(v => !v)} className={`flex items-center gap-1 rounded-student-sm px-2 py-1 text-[10px] transition ${legend ? "bg-[var(--app-color-accent-hover)] text-white" : "text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-text-primary)]"}`}><Info className="h-3 w-3" />图例{legend ? " ▲" : " ▼"}</button>
                </div>
              </div>
            </div>
            {legend && <CageShelfLegend />}
            {opActive && <CageOpSelectBanner sel={opSel} allowBatch />}
          </div>

          <div className="cage-scroll flex-1 min-h-0 overflow-y-auto space-y-2" style={islandPadStyle}>
            {/* 主区两个 tab（筛选 / 收藏）**共用**：收藏视图只是左侧树换了过滤，右侧照样要点得进笼架，
                否则切到收藏右侧空白、点树没反应（2026-09-19 用户报）。 */}
            <>
              {/* ROOM MODE */}
              {viewMode === "room" && <>
                {!aRid && <div className="rounded-student-lg border border-dashed border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] h-full flex flex-col items-center justify-center text-center text-sm text-[var(--app-color-text-tertiary)]"><LayoutGrid className="h-10 w-10 mx-auto mb-3 opacity-20" />展开左侧目录，点击房间下的笼架<br /><span className="text-[11px]">点击笼架后加载该房间所有笼架详情</span></div>}
                {loading && <div className="rounded-student-lg border border-dashed border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-4 text-center text-sm text-[var(--app-color-text-tertiary)]">正在加载房间笼架（{details.length}）…</div>}
                {!loading && aRid && details.length === 0 && <div className="rounded-student-lg border border-amber-200/90 bg-amber-50/80 p-4 text-sm text-amber-900">当前房间暂无笼架数据</div>}
                {details.length > 0 && <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">{details.map((d, idx) => {
                  const sid = String(d.shelfMeta?.shelveId ?? "");
                  return <div key={sid || idx} id={`shelf-${sid}`}><ShelfGrid title={d.shelfMeta?.shelveName ?? `笼架 ${idx + 1}`} detail={d} loading={false} emptyHint="暂无笼架数据" alertMap={new Map()} claimMode={claimMode||divisionMode||archiveMode} poolCells={divisionMode?divisionPoolCells:poolCells} myClaimCageIds={confirmMode ? myLockedCageIds : undefined} selectable={claimMode||divisionMode||archiveMode} selectedCells={bufferedSelectedKeys} onToggleCell={claimMode ? handleClaimToggle : divisionMode ? handleDivisionToggle : archiveMode ? handleArchiveToggle : undefined} allocMode={claimMode||divisionMode||archiveMode} clickMode={claimMode || divisionMode || archiveMode ? "toggle" : undefined} onCellClick={(c: any) => handleGridCellClick(c, sid)} {...opGridProps} {...modeGlowProps} {...editGridProps} /></div>;
                })}</div>}
              </>}

              {/* SHELF MODE */}
              {viewMode === "shelf" && <div className="flex gap-3 h-full min-h-0">
                <div className="w-1/2 flex flex-col min-w-0">
                  {shelfLoading && <div className="flex-1 rounded-student-lg border border-dashed border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] grid place-items-center text-sm text-[var(--app-color-text-tertiary)]">加载笼架…</div>}
                  {!shelfLoading && !shelfDetail && <div className="flex-1 rounded-student-lg border border-dashed border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] flex flex-col items-center justify-center text-sm text-[var(--app-color-text-tertiary)]"><LayoutGrid className="h-10 w-10 mb-3 opacity-20" />点击左侧笼架<br /><span className="text-[11px]">选中后显示该笼架 8x10 笼位</span></div>}
                  {!shelfLoading && shelfDetail && <ShelfGrid title={shelfDetail.shelfMeta?.shelveName || "笼架"} detail={shelfDetail} loading={false} emptyHint="暂无数据" claimMode={claimMode||divisionMode||archiveMode} poolCells={divisionMode?divisionPoolCells:poolCells} myClaimCageIds={confirmMode ? myLockedCageIds : undefined} alertMap={new Map()} selectable={claimMode||divisionMode||archiveMode} selectedCells={bufferedSelectedKeys} onToggleCell={claimMode ? handleClaimToggle : divisionMode ? handleDivisionToggle : archiveMode ? handleArchiveToggle : undefined} allocMode={claimMode||divisionMode||archiveMode} clickMode={claimMode || divisionMode || archiveMode ? "toggle" : undefined} onCellClick={(c: any) => handleGridCellClick(c, String(shelfDetail.shelfMeta?.shelveId ?? ""))} {...opGridProps} {...modeGlowProps} {...editGridProps} />}
                </div>
                <div className="w-1/2 flex flex-col min-w-0">
                  {cell ? <CellDetailPanel cell={cell} opMarkByCageId={opMarkWithReservations} gridMeta={shelfDetail?.shelfMeta ?? null} shelveId={shelfId ?? ""} onClose={() => setCell(null)} onStartOp={(k, s) => { setClaimMode(false); setConfirmMode(false); setCell(null); setShelfId(null); void opSel.start(k, s); }} onChanged={() => setClaimReloadKey(k => k + 1)} canDivide={canDivide} /> :
                    <div className="flex-1 rounded-student-lg border border-dashed border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] flex flex-col items-center justify-center text-sm text-[var(--app-color-text-tertiary)]"><div className="text-4xl mb-3 opacity-20">📋</div>笼盒详情预备画面<br /><span className="text-[11px]">点击左侧笼位格子显示笼盒信息</span></div>}
                </div>
              </div>}
            </>

            {/* 收藏视图不再单独占一块说明：左侧树只列收藏项，右侧与筛选模式共用（点房间展开、点笼架进网格） */}
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
                {editActions.map(({ action: a, label, statusCode, statusField }) => {
                  const c = DEFAULT_COLORS[statusCode] ?? DEFAULT_COLORS.NORMAL;
                  const has = entry ? entry.currentActions.has(a) : serverActions.has(a);
                  const init = entry ? entry.initialActions.has(a) : serverActions.has(a);
                  const changed = has !== init;
                  /* 照片挂在**这一档状态**自己身上（key=表单字段名）：各传各的、
                     已标记但没拍过一眼看得出来，也不会一份照片摊进每个状态。 */
                  return (
                    <div key={a} className="rounded-student-md border-2 px-3 py-2"
                      style={{ borderColor: has ? c.border : "var(--app-color-border-default)", background: "var(--app-color-surface-container)" }}>
                      <button type="button" onClick={() => toggleEditStatus(editDialogCell, sid, a, has)}
                        className="flex w-full items-center gap-2 text-sm font-semibold transition hover:brightness-95">
                        {/* 色块预览：选中即用该状态的底色/描边，与网格上显示的色一致 */}
                        <span className="h-5 w-8 shrink-0 rounded border-2" style={{ backgroundColor: has ? c.bg : "#f1f5f9", borderColor: has ? c.border : "#cbd5e1" }} />
                        <span className="flex-1 text-left text-[var(--app-color-text-primary)]">{label}</span>
                        <span className="text-[11px]" style={{ color: changed ? "var(--student-warning)" : has ? c.border : "var(--app-color-text-tertiary)" }}>
                          {changed ? "已变更" : has ? "已标记" : "点击标记"}
                        </span>
                      </button>
                      <StatusPhotoStrip variant="student" label={label}
                        value={statusPhotos[statusField] ?? []}
                        onChange={(urls) => setPhotosFor(statusField, urls)} />
                    </div>
                  );
                })}
                {editActions.length === 0 && <div className="px-1 py-2 text-center text-[11px] text-[var(--app-color-text-tertiary)]">当前身份没有可标记的状态</div>}
              </div>
              {/* 特殊饲养明细：强绑定 —— 只在「需特殊饲养」开着时出现；与状态动作同款进「状态待提交」 */}
              {(() => {
                const sfOn = entry ? entry.currentActions.has("SPECIAL_BREEDING") : serverActions.has("SPECIAL_BREEDING");
                // 父状态的开关不在（本区/本身份没开放它）→ 细分状态也不出现（与 H5 同口径）
                const sfAvailable = editActions.some((a) => a.action === "SPECIAL_BREEDING");
                if (!sfAvailable || !sfOn || specialDetailOptions.length === 0) return null;
                const sel = entry?.currentDetails ?? detailCodesOfValues(editFormValues);
                return (
                  <div className="mt-2 rounded-student-md border-2 p-2.5" style={{ borderColor: "var(--app-color-border-default)", background: "var(--app-color-surface-container)" }}>
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-xs font-semibold text-[var(--app-color-text-primary)]">特殊饲养明细</span>
                      <span className="text-[10px] text-[var(--app-color-text-tertiary)]">可多选 · 随「需特殊饲养」开关</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {specialDetailOptions.map((o) => {
                        const on = sel.has(o.itemCode);
                        /* 明细也是独立的 statusCode（`SF_+item_code`），照片同样按它自己归档 */
                        const pk = detailPhotoKey(o.itemCode);
                        return (
                          <div key={o.itemCode} className="rounded-student-md border-2 px-2 py-1.5"
                            style={{ borderColor: on ? "var(--student-primary)" : "var(--app-color-border-default)", background: "var(--app-color-surface-container)" }}>
                            <button type="button" onClick={() => void toggleEditDetail(editDialogCell, sid, o.itemCode)}
                              className="text-[11px] font-semibold transition hover:brightness-95"
                              style={{ color: on ? "var(--student-primary)" : "var(--app-color-text-tertiary)" }}>
                              {on ? "✓ " : ""}{o.itemLabel}
                            </button>
                            <StatusPhotoStrip variant="student" label={o.itemLabel}
                              value={statusPhotos[pk] ?? []}
                              onChange={(urls) => setPhotosFor(pk, urls)} />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
              {/* 健康异常严重程度 + 瘙痒：强绑定 —— 只在「健康异常」开着时出现；互斥单选，同样进「状态待提交」 */}
              {(() => {
                const haOn = entry ? entry.currentActions.has("HEALTH_CHECK") : serverActions.has("HEALTH_CHECK");
                // 父状态的开关不在（本区/本身份没开放它）→ 细分也不出现（与明细同口径）
                const haAvailable = editActions.some((a) => a.action === HEALTH_CHECK_ACTION);
                if (!haAvailable || !haOn || severityOptions.length === 0) return null;
                const cur = entry?.currentSeverity ?? severityOfValues(editFormValues);
                const curItch = entry?.currentItch ?? itchOfValues(editFormValues);
                return (
                  <div className="mt-2 rounded-student-md border-2 p-2.5" style={{ borderColor: "var(--app-color-border-default)", background: "var(--app-color-surface-container)" }}>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-semibold text-[var(--app-color-text-primary)]">健康异常严重程度</span>
                      <span className="text-[10px] text-[var(--app-color-text-tertiary)]">单选 · 可勾瘙痒 · 随「健康异常」开关</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {severityOptions.map((o) => {
                        const on = cur === o.itemCode;
                        return (
                          <div key={o.itemCode} className="relative rounded-student-md border-2 px-2.5 py-1"
                            style={{ borderColor: on ? "var(--student-primary)" : "var(--app-color-border-default)" }}>
                            <button type="button"
                              onClick={() => void applyEditSeverity(editDialogCell, sid, on ? null : o.itemCode, on ? false : curItch)}
                              className="text-[11px] font-semibold transition hover:brightness-95"
                              style={{ color: on ? "var(--student-primary)" : "var(--app-color-text-tertiary)" }}>
                              {on ? "✓ " : ""}{o.itemLabel}
                            </button>
                            {/* 勾选框贴在本档右上角：勾上 = 该档 + 瘙痒 */}
                            <label className="absolute -right-1.5 -top-2 flex cursor-pointer items-center gap-0.5 rounded-full border px-1 text-[9px] font-semibold"
                              style={{
                                borderColor: "var(--app-color-border-default)",
                                background: "var(--app-color-surface-container)",
                                color: (on && curItch) ? "var(--student-primary)" : "var(--app-color-text-tertiary)",
                              }}
                              title={`勾上 = ${o.itemLabel} + ${HEALTH_ITCH_LABEL}`}>
                              <input type="checkbox" className="h-2.5 w-2.5"
                                style={{ accentColor: "var(--student-primary)" }}
                                checked={on && curItch}
                                onChange={() => void applyEditSeverity(editDialogCell, sid, o.itemCode, !(on && curItch))} />
                              {HEALTH_ITCH_LABEL}
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
              {/* 备注 + 写盘：照片已按状态各归各位，这里只管收尾（与状态/明细的「待提交」互不影响） */}
              <div className="mt-2 border-t border-[var(--app-color-border-default)] pt-2">
                <textarea value={actionNote} onChange={(e) => { setActionNote(e.target.value); setNoteDirty(true); }}
                  placeholder="备注（清空后保存即删除）..." rows={2}
                  className="w-full rounded-student-sm border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-2 py-1 text-[11px] text-[var(--app-color-text-primary)] resize-y" />
                <div className="mt-1.5 flex justify-end">
                  <button type="button" disabled={annotateSubmitting}
                    onClick={async () => {
                      const cageId = cageIdOfCell(editDialogCell);
                      if (!cageId) return;
                      setAnnotateSubmitting(true);
                      try {
                        await saveAnnotation(cageId);
                        toast.success("标注已保存");
                      } catch (e: any) {
                        toast.error("保存失败: " + (e?.message || ""));
                      } finally {
                        setAnnotateSubmitting(false);
                      }
                    }}
                    className="rounded-student-sm px-3 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
                    style={{ background: "var(--student-primary)" }}>
                    {annotateSubmitting ? "保存中..." : "💾 保存照片与备注"}
                  </button>
                </div>
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
          submitting={false}
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
      {/* 批量转移确认：CageOperationDialog 批量模式，一次列出全部配对、各收一张转移单 */}
      <CageOperationDialog
        open={batchConfirmOpen}
        op="transfer"
        source={null}
        picked={[]}
        pairs={opSel.pairs.filter((p) => p.targetId)}
        onClose={() => setBatchConfirmOpen(false)}
        onDone={handleBatchConfirmDone}
      />
      <MobileScanDialog open={scanOpen} onClose={() => setScanOpen(false)} onResult={handleScanResult} />
      <MobileSpecialStatusPanel open={specialOpen} onClose={() => setSpecialOpen(false)} apiFn={fetchStudentMobileSpecialStatusOverview} />
      <MyCageRequestsDialog
        open={requestsOpen}
        onClose={() => setRequestsOpen(false)}
        claims={myClaims}
        claimsLoading={claimsLoading}
        onReloadClaims={() => { void loadMyClaims(); setClaimReloadKey(k => k + 1); }}
        onCageDataChanged={() => { setClaimReloadKey(k => k + 1); void qc.invalidateQueries({ queryKey: ["cage-op", "markers"] }); }}
      />
      {/* 抽屉关着时，右边缘留一排书签标签（每个带缓冲的模式一枚），点谁切到谁并展开抽屉 */}
      {!drawerOpen && (
        <StudentModeTabs
          allowed={islandModes}
          counts={{ studentClaim: claimBatch.items.length, division: divisionBatch.items.length, edit: editBatch.items.length, archive: archiveBatch.items.length }}
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
      {/* 归档：缓冲抽屉（无目标区域）。学生只能归档本人占用的笼位，归属判定在后端 */}
      {drawerOpen && currentMode === "archive" && (
        <StudentModeDrawer
          title="归档待提交"
          items={archiveBatch.items}
          selected={bufferSelected}
          onToggle={(cageId) => setBufferSelected((p) => { const n = new Set(p); n.has(cageId) ? n.delete(cageId) : n.add(cageId); return n; })}
          onToggleAll={() => setBufferSelected((p) => (p.size > 0 && archiveBatch.items.every((i) => p.has(i.cageId)) ? new Set() : new Set(archiveBatch.items.map((i) => i.cageId))))}
          onRemove={(cageId) => patchPending("archive", (b) => removeItem(b, cageId))}
          onAssignSelected={() => {}}
          onUnassignAll={() => {}}
          onDrop={() => {}}
          cellOf={(it) => (it.x != null && it.y != null ? findCellByKey(it.shelveId, it.x, it.y) : undefined)}
          shelfNameOf={(it) => (details.find((d) => String(d.shelfMeta?.shelveId) === it.shelveId)?.shelfMeta?.shelveName) ?? shelfDetail?.shelfMeta?.shelveName}
          onSubmit={() => void submitArchive()}
          submitting={archiveSubmitting}
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
          /* 色区占主区、缓冲区让到右列 —— 与管理端状态模式同一套版式
             （色区带明细子区，挤在 190px 窄栏里太紧） */
          zonesMain
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
            <div className="shrink-0 space-y-1.5 border-b border-[var(--app-color-border-default)] p-2">
              {/* 子模式开关（弹窗编辑 / 拖色区）**放到抽屉顶部**：
                  它是这个模式的核心开关（特殊饲养明细只在弹窗里能选），原先只挂在页面顶部工具栏，
                  抽屉一打开就看不见了 —— 用户找不到「弹窗编辑」，等于找不到明细（2026-09-18 反馈）。 */}
              <button
                type="button"
                onClick={() => setEditPointMode((v) => !v)}
                title={editPointMode
                  ? "当前：点格子会打开动作弹窗（可选出特殊饲养明细）。点这里切成拖色区批量标记"
                  : "当前：点格子只进/出缓冲区。点这里切成弹窗编辑（可选出特殊饲养明细）"}
                className="w-full rounded-student-sm px-2 py-1 text-[11px] font-semibold transition bg-[var(--app-color-accent-hover)] text-white shadow-sm"
              >
                当前：{editPointMode ? "弹窗编辑（点格子开弹窗）" : "拖色区（点格子只进缓冲区）"}
                <span className="ml-1 opacity-80">· 点击切换</span>
              </button>
              <div className="text-[10px] leading-snug text-[var(--app-color-text-tertiary)]">
                拖笼位到对应色区即标记，拖到虚线区即撤销；「需特殊饲养」与其撤销卡里可展开各自的明细区
              </div>
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
