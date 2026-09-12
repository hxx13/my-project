/**
 * ============================================================================
 * 笼架管理主页面 — /console/admin/cage-shelves
 * ============================================================================
 *
 * 架构说明 (2026-08-03 重构):
 * 本文件仅保留顶层布局 + Inner 组件的核心业务逻辑。
 * 所有可复用模块已提取到 @/features/cage-shelf/ 下：
 *
 *   @/features/cage-shelf/constants.ts
 *     — CAGE_BOX_INFO_FIELD_ORDER, CAGE_BOX_INFO_LABEL, CAGE_TYPE_COLORS,
 *       CAGE_BOX_ACTIONS, cageBoxAction, actionsFromFormValues,
 *       displayPosition, formatCageDetailValue, nonEmptyText,
 *       CAMPUS_ORDER, CAMPUS_STYLES, TreeNode
 *
 *   @/features/cage-shelf/components/CellButton.tsx
 *     — CellButton (memo)  8×10 网格单格按钮，自解析颜色/状态/高亮
 *
 *   @/features/cage-shelf/components/ShelfGrid.tsx
 *     — ShelfGrid          单笼架 8×10 网格
 *     — BookmarkShelfGrid  收藏笼架网格（自取数据）
 *     — snapshotCellToShelfCell  快照数据 → CageShelfCell 转换
 *
 *   @/features/cage-shelf/components/CampusTree.tsx
 *     — buildTree          全量数据 → TreeNode 树
 *     — CampusTree          校区/区域/楼层/房间/笼架 递归树组件
 *
 *   @/features/cage-shelf/components/LocalDetailPanel.tsx
 *     — LocalDetailPanel   本地数据源笼位详情（照片/备注/历史/预览）
 *
 * ⚠️ 扩展规则（硬性）:
 *   - 新增模式 → 新建 useXxxMode.ts hook，不往 Inner 里堆状态
 *   - 新增组件 → 放入 features/cage-shelf/components/，本文件只 import
 *   - 新增常量 → 放入 features/cage-shelf/constants.ts
 *   - 本文件目标 ≤ 400 行，超出即违规
 *
 * 页面模式 (pageMode):
 *   "view"    — 查看模式（默认），支持全房间/单笼架切换
 *   "allocate"— 分配模式，勾选笼位 → 选择AUP → 分配/取消
 *   "booking" — 预约模式，左侧预约数据 + 右侧笼架预览
 *
 * 功能模式（可与 view 叠加）:
 *   editMode  — 编辑模式，扫码/手动录入笼盒，标记分笼/特殊饲养/健康检查
 *   confirmMode — 扫码确认模式，扫笼位ID判定是否到位并确认
 *
 * 数据源 (dataSource):
 *   "aro"   — 直连 ARO 系统（生产）
 *   "local" — 本地数据库（离线/异步投递）
 * ============================================================================
 */

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { authHttp } from "@/api/core/authHttp";
import { hasMinRole } from "@/features/auth/roleAccess";
import { isStudentAccount } from "@/features/auth/postLoginNavigation";
import { authStorage } from "@/features/auth/authStorage";
import { toAdminRoutePath } from "@/features/admin/buildAdminNavModel";
import toast from "react-hot-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LayoutGrid, Star, Search, Info, PanelLeftClose, PanelLeft, Loader2, Scan, Check, X, QrCode, ImagePlus, RefreshCw, Settings2, ChevronDown } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import {
  fetchCageShelfDetail, fetchLocalPipelineProgress, refreshCellDetail,
  type CageShelfCell, type CageShelfDetail,
  fetchBookmarks, toggleBookmarkApi,
  type BookmarkEntry,
  fetchFullTree, type CageShelfTreeNode,
  fetchPersistedAlerts, type PersistedAlert,
  fetchSnapshotBatches, type SnapshotBatch,
  fetchRealtimeRefresh, forceRealtimeRefresh, type RealtimeRefreshResponse,
  fetchAllocationAups, type AupItem,
  assignCages, cancelCageAssignment,
  fetchBookingRooms, type BookingRoom, syncBookingData, fetchBookingRoomAups,
  executeCageBoxAction, type CageBoxAction, type CageBoxActionRequest,
  cancelCageBoxColor, ACTION_CANCEL_COLOR, type CancelColor,
  updateAnimalCage, type AnimalCageUpdatePayload,
  fetchCellIndexByShelf, fetchLocalShelfGridByShelveId, localAllocate, localCancelAllocate, localEdit, localAnnotate, fetchLocalAnnotate, type CageCellIndexEntry, type PoolCell,
  syncLocalCagePipeline, localPipelineStepLabel, syncAllCellIds, fetchSyncLocks, saveCageDivision,
  searchPersonnelByKeyword,
  fetchCageModeVisible,
  fetchCageOpMarkers, lookupCode, locateTargetOf, adminConfirmClaim, archiveCage, reconcileCageOccupancy, type CodeLookupResult,
  assignBatchCages, submitCageTransfer,
} from "@/api/domains/cageShelf.api";
import { fetchActiveCageReservations } from "@/api/domains/animalOrderCage.api";
import { fetchMyGroupMembers } from "@/api/domains/referenceData.api";
import { uploadSingleImage } from "@/api/domains/upload.api";
import { AdminButton } from "@/components/admin/AdminButton";
import SearchSelect, { type SearchOption } from "@/components/cage/SearchSelect";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { Portal } from "@/components/Portal";
import CageBookingPanel from "@/features/cage-shelf/components/CageBookingPanel";
import AupSearchBar from "@/features/cage-shelf/components/AupSearchBar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import CageShelfLegend from "@/features/cage-shelf/components/CageShelfLegend";
import LocalDetailPanel from "@/features/cage-shelf/components/LocalDetailPanel";
import CageOperationDialog from "@/features/cage-shelf/components/CageOperationDialog";
import CageOpSelectBanner from "@/features/cage-shelf/components/CageOpSelectBanner";
import BatchTransferPanel from "@/features/cage-shelf/components/BatchTransferPanel";
import CageModeIsland, { modeBorderColor, useIslandVariant, type CageModeKey } from "@/features/cage-shelf/components/CageModeIsland";
import { resolveCageType, groupKeyOf } from "@/features/cage-shelf/components/CageCellOverlays";
import { scopeAupsByRoom } from "@/features/cage-shelf/allocationAupScope";
import { useCageOpSelect, buildCageOpMarks, mergeReservationMarks, type CageOpLabel } from "@/features/cage-shelf/useCageOpSelect";
import CageModeDrawer from "@/features/cage-shelf/components/CageModeDrawer";
import PendingBufferList from "@/features/cage-shelf/components/PendingBufferList";
import BufferTargetZones, { type BufferZone, type EditCacheEntry } from "@/features/cage-shelf/components/BufferTargetZones";
import CageModeTabs from "@/features/cage-shelf/components/CageModeTabs";
import { modeMetaOf } from "@/features/cage-shelf/components/CageModeIsland";
import {
  applyResults,
  batchOf,
  clearBatch,
  groupItems,
  moveItem,
  removeItem,
  setParams,
  summarize,
  upsertItem,
  type PendingBatch,
  type PendingByMode,
  type PendingItem,
  type SubmitResult,
} from "@/features/cage-shelf/pendingBatch";
import CageHistoryModal from "@/features/cage-shelf/components/CageHistoryModal";
import CageSettingsCenter from "@/features/cage-shelf/components/CageSettingsCenter";
import CageFormFill from "@/features/cage-shelf/components/CageFormFill";
import { ShelfGrid, BookmarkShelfGrid } from "@/features/cage-shelf/components/ShelfGrid";
import { buildTree, CampusTree } from "@/features/cage-shelf/components/CampusTree";
import { displayPosition, formatCageDetailValue, CAGE_BOX_INFO_LABEL, CAGE_BOX_INFO_FIELD_ORDER, CAGE_BOX_ACTIONS, CAGE_BOX_ACTION_LIST, cageBoxAction, actionsFromFormValues, actionsFromCageBoxInfo, statusPhotoKeys, allocSelectVerdict, ALLOC_CANCEL_ZONE, allocZoneReject, statusZoneKey, parseStatusZone } from "@/features/cage-shelf/constants";
import { fetchCageInfoValues, type CageInfoValueRow } from "@/features/cage-shelf/api/cageForm.api";
import { useCageColors, DEFAULT_COLORS } from "@/features/cage-shelf/components/CageColorContext";
import CageScanProgressBanner from "@/features/cage-shelf/components/CageScanProgressBanner";
import MobileScanDialog from "@/pages/mobile/MobileScanDialog";
import { CageColorProvider } from "@/features/cage-shelf/components/CageColorContext";
import { SyncLockProvider, useSyncLock } from "@/features/cage-shelf/components/SyncLockContext";

import { appConfirm } from "@/lib/appDialog";
export default function AdminCageShelfPage(){return<CageColorProvider><Inner/></CageColorProvider>;}
type ShelfTab="bookmarks"|"filter";

/** 两个状态动作集是否相同（顺序无关）—— 判断「改回原样」用 */
const sameActions=(a:Set<CageBoxAction>,b:Set<CageBoxAction>)=>a.size===b.size&&[...a].every(x=>b.has(x));

/* ==================================================================
 * Inner — 核心业务组件
 * 包含所有页面交互逻辑：状态管理 / 模式切换 / API 调用 / JSX 渲染
 *
 * 当前状态声明较多（~70行），后续新增模式请提取到独立 hook
 * 推荐结构：hooks/useCageShelfState.ts / useAllocateMode.ts / useEditMode.ts …
 * ================================================================== */
function Inner(){
  // ═══════════════════════════════════════════════════════════
  //  STATE — 基础状态
  // ═══════════════════════════════════════════════════════════
  const { colors: cageStatusColors } = useCageColors();
  const nav=useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const[tab,setTab]=useState<ShelfTab>("filter");
  const[aRid,setARid]=useState("");const[aRname,setARname]=useState("");
  const[details,setDetails]=useState<CageShelfDetail[]>([]);
  const[loading,setLoading]=useState(false);
  const[cell,setCell]=useState<CageShelfCell|null>(null);
  const[shelfId,setShelfId]=useState<string|null>(null);
  const[exp,setExp]=useState<Set<string>>(new Set());

  // ═══════════════════════════════════════════════════════════
  //  STATE — 分配模式 (allocate)
  // ═══════════════════════════════════════════════════════════
  /* ---- 分配模式 ---- */
  // 视角判定三端统一：只有「学生」「教职工」两个视角，不按 STAFF/SENIOR 阈值分级。
  // 教职工账号即使 role 偏低也应拿到教职工视角，故按账号来源判定而非角色等级。
  const canEdit = useMemo(() => !isStudentAccount(), []);
  const isSuperAdmin = useMemo(() => hasMinRole(authStorage.getRole(), "SUPER_ADMIN"), []);
  // 设置中心入口：ADMIN 起可见（分笼/转移审核开关等业务配置由管理员维护，不再限超管）
  const canOpenSettings = useMemo(() => hasMinRole(authStorage.getRole(), "ADMIN"), []);
  // 平台所有者：与系统内其它平台管理者级入口同口径（hasMinRole(role, "PLATFORM_OWNER")）
  const isPlatformOwner = useMemo(() => hasMinRole(authStorage.getRole(), "PLATFORM_OWNER"), []);
  // 可见模式（按身份），null = 尚未加载；加载失败回退到 canEdit 全量。
  const [visibleModes, setVisibleModes] = useState<string[] | null>(null);
  useEffect(() => {
    fetchCageModeVisible().then(r => setVisibleModes(r.modes)).catch(() => setVisibleModes(null));
  }, []);
  // 模式下拉过滤：SUPER_ADMIN 看全部；否则按后端下发的可见模式收口。
  const allowedModeKeys = useMemo(() => {
    if (isSuperAdmin) return ["view","allocate","booking","edit","confirm","archive","reserve","record","division"];
    if (visibleModes) return visibleModes;
    return canEdit ? ["view","allocate","booking","edit","confirm","archive","reserve","record","division"] : ["view"];
  }, [isSuperAdmin, visibleModes, canEdit]);
  const[localPipelineSyncing,setLocalPipelineSyncing]=useState(false);
  const[pageMode,setPageMode]=useState<"view"|"allocate"|"booking">("view");
  const[selectedCells,setSelectedCells]=useState<Set<string>>(new Set());
  const anchorCellRef=useRef<{shelveId:string;x:number;y:number}|null>(null); // Shift+Click 区间选择锚点
  const[boxSelectMode,setBoxSelectMode]=useState(false); // 矩形框选模式：点击两格自动框选
  const boxSelectAnchorRef=useRef<{shelveId:string;x:number;y:number}|null>(null); // 框选模式第一格锚点
  const shiftHintShownRef=useRef(false); // 首次勾选时弹出 Shift 框选提示
  const[realtimeMeta,setRealtimeMeta]=useState<{fromRealtime:boolean;cachedAt:string}|null>(null);
  const[allocSubmitting,setAllocSubmitting]=useState(false);
  // ═══════════════════════════════════════════════════════════
  //  STATE — 编辑模式 (edit)
  // ═══════════════════════════════════════════════════════════
  // ── 编辑模式 ──
  const[editMode,setEditMode]=useState(false);
  /**
   * 状态模式两种改法（抽屉标题右侧的切换按钮）：
   *   false = 拖色区：点格子攒进「待提交」，拖到色彩区标记，最后统一提交（走缓存）
   *   true  = 直接改：点格子开原状态弹窗，弹窗里点一下立刻写服务端（不走缓存）
   */
  const[editDirect,setEditDirect]=useState(false);
  /** 只有「拖色区」才谈得上攒着提交 */
  const editStaged = editMode && !editDirect;
  /**
   * 「加入待提交」的转发 ref：确认/归档的点击处理函数声明在待提交状态之前，
   * 直接引用会 TDZ 报错；用 ref 转发，避免把一大块状态搬来搬去。
   */
  const addPendingRef = useRef<(cageId: string, extra?: Partial<PendingItem>) => void>(() => {});
  /** 矩形框选一次性入缓冲（与 addPendingRef 同理，供声明在前的 toggle 处理函数调用） */
  const addRangeRef = useRef<(mode: string, shelveId: string, ax: number, ay: number, bx: number, by: number, accept: (c: unknown) => boolean) => void>(() => {});
  const[scanCache,setScanCache]=useState<Map<string,{cell:CageShelfCell;code:string;initialActions:Set<CageBoxAction>;currentActions:Set<CageBoxAction>;images:string[];notes:string}>>(new Map());
  const[lastScannedKey,setLastScannedKey]=useState<string|null>(null);
  const[actionSubmitting,setActionSubmitting]=useState(false);
  // ═══════════════════════════════════════════════════════════
  //  STATE — 扫码确认模式 (confirm)
  // ═══════════════════════════════════════════════════════════
  // ── 扫码确认模式 ──
  const[confirmMode,setConfirmMode]=useState(false);
  const[dataSource,setDataSource]=useState<"aro"|"local">("local"); // 默认本地
  const[scanLockOpen,setScanLockOpen]=useState(false);
  const[scanLockTarget,setScanLockTarget]=useState<{sid:string;x:number;y:number}|null>(null);
  const[editDialogCell,setEditDialogCell]=useState<CageShelfCell|null>(null);
  const[editDialogShelfId,setEditDialogShelfId]=useState<string>("");
  const[editFormValues,setEditFormValues]=useState<CageInfoValueRow[]|null>(null);
  const[actionPhotos,setActionPhotos]=useState<string[]>([]);
  const[actionNote,setActionNote]=useState("");
  const[actionUploading,setActionUploading]=useState(false);
  const[editHistory,setEditHistory]=useState<any[]>([]);
  const[detailReloadKey,setDetailReloadKey]=useState(0);
  const[confirmLookup,setConfirmLookup]=useState<CodeLookupResult|null>(null);
  const[confirmSubmitting,setConfirmSubmitting]=useState(false);
  const[archiveMode,setArchiveMode]=useState(false);
  const[reserveMode,setReserveMode]=useState(false);
  const[recordMode,setRecordMode]=useState(false);
  const[divisionMode,setDivisionMode]=useState(false);
  /** 当前模式（模式布尔 → 模式 key）。放最前面：待提交缓冲和各模式点击处理都要用它。 */
  const currentMode: "view"|"allocate"|"booking"|"edit"|"confirm"|"archive"|"reserve"|"record"|"division" = editMode?"edit":confirmMode?"confirm":archiveMode?"archive":reserveMode?"reserve":recordMode?"record":divisionMode?"division":pageMode==="allocate"?"allocate":pageMode==="booking"?"booking":"view";
  // ── 多模式「待提交」抽屉的状态：操作先在抽屉里攒着，最后一次性提交 ──
  const [pendingByMode, setPendingByMode] = useState<PendingByMode>({});
  const [pendingBusy, setPendingBusy] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(false);
  const patchPending = useCallback((m: string, fn: (b: PendingBatch) => PendingBatch) => {
    setPendingByMode((prev) => ({ ...prev, [m]: fn(batchOf(prev, m)) }));
  }, []);
  const[recordTarget,setRecordTarget]=useState<string|null>(null);
  const[settingsOpen,setSettingsOpen]=useState(false);

  // 弹窗A 打开时从 /local/annotate 加载备注和状态照片（不能用 onOpenChange，Radix 只在用户关闭时触发）
  useEffect(()=>{
    if(!editDialogCell) return;
    setActionPhotos([]); setActionNote("");
    const cageId=String((editDialogCell as any).id??(editDialogCell as any).animalCageId??"");
    if(!cageId) return;
    authHttp.get(`/local/annotate/${cageId}`).then(r=>{
      if(r.data?.success){
        const d=r.data.data;
        if(d.statusPhotos){
          try{const sp=typeof d.statusPhotos==="string"?JSON.parse(d.statusPhotos):d.statusPhotos;
            // 加载标注文本（_note 非数组，单独提取）
            if(typeof sp._note==="string") setActionNote(sp._note);
            else setActionNote("");
            // 加载所有 key 的照片（跳过 _note 字符串）
            const all:string[]=[];
            for(const k of Object.keys(sp)){if(k!=="_note" && Array.isArray(sp[k]))all.push(...sp[k]);}
            if(all.length>0)setActionPhotos(all);else setActionPhotos([]);
          }catch{setActionNote("");setActionPhotos([]);}
        }else{setActionNote("");setActionPhotos([]);}
      }
    }).catch(()=>{});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[editDialogCell]);

  // 十字交叉高亮坐标（编辑模式 lastScannedKey + 扫码定位 scanLockTarget）
  const highlightCross=useMemo(()=>{
    if(scanLockTarget) return {crossSid:scanLockTarget.sid,crossX:scanLockTarget.x,crossY:scanLockTarget.y};
    if(!lastScannedKey)return{};
    const parts=lastScannedKey.split(":");
    if(parts.length===3)return{crossSid:parts[0],crossX:Number(parts[1]),crossY:Number(parts[2])};
    return{};
  },[lastScannedKey,scanLockTarget]);
  // ═══════════════════════════════════════════════════════════
  //  STATE — 预约模式 (booking)
  // ═══════════════════════════════════════════════════════════
  /* ---- 预约模式 ---- */
  const[bookingRooms,setBookingRooms]=useState<BookingRoom[]>([]);
  const[bookingRoom,setBookingRoom]=useState<BookingRoom|null>(null);
  const[bookingLoading,setBookingLoading]=useState(false);
  const[bookingSyncing,setBookingSyncing]=useState(false);

  // 加载预约房间列表（本地优先，全量，前端按 roomId 匹配）
  const loadBookingRooms=useCallback(async()=>{
    setBookingLoading(true);
    try{const r=await fetchBookingRooms(1,200);const list=r?.data?.list??[];setBookingRooms(list);}
    catch{setBookingRooms([]);}
    finally{setBookingLoading(false);}
  },[]);

  // 手动同步：从 ARO 拉取预约数据落本地，成功后刷新列表
  const handleBookingSync=useCallback(async()=>{
    setBookingSyncing(true);
    try{
      const r=await syncBookingData();
      toast.success(`同步完成：${r.rooms} 房间 / ${r.aups} 分配`);
      await loadBookingRooms();
    }catch(e:any){toast.error(e?.message||"同步失败");}
    finally{setBookingSyncing(false);}
  },[loadBookingRooms]);

  // booking 模式下进入房间时加载数据
  useEffect(()=>{
    if(pageMode==="booking"){loadBookingRooms();}
  },[pageMode,loadBookingRooms]);

  // 当 aRid 变化且 booking 模式，匹配对应房间
  useEffect(()=>{
    if(pageMode!=="booking"||!aRid){setBookingRoom(null);return;}
    const found=bookingRooms.find(r=>String(r.roomId)===String(aRid))??null;
    setBookingRoom(found);
  },[aRid,bookingRooms,pageMode]);

  // ═══════════════════════════════════════════════════════════
  //  DATA — 数据加载 (tree / alerts / scan / bookmarks)
  // ═══════════════════════════════════════════════════════════
  /* ---- AUP 搜索（独立组件 AupSearchBar） ---- */
  const{data:aupList=[]}=useQuery({queryKey:["allocationAups"],queryFn:fetchAllocationAups,staleTime:30*60*1000,enabled:pageMode==="allocate"||reserveMode});

  // Static tree — fetched once, never refetched
  const emptyTree = useMemo(() => [] as CageShelfTreeNode[], []);
  const{data:fullTree=emptyTree}=useQuery({
    queryKey:["cageShelfFullTree"],
    queryFn:fetchFullTree,
    staleTime:10*60*1000,
  });
  const tree=useMemo(()=>buildTree(fullTree),[fullTree]);

  // 首屏默认展开前两级（校区 + 区域/楼层）
  const expInited=useRef(false);
  useEffect(()=>{
    if(expInited.current||tree.length===0)return;
    const keys=new Set<string>();
    for(const c of tree){keys.add(c.key);for(const n of c.children){keys.add(n.key);}}
    setExp(keys);
    expInited.current=true;
  },[tree]);

  // Room-id → shelveIds map from tree data (for loading shelf details)
  const roomShelveMap=useMemo(()=>{
    const m=new Map<string,{shelveId:string;shelveName:string}[]>();
    for(const r of fullTree){
      const rid=String(r.roomId??"");if(!rid)continue;
      if(!m.has(rid))m.set(rid,[]);
      m.get(rid)!.push({shelveId:String(r.shelveId??""),shelveName:r.shelveName||String(r.shelveId)});
    }
    return m;
  },[fullTree]);
  const[search,setSearch]=useState("");
  const[legend,setLegend]=useState(false);
  const[collapsed,setCollapsed]=useState(false);
  const[viewMode,setViewMode]=useState<"room"|"shelf">("room");
  const[shelfDetail,setShelfDetail]=useState<CageShelfDetail|null>(null);
  const[shelfLoading,setShelfLoading]=useState(false);
  // 分配模式：只显示当前房间笼架里实际存在的 AUP（按 aup_number 过滤），避免满世界找
  const roomAupNumbers = useMemo(() => {
    const s = new Set<string>();
    const add = (d: CageShelfDetail | null) => {
      for (const c of d?.grid ?? []) {
        const a = (c as any).aupNumber ?? (c as any).detail?.aupNumber;
        if (a) s.add(String(a));
      }
    };
    for (const d of details) add(d);
    add(shelfDetail);
    return s;
  }, [details, shelfDetail]);
  /**
   * 预约模式给房间绑定的 AUP 也算「本房间相关 AUP」。
   * 只在预约里保存、还没分配到任何笼位的 AUP 不在 grid.aupNumber 里，
   * 若只按网格过滤就会被藏掉 —— 分配时想用它反而找不到。
   */
  const [bookedRoomAupNos, setBookedRoomAupNos] = useState<Set<string>>(new Set());
  const loadBookedRoomAupNos = useCallback(async () => {
    if (!aRid) { setBookedRoomAupNos(new Set()); return; }
    try {
      const r = await fetchBookingRoomAups(aRid, 1, 200);
      const nos = (r?.data ?? []).map((x) => String(x.registerNumber || "")).filter(Boolean);
      setBookedRoomAupNos(new Set(nos));
    } catch {
      /* 读不到就维持原网格口径，不额外放宽 */
    }
  }, [aRid]);
  useEffect(() => { void loadBookedRoomAupNos(); }, [loadBookedRoomAupNos]);
  const allocAupList = useMemo(
    () => scopeAupsByRoom(aupList, roomAupNumbers, bookedRoomAupNos),
    [aupList, roomAupNumbers, bookedRoomAupNos],
  );
  const reserveAupGroupNames = useMemo(() => {
    const byAup = new Map<string, string>();
    for (const a of allocAupList) if (a.registerNo && a.projectGroupName) byAup.set(a.registerNo, a.projectGroupName);
    const s = new Set<string>();
    const add = (d: CageShelfDetail | null, sid: string) => {
      for (const c of d?.grid ?? []) {
        const key = `${sid}:${c.x}:${c.y}`;
        if (!selectedCells.has(key)) continue;
        const aup = (c as any).aupNumber ?? (c as any).detail?.aupNumber;
        if (aup && byAup.has(String(aup))) s.add(byAup.get(String(aup))!);
      }
    };
    for (const d of details) add(d, String(d.shelfMeta?.shelveId ?? ""));
    if (shelfDetail) add(shelfDetail, String(shelfDetail.shelfMeta?.shelveId ?? ""));
    return Array.from(s);
  }, [selectedCells, details, shelfDetail, allocAupList]);
  const cellAtKey = useMemo(() => {
    const m = new Map<string, any>();
    const add = (d: CageShelfDetail | null) => {
      const sid = String(d?.shelfMeta?.shelveId ?? "");
      for (const c of d?.grid ?? []) m.set(`${sid}:${c.x}:${c.y}`, c);
    };
    for (const d of details) add(d);
    if (shelfDetail) add(shelfDetail);
    return m;
  }, [details, shelfDetail]);

  /* ---- 分笼 / 转移：选位模式（复用主网格高亮 + 多选）---- */
  const opSel = useCageOpSelect();
  const opActive = opSel.active;
  const qc = useQueryClient();
  /** 待审分笼/转移的中间态（教职工看到全部待审，学生只看到自己的） */
  const { data: pendingOps = [] } = useQuery({
    queryKey: ["cage-op", "markers"],
    queryFn: fetchCageOpMarkers,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });
  const opMarkByCageId = useMemo(() => buildCageOpMarks(pendingOps), [pendingOps]);
  /**
   * 活跃笼位预定（动物订购锁的笼位）：也走同一套中间态标记渲染，
   * 让「这个空笼位已经许给别人了」在网格上可见，不必进订购页才知道。
   * 与学生端笼架页共用 mergeReservationMarks —— 两端的颜色/文案不会各写各的。
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
  const cageIdOfCell = useCallback((c: any) => String((c as any)?.id ?? (c as any)?.animalCageId ?? (c as any)?.detail?.animalCageId ?? ""), []);
  /** cageId → sid:x:y（把选中的目标映射回网格的 selectedCells） */
  const keyByCageId = useMemo(() => {
    const m = new Map<string, string>();
    for (const [k, c] of cellAtKey) {
      const id = cageIdOfCell(c);
      if (id) m.set(id, k);
    }
    return m;
  }, [cellAtKey, cageIdOfCell]);
  const opSelectedCells = useMemo(() => {
    const s = new Set<string>();
    for (const id of opSel.selected) {
      const k = keyByCageId.get(id);
      if (k) s.add(k);
    }
    return s;
  }, [opSel.selected, keyByCageId]);
  /**
   * 分配/预定/划分：点击即进/出待提交缓冲，不再写 selectedCells 状态。
   * 网格上的「已选中」标记（绿圈 + 蓝边）于是要**从缓冲反查**，否则点完只有工具栏计数在动。
   */
  const pendingSelectedCells = useMemo(() => {
    const s = new Set<string>();
    for (const it of batchOf(pendingByMode, currentMode).items) {
      const k = keyByCageId.get(it.cageId);
      if (k) s.add(k);
    }
    return s;
  }, [pendingByMode, currentMode, keyByCageId]);
  const handleOpToggle = useCallback((sid: string, x: number, y: number) => {
    const id = cageIdOfCell(cellAtKey.get(`${sid}:${x}:${y}`));
    if (id) opSel.toggle(id);
  }, [cellAtKey, cageIdOfCell, opSel.toggle]);

  /* ---- 批量转移：源多选 → 目标按序配（位置即配对，颜色可视化）---- */
  const shelfMetaBySid = useMemo(() => {
    const m = new Map<string, any>();
    const put = (d: CageShelfDetail | null) => {
      const sid = String(d?.shelfMeta?.shelveId ?? "");
      if (sid) m.set(sid, d?.shelfMeta);
    };
    for (const d of details) put(d);
    put(shelfDetail);
    return m;
  }, [details, shelfDetail]);
  /** 选中那一刻就记下位置，跨房间后也能在面板里显示来源 */
  const labelOfCell = useCallback((sid: string, c: any): CageOpLabel | undefined => {
    if (!c) return undefined;
    const meta = shelfMetaBySid.get(sid);
    return {
      position: String(c.position ?? ""),
      where: [meta?.campusName, meta?.roomName, meta?.shelveName].filter(Boolean).join(" / "),
    };
  }, [shelfMetaBySid]);
  const handleBatchToggle = useCallback((sid: string, x: number, y: number) => {
    const cell = cellAtKey.get(`${sid}:${x}:${y}`);
    const id = cageIdOfCell(cell);
    if (!id) return;
    if (opSel.phase === "sources") opSel.toggleBatchSource(id, labelOfCell(sid, cell), groupKeyOf(cell ?? {}));
    else opSel.toggleBatchTarget(id);
  }, [cellAtKey, cageIdOfCell, opSel.phase, opSel.toggleBatchSource, opSel.toggleBatchTarget, labelOfCell]);
  /**
   * 批量转移的源池：只有「饲养中」且与已选源**同课题组**的笼位可点。
   * 先选一个源后，池自动收窄到该组，混组根本点不进去（后端也会再拦一道）。
   */
  const batchSourcePool = useMemo(() => {
    const m = new Map<string, any>();
    for (const [, c] of cellAtKey) {
      const id = cageIdOfCell(c);
      if (!id) continue;
      if (resolveCageType(c) !== 3) continue;
      if (opSel.batchGroup && groupKeyOf(c) !== opSel.batchGroup) continue;
      m.set(id, c);
    }
    return m;
  }, [cellAtKey, cageIdOfCell, opSel.batchGroup]);
  const batchSelectedCells = useMemo(() => {
    const ids = opSel.phase === "sources" ? opSel.sourceOrder : opSel.targetOrder;
    const s = new Set<string>();
    for (const id of ids) {
      const k = keyByCageId.get(id);
      if (k) s.add(k);
    }
    return s;
  }, [opSel.phase, opSel.sourceOrder, opSel.targetOrder, keyByCageId]);
  /** 定位到某笼位：切房间 + 滚到该笼架（跨房间配对时在网格上找到它） */
  // 声明位置见下方 expandToRoom 之后（依赖它）

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
      } catch (e: any) {
        failed.push(`${p.sourceLabel?.position ?? p.sourceId}：${e?.message || "失败"}`);
      }
    }
    setBatchSubmitting(false);
    const msg = [
      `已完成 ${done} 个笼位`,
      toReview > 0 ? `${toReview} 个已提交待审核` : "",
      failed.length > 0 ? `${failed.length} 个失败：${failed.slice(0, 3).join("；")}${failed.length > 3 ? "…" : ""}` : "",
    ].filter(Boolean).join("，");
    if (failed.length === 0) toast.success(msg); else toast.error(msg, { duration: 8000 });
    opSel.cancel();
    setDetailReloadKey(k => k + 1);
    void qc.invalidateQueries({ queryKey: ["cage-op", "markers"] });
  }, [opSel, submitCageTransfer, qc]);

  /** 选位模式下覆盖网格的选择类 props（展开在最后，优先级最高） */
  const opGridProps = {
    opMarkerByCageId: opMarkWithReservations,
    ...(opActive ? (opSel.batch ? {
      selectable: true,
      selectedCells: batchSelectedCells,
      onToggleCell: handleBatchToggle,
      allocMode: true,
      clickMode: "toggle" as const,
      // 两阶段都用绿环标「可点」，配对色叠在上面表示「已配成一对」
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
      // 选位期间点非目标格不应弹详情，避免把源笼位详情顶掉
      onCellClick: undefined,
    }) : {}),
  };
  const [configMode, setConfigMode] = useState<"auto"|"manual"|"off">("auto");
  const [selectedBatchId, setSelectedBatchId] = useState<string>("");
  const { data: batchList = [] } = useQuery({ queryKey: ["snapshotBatches"], queryFn: fetchSnapshotBatches, staleTime: 60_000 });
  // 模式切换时快照锁定对应"当前"：自动→最新，手动→配置的当前
  const prevMode = useRef(configMode);
  useEffect(() => {
    if (batchList.length === 0) return;
    if (configMode === "auto") {
      setSelectedBatchId(batchList[0].scanBatchId);
    } else if (prevMode.current !== "manual") {
      const cur = localStorage.getItem("cageCompareCurrent");
      setSelectedBatchId(cur && batchList.some(b => b.scanBatchId === cur) ? cur : batchList[0].scanBatchId);
    }
    prevMode.current = configMode;
  }, [configMode, batchList]);
  // 首次加载选最新
  useEffect(() => { if (!selectedBatchId && batchList.length > 0) setSelectedBatchId(batchList[0].scanBatchId); }, [batchList, selectedBatchId]);

  // 笼架详情只和「房间 / 快照批次 / 数据源」有关，跟具体模式无关 ——
  // 所以依赖用 shelfGridNeeded 这个布尔量，而不是 pageMode/editMode/confirmMode 原值：
  // 否则 view↔分配↔状态↔确认 之间来回切都会把整个房间的笼架重拉一遍。
  const shelfGridNeeded = pageMode !== "booking";
  useEffect(()=>{
    if(!aRid||!shelfGridNeeded){setDetails([]);return;}
    let cancelled=false;setLoading(true);

    // 本地数据源
    if(dataSource==="local"){
      const shelves=roomShelveMap.get(aRid)??[];
      if(shelves.length===0){setDetails([]);setLoading(false);return;}
      void(async()=>{
        try{
          const results=await Promise.all(shelves.map(s=>fetchLocalShelfGridByShelveId(s.shelveId).catch(()=>null)));
          if(cancelled)return;
          setDetails(results.filter((r):r is CageShelfDetail=>r!==null));
          setRealtimeMeta({fromRealtime:false,cachedAt:new Date().toISOString()});
          setLoading(false);
        }catch(e){
          if(!cancelled){setLoading(false);}
        }
      })();
      return()=>{cancelled=true;};
    }

    if(pageMode==="allocate"||editMode||confirmMode){
      // 分配/编辑模式：走实时数据源
      void(async()=>{
        try{
          const result=await fetchRealtimeRefresh(aRid);
          if(cancelled)return;
          setDetails(result.shelves??[]);
          setRealtimeMeta({fromRealtime:result.fromRealtime,cachedAt:result.cachedAt});
          setLoading(false);
        }catch(e){
          if(!cancelled){toast.error(e instanceof Error?e.message:"实时加载失败");setLoading(false);}
        }
      })();
    }else{
      // 查看模式：保持原有快照逻辑
      const shelves=roomShelveMap.get(aRid)??[];
      if(shelves.length===0){setDetails([]);setLoading(false);return;}
      void(async()=>{
        try{
          const batchParam = selectedBatchId || undefined;
          const results=await Promise.all(shelves.map(s=>fetchCageShelfDetail(s.shelveId, batchParam).catch(()=>null)));
          if(cancelled)return;
          setDetails(results.filter((r):r is CageShelfDetail=>r!==null));
          setLoading(false);
        }catch(e){
          if(!cancelled){toast.error(e instanceof Error?e.message:"加载失败");setLoading(false);}
        }
      })();
    }
    return()=>{cancelled=true;};
  },[aRid,fullTree,selectedBatchId,shelfGridNeeded,detailReloadKey,dataSource]);

  const{data:scan}=useQuery({queryKey:["cageLocalPipelineProgress"],queryFn:fetchLocalPipelineProgress,refetchInterval:(q)=>{const s=q.state.data?.status;return s==="running"||s==="done"||s==="failed"?5000:30000;}});
  const [scanDismissed, setScanDismissed] = useState(false);
  useEffect(() => { if (scan?.status === "running") setScanDismissed(false); }, [scan?.status]);
  // 告警基线批次（独立于快照选择器）：自动=倒数第二个，手动=配置的对比基准
  const alertBaselineId = useMemo(() => {
    if (configMode === "auto") return batchList.length >= 2 ? batchList[1].scanBatchId : (batchList[0]?.scanBatchId || "");
    return localStorage.getItem("cageCompareBaseline") || (batchList.length >= 2 ? batchList[1].scanBatchId : "");
  }, [configMode, batchList]);
  const{data:alertData}=useQuery({queryKey:["persistedAlerts",alertBaselineId,selectedBatchId,configMode],queryFn:()=>fetchPersistedAlerts(alertBaselineId||undefined,selectedBatchId||undefined,configMode),refetchInterval:60_000,enabled:configMode!=="off"});
  const alertMap=useMemo(()=>{
    const m=new Map<string,PersistedAlert>();
    if(!alertData?.alerts)return m;
    for(const a of alertData.alerts)m.set(`${a.shelveId}:${a.position}`,a);
    return m;
  },[alertData]);
  // 告警按笼架/房间聚合
  const alertCountByShelf=useMemo(()=>{
    const m=new Map<string,number>();
    if(!alertData?.alerts)return m;
    for(const a of alertData.alerts)m.set(a.shelveId,(m.get(a.shelveId)||0)+1);
    return m;
  },[alertData]);
  const alertCountByRoom=useMemo(()=>{
    const m=new Map<string,number>();
    if(!fullTree.length||!alertCountByShelf.size)return m;
    for(const r of fullTree){
      const rid=String(r.roomId??"");const sid=String(r.shelveId??"");
      if(rid&&sid&&alertCountByShelf.has(sid))m.set(rid,(m.get(rid)||0)+1);
    }
    return m;
  },[fullTree,alertCountByShelf]);
  // 每个笼架/房间含哪些状态码
  const alertStatusesByShelf=useMemo(()=>{
    const m=new Map<string,Set<string>>();
    if(!alertData?.alerts)return m;
    for(const a of alertData.alerts){
      if(!m.has(a.shelveId))m.set(a.shelveId,new Set());
      m.get(a.shelveId)!.add(a.statusCode);
    }
    return m;
  },[alertData]);
  const alertStatusesByRoom=useMemo(()=>{
    const m=new Map<string,Set<string>>();
    if(!fullTree.length||!alertStatusesByShelf.size)return m;
    for(const r of fullTree){
      const rid=String(r.roomId??"");const sid=String(r.shelveId??"");
      if(!rid||!sid)continue;
      const ss=alertStatusesByShelf.get(sid);if(!ss)continue;
      if(!m.has(rid))m.set(rid,new Set());
      for(const s of ss)m.get(rid)!.add(s);
    }
    return m;
  },[fullTree,alertStatusesByShelf]);
  const[pinned,setPinned]=useState<Set<string>>(new Set());
  const[bmList,setBmList]=useState<BookmarkEntry[]>([]);
  const[bmLoading,setBmLoading]=useState(false);
  const shelfNameMap=useMemo(()=>{const m=new Map<string,string>();for(const r of fullTree){const sid=String(r.shelveId??"");if(sid)m.set(sid,r.shelveName||sid);}return m;},[fullTree]);

  const toggleBm=async(sid:string)=>{if(!aRid){toast.error("请先选择房间");return;}const key=`${aRid}:${sid}`;try{const r=await toggleBookmarkApi(aRid,sid);setPinned(p=>{const n=new Set(p);if(r.bookmarked)n.add(key);else n.delete(key);return n;});if(r.bookmarked){if(tab==="bookmarks")await loadBm();}else{setBmList(p=>p.filter(b=>`${b.roomId}:${b.shelveId}`!==key));}}catch(e:any){toast.error("收藏操作失败");}};

  // auto-expand tree to show a specific room
  const expandToRoom=(roomId:string)=>{
    const row=fullTree.find(r=>String(r.roomId)===roomId);
    if(!row)return;
    const keys=new Set(exp);
    if(row.campusId)keys.add(`c:${row.campusId}`);
    if(row.areaId)keys.add(`a:${row.areaId}`);
    if(row.floorId)keys.add(`f:${row.floorId}`);
    keys.add(`r:${roomId}`);
    setExp(keys);
    // scroll to room node after render
    setTimeout(()=>{
      document.querySelector(`[data-room-key="r:${roomId}"]`)?.scrollIntoView({behavior:"smooth",block:"center"});
    },200);
  };
  /**
   * 定位滚动：滚到「那一格」而不是整个笼架容器。
   * 笼架有 10 行、比可视区还高，滚容器并居中会把目标格顶出视野（看着像滚过头）；
   * 格子有 data-x/data-y，直接滚格子就永远落在视野正中。
   * 房间笼架是异步加载的，格子可能还没渲染 —— 轮询到出现再滚。
   */
  const scrollToCell = useCallback((sid: string, x: number, y: number, tries = 0) => {
    const host = document.getElementById(`shelf-${sid}`);
    const el = host ? (host.querySelector(`[data-x="${x}"][data-y="${y}"]`) as HTMLElement | null) : null;
    if (el) {
      // 等一帧：本轮渲染刚挂上，等布局稳定再滚
      requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", block: "center" }));
      return;
    }
    if (tries < 40) window.setTimeout(() => scrollToCell(sid, x, y, tries + 1), 100);
  }, []);
  /** 批量转移：定位到某笼位（切房间 + 滚到该格），跨房间配对时在网格上找到它 */
  const locateCage = useCallback((cageId: string) => {
    const key = keyByCageId.get(cageId);
    if (!key) return;
    const parts = key.split(":");
    const sid = parts[0] || "";
    let foundRid = "";
    for (const [rid, shelves] of roomShelveMap) {
      if (shelves.some((s: any) => String(s.shelveId) === sid)) { foundRid = rid; break; }
    }
    if (foundRid && foundRid !== aRid) { setARid(foundRid); setARname(foundRid); expandToRoom(foundRid); }
    scrollToCell(sid, Number(parts[1]), Number(parts[2]));
  }, [keyByCageId, roomShelveMap, aRid, expandToRoom, scrollToCell]);
  // ── URL 跳转：审核页 ?jumpShelveId=..&jumpX=..&jumpY=.. → 定位笼架并高亮该格 ──
  const jumpHandledRef=useRef(false);
  useEffect(()=>{
    if(jumpHandledRef.current)return;
    const shelveId=searchParams.get("jumpShelveId");
    const xStr=searchParams.get("jumpX");
    const yStr=searchParams.get("jumpY");
    if(!shelveId||xStr==null||yStr==null)return;
    if(fullTree.length===0)return; // 等全量树就绪再定位
    jumpHandledRef.current=true;
    const next=new URLSearchParams(searchParams);
    next.delete("jumpShelveId");next.delete("jumpX");next.delete("jumpY");
    setSearchParams(next,{replace:true});
    const x=parseInt(xStr,10),y=parseInt(yStr,10);
    if(Number.isNaN(x)||Number.isNaN(y))return;
    const row=fullTree.find(r=>String(r.shelveId)===shelveId);
    if(!row){toast.error("未找到对应笼架: "+shelveId);return;}
    const rid=String(row.roomId??"");
    // 统一定位到「全房间」模式：一屏能看到该格在整间房里的位置与周边笼架，
    // 单笼架模式切过去只剩一格，反而失去上下文。房间笼架由 shelfGridNeeded 那个 effect 按 aRid 加载。
    setViewMode("room");
    setARid(rid);setARname(row.roomName||rid);
    if(rid)expandToRoom(rid);
    setScanLockTarget({sid:String(row.shelveId||shelveId),x,y});
    scrollToCell(String(row.shelveId||shelveId),x,y);
  },[searchParams,fullTree,expandToRoom,scrollToCell]);
  const loadBm=async()=>{setBmLoading(true);try{const list=await fetchBookmarks();setBmList(list);setPinned(new Set(list.map(b=>`${b.roomId}:${b.shelveId}`)));}catch{}finally{setBmLoading(false);}};
  useEffect(()=>{if(tab==="bookmarks")loadBm();},[tab]);

  const [cellIdSyncOpen, setCellIdSyncOpen] = useState(false);
  // 同步范围（一键/本房间）+ 同步前的二次确认弹窗
  const [syncScope, setSyncScope] = useState<"all" | "room">("all");
  const [syncConfirmOpen, setSyncConfirmOpen] = useState(false);

  const handleCellIdSync=useCallback(async(deleteExisting:boolean)=>{
    if(localPipelineSyncing)return;
    setCellIdSyncOpen(false);
    setLocalPipelineSyncing(true);
    const toastId=toast.loading(deleteExisting?"笼位ID同步中（删旧重拉 /back）…":"笼位ID同步中（仅补充缺失）…");
    try{
      const r=await syncAllCellIds(undefined, deleteExisting);
      toast.success(`笼位ID同步完成：写入 ${r.totalCellsWritten ?? 0} 个笼位`,{id:toastId,duration:5000});
      setDetailReloadKey(k=>k+1);
    }catch(e:any){
      toast.error(e?.message||"笼位ID同步失败",{id:toastId});
    }finally{
      setLocalPipelineSyncing(false);
    }
  },[localPipelineSyncing]);

  const handleLocalPipelineSync=useCallback(async()=>{
    if(localPipelineSyncing)return;
    setLocalPipelineSyncing(true);
    try{
      const result=await syncLocalCagePipeline();
      if(result.alreadyRunning){
        toast.error("同步正在进行中，请等待完成后再试");
      }else if(result.started){
        toast.success("同步已开始，进度见顶部进度条");
      }else{
        toast.error(result.message||"同步启动失败");
      }
    }catch(e:any){
      toast.error(e?.message||"同步启动失败");
    }finally{
      setLocalPipelineSyncing(false);
    }
  },[localPipelineSyncing]);

  // 调试：仅同步当前房间（按 roomId 过滤，避免每次全量重写太慢）
  const handleRoomPipelineSync=useCallback(async()=>{
    if(localPipelineSyncing)return;
    if(!aRid){toast.error("请先进入房间");return;}
    setLocalPipelineSyncing(true);
    try{
      const result=await syncLocalCagePipeline(aRid);
      if(result.alreadyRunning){
        toast.error("同步正在进行中，请等待完成后再试");
      }else if(result.started){
        toast.success(`本房间（${aRname||aRid}）同步已开始，进度见顶部`);
      }else{
        toast.error(result.message||"同步启动失败");
      }
    }catch(e:any){
      toast.error(e?.message||"本房间同步启动失败");
    }finally{
      setLocalPipelineSyncing(false);
    }
  },[localPipelineSyncing,aRid,aRname]);

  useEffect(()=>{if(!cell||!shelfId||cell.empty)return;let cancelled=false;void(async()=>{try{const fresh=await refreshCellDetail(shelfId,cell.x,cell.y);if(!cancelled)setCell(fresh);}catch{}})();return()=>{cancelled=true;};},[cell?.position,shelfId]);
  const onOpenRoom=(roomId:string,roomName:string)=>{
    setARid(roomId);setARname(roomName);setShelfDetail(null);setScanLockTarget(null);
  };
  const onOpenShelf=async(shelveId:string,overrideRoomId?:string)=>{
    const roomId=overrideRoomId||aRid;
    setShelfLoading(true);setShelfDetail(null);
    if(dataSource==="local"){
      try{const d=await fetchLocalShelfGridByShelveId(shelveId);setShelfDetail(d);}catch{setShelfDetail(null);}
    }else if(pageMode==="allocate"||pageMode==="booking"||editMode||confirmMode){
      try{const r=await fetchRealtimeRefresh(roomId||"",shelveId);setShelfDetail(r.shelves[0]??null);setRealtimeMeta({fromRealtime:r.fromRealtime,cachedAt:r.cachedAt});}catch{setShelfDetail(null);}
    }else{
      try{const d=await fetchCageShelfDetail(shelveId, selectedBatchId||undefined);setShelfDetail(d);}catch{setShelfDetail(null);}
    }
    setShelfLoading(false);
  };

  // ═══════════════════════════════════════════════════════════
  //  HANDLERS — 分配模式
  // ═══════════════════════════════════════════════════════════
  /* ---- 分配模式：toggle 笼位选中（支持 Shift+Click 区间多选） ---- */
  const toggleCell=useCallback((shelveId:string,x:number,y:number,shiftKey?:boolean)=>{
    setSelectedCells(prev=>{
      const next=new Set(prev);
      const anchor=anchorCellRef.current;
      if (shiftKey && anchor && anchor.shelveId===shelveId){
        // Shift+Click → 选中锚点与当前格之间的矩形区域
        const minX=Math.min(anchor.x,x), maxX=Math.max(anchor.x,x);
        const minY=Math.min(anchor.y,y), maxY=Math.max(anchor.y,y);
        for(let cx=minX;cx<=maxX;cx++) for(let cy=minY;cy<=maxY;cy++) next.add(`${shelveId}:${cx}:${cy}`);
      }else{
        const key=`${shelveId}:${x}:${y}`;
        next.has(key)?next.delete(key):next.add(key);
        // 普通点击 → 更新锚点
        anchorCellRef.current={shelveId,x,y};
      }
      return next;
    });
  },[]);

  /**
   * 分配模式当前批次的动作类型：由选中集里第一个笼位的状态决定。
   * `allocate` = 选中的是「等待分配」，下一步下发 AUP；
   * `cancel`   = 选中的是「已预约(空笼盒)」，下一步撤掉 AUP 退回「等待分配」。
   * 空选为 null（尚未定型，两种都能起头）。
   */
  /**
   * 分配模式：笼位是否可选。与 allocReservePoolCells **同口径** ——
   * 有活跃认领（含「待审批」）或分笼/转移待审都挡住，
   * 否则会出现「画着当前可选、点下去到后端才被拒」的假可选。
   */
  const allocCellVerdict=useCallback((c:any):ReturnType<typeof allocSelectVerdict>=>{
    const st=(c as any)?.claimStatus;
    if(st&&["pending_approval","locked","confirmed","pending_release_approval"].includes(st)){
      return {ok:false,reason:"该笼位已有认领在办，不可分配"};
    }
    return allocSelectVerdict((c as any)?.cageTypeCode??(c as any)?.animalCageType, c?opMarkWithReservations.has(cageIdOfCell(c)):false);
  },[opMarkWithReservations,cageIdOfCell]);

  /* 原来这里有个 allocBatchKind（从勾选集推断「本批是下发还是撤销」）——
     它服务于「一批只能一种动作」那套旧规则，现在同批允许混、提交按 kind 分组，没人再读它，删掉。 */

  /* ---- 分配模式：点格子直接进出「待提交」；框选 / Shift 矩形一次性入缓冲 ---- */
  const handleAllocateToggle=useCallback((shelveId:string,x:number,y:number,shiftKey?:boolean)=>{
    const c=cellAtKey.get(`${shelveId}:${x}:${y}`);
    if(!c)return;
    const cageId=cageIdOfCell(c);
    if(!cageId)return;
    const accept=(cc:unknown)=>allocCellVerdict(cc).ok;

    if(boxSelectMode){
      const anchor=boxSelectAnchorRef.current;
      if(!anchor||anchor.shelveId!==shelveId){
        const v=allocCellVerdict(c);
        if(!v.ok){toast(v.reason);return;}
        boxSelectAnchorRef.current={shelveId,x,y};
        anchorCellRef.current={shelveId,x,y};
        addPendingRef.current(cageId,{kind:v.kind});
        return;
      }
      addRangeRef.current("allocate",shelveId,anchor.x,anchor.y,x,y,accept);
      boxSelectAnchorRef.current=null;
      setBoxSelectMode(false);
      anchorCellRef.current={shelveId,x,y};
      return;
    }
    if(shiftKey){
      const anchor=anchorCellRef.current;
      if(anchor&&anchor.shelveId===shelveId){
        addRangeRef.current("allocate",shelveId,anchor.x,anchor.y,x,y,accept);
        anchorCellRef.current={shelveId,x,y};
        return;
      }
    }
    const cur=batchOf(pendingByMode,"allocate");
    if(cur.items.some(it=>it.cageId===cageId)){
      patchPending("allocate",(b)=>removeItem(b,cageId));
      anchorCellRef.current={shelveId,x,y};
      return;
    }
    const v=allocCellVerdict(c);
    if(!v.ok){toast(v.reason);return;}
    /*
      同一批**允许混**「下发 AUP」与「撤销分配」：两种在缓冲区分段陈列、各有各的落点区，
      提交时按 kind 分组下发（一组一次调用，接口形状没变）。所以这里不再拦，
      用户不必为两种动作各提交一批。
    */
    anchorCellRef.current={shelveId,x,y};
    addPendingRef.current(cageId,{kind:v.kind});
  },[boxSelectMode,cellAtKey,cageIdOfCell,pendingByMode,patchPending,addPendingRef,addRangeRef]);

  /* ---- 认领/预定模式：一步到位，点格子直接进出「待提交」 ---- */
  const handleReserveToggle=useCallback((shelveId:string,x:number,y:number,shiftKey?:boolean)=>{
    void shiftKey;
    const c=cellAtKey.get(`${shelveId}:${x}:${y}`);
    if(!c)return;
    const cageId=cageIdOfCell(c);
    if(!cageId)return;
    const cur=batchOf(pendingByMode,"reserve");
    if(cur.items.some(it=>it.cageId===cageId)){patchPending("reserve",(b)=>removeItem(b,cageId));return;}
    const ct=(c as any)?.cageTypeCode ?? (c as any)?.animalCageType;
    const status=(c as any)?.claimStatus;
    if(ct!==2){toast("只能选择「已预约空笼盒」状态的笼位");return;}
    if(status && ["pending_approval","locked","confirmed","pending_release_approval"].includes(status)){
      toast("该笼位已有认领，不可重复选择");return;
    }
    // 审核中 / 已被订单预定的笼位都不能再预定：这两种中间态都不改笼位类型，只看类型拦不住
    const mark = opMarkWithReservations.get(cageId);
    if(mark){toast(mark.label + "，请先等它结束");return;}
    addPendingRef.current(cageId);
  },[cellAtKey,cageIdOfCell,pendingByMode,patchPending,opMarkWithReservations]);

  /* ---- 划分模式：勾选笼位（不限状态，但 type1 除外）----
     划分只是「预分配标记」，不改变笼位现状：type3 占用中的笼位被划分也不影响其现有归属。
     唯一例外是 type1（等待分配）—— 它尚未归属任何课题组，是笼位状态的底层约束，
     与身份权限无关，高权限也不能划分。
     支持与分配模式相同的三种选择方式：单击切换 / Shift 矩形 / 框选按钮点两格。 */
  const DIV_INELIGIBLE_HINT="待分配状态的笼位未归属课题组，不能划分";
  const handleDivisionToggle=useCallback((shelveId:string,x:number,y:number,shiftKey?:boolean)=>{
    const c=cellAtKey.get(`${shelveId}:${x}:${y}`);
    if(!c)return;
    const cageId=cageIdOfCell(c);
    if(!cageId)return;
    const eligible=(cc:unknown)=>{
      const ct=(cc as any)?.cageTypeCode??(cc as any)?.animalCageType;
      return ct!==1;
    };
    if(boxSelectMode){
      const anchor=boxSelectAnchorRef.current;
      if(!anchor||anchor.shelveId!==shelveId){
        if(!eligible(c)){toast(DIV_INELIGIBLE_HINT);return;}
        boxSelectAnchorRef.current={shelveId,x,y};
        anchorCellRef.current={shelveId,x,y};
        addPendingRef.current(cageId);
        return;
      }
      addRangeRef.current("division",shelveId,anchor.x,anchor.y,x,y,eligible);
      boxSelectAnchorRef.current=null;
      setBoxSelectMode(false);
      anchorCellRef.current={shelveId,x,y};
      return;
    }
    if(shiftKey){
      const anchor=anchorCellRef.current;
      if(anchor&&anchor.shelveId===shelveId){
        addRangeRef.current("division",shelveId,anchor.x,anchor.y,x,y,eligible);
        anchorCellRef.current={shelveId,x,y};
        return;
      }
    }
    const cur=batchOf(pendingByMode,"division");
    if(cur.items.some(it=>it.cageId===cageId)){
      patchPending("division",(b)=>removeItem(b,cageId));
      anchorCellRef.current={shelveId,x,y};
      return;
    }
    if(!eligible(c)){toast(DIV_INELIGIBLE_HINT);return;}
    anchorCellRef.current={shelveId,x,y};
    addPendingRef.current(cageId);
  },[boxSelectMode,cellAtKey,cageIdOfCell,pendingByMode,patchPending]);

  /** 勾选的格子 → animalCageId 列表（selectedCells 存的是 shelveId:x:y） */
  const selectedCageIds=useCallback(():string[]=>{
    const ids:string[]=[];
    for(const key of selectedCells){
      const [sid,xStr,yStr]=key.split(":");
      const x=parseInt(xStr),y=parseInt(yStr);
      for(const d of details){
        if(String(d.shelfMeta?.shelveId)===sid){
          const cell=d.grid?.find(c=>c.x===x&&c.y===y);
          if(cell?.id)ids.push(String(cell.id));
          break;
        }
      }
      if(shelfDetail&&String(shelfDetail.shelfMeta?.shelveId)===sid){
        const cell=shelfDetail.grid?.find(c=>c.x===x&&c.y===y);
        if(cell?.id)ids.push(String(cell.id));
      }
    }
    return ids;
  },[selectedCells,details,shelfDetail]);

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

  /**
   * 分配 / 预定的可选高亮：与各自 toggle 的校验同口径，只是**提前算出来画绿环**，
   * 让用户点之前就知道哪些能选（原来只有点下去才 toast 报错）。
   */
  const allocReservePoolCells = useMemo(() => {
    const isAlloc = pageMode === "allocate";
    if (!isAlloc && !reserveMode) return undefined;
    const m = new Map<string, PoolCell>();
    const add = (grid: any[]) => {
      for (const c of grid ?? []) {
        const id = String(c.id ?? c.animalCageId ?? "");
        if (!id) continue;
        const ct = c.cageTypeCode ?? c.animalCageType;
        const pending = opMarkWithReservations.has(id);
        /**
         * 有活跃认领（含「待审批」）的笼位，**分配和预定都不能选**。
         * 以前只有预定分支查了认领，分配分支漏了 —— type2 带待审批认领的笼位照样进池、
         * 挂上「当前可选」，点下去到后端才被拒。认领检查提到分支外，两种模式同一口径。
         */
        const st = (c as any).claimStatus;
        const claimBusy = !!st && ["pending_approval", "locked", "confirmed", "pending_release_approval"].includes(st);
        if (claimBusy) continue;
        if (isAlloc) {
          if (allocSelectVerdict(ct, pending).ok) m.set(id, c as PoolCell);
        } else {
          // 预定：空笼盒 + 无待审（认领已在上面统一挡掉，与 handleReserveToggle 一致）
          if (ct === 2 && !pending) m.set(id, c as PoolCell);
        }
      }
    };
    for (const d of details) add(d.grid);
    if (shelfDetail) add(shelfDetail.grid);
    return m;
  }, [pageMode, reserveMode, details, shelfDetail, opMarkWithReservations]);

  /** 当前模式该传给网格的可选高亮（分笼/转移选位时会被 opGridProps 覆盖，故不在此处算） */
  const modePoolCells = pageMode === "allocate" || reserveMode ? allocReservePoolCells : divisionPoolCells;
  const modeClaimMode = pageMode === "allocate" || reserveMode || divisionMode;

  /** 哪些笼架有可选笼位 —— 供左侧树与笼架边框高亮 */
  const selectableShelveIds = useMemo(() => {
    const s = new Set<string>();
    if (!modePoolCells || modePoolCells.size === 0) return s;
    const add = (d: any) => {
      const sid = String(d?.shelfMeta?.shelveId ?? "");
      if (!sid) return;
      if ((d.grid ?? []).some((c: any) => modePoolCells.has(String(c.id ?? c.animalCageId ?? "")))) s.add(sid);
    };
    for (const d of details) add(d);
    if (shelfDetail) add(shelfDetail);
    return s;
  }, [details, shelfDetail, modePoolCells]);

  /* ---- 分配模式：取消分配 ---- */
  const handleCancelAssign=async()=>{
    if(selectedCells.size===0)return;
    // 从 selectedCells 提取 cageId（shelveId:x:y → details 中的 cageId）
    const cageIds:string[]=[];
    for(const key of selectedCells){
      const [sid,xStr,yStr]=key.split(":");
      const x=parseInt(xStr),y=parseInt(yStr);
      for(const d of details){
        if(String(d.shelfMeta?.shelveId)===sid){
          const cell=d.grid?.find(c=>c.x===x&&c.y===y);
          if(cell?.id)cageIds.push(String(cell.id));
          break;
        }
      }
      if(shelfDetail&&String(shelfDetail.shelfMeta?.shelveId)===sid){
        const cell=shelfDetail.grid?.find(c=>c.x===x&&c.y===y);
        if(cell?.id)cageIds.push(String(cell.id));
      }
    }
    if(cageIds.length===0){toast.error("无法获取选中笼位的 ID");return;}
    setAllocSubmitting(true);

    // 本地数据源
    if(dataSource==="local"){
      try{await localCancelAllocate(cageIds);toast.success(`已取消 ${cageIds.length} 个笼位分配（本地）`);}
      catch(e:any){toast.error(e?.message||"取消分配失败");}
      setSelectedCells(new Set());setAllocSubmitting(false);setDetailReloadKey(k=>k+1);
      return;
    }

    try{await cancelCageAssignment(cageIds,aRid||undefined);toast.success(`已取消 ${cageIds.length} 个笼位分配`);setSelectedCells(new Set());
      if(aRid){const r=await fetchRealtimeRefresh(aRid);setDetails(r.shelves??[]);setRealtimeMeta({fromRealtime:r.fromRealtime,cachedAt:r.cachedAt});}
    }catch(e:any){toast.error(e instanceof Error?e.message:"取消分配失败");}
    finally{setAllocSubmitting(false);}
  };

  // 从 details 或 shelfDetail 找到 cell 所属的 shelveId
  const findShelfIdForCell=(cell:CageShelfCell):string=>{
    for(const d of details){const sid=String(d.shelfMeta?.shelveId??"");for(const c of d.grid){if(c.x===cell.x&&c.y===cell.y)return sid;}}
    if(shelfDetail){const sid=String(shelfDetail.shelfMeta?.shelveId??"");for(const c of shelfDetail.grid){if(c.x===cell.x&&c.y===cell.y)return sid;}}
    return"";
  };
  /**
   * 状态模式：打开某笼位的状态编辑 —— 全房间视图走弹窗，单笼架视图走右侧面板。
   * 网格点击和抽屉条目的「点击继续编辑」都走这里，两条入口的落点才不会各走各的。
   */
  const openEditCell=useCallback((cell:CageShelfCell,sidHint?:string)=>{
    const cageId=String((cell as any).id ?? (cell as any).animalCageId ?? "");
    // 拉取表单值(cage_info_value)：状态标记唯一真相源，编辑弹窗据此反向使能按钮
    setEditFormValues(null);
    if(cageId&&dataSource==="local"){
      fetchCageInfoValues(cageId).then(setEditFormValues).catch(()=>setEditFormValues(null));
    }
    if(viewMode==="room"){setEditDialogCell(cell);setEditDialogShelfId(sidHint??findShelfIdForCell(cell));return;}
    setCell(cell);setShelfId("");
  },[dataSource,viewMode,findShelfIdForCell]);
  // ── 统一 cell 点击：编辑/查看 ──
  const handleGridCellClick=useCallback((cell:CageShelfCell, sidHint?:string)=>{
    if(cell.empty)return;
    // 记录模式：点笼位弹「历史记录」
    if(recordMode){
      const cageId=String((cell as any).id ?? (cell as any).animalCageId ?? "");
      if(cageId){setRecordTarget(cageId);}else{toast.error("该笼位无 ID");}
      return;
    }
    // 编辑模式：全房间→弹窗 / 单笼架→右侧面板（仅 state=3/4 可操作）
    if(editMode){
      const ct=dataSource==="local" ? ((cell as any).cageTypeCode) : (cell as any).animalCageType;
      if(ct!==3&&ct!==4){toast.error("当前状态不可编辑");return;}
      openEditCell(cell,sidHint);
      return;
    }
    // 查看模式 / 扫码确认模式（确认由扫码触发，点击格子仅查看）
    setCell(cell);setShelfId("");
  },[editMode,recordMode,openEditCell,dataSource]);

  // ═══════════════════════════════════════════════════════════
  //  HANDLERS — 编辑模式
  // ═══════════════════════════════════════════════════════════
  // ── 编辑模式：扫码 → 匹配 grid → 加入缓存 ──
  const handleEditScan=useCallback(async(text:string)=>{
    if(!details||!details.length)return;
    const code=text.trim();if(!code)return;
    try{
      const r=await lookupCode(code);
      if(r.type==="NOT_FOUND"||r.type==="ASSET"){toast.error("未找到对应笼位: "+code);return;}
      if(r.type==="LEGACY_CAGE_BOX"){toast.error("旧盒码已废弃，请扫笼位码");return;}
      const pos=r.cageCell;
      if(!pos||pos.positionX==null||pos.positionY==null){toast.error("未找到对应笼位坐标");return;}
      // 在所有shelf detail的grid中按坐标匹配
      let matched:CageShelfCell|null=null;let matchedSid="";
      for(const sd of details){
        const sid=String(sd.shelfMeta?.shelveId??"");
        const cell=sd.grid?.find((c:any)=>c.x===pos.positionX&&c.y===pos.positionY);
        if(cell){matched=cell;matchedSid=sid;break;}
      }
      if(!matched){toast.error("当前房间未找到坐标 ("+pos.positionX+","+pos.positionY+")");return;}
      const match=matched!;
      const key=`${matchedSid}:${match.x}:${match.y}`;
      const cageId=String((match as any).id ?? (match as any).animalCageId ?? "");
      // 状态标记以表单为真相源：先拉表单值再建缓存条目（非阻塞，失败按空集处理）
      if(cageId&&dataSource==="local"){
        fetchCageInfoValues(cageId).then(rows=>{
          setEditFormValues(rows);
          const pre=actionsFromFormValues(rows);
          setScanCache(prev=>{const next=new Map(prev);
            if(!next.has(key))next.set(key,{cell:match,code,initialActions:new Set(pre),currentActions:new Set(pre),images:[],notes:""});
            return next;});
          setLastScannedKey(key);
        }).catch(()=>{});
      } else {
        const pre=actionsFromCageBoxInfo(match.cageBoxInfo as Record<string,any>|undefined);
        setScanCache(prev=>{const next=new Map(prev);
          if(!next.has(key))next.set(key,{cell:match,code,initialActions:new Set(pre),currentActions:new Set(pre),images:[],notes:""});
          return next;});
        setLastScannedKey(key);
      }
      toast.success("已匹配 "+match.position);
    }catch{toast.error("扫码查询失败");}
  },[details,dataSource]);

  // ── 统一扫码定位：从 lookupCode 结果提取坐标并定位高亮 ──
  const locateLookup=useCallback(async(r:CodeLookupResult):Promise<boolean>=>{
    // 命中形态的归一化在 locateTargetOf 里，三端共用一份 ——
    // 之前学生端自己读顶层字段，笼盒码就定位不了。不要再在这里分 type
    const t=locateTargetOf(r);
    if(!t)return false;
    const rid=t.roomId;
    const sid=t.shelveId;
    setViewMode("shelf");
    setARid(rid);setARname(t.roomName||rid);
    if(rid) expandToRoom(rid);
    if(sid){
      setShelfLoading(true);setShelfDetail(null);
      try{
        const shelf=await fetchLocalShelfGridByShelveId(sid);
        setShelfDetail(shelf);
        setScanLockTarget({sid:String(shelf.shelfMeta?.shelveId||sid),x:t.positionX,y:t.positionY});
        toast.success(`已定位: ${t.roomName||""} ${t.shelveName||""} (${t.positionX},${t.positionY})`);
        return true;
      }catch(e:any){toast.error("加载笼架失败: "+(e?.message||sid));return false;}
      finally{setShelfLoading(false);}
    }
    return false;
  },[expandToRoom]);

  // ── 编辑模式：切换动作 ──
  const toggleEditAction=useCallback((action:CageBoxAction)=>{
    if(!lastScannedKey)return;
    setScanCache(prev=>{const next=new Map(prev);
      const e=next.get(lastScannedKey);if(!e)return prev;
      const cur=new Set(e.currentActions);
      cur.has(action)?cur.delete(action):cur.add(action);
      next.set(lastScannedKey,{...e,currentActions:cur});return next;});
  },[lastScannedKey]);

  // ── 编辑模式：提交 ──
  // ═══════════════════════════════════════════════════════════
  //  HANDLERS — 扫码确认模式
  // ═══════════════════════════════════════════════════════════
  // ── 扫码 → 判定（已分配/待确认）→ 弹核对面板或提示 ──
  const handleConfirmScan=useCallback(async(code:string)=>{
    const q=code.trim();if(!q)return;
    try{
      const r=await lookupCode(q);
      if(r.type==="NOT_FOUND"){toast.error("未识别笼位");return;}
      if(r.type==="ASSET"){toast.error("该编码为资产编号，非笼位");return;}
      if(r.type==="LEGACY_CAGE_BOX"){toast.error("旧盒码已废弃，请扫笼位码");await locateLookup(r);return;}
      await locateLookup(r);
      const claim=r.claim;
      if(!claim){toast.error("该笼位未分配（课题组判定后续开放）");return;}
      if(claim.claimStatus==="locked"){
        setConfirmLookup(r);
      }else if(claim.claimStatus==="confirmed"){
        toast.success("该笼位已到位");
      }else if(claim.claimStatus==="pending_approval"){
        toast.error("该笼位待审批");
      }else if(claim.claimStatus==="pending_release_approval"){
        toast.error("该笼位待释放审批");
      }else{
        toast.error("该笼位状态："+claim.claimStatus);
      }
    }catch(e:any){toast.error(e?.message||"扫码查询失败");}
  },[locateLookup]);

  // ── 确认到位：调用学生端 confirm（后端校验本人 claimantId）──
  const handleConfirmArrival=useCallback(async()=>{
    if(!confirmLookup?.claim?.id)return;
    setConfirmSubmitting(true);
    try{
      await adminConfirmClaim(confirmLookup.claim.id);
      toast.success("已确认到位");
      setConfirmLookup(null);
      setDetailReloadKey((k)=>k+1);
    }catch(e:any){toast.error(e?.message||"确认失败");}
    finally{setConfirmSubmitting(false);}
  },[confirmLookup]);

  // ── 扫码确认模式下点格子 → 直接开核对弹窗 ──
  const handleConfirmCell = useCallback((c: any, sid?: string) => {
    const status = c?.claimStatus;
    if (!status) { toast.error("该笼位未分配"); return; }
    if (status === "locked") {
      // 不再弹确认弹窗：点格子直接进「待提交」，到抽屉里统一提交
      const cageId = String(c.id ?? c.animalCageId ?? "");
      if (!cageId) { toast.error("该笼位缺少 ID"); return; }
      addPendingRef.current(cageId, { claimId: Number(c.activeClaimId) });
      return;
    }
    if (status === "confirmed") { toast.success("该笼位已到位"); return; }
    if (status === "pending_approval") { toast.error("该笼位待审批"); return; }
    if (status === "pending_release_approval") { toast.error("该笼位待释放审批"); return; }
    toast.error("该笼位状态：" + status);
  }, []);

  /**
   * 归档模式的选中切换：点一次入「待提交」，再点一次移出。
   * 与分配/预定/划分同款 toggle 语义 —— 这四种模式共用网格上那一枚绿色对勾（SelectCheck）。
   * 归档以前只走「点开弹窗」那套，网格拿不到 allocMode，所以格子上一直没有勾选标记。
   *
   * 签名必须与其它 toggle 一致：ShelfGrid 的 onToggleCell 传的是**坐标**不是格子对象
   * （见 ShelfGrid.tsx:163 `onToggleCell(sid, c.x, c.y, e.shiftKey)`），要自己回查 cellAtKey。
   */
  const handleArchiveToggle = useCallback((shelveId: string, x: number, y: number, _shiftKey?: boolean) => {
    const c = cellAtKey.get(`${shelveId}:${x}:${y}`);
    if (!c) return;
    const cageId = cageIdOfCell(c);
    if (!cageId) return;
    if (batchOf(pendingByMode, "archive").items.some((it) => it.cageId === cageId)) {
      patchPending("archive", (b) => removeItem(b, cageId));
      return;
    }
    const ct = (c as any)?.cageTypeCode ?? (c as any)?.animalCageType;
    if (ct !== 3) { toast.error("该笼位当前无笼盒/未占用，无需归档"); return; }
    addPendingRef.current(cageId);
  }, [cellAtKey, cageIdOfCell, pendingByMode, patchPending]);

  // ── 归档模式：扫码 → 高亮定位 + 进「待提交」（与点格子同一条路）──
  const handleArchiveScan = useCallback(async (code: string) => {
    const q = code.trim(); if (!q) return;
    try {
      const r = await lookupCode(q);
      if (r.type === "NOT_FOUND") { toast.error("未识别笼位"); return; }
      if (r.type === "ASSET") { toast.error("该编码为资产编号，非笼位"); return; }
      if (r.type === "LEGACY_CAGE_BOX") { toast.error("旧盒码已废弃，请扫笼位码"); await locateLookup(r); return; }
      await locateLookup(r);
      if (!r.claim) { toast.error("该笼位无占用记录，无需归档"); return; }
      const cageId = String(r.cageCell?.animalCageId ?? "");
      if (!cageId) { toast.error("未识别笼位"); return; }
      // 已在待归档就不重复入缓冲（入缓冲本身是 upsert，这里只是少一次重渲染）
      if (batchOf(pendingByMode, "archive").items.some((it) => it.cageId === cageId)) return;
      addPendingRef.current(cageId);
    } catch (e: any) { toast.error(e?.message || "扫码查询失败"); }
  }, [locateLookup, pendingByMode]);

  // ── 手动修正历史 confirmed 笼位（2→3 + 写占用者）──
  const handleReconcileOccupancy = useCallback(async () => {
    try {
      const n = await reconcileCageOccupancy();
      toast.success(`已修正 ${n} 个笼位`);
      setDetailReloadKey((k) => k + 1);
    } catch (e: any) { toast.error(e?.message || "修正失败"); }
  }, []);

  // ── 常驻「扫码定位」入口：按当前模式联动判定 ──
  const handleResidentScan=useCallback(async(code:string)=>{
    if(editMode){await handleEditScan(code);return;}
    if(confirmMode){await handleConfirmScan(code);return;}
    if(archiveMode){await handleArchiveScan(code);return;}
    try{
      const r=await lookupCode(code);
      if(r.type==="NOT_FOUND"){toast.error("未找到对应笼位");return;}
      if(r.type==="ASSET"){toast.error("该编码为资产编号，非笼位");return;}
      await locateLookup(r);
    }catch{toast.error("扫码查询失败");}
  },[editMode,confirmMode,archiveMode,handleEditScan,handleConfirmScan,handleArchiveScan,locateLookup]);

  // ── 统一模式切换（下拉选择用）──
  const switchMode=useCallback((mode:CageModeKey)=>{
    if(!allowedModeKeys.includes(mode))return; // 无该模式权限，忽略
    setSelectedCells(new Set());anchorCellRef.current=null;boxSelectAnchorRef.current=null;setBoxSelectMode(false);shiftHintShownRef.current=false;setCell(null);setShelfId(null);
    setEditMode(false);setConfirmMode(false);setConfirmLookup(null);setArchiveMode(false);setReserveMode(false);setRecordMode(false);setRecordTarget(null);setDivisionMode(false);
    /*
      编辑缓存**不能在这里清**：它就是「待提交」那批状态改动的真相源（配色 + 每格的初始快照），
      而批次是跨模式留着的。清了缓存、留着批次 → 再回到状态模式颜色全丢（抽屉开合会走这里，
      右边缘书签点开就是 switchMode + setPendingOpen）。
      别的模式看不到预览色由网格那侧的门控负责（ShelfGrid 只在 editMode 传 editCacheEntry）。
    */
    if(mode==="allocate")setPageMode("allocate");
    else if(mode==="booking")setPageMode("booking");
    else setPageMode("view");
    if(mode==="edit")setEditMode(true);
    else if(mode==="confirm")setConfirmMode(true);
    else if(mode==="archive")setArchiveMode(true);
    else if(mode==="reserve")setReserveMode(true);
    else if(mode==="record")setRecordMode(true);
    else if(mode==="division")setDivisionMode(true);
    /*
      切进**有抽屉**的模式（分配/预定/划分/确认/归档）就把抽屉抽出来 —— 这是唯一会自动弹的时机；
      点格子只入缓冲、不弹（见 addPendingFor / 编辑同步那几处）。
      状态模式（edit）除外：抽屉是右侧固定浮层，开在状态模式会盖住右半屏的「状态选择」面板，
      而用户得看着那个面板改动作。切到没有抽屉的模式（查看/记录/预约）顺带关掉，
      否则 pendingOpen 留 true → 抽屉因模式不匹配不渲染、书签又被「抽屉开着」隐藏 → 标签全没了。
    */
    setPendingOpen(mode !== "view" && mode !== "record" && mode !== "booking" && mode !== "edit");
  },[allowedModeKeys]);

  /* 模式悬浮岛形态 —— 两种都做了，先用开关切换对比，定稿后固定一种并删掉开关 */
  const [islandVariant, toggleIslandVariant] = useIslandVariant();

  // ── 数据源切换（设置中心）──
  const switchDataSource=useCallback((ds:"aro"|"local")=>{
    setDataSource(ds);
    setEditMode(false);setConfirmMode(false);setConfirmLookup(null);setArchiveMode(false);setReserveMode(false);setScanCache(new Map());setLastScannedKey(null);
    setSelectedCells(new Set());setCell(null);setShelfId(null);
  },[]);

  // 离开分配模式时清空勾选，防止切换模式/数据源后残留勾选
  useEffect(() => {
    if (pageMode !== "allocate") {
      setSelectedCells(new Set());
      setBoxSelectMode(false);
      boxSelectAnchorRef.current = null;
    }
  }, [pageMode]);

  /** 当前模式的容器描边色（查看模式为空 = 不描边） */
  const modeColor = modeBorderColor(currentMode as CageModeKey);
  /** 当前模式呼吸灯：挂在每个笼架容器上，不罩整页 */
  const modeGlowProps = modeColor ? { glowColor: modeColor } : {};

  // ── 多模式「待提交」抽屉：操作先在抽屉里攒着，最后一次性提交（成功的移出、失败的列出原因）──
  // 状态与 patchPending 已提到组件顶部（各模式点击处理要用）；这里只留依赖位置信息的派生值。
  const pending = batchOf(pendingByMode, currentMode);
  /** 右侧书签标签上的数字：各模式待提交条数 */
  const pendingCounts = useMemo(() => {
    const c: Partial<Record<CageModeKey, number>> = {};
    for (const k of Object.keys(pendingByMode) as CageModeKey[]) c[k] = batchOf(pendingByMode, k).items.length;
    return c;
  }, [pendingByMode]);

  /** 预定模式的人员区域（accountId → 姓名），随批次参数持久化，关抽屉也不丢 */
  const reservePersons = (pending.params.persons as Record<string, string> | undefined) ?? {};
  const reserveZones = useMemo(
    () => Object.entries(reservePersons).map(([key, name]) => ({ key, title: name, color: "#8b5cf6" })),
    [reservePersons],
  );
  const searchReservePerson = useCallback(async (kw: string): Promise<SearchOption[]> => {
    const toOpt = (p: { accountId: string; name: string; projectGroupName?: string }) =>
      ({ key: p.accountId, label: p.name, subtitle: p.projectGroupName || undefined });
    if (kw) return (await searchPersonnelByKeyword(kw)).map(toOpt);
    const all: SearchOption[] = [];
    for (const g of reserveAupGroupNames) {
      const list = await searchPersonnelByKeyword(g);
      all.push(...list.filter((p) => p.projectGroupName === g).map(toOpt));
    }
    return all;
  }, [reserveAupGroupNames]);

  /** 划分模式的人员区域（accountId → 姓名），与预定同构 */
  const divisionPersons = (pending.params.persons as Record<string, string> | undefined) ?? {};
  const divisionZones = useMemo(
    () => Object.entries(divisionPersons).map(([key, name]) => ({ key, title: name, color: "#e11d48" })),
    [divisionPersons],
  );
  const searchDivisionPerson = useCallback(
    async (kw: string): Promise<SearchOption[]> => {
      if (kw) return (await searchPersonnelByKeyword(kw)).map((p) => ({ key: p.accountId, label: p.name, subtitle: p.projectGroupName || undefined }));
      return (await fetchMyGroupMembers()).map((m) => ({ key: m.accountId, label: m.name, subtitle: m.jobNumber || undefined }));
    },
    [],
  );

  // ── 分配模式：缓冲勾选集（抽屉本地 UI 状态，不写进批次）与区域归属 ──
  const [bufferSelected, setBufferSelected] = useState<Set<string>>(new Set());
  const toggleBufferSelected = (cageId: string) => setBufferSelected((p) => {
    const n = new Set(p);
    if (n.has(cageId)) n.delete(cageId); else n.add(cageId);
    return n;
  });
  const toggleAllBufferSelected = (ids: string[]) => setBufferSelected((p) =>
    (p.size > 0 && ids.every((id) => p.has(id))) ? new Set<string>() : new Set(ids),
  );
  /** 未归属条目：分配=还没落到 AUP/撤销区；预定=无 assigneeAccountId */
  const unassignedItems = useMemo(
    () => pending.items.filter((it) => currentMode === "allocate" ? !it.aupId : !it.assigneeAccountId),
    [pending.items, currentMode],
  );
  /**
   * 分配模式：缓冲里两种状态各占一段。
   * 「待分配」= 等待分配的笼位（要挑一个 AUP）；「撤销分配」= 空笼盒（撤回原有 AUP）。
   * 落到 AUP 区/撤销区的条目会带上 aupId，随之离开缓冲段（归到右侧对应区域里）。
   */
  const allocWaitItems = useMemo(() => unassignedItems.filter((it) => it.kind !== "cancel"), [unassignedItems]);
  const allocCancelItems = useMemo(() => unassignedItems.filter((it) => it.kind === "cancel"), [unassignedItems]);
  /**
   * 状态模式：缓冲区只留**还没落到任何色区**的笼位。
   * 落了色的条目已经由左侧色区认领（可以从那里拖回来），再挂在缓冲区就是重复一份。
   */
  const editStagedItems = useMemo(
    () => pending.items.filter((it) => (it.actions?.length ?? 0) + (it.removedActions?.length ?? 0) === 0),
    [pending.items],
  );
  /** 挑中的 AUP（带顺序），关抽屉不丢 */
  const zoneAups = (pending.params.zoneAups as string[] | undefined) ?? [];
  /**
   * 分配模式右侧区域 = 一个固定的「撤销分配」区 + 若干临时挑中的 AUP 区。
   * 撤销区常驻：type2（空笼盒）的笼位归属于「撤销」而不是某个 AUP，
   * 没有它的话这批笼位只能靠 kind 隐式提交，用户看不到自己到底放对了没有。
   */
  const allocZones = useMemo(
    () => [
      {
        key: ALLOC_CANCEL_ZONE,
        title: "撤销分配",
        subtitle: "空笼盒退回「等待分配」",
        color: "#f97316",
        variant: "cancel" as const,
      },
      ...zoneAups
        .map((id) => allocAupList.find((a) => String(a.id) === id))
        .filter(Boolean)
        .map((a) => ({
          key: String(a!.id),
          title: `${a!.registerNo ?? ""}${a!.piName ? ` · ${a!.piName}` : ""}`,
          subtitle: a!.projectGroupName || undefined,
          color: "#3b82f6",
        })),
    ],
    [zoneAups, allocAupList],
  );
  const searchAup = useCallback(
    async (kw: string): Promise<SearchOption[]> => {
      const k = kw.toLowerCase();
      return allocAupList
        .filter((a) => !k || `${a.registerNo ?? ""} ${a.piName ?? ""} ${a.projectGroupName ?? ""}`.toLowerCase().includes(k))
        .map((a) => ({ key: String(a.id), label: a.registerNo ?? String(a.id), subtitle: a.piName || a.projectGroupName || undefined }));
    },
    [allocAupList],
  );
  /**
   * zone.key → 条目。
   * 分配/预定/划分：一个条目只属一个区（AUP / 人员 / 撤销）。
   * 状态模式：一个条目可以同时挂在多个状态区（改了 3 个状态就出现在 3 枚标记区里）。
   */
  const itemsByZone = useMemo(() => {
    const m = new Map<string, PendingItem[]>();
    const push = (k: string, it: PendingItem) => {
      const arr = m.get(k);
      if (arr) arr.push(it); else m.set(k, [it]);
    };
    for (const it of pending.items) {
      if (currentMode === "edit") {
        for (const a of it.actions ?? []) push(`add:${a}`, it);
        for (const a of it.removedActions ?? []) push(`del:${a}`, it);
        continue;
      }
      const k = currentMode === "allocate" ? it.aupId : it.assigneeAccountId;
      if (k) push(String(k), it);
    }
    return m;
  }, [pending.items, currentMode]);
  /**
   * 把若干缓冲条目落定到某目标；zoneKey=null 表示退回缓冲区。
   * 分配模式两个方向互斥（见 {@link allocZoneReject}）：放错区整条跳过并提示 ——
   * 静默吞掉会让用户以为「拖进去了」，提交时才发现对不上。
   * 返回 true = 全部接受（调用方据此决定要不要清掉勾选；被拒就留着让用户重试）。
   */
  const dropToZone = useCallback((mode: "allocate" | "reserve" | "division", cageIds: string[], zoneKey: string | null): boolean => {
    const batch = batchOf(pendingByMode, mode);
    const accepted = new Set<string>();
    let rejectedReason: string | null = null;
    let rejected = 0;
    for (const id of cageIds) {
      const it = batch.items.find((x) => x.cageId === id);
      if (!it) continue;
      if (mode === "allocate" && zoneKey) {
        const reason = allocZoneReject(zoneKey, it.kind);
        if (reason) { rejected += 1; rejectedReason = reason; continue; }
      }
      accepted.add(id);
    }
    if (rejected > 0) toast.error(`${rejectedReason}（已跳过 ${rejected} 个）`);
    if (accepted.size > 0) {
      patchPending(mode, (b) => {
        let next = b;
        for (const id of accepted) {
          const it = next.items.find((x) => x.cageId === id);
          if (!it) continue;
          next = upsertItem(next, mode === "allocate"
            ? { ...it, aupId: zoneKey ?? undefined }
            : { ...it, assigneeAccountId: zoneKey ?? undefined });
        }
        return next;
      });
    }
    return rejected === 0 && accepted.size > 0;
  }, [patchPending, pendingByMode]);

  /* ═══════════════════════════════════════════════════════════
     状态模式 —— 色彩区：5 个状态 + 5 个对应的撤销区
     ═══════════════════════════════════════════════════════════ */
  /**
   * 右侧区域 = 每个状态标记一枚「标记区」+ 一枚「撤销区」，颜色就是该状态在网格上的配色。
   * 撤销区用空心描边（同色），和标记区一眼能分开。
   */
  const editZones = useMemo<BufferZone[]>(
    () => CAGE_BOX_ACTIONS.flatMap(({ action, label, statusCode }) => {
      const color = (cageStatusColors[statusCode] ?? DEFAULT_COLORS[statusCode])?.border || "#64748b";
      return [
        { key: statusZoneKey(action, true), title: label, subtitle: "标记该状态", color },
        { key: statusZoneKey(action, false), title: `撤销${label}`, subtitle: "取消该状态色", color, variant: "cancel" as const },
      ];
    }),
    [cageStatusColors],
  );
  /**
   * 把某个动作按 on/off 写进编辑缓存。**不 toggle** —— 落区语义要求显式方向，
   * 否则「拖回同一个区」会变成反选。
   *
   * scanCache 是状态模式的唯一真相源：edit 批次由 useEffect 从这里同步过来，
   * 网格格子与抽屉缩略图也都读它，所以写完立刻就能看到颜色变化（实时反馈）。
   */
  const applyEditAction = useCallback(async (
    cell: CageShelfCell, sid: string, action: CageBoxAction, on: boolean,
  ) => {
    const ck = `${sid}:${cell.x}:${cell.y}`;
    const cbi = cell.cageBoxInfo as Record<string, any> | undefined;
    const cvo = (cbi?.cageBoxVo ?? cbi?.["cageBoxVo"] ?? {}) as Record<string, any>;
    let code = (cell as any).cageBoxCode ?? cbi?.cageBoxCode;
    if (!code) code = cvo.cageBoxCode ?? cvo["cageBoxCode"] ?? "";
    // 本地数据源的状态真相源是表单值（cage_info_value），得先拉一次；ARO 直接从 cageBoxInfo 推
    let fallback: Set<CageBoxAction> | null = null;
    if (dataSource === "local" && !scanCache.has(ck)) {
      const cageId = String((cell as any).id ?? (cell as any).animalCageId ?? "");
      const rows = cageId ? await fetchCageInfoValues(cageId).catch(() => null) : null;
      fallback = actionsFromFormValues(rows);
    }
    setScanCache((prev) => {
      const next = new Map(prev);
      const e = next.get(ck);
      const init = e ? e.initialActions : (fallback ?? actionsFromCageBoxInfo(cbi, cvo));
      const cur = new Set(e ? e.currentActions : init);
      if (on) cur.add(action); else cur.delete(action);
      // 改回原样就别留一条零差异的缓存：useEffect 会按它把批次条目摘掉，
      // 缓存却还挂着，下次点这格再加进批次时又会被它悄悄摘走。
      if (sameActions(cur, init)) next.delete(ck);
      else next.set(ck, e ? { ...e, currentActions: cur }
        : { cell, code, initialActions: init, currentActions: cur, images: [], notes: "" });
      return next;
    });
    setLastScannedKey(ck);
  }, [dataSource, scanCache]);
  /**
   * 状态模式拖放：fromZone 决定「拖回缓冲区」时撤销哪一个动作，
   * 拖到另一个区则把动作搬过去（先撤销来源、再落到新位置，所以重复拖是幂等的）。
   */
  const handleEditZoneDrop = useCallback((cageIds: string[], zoneKey: string | null, fromZone: string | null): boolean => {
    const to = parseStatusZone(zoneKey);
    const from = parseStatusZone(fromZone);
    // 只对「待提交」里的笼位生效：勾选集可能留着早已移出批次的陈旧 id，
    // 不挡的话会顺手给一个用户根本没打算动的笼位改状态（改完还会被同步 effect 拉进批次）。
    const staged = new Set(batchOf(pendingByMode, "edit").items.map((it) => it.cageId));
    let applied = 0;
    for (const id of cageIds) {
      if (!staged.has(id)) continue;
      const key = keyByCageId.get(id);
      const cell = key ? cellAtKey.get(key) : undefined;
      if (!key || !cell) { toast.error("该笼位不在当前视图，先切到它所在的笼架再操作"); continue; }
      const sid = key.split(":")[0] || "";
      if (from) void applyEditAction(cell, sid, from.action, !from.on);
      if (to) void applyEditAction(cell, sid, to.action, to.on);
      applied += 1;
    }
    // 陈旧的勾选项不算「没放成」，真正落地的有东西就可以清掉勾选
    return applied > 0;
  }, [applyEditAction, keyByCageId, cellAtKey, pendingByMode]);

  /**
   * 状态模式：条目连同它的编辑缓存一起摘掉。
   * 只摘批次的话，同步用的 useEffect 下一轮会按缓存把它加回来 —— 删了等于没删。
   */
  const removeEditItem = useCallback((cageId: string) => {
    const key = keyByCageId.get(cageId);
    patchPending("edit", (b) => removeItem(b, cageId));
    if (key) setScanCache((prev) => {
      if (!prev.has(key)) return prev;
      const n = new Map(prev); n.delete(key); return n;
    });
  }, [keyByCageId, patchPending]);

  /** cageId → 位置信息（加入待提交时用；跨房间，所以按全部已加载的架子建） */
  const itemMetaByCageId = useMemo(() => {
    const m = new Map<string, { label: string; shelveId: string; x: number; y: number; roomId: string | null }>();
    const add = (d: { shelfMeta?: Record<string, unknown>; grid?: unknown[] } | null | undefined) => {
      const meta = d?.shelfMeta as Record<string, unknown> | undefined;
      if (!meta) return;
      for (const raw of (d?.grid ?? []) as Array<Record<string, unknown>>) {
        const id = cageIdOfCell(raw);
        if (!id) continue;
        const pos = displayPosition(String(raw.position ?? `${raw.x}-${raw.y}`));
        m.set(id, {
          label: [meta.campusName, meta.roomName, meta.shelveName].filter(Boolean).join(" / ") + ` (${pos})`,
          shelveId: String(meta.shelveId ?? ""),
          x: Number(raw.x),
          y: Number(raw.y),
          roomId: meta.roomId != null ? String(meta.roomId) : null,
        });
      }
    };
    for (const d of details) add(d as never);
    add(shelfDetail as never);
    return m;
  }, [details, shelfDetail, cageIdOfCell]);

  /**
   * 状态模式：点格子进出「待提交」（状态靠拖到右侧色彩区标记）。
   * 撤销时连编辑缓存一起删 —— 只从批次里摘掉的话，useEffect 下一轮又按缓存把它加回来。
   */
  const handleEditToggle = useCallback((shelveId: string, x: number, y: number) => {
    const c = cellAtKey.get(`${shelveId}:${x}:${y}`);
    if (!c) return;
    const cageId = cageIdOfCell(c);
    if (!cageId) return;
    const ct = dataSource === "local" ? (c as any).cageTypeCode : (c as any).animalCageType;
    if (ct !== 3 && ct !== 4) { toast.error("当前状态不可编辑"); return; }
    if (batchOf(pendingByMode, "edit").items.some((it) => it.cageId === cageId)) {
      removeEditItem(cageId);
      return;
    }
    const meta = itemMetaByCageId.get(cageId);
    if (!meta) { toast.error("该笼位缺少位置信息，无法加入待提交"); return; }
    patchPending("edit", (b) => upsertItem(b, { cageId, ...meta }));
    // 点格子只入缓冲，不自动弹抽屉 —— 唯一自动弹的时机是「切进这个模式」（见 switchMode）
  }, [cellAtKey, cageIdOfCell, dataSource, pendingByMode, patchPending, itemMetaByCageId, removeEditItem]);

  /** 状态模式：从抽屉条目打开某笼位的状态编辑（全房间走弹窗，单笼架走右侧面板） */
  const openEditItemById = useCallback((cageId: string) => {
    const key = keyByCageId.get(cageId);
    if (!key) { toast.error("该笼位不在当前视图，请切到它所在笼架再编辑"); return; }
    const c = cellAtKey.get(key);
    if (!c) return;
    openEditCell(c, key.split(":")[0] || "");
  }, [keyByCageId, cellAtKey, openEditCell]);

  /** 抽屉里的缩略图查表：格子 + 笼架名 + （状态模式）编辑缓存 —— 两栏共用同一份，外观不会再漂 */
  const cellOfItem = useCallback(
    (it: PendingItem) => (it.x != null && it.y != null ? cellAtKey.get(`${it.shelveId}:${it.x}:${it.y}`) : undefined),
    [cellAtKey],
  );
  const shelfNameOfItem = useCallback((it: PendingItem) => shelfMetaBySid.get(it.shelveId)?.shelveName, [shelfMetaBySid]);
  const editCacheOfItem = useCallback((it: PendingItem): EditCacheEntry | undefined => {
    if (it.x == null || it.y == null) return undefined;
    const e = scanCache.get(`${it.shelveId}:${it.x}:${it.y}`);
    return e ? { initialActions: e.initialActions, currentActions: e.currentActions } : undefined;
  }, [scanCache]);

  /**
   * 「直接改」模式下把拖拽区罩灰 —— **不销毁**：区卡片、磁贴、布局都原样留着
   * （切回「拖色区」立刻能接着用，也不会因为组件来回挂载而丢滚动位置/尺寸）。
   *
   * 两种罩法：
   *   passClicks=false（色区）：遮罩自己吃指针事件 —— 彻底禁用，拖和点都进不去；
   *   passClicks=true （缓冲区）：只压灰不吃事件，磁贴仍可点开状态弹窗，
   *                             拖拽由 dragDisabled 单独关掉（只禁拖、不禁点）。
   */
  const maskWhenDirect = (node: React.ReactNode, { label = false, passClicks = false } = {}) => !editDirect ? node : (
    <div className="pointer-events-none relative flex min-h-0 flex-1 flex-col opacity-45">
      {node}
      <div className={`absolute inset-0 z-10 grid place-items-center rounded-twin-lg bg-[var(--twin-canvas)]/60 px-2 text-center text-[10px] font-semibold leading-snug text-[var(--twin-mute)] ${
        passClicks ? "pointer-events-none" : "pointer-events-auto"
      }`}>
        {label ? "直接改模式 · 已禁用" : null}
      </div>
    </div>
  );

  /** 点格子 = 加入待提交（不再直接弹窗/单条提交） */
  const addPendingFor = useCallback((cageId: string, extra?: Partial<PendingItem>) => {
    const meta = itemMetaByCageId.get(cageId);
    if (!meta) {
      toast.error("该笼位缺少位置信息，无法加入待提交");
      return;
    }
    patchPending(currentMode, (b) => upsertItem(b, { cageId, ...meta, ...extra }));
  }, [itemMetaByCageId, patchPending, currentMode]);
  // 转发给声明在前面的确认/归档处理函数（见 addPendingRef 声明处的说明）
  addPendingRef.current = addPendingFor;

  /**
   * 矩形范围内能选的笼位**一次性进缓冲**（框选两点 / Shift 矩形用）。
   * 保留原有矩形交互，只是落点从 selectedCells 换成待提交；范围内不合规的静默跳过（与原来一致）。
   */
  const addRangeToPending = useCallback((
    mode: string, shelveId: string, ax: number, ay: number, bx: number, by: number,
    accept: (c: unknown) => boolean,
  ) => {
    const minX = Math.min(ax, bx), maxX = Math.max(ax, bx);
    const minY = Math.min(ay, by), maxY = Math.max(ay, by);
    const adds: PendingItem[] = [];
    for (let cx = minX; cx <= maxX; cx++) {
      for (let cy = minY; cy <= maxY; cy++) {
        const c = cellAtKey.get(`${shelveId}:${cx}:${cy}`);
        if (!c || !accept(c)) continue;
        const cageId = cageIdOfCell(c);
        if (!cageId) continue;
        const meta = itemMetaByCageId.get(cageId);
        if (!meta) continue;
        adds.push({ cageId, ...meta });
      }
    }
    if (adds.length === 0) return;
    patchPending(mode, (b) => adds.reduce((acc, it) => upsertItem(acc, it), b));
  }, [cellAtKey, cageIdOfCell, itemMetaByCageId, patchPending]);
  addRangeRef.current = addRangeToPending;

  /**
   * 把当前勾选转移进「待提交」缓冲。
   * 勾选方式完全不变（单击 / Shift 矩形 / 框选），只是把**提交点**从「选完即提交」
   * 挪到抽屉里 —— 这样才能跨房间攒着一次交，也不必给每个模式重写一套选择逻辑。
   */
  const commitSelectionToPending = useCallback(() => {
    const ids = selectedCageIds();
    if (ids.length === 0) { toast.error("请先勾选笼位"); return; }
    let added = 0;
    for (const id of ids) {
      const meta = itemMetaByCageId.get(id);
      if (!meta) continue;
      patchPending(currentMode, (b) => upsertItem(b, { cageId: id, ...meta }));
      added += 1;
    }
    if (added === 0) { toast.error("选中的笼位缺少位置信息，无法加入待提交"); return; }
    setSelectedCells(new Set());
    anchorCellRef.current = null;
  }, [selectedCageIds, itemMetaByCageId, patchPending, currentMode]);

  /**
   * 各模式的「逐条提交」实现，统一返回 per-id 结果供抽屉汇总失败。
   * 复用现有 API，不改它们的签名；只是不再由页面直接 toast，改由 submitPending 汇总。
   */
  const runReservePending = useCallback(async (
    items: PendingItem[],
  ): Promise<SubmitResult[]> => {
    const rows: SubmitResult[] = [];
    // 只按人员分组：assignBatchCages 不接收房间/笼架，再拆只会多出无意义的调用。
    const groups = groupItems(items, (it) => it.assigneeAccountId ?? "");
    for (const g of groups.values()) {
      const first = g[0]!;
      const accountId = first.assigneeAccountId ?? "";
      const ids = g.map((it) => it.cageId);
      if (!accountId || !(accountId in reservePersons)) {
        ids.forEach((cageId) => rows.push({ cageId, ok: false, reason: "未指定预定人员" }));
        continue;
      }
      // assignBatchCages 本来就返回 per-id {ok,error}，直接搬过来
      const res = await assignBatchCages(ids, accountId);
      for (const r of res) rows.push({ cageId: String(r.animalCageId), ok: !!r.ok, reason: r.error });
    }
    return rows;
  }, [reservePersons]);

  /**
   * 分配 / 撤销分配：按「房间 + 笼架 + AUP」分组调用（两个接口都是 room+shelf+cageIds 的形状）。
   * 缓冲可以跨房间，所以房间取每个条目自己的 roomId，不取当前选中的房间。
   * 取消分配类（空笼盒）不需要 AUP；同一组的目标 AUP 才能合成一次调用。
   */
  const runAllocatePending = useCallback(async (
    items: PendingItem[],
  ): Promise<SubmitResult[]> => {
    const rows: SubmitResult[] = [];
    const groups = groupItems(items, (it) =>
      it.kind === "cancel"
        ? `${it.roomId ?? ""}:${it.shelveId}:@cancel`
        : `${it.roomId ?? ""}:${it.shelveId}:${it.aupId ?? ""}`,
    );
    for (const g of groups.values()) {
      const first = g[0]!;
      const ids = g.map((it) => it.cageId);
      const gAupId = first.aupId ?? "";
      const aup = aupList.find((x) => String(x.id) === String(gAupId));
      const fail = (reason: string) => ids.forEach((cageId) => rows.push({ cageId, ok: false, reason }));
      try {
        if (first.kind === "cancel") {
          if (dataSource === "local") await localCancelAllocate(ids);
          else await cancelCageAssignment(ids, String(first.roomId ?? aRid ?? "") || undefined);
        } else {
          if (!gAupId) { fail("未指定 AUP"); continue; }
          if (dataSource === "local") {
            await localAllocate(ids, gAupId, String(first.roomId ?? ""), first.shelveId, aup?.piName || "", aup?.registerNo || "");
          } else {
            await assignCages(String(first.roomId ?? ""), first.shelveId, ids, gAupId, aup?.registerNo);
          }
        }
        ids.forEach((cageId) => rows.push({ cageId, ok: true }));
      } catch (e) {
        fail(e instanceof Error ? e.message : "提交失败");
      }
    }
    return rows;
  }, [aRid, aupList, dataSource]);

  /** 划分：按人员分组，每组一次 saveCageDivision（接口一次一人），逐条汇总结果 */
  const runDivisionPending = useCallback(async (items: PendingItem[]): Promise<SubmitResult[]> => {
    const rows: SubmitResult[] = [];
    const groups = groupItems(items, (it) => it.assigneeAccountId ?? "");
    for (const g of groups.values()) {
      const first = g[0]!;
      const accountId = first.assigneeAccountId ?? "";
      const ids = g.map((it) => it.cageId);
      const name = divisionPersons[accountId];
      if (!accountId || !name) { ids.forEach((cageId) => rows.push({ cageId, ok: false, reason: "未指定划分人员" })); continue; }
      try {
        await saveCageDivision(ids, [{ id: accountId, name }]);
        ids.forEach((cageId) => rows.push({ cageId, ok: true }));
      } catch (e) {
        const reason = e instanceof Error ? e.message : "保存划分失败";
        ids.forEach((cageId) => rows.push({ cageId, ok: false, reason }));
      }
    }
    return rows;
  }, [divisionPersons]);

  /**
   * 状态模式：把编辑缓存里的差异同步进 edit 批次（缓存的 currentActions 就是「目标状态全集」）。
   *
   * 两条规则保证批次与缓存永不脱节：
   *   1) 缓存里**有**的笼位：按差异更新；改回原样只清差异，条目留在「待提交」（用户是显式暂存它的）；
   *   2) 缓存里**没有**的笼位：一律不许带差异 —— 缓存被删掉（拖出色区撤销）后，
   *      批次若还留着那份差异，就成了「磁贴挂在色区里、网格却没颜色」的幽灵条目。
   */
  useEffect(() => {
    // 「直接改」模式不碰缓存：同步一关，切过去时已攒的那批也不会被误清
    if (!editStaged) return;
    patchPending("edit", (b) => {
      let next = b;
      const cached = new Set<string>();
      for (const [key, e] of scanCache) {
        const cageId = String((e.cell as any)?.id ?? (e.cell as any)?.animalCageId ?? "");
        if (!cageId) continue;
        cached.add(cageId);
        const meta = itemMetaByCageId.get(cageId);
        if (!meta || !next.items.some((x) => x.cageId === cageId)) continue;
        const toAdd = [...e.currentActions].filter((a) => !e.initialActions.has(a));
        const toRemove = [...e.initialActions].filter((a) => !e.currentActions.has(a));
        next = upsertItem(next, toAdd.length || toRemove.length
          ? {
              cageId, ...meta,
              shelveId: key.split(":")[0] || meta.shelveId,
              cageBoxCode: e.code,
              actions: toAdd,
              removedActions: toRemove,
            }
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
  }, [scanCache, editStaged, itemMetaByCageId, patchPending]);

  /**
   * 状态模式：逐笼位提交动作。
   * 与 handleEditSubmit 同一条逻辑（local 走 localEdit；ARO 走 executeCageBoxAction /
   * cancelCageBoxColor，无取消色的动作跳过），只是按笼位汇总结果而不是逐条 toast。
   */
  const runEditPending = useCallback(async (items: PendingItem[]): Promise<SubmitResult[]> => {
    const rows: SubmitResult[] = [];
    for (const it of items) {
      const adds = it.actions ?? [];
      const removes = it.removedActions ?? [];
      const roomId = String(it.roomId ?? aRid ?? "");
      try {
        if (dataSource === "local") {
          for (const a of adds) await localEdit(it.cageId, cageBoxAction(a as CageBoxAction).statusField, true, it.cageBoxCode);
          for (const a of removes) await localEdit(it.cageId, cageBoxAction(a as CageBoxAction).statusField, false, it.cageBoxCode);
        } else {
          for (const a of adds) {
            await executeCageBoxAction({ roomId, shelveId: it.shelveId, cageBoxCode: it.cageBoxCode ?? "", action: a as CageBoxAction });
          }
          for (const a of removes) {
            // 合笼/动物转移是本地状态，ARO 无对应取消色 → 跳过（与 handleEditSubmit 一致）
            const color = ACTION_CANCEL_COLOR[a as CageBoxAction];
            if (color === undefined) continue;
            await cancelCageBoxColor(roomId, it.shelveId, it.cageBoxCode ?? "", color);
          }
        }
        rows.push({ cageId: it.cageId, ok: true });
      } catch (e) {
        rows.push({ cageId: it.cageId, ok: false, reason: e instanceof Error ? e.message : "操作失败" });
      }
    }
    return rows;
  }, [dataSource, aRid]);

  /* ═══════════════════════════════════════════════════════════
     状态模式「直接改」—— 点格子开原状态弹窗，点一下立刻写服务端
     （editDirect / editStaged 声明在组件顶部的状态区）
     ═══════════════════════════════════════════════════════════ */
  const [editDirectBusy, setEditDirectBusy] = useState(false);

  /**
   * 直接改：把单个笼位的一个动作**立刻**写进服务端（复用提交用的 runEditPending，local/ARO 两条路都覆盖）。
   *
   * 刻意不写 scanCache —— 缓存一有差异，同步 effect 就会把这笼位拉进「待提交」，
   * 那就又绕回缓存了。写完刷新网格与表单值，界面上的颜色直接来自服务端。
   */
  const applyEditActionNow = useCallback(async (
    cell: CageShelfCell, sid: string, action: CageBoxAction, on: boolean,
  ) => {
    const cageId = cageIdOfCell(cell);
    const meta = cageId ? itemMetaByCageId.get(cageId) : undefined;
    if (!cageId || !meta) { toast.error("该笼位缺少 ID 或位置信息，无法直接修改"); return; }
    const cbi = cell.cageBoxInfo as Record<string, any> | undefined;
    const cvo = (cbi?.cageBoxVo ?? cbi?.["cageBoxVo"] ?? {}) as Record<string, any>;
    let code = (cell as any).cageBoxCode ?? cbi?.cageBoxCode;
    if (!code) code = cvo.cageBoxCode ?? cvo["cageBoxCode"] ?? "";
    setEditDirectBusy(true);
    try {
      const [r] = await runEditPending([{
        cageId, ...meta, shelveId: sid, cageBoxCode: code,
        actions: on ? [action] : [],
        removedActions: on ? [] : [action],
      }]);
      if (!r?.ok) { toast.error(r?.reason || "操作失败"); return; }
      toast.success(on ? "已标记" : "已取消");
      setLastScannedKey(`${sid}:${cell.x}:${cell.y}`);
      setDetailReloadKey((k) => k + 1);
      if (dataSource === "local") fetchCageInfoValues(cageId).then(setEditFormValues).catch(() => {});
    } finally {
      setEditDirectBusy(false);
    }
  }, [cageIdOfCell, itemMetaByCageId, runEditPending, dataSource]);

  /**
   * 状态弹窗 / 单笼架面板里点一个状态。
   * 两条入口共用这一份，行为不会再分叉；`has` 是点之前该状态是否已标记，决定这是标记还是取消。
   */
  const toggleEditStatus = useCallback((cell: CageShelfCell, sid: string, action: CageBoxAction, has: boolean) => {
    if (editDirect) { void applyEditActionNow(cell, sid, action, !has); return; }
    const ck = `${sid}:${cell.x}:${cell.y}`;
    const cbi = cell.cageBoxInfo as Record<string, any> | undefined;
    const cvo = (cbi?.cageBoxVo ?? cbi?.["cageBoxVo"] ?? {}) as Record<string, any>;
    let code = (cell as any).cageBoxCode ?? cbi?.cageBoxCode;
    if (!code) code = cvo.cageBoxCode ?? cvo["cageBoxCode"] ?? "";
    setScanCache((prev) => {
      const next = new Map(prev);
      const e = next.get(ck);
      const init = e ? e.initialActions : (dataSource === "local" ? actionsFromFormValues(editFormValues) : actionsFromCageBoxInfo(cbi, cvo));
      const cur = new Set(e ? e.currentActions : init);
      if (has) cur.delete(action); else cur.add(action);
      next.set(ck, e
        ? { ...e, currentActions: cur }
        : { cell, code, initialActions: init, currentActions: cur, images: [], notes: "" });
      return next;
    });
    setLastScannedKey(ck);
  }, [editDirect, applyEditActionNow, dataSource, editFormValues]);

  /** 统一提交入口：逐条跑 → 成功的移出缓冲、失败的留在列表里并写明原因 */
  const submitPending = useCallback(async () => {
    const items = pending.items;
    if (items.length === 0) return;
    const ids = items.map((i) => i.cageId);
    setPendingBusy(true);
    let results: SubmitResult[] = [];
    try {
      switch (currentMode) {
        case "reserve": {
          results = await runReservePending(items);
          break;
        }
        case "allocate": {
          results = await runAllocatePending(items);
          break;
        }
        case "division": {
          results = await runDivisionPending(items);
          break;
        }
        case "edit": {
          results = await runEditPending(items);
          // 提交成功的笼位在服务端已经是新状态了：缓存留着的话，
          // 同步 effect 下一轮又会拿它把条目加回待提交，用户会看到「交完又回来了」。
          const done = new Set(results.filter((r) => r.ok).map((r) => r.cageId));
          if (done.size > 0) {
            setScanCache((prev) => {
              const n = new Map(prev);
              for (const [k, e] of n) if (done.has(cageIdOfCell(e.cell))) n.delete(k);
              return n;
            });
          }
          break;
        }
        case "confirm": {
          // 到场确认：逐条（后端只有单条接口）
          const rows: SubmitResult[] = [];
          for (const it of items) {
            if (it.claimId == null) { rows.push({ cageId: it.cageId, ok: false, reason: "缺少认领信息" }); continue; }
            try { await adminConfirmClaim(it.claimId); rows.push({ cageId: it.cageId, ok: true }); }
            catch (e) { rows.push({ cageId: it.cageId, ok: false, reason: e instanceof Error ? e.message : "确认失败" }); }
          }
          results = rows;
          break;
        }
        case "archive": {
          // 归档：逐条（后端只有单条接口）；原因取抽屉参数区的输入
          const reason = (pending.params.reason as string | undefined) || undefined;
          const rows: SubmitResult[] = [];
          for (const it of items) {
            try { await archiveCage(it.cageId, reason); rows.push({ cageId: it.cageId, ok: true }); }
            catch (e) { rows.push({ cageId: it.cageId, ok: false, reason: e instanceof Error ? e.message : "归档失败" }); }
          }
          results = rows;
          break;
        }
        default:
          toast.error(`「${currentMode}」模式还没接入待提交`);
          return;
      }
    } catch (e) {
      // 整体失败（网络/接口异常）：整批记为失败，原因写进抽屉
      const reason = e instanceof Error ? e.message : "提交失败";
      results = ids.map((cageId) => ({ cageId, ok: false, reason }));
    } finally {
      setPendingBusy(false);
    }
    const sum = summarize(results);
    patchPending(currentMode, (b) => applyResults(b, results));
    if (sum.failed === 0) toast.success(`已提交 ${sum.ok} 个`);
    else toast.error(`${sum.ok} 个成功、${sum.failed} 个失败（原因见抽屉）`);
    setDetailReloadKey((k) => k + 1);
  }, [pending, currentMode, runReservePending, runAllocatePending, runDivisionPending, runEditPending, patchPending, cageIdOfCell]);
  /**
   * 横向程序坞贴底铺开，会压住内容区底部 —— 给**滚动容器的内容末尾**补一段留白：
   * 平时照常滚动、被盖住就往下滚，滚到底才多出这段空白，不是常驻的留白带。
   * 圈圈形态收缩时就一个小圆钮，遮不了多少，不需要留白。
   * 注意别加进每个笼架容器内部 —— 那样每个架子底部都会多一块空。
   */
  const islandBottomPad = canEdit && islandVariant === "dock" ? 88 : 0;
  const islandPadStyle = islandBottomPad ? { paddingBottom: islandBottomPad } : undefined;
  /** 悬浮岛锚点 = 右侧内容区（不是整个页面，否则会被左侧入口列表带偏） */
  const rightPanelRef = useRef<HTMLDivElement | null>(null);
  // 模式中文名映射现在统一在 CageModeIsland 的 CAGE_MODE_META 里（名称+说明一处维护）

  const viewOnly = currentMode === "view";

  // 同步保护：笼架详情里不带 floorId，从树数据补 roomId → floorId，供网格拼出完整锁链
  const roomFloorMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of fullTree ?? []) {
      const rid = String((r as any).roomId ?? "");
      const fid = String((r as any).floorId ?? "");
      if (rid && fid) m.set(rid, fid);
    }
    return m;
  }, [fullTree]);

  // 同步前二次确认：拉锁清单，并把 ID 映射成人类可读的名字（CELL 级只有 ID，保持原样）
  const { data: syncLocks = [] } = useQuery({
    queryKey: ["cageSyncLocks"],
    queryFn: fetchSyncLocks,
    enabled: syncConfirmOpen,
    staleTime: 30_000,
  });
  const lockSummary = useMemo(() => {
    const floorName = new Map<string, string>(), roomName = new Map<string, string>(), shelfName = new Map<string, string>();
    for (const r of fullTree ?? []) {
      const f = String((r as any).floorId ?? ""), rm = String((r as any).roomId ?? ""), s = String((r as any).shelveId ?? "");
      if (f) floorName.set(f, String((r as any).floorName ?? f));
      if (rm) roomName.set(rm, String((r as any).roomName ?? rm));
      if (s) shelfName.set(s, String((r as any).shelveName ?? s));
    }
    const groups: Record<string, string[]> = { FLOOR: [], ROOM: [], SHELF: [], CELL: [] };
    let whitelist = 0;
    for (const l of syncLocks) {
      if (!l.locked) { whitelist++; continue; }
      const k = l.scopeKey;
      if (l.scopeType === "FLOOR") groups.FLOOR.push(floorName.get(k) ?? `楼层 ${k}`);
      else if (l.scopeType === "ROOM") groups.ROOM.push(roomName.get(k) ?? `房间 ${k}`);
      else if (l.scopeType === "SHELF") groups.SHELF.push(shelfName.get(k) ?? `笼架 ${k}`);
      else groups.CELL.push(`笼位 ${k}`);
    }
    return {
      groups,
      whitelist,
      total: groups.FLOOR.length + groups.ROOM.length + groups.SHELF.length + groups.CELL.length,
    };
  }, [syncLocks, fullTree]);

  // ═══════════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════════
  return<SyncLockProvider roomFloor={roomFloorMap}><AdminPageShell>
    <style>{`
      .cage-scroll::-webkit-scrollbar{width:4px;height:4px}
      .cage-scroll::-webkit-scrollbar-track{background:transparent}
      .cage-scroll::-webkit-scrollbar-thumb{background:var(--twin-hairline);border-radius:4px}
      .cage-scroll::-webkit-scrollbar-thumb:hover{background:var(--twin-mute)}
      @keyframes scan-flash{0%{opacity:0.2;transform:scale(0.95)}30%{opacity:0.85;transform:scale(1.03)}100%{opacity:0.35;transform:scale(1)}}
      .scan-flash-overlay{animation:scan-flash 0.5s ease-in-out 2;pointer-events:none;border-radius:var(--twin-radius-md)}
    `}</style>
    <div className="flex gap-2" style={{height:"calc(100vh - var(--admin-chrome-offset) - 8px)"}}>
      {/* ======== LEFT PANEL ======== */}
      <div className={`shrink-0 flex-col gap-1.5 transition-all h-full ${collapsed?'hidden':'flex w-48 xl:w-52'}`}>
        {!collapsed&&<div className="shrink-0 flex items-center gap-1 rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-1.5 py-1">
          <Search className="h-3.5 w-3.5 shrink-0 text-[var(--twin-mute)]"/><input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="搜索房间 / 笼架…" className="flex-1 min-w-0 bg-transparent text-[11px] outline-none text-[var(--twin-ink)] placeholder:text-[var(--twin-mute)]"/>
        </div>}
        {!collapsed&&<div className="cage-scroll flex-1 min-h-0 overflow-y-auto overflow-x-hidden rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-1.5 [scrollbar-width:thin] [scrollbar-color:var(--twin-hairline)_transparent]">
          {tab==="filter"&&<CampusTree tree={tree} exp={exp} search={search} onToggle={k=>setExp(p=>{const n=new Set(p);n.has(k)?n.delete(k):n.add(k);return n;})} onOpenRoom={onOpenRoom} viewMode={viewMode} onOpenShelf={onOpenShelf} alertStatusesByShelf={alertStatusesByShelf} alertStatusesByRoom={alertStatusesByRoom} pageMode={pageMode} bookingRooms={bookingRooms} highlightShelveIds={selectableShelveIds}/>}
          {tab==="bookmarks"&&<>
            {bmLoading&&<div className="text-[var(--twin-mute)] py-4 text-center text-[11px]">加载中…</div>}
            {!bmLoading&&bmList.length===0&&<div className="text-[var(--twin-mute)] py-4 text-center text-[11px]">暂无收藏</div>}
            {!bmLoading&&bmList.map(b=><button key={`${b.roomId}-${b.shelveId}`} onClick={()=>{setTab("filter");onOpenRoom(String(b.roomId),b.roomName);}}
              className="w-full text-left rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1.5 mb-1 hover:border-[var(--twin-hairline-strong)] transition">
              <div className="flex items-center gap-1"><Star className="h-2.5 w-2.5 shrink-0 fill-amber-400 text-amber-400"/><span className="truncate text-[11px] font-medium text-[var(--twin-ink)]">{b.shelveName||b.shelveId}</span></div>
              <div className="text-[10px] text-[var(--twin-mute)] mt-0.5">{b.campusName} · {b.roomName}</div>
            </button>)}
          </>}
        </div>}
      </div>

      {/* ======== RIGHT PANEL ======== */}
      <div ref={rightPanelRef} className="relative flex-1 min-w-0 grid grid-rows-[auto_1fr] h-full pr-1 overflow-hidden">
        <div className="shrink-0 space-y-2">
        {scan&&scan.status!=="idle"&&!scanDismissed&&<CageScanProgressBanner progress={scan} onDismiss={()=>setScanDismissed(true)}/>}
        {/* Top toolbar: tabs + view mode + actions */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <button type="button" onClick={()=>setCollapsed(v=>!v)} className="shrink-0 rounded p-1 text-[var(--twin-mute)] hover:text-[var(--twin-ink)] hover:bg-[var(--twin-canvas)]" title={collapsed?"展开侧栏":"收起侧栏"}>{collapsed?<PanelLeft className="h-4 w-4"/>:<PanelLeftClose className="h-4 w-4"/>}</button>
            <div className="flex items-center gap-1 rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-1">
              <button type="button" onClick={()=>setTab("bookmarks")} className={`flex items-center gap-1 rounded-twin-md px-2.5 py-1 text-[11px] font-semibold transition ${tab==="bookmarks"?"bg-[var(--twin-link-deep)] text-white shadow-sm":"text-[var(--twin-mute)] hover:text-[var(--twin-ink)]"}`}><Star className="h-3 w-3"/>收藏</button>
              <button type="button" onClick={() =>setTab("filter")} className={`flex items-center gap-1 rounded-twin-md px-2.5 py-1 text-[11px] font-semibold transition ${tab==="filter"?"bg-[var(--twin-link-deep)] text-white shadow-sm":"text-[var(--twin-mute)] hover:text-[var(--twin-ink)]"}`}><LayoutGrid className="h-3 w-3"/>筛选</button>
            </div>
            {tab==="filter"&&pageMode!=="booking"&&<div className="flex items-center gap-1 rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-1">
              <button type="button" onClick={() =>setViewMode("room")} className={`rounded-twin-md px-2.5 py-1 text-[11px] font-semibold transition ${viewMode==="room"?"bg-[var(--twin-link-deep)] text-white shadow-sm":"text-[var(--twin-mute)] hover:text-[var(--twin-ink)]"}`}>全房间</button>
              <button type="button" onClick={() =>setViewMode("shelf")} className={`rounded-twin-md px-2.5 py-1 text-[11px] font-semibold transition ${viewMode==="shelf"?"bg-[var(--twin-link-deep)] text-white shadow-sm":"text-[var(--twin-mute)] hover:text-[var(--twin-ink)]"}`}>单笼架</button>
            </div>}
            {/* 模式切换已移到页面右下/底部的「模式悬浮岛」（见文件末尾 CageModeIsland） */}
            {pageMode==="allocate"&&realtimeMeta&&dataSource!=="local"&&<div className="flex items-center gap-1 rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-1">
              <span className="text-[10px] text-[var(--twin-mute)] ml-0.5">{realtimeMeta.fromRealtime?"✅ 实时":"📦 缓存"}{realtimeMeta.cachedAt?" · "+realtimeMeta.cachedAt.substring(11,19):""}</span>
              <button onClick={async()=>{if(!aRid)return;try{const r=await forceRealtimeRefresh(aRid);setDetails(r.shelves??[]);setRealtimeMeta({fromRealtime:r.fromRealtime,cachedAt:r.cachedAt});toast.success("已刷新");}catch(e:any){toast.error("刷新失败");}}}
                className="rounded-twin-md px-1.5 py-0.5 text-[10px] font-bold bg-blue-500 text-white hover:bg-blue-600 ml-1" title="强制刷新房间数据">↻</button>
            </div>}
            {/* 扫码定位笼位 */}
              <button type="button" onClick={()=>setScanLockOpen(true)}
                className="flex items-center gap-1 rounded-twin-md px-2.5 py-1 text-[10px] font-semibold text-[var(--twin-mute)] hover:text-[var(--twin-ink)] border border-[var(--twin-hairline)] ml-1"
                title="扫码定位笼位（支持笼盒码/笼位ID）"><QrCode className="size-3.5"/> 扫码定位</button>
              {pageMode==="booking"&&realtimeMeta&&dataSource!=="local"&&(
                <span className="text-[10px] text-[var(--twin-mute)] ml-0.5">🖥️ {realtimeMeta.fromRealtime?"实时":"缓存"}{realtimeMeta.cachedAt?" · "+realtimeMeta.cachedAt.substring(11,19):""}</span>
              )}
              {editMode&&realtimeMeta&&dataSource!=="local"&&(<>
                <span className="text-[10px] text-[var(--twin-mute)] ml-0.5">🔧 {realtimeMeta.fromRealtime?"实时":"缓存"}{realtimeMeta.cachedAt?" · "+realtimeMeta.cachedAt.substring(11,19):""}</span>
                <button onClick={async()=>{if(!aRid)return;try{const r=await forceRealtimeRefresh(aRid);setDetails(r.shelves??[]);setRealtimeMeta({fromRealtime:r.fromRealtime,cachedAt:r.cachedAt});toast.success("已刷新");}catch(e:any){toast.error("刷新失败");}}}
                  className="rounded-twin-md px-1.5 py-0.5 text-[10px] font-bold bg-blue-500 text-white hover:bg-blue-600 ml-1" title="强制刷新房间数据">↻</button>
              </>)}
              {confirmMode&&realtimeMeta&&dataSource!=="local"&&(<>
                <span className="text-[10px] text-blue-600 ml-0.5">📷 {realtimeMeta.fromRealtime?"实时":"缓存"}{realtimeMeta.cachedAt?" · "+realtimeMeta.cachedAt.substring(11,19):""}</span>
                <button onClick={async()=>{if(!aRid)return;try{const r=await forceRealtimeRefresh(aRid);setDetails(r.shelves??[]);setRealtimeMeta({fromRealtime:r.fromRealtime,cachedAt:r.cachedAt});toast.success("已刷新");}catch(e:any){toast.error("刷新失败");}}}
                  className="rounded-twin-md px-1.5 py-0.5 text-[10px] font-bold bg-blue-500 text-white hover:bg-blue-600 ml-1" title="强制刷新房间数据">↻</button>
              </>)}
              {pageMode==="booking"&&<AupSearchBar onSelectRoom={(rid,rname)=>{onOpenRoom(rid,rname);expandToRoom(rid);}}/>}
              {pageMode==="booking"&&<button type="button" onClick={handleBookingSync} disabled={bookingSyncing}
                className="flex items-center gap-1 rounded-twin-md px-2.5 py-1 text-[11px] font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition">
                {bookingSyncing?<Loader2 className="h-3 w-3 animate-spin"/>:null}🔄 同步 ARO
              </button>}
              {pageMode==="allocate"&&<button type="button" onClick={()=>{setBoxSelectMode(v=>!v);boxSelectAnchorRef.current=null;}}
                className={`rounded-twin-md px-2 py-1 text-[11px] font-semibold transition ${boxSelectMode?"bg-amber-500 text-white shadow-sm":"text-[var(--twin-mute)] hover:text-[var(--twin-ink)] border border-dashed border-[var(--twin-hairline)]"}`}>
                {boxSelectMode?"框选中 · 点击两格":"⬜ 矩形框选"}
              </button>}
              {divisionMode&&<>
                <span className="ml-1 text-[10px] font-semibold text-[var(--twin-mute)]">待提交 {batchOf(pendingByMode,"division").items.length} 个笼位</span>
                <button type="button" onClick={()=>{setBoxSelectMode(v=>!v);boxSelectAnchorRef.current=null;}}
                  className={`rounded-twin-md px-2 py-1 text-[11px] font-semibold transition ${boxSelectMode?"bg-amber-500 text-white shadow-sm":"text-[var(--twin-mute)] hover:text-[var(--twin-ink)] border border-dashed border-[var(--twin-hairline)]"}`}>
                  {boxSelectMode?"框选中 · 点击两格":"⬜ 矩形框选"}
                </button>
              </>}
          </div>
          <div className="flex items-center gap-1">
            {/* 本地模式：超管一键顺序同步（仅查看模式可见） */}
            {viewOnly&&dataSource==="local"&&isSuperAdmin&&(
              /* 同步相关操作统一收进一个下拉，避免工具栏平铺 */
              <SyncMenu
                busy={localPipelineSyncing||scan?.status==="running"}
                canRoom={!!aRid}
                roomLabel={aRname||aRid}
                onSyncAll={()=>{setSyncScope("all");setSyncConfirmOpen(true);}}
                onSyncRoom={()=>{setSyncScope("room");setSyncConfirmOpen(true);}}
                onCellIdSync={()=>setCellIdSyncOpen(true)}
              />
            )}
            {/* ---- 查看模式控件（本地模式/分配/预约/编辑时隐藏） ---- */}
            {viewOnly&&dataSource!=="local"&&<>
              <div className="flex items-stretch rounded-twin-md border border-[var(--twin-hairline)] overflow-hidden mr-1">
                <button type="button" onClick={() => { setConfigMode("auto"); localStorage.setItem("cageAlertConfigMode","auto"); }}
                  className={`px-2 py-1 text-[10px] font-bold transition ${configMode==="auto"?"bg-[var(--twin-link-deep)] text-white":"bg-[var(--twin-canvas)] text-[var(--twin-mute)]"}`}>自动</button>
                <button type="button" onClick={() => { setConfigMode("manual"); localStorage.setItem("cageAlertConfigMode","manual"); }}
                  className={`px-2 py-1 text-[10px] font-bold transition ${configMode==="manual"?"bg-orange-500 text-white":"bg-[var(--twin-canvas)] text-[var(--twin-mute)]"}`}>手动</button>
                <button type="button" onClick={() => { setConfigMode("off"); localStorage.setItem("cageAlertConfigMode","off"); }}
                  className={`px-2 py-1 text-[10px] font-bold transition ${configMode==="off"?"bg-slate-400 text-white":"bg-[var(--twin-canvas)] text-[var(--twin-mute)]"}`}>关闭</button>
              </div>
              <a href={toAdminRoutePath("/admin/cage-shelves/special-status")} onClick={e=>{e.preventDefault();nav(toAdminRoutePath("/admin/cage-shelves/special-status"));}} className="rounded-twin-md px-2.5 py-1 text-[11px] font-semibold no-underline bg-[var(--twin-link-deep)] text-white hover:opacity-90 transition">特殊状态总览</a>
              {batchList.length > 0 && (
                <select
                  className={`rounded-twin-md border px-2 py-1 text-[11px] font-semibold transition ${selectedBatchId ? 'bg-amber-100 border-amber-400 text-amber-900' : 'bg-[var(--twin-canvas)] border-[var(--twin-hairline)] text-[var(--twin-ink)]'}`}
                  value={selectedBatchId}
                  onChange={(e) => { const v = e.target.value; setSelectedBatchId(v); setConfigMode("off"); localStorage.setItem("cageAlertConfigMode","off"); localStorage.setItem("cageCompareCurrent", v); }}
                >
                  {batchList.map((b) => (
                    <option key={b.scanBatchId} value={b.scanBatchId}>
                      {b.scannedAt?.substring(0, 16)?.replace("T", " ")} · {b.abnormalRows}异常/{b.shelfCount}架
                    </option>
                  ))}
                </select>
              )}
            </>}

            {/* ---- 分配模式：提交在右侧抽屉里，这里只显示待提交数 ---- */}
            {pageMode==="allocate"&&<span className="text-[10px] text-[var(--twin-mute)] ml-1 select-none">待提交 {batchOf(pendingByMode,"allocate").items.length} 个笼位 · 点格子选中/取消，{boxSelectMode?"框选中（点两格）":"可用矩形框选"}</span>}
            {/* ---- 认领模式：同上，提交在抽屉里 ---- */}
            {reserveMode&&<span className="text-[10px] text-[var(--twin-mute)] ml-1 select-none">待提交 {batchOf(pendingByMode,"reserve").items.length} 个笼位 · 点格子直接选中可认领的 type2 笼位</span>}
            {pageMode==="allocate"&&!boxSelectMode&&<span className="text-[10px] text-[var(--twin-mute)] ml-1 select-none">🖱️ 点击选中 · <kbd className="text-[9px] px-0.5 py-px rounded border border-[var(--twin-hairline)] bg-[var(--twin-canvas)]">Shift</kbd>+点击 矩形多选</span>}
            {boxSelectMode&&<span className="text-[10px] text-amber-600 font-medium ml-1 select-none animate-pulse">⬜ 请点击第一个笼位设置框选起点</span>}

            {/* ── 编辑模式操作按钮（扫码由常驻「扫码定位」联动） ── */}
            {editMode&&<>
              <button type="button" onClick={()=>{setScanCache(new Map());setLastScannedKey(null);patchPending("edit",()=>clearBatch());}}
                className="rounded-twin-md px-3 py-1.5 text-[11px] font-semibold text-slate-500 bg-slate-100 border border-slate-200 hover:bg-slate-200 hover:text-slate-700 transition">清除</button>
            </>}
            {/* ── 扫码确认模式：由常驻「扫码定位」联动判定，无专用输入 ── */}
            {/* 记录：查看模式可见；表单管理 / 修正占用：仅平台所有者可见（与其它平台管理者入口同口径） */}
            {viewOnly&&<a href={toAdminRoutePath("/admin/cage-shelves/records")} onClick={e=>{e.preventDefault();nav(toAdminRoutePath("/admin/cage-shelves/records"));}} className="rounded-twin-md px-2.5 py-1 text-[11px] font-semibold no-underline border border-[var(--twin-hairline)] text-[var(--twin-ink)] hover:bg-[var(--twin-canvas)] transition">记录</a>}
            {isPlatformOwner&&<a href={toAdminRoutePath("/admin/cage-shelves/forms")} onClick={e=>{e.preventDefault();nav(toAdminRoutePath("/admin/cage-shelves/forms"));}} className="rounded-twin-md px-2.5 py-1 text-[11px] font-semibold no-underline bg-[var(--twin-primary)] text-white hover:opacity-90 transition">表单管理</a>}
            {isPlatformOwner&&<button type="button" onClick={handleReconcileOccupancy} className="rounded-twin-md px-2.5 py-1 text-[11px] font-semibold border border-[var(--twin-hairline)] text-[var(--twin-ink)] hover:bg-[var(--twin-canvas)] transition">修正占用</button>}
            <button type="button" onClick={()=>setLegend(v=>!v)} className={`flex items-center gap-1 rounded-twin-md px-2 py-1 text-[10px] transition ${legend?'bg-[var(--twin-link-deep)] text-white':'text-[var(--twin-mute)] hover:text-[var(--twin-ink)]'}`}><Info className="h-3 w-3"/>图例{legend?' ▲':' ▼'}</button>
            {canOpenSettings&&<button type="button" onClick={()=>setSettingsOpen(true)} className="flex items-center gap-1 rounded-twin-md px-2 py-1 text-[10px] transition text-[var(--twin-mute)] hover:text-[var(--twin-ink)]" title="设置中心"><Settings2 className="h-3 w-3"/>设置</button>}
          </div>
        </div>
        {legend&&<CageShelfLegend/>}
        {opActive&&<div className="shrink-0"><CageOpSelectBanner sel={opSel} allowBatch/></div>}
        </div>
        <div className="cage-scroll flex-1 min-h-0 overflow-y-auto space-y-2 [scrollbar-width:thin] [scrollbar-color:var(--twin-hairline)_transparent]" style={islandPadStyle}>
        {tab==="filter"&&<>
          {/* BOOKING MODE: 笼位预约管理 — 左（预约数据）右（笼架实时预览） */}
          {pageMode==="booking"&&<>
            {!bookingLoading&&bookingRooms.length===0&&<div className="rounded-twin-xl border border-dashed border-[var(--twin-hairline)] bg-[var(--twin-canvas)] h-full flex flex-col items-center justify-center text-center text-sm text-[var(--twin-mute)]"><LayoutGrid className="h-10 w-10 mx-auto mb-3 opacity-20"/>暂无预约数据<br/><span className="text-[11px]">请点击顶部「🔄 同步 ARO」从远端拉取房间预约数据</span></div>}
            {!aRid&&!(bookingRooms.length===0&&!bookingLoading)&&<div className="rounded-twin-xl border border-dashed border-[var(--twin-hairline)] bg-[var(--twin-canvas)] h-full flex flex-col items-center justify-center text-center text-sm text-[var(--twin-mute)]"><LayoutGrid className="h-10 w-10 mx-auto mb-3 opacity-20"/>展开左侧目录，点击房间查看笼位预约<br/><span className="text-[11px]">选中房间后可查看和编辑 AUP 课题组分配，点击笼架预览笼位</span></div>}
            {aRid&&bookingLoading&&<div className="rounded-twin-xl border border-dashed border-[var(--twin-hairline)] bg-[var(--twin-canvas)] h-full flex items-center justify-center text-sm text-[var(--twin-mute)]"><Loader2 className="h-4 w-4 animate-spin mr-2"/>加载预约数据…</div>}
            {aRid&&!bookingLoading&&<div className="flex gap-3 min-h-0 h-full">
              {/* Left: booking data */}
              <div className="w-1/2 flex flex-col min-w-0">
                <CageBookingPanel room={bookingRoom} roomId={aRid} onChanged={()=>{void loadBookingRooms();void loadBookedRoomAupNos();}}/>
              </div>
              {/* Right: shelf grid (realtime) */}
              <div className="w-1/2 flex flex-col min-w-0">
                {shelfLoading&&<div className="flex-1 rounded-twin-xl border border-dashed border-[var(--twin-hairline)] bg-[var(--twin-canvas)] grid place-items-center text-sm text-[var(--twin-mute)]">加载笼架…</div>}
                {!shelfLoading&&!shelfDetail&&<div className="flex-1 rounded-twin-xl border border-dashed border-[var(--twin-hairline)] bg-[var(--twin-canvas)] flex flex-col items-center justify-center text-sm text-[var(--twin-mute)]">
                  <LayoutGrid className="h-10 w-10 mb-3 opacity-20"/>笼架预览<br/><span className="text-[11px]">点击左侧目录中的笼架查看实时笼位</span>
                </div>}
                {!shelfLoading&&shelfDetail&&(
                  <ShelfGrid
                    title={shelfDetail.shelfMeta?.shelveName||"笼架"}
                    detail={shelfDetail}
                    loading={false}
                    emptyHint="暂无数据"
                    onCellClick={handleGridCellClick}
                    alertMap={alertMap}
                    scanCache={scanCache} lastScannedKey={lastScannedKey}
                    editMode={editMode}
                    crossX={highlightCross.crossX} crossY={highlightCross.crossY} crossSid={highlightCross.crossSid} scanLockTarget={scanLockTarget}
                    {...opGridProps}
                    {...modeGlowProps}
                                     />
                )}
              </div>
            </div>}
          </>}

          {/* ROOM MODE: all shelf grids */}
          {pageMode!=="booking"&&viewMode==="room"&&<>
            {!aRid&&<div className="rounded-twin-xl border border-dashed border-[var(--twin-hairline)] bg-[var(--twin-canvas)] h-full flex flex-col items-center justify-center text-center text-sm text-[var(--twin-mute)]"><LayoutGrid className="h-10 w-10 mx-auto mb-3 opacity-20"/>展开左侧目录，点击房间下的笼架<br/><span className="text-[11px]">点击笼架后加载该房间所有笼架详情</span></div>}
            {loading&&<div className="rounded-twin-xl border border-dashed border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4 text-center text-sm text-[var(--twin-mute)]">正在加载房间笼架（{details.length}）…</div>}
            {!loading&&aRid&&details.length===0&&<div className="rounded-twin-xl border border-amber-200/90 bg-amber-50/80 p-4 text-sm text-amber-900">当前房间暂无笼架数据</div>}
            {details.length>0&&<div className="grid grid-cols-1 xl:grid-cols-2 gap-3">{details.map((d,idx)=>{const sid=String(d.shelfMeta?.shelveId??""),isBm=sid!==""&&pinned.has(`${aRid}:${sid}`);
              return<div key={sid||idx} id={`shelf-${sid}`}><ShelfGrid title={d.shelfMeta?.shelveName??`笼架 ${idx+1}`} detail={d} loading={false} emptyHint="暂无笼架数据" isBookmarked={isBm} onToggleBookmark={sid!==""?()=>toggleBm(sid):undefined} onCellClick={pageMode==="allocate"?(c:any)=>{if(!c.empty)setCell(c);}:confirmMode?(c:any)=>handleConfirmCell(c,sid):(c:any)=>handleGridCellClick(c,sid)} alertMap={alertMap} selectable={pageMode==="allocate"||reserveMode||divisionMode||editStaged||archiveMode} selectedCells={(pageMode==="allocate"||reserveMode||divisionMode||editStaged||archiveMode)?pendingSelectedCells:selectedCells} onToggleCell={editStaged?handleEditToggle:pageMode==="allocate"?handleAllocateToggle:reserveMode?handleReserveToggle:divisionMode?handleDivisionToggle:archiveMode?handleArchiveToggle:undefined} allocMode={pageMode==="allocate"||reserveMode||divisionMode||editStaged||archiveMode} clickMode={(pageMode==="allocate"||reserveMode||divisionMode||editStaged||archiveMode)?"toggle":"checkbox"} scanCache={scanCache} lastScannedKey={lastScannedKey} editMode={editMode} confirmMode={confirmMode} crossX={highlightCross.crossX} crossY={highlightCross.crossY} crossSid={highlightCross.crossSid} scanLockTarget={scanLockTarget} poolCells={modePoolCells} claimMode={modeClaimMode} highlightShelveIds={selectableShelveIds} {...opGridProps} {...modeGlowProps}/></div>;
            })}</div>}
          </>}

          {/* SHELF MODE: left grid + right detail (like student page) */}
          {pageMode!=="booking"&&viewMode==="shelf"&&<div className="flex gap-3 min-h-0" style={{height:"calc(100vh - 190px)"}}>
            {/* Left: 8×10 grid */}
            <div className="w-1/2 flex flex-col min-w-0">
              {shelfLoading&&<div className="flex-1 rounded-twin-xl border border-dashed border-[var(--twin-hairline)] bg-[var(--twin-canvas)] grid place-items-center text-sm text-[var(--twin-mute)]">加载笼架…</div>}
              {!shelfLoading&&!shelfDetail&&<div className="flex-1 rounded-twin-xl border border-dashed border-[var(--twin-hairline)] bg-[var(--twin-canvas)] flex flex-col items-center justify-center text-sm text-[var(--twin-mute)]"><LayoutGrid className="h-10 w-10 mb-3 opacity-20"/>点击左侧笼架<br/><span className="text-[11px]">选中后显示该笼架 8×10 笼位</span></div>}
              {!shelfLoading&&shelfDetail&&<ShelfGrid title={shelfDetail.shelfMeta?.shelveName||"笼架"} detail={shelfDetail} loading={false} emptyHint="暂无数据" onCellClick={pageMode==="allocate"?(c:any)=>{if(!c.empty)setCell(c);}:confirmMode?(c:any)=>handleConfirmCell(c,String(shelfDetail?.shelfMeta?.shelveId??"")):handleGridCellClick} alertMap={alertMap} selectable={pageMode==="allocate"||reserveMode||divisionMode||editStaged||archiveMode} selectedCells={(pageMode==="allocate"||reserveMode||divisionMode||editStaged||archiveMode)?pendingSelectedCells:selectedCells} onToggleCell={editStaged?handleEditToggle:pageMode==="allocate"?handleAllocateToggle:reserveMode?handleReserveToggle:divisionMode?handleDivisionToggle:archiveMode?handleArchiveToggle:undefined} allocMode={pageMode==="allocate"||reserveMode||divisionMode||editStaged||archiveMode} clickMode={(pageMode==="allocate"||reserveMode||divisionMode||editStaged||archiveMode)?"toggle":"checkbox"} scanCache={scanCache} lastScannedKey={lastScannedKey} editMode={editMode} confirmMode={confirmMode} crossX={highlightCross.crossX} crossY={highlightCross.crossY} crossSid={highlightCross.crossSid} scanLockTarget={scanLockTarget} poolCells={modePoolCells} claimMode={modeClaimMode} highlightShelveIds={selectableShelveIds} {...opGridProps} {...modeGlowProps}/>}
            </div>
            {/* Right: cell detail / edit actions / bind confirm */}
            <div className="w-1/2 flex flex-col min-w-0 gap-2">
              {/* 编辑模式：单笼架详情 + 状态选项 */}
              {editMode&&cell&&!cell.empty&&(()=>{const sid=shelfDetail?.shelfMeta?.shelveId??"";const ck=`${sid}:${cell.x}:${cell.y}`;const entry=scanCache.get(ck);
                return<div className="flex-1 flex flex-col min-h-0 rounded-twin-xl border-2 overflow-hidden" style={{borderColor:"var(--twin-primary)"}}>
                  <div className="shrink-0 px-3 py-2 flex items-center justify-between" style={{background:"rgba(172,23,54,0.06)"}}><div className="text-sm font-semibold text-[var(--twin-ink)]">状态选择 · {cell.position}</div><button className="text-xs text-[var(--twin-mute)] hover:text-[var(--twin-ink)]" onClick={()=>{setCell(null);setShelfId(null);}}>清除</button></div>
                  <div className="flex-1 overflow-y-auto p-3 space-y-3" style={islandPadStyle}>
                    <div className="flex flex-col gap-2">{CAGE_BOX_ACTIONS.map(({action:a,label,statusCode})=>{const c= cageStatusColors[statusCode] ?? DEFAULT_COLORS[statusCode];const cbi2=cell.cageBoxInfo as Record<string,any>|undefined;const cvo2=cbi2?.cageBoxVo??cbi2?.["cageBoxVo"]??{};const ld=(cell as any).detail as Record<string,any>|undefined;const localActions=dataSource==="local"?actionsFromFormValues(editFormValues):actionsFromCageBoxInfo(cbi2,cvo2);const srvHas=!entry&&(localActions.has(a)||((a==="SPECIAL_BREEDING"&&!!cbi2?.specialBreedingName)||(a==="HEALTH_CHECK"&&!!cbi2?.animalHealthEntity)));const has=entry?entry.currentActions.has(a):srvHas;const init=entry?entry.initialActions.has(a):srvHas;const changed=has!==init;
                      return<button key={a} onClick={()=>toggleEditStatus(cell,sid,a,has)}
                        disabled={editDirect&&editDirectBusy}
                        className="flex items-center gap-2 rounded-twin-md border-2 px-3 py-2.5 text-sm font-semibold transition hover:brightness-95 disabled:opacity-50"
                        style={{borderColor:has?c?.border:"var(--twin-hairline)",background:"var(--twin-canvas)"}}>
                        {/* 色块预览：选中即用该状态配置的背景/边框色（与图例说明一致） */}
                        <span className="w-8 h-5 rounded border-2 shrink-0" style={{backgroundColor: has ? (c?.bg ?? "#ccc") : "#f1f5f9", borderColor: has ? (c?.border ?? "#999") : "#cbd5e1"}} />
                        <span className="flex-1 text-left" style={{color:"var(--twin-ink)"}}>{label}</span>
                        <span className="text-[11px]" style={{color:changed?"var(--twin-warning)":has?c?.border:"var(--twin-mute)"}}>{editDirect?(has?"已标记 · 点击取消":"点击标记"):(changed?"已变更":has?"已标记":"点击标记")}</span>
                      </button>;})}
                    </div>
                    <div className="pt-2 border-t border-[var(--twin-hairline)] text-[10px] text-[var(--twin-mute)]">笼位信息</div>
                    <div className="grid grid-cols-2 gap-2 text-xs">{["DepartmentName","ProjectPiName","AupNumber","StateName"].map(k=>{const source=cell.cageBoxInfo??cell.detail??{};const v=source[k];return<div key={k} className="rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1"><div className="text-[var(--twin-mute)]">{CAGE_BOX_INFO_LABEL[k]??k}</div><div className="text-[var(--twin-ink)]">{formatCageDetailValue(v,k)}</div></div>;})}</div>
                  </div>
                </div>;})()}
              {/* 查看模式：笼盒详情 */}
              {!editMode&&!confirmMode&&!archiveMode&&!reserveMode&&(()=>{if(!cell)return<div className="flex-1 rounded-twin-xl border border-dashed border-[var(--twin-hairline)] bg-[var(--twin-canvas)] flex flex-col items-center justify-center text-sm text-[var(--twin-mute)]"><div className="text-4xl mb-3 opacity-20">📋</div>笼盒详情预备画面<br/><span className="text-[11px]">点击左侧笼位格子显示笼盒信息</span></div>;
                return<div className="flex-1 overflow-y-auto rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-3" style={islandPadStyle}>
                <div className="mb-2 flex items-center justify-between"><div className="text-sm font-semibold text-[var(--twin-ink)]">笼盒详情 · 格位 {displayPosition(cell.position)}</div><button type="button" className="text-xs text-[var(--twin-mute)] hover:text-[var(--twin-ink)]" onClick={()=>setCell(null)}>清除</button></div>
                {dataSource==="local"
                  ? <LocalDetailPanel cell={cell} opMarkByCageId={opMarkWithReservations} onClose={()=>setCell(null)} onStartOp={(k,s)=>{setCell(null);void opSel.start(k,s);}} onChanged={()=>setDetailReloadKey(k=>k+1)} canDivide={allowedModeKeys.includes("division")}/>
                  : <div className="grid grid-cols-2 gap-2 text-xs">{CAGE_BOX_INFO_FIELD_ORDER.map(k=>{const source=cell.cageBoxInfo??cell.detail??{};const v=source[k];const display=formatCageDetailValue(v,k);const qr=k==="CageBoxQrCode"&&v!=null&&String(v).trim()!==""?String(v).trim():"";
                  return<div key={k} className={`rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1.5 ${k==="CageBoxQrCode"?"col-span-2":""}`}><div className="text-[var(--twin-mute)]">{CAGE_BOX_INFO_LABEL[k]??k}</div><div className="mt-0.5 flex flex-wrap items-start gap-3"><div className="min-w-0 flex-1 break-all text-[var(--twin-ink)]">{display}</div>{k==="CageBoxQrCode"&&qr!==""&&<div className="shrink-0 rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-1"><QRCodeSVG value={qr} size={80} level="M" includeMargin={false}/></div>}</div></div>;
                })}</div>
                }
                {cell.annotation&&(cell.annotation.richText||cell.annotation.images)&&<div className="mt-2 pt-2 border-t border-[var(--twin-hairline)]"><div className="text-xs font-semibold text-[var(--twin-ink)] mb-1">学生标注</div>
                  {cell.annotation.richText&&<div className="rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1 mb-1 text-xs"><div className="text-[var(--twin-mute)]">备注</div><div className="text-[var(--twin-ink)] whitespace-pre-wrap">{cell.annotation.richText}</div></div>}
                </div>}
              </div>;})()}
            </div>
          </div>}
        </>}
        {tab==="bookmarks"&&<>
          {pinned.size===0&&!bmLoading&&<div className="rounded-twin-xl border border-dashed border-[var(--twin-hairline)] bg-[var(--twin-canvas)] h-full flex flex-col items-center justify-center text-center text-sm text-[var(--twin-mute)]"><Star className="h-10 w-10 mx-auto mb-3 opacity-20"/>选择左侧收藏的笼架<br/><span className="text-[11px]">点击左侧列表中的笼架查看详情</span></div>}
          {!bmLoading&&bmList.length>0&&<div className="grid grid-cols-1 xl:grid-cols-2 gap-3">{bmList.map(b=><BookmarkShelfGrid key={`${b.roomId}-${b.shelveId}`} roomId={String(b.roomId)} shelveId={String(b.shelveId)} title={b.shelveName&&String(b.shelveName)!==String(b.shelveId)?b.shelveName:(shelfNameMap.get(String(b.shelveId))||`笼架 ${b.shelveId}`)} campusName={b.campusName} roomName={b.roomName} isBookmarked={true} onToggleBookmark={()=>toggleBookmarkApi(String(b.roomId),String(b.shelveId)).then(r=>{if(!r.bookmarked){setPinned(p=>{const n=new Set(p);n.delete(`${b.roomId}:${b.shelveId}`);return n;});setBmList(l=>l.filter(x=>`${x.roomId}:${x.shelveId}`!==`${b.roomId}:${b.shelveId}`));}})} onCellClick={c=>{setCell(c);setShelfId(String(b.shelveId));}} alertMap={alertMap}/>)}</div>}
        </>}
      </div>
    </div>

    {cell&&viewMode!=="shelf"&&!editMode&&!confirmMode&&!archiveMode&&!reserveMode&&<Portal><div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={()=>{setCell(null);setShelfId(null);}}>
      <div className="w-full max-w-xl max-h-[85vh] overflow-y-auto rounded-twin-xl bg-[var(--twin-canvas)] p-4 shadow-twin-level-3" onClick={e=>e.stopPropagation()}>
        {dataSource==="local"
          ? <LocalDetailPanel cell={cell} opMarkByCageId={opMarkWithReservations} onClose={()=>{setCell(null);setShelfId(null);}} onStartOp={(k,s)=>{setCell(null);setShelfId(null);void opSel.start(k,s);}} onChanged={()=>setDetailReloadKey(k=>k+1)} canDivide={allowedModeKeys.includes("division")}/>
          : <>
        <div className="mb-2 flex items-center justify-between"><div className="text-sm font-semibold text-[var(--twin-ink)]">笼盒详情 · 格位 {displayPosition(cell.position)}</div><button type="button" className="text-xs text-[var(--twin-mute)] hover:text-[var(--twin-ink)]" onClick={()=>{setCell(null);setShelfId(null);}}>关闭</button></div>
        <div className="grid grid-cols-2 gap-2 text-xs">{CAGE_BOX_INFO_FIELD_ORDER.map(k=>{const source=cell.cageBoxInfo??cell.detail??{};const v=source[k];const display=formatCageDetailValue(v,k);const qr=k==="CageBoxQrCode"&&v!=null&&String(v).trim()!==""?String(v).trim():"";
          return<div key={k} className={`rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1.5 ${k==="CageBoxQrCode"?"col-span-2":""}`}><div className="text-[var(--twin-mute)]">{CAGE_BOX_INFO_LABEL[k]??k}</div><div className="mt-0.5 flex flex-wrap items-start gap-3"><div className="min-w-0 flex-1 break-all text-[var(--twin-ink)]">{display}</div>{k==="CageBoxQrCode"&&qr!==""&&<div className="shrink-0 rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-1"><QRCodeSVG value={qr} size={112} level="M" includeMargin={false}/></div>}</div></div>;
        })}</div>
        {cell.annotation&&(cell.annotation.richText||cell.annotation.images)&&<div className="mt-3 pt-3 border-t border-[var(--twin-hairline)]"><div className="text-xs font-semibold text-[var(--twin-ink)] mb-2">学生标注</div>
          {cell.annotation.richText&&<div className="rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1.5 mb-1.5 text-xs"><div className="text-[var(--twin-mute)] mb-0.5">备注</div><div className="text-[var(--twin-ink)] whitespace-pre-wrap">{cell.annotation.richText}</div></div>}
          {cell.annotation.images&&(()=>{try{const urls=JSON.parse(cell.annotation.images);if(Array.isArray(urls)&&urls.length>0)return<div className="rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1.5 text-xs"><div className="text-[var(--twin-mute)] mb-1">图片({urls.length})</div><div className="flex flex-wrap gap-2">{urls.filter(Boolean).map((url:string,i:number)=><img key={i} src={url} alt={`标注${i+1}`} className="h-16 w-16 object-cover rounded-twin-sm border border-[var(--twin-hairline)]"/>)}</div></div>;}catch{return null;}})()}
          {cell.annotation.updatedAt&&<div className="text-[10px] text-[var(--twin-mute)] mt-1">{cell.annotation.updatedBy?`${cell.annotation.updatedBy} 于 `:""}{cell.annotation.updatedAt}</div>}</div>}
        </>}
      </div>
    </div></Portal>}

        {/* ═══════════════════════════════════════════════════
             DIALOGS — 分配弹窗 / 扫码弹窗 / 编辑状态弹窗 / 扫码确认核对 / CAS提示
             ═══════════════════════════════════════════════════ */}
    {/* ---- 分配确认弹窗 ---- */}
    {/* 抽屉关着时，右边缘留一排书签标签（每模式一枚），点谁展开谁的抽屉 */}
    {!pendingOpen&&(
      <CageModeTabs
        allowed={allowedModeKeys}
        counts={pendingCounts}
        onPick={(k)=>{switchMode(k);setPendingOpen(true);}}
      />
    )}
    {/* 多模式「待提交」抽屉：各模式的操作在这里攒着，统一提交并汇总失败 */}
    {pendingOpen&&!["view","record","booking"].includes(currentMode)&&(
      <CageModeDrawer
        modeLabel={modeMetaOf(currentMode as CageModeKey)?.label??currentMode}
        modeColor={modeColor}
        /* 状态模式左栏要放 10 个色区（一行两个），窄了每张卡只剩标题 */
        width={currentMode === "edit" ? 480 : 400}
        batch={pending}
        submitting={pendingBusy}
        onRemove={(cageId)=>currentMode==="edit"?removeEditItem(cageId):patchPending(currentMode,(b)=>removeItem(b,cageId))}
        onMove={(from,to)=>patchPending(currentMode,(b)=>moveItem(b,from,to))}
        onClear={()=>{
          patchPending(currentMode,()=>clearBatch());
          // 状态模式的批次是从编辑缓存同步来的，清批次不清缓存 = 下一轮又被加回来
          if(currentMode==="edit")setScanCache(new Map());
        }}
        onSubmit={()=>void submitPending()}
        onEditItem={currentMode==="edit"?openEditItemById:undefined}
        /* 状态模式两种改法的切换：拖色区（攒着统一提交） / 直接改（点笼位开弹窗，点一下即生效） */
        headerToggle={currentMode==="edit"?(
          <button type="button" onClick={()=>setEditDirect(v=>!v)}
            title={editDirect
              ? "当前：点笼位开状态弹窗，点一下立刻生效。点这里改回「拖到色区攒着」"
              : "当前：点笼位攒进待提交，拖到色区标记后统一提交。点这里改成「直接改」"}
            className={`rounded-twin-md border px-2 py-0.5 text-[11px] font-semibold transition ${
              editDirect
                ? "border-[var(--twin-warning)] bg-amber-50 text-[var(--twin-warning)]"
                : "border-[var(--twin-hairline)] text-[var(--twin-mute)] hover:text-[var(--twin-ink)]"
            }`}>
            {editDirect?"直接改":"拖色区"}
          </button>
        ):undefined}
        onClose={()=>setPendingOpen(false)}
        selectedIds={bufferSelected}
        onSelectedChange={setBufferSelected}
        needsTarget={currentMode === "allocate" || currentMode === "reserve" || currentMode === "division"}
        targetNoun={currentMode === "allocate" ? "AUP / 撤销区" : "人员"}
        targetKeyOf={(it) => (currentMode === "allocate" ? it.aupId : it.assigneeAccountId)}
        onDrop={(ids, zoneKey, fromZone) => {
          if (currentMode === "edit") { handleEditZoneDrop(ids, zoneKey, fromZone); return; }
          if (currentMode === "allocate" || currentMode === "reserve" || currentMode === "division") dropToZone(currentMode, ids, zoneKey);
        }}
        bufferSlot={currentMode === "allocate" ? (
          <PendingBufferList
            sections={[
              /* 两种状态在缓冲区各占一段：等待分配（要选 AUP）与空笼盒（撤销分配）。
                 分段只为**看得清**，不再要求分两批 —— 同一批可同时含两种，提交时按 kind 分组下发。 */
              { key: "alloc", title: "待分配", hint: "拖到右侧 AUP", items: allocWaitItems },
              { key: "cancel", title: "撤销分配", hint: "空笼盒，无需选 AUP", items: allocCancelItems },
            ]}
            total={unassignedItems.length}
            selected={bufferSelected}
            onToggle={toggleBufferSelected}
            onToggleAll={() => toggleAllBufferSelected(unassignedItems.map((i) => i.cageId))}
            onRemove={(cageId) => patchPending("allocate", (b) => removeItem(b, cageId))}
            cellOf={cellOfItem}
            shelfNameOf={shelfNameOfItem}
          />
        ) : currentMode === "edit" ? (
          maskWhenDirect(
          /* 状态模式的色区排在左栏（一行两个 × 五行）：10 个区一列排下来太长，两列一眼扫完 */          <BufferTargetZones
            grid
            zones={editZones}
            itemsByZone={itemsByZone}
            selectedCount={bufferSelected.size}
            cellOf={cellOfItem}
            shelfNameOf={shelfNameOfItem}
            cacheOf={editCacheOfItem}
            onOpen={openEditItemById}
            onAssignSelected={(zoneKey) => { if (handleEditZoneDrop([...bufferSelected], zoneKey, null)) setBufferSelected(new Set()); }}
            onUnassignAll={(zoneKey) => {
              // 区里全部条目反向操作一遍 = 整区撤销
              handleEditZoneDrop((itemsByZone.get(zoneKey) ?? []).map((i) => i.cageId), null, zoneKey);
            }}
            header={
              <div className="shrink-0 border-b border-[var(--twin-hairline)] px-2 py-1.5 text-[10px] text-[var(--twin-mute)]">
                拖笼位到对应色区即标记，拖到虚线区即撤销
              </div>
            }
          />
          , { label: true })
        ) : (currentMode === "reserve" || currentMode === "division") ? (
          <PendingBufferList
            sections={[
              { key: currentMode, title: currentMode === "reserve" ? "待预定" : "待划分", hint: "拖到右侧人员", items: unassignedItems },
            ]}
            total={unassignedItems.length}
            selected={bufferSelected}
            onToggle={toggleBufferSelected}
            onToggleAll={() => toggleAllBufferSelected(unassignedItems.map((i) => i.cageId))}
            onRemove={(cageId) => patchPending(currentMode, (b) => removeItem(b, cageId))}
            cellOf={cellOfItem}
            shelfNameOf={shelfNameOfItem}
          />
        ) : (
          /* 兜底：确认 / 归档这类「没有目标区域」的模式，也用同款磁贴缓冲，
             不再退回抽屉里那套文字行列表（两套观感差太远） */
          <PendingBufferList
            sections={[{ key: currentMode, title: `待${modeMetaOf(currentMode as CageModeKey)?.label ?? "提交"}`, items: pending.items }]}
            total={pending.items.length}
            selected={bufferSelected}
            onToggle={toggleBufferSelected}
            onToggleAll={() => toggleAllBufferSelected(pending.items.map((i) => i.cageId))}
            onRemove={(cageId) => patchPending(currentMode, (b) => removeItem(b, cageId))}
            cellOf={cellOfItem}
            shelfNameOf={shelfNameOfItem}
          />
        )}
        zonesSlot={currentMode === "allocate" ? (
          <BufferTargetZones
            zones={allocZones}
            itemsByZone={itemsByZone}
            selectedCount={bufferSelected.size}
            cellOf={cellOfItem}
            shelfNameOf={shelfNameOfItem}
            onAssignSelected={(zoneKey) => { if (dropToZone("allocate", [...bufferSelected], zoneKey)) setBufferSelected(new Set()); }}
            onUnassignAll={(zoneKey) => {
              dropToZone("allocate", (itemsByZone.get(zoneKey) ?? []).map((i) => i.cageId), null);
              if (zoneKey !== ALLOC_CANCEL_ZONE) {
                patchPending("allocate", (b) => setParams(b, { zoneAups: zoneAups.filter((id) => id !== zoneKey) }));
              }
            }}
            header={
              <div className="shrink-0 border-b border-[var(--twin-hairline)] p-2">
                <SearchSelect
                  search={searchAup}
                  placeholder="搜索 AUP 注册号 / PI"
                  excludeKeys={zoneAups}
                  onPick={(o) => patchPending("allocate", (b) => setParams(b, { zoneAups: [...zoneAups, o.key] }))}
                />
              </div>
            }
          />
        ) : currentMode === "edit" ? (
          /* 色区占了左栏，缓冲就挪到最右一列（直接改模式只压灰：还能点开状态弹窗，只是不能拖） */
          maskWhenDirect(
          <PendingBufferList
            sections={[{ key: "edit", title: "待提交", hint: "拖到左侧色区", items: editStagedItems }]}
            total={editStagedItems.length}
            selected={bufferSelected}
            onToggle={toggleBufferSelected}
            onToggleAll={() => toggleAllBufferSelected(editStagedItems.map((i) => i.cageId))}
            onRemove={removeEditItem}
            cellOf={cellOfItem}
            shelfNameOf={shelfNameOfItem}
            cacheOf={editCacheOfItem}
            onOpen={openEditItemById}
            dragDisabled={editDirect}
          />
          , { passClicks: true })
        ) : (currentMode === "reserve" || currentMode === "division") ? (
          <BufferTargetZones
            zones={currentMode === "reserve" ? reserveZones : divisionZones}
            itemsByZone={itemsByZone}
            selectedCount={bufferSelected.size}
            cellOf={cellOfItem}
            shelfNameOf={shelfNameOfItem}
            onAssignSelected={(zoneKey) => { if (dropToZone(currentMode, [...bufferSelected], zoneKey)) setBufferSelected(new Set()); }}
            onUnassignAll={(zoneKey) => {
              dropToZone(currentMode, (itemsByZone.get(zoneKey) ?? []).map((i) => i.cageId), null);
              const persons = currentMode === "reserve" ? reservePersons : divisionPersons;
              patchPending(currentMode, (b) => setParams(b, { persons: Object.fromEntries(Object.entries(persons).filter(([k]) => k !== zoneKey)) }));
            }}
            header={
              <div className="shrink-0 border-b border-[var(--twin-hairline)] p-2">
                <SearchSelect
                  search={currentMode === "reserve" ? searchReservePerson : searchDivisionPerson}
                  placeholder="搜索姓名 / 工号"
                  excludeKeys={currentMode === "reserve" ? Object.keys(reservePersons) : Object.keys(divisionPersons)}
                  onPick={(o) => patchPending(currentMode, (b) => setParams(b, { persons: { ...(currentMode === "reserve" ? reservePersons : divisionPersons), [o.key]: o.label } }))}
                />
              </div>
            }
          />
        ) : undefined}
        paramsSlot={currentMode==="archive"?(
          <div className="space-y-1.5">
            <div className="text-[10px] text-[var(--twin-mute)]">归档原因（可选）</div>
            <input type="text" value={(pending.params.reason as string|undefined)??""}
              onChange={(e)=>patchPending("archive",(b)=>setParams(b,{reason:e.target.value}))}
              placeholder="如：实验结束"
              className="w-full rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1.5 text-[11px] outline-none"/>
          </div>
        ):null}
      />
    )}
    {/* ---- 常驻扫码定位（按当前模式联动判定） ---- */}
    <MobileScanDialog open={scanLockOpen} onClose={()=>setScanLockOpen(false)} onResult={(code)=>{setScanLockOpen(false);handleResidentScan(code);}}/>
    {/* ---- 编辑模式状态选择弹窗 ---- */}
    <Dialog open={!!editDialogCell} onOpenChange={(o)=>{
      if(!o){setEditDialogCell(null);setActionPhotos([]);setActionNote("");}
    }}>
      <DialogContent className="max-w-xs">
        <DialogHeader><DialogTitle>选择操作 · {editDialogCell?.position}</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-2">
          {CAGE_BOX_ACTIONS.map(({action:a,label,statusCode})=>{
            const c= cageStatusColors[statusCode] ?? DEFAULT_COLORS[statusCode];
            const key=editDialogCell?(()=>{const sid=editDialogShelfId||findShelfIdForCell(editDialogCell);return`${sid}:${editDialogCell.x}:${editDialogCell.y}`;})():null;
            const entry=key?scanCache.get(key):null;
            // 未缓存时回退到服务器当前状态
            const serverHas=!entry&&editDialogCell?(()=>{if(dataSource==="local"){const s=actionsFromFormValues(editFormValues);return s.has(a);}const cbi=editDialogCell.cageBoxInfo as Record<string,any>|undefined;const cvo=cbi?.cageBoxVo??cbi?.["cageBoxVo"]??{};const s=actionsFromCageBoxInfo(cbi,cvo);if(s.has(a))return true;return (a==="SPECIAL_BREEDING"&&!!cbi?.specialBreedingName)||(a==="HEALTH_CHECK"&&!!cbi?.animalHealthEntity);})():false;
            const has=entry?entry.currentActions.has(a):serverHas;
            return <button key={a} onClick={async ()=>{
              if(!editDialogCell)return;
              const sid=editDialogShelfId||findShelfIdForCell(editDialogCell);if(!sid)return;
              toggleEditStatus(editDialogCell,sid,a,has);
            }}
              disabled={editDirect&&editDirectBusy}
              className="flex items-center gap-2 rounded-twin-md border-2 px-3 py-2.5 text-sm font-semibold transition hover:brightness-95 disabled:opacity-50"
              style={{borderColor:has?c?.border:"var(--twin-hairline)",background:"var(--twin-canvas)"}}>
              <span className="w-8 h-5 rounded border-2 shrink-0" style={{backgroundColor: has ? (c?.bg ?? "#ccc") : "#f1f5f9", borderColor: has ? (c?.border ?? "#999") : "#cbd5e1"}} />
              <span className="flex-1 text-left" style={{color:"var(--twin-ink)"}}>{label}</span>
              <span className="text-[11px]" style={{color:has?c?.border:"var(--twin-mute)"}}>{has?"✓ 已选":"点击选择"}</span>
            </button>;
          })}
        </div>
        {/* 📷 状态专属照片 */}
        <div className="space-y-2 pt-1 border-t border-[var(--twin-hairline)]">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-[var(--twin-mute)]">📷 状态专属照片</span>
            <label className="cursor-pointer px-2 py-0.5 rounded text-[10px] font-semibold bg-[var(--twin-primary)] text-white">
              {actionUploading?"上传中...":"+ 添加状态照片"}
              <input type="file" accept="image/*" multiple className="hidden" onChange={async(e)=>{
                const files=e.target.files;if(!files?.length)return;
                setActionUploading(true);
                try{
                  const urls:string[]=[];
                  for(let i=0;i<files.length;i++){
                    const fd=new FormData();fd.append("file",files[i]);
                    const r=await authHttp.post("/upload",fd,{headers:{"Content-Type":"multipart/form-data"}});
                    if(r.data?.success&&r.data.data?.url)urls.push(r.data.data.url);
                  }
                  if(urls.length){
                    const np=[...actionPhotos,...urls];
                    setActionPhotos(np);
                    // 不再自动保存，统一由「保存标注」按钮提交
                  }
                }catch{toast.error("上传失败");}
                finally{setActionUploading(false);}
              }} disabled={actionUploading}/>
            </label>
          </div>
          {actionPhotos.length>0&&<div className="flex flex-wrap gap-1">{actionPhotos.map((url,i)=>
            <div key={i} className="relative group">
              <img src={url} className="h-10 w-10 object-cover rounded border border-[var(--twin-hairline)]"/>
              <button onClick={()=>{
                setActionPhotos(p=>p.filter((_,j)=>j!==i));
                const c=editDialogCell;
                if(c){
                  const cid=String((c as any).id??(c as any).animalCageId??"");
                  if(cid){
                    authHttp.get('/local/annotate/'+cid).then(r=>{
                      if(r.data?.success&&r.data.data?.statusPhotos){
                        try{const sp=typeof r.data.data.statusPhotos==='string'?JSON.parse(r.data.data.statusPhotos):r.data.data.statusPhotos;
                          for(const k of Object.keys(sp)){if(Array.isArray(sp[k]))sp[k]=sp[k].filter((u:string)=>u!==url);}
                          authHttp.post('/local/annotate',{animalCageId:cid,statusPhotos:JSON.stringify(sp)}).catch(()=>{});
                        }catch{}
                      }
                    }).catch(()=>{});
                  }
                }
              }}
                className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] items-center justify-center hidden group-hover:flex">✕</button>
            </div>
          )}</div>}
          <textarea value={actionNote} onChange={e=>setActionNote(e.target.value)} placeholder="备注..." rows={2}
            className="w-full rounded border border-[var(--twin-hairline)] px-2 py-1 text-[11px] resize-y"/>
          <button onClick={async()=>{
            const cell=editDialogCell;
            if(!cell) return;
            const cageId=String((cell as any).id??(cell as any).animalCageId??"");
            if(!cageId) return;
            setActionSubmitting(true);
            try{
              let sp:Record<string,string[]>={};
              try{const r=await authHttp.get(`/local/annotate/${cageId}`);
                if(r.data?.success&&r.data.data?.statusPhotos){
                  const existing=JSON.parse(r.data.data.statusPhotos);
                  if(typeof existing==="object")sp=existing;
                }
              }catch{}
              for(const k of statusPhotoKeys(actionsFromFormValues(editFormValues)))sp[k]=actionPhotos;
              if(actionPhotos.length>0)sp._status=actionPhotos;
              if(actionNote.trim())(sp as any)._note=actionNote; // 标注文本存入 statusPhotos，与实验记录分离
              await authHttp.post("/local/annotate",{animalCageId:cageId,statusPhotos:JSON.stringify(sp)});
              toast.success("标注已保存");
            }catch(e:any){toast.error("保存失败: "+(e?.message||""));}
            finally{setActionSubmitting(false);}
          }}
            disabled={actionSubmitting}
            className="rounded-twin-md px-3 py-1 text-[11px] font-semibold bg-[var(--twin-primary)] text-white hover:brightness-95 disabled:opacity-50 transition self-end">
            {actionSubmitting?"保存中...":"💾 保存标注"}
          </button>
          <button onClick={async()=>{
            const cell=editDialogCell;
            if(!cell) return;
            const cageId=String((cell as any).id??(cell as any).animalCageId??"");
            if(!cageId) return;
            setActionSubmitting(true);
            try{
              let sp:Record<string,string[]>={};
              try{const r=await authHttp.get(`/local/annotate/${cageId}`);
                if(r.data?.success&&r.data.data?.statusPhotos){
                  const existing=JSON.parse(r.data.data.statusPhotos);
                  if(typeof existing==="object")sp=existing;
                }
              }catch{}
              for(const k of statusPhotoKeys(actionsFromFormValues(editFormValues)))sp[k]=actionPhotos;
              if(actionPhotos.length>0)sp._status=actionPhotos;
              if(actionNote.trim())(sp as any)._note=actionNote;
              await authHttp.post("/local/annotate",{animalCageId:cageId,statusPhotos:JSON.stringify(sp)});
              toast.success("已归档为新记录");
              // 清空表单，开始新一版
              setActionPhotos([]); setActionNote("");
              // 刷新历史
              authHttp.get(`/local/history/${cageId}`).then(r=>{
                if(r.data?.success) setEditHistory(r.data.data||[]);
              }).catch(()=>{});
            }catch(e:any){toast.error("保存失败: "+(e?.message||""));}
            finally{setActionSubmitting(false);}
          }}
            disabled={actionSubmitting}
            className="rounded-twin-md px-3 py-1 text-[11px] font-semibold border border-[var(--twin-primary)] text-[var(--twin-primary)] hover:bg-[var(--twin-primary)] hover:text-white disabled:opacity-50 transition self-end">
            📄 存为新记录
          </button>
        </div>
        {/* 📦 历史记录折叠区 */}
        <details className="border-t border-[var(--twin-hairline)] pt-2">
          <summary className="text-[11px] font-semibold text-[var(--twin-mute)] cursor-pointer">📦 历史记录</summary>
          <div className="mt-2 space-y-1.5 max-h-[180px] overflow-y-auto">
            {(()=>{
              const list=editHistory||[];
              return list.map((h:any,i:number)=>{
                const label=h.statusField==="needs_division"?"需分笼":h.statusField==="needs_special_feeding"?"特殊饲养":h.statusField==="_annotation"?"标注记录":"健康异常";
                const imgs:string[]=(()=>{try{const arr=JSON.parse(h.imagesJson||"[]");return Array.isArray(arr)?arr:[];}catch{return[];}})();
                return<div key={i} className="text-[10px] rounded border border-[var(--twin-hairline)] px-2 py-1 group">
                  <div className="flex items-center justify-between">
                    <span className={h.action==="unmarked"?"text-red-600":h.action==="annotated"?"text-blue-600":"text-green-600"}>{h.action==="unmarked"?"✕":h.action==="annotated"?"📝":"✓"} {label}</span>
                    <div className="flex items-center gap-1">
                      <span className="text-[var(--twin-mute)]">{h.createdAt?.substring(0,16)||""}</span>
                      <button onClick={async () =>{
                        if(!h.id) return;
                        if(!await appConfirm("确定删除该条历史记录？")) return;
                        authHttp.delete(`/local/history/${h.id}`).then(()=>{
                          setEditHistory(p=>p.filter(x=>x.id!==h.id));
                          toast.success("已删除");
                        }).catch(()=>toast.error("删除失败"));
                      }}
                        className="text-[9px] text-red-400 hover:text-red-600 hidden group-hover:inline leading-none px-1">✕</button>
                    </div>
                  </div>
                  {h.experimentDesc&&<div className="text-[var(--twin-mute)] mt-0.5">{h.experimentDesc.substring(0,80)}</div>}
                  {imgs.length>0&&<div className="flex gap-0.5 mt-1">{imgs.map((url:string,j:number)=><img key={j} src={url} className="h-8 w-8 object-cover rounded border border-[var(--twin-hairline)]"/>)}</div>}
                </div>;
              });
            })()}
          </div>
        </details>
        <DialogFooter>
          <button onClick={()=>{setEditDialogCell(null);setActionPhotos([]);setActionNote("");}}
            className="rounded-twin-md px-5 py-1.5 text-sm font-semibold text-[var(--twin-ink)] border border-[var(--twin-hairline)] hover:bg-[var(--twin-canvas-soft)] transition">关闭</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    {/* ---- 扫码确认核对面板（居中 Dialog） ---- */}
    <Dialog open={confirmMode&&!!confirmLookup} onOpenChange={(o)=>{if(!o)setConfirmLookup(null);}}>
      <DialogContent className="z-[var(--z-modal)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>确认 · 核对信息</DialogTitle>
          <DialogDescription className="space-y-2">
            <div className="rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] divide-y divide-[var(--twin-hairline)]">
              {(()=>{const cc=confirmLookup?.cageCell;const cl=confirmLookup?.claim;
                const rows:{label:string;value:string;em?:boolean}[]=[];
                if(cc)rows.push({label:"笼位",value:(cc.positionLabel||`${cc.positionX}-${cc.positionY}`)});
                if(cc?.roomName)rows.push({label:"房间",value:cc.roomName});
                if(cl?.claimantName)rows.push({label:"认领人",value:cl.claimantName,em:true});
                if(cl?.projectPiName)rows.push({label:"课题组 PI",value:cl.projectPiName,em:true});
                if(cl?.aupNumber)rows.push({label:"AUP 编号",value:cl.aupNumber});
                if(cl?.projectName)rows.push({label:"项目",value:cl.projectName});
                rows.push({label:"当前状态",value:cl?.claimStatus==="locked"?"待确认":(cl?.claimStatus||"-"),em:true});
                return rows.map((r,i)=><div key={i} className="flex items-center justify-between px-3 py-2 text-xs">
                  <span className="text-[var(--twin-mute)]">{r.label}</span>
                  <span className={r.em?"font-semibold text-[var(--twin-ink)]":"text-[var(--twin-ink)]"}>{r.value||"-"}</span>
                </div>);
              })()}
            </div>
            {confirmLookup?.claim && !confirmLookup.claim.hasInfo && (
              <div className="border-t border-[var(--twin-hairline)] pt-2">
                <div className="mb-1 text-[11px] font-semibold text-[var(--twin-ink)]">填写信息</div>
                <CageFormFill animalCageId={confirmLookup.cageCell?.animalCageId ?? null} claimed editable />
              </div>
            )}
            <div className="rounded-twin-md bg-amber-50 border border-amber-200 px-3 py-2 text-center">
              <span className="text-[11px] text-amber-700 font-semibold">确认该笼位已到位（由管理员/饲养组长代确认）</span>
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <AdminButton type="button" tone="secondary" size="default" onClick={()=>setConfirmLookup(null)}>
            取消
          </AdminButton>
          <AdminButton type="button" size="default" onClick={handleConfirmArrival} disabled={confirmSubmitting}>
            {confirmSubmitting?"处理中...":"确认到位"}
          </AdminButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    {/* ---- 设置中心（齿轮）---- */}
    <CageHistoryModal animalCageId={recordTarget} onClose={()=>setRecordTarget(null)} />
    <CageOperationDialog
      open={opSel.confirmOpen}
      op={opSel.kind ?? "divide"}
      source={opSel.source}
      picked={opSel.picked}
      onClose={opSel.closeConfirm}
      onDone={()=>{opSel.cancel();setDetailReloadKey(k=>k+1);void qc.invalidateQueries({queryKey:["cage-op","markers"]});}}
    />
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

    {/* 设置中心：左分类栏 + 右内容，见 CageSettingsCenter */}
    <CageSettingsCenter
      open={settingsOpen}
      onOpenChange={setSettingsOpen}
      dataSource={dataSource}
      onSwitchDataSource={switchDataSource}
      fullTree={fullTree}
      onRunCellIdSync={handleCellIdSync}
      cellIdSyncing={localPipelineSyncing}
    />
    {/* ---- 笼位ID同步方式选择 ---- */}
    {/* 同步前二次确认：明确告知哪些范围已被锁定、本次会被跳过 */}
    <Dialog open={syncConfirmOpen} onOpenChange={setSyncConfirmOpen}>
      <DialogContent className="z-[var(--z-modal)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>确认同步</DialogTitle>
          <DialogDescription>
            范围：{syncScope==="all"?"全部房间":`本房间（${aRname||aRid}）`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-[11px]">
          {lockSummary.total === 0 ? (
            <div className="rounded-twin-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-800">
              未设置任何同步保护锁 —— 本次同步会覆盖全部笼位数据（含人工修改过的内容）。
            </div>
          ) : (
            <div className="rounded-twin-md border border-red-200 bg-red-50 px-3 py-2">
              <div className="font-semibold text-red-700 mb-1.5">
                以下 {lockSummary.total} 处已锁定，本次同步会跳过、保持本地现状：
              </div>
              <div className="space-y-1.5 max-h-52 overflow-y-auto">
                {([["FLOOR","楼层"],["ROOM","房间"],["SHELF","笼架"],["CELL","笼位"]] as const).map(([k,label]) =>
                  lockSummary.groups[k].length === 0 ? null : (
                    <div key={k} className="flex gap-1.5">
                      <span className="shrink-0 font-semibold text-red-600">{label}</span>
                      <span className="flex flex-wrap gap-1">
                        {lockSummary.groups[k].map((n,i)=>(
                          <span key={i} className="rounded border border-red-200 bg-white/70 px-1.5 py-px text-red-700">{n}</span>
                        ))}
                      </span>
                    </div>
                  )
                )}
              </div>
            </div>
          )}
          {lockSummary.whitelist > 0 && (
            <div className="text-[10px] text-[var(--twin-mute)]">
              另有 {lockSummary.whitelist} 处白名单解锁，即便上级已锁定也会照常同步。
            </div>
          )}
          <div className="text-[10px] text-[var(--twin-mute)]">
            同步为后台异步执行，进度见顶部进度条；执行期间请勿重复触发。
          </div>
        </div>
        <DialogFooter>
          <button type="button" onClick={()=>setSyncConfirmOpen(false)}
            className="rounded-twin-md border border-[var(--twin-hairline)] px-3 py-1.5 text-[11px] font-semibold text-[var(--twin-mute)] hover:text-[var(--twin-ink)] transition">取消</button>
          <button type="button"
            onClick={()=>{ setSyncConfirmOpen(false); if(syncScope==="room") void handleRoomPipelineSync(); else void handleLocalPipelineSync(); }}
            className="rounded-twin-md bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-700 transition">
            {syncScope==="room"?"确认同步本房间":"确认同步全部"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={cellIdSyncOpen} onOpenChange={setCellIdSyncOpen}>
      <DialogContent className="z-[var(--z-modal)] sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>笼位ID同步方式</DialogTitle>
          <DialogDescription>请选择是否删除已存在的笼位ID索引</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <button type="button" onClick={()=>handleCellIdSync(false)}
            className="w-full rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2.5 text-left hover:bg-[var(--twin-canvas-soft)] transition">
            <div className="text-[12px] font-semibold text-[var(--twin-ink)]">仅补充缺失</div>
            <div className="text-[10px] text-[var(--twin-mute)]">保留已有笼位ID，只补充新增/缺失的笼位（推荐）</div>
          </button>
          <button type="button" onClick={()=>handleCellIdSync(true)}
            className="w-full rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2.5 text-left hover:bg-[var(--twin-canvas-soft)] transition">
            <div className="text-[12px] font-semibold text-[var(--twin-ink)]">删旧重拉</div>
            <div className="text-[10px] text-[var(--twin-mute)]">先清空每个架子的旧索引，再全量重拉（索引脏时用）</div>
          </button>
        </div>
      </DialogContent>
    </Dialog>
    </div>
    {/* 模式悬浮岛：8 个模式常驻可见，悬停出说明；当前模式高亮并给笼架容器呼吸灯 */}
    {canEdit && (
      <CageModeIsland
        current={currentMode as CageModeKey}
        allowed={allowedModeKeys}
        onPick={(k) => switchMode(k)}
        variant={islandVariant}
        anchorRef={rightPanelRef}
        onToggleVariant={toggleIslandVariant}
      />
    )}
  </AdminPageShell></SyncLockProvider>;
}

/** 同步菜单：把「一键同步 / 本房间 / 笼位ID同步 / 同步保护」收进一个下拉，避免工具栏平铺 */
function SyncMenu({ busy, canRoom, roomLabel, onSyncAll, onSyncRoom, onCellIdSync }: {
  busy: boolean; canRoom: boolean; roomLabel: string;
  onSyncAll: () => void; onSyncRoom: () => void; onCellIdSync: () => void;
}) {
  const { protectMode, setProtectMode } = useSyncLock();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* 同步中不禁用整个菜单：一次后台同步可能跑几分钟，期间仍要能进「笼位ID同步」和「保护模式」。
            保护模式开启时按钮转琥珀色，不用展开菜单就能看出当前状态。 */}
        <button type="button"
          className={`inline-flex items-center gap-1 rounded-twin-md px-2.5 py-1 text-[11px] font-semibold text-white transition mr-1 ${protectMode ? "bg-amber-500 hover:bg-amber-600" : "bg-emerald-600 hover:bg-emerald-700"}`}
          title={protectMode ? "同步保护模式进行中：本次同步会跳过被保护锁住的笼位" : "同步本地笼位：执行前会列出被保护锁跳过的范围"}>
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          {busy ? "同步中…" : "同步"}
          <ChevronDown className="h-3 w-3 opacity-80" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[11rem]">
        <DropdownMenuItem disabled={busy} onSelect={onSyncAll}>一键同步（全部房间）</DropdownMenuItem>
        <DropdownMenuItem disabled={busy || !canRoom} onSelect={onSyncRoom}>
          同步本房间{roomLabel ? `（${roomLabel}）` : ""}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={busy} onSelect={onCellIdSync}>笼位ID同步…</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => setProtectMode(!protectMode)}>
          {protectMode ? "退出同步保护模式" : "开启同步保护模式"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

