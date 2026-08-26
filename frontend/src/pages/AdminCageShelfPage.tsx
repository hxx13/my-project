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
import { useNavigate } from "react-router-dom";
import { authHttp } from "@/api/core/authHttp";
import { hasMinRole } from "@/features/auth/roleAccess";
import { authStorage } from "@/features/auth/authStorage";
import { toAdminRoutePath } from "@/features/admin/buildAdminNavModel";
import toast from "react-hot-toast";
import { useQuery } from "@tanstack/react-query";
import { LayoutGrid, Star, Search, Info, PanelLeftClose, PanelLeft, Loader2, Scan, Check, X, QrCode, ImagePlus, RefreshCw, Settings2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import {
  fetchCageShelfDetail, fetchCageScanProgress, refreshCellDetail,
  type CageShelfCell, type CageShelfDetail,
  fetchBookmarks, toggleBookmarkApi,
  type BookmarkEntry,
  fetchFullTree, type CageShelfTreeNode,
  fetchPersistedAlerts, type PersistedAlert,
  fetchSnapshotBatches, type SnapshotBatch,
  fetchRealtimeRefresh, forceRealtimeRefresh, type RealtimeRefreshResponse,
  fetchAllocationAups, type AupItem,
  assignCages, cancelCageAssignment,
  fetchBookingRooms, type BookingRoom, syncBookingData,
  executeCageBoxAction, type CageBoxAction, type CageBoxActionRequest,
  cancelCageBoxColor, ACTION_CANCEL_COLOR, type CancelColor,
  updateAnimalCage, type AnimalCageUpdatePayload,
  fetchCellIndexByShelf, fetchLocalShelfGridByShelveId, localAllocate, localCancelAllocate, localEdit, localAnnotate, fetchLocalAnnotate, type CageCellIndexEntry,
  syncLocalCagePipeline, localPipelineStepLabel, syncAllCellIds,
  lookupCode, adminConfirmClaim, archiveCage, reconcileCageOccupancy, type CodeLookupResult,
  assignBatchCages, searchPersonnelByKeyword,
} from "@/api/domains/cageShelf.api";
import { uploadSingleImage } from "@/api/domains/upload.api";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { Portal } from "@/components/Portal";
import CageBookingPanel from "@/features/cage-shelf/components/CageBookingPanel";
import AupSearchBar from "@/features/cage-shelf/components/AupSearchBar";
import AllocDialog from "@/features/cage-shelf/components/AllocDialog";
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
} from "@/components/ui/dropdown-menu";
import CageShelfLegend from "@/features/cage-shelf/components/CageShelfLegend";
import LocalDetailPanel from "@/features/cage-shelf/components/LocalDetailPanel";
import CageScanSettingsPanel from "@/features/cage-shelf/components/CageScanSettingsPanel";
import CageFormFill from "@/features/cage-shelf/components/CageFormFill";
import { ShelfGrid, BookmarkShelfGrid } from "@/features/cage-shelf/components/ShelfGrid";
import { buildTree, CampusTree } from "@/features/cage-shelf/components/CampusTree";
import { displayPosition, formatCageDetailValue, CAGE_BOX_INFO_LABEL, CAGE_BOX_INFO_FIELD_ORDER, CAGE_BOX_ACTIONS, CAGE_BOX_ACTION_LIST, cageBoxAction, actionsFromFormValues, actionsFromCageBoxInfo, statusPhotoKeys } from "@/features/cage-shelf/constants";
import { fetchCageInfoValues, type CageInfoValueRow } from "@/features/cage-shelf/api/cageForm.api";
import { useCageColors, DEFAULT_COLORS } from "@/features/cage-shelf/components/CageColorContext";
import CageScanProgressBanner from "@/features/cage-shelf/components/CageScanProgressBanner";
import MobileScanDialog from "@/pages/mobile/MobileScanDialog";
import { CageColorProvider } from "@/features/cage-shelf/components/CageColorContext";

import { appConfirm } from "@/lib/appDialog";
export default function AdminCageShelfPage(){return<CageColorProvider><Inner/></CageColorProvider>;}
type ShelfTab="bookmarks"|"filter";

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
  const canEdit = useMemo(() => hasMinRole(authStorage.getRole(), "STAFF"), []);
  const isSuperAdmin = useMemo(() => hasMinRole(authStorage.getRole(), "SUPER_ADMIN"), []);
  const[localPipelineSyncing,setLocalPipelineSyncing]=useState(false);
  const[pageMode,setPageMode]=useState<"view"|"allocate"|"booking">("view");
  const[selectedCells,setSelectedCells]=useState<Set<string>>(new Set());
  const anchorCellRef=useRef<{shelveId:string;x:number;y:number}|null>(null); // Shift+Click 区间选择锚点
  const[boxSelectMode,setBoxSelectMode]=useState(false); // 矩形框选模式：点击两格自动框选
  const boxSelectAnchorRef=useRef<{shelveId:string;x:number;y:number}|null>(null); // 框选模式第一格锚点
  const shiftHintShownRef=useRef(false); // 首次勾选时弹出 Shift 框选提示
  const[allocDialogOpen,setAllocDialogOpen]=useState(false);
  const[selectedAupId,setSelectedAupId]=useState("");
  const[realtimeMeta,setRealtimeMeta]=useState<{fromRealtime:boolean;cachedAt:string}|null>(null);
  const[allocSubmitting,setAllocSubmitting]=useState(false);
  // ═══════════════════════════════════════════════════════════
  //  STATE — 编辑模式 (edit)
  // ═══════════════════════════════════════════════════════════
  // ── 编辑模式 ──
  const[editMode,setEditMode]=useState(false);
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
  const[archiveTarget,setArchiveTarget]=useState<{ animalCageId: string; positionLabel: string; occupantName?: string; projectPiName?: string; aupNumber?: string } | null>(null);
  const[archiveSubmitting,setArchiveSubmitting]=useState(false);
  const[reserveMode,setReserveMode]=useState(false);
  const[reservePerson,setReservePerson]=useState<{ name: string; accountId: string } | null>(null);
  const[reserveSubmitting,setReserveSubmitting]=useState(false);
  const[reserveOpen,setReserveOpen]=useState(false);
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
  const{data:aupList=[]}=useQuery({queryKey:["allocationAups"],queryFn:fetchAllocationAups,staleTime:30*60*1000,enabled:pageMode==="allocate"});

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
  const allocAupList = useMemo(() => {
    if (roomAupNumbers.size === 0) return aupList;
    return aupList.filter((a) => roomAupNumbers.has(a.registerNo));
  }, [aupList, roomAupNumbers]);
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

  // Load shelf details when aRid or batchId changes
  useEffect(()=>{
    if(!aRid||pageMode==="booking"){setDetails([]);return;}
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
  },[aRid,fullTree,selectedBatchId,pageMode,editMode,confirmMode,detailReloadKey,dataSource]);

  const{data:scan}=useQuery({queryKey:["cageScanProgress"],queryFn:fetchCageScanProgress,refetchInterval:(q)=>q.state.data?.status==="running"?5000:30000});
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
  const loadBm=async()=>{setBmLoading(true);try{const list=await fetchBookmarks();setBmList(list);setPinned(new Set(list.map(b=>`${b.roomId}:${b.shelveId}`)));}catch{}finally{setBmLoading(false);}};
  useEffect(()=>{if(tab==="bookmarks")loadBm();},[tab]);

  const [cellIdSyncOpen, setCellIdSyncOpen] = useState(false);

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
    const toastId=toast.loading("一键同步进行中（补全详情→状态）…");
    try{
      const result=await syncLocalCagePipeline();
      if(result.ok){
        toast.success("一键同步完成：补全详情 → 状态",{id:toastId,duration:5000});
        setDetailReloadKey(k=>k+1);
        if(aRid){
          try{
            if(viewMode==="shelf"&&shelfDetail?.shelfMeta?.shelveId){
              const sid=String(shelfDetail.shelfMeta.shelveId);
              const d=await fetchLocalShelfGridByShelveId(sid);
              setShelfDetail(d);
            }else if(viewMode==="room"){
              // 触发房间网格重载：沿用 detailReloadKey 副作用
            }
          }catch{/* ignore refresh errors */}
        }
      }else{
        const step=localPipelineStepLabel(result.failedStep);
        toast.error(`同步中断于「${step}」：${result.failedMessage||"未知错误"}`,{id:toastId,duration:8000});
      }
    }catch(e:any){
      toast.error(e?.message||"一键同步失败",{id:toastId});
    }finally{
      setLocalPipelineSyncing(false);
    }
  },[localPipelineSyncing,aRid,viewMode,shelfDetail]);

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

  /* ---- 框选模式：点击两格自动矩形选中 ---- */
  const handleAllocateToggle=useCallback((shelveId:string,x:number,y:number,shiftKey?:boolean)=>{
    const isAllocatable=(cx:number,cy:number)=>{
      const c=cellAtKey.get(`${shelveId}:${cx}:${cy}`);
      const ct=(c as any)?.cageTypeCode ?? (c as any)?.animalCageType;
      return ct===1;
    };
    if(boxSelectMode){
      const anchor=boxSelectAnchorRef.current;
      if(!anchor||anchor.shelveId!==shelveId){
        if(!isAllocatable(x,y)){toast("只能分配「等待分配」状态的笼位");return;}
        boxSelectAnchorRef.current={shelveId,x,y};
        setSelectedCells(prev=>{const next=new Set(prev);next.add(`${shelveId}:${x}:${y}`);return next;});
        anchorCellRef.current={shelveId,x,y};
        return;
      }
      const minX=Math.min(anchor.x,x),maxX=Math.max(anchor.x,x);
      const minY=Math.min(anchor.y,y),maxY=Math.max(anchor.y,y);
      setSelectedCells(prev=>{
        const next=new Set(prev);
        for(let cx=minX;cx<=maxX;cx++)for(let cy=minY;cy<=maxY;cy++) if(isAllocatable(cx,cy)) next.add(`${shelveId}:${cx}:${cy}`);
        return next;
      });
      boxSelectAnchorRef.current=null;
      setBoxSelectMode(false);
      anchorCellRef.current={shelveId,x,y};
      return;
    }
    if(!shiftHintShownRef.current){shiftHintShownRef.current=true;toast('按住 Shift 键点击另一个笼位，可快速框选矩形区域',{icon:'💡',duration:4000});}
    if(!isAllocatable(x,y)){toast("只能分配「等待分配」状态的笼位");return;}
    setSelectedCells(prev=>{
      const next=new Set(prev);
      const anchor=anchorCellRef.current;
      if(shiftKey && anchor && anchor.shelveId===shelveId){
        const minX=Math.min(anchor.x,x),maxX=Math.max(anchor.x,x);
        const minY=Math.min(anchor.y,y),maxY=Math.max(anchor.y,y);
        for(let cx=minX;cx<=maxX;cx++)for(let cy=minY;cy<=maxY;cy++) if(isAllocatable(cx,cy)) next.add(`${shelveId}:${cx}:${cy}`);
      }else{
        const key=`${shelveId}:${x}:${y}`;
        next.has(key)?next.delete(key):next.add(key);
        anchorCellRef.current={shelveId,x,y};
      }
      return next;
    });
  },[boxSelectMode,cellAtKey]);

  /* ---- 认领模式：只允许选择已预约空笼盒(type2)且无活跃认领 ---- */
  const handleReserveToggle=useCallback((shelveId:string,x:number,y:number,shiftKey?:boolean)=>{
    const c=cellAtKey.get(`${shelveId}:${x}:${y}`);
    const ct=(c as any)?.cageTypeCode ?? (c as any)?.animalCageType;
    const status=(c as any)?.claimStatus;
    if(ct!==2){toast("只能选择「已预约空笼盒」状态的笼位");return;}
    if(status && ["pending_approval","locked","confirmed","pending_release_approval"].includes(status)){
      toast("该笼位已有认领，不可重复选择");return;
    }
    toggleCell(shelveId,x,y,shiftKey);
  },[cellAtKey,toggleCell]);

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

  /* ---- 分配模式：确认分配 ---- */
  const handleConfirmAssign=async()=>{
    if(!selectedAupId||selectedCells.size===0||!aRid)return;
    const cageIds:string[]=[];
    let assignShelveId="";
    for(const key of selectedCells){
      const [sid,xStr,yStr]=key.split(":");
      assignShelveId=sid;
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
      const aup=aupList.find(x=>String(x.id)===String(selectedAupId));
      const piName=aup?.piName||"";
      const aupNumber=aup?.registerNo||"";
      try{await localAllocate(cageIds,selectedAupId,aRid,assignShelveId,piName,aupNumber);toast.success(`已分配 ${cageIds.length} 个笼位（本地）`);}
      catch(e:any){toast.error(e?.message||"分配失败");}
      setAllocDialogOpen(false);setSelectedCells(new Set());anchorCellRef.current=null;setSelectedAupId("");
      setAllocSubmitting(false);setDetailReloadKey(k=>k+1);
      return;
    }

    try{const aup=aupList.find(x=>String(x.id)===String(selectedAupId));await assignCages(aRid,assignShelveId,cageIds,selectedAupId,aup?.registerNo);toast.success(`已分配 ${cageIds.length} 个笼位`);setAllocDialogOpen(false);setSelectedCells(new Set());anchorCellRef.current=null;setSelectedAupId("");
      const r=await fetchRealtimeRefresh(aRid);setDetails(r.shelves??[]);setRealtimeMeta({fromRealtime:r.fromRealtime,cachedAt:r.cachedAt});
    }catch(e:any){toast.error(e instanceof Error?e.message:"分配失败");}
    finally{setAllocSubmitting(false);}
  };

  /* ---- 认领模式：确认认领（建 locked 认领 + 填占用者，免审核） ---- */
  const handleReserveConfirm=useCallback(async(p:{ name: string; accountId: string })=>{
    if(selectedCells.size===0||!p.accountId)return;
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
    setReserveSubmitting(true);
    try{
      const results=await assignBatchCages(cageIds,p.accountId);
      const failed=results.filter(r=>!r.ok).length;
      if(failed>0){toast.error(`已认领 ${cageIds.length-failed} 个笼位给 ${p.name}，${failed} 个失败`);}
      else{toast.success(`已认领 ${cageIds.length} 个笼位给 ${p.name}`);}
    }catch(e:any){toast.error(e?.message||"认领失败");}
    finally{
      setReserveSubmitting(false);
      setReservePerson(null);
      setReserveOpen(false);
      setSelectedCells(new Set());anchorCellRef.current=null;
      setDetailReloadKey(k=>k+1);
    }
  },[selectedCells,details,shelfDetail]);

  // 从 details 或 shelfDetail 找到 cell 所属的 shelveId
  const findShelfIdForCell=(cell:CageShelfCell):string=>{
    for(const d of details){const sid=String(d.shelfMeta?.shelveId??"");for(const c of d.grid){if(c.x===cell.x&&c.y===cell.y)return sid;}}
    if(shelfDetail){const sid=String(shelfDetail.shelfMeta?.shelveId??"");for(const c of shelfDetail.grid){if(c.x===cell.x&&c.y===cell.y)return sid;}}
    return"";
  };
  // 两个 Set 是否完全一致
  const setsEqual=<T,>(a:Set<T>,b:Set<T>)=>a.size===b.size&&[...a].every(x=>b.has(x));
  // ── 统一 cell 点击：编辑/查看 ──
  const handleGridCellClick=useCallback((cell:CageShelfCell, sidHint?:string)=>{
    if(cell.empty)return;
    // 编辑模式：全房间→弹窗 / 单笼架→右侧面板（仅 state=3 可操作）
    if(editMode){
      if(cell.empty)return;
      const ct=dataSource==="local" ? ((cell as any).cageTypeCode) : (cell as any).animalCageType;
      if(ct!==3&&ct!==4){toast.error("当前状态不可编辑");return;}
      // 拉取表单值(cage_info_value)：状态标记唯一真相源，编辑弹窗据此反向使能按钮
      const cageId=String((cell as any).id ?? (cell as any).animalCageId ?? "");
      setEditFormValues(null);
      if(cageId&&dataSource==="local"){
        fetchCageInfoValues(cageId).then(setEditFormValues).catch(()=>setEditFormValues(null));
      }
      if(viewMode==="room"){setEditDialogCell(cell);setEditDialogShelfId(sidHint??findShelfIdForCell(cell));return;}
      setCell(cell);setShelfId(""); // 单笼架走右侧面板
      return;
    }
    // 查看模式 / 扫码确认模式（确认由扫码触发，点击格子仅查看）
    setCell(cell);setShelfId("");
  },[editMode,lastScannedKey,viewMode,aRid,dataSource]);

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
    let pos:{positionX:number;positionY:number}|null=null;
    let roomId:string|number|undefined="";let roomName="";let shelveId="";let shelveName="";
    if(r.type==="CAGE_CELL"&&r.cageCell){
      pos={positionX:r.cageCell.positionX,positionY:r.cageCell.positionY};
      roomId=r.cageCell.roomId??"";roomName=r.cageCell.roomName;shelveId=r.cageCell.shelveId??"";shelveName=r.cageCell.shelveName??"";
    }else if(r.type==="LEGACY_CAGE_BOX"&&r.positionX!=null&&r.positionY!=null){
      pos={positionX:r.positionX,positionY:r.positionY};
      roomId=r.roomId??"";roomName=r.roomName??"";shelveId=r.shelveId??"";shelveName=r.shelveName??"";
    }
    if(!pos)return false;
    const rid=String(roomId||"");
    const sid=String(shelveId||"");
    setViewMode("shelf");
    setARid(rid);setARname(roomName||rid);
    if(rid) expandToRoom(rid);
    if(sid){
      setShelfLoading(true);setShelfDetail(null);
      try{
        const shelf=await fetchLocalShelfGridByShelveId(sid);
        setShelfDetail(shelf);
        setScanLockTarget({sid:String(shelf.shelfMeta?.shelveId||sid),x:pos.positionX,y:pos.positionY});
        toast.success(`已定位: ${roomName||""} ${shelveName||""} (${pos.positionX},${pos.positionY})`);
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
  const handleEditSubmit=useCallback(async()=>{
    if(!aRid||scanCache.size===0)return;
    setActionSubmitting(true);

    // 本地数据源 — 双向检测：新增和取消都算变化
    if(dataSource==="local"){
      let ok=0,fail=0;
      for(const[key,e]of scanCache){
        const cageId=String((e.cell as any).id??(e.cell as any).animalCageId??"");
        if(!cageId)continue;
        const allActions = CAGE_BOX_ACTION_LIST;
        for(const a of allActions){
          const was = e.initialActions.has(a);
          const now = e.currentActions.has(a);
          if(was === now) continue;
          const toggle=cageBoxAction(a).statusField;
          try{await localEdit(cageId,toggle,now,e.code);ok++;}
          catch(err:any){toast.error(`${e.cell.position} ${a}: ${err?.message||"失败"}`);fail++;}
        }
      }
      if(fail===0){toast.success(`已完成 ${ok} 个操作（本地）`);setScanCache(new Map());setLastScannedKey(null);setDetailReloadKey(k=>k+1);}
      else toast(`${ok} 成功 / ${fail} 失败`,{icon:"⚠️"});
      setActionSubmitting(false);
      return;
    }

    const toAdd:{sid:string;entry:any;action:CageBoxAction}[]=[];
    const toRemove:{sid:string;entry:any;action:CageBoxAction}[]=[];
    for(const[key,e]of scanCache){
      const parts=key.split(":");const sid=parts[0]||"";
      for(const a of e.currentActions){if(!e.initialActions.has(a))toAdd.push({sid,entry:e,action:a});}
      for(const a of e.initialActions){if(!e.currentActions.has(a))toRemove.push({sid,entry:e,action:a});}
    }
    let ok=0,fail=0;
    for(const{sid,entry,action}of toAdd){
      if(!sid)continue;
      try{await executeCageBoxAction({roomId:aRid,shelveId:sid,cageBoxCode:entry.code,action});ok++;}
      catch(e:any){toast.error(`${entry.cell.position} ${action}: ${e?.message||"失败"}`);fail++;}
    }
    for(const{sid,entry,action}of toRemove){
      if(!sid)continue;
      // 合笼/动物转移是本地状态，ARO 无对应取消色 → 跳过这条 ARO 调用，本地状态已由 localEdit 落库
      const color=ACTION_CANCEL_COLOR[action];
      if(color===undefined)continue;
      try{await cancelCageBoxColor(aRid,sid,entry.code,color);ok++;}
      catch(e:any){toast.error(`${entry.cell.position} 取消${action}: ${e?.message||"失败"}`);fail++;}
    }
    if(fail===0){toast.success(`已完成 ${ok} 个操作`);setScanCache(new Map());setLastScannedKey(null);setDetailReloadKey(k=>k+1);}
    else toast(`${ok} 成功 / ${fail} 失败`,{icon:"⚠️"});
    setActionSubmitting(false);
  },[aRid,scanCache,details,dataSource]);

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
      setConfirmLookup({
        type: "CAGE_CELL",
        cageCell: {
          animalCageId: String(c.id ?? c.animalCageId ?? ""),
          positionLabel: displayPosition(c.position),
          positionX: c.x,
          positionY: c.y,
          campusName: "",
          roomName: "",
          shelveId: sid ?? "",
        } as any,
        claim: {
          id: Number(c.activeClaimId),
          claimStatus: status,
          claimantId: "",
          claimantName: c.occupantName ?? "",
          projectPiName: c.projectPiName ?? "",
          aupNumber: c.aupNumber ?? c.detail?.aupNumber ?? "",
          projectName: c.projectGroup ?? "",
          hasInfo: true,
        } as any,
      });
      return;
    }
    if (status === "confirmed") { toast.success("该笼位已到位"); return; }
    if (status === "pending_approval") { toast.error("该笼位待审批"); return; }
    if (status === "pending_release_approval") { toast.error("该笼位待释放审批"); return; }
    toast.error("该笼位状态：" + status);
  }, []);

  // ── 归档模式：点格子 → 开归档弹窗（仅 cageTypeCode===3 已饲养中/有笼盒）──
  const handleArchiveCell = useCallback((c: any, _sid?: string) => {
    const ct = (c as any).cageTypeCode ?? (c as any).animalCageType;
    if (ct !== 3) { toast.error("该笼位当前无笼盒/未占用，无需归档"); return; }
    setArchiveTarget({
      animalCageId: String((c as any).id ?? (c as any).animalCageId ?? ""),
      positionLabel: displayPosition(c.position),
      occupantName: c.occupantName,
      projectPiName: c.projectPiName ?? c.detail?.projectPiName,
      aupNumber: c.aupNumber ?? c.detail?.aupNumber,
    });
  }, []);

  // ── 归档模式：扫码 → 定位 → 开归档弹窗 ──
  const handleArchiveScan = useCallback(async (code: string) => {
    const q = code.trim(); if (!q) return;
    try {
      const r = await lookupCode(q);
      if (r.type === "NOT_FOUND") { toast.error("未识别笼位"); return; }
      if (r.type === "ASSET") { toast.error("该编码为资产编号，非笼位"); return; }
      if (r.type === "LEGACY_CAGE_BOX") { toast.error("旧盒码已废弃，请扫笼位码"); await locateLookup(r); return; }
      await locateLookup(r);
      if (r.claim) {
        setArchiveTarget({
          animalCageId: String(r.cageCell?.animalCageId ?? ""),
          positionLabel: r.cageCell?.positionLabel ?? "",
          occupantName: r.claim.claimantName,
          projectPiName: r.claim.projectPiName ?? "",
          aupNumber: r.claim.aupNumber ?? "",
        });
      } else {
        toast.error("该笼位无占用记录，无需归档");
      }
    } catch (e: any) { toast.error(e?.message || "扫码查询失败"); }
  }, [locateLookup]);

  const handleArchiveConfirm = useCallback(async () => {
    if (!archiveTarget?.animalCageId) return;
    setArchiveSubmitting(true);
    try {
      await archiveCage(archiveTarget.animalCageId);
      toast.success("已归档");
      setArchiveTarget(null);
      setDetailReloadKey((k) => k + 1);
    } catch (e: any) { toast.error(e?.message || "归档失败"); }
    finally { setArchiveSubmitting(false); }
  }, [archiveTarget]);

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
  const switchMode=useCallback((mode:"view"|"allocate"|"booking"|"edit"|"confirm"|"archive"|"reserve")=>{
    setSelectedCells(new Set());anchorCellRef.current=null;boxSelectAnchorRef.current=null;setBoxSelectMode(false);shiftHintShownRef.current=false;setCell(null);setShelfId(null);
    setEditMode(false);setConfirmMode(false);setConfirmLookup(null);setArchiveMode(false);setArchiveTarget(null);setReserveMode(false);setReservePerson(null);setReserveOpen(false);setScanCache(new Map());setLastScannedKey(null);
    if(mode==="allocate")setPageMode("allocate");
    else if(mode==="booking")setPageMode("booking");
    else setPageMode("view");
    if(mode==="edit")setEditMode(true);
    else if(mode==="confirm")setConfirmMode(true);
    else if(mode==="archive")setArchiveMode(true);
    else if(mode==="reserve")setReserveMode(true);
  },[]);

  // ── 数据源切换（设置中心）──
  const switchDataSource=useCallback((ds:"aro"|"local")=>{
    setDataSource(ds);
    setEditMode(false);setConfirmMode(false);setConfirmLookup(null);setArchiveMode(false);setArchiveTarget(null);setReserveMode(false);setReservePerson(null);setReserveOpen(false);setScanCache(new Map());setLastScannedKey(null);
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

  const currentMode: "view"|"allocate"|"booking"|"edit"|"confirm"|"archive"|"reserve" = editMode?"edit":confirmMode?"confirm":archiveMode?"archive":reserveMode?"reserve":pageMode==="allocate"?"allocate":pageMode==="booking"?"booking":"view";
  const currentModeLabel = currentMode==="edit"?"编辑":currentMode==="confirm"?"扫码确认":currentMode==="archive"?"归档":currentMode==="reserve"?"认领":currentMode==="allocate"?"分配":currentMode==="booking"?"预约":"查看";
  const viewOnly = currentMode === "view";

  // ═══════════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════════
  return<AdminPageShell>
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
          <Search className="h-3.5 w-3.5 shrink-0 text-[var(--twin-mute)]"/><input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="搜索…" className="flex-1 min-w-0 bg-transparent text-[11px] outline-none text-[var(--twin-ink)] placeholder:text-[var(--twin-mute)]"/>
        </div>}
        {!collapsed&&<div className="cage-scroll flex-1 min-h-0 overflow-y-auto overflow-x-hidden rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-1.5 [scrollbar-width:thin] [scrollbar-color:var(--twin-hairline)_transparent]">
          {tab==="filter"&&<CampusTree tree={tree} exp={exp} search={search} onToggle={k=>setExp(p=>{const n=new Set(p);n.has(k)?n.delete(k):n.add(k);return n;})} onOpenRoom={onOpenRoom} viewMode={viewMode} onOpenShelf={onOpenShelf} alertStatusesByShelf={alertStatusesByShelf} alertStatusesByRoom={alertStatusesByRoom} pageMode={pageMode} bookingRooms={bookingRooms}/>}
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
      <div className="flex-1 min-w-0 grid grid-rows-[auto_1fr] h-full pr-1 overflow-hidden">
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
            {/* ---- 模式切换下拉（STAFF+） ---- */}
            {canEdit && <div className="flex items-center gap-1 rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-1">
              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center gap-1 rounded-twin-md px-2.5 py-1 text-[11px] font-semibold text-[var(--twin-ink)] hover:bg-[var(--twin-canvas-soft)] outline-none">
                  {currentModeLabel}<span className="text-[10px] text-[var(--twin-mute)]">▾</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-[8rem]">
                  {(["view","allocate","booking","edit","confirm","archive","reserve"] as const).map(m=>{
                    const label=m==="edit"?"编辑":m==="confirm"?"扫码确认":m==="archive"?"归档":m==="reserve"?"认领":m==="allocate"?"分配":m==="booking"?"预约":"查看";
                    return <DropdownMenuItem key={m} onSelect={()=>switchMode(m)} className={currentMode===m?"bg-[var(--twin-canvas-soft)]":""}>
                      <span className={currentMode===m?"font-semibold text-[var(--twin-link-deep)]":""}>{currentMode===m?"✓ ":""}{label}</span>
                    </DropdownMenuItem>;
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
              {pageMode==="allocate"&&realtimeMeta&&dataSource!=="local"&&(<>
                <span className="text-[10px] text-[var(--twin-mute)] ml-0.5">{realtimeMeta.fromRealtime?"✅ 实时":"📦 缓存"}{realtimeMeta.cachedAt?" · "+realtimeMeta.cachedAt.substring(11,19):""}</span>
                <button onClick={async()=>{if(!aRid)return;try{const r=await forceRealtimeRefresh(aRid);setDetails(r.shelves??[]);setRealtimeMeta({fromRealtime:r.fromRealtime,cachedAt:r.cachedAt});toast.success("已刷新");}catch(e:any){toast.error("刷新失败");}}}
                  className="rounded-twin-md px-1.5 py-0.5 text-[10px] font-bold bg-blue-500 text-white hover:bg-blue-600 ml-1" title="强制刷新房间数据">↻</button>
              </>)}
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
          </div>
          <div className="flex items-center gap-1">
            {/* 本地模式：超管一键顺序同步（仅查看模式可见） */}
            {viewOnly&&dataSource==="local"&&isSuperAdmin&&(
              <>
                <button type="button" onClick={handleLocalPipelineSync} disabled={localPipelineSyncing}
                  className="inline-flex items-center gap-1 rounded-twin-md px-2.5 py-1 text-[11px] font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition mr-1"
                  title="按固定顺序：补全详情 → 同步状态，避免手动乱序冲空 PI（不再删旧重拉 ID）">
                  {localPipelineSyncing?<Loader2 className="h-3 w-3 animate-spin"/>:<RefreshCw className="h-3 w-3"/>}
                  {localPipelineSyncing?"同步中…":"一键同步本地笼位"}
                </button>
                {/* 笼位ID全量重拉（删旧重拉 /back）—— 独立，仅在新增笼位/索引脏时手动触发 */}
                <button type="button" onClick={()=>setCellIdSyncOpen(true)} disabled={localPipelineSyncing}
                  className="inline-flex items-center gap-1 rounded-twin-md px-2.5 py-1 text-[11px] font-semibold bg-slate-600 text-white hover:bg-slate-700 disabled:opacity-50 transition mr-1"
                  title="从 ARO 拉取笼位ID：可选择删旧重拉或仅补充缺失">
                  {localPipelineSyncing?<Loader2 className="h-3 w-3 animate-spin"/>:<RefreshCw className="h-3 w-3"/>}
                  {localPipelineSyncing?"同步中…":"笼位ID同步"}
                </button>
              </>
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

            {/* ---- 分配模式业务按钮（选中 >0 时出现） ---- */}
            {pageMode==="allocate"&&selectedCells.size>0&&<>
              <button type="button" onClick={()=>setAllocDialogOpen(true)} className="rounded-twin-md px-2.5 py-1 text-[11px] font-semibold bg-blue-600 text-white hover:bg-blue-700 transition">分配选定笼位</button>
              <button type="button" onClick={handleCancelAssign} disabled={allocSubmitting} className="rounded-twin-md px-2.5 py-1 text-[11px] font-semibold bg-red-500 text-white hover:bg-red-600 transition">取消笼位预约</button>
              <button type="button" onClick={()=>{setSelectedCells(new Set());anchorCellRef.current=null;}} className="rounded-twin-md px-2.5 py-1 text-[11px] font-semibold bg-slate-200 text-slate-700 hover:bg-slate-300 transition">清除所有勾选({selectedCells.size})</button>
            </>}
            {/* ---- 认领模式业务按钮（选中 >0 时出现） ---- */}
            {reserveMode&&selectedCells.size>0&&<>
              <button type="button" onClick={()=>setReserveOpen(true)} className="rounded-twin-md px-2.5 py-1 text-[11px] font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition">确认认领({selectedCells.size})</button>
              <button type="button" onClick={()=>{setSelectedCells(new Set());anchorCellRef.current=null;}} className="rounded-twin-md px-2.5 py-1 text-[11px] font-semibold bg-slate-200 text-slate-700 hover:bg-slate-300 transition">清除所有勾选({selectedCells.size})</button>
            </>}
            {reserveMode&&<span className="text-[10px] text-[var(--twin-mute)] ml-1 select-none">🖱️ 点击勾选可认领的 type2 笼位 · <kbd className="text-[9px] px-0.5 py-px rounded border border-[var(--twin-hairline)] bg-[var(--twin-canvas)]">Shift</kbd>+点击 矩形多选</span>}
            {pageMode==="allocate"&&!boxSelectMode&&<span className="text-[10px] text-[var(--twin-mute)] ml-1 select-none">🖱️ 点击选中 · <kbd className="text-[9px] px-0.5 py-px rounded border border-[var(--twin-hairline)] bg-[var(--twin-canvas)]">Shift</kbd>+点击 矩形多选</span>}
            {boxSelectMode&&<span className="text-[10px] text-amber-600 font-medium ml-1 select-none animate-pulse">⬜ 请点击第一个笼位设置框选起点</span>}

            {/* ── 编辑模式操作按钮（扫码由常驻「扫码定位」联动） ── */}
            {editMode&&<>
              {scanCache.size>0&&(()=>{const addCount=Array.from(scanCache.values()).reduce((n,e)=>{for(const a of e.currentActions)if(!e.initialActions.has(a))n++;return n;},0);const delCount=Array.from(scanCache.values()).reduce((n,e)=>{for(const a of e.initialActions)if(!e.currentActions.has(a))n++;return n;},0);const total=addCount+delCount;return<button onClick={handleEditSubmit} disabled={actionSubmitting||total===0}
                className="rounded-twin-md px-2.5 py-1 text-[11px] font-semibold bg-[var(--twin-primary)] text-white disabled:opacity-40">
                提交{total>0?` +${addCount} −${delCount}`:` (${scanCache.size})`}
              </button>;})()}
              <button type="button" onClick={()=>{setScanCache(new Map());setLastScannedKey(null);}}
                className="rounded-twin-md px-3 py-1.5 text-[11px] font-semibold text-slate-500 bg-slate-100 border border-slate-200 hover:bg-slate-200 hover:text-slate-700 transition">清除</button>
            </>}
            {/* ── 扫码确认模式：由常驻「扫码定位」联动判定，无专用输入 ── */}
            {/* 表单管理入口（仅查看模式可见） */}
            {viewOnly&&<a href={toAdminRoutePath("/admin/cage-shelves/records")} onClick={e=>{e.preventDefault();nav(toAdminRoutePath("/admin/cage-shelves/records"));}} className="rounded-twin-md px-2.5 py-1 text-[11px] font-semibold no-underline border border-[var(--twin-hairline)] text-[var(--twin-ink)] hover:bg-[var(--twin-canvas)] transition">记录</a>}
            {viewOnly&&<a href={toAdminRoutePath("/admin/cage-shelves/forms")} onClick={e=>{e.preventDefault();nav(toAdminRoutePath("/admin/cage-shelves/forms"));}} className="rounded-twin-md px-2.5 py-1 text-[11px] font-semibold no-underline bg-[var(--twin-primary)] text-white hover:opacity-90 transition">表单管理</a>}
            {viewOnly&&<button type="button" onClick={handleReconcileOccupancy} className="rounded-twin-md px-2.5 py-1 text-[11px] font-semibold border border-[var(--twin-hairline)] text-[var(--twin-ink)] hover:bg-[var(--twin-canvas)] transition">修正占用</button>}
            <button type="button" onClick={()=>setLegend(v=>!v)} className={`flex items-center gap-1 rounded-twin-md px-2 py-1 text-[10px] transition ${legend?'bg-[var(--twin-link-deep)] text-white':'text-[var(--twin-mute)] hover:text-[var(--twin-ink)]'}`}><Info className="h-3 w-3"/>图例{legend?' ▲':' ▼'}</button>
            {isSuperAdmin&&<button type="button" onClick={()=>setSettingsOpen(true)} className="flex items-center gap-1 rounded-twin-md px-2 py-1 text-[10px] transition text-[var(--twin-mute)] hover:text-[var(--twin-ink)]" title="设置中心"><Settings2 className="h-3 w-3"/>设置</button>}
          </div>
        </div>
        {legend&&<CageShelfLegend/>}
        {/* ── 编辑模式：动作缓存面板 ── */}
        {editMode&&<div className="shrink-0 rounded-twin-lg border border-transparent bg-transparent p-2" style={scanCache.size===0?{padding:0,borderWidth:0}:{borderColor:"var(--twin-hairline)",backgroundColor:"var(--twin-canvas)"}}>
          <div className="flex flex-wrap gap-2">{Array.from(scanCache.entries()).map(([key,entry])=>{
            const pos=entry.cell.position;const code=entry.code;
            const changed=(a:CageBoxAction)=>entry.initialActions.has(a)!==entry.currentActions.has(a);
            const ACTIONS=CAGE_BOX_ACTION_LIST;
            const parts=key.split(":");const jumpSid=parts[0]||"";
            return <div key={key} onClick={()=>{
              // 自动切到该笼架所在房间
              let foundRid="";for(const[rid,shelves]of roomShelveMap){if(shelves.some(s=>s.shelveId===jumpSid)){foundRid=rid;break;}}
              if(foundRid&&foundRid!==aRid){setARid(foundRid);setARname(foundRid);expandToRoom(foundRid);}
              setTimeout(()=>{document.getElementById(`shelf-${jumpSid}`)?.scrollIntoView({behavior:"smooth",block:"center"});},300);
            }}
              className="rounded-twin-md border border-[var(--twin-hairline)] bg-white px-3 py-2 text-[11px] cursor-pointer hover:shadow-sm hover:border-[var(--twin-primary)]/30 transition">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="font-semibold text-[var(--twin-ink)] text-xs">{pos}</span>
                <span className="text-[var(--twin-mute)] font-mono text-[10px]">{code}</span>
                <button onClick={(e)=>{e.stopPropagation();setScanCache(prev=>{const next=new Map(prev);next.delete(key);return next;});if(lastScannedKey===key)setLastScannedKey(null);}}
                  className="ml-auto text-[var(--twin-mute)] hover:text-red-500 text-xs">✕</button>
              </div>
              <div className="flex flex-wrap gap-1.5">{ACTIONS.map(a=>{const meta=cageBoxAction(a);const c=cageStatusColors[meta.statusCode]??DEFAULT_COLORS[meta.statusCode];const has=entry.currentActions.has(a);const init=entry.initialActions.has(a);const ch=has!==init;
                return <button key={a} onClick={(e)=>{e.stopPropagation();setScanCache(prev=>{const next=new Map(prev);const e2=next.get(key);if(!e2)return prev;const cur=new Set(e2.currentActions);cur.has(a)?cur.delete(a):cur.add(a);if(setsEqual(cur,e2.initialActions))next.delete(key);else next.set(key,{...e2,currentActions:cur});return next;});}}
                  className="flex items-center gap-1 rounded-twin-sm px-1.5 py-0.5 text-[10px] font-semibold transition border"
                  style={{ borderColor: has?(ch?"#f59e0b":c?.border):"var(--twin-hairline)", background:"var(--twin-canvas)" }}>
                  {/* 色块预览：选中即用该状态配置色，未选灰色占位 */}
                  <span className="w-5 h-3 rounded border-2 shrink-0" style={{ backgroundColor: has?c?.bg:"#e5e7eb", borderColor: has?c?.border:"#cbd5e1" }} />
                  <span style={{ color:"var(--twin-ink)" }}>{meta.label}</span>
                  <span className="text-[9px]" style={{ color: ch?(has?"#b45309":"#dc2626"):"transparent" }}>{ch?(has?"+":"−"):""}</span>
                </button>;})}
              </div>
            </div>;})}
          </div>
        </div>}
        </div>
        <div className="cage-scroll flex-1 min-h-0 overflow-y-auto space-y-2 [scrollbar-width:thin] [scrollbar-color:var(--twin-hairline)_transparent]">
        {tab==="filter"&&<>
          {/* BOOKING MODE: 笼位预约管理 — 左（预约数据）右（笼架实时预览） */}
          {pageMode==="booking"&&<>
            {!bookingLoading&&bookingRooms.length===0&&<div className="rounded-twin-xl border border-dashed border-[var(--twin-hairline)] bg-[var(--twin-canvas)] h-full flex flex-col items-center justify-center text-center text-sm text-[var(--twin-mute)]"><LayoutGrid className="h-10 w-10 mx-auto mb-3 opacity-20"/>暂无预约数据<br/><span className="text-[11px]">请点击顶部「🔄 同步 ARO」从远端拉取房间预约数据</span></div>}
            {!aRid&&!(bookingRooms.length===0&&!bookingLoading)&&<div className="rounded-twin-xl border border-dashed border-[var(--twin-hairline)] bg-[var(--twin-canvas)] h-full flex flex-col items-center justify-center text-center text-sm text-[var(--twin-mute)]"><LayoutGrid className="h-10 w-10 mx-auto mb-3 opacity-20"/>展开左侧目录，点击房间查看笼位预约<br/><span className="text-[11px]">选中房间后可查看和编辑 AUP 课题组分配，点击笼架预览笼位</span></div>}
            {aRid&&bookingLoading&&<div className="rounded-twin-xl border border-dashed border-[var(--twin-hairline)] bg-[var(--twin-canvas)] h-full flex items-center justify-center text-sm text-[var(--twin-mute)]"><Loader2 className="h-4 w-4 animate-spin mr-2"/>加载预约数据…</div>}
            {aRid&&!bookingLoading&&<div className="flex gap-3 min-h-0 h-full">
              {/* Left: booking data */}
              <div className="w-1/2 flex flex-col min-w-0">
                <CageBookingPanel room={bookingRoom} roomId={aRid} onChanged={loadBookingRooms}/>
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
              return<div key={sid||idx} id={`shelf-${sid}`}><ShelfGrid title={d.shelfMeta?.shelveName??`笼架 ${idx+1}`} detail={d} loading={false} emptyHint="暂无笼架数据" isBookmarked={isBm} onToggleBookmark={sid!==""?()=>toggleBm(sid):undefined} onCellClick={pageMode==="allocate"?(c:any)=>{if(!c.empty)setCell(c);}:archiveMode?(c:any)=>handleArchiveCell(c,sid):confirmMode?(c:any)=>handleConfirmCell(c,sid):(c:any)=>handleGridCellClick(c,sid)} alertMap={alertMap} selectable={pageMode==="allocate"||reserveMode} selectedCells={pageMode==="allocate"||reserveMode?selectedCells:undefined} onToggleCell={pageMode==="allocate"?handleAllocateToggle:reserveMode?handleReserveToggle:undefined} allocMode={pageMode==="allocate"||reserveMode} clickMode={reserveMode?"toggle":"checkbox"} scanCache={scanCache} lastScannedKey={lastScannedKey} editMode={editMode} confirmMode={confirmMode} crossX={highlightCross.crossX} crossY={highlightCross.crossY} crossSid={highlightCross.crossSid} scanLockTarget={scanLockTarget}/></div>;
            })}</div>}
          </>}

          {/* SHELF MODE: left grid + right detail (like student page) */}
          {pageMode!=="booking"&&viewMode==="shelf"&&<div className="flex gap-3 min-h-0" style={{height:"calc(100vh - 190px)"}}>
            {/* Left: 8×10 grid */}
            <div className="w-1/2 flex flex-col min-w-0">
              {shelfLoading&&<div className="flex-1 rounded-twin-xl border border-dashed border-[var(--twin-hairline)] bg-[var(--twin-canvas)] grid place-items-center text-sm text-[var(--twin-mute)]">加载笼架…</div>}
              {!shelfLoading&&!shelfDetail&&<div className="flex-1 rounded-twin-xl border border-dashed border-[var(--twin-hairline)] bg-[var(--twin-canvas)] flex flex-col items-center justify-center text-sm text-[var(--twin-mute)]"><LayoutGrid className="h-10 w-10 mb-3 opacity-20"/>点击左侧笼架<br/><span className="text-[11px]">选中后显示该笼架 8×10 笼位</span></div>}
              {!shelfLoading&&shelfDetail&&<ShelfGrid title={shelfDetail.shelfMeta?.shelveName||"笼架"} detail={shelfDetail} loading={false} emptyHint="暂无数据" onCellClick={pageMode==="allocate"?(c:any)=>{if(!c.empty)setCell(c);}:archiveMode?(c:any)=>handleArchiveCell(c,String(shelfDetail?.shelfMeta?.shelveId??"")):confirmMode?(c:any)=>handleConfirmCell(c,String(shelfDetail?.shelfMeta?.shelveId??"")):handleGridCellClick} alertMap={alertMap} selectable={pageMode==="allocate"||reserveMode} selectedCells={pageMode==="allocate"||reserveMode?selectedCells:undefined} onToggleCell={pageMode==="allocate"?handleAllocateToggle:reserveMode?handleReserveToggle:undefined} allocMode={pageMode==="allocate"||reserveMode} clickMode={reserveMode?"toggle":"checkbox"} scanCache={scanCache} lastScannedKey={lastScannedKey} editMode={editMode} confirmMode={confirmMode} crossX={highlightCross.crossX} crossY={highlightCross.crossY} crossSid={highlightCross.crossSid} scanLockTarget={scanLockTarget}/>}
            </div>
            {/* Right: cell detail / edit actions / bind confirm */}
            <div className="w-1/2 flex flex-col min-w-0 gap-2">
              {/* 编辑模式：单笼架详情 + 状态选项 */}
              {editMode&&cell&&!cell.empty&&(()=>{const sid=shelfDetail?.shelfMeta?.shelveId??"";const ck=`${sid}:${cell.x}:${cell.y}`;const entry=scanCache.get(ck);
                return<div className="flex-1 flex flex-col min-h-0 rounded-twin-xl border-2 overflow-hidden" style={{borderColor:"var(--twin-primary)"}}>
                  <div className="shrink-0 px-3 py-2 flex items-center justify-between" style={{background:"rgba(172,23,54,0.06)"}}><div className="text-sm font-semibold text-[var(--twin-ink)]">状态选择 · {cell.position}</div><button className="text-xs text-[var(--twin-mute)] hover:text-[var(--twin-ink)]" onClick={()=>{setCell(null);setShelfId(null);}}>清除</button></div>
                  <div className="flex-1 overflow-y-auto p-3 space-y-3">
                    <div className="flex flex-col gap-2">{CAGE_BOX_ACTIONS.map(({action:a,label,statusCode})=>{const c= cageStatusColors[statusCode] ?? DEFAULT_COLORS[statusCode];const cbi2=cell.cageBoxInfo as Record<string,any>|undefined;const cvo2=cbi2?.cageBoxVo??cbi2?.["cageBoxVo"]??{};const ld=(cell as any).detail as Record<string,any>|undefined;const localActions=dataSource==="local"?actionsFromFormValues(editFormValues):actionsFromCageBoxInfo(cbi2,cvo2);const srvHas=!entry&&(localActions.has(a)||((a==="SPECIAL_BREEDING"&&!!cbi2?.specialBreedingName)||(a==="HEALTH_CHECK"&&!!cbi2?.animalHealthEntity)));const has=entry?entry.currentActions.has(a):srvHas;const init=entry?entry.initialActions.has(a):srvHas;const changed=has!==init;
                      return<button key={a} onClick={()=>{const cbi=cell.cageBoxInfo as Record<string,any>|undefined;const cvo=cbi?.cageBoxVo??cbi?.["cageBoxVo"]??{};let code=(cell as any).cageBoxCode??cbi?.cageBoxCode;if(!code)code=cvo.cageBoxCode??cvo["cageBoxCode"]??"";
                        setScanCache(prev=>{const next=new Map(prev);
                          if(next.has(ck)){const e=next.get(ck)!;const cur=new Set(e.currentActions);cur.has(a)?cur.delete(a):cur.add(a);if(setsEqual(cur,e.initialActions))next.delete(ck);else next.set(ck,{...e,currentActions:cur});}
                          else{const initSet=dataSource==="local"?actionsFromFormValues(editFormValues):actionsFromCageBoxInfo(cbi,cvo);const curSet=new Set(initSet);curSet.add(a);next.set(ck,{cell,code,initialActions:initSet,currentActions:curSet,images:[],notes:""});}
                          return next;});setLastScannedKey(ck);}}
                        className="flex items-center gap-2 rounded-twin-md border-2 px-3 py-2.5 text-sm font-semibold transition hover:brightness-95"
                        style={{borderColor:has?c?.border:"var(--twin-hairline)",background:"var(--twin-canvas)"}}>
                        {/* 色块预览：选中即用该状态配置的背景/边框色（与图例说明一致） */}
                        <span className="w-8 h-5 rounded border-2 shrink-0" style={{backgroundColor: has ? (c?.bg ?? "#ccc") : "#f1f5f9", borderColor: has ? (c?.border ?? "#999") : "#cbd5e1"}} />
                        <span className="flex-1 text-left" style={{color:"var(--twin-ink)"}}>{label}</span>
                        <span className="text-[11px]" style={{color:changed?"var(--twin-warning)":has?c?.border:"var(--twin-mute)"}}>{changed?"已变更":has?"已标记":"点击标记"}</span>
                      </button>;})}
                    </div>
                    <div className="pt-2 border-t border-[var(--twin-hairline)] text-[10px] text-[var(--twin-mute)]">笼位信息</div>
                    <div className="grid grid-cols-2 gap-2 text-xs">{["DepartmentName","ProjectPiName","AupNumber","StateName"].map(k=>{const source=cell.cageBoxInfo??cell.detail??{};const v=source[k];return<div key={k} className="rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1"><div className="text-[var(--twin-mute)]">{CAGE_BOX_INFO_LABEL[k]??k}</div><div className="text-[var(--twin-ink)]">{formatCageDetailValue(v,k)}</div></div>;})}</div>
                  </div>
                </div>;})()}
              {/* 查看模式：笼盒详情 */}
              {!editMode&&!confirmMode&&!archiveMode&&!reserveMode&&(()=>{if(!cell)return<div className="flex-1 rounded-twin-xl border border-dashed border-[var(--twin-hairline)] bg-[var(--twin-canvas)] flex flex-col items-center justify-center text-sm text-[var(--twin-mute)]"><div className="text-4xl mb-3 opacity-20">📋</div>笼盒详情预备画面<br/><span className="text-[11px]">点击左侧笼位格子显示笼盒信息</span></div>;
                return<div className="flex-1 overflow-y-auto rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-3">
                <div className="mb-2 flex items-center justify-between"><div className="text-sm font-semibold text-[var(--twin-ink)]">笼盒详情 · 格位 {displayPosition(cell.position)}</div><button type="button" className="text-xs text-[var(--twin-mute)] hover:text-[var(--twin-ink)]" onClick={()=>setCell(null)}>清除</button></div>
                {dataSource==="local"
                  ? <LocalDetailPanel cell={cell} onClose={()=>setCell(null)}/>
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
          ? <LocalDetailPanel cell={cell} onClose={()=>{setCell(null);setShelfId(null);}}/>
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
    {allocDialogOpen&&<AllocDialog aupList={allocAupList} selectedAupId={selectedAupId} setSelectedAupId={setSelectedAupId} selectedCells={selectedCells} allocSubmitting={allocSubmitting} onClose={()=>setAllocDialogOpen(false)} onConfirm={handleConfirmAssign}/>}
    <ReservePersonDialog open={reserveOpen} submitting={reserveSubmitting} groupNames={reserveAupGroupNames} onClose={()=>{setReserveOpen(false);setReservePerson(null);}} onConfirm={(p)=>{setReservePerson(p);handleReserveConfirm(p);}}/>

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
              const ck=`${sid}:${editDialogCell.x}:${editDialogCell.y}`;
              // ARO 模式：批量缓存
              const cbi=editDialogCell.cageBoxInfo as Record<string,any>|undefined;
              const cvo=cbi?.cageBoxVo??cbi?.["cageBoxVo"]??{};
              let code=(editDialogCell as any).cageBoxCode??cbi?.cageBoxCode;
              if(!code)code=cvo.cageBoxCode??cvo["cageBoxCode"]??"";
              setScanCache(prev=>{const next=new Map(prev);
                if(next.has(ck)){const e=next.get(ck)!;const cur=new Set(e.currentActions);cur.has(a)?cur.delete(a):cur.add(a);if(setsEqual(cur,e.initialActions))next.delete(ck);else next.set(ck,{...e,currentActions:cur});}
                else{const init=dataSource==="local"?actionsFromFormValues(editFormValues):actionsFromCageBoxInfo(cbi,cvo);const cur=new Set(init);cur.has(a)?cur.delete(a):cur.add(a);next.set(ck,{cell:editDialogCell,code,initialActions:init,currentActions:cur,images:[],notes:""});}
                return next;});
              setLastScannedKey(ck);
            }}
              className="flex items-center gap-2 rounded-twin-md border-2 px-3 py-2.5 text-sm font-semibold transition hover:brightness-95"
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
          <DialogTitle>扫码确认 · 核对信息</DialogTitle>
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
    {/* ---- 归档弹窗 ---- */}
    <Dialog open={archiveMode && !!archiveTarget} onOpenChange={(o) => { if (!o) setArchiveTarget(null); }}>
      <DialogContent className="z-[var(--z-modal)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>归档笼位</DialogTitle>
          <DialogDescription className="space-y-2">
            <div className="rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] divide-y divide-[var(--twin-hairline)]">
              {(() => {
                const rows: { label: string; value: string; em?: boolean }[] = [];
                if (archiveTarget?.positionLabel) rows.push({ label: "笼位", value: archiveTarget.positionLabel });
                if (archiveTarget?.occupantName) rows.push({ label: "占用者", value: archiveTarget.occupantName, em: true });
                if (archiveTarget?.projectPiName) rows.push({ label: "课题组 PI", value: archiveTarget.projectPiName });
                if (archiveTarget?.aupNumber) rows.push({ label: "AUP 编号", value: archiveTarget.aupNumber });
                return rows.map((r, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 text-xs">
                    <span className="text-[var(--twin-mute)]">{r.label}</span>
                    <span className={r.em ? "font-semibold text-[var(--twin-ink)]" : "text-[var(--twin-ink)]"}>{r.value || "-"}</span>
                  </div>
                ));
              })()}
            </div>
            <div className="rounded-twin-md bg-amber-50 border border-amber-200 px-3 py-2 text-center">
              <span className="text-[11px] text-amber-700 font-semibold">确认归档该笼位？归档后释放占用并回到空笼盒</span>
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <AdminButton type="button" tone="secondary" size="default" onClick={() => setArchiveTarget(null)}>取消</AdminButton>
          <AdminButton type="button" size="default" onClick={handleArchiveConfirm} disabled={archiveSubmitting}>
            {archiveSubmitting ? "归档中..." : "确认归档"}
          </AdminButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    {/* ---- 设置中心（齿轮）---- */}
    <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
      <DialogContent className="z-[var(--z-modal)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>设置中心</DialogTitle>
          <DialogDescription>数据源与笼位扫码确认相关配置</DialogDescription>
        </DialogHeader>
        <div className="mb-3">
          <div className="mb-1.5 text-[11px] font-semibold text-[var(--twin-mute)]">数据源</div>
          <div className="flex items-center gap-1 rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-1">
            <button type="button" onClick={() => switchDataSource("aro")}
              className={`flex-1 rounded-twin-md px-2 py-1.5 text-[12px] font-semibold transition ${dataSource==="aro"?"bg-[var(--twin-primary)] text-white":"text-[var(--twin-mute)] hover:text-[var(--twin-ink)]"}`}>
              ☁️ ARO
            </button>
            <button type="button" onClick={() => switchDataSource("local")}
              className={`flex-1 rounded-twin-md px-2 py-1.5 text-[12px] font-semibold transition ${dataSource==="local"?"bg-[var(--twin-primary)] text-white":"text-[var(--twin-mute)] hover:text-[var(--twin-ink)]"}`}>
              🏠 本地
            </button>
          </div>
        </div>
        <CageScanSettingsPanel />
      </DialogContent>
    </Dialog>
    {/* ---- 笼位ID同步方式选择 ---- */}
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
  </AdminPageShell>;
}

/* 预约模式：占用者选择弹窗（管理员侧，免审核） */
function ReservePersonDialog({ open, submitting, groupNames, onClose, onConfirm }: {
  open: boolean;
  submitting: boolean;
  groupNames: string[];
  onClose: () => void;
  onConfirm: (p: { name: string; accountId: string }) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Array<{ id: number; name: string; accountId: string; projectGroupName: string }>>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<{ name: string; accountId: string } | null>(null);

  const search = async (kw: string) => {
    setQuery(kw);
    if (!kw.trim()) { setResults([]); return; }
    setSearching(true);
    try { setResults(await searchPersonnelByKeyword(kw.trim())); }
    catch { setResults([]); }
    finally { setSearching(false); }
  };

  // 打开弹窗时自动预览该笼位 AUP 的课题组及其成员
  useEffect(() => {
    if (!open) return;
    setSelected(null);
    setQuery("");
    if (groupNames.length === 0) { setResults([]); return; }
    setSearching(true);
    (async () => {
      const all: Array<{ id: number; name: string; accountId: string; projectGroupName: string }> = [];
      for (const g of groupNames) {
        try {
          const list = await searchPersonnelByKeyword(g);
          all.push(...list.filter((p) => p.projectGroupName === g));
        } catch {}
      }
      setResults(all);
      setSearching(false);
    })();
  }, [open, groupNames]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setSelected(null); onClose(); } }}>
      <DialogContent className="z-[var(--z-modal)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>选择占用者</DialogTitle>
          <DialogDescription>认领笼位后，该人员将成为占用者（免审核，直接锁定）</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <div className="flex items-center gap-1 rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1">
            <Search className="h-3.5 w-3.5 shrink-0 text-[var(--twin-mute)]" />
            <input type="text" value={query} onChange={(e) => search(e.target.value)} placeholder="搜索人员姓名/账号…"
              className="flex-1 bg-transparent text-xs outline-none text-[var(--twin-ink)] placeholder:text-[var(--twin-mute)]" />
            {query && <button onClick={() => { setSelected(null); search(""); }} className="text-[var(--twin-mute)] hover:text-[var(--twin-ink)]">✕</button>}
          </div>
          {groupNames.length > 0 && (
            <div className="text-[11px] text-[var(--twin-mute)]">课题组：{groupNames.join("、")}</div>
          )}
          {selected ? (
            <div className="flex items-center gap-2 rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1.5">
              <span className="flex-1 text-xs text-[var(--twin-ink)]">{selected.name}</span>
              <button onClick={() => setSelected(null)} className="text-[var(--twin-mute)] hover:text-[var(--twin-ink)]">✕</button>
            </div>
          ) : (
            (searching || results.length > 0) && (
              <div className="border border-[var(--twin-hairline)] rounded-twin-md overflow-hidden">
                <div className="max-h-48 overflow-y-auto">
                  {searching && <div className="px-3 py-2 text-center text-xs text-[var(--twin-mute)]">搜索中…</div>}
                  {!searching && results.length === 0 && <div className="px-3 py-2 text-center text-xs text-[var(--twin-mute)]">无匹配结果</div>}
                  {!searching && results.map((p) => (
                    <button key={p.id} onClick={() => setSelected({ name: p.name, accountId: p.accountId })}
                      className="w-full text-left px-3 py-2 text-xs border-b border-[var(--twin-hairline)] last:border-b-0 hover:bg-[var(--app-color-surface-hover)] text-[var(--twin-ink)]">
                      <span className="font-medium">{p.name}</span>
                      {p.projectGroupName && <span className="ml-1 text-[10px] text-[var(--twin-mute)]">{p.projectGroupName}</span>}
                    </button>
                  ))}
                </div>
              </div>
            )
          )}
        </div>
        <DialogFooter className="gap-2">
          <AdminButton type="button" tone="secondary" size="default" onClick={() => { setSelected(null); onClose(); }}>取消</AdminButton>
          <AdminButton type="button" size="default" disabled={submitting || !selected} onClick={() => selected && onConfirm(selected)}>
            {submitting ? "认领中..." : "确认认领"}
          </AdminButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
