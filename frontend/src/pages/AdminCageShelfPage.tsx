import { useEffect, useMemo, useRef, useState, memo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toAdminRoutePath } from "@/features/admin/buildAdminNavModel";
import toast from "react-hot-toast";
import { useQuery } from "@tanstack/react-query";
import { LayoutGrid, Star, ChevronDown, ChevronRight, Search, Info, PanelLeftClose, PanelLeft, KeyRound, Loader2, Scan, Check, X, QrCode } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import {
  fetchCageShelfDetail, fetchCageScanProgress, refreshCellDetail,
  type CageShelfCell, type CageShelfDetail,
  fetchBookmarks, toggleBookmarkApi, fetchShelfCells,
  type BookmarkEntry,
  fetchFullTree, type CageShelfTreeNode,
  fetchPersistedAlerts, type PersistedAlert,
  fetchSnapshotBatches, type SnapshotBatch,
  fetchRealtimeRefresh, forceRealtimeRefresh, type RealtimeRefreshResponse,
  fetchAllocationAups, type AupItem,
  assignCages, cancelCageAssignment,
  fetchBookingRooms, type BookingRoom,
  executeCageBoxAction, type CageBoxAction, type CageBoxActionRequest,
  cancelCageBoxColor, ACTION_CANCEL_COLOR, type CancelColor,
  bindCageBox, unbindCageBox, updateAnimalCage, type AnimalCageUpdatePayload,
} from "@/api/domains/cageShelf.api";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { Portal } from "@/components/Portal";
import { useCasBinding } from "@/features/auth/CasBindingContext";
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
import CageCellOverlays, { getDominantStatusCode, useStatusStyle, CAGE_TYPE_LABEL } from "@/features/cage-shelf/components/CageCellOverlays";
import CageShelfLegend from "@/features/cage-shelf/components/CageShelfLegend";
import CageScanProgressBanner from "@/features/cage-shelf/components/CageScanProgressBanner";
import MobileScanDialog from "@/pages/mobile/MobileScanDialog";
import { CageColorProvider, useCageColors } from "@/features/cage-shelf/components/CageColorContext";

/* ================================================================== */
/*  Constants                                                           */
/* ================================================================== */

const CAGE_BOX_INFO_FIELD_ORDER = [
  "AnimalCageType","PositionX","PositionY","AreaId","DepartmentName",
  "floorId","RoomName","ShelveName","ProjectPiName","MobilePhone",
  "AupNumber","CageBoxQrCode","createAdmin","CreateTime","UpdateTime",
  "SpecialBreedingName","specialBreedingDescription",
  "NeedDivideYn","NeedFeedingYn","NeedTransferYn","AbnormalHealthYn","ClosingDate",
  "State","StateName","HasPhysicalBox",
] as const;

const CAGE_BOX_INFO_LABEL: Record<string,string> = {
  AnimalCageType:"笼位类型",PositionX:"X 坐标",PositionY:"Y 坐标",
  AreaId:"区域 ID",DepartmentName:"部门",floorId:"楼层 ID",
  RoomName:"房间名称",ShelveName:"笼架名称",ProjectPiName:"课题 PI",
  MobilePhone:"手机号",AupNumber:"AUP 编号",CageBoxQrCode:"笼盒卡号",
  createAdmin:"创建人",CreateTime:"创建时间",UpdateTime:"更新时间",
  SpecialBreedingName:"特殊饲养名称",specialBreedingDescription:"特殊饲养说明",
  NeedDivideYn:"请分笼",NeedFeedingYn:"特殊饲养",NeedTransferYn:"动物转移",
  AbnormalHealthYn:"健康异常",ClosingDate:"合笼日期",
  State:"状态值",StateName:"状态名称",HasPhysicalBox:"是否有实体笼盒",
};

/* ================================================================== */
/*  Helpers                                                             */
/* ================================================================== */

function nonEmptyText(s?:string|null):boolean{return typeof s==="string"&&s.trim()!==""}
function formatCageDetailValue(v:unknown,key?:string):string{
  if(v===null||v===undefined||v==="")return"-";
  if(typeof v==="boolean")return v?"是":"否";
  if(key==="AnimalCageType"){
    const ct = Number(v);
    return CAGE_TYPE_LABEL[ct] ?? String(v);
  }
  return String(v);
}

/* ================================================================== */
/*  CellButton + ShelfGrid                                              */
/* ================================================================== */

/** 坐标显示反转：后端 A-1(顶行) → 显示 A-10(底行)，内容不动仅编号反转 */
function displayPosition(pos: string): string {
  const m = pos.match(/^([A-H])-(\d+)$/);
  if (!m) return pos;
  return `${m[1]}-${11 - parseInt(m[2])}`;
}

const CellButton=memo(function CellButton({cell,onClick,alert,selectable,selected,onToggle,allocMode,clickMode,editCacheEntry,isLastScanned,bindHighlight,bindPending,editMode,bindMode,isCrossCol,isCrossRow}:{
  cell:CageShelfCell;onClick?:(c:CageShelfCell)=>void;alert?:PersistedAlert;
  selectable?:boolean;selected?:boolean;onToggle?:(e:React.MouseEvent)=>void;allocMode?:boolean;
  clickMode?:"toggle"|"checkbox";
  editCacheEntry?:{initialActions:Set<CageBoxAction>;currentActions:Set<CageBoxAction>};
  isLastScanned?:boolean;bindHighlight?:boolean;bindPending?:boolean;editMode?:boolean;bindMode?:boolean;
  isCrossCol?:boolean;isCrossRow?:boolean;
}){
  const dominant=getDominantStatusCode(cell.specialStatuses,cell.cageBoxInfo);
  const singleStyle=useStatusStyle(dominant);
  const { colors: ctxColors } = useCageColors();
  // animalCageType 回退：API 返回 0 表示未设置
  const resolvedCageType: number | undefined = (() => {
    let ct = cell.animalCageType;
    if ((ct == null || ct === 0) && cell.cageBoxInfo) {
      const cbi = cell.cageBoxInfo as Record<string,unknown>;
      const raw = cbi.AnimalCageType ?? cbi.animalCageType;
      if (raw != null && raw !== '' && Number(raw) !== 0) ct = Number(raw);
    }
    // COHABITATION/SPECIAL_FEEDING → 饲养中(type 3)
    if ((ct == null || ct === 0 || isNaN(ct)) && Array.isArray(cell.specialStatuses)) {
      const codes = cell.specialStatuses.map((s: any) => s.code);
      if (codes.includes('COHABITATION') || codes.includes('SPECIAL_FEEDING')) ct = 3;
    }
    if ((ct == null || ct === 0 || isNaN(ct)) && cell.stateLabel) {
      const sl = String(cell.stateLabel);
      if (sl.includes('等待分配')) ct = 1;
      else if (sl.includes('空笼盒')) ct = 2;
      else if (sl.includes('饲养')) ct = 3;
      else if (sl.includes('异常')) ct = 4;
    }
    // 有 PI 或 cageBoxCode → 至少已预约，非等待分配
    if ((ct == null || ct === 0 || isNaN(ct)) && !cell.empty) {
      const cbi = cell.cageBoxInfo as Record<string, unknown> | undefined;
      if (cell.projectPiName || cbi?.cageBoxCode || cbi?.CageBoxQrCode) ct = 3;
      else ct = 1;
    }
    return (ct != null && ct !== 0 && !isNaN(ct)) ? ct : undefined;
  })();

  // 多状态分色（对齐 H5 GridCellButton）：收集所有非NORMAL状态的颜色，2+时平分渐变
  const allBgColors: string[] = [];
  (cell.specialStatuses ?? [])
    .filter((s: any) => s.code !== "NORMAL")
    .forEach((s: any) => {
      const c = ctxColors[s.code];
      if (c) allBgColors.push(c.bg);
    });
  const combinedBg = allBgColors.length >= 2
    ? `linear-gradient(to bottom, ${allBgColors.map((bg, i) => {
        const pct = Math.round((i / allBgColors.length) * 100);
        const pctNext = Math.round(((i + 1) / allBgColors.length) * 100);
        return `${bg} ${pct}%, ${bg} ${pctNext}%`;
      }).join(", ")})`
    : allBgColors.length === 1 ? allBgColors[0] : null;
  const style = combinedBg
    ? { ...singleStyle, background: combinedBg }
    : singleStyle;
  const pi=nonEmptyText(cell.projectPiName)?cell.projectPiName!.trim():nonEmptyText(cell.piName)?cell.piName!.trim():"";
  const isSelectable=selectable&&!cell.empty;
  const isToggleMode=clickMode==="toggle"; // 全房间=整卡toggle; 单笼架=仅checkbox toggle
  const isInCross=(isCrossCol||isCrossRow)&&!isLastScanned;
  const baseCls=cell.empty?"relative min-h-[82px] rounded-twin-md text-[10px] leading-tight border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] text-[var(--twin-mute)]":"relative min-h-[82px] rounded-twin-md text-[10px] leading-tight border-2 text-slate-900 hover:brightness-95";
  const cls=`${baseCls}${selected?" border-blue-500 bg-blue-100/20":""}${isInCross?" ring-2 ring-red-500":""}`;

  const handleCardClick=(e:React.MouseEvent)=>{
    if(isSelectable&&isToggleMode&&onToggle){onToggle(e);return;}
    if(isSelectable&&!isToggleMode){onClick?.(cell);return;}
    if(!cell.empty)onClick?.(cell);
  };
  const handleCheckboxClick=(e:React.MouseEvent)=>{e.stopPropagation();if(onToggle)onToggle(e);};
  return <button type="button" className={cls} style={selected?{...style,borderColor:"#3b82f6",borderWidth:"2px"}:style}
    onClick={handleCardClick} disabled={cell.empty&&!isSelectable}
    data-x={cell.x} data-y={cell.y}>
    {allocMode&&isSelectable&&<div className="absolute top-0.5 left-0.5 z-20" onClick={handleCheckboxClick}><input type="checkbox" checked={selected??false} readOnly className="w-3 h-3 accent-blue-600 pointer-events-none"/></div>}
    {!allocMode&&alert&&(()=>{const ALERT_COLORS:Record<string,string>={NEED_DIVIDE:"bg-amber-500 ring-amber-300",HEALTH_ABNORMAL:"bg-purple-500 ring-purple-300",ANIMAL_TRANSFER:"bg-cyan-500 ring-cyan-300",SPECIAL_FEEDING:"bg-red-500 ring-red-300",COHABITATION:"bg-emerald-500 ring-emerald-300"};const ac=ALERT_COLORS[alert.statusCode]||"bg-red-500 ring-red-300";return<div className="absolute top-0.5 left-0.5 z-20" title={`${alert.statusLabel} · 已存在${alert.spanDays ?? alert.persistedDays}天（不超过${alert.thresholdDays}天）`}><div className={`w-4 h-4 rounded-full ring-1 flex items-center justify-center shadow-sm animate-pulse ${ac}`}><span className="text-white text-[9px] font-bold leading-none">!</span></div></div>;})()}
    {/* 绑定高亮（选中=蓝色，缓存待提交=绿色） */}
    {bindHighlight&&!bindPending&&<div className="absolute inset-0 z-10 rounded-twin-md ring-2 ring-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.3)] pointer-events-none"/>}
    {bindPending&&<div className="absolute inset-0 z-10 rounded-twin-md ring-2 ring-green-500 shadow-[0_0_10px_rgba(34,197,94,0.35)] pointer-events-none"/>}
    {/* 编辑缓存标记 */}
    {editCacheEntry&&editCacheEntry.currentActions.size>0&&<div className="absolute top-0.5 right-0.5 z-20 flex gap-0.5">{Array.from(editCacheEntry.currentActions).map(a=><span key={a} className="text-[8px] px-1 rounded-full text-white font-bold" style={{background:a==="DIVIDE"?"#d97706":a==="SPECIAL_BREEDING"?"#dc2626":"#7c3aed"}}>{a==="DIVIDE"?"分":a==="SPECIAL_BREEDING"?"饲":"健"}</span>)}</div>}
    {isLastScanned&&<div className="absolute inset-0 z-10 rounded-twin-md ring-[3px] ring-red-500 shadow-[0_0_12px_rgba(239,68,68,0.4)] pointer-events-none"/>}
    {!cell.empty&&<CageCellOverlays animalCageType={resolvedCageType} compact/>}
    <div className="flex min-h-[76px] flex-col items-center justify-center gap-0 px-1 py-0.5 text-center">
      <div className="w-full font-bold text-[15px] leading-tight">{displayPosition(cell.position)}</div>
      {cell.empty
        ? <div className="text-[9px] text-[var(--twin-mute)]">空位</div>
        : <>
            {nonEmptyText(cell.projectGroup)&&<div className="w-full truncate text-[10px] leading-tight">{cell.projectGroup}</div>}
            {pi&&<div className="w-full truncate text-[13px] leading-tight font-semibold text-[var(--twin-ink)]">{pi}</div>}
            <div className="w-full text-[9px] text-[var(--twin-mute)]">{CAGE_TYPE_LABEL[resolvedCageType??0]||cell.stateLabel}</div>
          </>}
    </div>
  </button>;
});

function ShelfGrid({title,detail,loading,emptyHint,onCellClick,isBookmarked,onToggleBookmark,alertMap,selectable,selectedCells,onToggleCell,allocMode,clickMode,scanCache,lastScannedKey,bindSelectedKey,editMode,bindMode,crossX,crossY,crossSid,bindPairCache}:{
  title:string;detail:CageShelfDetail|null;loading:boolean;emptyHint?:string;
  onCellClick?:(c:CageShelfCell)=>void;isBookmarked?:boolean;onToggleBookmark?:()=>void;
  alertMap:Map<string,PersistedAlert>;
  selectable?:boolean;selectedCells?:Set<string>;onToggleCell?:(shelveId:string,x:number,y:number,shiftKey?:boolean)=>void;allocMode?:boolean;
  clickMode?:"toggle"|"checkbox";
  scanCache?:Map<string,any>;lastScannedKey?:string|null;bindSelectedKey?:string|null;editMode?:boolean;bindMode?:boolean;
  crossX?:number;crossY?:number;crossSid?:string;
  bindPairCache?:Map<string,{cell:CageShelfCell;code:string}>;
}){
  const sid=detail?.shelfMeta?.shelveId??"";
  const cells=detail?.grid??[];

  const gridContent=loading?<div className="flex-1 rounded-twin-lg border border-dashed text-xs text-[var(--twin-mute)] grid place-items-center">加载中...</div>
    :!detail||detail.totalCells===0?<div className="flex-1 rounded-twin-lg border border-dashed text-xs text-[var(--twin-mute)] grid place-items-center px-2 text-center">{emptyHint??"暂无数据"}</div>
    :<div className="flex-1 min-h-0 overflow-y-auto content-start p-[3px]">
        <div className="grid grid-cols-8 gap-1.5">{cells.map(c=>{const alertKey=`${sid}:${c.position}`;const selKey=`${sid}:${c.x}:${c.y}`;const ck=`${sid}:${c.x}:${c.y}`;const showCross=crossSid!=null&&crossSid===sid;const isBindCached=bindPairCache?.has(ck)??false;return<CellButton key={c.position} cell={c} onClick={onCellClick} alert={alertMap.get(alertKey)} selectable={selectable} selected={selectedCells?.has(selKey)} onToggle={onToggleCell?(e:React.MouseEvent)=>onToggleCell(sid,c.x,c.y,e.shiftKey):undefined} allocMode={allocMode} clickMode={clickMode} editCacheEntry={scanCache?.get(ck)} isLastScanned={lastScannedKey===ck} bindHighlight={bindSelectedKey===ck} bindPending={isBindCached} editMode={editMode} bindMode={bindMode} isCrossCol={showCross&&c.x===crossX} isCrossRow={showCross&&c.y===crossY}/>;})}</div>
      </div>;

  return <div className="rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-3 min-h-0 flex flex-col">
    <div className="mb-2 flex items-center justify-between shrink-0">
      <div className="text-sm font-semibold text-[var(--twin-ink)]">{title}</div>
      <div className="flex items-center gap-2">
        {detail?.shelfMeta&&<div className="text-[11px] text-[var(--twin-mute)]">{detail.shelfMeta.campusName}/{detail.shelfMeta.areaName}/{detail.shelfMeta.floorName}/{detail.shelfMeta.roomName}/{detail.shelfMeta.shelveName||detail.shelfMeta.shelveId}</div>}
        {onToggleBookmark&&<button type="button" className={`shrink-0 p-0.5 rounded transition ${isBookmarked?"text-amber-500 hover:text-amber-600":"text-slate-300 hover:text-amber-400"}`} onClick={onToggleBookmark} title={isBookmarked?"取消收藏":"收藏此笼架"}><Star className={`h-4 w-4 ${isBookmarked?"fill-amber-500":""}`}/></button>}
      </div>
    </div>
    {gridContent}
  </div>;
}

/* ================================================================== */
/*  BookmarkShelfGrid                                                   */
/* ================================================================== */

function BookmarkShelfGrid({roomId,shelveId,title,campusName,roomName,isBookmarked,onToggleBookmark,onCellClick,alertMap}:{
  roomId:string;shelveId:string;title:string;campusName?:string;roomName?:string;
  isBookmarked?:boolean;onToggleBookmark?:()=>void;onCellClick:(c:CageShelfCell)=>void;
  alertMap:Map<string,PersistedAlert>;
}){
  const snap=useQuery({queryKey:["shelfCells",roomId,shelveId],queryFn:()=>fetchShelfCells(roomId,shelveId),staleTime:5*60*1000});
  const hasReal=Boolean(snap.data?.cells?.some((c:any)=>!c.empty&&(c.animalCageType!=null||c.cageBoxJson||c.specialStatusesJson)));
  const cache=useQuery({queryKey:["cageShelfDetail",shelveId],queryFn:()=>fetchCageShelfDetail(shelveId),staleTime:5*60*1000,enabled:snap.isSuccess&&(snap.data?.isEmpty===true||!hasReal)});
  const loading=snap.isLoading||(cache.isEnabled&&cache.isLoading);
  const detail=useMemo(():CageShelfDetail|null=>{
    const meta={shelveId,shelveName:title,campusName:campusName||"",areaName:"",floorName:"",roomName:roomName||""};
    if(hasReal&&snap.data){const cells=snap.data.cells.map(snapshotCellToShelfCell);return{shelfMeta:meta,grid:cells,totalCells:cells.length,filledCells:cells.filter(c=>!c.empty).length};}
    if(cache.data)return cache.data;
    if(snap.data?.cells?.length){const cells=snap.data.cells.map(snapshotCellToShelfCell);return{shelfMeta:meta,grid:cells,totalCells:cells.length,filledCells:0};}
    return null;
  },[hasReal,snap.data,cache.data,title,campusName,roomName,shelveId]);
  if(loading)return<div className="text-xs text-[var(--twin-mute)] py-4 text-center">加载笼位…</div>;
  if(!detail||detail.totalCells===0)return<div className="text-xs text-[var(--twin-mute)] py-4 text-center">暂无数据 — 运行「全量笼位数据同步」或手动刷新后可见</div>;
  return<ShelfGrid title={title} detail={detail} loading={false} emptyHint="暂无笼架数据" isBookmarked={isBookmarked} onToggleBookmark={onToggleBookmark} onCellClick={onCellClick} alertMap={alertMap} selectable={false} allocMode={false}/>;
}
function snapshotCellToShelfCell(c:any):CageShelfCell{
  let cageBoxInfo:Record<string,unknown>|undefined;let specialStatuses:any[]|undefined;
  try{if(c.cageBoxJson)cageBoxInfo=JSON.parse(c.cageBoxJson);}catch{}
  try{if(c.specialStatusesJson)specialStatuses=JSON.parse(c.specialStatusesJson);}catch{}
  const x=c.positionX??0,y=c.positionY??0,label=c.positionLabel||`${String.fromCharCode(64+x)}-${y}`,empty=c.empty||(!c.animalCageType&&!cageBoxInfo);
  return{x,y,position:label,empty,stateLabel:empty?"空位":"",animalCageType:c.animalCageType??undefined,projectPiName:cageBoxInfo?.projectPiName as string??undefined,departmentName:cageBoxInfo?.departmentName as string??undefined,piName:cageBoxInfo?.piName as string??undefined,cageBoxInfo,specialStatuses};
}

/* ================================================================== */
/*  Static tree builder from flat fullTree rows                         */
/* ================================================================== */

const CAMPUS_ORDER=["浦东","浦西"]as const;
const CAMPUS_STYLES:Record<string,{bg:string;badge:string;text:string}>={
  "浦东":{bg:"linear-gradient(135deg,#0284c7,#0369a1)",badge:"rgba(255,255,255,0.18)",text:"#fff"},
  "浦西":{bg:"linear-gradient(135deg,#d97706,#b45309)",badge:"rgba(255,255,255,0.18)",text:"#fff"},
};
const cs=(n:string)=>CAMPUS_STYLES[n]??{bg:"#64748b",badge:"rgba(255,255,255,0.15)",text:"#fff"};

interface TreeNode {
  key:string;label:string;type:"campus"|"area"|"floor"|"room"|"shelf";
  children:TreeNode[];
  raw?:any;
}

function buildTree(rows:CageShelfTreeNode[]):TreeNode[]{
  const campusMap=new Map<string,TreeNode>();
  for(const r of rows){
    const cid=String(r.campusId??"");if(!cid)continue;
    if(!campusMap.has(cid)){
      campusMap.set(cid,{key:`c:${cid}`,label:r.campusName,type:"campus",children:[],raw:r});
    }
    const campus=campusMap.get(cid)!;
    // area
    const aid=String(r.areaId??"");
    let area=campus.children.find(a=>a.key===`a:${aid}`);
    if(!area&&aid){area={key:`a:${aid}`,label:r.areaName,type:"area",children:[],raw:r};campus.children.push(area);}
    // floor
    const fid=String(r.floorId??"");
    const parent=area||campus;
    let floor=parent.children.find(f=>f.key===`f:${fid}`);
    if(!floor&&fid){floor={key:`f:${fid}`,label:r.floorName,type:"floor",children:[],raw:r};parent.children.push(floor);}
    // room
    const rid=String(r.roomId??"");
    const p2=floor||parent;
    let room=p2.children.find(rm=>rm.key===`r:${rid}`);
    if(!room&&rid){room={key:`r:${rid}`,label:r.roomName,type:"room",children:[],raw:r};p2.children.push(room);}
    // shelf
    const sid=String(r.shelveId??"");
    if(sid&&room){room.children.push({key:`s:${sid}`,label:r.shelveName||sid,type:"shelf",children:[],raw:r});}
  }
  // sort campuses
  const campuses=[...campusMap.values()];
  campuses.sort((a,b)=>{
    const ai=CAMPUS_ORDER.indexOf(a.label as any),bi=CAMPUS_ORDER.indexOf(b.label as any);
    if(ai!==-1&&bi!==-1)return ai-bi;if(ai!==-1)return-1;if(bi!==-1)return 1;
    return a.label.localeCompare(b.label,"zh-CN");
  });
  return campuses;
}

/* ================================================================== */
/*  Static CampusTree                                                   */
/* ================================================================== */

function CampusTree({tree,exp,search,onToggle,onOpenRoom,viewMode,onOpenShelf,alertStatusesByShelf,alertStatusesByRoom,pageMode,bookingRooms}:{
  tree:TreeNode[];exp:Set<string>;search:string;onToggle:(k:string)=>void;onOpenRoom:(roomId:string,roomName:string)=>void;
  viewMode:"room"|"shelf";onOpenShelf:(shelveId:string,overrideRoomId?:string)=>void;
  alertStatusesByShelf:Map<string,Set<string>>;alertStatusesByRoom:Map<string,Set<string>>;
  pageMode?:"view"|"allocate"|"booking";bookingRooms?:BookingRoom[];
}){
  const q=search.trim().toLowerCase();
  const tg=(k:string)=>{const n=new Set(exp);n.has(k)?n.delete(k):n.add(k);onToggle(k);};
  return <div className="text-[11px] space-y-1.5">
    {tree.map(c=>{const open=exp.has(c.key),sty=cs(c.label);
      return <div key={c.key}>
        <button onClick={()=>tg(c.key)} className="w-full flex items-center gap-1.5 px-2.5 py-2 rounded-twin-lg text-left shadow-sm active:scale-[0.99] transition" style={{background:sty.bg}}>
          {open?<ChevronDown className="h-3.5 w-3.5 text-white/80"/>:<ChevronRight className="h-3.5 w-3.5 text-white/80"/>}
          <span className="flex-1 truncate text-xs font-bold" style={{color:sty.text}}>{c.label}校区</span>
        </button>
        {open&&<div className="mt-1 ml-1 space-y-0.5">{c.children.map(n=>renderNode(n,exp,q,tg,onOpenRoom,viewMode,onOpenShelf,alertStatusesByShelf,alertStatusesByRoom,pageMode,bookingRooms))}</div>}
      </div>;
    })}
    {tree.length===0&&<div className="text-[var(--twin-mute)] py-6 text-center">暂无数据，请先导入 CSV</div>}
  </div>;
}
function renderNode(n:TreeNode,exp:Set<string>,q:string,tg:(k:string)=>void,onOpenRoom:(rid:string,rname:string)=>void,viewMode?:"room"|"shelf",onOpenShelf?:(sid:string,overrideRoomId?:string)=>void,alertStatusesByShelf?:Map<string,Set<string>>,alertStatusesByRoom?:Map<string,Set<string>>,pageMode?:"view"|"allocate"|"booking",bookingRooms?:BookingRoom[]):React.ReactNode{
  const open=exp.has(n.key);
  if(n.type==="shelf"){
    const r=n.raw;
    const handleClick=()=>{
      if(pageMode==="booking"){
        // booking: set room context + load shelf realtime
        onOpenRoom(r.roomId,r.roomName);
        if(onOpenShelf)onOpenShelf(String(r.shelveId),String(r.roomId));
        return;
      }
      if(viewMode==="shelf"&&onOpenShelf){onOpenShelf(String(r.shelveId));return;}
      onOpenRoom(r.roomId,r.roomName);
      setTimeout(()=>document.getElementById(`shelf-${r.shelveId}`)?.scrollIntoView({behavior:'smooth',block:'start'}),300);
    };
    const counts=[r.type3||0,r.type1||0,r.type4||0,r.type2||0];
    const colors=["#f43f5e","#f59e0b","#3b82f6","#10b981"];
    const total=counts.reduce((a:number,b:number)=>a+b,0)||80;
    const bars=counts.map((c:number,i:number)=>({pct:Math.round(c/total*100),color:colors[i]})).filter((b:any)=>b.pct>0);
    const hasData=counts.some((c:number)=>c>0);
    const shelfStatuses = alertStatusesByShelf?.get(String(r.shelveId));
    const DOT:Record<string,string>={NEED_DIVIDE:"bg-amber-500",HEALTH_ABNORMAL:"bg-purple-500",ANIMAL_TRANSFER:"bg-cyan-500",SPECIAL_FEEDING:"bg-red-500",COHABITATION:"bg-emerald-500"};
    return <button key={n.key} onClick={handleClick}
      className="w-full text-left rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 hover:border-[var(--twin-hairline-strong)] transition ml-2">
      <div className="flex items-center gap-1"><LayoutGrid className="h-2.5 w-2.5 shrink-0 text-[var(--twin-mute)]"/><span className="truncate text-[10px] font-medium text-[var(--twin-ink)]">{n.label}</span>
      {shelfStatuses && shelfStatuses.size>0 && <span className="ml-auto shrink-0 flex items-center gap-0.5">{[...shelfStatuses].map(sc=><span key={sc} className={`inline-block w-2 h-2 rounded-full ${DOT[sc]||"bg-red-500"}`} />)}</span>}
      </div>
      <div className="flex h-1 rounded-full overflow-hidden bg-[var(--twin-canvas-soft)] mt-1">
        {hasData?bars.map((b:any,i:number)=><div key={i} className="h-full min-w-[2px]" style={{width:`${b.pct}%`,background:b.color}}/>):<div className="h-full w-full bg-[var(--twin-canvas-soft)]"/>}
      </div>
    </button>;
  }
  // room has special treatment: expand shows shelf children, plus aggregate progress bar
  if(n.type==="room"){
    const filtered=q?n.label.toLowerCase().includes(q):true;
    if(!filtered)return null;
    // booking mode: show booking progress bar instead of type1~4 aggregate
    const isBooking=pageMode==="booking";
    const bkRoom=isBooking?bookingRooms?.find(r=>String(r.roomId)===n.key.replace("r:","")):null;
    const bkBooked=bkRoom?.rentAnimalCageNumber??0;
    const bkUsed=bkRoom?.usedAnimalCageNumber??0;
    const bkTotal=bkRoom?.animalCageNumber??0;
    const bkBookedPct=bkTotal>0?Math.round(bkBooked/bkTotal*100):0;
    const bkUsedPct=bkTotal>0?Math.round(bkUsed/bkTotal*100):0;
    // Aggregate type1~4 from all shelf children for room-level progress bar (non-booking)
    const shelfChildren = n.children.filter(c => c.type === "shelf");
    const aggCounts = shelfChildren.reduce((acc, s) => {
      const r = s.raw;
      acc[0] += (r.type3 || 0);
      acc[1] += (r.type1 || 0);
      acc[2] += (r.type4 || 0);
      acc[3] += (r.type2 || 0);
      return acc;
    }, [0, 0, 0, 0]);
    const aggTotal = aggCounts.reduce((a: number, b: number) => a + b, 0) || (shelfChildren.length * 80);
    const colors = ["#f43f5e", "#f59e0b", "#3b82f6", "#10b981"];
    const aggBars = aggCounts.map((c: number, i: number) => ({ pct: Math.round((c / aggTotal) * 100), color: colors[i] })).filter((b: any) => b.pct > 0);
    const aggHasData = aggCounts.some((c: number) => c > 0);
    return <div key={n.key} data-room-key={n.key}>
      <button onClick={()=>{tg(n.key);if(isBooking)onOpenRoom(n.key.replace("r:",""),n.label);}} className="w-full text-left rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2.5 py-1.5 hover:border-[var(--twin-hairline-strong)] transition">
        <div className="flex items-center gap-1.5">
          {open?<ChevronDown className="h-3 w-3 text-[var(--twin-mute)]"/>:<ChevronRight className="h-3 w-3 text-[var(--twin-mute)]"/>}
          <span className="flex-1 truncate text-xs font-medium text-[var(--twin-ink)]">{n.label}</span>
          {isBooking&&bkRoom?<span className="text-[9px] text-[var(--twin-mute)] shrink-0">约{bkBooked} 用{bkUsed}</span>
          :<>{(()=>{const rs=alertStatusesByRoom?.get(n.key.replace("r:",""));if(!rs||rs.size===0)return null;const DOT:Record<string,string>={NEED_DIVIDE:"bg-amber-500",HEALTH_ABNORMAL:"bg-purple-500",ANIMAL_TRANSFER:"bg-cyan-500",SPECIAL_FEEDING:"bg-red-500",COHABITATION:"bg-emerald-500"};return<span className="shrink-0 flex items-center gap-0.5 ml-1">{[...rs].map(sc=><span key={sc} className={`inline-block w-2 h-2 rounded-full ${DOT[sc]||"bg-red-500"}`} />)}</span>;})()}
          <span className="text-[10px] text-[var(--twin-mute)]">{n.children.length}架</span></>}
        </div>
        {isBooking?<div className="flex gap-1 mt-1.5">
          <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-[var(--twin-canvas-soft)]">
            {bkBookedPct>0?<div className="h-full rounded-full bg-indigo-500" style={{width:`${bkBookedPct}%`}}/>:<div className="h-full w-full bg-[var(--twin-canvas-soft)]"/>}
          </div>
          <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-[var(--twin-canvas-soft)]">
            {bkUsedPct>0?<div className="h-full rounded-full bg-emerald-500" style={{width:`${bkUsedPct}%`}}/>:<div className="h-full w-full bg-[var(--twin-canvas-soft)]"/>}
          </div>
        </div>
        :<div className="flex h-1 rounded-full overflow-hidden bg-[var(--twin-canvas-soft)] mt-1.5">
          {aggHasData ? aggBars.map((b: any, i: number) => <div key={i} className="h-full min-w-[2px]" style={{ width: `${b.pct}%`, background: b.color }} />) : <div className="h-full w-full bg-[var(--twin-canvas-soft)]" />}
        </div>}
      </button>
      {open&&n.children.length>0&&<div className="flex flex-col gap-0.5 mt-1 ml-2">{n.children.map(s=>renderNode(s,exp,q,tg,onOpenRoom,viewMode,onOpenShelf,alertStatusesByShelf,alertStatusesByRoom,pageMode,bookingRooms))}</div>}
    </div>;
  }
  // area / floor
  return <div key={n.key}>
    <button onClick={()=>tg(n.key)} className="w-full flex items-center gap-1 rounded-twin-sm px-1.5 py-1 hover:bg-[var(--twin-canvas-soft)] transition">
      {open?<ChevronDown className="h-3 w-3 text-[var(--twin-mute)]"/>:<ChevronRight className="h-3 w-3 text-[var(--twin-mute)]"/>}
      <span className="truncate">{n.label}</span>
    </button>
    {open&&<div className="ml-2 space-y-0.5">{n.children.map(c=>renderNode(c,exp,q,tg,onOpenRoom,viewMode,onOpenShelf,alertStatusesByShelf,alertStatusesByRoom,pageMode,bookingRooms))}</div>}
  </div>;
}

/* ================================================================== */
/*  Main                                                                */
/* ================================================================== */

export default function AdminCageShelfPage(){return<CageColorProvider><Inner/></CageColorProvider>;}
type ShelfTab="bookmarks"|"filter";

function Inner(){
  const nav=useNavigate();
  const[tab,setTab]=useState<ShelfTab>("filter");
  const[aRid,setARid]=useState("");const[aRname,setARname]=useState("");
  const[details,setDetails]=useState<CageShelfDetail[]>([]);
  const[loading,setLoading]=useState(false);
  const[cell,setCell]=useState<CageShelfCell|null>(null);
  const[shelfId,setShelfId]=useState<string|null>(null);
  const[exp,setExp]=useState<Set<string>>(new Set());

  /* ---- 分配模式 ---- */
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
  // ── 编辑模式 ──
  const[editMode,setEditMode]=useState(false);
  const[scanCache,setScanCache]=useState<Map<string,{cell:CageShelfCell;code:string;initialActions:Set<CageBoxAction>;currentActions:Set<CageBoxAction>}>>(new Map());
  const[lastScannedKey,setLastScannedKey]=useState<string|null>(null);
  const[actionSubmitting,setActionSubmitting]=useState(false);
  // ── 绑定模式 ──
  const[bindMode,setBindMode]=useState(false);
  const[bindScannedCode,setBindScannedCode]=useState("");
  const[bindSelectedKey,setBindSelectedKey]=useState<string|null>(null);
  const[bindSubmitting,setBindSubmitting]=useState(false);
  const[bindConfirmOpen,setBindConfirmOpen]=useState(false);
  const[unbindActive,setUnbindActive]=useState(false);
  // 批量绑定缓存: cageKey → {cell, code}
  const[bindPairCache,setBindPairCache]=useState<Map<string,{cell:CageShelfCell;code:string}>>(new Map());
  const[editScanOpen,setEditScanOpen]=useState(false);
  const[bindScanOpen,setBindScanOpen]=useState(false);
  const[editDialogCell,setEditDialogCell]=useState<CageShelfCell|null>(null);
  const[detailReloadKey,setDetailReloadKey]=useState(0);
  const[editMissingCode,setEditMissingCode]=useState("");
  const[editSearching,setEditSearching]=useState(false);
  const[editInputVal,setEditInputVal]=useState("");
  const[bindInputVal,setBindInputVal]=useState("");
  const { casStatus, openCasDialog } = useCasBinding();

  // 从 lastScannedKey 解析十字交叉坐标（仅该笼架显示）
  const editCross=useMemo(()=>{
    if(!lastScannedKey)return{};
    const parts=lastScannedKey.split(":");
    if(parts.length===3)return{crossSid:parts[0],crossX:Number(parts[1]),crossY:Number(parts[2])};
    return{};
  },[lastScannedKey]);
  const [bindPromptOpen, setBindPromptOpen] = useState(false);

  const ensureCasBinding = (): boolean => {
    if (casStatus?.bound) return true;
    setBindPromptOpen(true);
    return false;
  };

  /* ---- 预约模式 ---- */
  const[bookingRooms,setBookingRooms]=useState<BookingRoom[]>([]);
  const[bookingRoom,setBookingRoom]=useState<BookingRoom|null>(null);
  const[bookingLoading,setBookingLoading]=useState(false);

  // 加载预约房间列表（全量，前端按 roomId 匹配）
  const loadBookingRooms=useCallback(async()=>{
    setBookingLoading(true);
    try{const r=await fetchBookingRooms(1,200);const list=r?.data?.list??[];setBookingRooms(list);}
    catch{setBookingRooms([]);}
    finally{setBookingLoading(false);}
  },[]);

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

  /* ---- AUP 搜索（独立组件 AupSearchBar） ---- */
  const{data:aupList=[]}=useQuery({queryKey:["allocationAups"],queryFn:fetchAllocationAups,staleTime:30*60*1000,enabled:pageMode==="allocate"});

  // Static tree — fetched once, never refetched
  const{data:fullTree=[]}=useQuery({
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

    if(pageMode==="allocate"||editMode||bindMode){
      // 分配/编辑/绑定模式：走实时数据源
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
  },[aRid,roomShelveMap,selectedBatchId,pageMode,editMode,bindMode,detailReloadKey]);

  const{data:scan}=useQuery({queryKey:["cageScanProgress"],queryFn:fetchCageScanProgress,refetchInterval:(q)=>q.state.data?.status==="running"?5000:30000});
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

  useEffect(()=>{if(!cell||!shelfId||cell.empty)return;let cancelled=false;void(async()=>{try{const fresh=await refreshCellDetail(shelfId,cell.x,cell.y);if(!cancelled)setCell(fresh);}catch{}})();return()=>{cancelled=true;};},[cell?.position,shelfId]);
  const onOpenRoom=(roomId:string,roomName:string)=>{
    setARid(roomId);setARname(roomName);setShelfDetail(null);
  };
  const onOpenShelf=async(shelveId:string,overrideRoomId?:string)=>{
    const roomId=overrideRoomId||aRid;
    setShelfLoading(true);setShelfDetail(null);
    if(pageMode==="allocate"||pageMode==="booking"||editMode||bindMode){
      try{const r=await fetchRealtimeRefresh(roomId||"",shelveId);setShelfDetail(r.shelves[0]??null);setRealtimeMeta({fromRealtime:r.fromRealtime,cachedAt:r.cachedAt});}catch{setShelfDetail(null);}
    }else{
      try{const d=await fetchCageShelfDetail(shelveId, selectedBatchId||undefined);setShelfDetail(d);}catch{setShelfDetail(null);}
    }
    setShelfLoading(false);
  };

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
    if(boxSelectMode){
      const anchor=boxSelectAnchorRef.current;
      if(!anchor||anchor.shelveId!==shelveId){
        // 第一格 → 设为锚点并选中
        boxSelectAnchorRef.current={shelveId,x,y};
        setSelectedCells(prev=>{const next=new Set(prev);next.add(`${shelveId}:${x}:${y}`);return next;});
        anchorCellRef.current={shelveId,x,y};
        return;
      }
      // 第二格 → 矩形框选 + 退出框选模式
      const minX=Math.min(anchor.x,x),maxX=Math.max(anchor.x,x);
      const minY=Math.min(anchor.y,y),maxY=Math.max(anchor.y,y);
      setSelectedCells(prev=>{
        const next=new Set(prev);
        for(let cx=minX;cx<=maxX;cx++)for(let cy=minY;cy<=maxY;cy++)next.add(`${shelveId}:${cx}:${cy}`);
        return next;
      });
      boxSelectAnchorRef.current=null;
      setBoxSelectMode(false);
      anchorCellRef.current={shelveId,x,y};
      return;
    }
    // 非框选模式 → 走普通 toggle
    if(!shiftHintShownRef.current){shiftHintShownRef.current=true;toast('按住 Shift 键点击另一个笼位，可快速框选矩形区域',{icon:'💡',duration:4000});}
    toggleCell(shelveId,x,y,shiftKey);
  },[boxSelectMode,toggleCell]);

  /* ---- 分配模式：取消分配 ---- */
  const handleCancelAssign=async()=>{
    if(!ensureCasBinding())return;
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
    try{await cancelCageAssignment(cageIds,aRid||undefined);toast.success(`已取消 ${cageIds.length} 个笼位分配`);setSelectedCells(new Set());
      if(aRid){const r=await fetchRealtimeRefresh(aRid);setDetails(r.shelves??[]);setRealtimeMeta({fromRealtime:r.fromRealtime,cachedAt:r.cachedAt});}
    }catch(e:any){toast.error(e instanceof Error?e.message:"取消分配失败");}
    finally{setAllocSubmitting(false);}
  };

  /* ---- 分配模式：确认分配 ---- */
  const handleConfirmAssign=async()=>{
    if(!ensureCasBinding())return;
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
    try{await assignCages(aRid,assignShelveId,cageIds,selectedAupId);toast.success(`已分配 ${cageIds.length} 个笼位`);setAllocDialogOpen(false);setSelectedCells(new Set());anchorCellRef.current=null;setSelectedAupId("");
      const r=await fetchRealtimeRefresh(aRid);setDetails(r.shelves??[]);setRealtimeMeta({fromRealtime:r.fromRealtime,cachedAt:r.cachedAt});
    }catch(e:any){toast.error(e instanceof Error?e.message:"分配失败");}
    finally{setAllocSubmitting(false);}
  };

  // 从 details 或 shelfDetail 找到 cell 所属的 shelveId
  const findShelfIdForCell=(cell:CageShelfCell):string=>{
    for(const d of details){const sid=String(d.shelfMeta?.shelveId??"");for(const c of d.grid){if(c.x===cell.x&&c.y===cell.y)return sid;}}
    if(shelfDetail){const sid=String(shelfDetail.shelfMeta?.shelveId??"");for(const c of shelfDetail.grid){if(c.x===cell.x&&c.y===cell.y)return sid;}}
    return"";
  };
  // 两个 Set 是否完全一致
  const setsEqual=<T,>(a:Set<T>,b:Set<T>)=>a.size===b.size&&[...a].every(x=>b.has(x));
  // 全局搜索笼盒：遍历所有房间 → 找到后跳转
  const handleGlobalFind=async(code:string)=>{
    if(!code||editSearching)return;
    const findInGrid=(grid:CageShelfCell[],sid:string,rid:string):boolean=>{
      for(const cell of grid){if(cell.empty)continue;
        const cbi=cell.cageBoxInfo as Record<string,any>|undefined;
        let cc=(cell as any).cageBoxCode??cbi?.cageBoxCode;
        if(!cc){const cvo=cbi?.cageBoxVo??cbi?.["cageBoxVo"]??{};cc=cvo.cageBoxCode??cvo["cageBoxCode"]??"";}
        if(String(cc)===code){
          setEditMissingCode("");
          toast.success(`已在房间 ${rid} 笼架 ${sid} 找到`);
          if(rid!==aRid){setARid(rid);setARname(rid);expandToRoom(rid);}
          const cbi2=cell.cageBoxInfo as Record<string,any>|undefined;
          const cvo2=cbi2?.cageBoxVo??cbi2?.["cageBoxVo"]??{};
          const pre=new Set<CageBoxAction>();
          if(cbi2?.NeedDivideYn===1||cvo2.needDivideYn===1)pre.add("DIVIDE");
          if(cbi2?.NeedFeedingYn===1||cvo2.needFeedingYn===1)pre.add("SPECIAL_BREEDING");
          if(cbi2?.AbnormalHealthYn===1||cvo2.abnormalHealthYn===1)pre.add("HEALTH_CHECK");
          const key=`${sid}:${cell.x}:${cell.y}`;
          setScanCache(prev=>{const next=new Map(prev);if(!next.has(key))next.set(key,{cell,code,initialActions:new Set(pre),currentActions:new Set(pre)});return next;});
          setLastScannedKey(key);
          setTimeout(()=>{document.getElementById(`shelf-${sid}`)?.scrollIntoView({behavior:"smooth",block:"center"});},300);
          return true;
        }
      }
      return false;
    };
    setEditSearching(true);
    try{
      // ① 本笼架（当前已加载的 details）
      for(const d of details){const sid=String(d.shelfMeta?.shelveId??"");if(findInGrid(d.grid,sid,aRid)){setEditSearching(false);return;}}
      // ② 本房间其他未加载的笼架
      const currentShelves=roomShelveMap.get(aRid)||[];
      for(const s of currentShelves){
        const alreadyLoaded=details.some(d=>String(d.shelfMeta?.shelveId)===s.shelveId);
        if(alreadyLoaded)continue;
        try{const d=await fetchCageShelfDetail(s.shelveId);if(d?.grid&&findInGrid(d.grid,s.shelveId,aRid)){try{const r=await fetchRealtimeRefresh(aRid);if(r.shelves)setDetails(r.shelves);}catch{}setEditSearching(false);return;}}catch{}
      }
      // ③ 其他房间
      for(const[rid,shelves]of roomShelveMap){if(rid===aRid)continue;
        for(const s of shelves){
          try{const d=await fetchCageShelfDetail(s.shelveId);if(d?.grid&&findInGrid(d.grid,s.shelveId,rid)){try{const r=await fetchRealtimeRefresh(rid);if(r.shelves){setDetails(r.shelves);setRealtimeMeta({fromRealtime:r.fromRealtime,cachedAt:r.cachedAt});}}catch{}setEditSearching(false);return;}}catch{}
        }
      }
      toast.error("全局未找到笼盒 "+code);
    }catch{toast.error("搜索出错");}
    setEditSearching(false);
  };

  // ── 统一 cell 点击：编辑/绑定/查看 ──
  const handleGridCellClick=useCallback((cell:CageShelfCell)=>{
    if(cell.empty)return;
    // 编辑模式：全房间→弹窗 / 单笼架→右侧面板（仅 state=3 可操作）
    if(editMode){
      if(cell.empty)return;
      const ct=(cell as any).animalCageType;
      if(ct!==3&&ct!==4){toast.error("当前状态不可编辑");return;}
      if(viewMode==="room"){setEditDialogCell(cell);return;}
      setCell(cell);setShelfId(""); // 单笼架走右侧面板
      return;
    }
    // 绑定模式
    if(bindMode){
      const ct=(cell as any).animalCageType;
      const code=bindScannedCode||bindInputVal.trim();
      // 绑定：加入批量缓存队列（不立即提交）
      if(!unbindActive&&ct===2&&code){
        const sid=findShelfIdForCell(cell);
        const ck=`${sid}:${cell.x}:${cell.y}`;
        if(bindPairCache.has(ck)){toast.error("该笼位已在缓存中");return;}
        setBindPairCache(prev=>{const next=new Map(prev);next.set(ck,{cell,code});return next;});
        setBindScannedCode("");setBindInputVal("");
        setBindSelectedKey(ck);
        toast.success(`已缓存 (${bindPairCache.size+1} 个待提交)`);
        return;
      }
      // 解绑：弹窗确认
      if(unbindActive&&ct===3){setBindSelectedKey(`${cell.x}:${cell.y}`);setCell(cell);setBindConfirmOpen(true);return;}
      if(!unbindActive&&ct===2&&!code){toast.error("请先输入笼盒编号");return;}
      if(!unbindActive&&ct!==2){toast.error("只能选择「已预约(空笼盒)」的笼位");return;}
      if(unbindActive&&ct!==3){toast.error("只能选择「已预约(饲养中)」的笼位解绑");return;}
      return;
    }
    // 查看模式
    setCell(cell);setShelfId("");
  },[editMode,lastScannedKey,bindMode,unbindActive,bindScannedCode,bindInputVal,viewMode,aRid,bindPairCache]);

  // ── 编辑模式：扫码 → 匹配 grid → 加入缓存 ──
  const handleEditScan=useCallback((text:string)=>{
    if(!details||!details.length)return;
    const code=text.trim();if(!code)return;
    let matched:CageShelfCell|null=null;let matchedSid="";
    for(const d of details){const sid=String(d.shelfMeta?.shelveId??"");for(const cell of d.grid){
      if(cell.empty)continue;
      const cbi=cell.cageBoxInfo as Record<string,any>|undefined;
      let cc=(cell as any).cageBoxCode??cbi?.cageBoxCode;
      if(!cc){const cvo=cbi?.cageBoxVo??cbi?.["cageBoxVo"]??{};cc=cvo.cageBoxCode??cvo["cageBoxCode"]??"";}
      if(String(cc)===code){matched=cell;matchedSid=sid;break;}
    }if(matched)break;}
    if(!matched){toast.error("当前房间未找到笼盒 "+code);setEditMissingCode(code);return;}
    setEditMissingCode("");
    const match=matched!;
    const cbi=match.cageBoxInfo as Record<string,any>|undefined;
    const cvo=cbi?.cageBoxVo??cbi?.["cageBoxVo"]??{};
    const pre=new Set<CageBoxAction>();
    if(cbi?.NeedDivideYn===1||cvo.needDivideYn===1)pre.add("DIVIDE");
    if(cbi?.NeedFeedingYn===1||cvo.needFeedingYn===1||(typeof cbi?.specialBreedingName==="string"&&cbi.specialBreedingName.trim()))pre.add("SPECIAL_BREEDING");
    if(cbi?.AbnormalHealthYn===1||cvo.abnormalHealthYn===1||cbi?.animalHealthEntity!=null)pre.add("HEALTH_CHECK");
    const key=`${matchedSid}:${match.x}:${match.y}`;
    setScanCache(prev=>{const next=new Map(prev);
      if(!next.has(key))next.set(key,{cell:match,code,initialActions:new Set(pre),currentActions:new Set(pre)});
      return next;});
    setLastScannedKey(key);toast.success("已匹配 "+match.position);
  },[details]);

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
      const color=ACTION_CANCEL_COLOR[action];
      try{await cancelCageBoxColor(aRid,sid,entry.code,color);ok++;}
      catch(e:any){toast.error(`${entry.cell.position} 取消${action}: ${e?.message||"失败"}`);fail++;}
    }
    if(fail===0){toast.success(`已完成 ${ok} 个操作`);setScanCache(new Map());setLastScannedKey(null);setEditMissingCode("");}
    else toast(`${ok} 成功 / ${fail} 失败`,{icon:"⚠️"});
    setActionSubmitting(false);
  },[aRid,scanCache,details]);

  // ── 批量绑定提交（并行调用 ARO API）──
  const handleBatchBindSubmit=useCallback(async()=>{
    if(bindPairCache.size===0||!aRid)return;
    setBindSubmitting(true);
    const entries=Array.from(bindPairCache.entries());
    let ok=0,fail=0;
    await Promise.all(entries.map(async([key,{cell,code}])=>{
      try{
        const cageId=String((cell as any).id??"");
        await bindCageBox(cageId,code,aRid);
        ok++;
      }catch(e:any){fail++;toast.error(`${cell.position}: ${e?.message||"失败"}`);}
    }));
    setBindPairCache(new Map());
    setBindSubmitting(false);
    if(fail===0)toast.success(`${ok} 个绑定全部成功！`,{duration:4000});
    else toast(`${ok} 成功 / ${fail} 失败`,{icon:"⚠️"});
  },[bindPairCache,aRid]);

  // ── 单个绑定（保留兼容，Dialog 调用）──
  const handleBindConfirm=useCallback(async(cell:CageShelfCell)=>{
    const code=bindScannedCode||bindInputVal.trim();
    if(!code||!aRid)return;
    setBindSubmitting(true);
    try{
      const cageId=String((cell as any).id??"");
      await bindCageBox(cageId,code,aRid);
      toast.success("绑定成功！",{duration:4000});
      setBindConfirmOpen(false);setCell(null);
      setBindScannedCode("");setBindSelectedKey(null);
    }catch(e:any){toast.error(e?.message||"绑定失败");}
    finally{setBindSubmitting(false);}
  },[bindScannedCode,bindInputVal,aRid]);

  // ── 绑定模式：确认解绑 ──
  const handleUnbindConfirm=useCallback(async(cell:CageShelfCell)=>{
    if(!aRid)return;
    setBindSubmitting(true);
    try{
      const cageId=String((cell as any).id??"");
      console.log("[unbind] animalCageId:", cageId, "roomId:", aRid);
      await unbindCageBox(cageId, aRid);
      toast.success("解绑成功！笼位已恢复空笼盒",{duration:4000});
      setBindConfirmOpen(false);setCell(null);
      setBindSelectedKey(null);setUnbindActive(false);
    }catch(e:any){toast.error(e?.message||"解绑失败");}
    finally{setBindSubmitting(false);}
  },[aRid]);

  return<AdminPageShell>
    <style>{`
      .cage-scroll::-webkit-scrollbar{width:4px;height:4px}
      .cage-scroll::-webkit-scrollbar-track{background:transparent}
      .cage-scroll::-webkit-scrollbar-thumb{background:var(--twin-hairline);border-radius:4px}
      .cage-scroll::-webkit-scrollbar-thumb:hover{background:var(--twin-mute)}
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
        {scan&&scan.status!=="idle"&&<CageScanProgressBanner progress={scan}/>}
        {/* Top toolbar: tabs + view mode + actions */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <button type="button" onClick={()=>setCollapsed(v=>!v)} className="shrink-0 rounded p-1 text-[var(--twin-mute)] hover:text-[var(--twin-ink)] hover:bg-[var(--twin-canvas)]" title={collapsed?"展开侧栏":"收起侧栏"}>{collapsed?<PanelLeft className="h-4 w-4"/>:<PanelLeftClose className="h-4 w-4"/>}</button>
            <div className="flex items-center gap-1 rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-1">
              <button type="button" onClick={()=>setTab("bookmarks")} className={`flex items-center gap-1 rounded-twin-md px-2.5 py-1 text-[11px] font-semibold transition ${tab==="bookmarks"?"bg-[var(--twin-link-deep)] text-white shadow-sm":"text-[var(--twin-mute)] hover:text-[var(--twin-ink)]"}`}><Star className="h-3 w-3"/>收藏</button>
              <button type="button" onClick={()=>setTab("filter")} className={`flex items-center gap-1 rounded-twin-md px-2.5 py-1 text-[11px] font-semibold transition ${tab==="filter"?"bg-[var(--twin-link-deep)] text-white shadow-sm":"text-[var(--twin-mute)] hover:text-[var(--twin-ink)]"}`}><LayoutGrid className="h-3 w-3"/>筛选</button>
            </div>
            {tab==="filter"&&pageMode!=="booking"&&<div className="flex items-center gap-1 rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-1">
              <button type="button" onClick={()=>setViewMode("room")} className={`rounded-twin-md px-2.5 py-1 text-[11px] font-semibold transition ${viewMode==="room"?"bg-[var(--twin-link-deep)] text-white shadow-sm":"text-[var(--twin-mute)] hover:text-[var(--twin-ink)]"}`}>全房间</button>
              <button type="button" onClick={()=>setViewMode("shelf")} className={`rounded-twin-md px-2.5 py-1 text-[11px] font-semibold transition ${viewMode==="shelf"?"bg-[var(--twin-link-deep)] text-white shadow-sm":"text-[var(--twin-mute)] hover:text-[var(--twin-ink)]"}`}>单笼架</button>
            </div>}
            {/* ---- 笼位分配 / 笼位预约 ---- */}
            <div className="flex items-center gap-1 rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-1">
              <button type="button" onClick={()=>{
                  if(bindMode&&bindPairCache.size>0){if(!window.confirm(`有 ${bindPairCache.size} 个未提交的绑定，是否放弃？`))return;setBindPairCache(new Map());}
                  const n=pageMode!=="allocate";setPageMode(n?"allocate":"view");setSelectedCells(new Set());anchorCellRef.current=null;boxSelectAnchorRef.current=null;setBoxSelectMode(false);shiftHintShownRef.current=false;setCell(null);setShelfId(null);if(n){setEditMode(false);setBindMode(false);setScanCache(new Map());setLastScannedKey(null);setBindScannedCode("");setBindSelectedKey(null);setUnbindActive(false);}
                }}
                className={`rounded-twin-md px-2.5 py-1 text-[11px] font-semibold transition ${pageMode==="allocate"?"bg-blue-600 text-white shadow-sm":"text-[var(--twin-mute)] hover:text-[var(--twin-ink)]"}`}>
                笼位分配{pageMode==="allocate"?" ▾":""}
              </button>
              <button type="button" onClick={()=>{
                  if(bindMode&&bindPairCache.size>0){if(!window.confirm(`有 ${bindPairCache.size} 个未提交的绑定，是否放弃？`))return;setBindPairCache(new Map());}
                  const n=pageMode!=="booking";setPageMode(n?"booking":"view");setSelectedCells(new Set());anchorCellRef.current=null;boxSelectAnchorRef.current=null;setBoxSelectMode(false);shiftHintShownRef.current=false;setCell(null);setShelfId(null);if(n){setEditMode(false);setBindMode(false);setScanCache(new Map());setLastScannedKey(null);setBindScannedCode("");setBindSelectedKey(null);setUnbindActive(false);}
                }}
                className={`rounded-twin-md px-2.5 py-1 text-[11px] font-semibold transition ${pageMode==="booking"?"bg-emerald-600 text-white shadow-sm":"text-[var(--twin-mute)] hover:text-[var(--twin-ink)]"}`}>
                笼位预约{pageMode==="booking"?" ▾":""}
              </button>
              {/* ── 编辑模式（绑定时隐藏）── */}
              {!bindMode&&<button type="button" onClick={()=>{
                  if(bindMode&&bindPairCache.size>0){
                    if(!window.confirm(`有 ${bindPairCache.size} 个未提交的绑定，是否放弃？`))return;
                    setBindPairCache(new Map());
                  }
                  const n=!editMode;setEditMode(n);setPageMode("view");if(!n){setScanCache(new Map());setLastScannedKey(null);}if(n){setBindMode(false);setBindScannedCode("");setBindSelectedKey(null);setUnbindActive(false);setSelectedCells(new Set());anchorCellRef.current=null;boxSelectAnchorRef.current=null;setBoxSelectMode(false);shiftHintShownRef.current=false;setCell(null);setShelfId(null);}
                }}
                className={`rounded-twin-md px-2.5 py-1 text-[11px] font-semibold transition ${editMode?"bg-[var(--twin-primary)] text-white shadow-sm":"text-[var(--twin-mute)] hover:text-[var(--twin-ink)]"}`}>
                编辑{editMode?" ▾":""}
              </button>}
              {/* ── 绑定模式（编辑时隐藏）── */}
              {!editMode&&<button type="button" onClick={()=>{
                  if(bindMode&&bindPairCache.size>0){
                    if(!window.confirm(`有 ${bindPairCache.size} 个未提交的绑定，是否放弃？\n\n「确定」放弃并退出\n「取消」继续绑定`))return;
                    setBindPairCache(new Map());
                  }
                  const n=!bindMode;setBindMode(n);setPageMode("view");setBindScannedCode("");setBindSelectedKey(null);setUnbindActive(false);if(!n){setScanCache(new Map());}if(n){setEditMode(false);setScanCache(new Map());setLastScannedKey(null);setSelectedCells(new Set());anchorCellRef.current=null;boxSelectAnchorRef.current=null;setBoxSelectMode(false);shiftHintShownRef.current=false;setCell(null);setShelfId(null);}
                }}
                className={`rounded-twin-md px-2.5 py-1 text-[11px] font-semibold transition ${bindMode?"bg-blue-600 text-white shadow-sm":"text-[var(--twin-mute)] hover:text-[var(--twin-ink)]"}`}>
                绑定{bindMode?" ▾":""}
              </button>}
              {pageMode==="allocate"&&realtimeMeta&&(<>
                <span className="text-[10px] text-[var(--twin-mute)] ml-0.5">{realtimeMeta.fromRealtime?"✅ 实时":"📦 缓存"}{realtimeMeta.cachedAt?" · "+realtimeMeta.cachedAt.substring(11,19):""}</span>
                <button onClick={async()=>{if(!aRid)return;try{const r=await forceRealtimeRefresh(aRid);setDetails(r.shelves??[]);setRealtimeMeta({fromRealtime:r.fromRealtime,cachedAt:r.cachedAt});toast.success("已刷新");}catch(e:any){toast.error("刷新失败");}}}
                  className="rounded-twin-md px-1.5 py-0.5 text-[10px] font-bold bg-blue-500 text-white hover:bg-blue-600 ml-1" title="强制刷新房间数据">↻</button>
              </>)}
              {pageMode==="booking"&&realtimeMeta&&(
                <span className="text-[10px] text-[var(--twin-mute)] ml-0.5">🖥️ {realtimeMeta.fromRealtime?"实时":"缓存"}{realtimeMeta.cachedAt?" · "+realtimeMeta.cachedAt.substring(11,19):""}</span>
              )}
              {editMode&&realtimeMeta&&(<>
                <span className="text-[10px] text-[var(--twin-mute)] ml-0.5">🔧 {realtimeMeta.fromRealtime?"实时":"缓存"}{realtimeMeta.cachedAt?" · "+realtimeMeta.cachedAt.substring(11,19):""}</span>
                <button onClick={async()=>{if(!aRid)return;try{const r=await forceRealtimeRefresh(aRid);setDetails(r.shelves??[]);setRealtimeMeta({fromRealtime:r.fromRealtime,cachedAt:r.cachedAt});toast.success("已刷新");}catch(e:any){toast.error("刷新失败");}}}
                  className="rounded-twin-md px-1.5 py-0.5 text-[10px] font-bold bg-blue-500 text-white hover:bg-blue-600 ml-1" title="强制刷新房间数据">↻</button>
              </>)}
              {bindMode&&realtimeMeta&&(<>
                <span className="text-[10px] text-blue-600 ml-0.5">📷 {realtimeMeta.fromRealtime?"实时":"缓存"}{realtimeMeta.cachedAt?" · "+realtimeMeta.cachedAt.substring(11,19):""}</span>
                <button onClick={async()=>{if(!aRid)return;try{const r=await forceRealtimeRefresh(aRid);setDetails(r.shelves??[]);setRealtimeMeta({fromRealtime:r.fromRealtime,cachedAt:r.cachedAt});toast.success("已刷新");}catch(e:any){toast.error("刷新失败");}}}
                  className="rounded-twin-md px-1.5 py-0.5 text-[10px] font-bold bg-blue-500 text-white hover:bg-blue-600 ml-1" title="强制刷新房间数据">↻</button>
              </>)}
              {pageMode==="booking"&&<AupSearchBar onSelectRoom={(rid,rname)=>{onOpenRoom(rid,rname);expandToRoom(rid);}}/>}
              {pageMode==="allocate"&&<button type="button" onClick={()=>{setBoxSelectMode(v=>!v);boxSelectAnchorRef.current=null;}}
                className={`rounded-twin-md px-2 py-1 text-[11px] font-semibold transition ${boxSelectMode?"bg-amber-500 text-white shadow-sm":"text-[var(--twin-mute)] hover:text-[var(--twin-ink)] border border-dashed border-[var(--twin-hairline)]"}`}>
                {boxSelectMode?"框选中 · 点击两格":"⬜ 矩形框选"}
              </button>}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {/* ---- 查看模式控件（分配/预约/编辑/绑定时隐藏） ---- */}
            {pageMode==="view"&&!editMode&&!bindMode&&<>
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
            {pageMode==="allocate"&&!boxSelectMode&&<span className="text-[10px] text-[var(--twin-mute)] ml-1 select-none">🖱️ 点击选中 · <kbd className="text-[9px] px-0.5 py-px rounded border border-[var(--twin-hairline)] bg-[var(--twin-canvas)]">Shift</kbd>+点击 矩形多选</span>}
            {boxSelectMode&&<span className="text-[10px] text-amber-600 font-medium ml-1 select-none animate-pulse">⬜ 请点击第一个笼位设置框选起点</span>}

            {/* ── 编辑模式操作按钮 ── */}
            {editMode&&<>
              <span className="text-[10px] text-[var(--twin-mute)] ml-1 select-none">笼盒编号</span>
              <input type="text" placeholder="输入或扫码…" value={editInputVal} onChange={e=>setEditInputVal(e.target.value)}
                className="w-40 rounded-twin-md border border-[var(--twin-hairline)] px-3 py-1.5 text-xs"
                onKeyDown={(e)=>{if(e.key==="Enter"){const v=(e.target as HTMLInputElement).value.trim();if(v){handleEditScan(v);setEditInputVal(v);}}}}/>
              <button onClick={()=>{const code=editMissingCode||editInputVal.trim();if(!code){toast.error("请先输入或扫码获取笼盒编号");return;}handleGlobalFind(code);}} disabled={editSearching}
                className="rounded-twin-md px-2.5 py-1.5 text-xs font-semibold bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 transition">
                {editSearching?"搜索中…":"🔍 找到他"}
              </button>
              <button onClick={()=>{if(!aRid){toast.error("请先在左侧选择房间");return;}setEditScanOpen(true);}} className="flex items-center justify-center rounded-md w-9 h-9 -my-0.5" style={{background:"rgba(172,23,54,0.1)"}} title="扫码（编辑模式）">
                <QrCode className="size-5" style={{color:"var(--twin-primary)"}}/>
              </button>
              {scanCache.size>0&&(()=>{const addCount=Array.from(scanCache.values()).reduce((n,e)=>{for(const a of e.currentActions)if(!e.initialActions.has(a))n++;return n;},0);const delCount=Array.from(scanCache.values()).reduce((n,e)=>{for(const a of e.initialActions)if(!e.currentActions.has(a))n++;return n;},0);const total=addCount+delCount;return<button onClick={handleEditSubmit} disabled={actionSubmitting||total===0}
                className="rounded-twin-md px-2.5 py-1 text-[11px] font-semibold bg-[var(--twin-primary)] text-white disabled:opacity-40">
                提交{total>0?` +${addCount} −${delCount}`:` (${scanCache.size})`}
              </button>;})()}
              <button type="button" onClick={()=>{setScanCache(new Map());setLastScannedKey(null);setEditMissingCode("");setEditInputVal("");}}
                className="rounded-twin-md px-3 py-1.5 text-[11px] font-semibold text-slate-500 bg-slate-100 border border-slate-200 hover:bg-slate-200 hover:text-slate-700 transition">清除</button>
            </>}
            {/* ── 绑定模式操作按钮 ── */}
            {bindMode&&<>
              <span className="text-[10px] text-blue-600 ml-1 select-none">笼盒编号</span>
              <input type="text" placeholder="输入或扫码…" value={bindInputVal} onChange={e=>setBindInputVal(e.target.value)}
                className="w-40 rounded-twin-md border border-blue-300 px-3 py-1.5 text-xs"
                onKeyDown={(e)=>{if(e.key==="Enter"){const v=(e.target as HTMLInputElement).value.trim();if(v){setBindScannedCode(v);setBindInputVal(v);setBindSelectedKey(null);toast.success("已录入: "+v);}}}}/>
              <button onClick={()=>{if(!aRid){toast.error("请先在左侧选择房间");return;}setBindScanOpen(true);}} className="flex items-center justify-center rounded-md w-9 h-9 -my-0.5" style={{background:"rgba(37,99,235,0.1)"}} title="扫码（绑定模式）">
                <QrCode className="size-5" style={{color:"#2563eb"}}/>
              </button>
              <button onClick={()=>{
                  if(unbindActive){setUnbindActive(false);setBindSelectedKey(null);return;}
                  if(bindScannedCode||bindInputVal.trim()){setBindScannedCode("");setBindInputVal("");setBindSelectedKey(null);return;}
                  setUnbindActive(true);setBindSelectedKey(null);
                }}
                className={`rounded-twin-md px-2.5 py-1 text-[11px] font-semibold transition ${unbindActive?"bg-red-600 text-white":(bindScannedCode||bindInputVal.trim())?"text-red-500 border border-red-300 hover:bg-red-50":"text-red-600 border border-red-300 hover:bg-red-50"}`}>
                {(unbindActive||bindScannedCode||bindInputVal.trim())?"取消":"解绑"}
              </button>
              {/* 批量提交 + 清空缓存 */}
              {!unbindActive&&bindPairCache.size>0&&<>
                <button onClick={handleBatchBindSubmit} disabled={bindSubmitting}
                  className="rounded-twin-md px-2.5 py-1 text-[11px] font-semibold bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition">
                  {bindSubmitting?<Loader2 className="h-3 w-3 inline animate-spin"/>:null}
                  提交 ({bindPairCache.size})
                </button>
                <button onClick={()=>{setBindPairCache(new Map());toast("已清空缓存");}}
                  className="rounded-twin-md px-2 py-1 text-[10px] text-slate-500 hover:text-red-500 transition">清空</button>
              </>}
            </>}
            <button type="button" onClick={()=>setLegend(v=>!v)} className={`flex items-center gap-1 rounded-twin-md px-2 py-1 text-[10px] transition ${legend?'bg-[var(--twin-link-deep)] text-white':'text-[var(--twin-mute)] hover:text-[var(--twin-ink)]'}`}><Info className="h-3 w-3"/>图例{legend?' ▲':' ▼'}</button>
          </div>
        </div>
        {legend&&<CageShelfLegend/>}
        {/* ── 批量绑定缓存面板 ── */}
        {bindMode&&!unbindActive&&bindPairCache.size>0&&<div className="shrink-0 rounded-twin-lg border border-green-300 bg-green-50/50 p-2">
          <div className="flex flex-wrap gap-2">{Array.from(bindPairCache.entries()).map(([key,{cell,code}])=>{
            return <div key={key} className="rounded-twin-md border border-green-300 bg-white px-3 py-1.5 text-[11px] flex items-center gap-2">
              <span className="font-mono font-bold text-green-700 text-xs">{code}</span>
              <span className="text-[var(--twin-mute)]">→</span>
              <span className="font-semibold text-[var(--twin-ink)]">{displayPosition(cell.position)}</span>
              <button onClick={()=>{
                setBindPairCache(prev=>{const next=new Map(prev);next.delete(key);return next;});
              }} className="ml-1 text-[var(--twin-mute)] hover:text-red-500 text-xs">✕</button>
            </div>;
          })}</div>
        </div>}
        {/* ── 编辑模式：动作缓存面板 ── */}
        {editMode&&scanCache.size>0&&<div className="shrink-0 rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-2">
          <div className="flex flex-wrap gap-2">{Array.from(scanCache.entries()).map(([key,entry])=>{
            const pos=entry.cell.position;const code=entry.code;
            const changed=(a:CageBoxAction)=>entry.initialActions.has(a)!==entry.currentActions.has(a);
            const ACTIONS:CageBoxAction[]=["DIVIDE","SPECIAL_BREEDING","HEALTH_CHECK"];
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
              <div className="flex gap-1.5">{ACTIONS.map(a=>{const has=entry.currentActions.has(a);const init=entry.initialActions.has(a);const ch=has!==init;
                return <button key={a} onClick={(e)=>{e.stopPropagation();setScanCache(prev=>{const next=new Map(prev);const e2=next.get(key);if(!e2)return prev;const cur=new Set(e2.currentActions);cur.has(a)?cur.delete(a):cur.add(a);if(setsEqual(cur,e2.initialActions))next.delete(key);else next.set(key,{...e2,currentActions:cur});return next;});}}
                  className={`rounded-twin-sm px-2 py-0.5 text-[10px] font-semibold transition ${has?ch?"bg-amber-100 text-amber-800 border border-amber-400":"bg-green-50 text-green-700 border border-green-300":"bg-gray-50 text-gray-400 border border-gray-200"}`}>
                  {a==="DIVIDE"?"分笼":a==="SPECIAL_BREEDING"?"特殊饲养":"健康检查"}{ch?(has?" +":" −"):""}
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
            {!aRid&&<div className="rounded-twin-xl border border-dashed border-[var(--twin-hairline)] bg-[var(--twin-canvas)] h-full flex flex-col items-center justify-center text-center text-sm text-[var(--twin-mute)]"><LayoutGrid className="h-10 w-10 mx-auto mb-3 opacity-20"/>展开左侧目录，点击房间查看笼位预约<br/><span className="text-[11px]">选中房间后可查看和编辑 AUP 课题组分配，点击笼架预览笼位</span></div>}
            {aRid&&bookingLoading&&<div className="rounded-twin-xl border border-dashed border-[var(--twin-hairline)] bg-[var(--twin-canvas)] h-full flex items-center justify-center text-sm text-[var(--twin-mute)]"><Loader2 className="h-4 w-4 animate-spin mr-2"/>加载预约数据…</div>}
            {aRid&&!bookingLoading&&<div className="flex gap-3 min-h-0 h-full">
              {/* Left: booking data */}
              <div className="w-1/2 flex flex-col min-w-0">
                <CageBookingPanel room={bookingRoom} roomId={aRid} ensureCasBinding={ensureCasBinding}/>
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
                    bindSelectedKey={bindSelectedKey} editMode={editMode} bindMode={bindMode}
                    crossX={editCross.crossX} crossY={editCross.crossY} crossSid={editCross.crossSid}
                    bindPairCache={bindPairCache}
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
              return<div key={sid||idx} id={`shelf-${sid}`}><ShelfGrid title={d.shelfMeta?.shelveName??`笼架 ${idx+1}`} detail={d} loading={false} emptyHint="暂无笼架数据" isBookmarked={isBm} onToggleBookmark={sid!==""?()=>toggleBm(sid):undefined} onCellClick={pageMode==="allocate"?(c:any)=>{if(!c.empty)setCell(c);}:handleGridCellClick} alertMap={alertMap} selectable={pageMode==="allocate"} selectedCells={pageMode==="allocate"?selectedCells:undefined} onToggleCell={pageMode==="allocate"?handleAllocateToggle:undefined} allocMode={pageMode==="allocate"} clickMode="checkbox" scanCache={scanCache} lastScannedKey={lastScannedKey} bindSelectedKey={bindSelectedKey} editMode={editMode} bindMode={bindMode} crossX={editCross.crossX} crossY={editCross.crossY} crossSid={editCross.crossSid} bindPairCache={bindPairCache}/></div>;
            })}</div>}
          </>}

          {/* SHELF MODE: left grid + right detail (like student page) */}
          {pageMode!=="booking"&&viewMode==="shelf"&&<div className="flex gap-3 min-h-0" style={{height:"calc(100vh - 190px)"}}>
            {/* Left: 8×10 grid */}
            <div className="w-1/2 flex flex-col min-w-0">
              {shelfLoading&&<div className="flex-1 rounded-twin-xl border border-dashed border-[var(--twin-hairline)] bg-[var(--twin-canvas)] grid place-items-center text-sm text-[var(--twin-mute)]">加载笼架…</div>}
              {!shelfLoading&&!shelfDetail&&<div className="flex-1 rounded-twin-xl border border-dashed border-[var(--twin-hairline)] bg-[var(--twin-canvas)] flex flex-col items-center justify-center text-sm text-[var(--twin-mute)]"><LayoutGrid className="h-10 w-10 mb-3 opacity-20"/>点击左侧笼架<br/><span className="text-[11px]">选中后显示该笼架 8×10 笼位</span></div>}
              {!shelfLoading&&shelfDetail&&<ShelfGrid title={shelfDetail.shelfMeta?.shelveName||"笼架"} detail={shelfDetail} loading={false} emptyHint="暂无数据" onCellClick={pageMode==="allocate"?(c:any)=>{if(!c.empty)setCell(c);}:handleGridCellClick} alertMap={alertMap} selectable={pageMode==="allocate"} selectedCells={pageMode==="allocate"?selectedCells:undefined} onToggleCell={pageMode==="allocate"?handleAllocateToggle:undefined} allocMode={pageMode==="allocate"} clickMode="checkbox" scanCache={scanCache} lastScannedKey={lastScannedKey} bindSelectedKey={bindSelectedKey} editMode={editMode} bindMode={bindMode} crossX={editCross.crossX} crossY={editCross.crossY} crossSid={editCross.crossSid}/>}
            </div>
            {/* Right: cell detail / edit actions / bind confirm */}
            <div className="w-1/2 flex flex-col min-w-0 gap-2">
              {/* 编辑模式：单笼架详情 + 状态选项 */}
              {editMode&&cell&&!cell.empty&&(()=>{const sid=shelfDetail?.shelfMeta?.shelveId??"";const ck=`${sid}:${cell.x}:${cell.y}`;const entry=scanCache.get(ck);const ACTIONS:CageBoxAction[]=["DIVIDE","SPECIAL_BREEDING","HEALTH_CHECK"];
                return<div className="flex-1 flex flex-col min-h-0 rounded-twin-xl border-2 overflow-hidden" style={{borderColor:"var(--twin-primary)"}}>
                  <div className="shrink-0 px-3 py-2 flex items-center justify-between" style={{background:"rgba(172,23,54,0.06)"}}><div className="text-sm font-semibold text-[var(--twin-ink)]">状态选择 · {cell.position}</div><button className="text-xs text-[var(--twin-mute)] hover:text-[var(--twin-ink)]" onClick={()=>{setCell(null);setShelfId(null);}}>清除</button></div>
                  <div className="flex-1 overflow-y-auto p-3 space-y-3">
                    <div className="flex flex-col gap-2">{ACTIONS.map(a=>{const label=a==="DIVIDE"?"请分笼":a==="SPECIAL_BREEDING"?"特殊饲养":"健康检查";const color=a==="DIVIDE"?"#d97706":a==="SPECIAL_BREEDING"?"#dc2626":"#7c3aed";const cbi2=cell.cageBoxInfo as Record<string,any>|undefined;const cvo2=cbi2?.cageBoxVo??cbi2?.["cageBoxVo"]??{};const srvHas=!entry&&(a==="DIVIDE"?cbi2?.NeedDivideYn===1||cvo2.needDivideYn===1:a==="SPECIAL_BREEDING"?cbi2?.NeedFeedingYn===1||cvo2.needFeedingYn===1||!!cbi2?.specialBreedingName:a==="HEALTH_CHECK"?cbi2?.AbnormalHealthYn===1||cvo2.abnormalHealthYn===1||!!cbi2?.animalHealthEntity:false);const has=entry?entry.currentActions.has(a):srvHas;const init=entry?entry.initialActions.has(a):srvHas;const changed=has!==init;
                      return<button key={a} onClick={()=>{const cbi=cell.cageBoxInfo as Record<string,any>|undefined;const cvo=cbi?.cageBoxVo??cbi?.["cageBoxVo"]??{};let code=(cell as any).cageBoxCode??cbi?.cageBoxCode;if(!code)code=cvo.cageBoxCode??cvo["cageBoxCode"]??"";
                        setScanCache(prev=>{const next=new Map(prev);
                          if(next.has(ck)){const e=next.get(ck)!;const cur=new Set(e.currentActions);cur.has(a)?cur.delete(a):cur.add(a);if(setsEqual(cur,e.initialActions))next.delete(ck);else next.set(ck,{...e,currentActions:cur});}
                          else{const initSet=new Set<CageBoxAction>();if(cbi?.NeedDivideYn===1||cvo.needDivideYn===1)initSet.add("DIVIDE");if(cbi?.NeedFeedingYn===1||cvo.needFeedingYn===1)initSet.add("SPECIAL_BREEDING");if(cbi?.AbnormalHealthYn===1||cvo.abnormalHealthYn===1)initSet.add("HEALTH_CHECK");const curSet=new Set(initSet);curSet.add(a);next.set(ck,{cell,code,initialActions:initSet,currentActions:curSet});}
                          return next;});setLastScannedKey(ck);}}
                        className="flex items-center justify-between rounded-twin-md border-2 px-3 py-2.5 text-sm font-semibold transition hover:brightness-95"
                        style={{borderColor:has?color:"var(--twin-hairline)",background:has?`${color}12`:"var(--twin-canvas)",color:has?color:"var(--twin-ink)"}}>
                        <span>{label}</span><span className="text-[11px]">{changed?"已变更":has?"已标记":"点击标记"}</span>
                      </button>;})}
                    </div>
                    <div className="pt-2 border-t border-[var(--twin-hairline)] text-[10px] text-[var(--twin-mute)]">笼位信息</div>
                    <div className="grid grid-cols-2 gap-2 text-xs">{["DepartmentName","ProjectPiName","AupNumber","StateName"].map(k=>{const source=cell.cageBoxInfo??cell.detail??{};const v=source[k];return<div key={k} className="rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1"><div className="text-[var(--twin-mute)]">{CAGE_BOX_INFO_LABEL[k]??k}</div><div className="text-[var(--twin-ink)]">{formatCageDetailValue(v,k)}</div></div>;})}</div>
                  </div>
                </div>;})()}
              {/* 查看模式：笼盒详情 */}
              {!editMode&&!bindMode&&(()=>{if(!cell)return<div className="flex-1 rounded-twin-xl border border-dashed border-[var(--twin-hairline)] bg-[var(--twin-canvas)] flex flex-col items-center justify-center text-sm text-[var(--twin-mute)]"><div className="text-4xl mb-3 opacity-20">📋</div>笼盒详情预备画面<br/><span className="text-[11px]">点击左侧笼位格子显示笼盒信息</span></div>;
                return<div className="flex-1 overflow-y-auto rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-3">
                <div className="mb-2 flex items-center justify-between"><div className="text-sm font-semibold text-[var(--twin-ink)]">笼盒详情 · 格位 {displayPosition(cell.position)}</div><button type="button" className="text-xs text-[var(--twin-mute)] hover:text-[var(--twin-ink)]" onClick={()=>setCell(null)}>清除</button></div>
                <div className="grid grid-cols-2 gap-2 text-xs">{CAGE_BOX_INFO_FIELD_ORDER.map(k=>{const source=cell.cageBoxInfo??cell.detail??{};const v=source[k];const display=formatCageDetailValue(v,k);const qr=k==="CageBoxQrCode"&&v!=null&&String(v).trim()!==""?String(v).trim():"";
                  return<div key={k} className={`rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1.5 ${k==="CageBoxQrCode"?"col-span-2":""}`}><div className="text-[var(--twin-mute)]">{CAGE_BOX_INFO_LABEL[k]??k}</div><div className="mt-0.5 flex flex-wrap items-start gap-3"><div className="min-w-0 flex-1 break-all text-[var(--twin-ink)]">{display}</div>{k==="CageBoxQrCode"&&qr!==""&&<div className="shrink-0 rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-1"><QRCodeSVG value={qr} size={80} level="M" includeMargin={false}/></div>}</div></div>;
                })}</div>
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

    {cell&&viewMode!=="shelf"&&!editMode&&!bindMode&&<Portal><div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={()=>{setCell(null);setShelfId(null);}}>
      <div className="w-full max-w-xl max-h-[85vh] overflow-y-auto rounded-twin-xl bg-[var(--twin-canvas)] p-4 shadow-twin-level-3" onClick={e=>e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between"><div className="text-sm font-semibold text-[var(--twin-ink)]">笼盒详情 · 格位 {displayPosition(cell.position)}</div><button type="button" className="text-xs text-[var(--twin-mute)] hover:text-[var(--twin-ink)]" onClick={()=>{setCell(null);setShelfId(null);}}>关闭</button></div>
        <div className="grid grid-cols-2 gap-2 text-xs">{CAGE_BOX_INFO_FIELD_ORDER.map(k=>{const source=cell.cageBoxInfo??cell.detail??{};const v=source[k];const display=formatCageDetailValue(v,k);const qr=k==="CageBoxQrCode"&&v!=null&&String(v).trim()!==""?String(v).trim():"";
          return<div key={k} className={`rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1.5 ${k==="CageBoxQrCode"?"col-span-2":""}`}><div className="text-[var(--twin-mute)]">{CAGE_BOX_INFO_LABEL[k]??k}</div><div className="mt-0.5 flex flex-wrap items-start gap-3"><div className="min-w-0 flex-1 break-all text-[var(--twin-ink)]">{display}</div>{k==="CageBoxQrCode"&&qr!==""&&<div className="shrink-0 rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-1"><QRCodeSVG value={qr} size={112} level="M" includeMargin={false}/></div>}</div></div>;
        })}</div>
        {cell.annotation&&(cell.annotation.richText||cell.annotation.images)&&<div className="mt-3 pt-3 border-t border-[var(--twin-hairline)]"><div className="text-xs font-semibold text-[var(--twin-ink)] mb-2">学生标注</div>
          {cell.annotation.richText&&<div className="rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1.5 mb-1.5 text-xs"><div className="text-[var(--twin-mute)] mb-0.5">备注</div><div className="text-[var(--twin-ink)] whitespace-pre-wrap">{cell.annotation.richText}</div></div>}
          {cell.annotation.images&&(()=>{try{const urls=JSON.parse(cell.annotation.images);if(Array.isArray(urls)&&urls.length>0)return<div className="rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1.5 text-xs"><div className="text-[var(--twin-mute)] mb-1">图片({urls.length})</div><div className="flex flex-wrap gap-2">{urls.filter(Boolean).map((url:string,i:number)=><img key={i} src={url} alt={`标注${i+1}`} className="h-16 w-16 object-cover rounded-twin-sm border border-[var(--twin-hairline)]"/>)}</div></div>;}catch{return null;}})()}
          {cell.annotation.updatedAt&&<div className="text-[10px] text-[var(--twin-mute)] mt-1">{cell.annotation.updatedBy?`${cell.annotation.updatedBy} 于 `:""}{cell.annotation.updatedAt}</div>}</div>}
      </div>
    </div></Portal>}

    {/* ---- 分配确认弹窗 ---- */}
    {allocDialogOpen&&<AllocDialog aupList={aupList} selectedAupId={selectedAupId} setSelectedAupId={setSelectedAupId} selectedCells={selectedCells} allocSubmitting={allocSubmitting} onClose={()=>setAllocDialogOpen(false)} onConfirm={handleConfirmAssign}/>}

    {/* ---- 扫码弹窗（编辑/绑定各一个） ---- */}
    <MobileScanDialog open={editScanOpen} onClose={()=>setEditScanOpen(false)} onResult={(code)=>{handleEditScan(code);setEditInputVal(code);setEditScanOpen(false);}}/>
    <MobileScanDialog open={bindScanOpen} onClose={()=>setBindScanOpen(false)} onResult={(code)=>{setBindInputVal(code);setBindScannedCode(code);setBindSelectedKey(null);setUnbindActive(false);setBindScanOpen(false);toast.success(`已录入笼盒编号 ${code}`,{duration:4000});}}/>
    {/* ---- 编辑模式状态选择弹窗 ---- */}
    <Dialog open={!!editDialogCell} onOpenChange={(o)=>{if(!o)setEditDialogCell(null);}}>
      <DialogContent className="max-w-xs">
        <DialogHeader><DialogTitle>选择操作 · {editDialogCell?.position}</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-2">
          {(["DIVIDE","SPECIAL_BREEDING","HEALTH_CHECK"]as CageBoxAction[]).map(a=>{
            const label=a==="DIVIDE"?"请分笼":a==="SPECIAL_BREEDING"?"特殊饲养":"健康检查";
            const color=a==="DIVIDE"?"#d97706":a==="SPECIAL_BREEDING"?"#dc2626":"#7c3aed";
            const key=editDialogCell?(()=>{const sid=findShelfIdForCell(editDialogCell);return`${sid}:${editDialogCell.x}:${editDialogCell.y}`;})():null;
            const entry=key?scanCache.get(key):null;
            // 未缓存时回退到服务器当前状态
            const serverHas=!entry&&editDialogCell?(()=>{const cbi=editDialogCell.cageBoxInfo as Record<string,any>|undefined;const cvo=cbi?.cageBoxVo??cbi?.["cageBoxVo"]??{};if(a==="DIVIDE")return cbi?.NeedDivideYn===1||cvo.needDivideYn===1;if(a==="SPECIAL_BREEDING")return cbi?.NeedFeedingYn===1||cvo.needFeedingYn===1||!!cbi?.specialBreedingName;if(a==="HEALTH_CHECK")return cbi?.AbnormalHealthYn===1||cvo.abnormalHealthYn===1||!!cbi?.animalHealthEntity;return false;})():false;
            const has=entry?entry.currentActions.has(a):serverHas;
            return <button key={a} onClick={()=>{
              if(!editDialogCell)return;
              const sid=findShelfIdForCell(editDialogCell);if(!sid)return;
              const ck=`${sid}:${editDialogCell.x}:${editDialogCell.y}`;
              const cbi=editDialogCell.cageBoxInfo as Record<string,any>|undefined;
              const cvo=cbi?.cageBoxVo??cbi?.["cageBoxVo"]??{};
              let code=(editDialogCell as any).cageBoxCode??cbi?.cageBoxCode;
              if(!code)code=cvo.cageBoxCode??cvo["cageBoxCode"]??"";
              setScanCache(prev=>{const next=new Map(prev);
                if(next.has(ck)){const e=next.get(ck)!;const cur=new Set(e.currentActions);cur.has(a)?cur.delete(a):cur.add(a);if(setsEqual(cur,e.initialActions))next.delete(ck);else next.set(ck,{...e,currentActions:cur});}
                else{const init=new Set<CageBoxAction>();if(cbi?.NeedDivideYn===1||cvo.needDivideYn===1)init.add("DIVIDE");if(cbi?.NeedFeedingYn===1||cvo.needFeedingYn===1)init.add("SPECIAL_BREEDING");if(cbi?.AbnormalHealthYn===1||cvo.abnormalHealthYn===1)init.add("HEALTH_CHECK");const cur=new Set(init);cur.has(a)?cur.delete(a):cur.add(a);next.set(ck,{cell:editDialogCell,code,initialActions:init,currentActions:cur});}
                return next;});
              setLastScannedKey(ck);
            }}
              className="flex items-center justify-between rounded-twin-md border-2 px-3 py-2.5 text-sm font-semibold transition hover:brightness-95"
              style={{borderColor:has?color:"var(--twin-hairline)",background:has?`${color}15`:"var(--twin-canvas)",color:has?color:"var(--twin-ink)"}}>
              <span>{label}</span><span className="text-[11px]">{has?"✓ 已选":"点击选择"}</span>
            </button>;
          })}
        </div>
        <DialogFooter><button onClick={()=>setEditDialogCell(null)} className="rounded-twin-md px-4 py-1.5 text-sm text-[var(--twin-mute)] border border-[var(--twin-hairline)]">关闭</button></DialogFooter>
      </DialogContent>
    </Dialog>
    {/* ---- 绑定模式顶部提示（Portal 弹窗式） ---- */}
    {bindMode&&!unbindActive&&!bindConfirmOpen&&(bindScannedCode||bindInputVal.trim())&&!bindSelectedKey&&
    <Portal><div className="fixed top-6 left-1/2 -translate-x-1/2 z-[var(--z-toast)] animate-bounce">
      <div className="flex items-center gap-3 rounded-twin-xl border-2 border-blue-400 bg-blue-500 text-white px-5 py-3 shadow-[0_8px_30px_rgba(37,99,235,0.35)]">
        <div>
          <div className="text-sm font-bold">请选择要绑定的笼位</div>
          <div className="text-[11px] text-blue-100">点击蓝色高亮的空笼盒格位完成绑定</div>
        </div>
      </div>
    </div></Portal>}
    {bindMode&&!bindConfirmOpen&&unbindActive&&!bindSelectedKey&&
    <Portal><div className="fixed top-6 left-1/2 -translate-x-1/2 z-[var(--z-toast)] animate-bounce">
      <div className="flex items-center gap-3 rounded-twin-xl border-2 border-red-400 bg-red-500 text-white px-5 py-3 shadow-[0_8px_30px_rgba(220,38,38,0.35)]">
        <div>
          <div className="text-sm font-bold">请选择要解绑的笼位</div>
          <div className="text-[11px] text-red-100">点击红色高亮的饲养中格位完成解绑</div>
        </div>
      </div>
    </div></Portal>}
    {/* ---- 绑定/解绑确认弹窗（居中 Dialog） ---- */}
    <Dialog open={bindMode&&bindConfirmOpen&&!!cell} onOpenChange={(o)=>{if(!o){setBindConfirmOpen(false);setCell(null);setBindSelectedKey(null);}}}>
      <DialogContent className="z-[var(--z-modal)] sm:max-w-sm" style={{
        borderWidth:2,
        borderColor:unbindActive?"#dc2626":"#2563eb",
      }}>
        <DialogHeader>
          <DialogTitle style={{color:unbindActive?"#dc2626":"#2563eb"}}>
            {unbindActive?"确认解绑":"确认绑定"}
          </DialogTitle>
          <DialogDescription className="space-y-2">
            {!unbindActive&&<div className="rounded-twin-md bg-blue-50 border border-blue-200 px-3 py-2 text-center">
              <div className="text-[10px] text-blue-500">笼盒编号</div>
              <div className="text-sm font-mono font-bold text-blue-700">{bindScannedCode||bindInputVal.trim()}</div>
            </div>}
            <div className="rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] divide-y divide-[var(--twin-hairline)]">
              {(()=>{const cbi=cell?.cageBoxInfo as Record<string,any>|undefined;const rows:{label:string;value:string;em?:boolean}[]=[];
                rows.push({label:"笼位",value:cell?displayPosition(cell.position):""});
                const typeLabel=CAGE_TYPE_LABEL[(cell as any)?.animalCageType as number??0];
                if(typeLabel)rows.push({label:"类型",value:typeLabel});
                const pi=cbi?.ProjectPiName||(cell as any)?.projectPiName||(cell as any)?.piName||"";
                if(pi)rows.push({label:"课题组 PI",value:pi,em:true});
                const dept=cbi?.DepartmentName||"";
                if(dept)rows.push({label:"部门",value:dept});
                const aup=cbi?.AupNumber||"";
                if(aup)rows.push({label:"AUP 编号",value:aup});
                const st=cbi?.StateName||(cell as any)?.stateLabel||"";
                if(st)rows.push({label:"当前状态",value:st,em:true});
                return rows.map((r,i)=><div key={i} className="flex items-center justify-between px-3 py-2 text-xs">
                  <span className="text-[var(--twin-mute)]">{r.label}</span>
                  <span className={r.em?"font-semibold text-[var(--twin-ink)]":"text-[var(--twin-ink)]"}>{r.value||"-"}</span>
                </div>);
              })()}
            </div>
            {unbindActive&&<div className="rounded-twin-md bg-red-50 border border-red-200 px-3 py-2 text-center">
              <span className="text-[11px] text-red-600 font-semibold">解绑后该笼位将恢复为「空笼盒」状态</span>
            </div>}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <AdminButton type="button" tone="secondary" size="default" onClick={()=>{setBindConfirmOpen(false);setCell(null);setBindSelectedKey(null);}}>
            取消
          </AdminButton>
          <AdminButton type="button" size="default" onClick={()=>{if(cell){unbindActive?handleUnbindConfirm(cell):handleBindConfirm(cell);}}}
            disabled={bindSubmitting}
            className={unbindActive?"!bg-[#dc2626] hover:!bg-[#b91c1c]":"!bg-[#2563eb] hover:!bg-[#1d4ed8]"}>
            {bindSubmitting?"处理中...":unbindActive?"确认解绑":"确认绑定"}
          </AdminButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    {/* ---- CAS 绑定提示弹窗 ---- */}
    <Dialog open={bindPromptOpen} onOpenChange={setBindPromptOpen}>
      <DialogContent className="z-[var(--z-modal)] border-[var(--app-color-border-default)] bg-[var(--app-color-surface-elevated)] text-[var(--app-color-text-primary)] sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>需要 ARO 个人认证</DialogTitle>
          <DialogDescription>
            您暂未绑定 ARO 个人认证 Token，无法进行笼位分配操作。请在右上角头像菜单中绑定后再试。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <AdminButton type="button" tone="secondary" size="default" onClick={() => setBindPromptOpen(false)}>
            取消
          </AdminButton>
          <AdminButton type="button" tone="primary" size="default" onClick={() => {
            setBindPromptOpen(false);
            openCasDialog();
          }}>
            <KeyRound className="mr-2 h-4 w-4" />
            去绑定
          </AdminButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    </div>
  </AdminPageShell>;
}
