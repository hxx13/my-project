import { useEffect, useMemo, useRef, useState, memo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toAdminRoutePath } from "@/features/admin/buildAdminNavModel";
import toast from "react-hot-toast";
import { useQuery } from "@tanstack/react-query";
import { LayoutGrid, Star, ChevronDown, ChevronRight, Search, Info, PanelLeftClose, PanelLeft, KeyRound, Loader2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import {
  fetchCageShelfDetail, fetchCageScanProgress, refreshCellDetail,
  type CageShelfCell, type CageShelfDetail,
  fetchBookmarks, toggleBookmarkApi, fetchShelfCells,
  type BookmarkEntry,
  fetchFullTree, type CageShelfTreeNode,
  fetchPersistedAlerts, type PersistedAlert,
  fetchSnapshotBatches, type SnapshotBatch,
  fetchRealtimeRefresh, type RealtimeRefreshResponse,
  fetchAllocationAups, type AupItem,
  assignCages, cancelCageAssignment,
  fetchBookingRooms, type BookingRoom,
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

const CellButton=memo(function CellButton({cell,onClick,alert,selectable,selected,onToggle,allocMode,clickMode}:{
  cell:CageShelfCell;onClick:(c:CageShelfCell)=>void;alert?:PersistedAlert;
  selectable?:boolean;selected?:boolean;onToggle?:(e:React.MouseEvent)=>void;allocMode?:boolean;
  clickMode?:"toggle"|"checkbox";
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
  const baseCls=cell.empty?"relative min-h-[82px] rounded-twin-md text-[10px] leading-tight border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] text-[var(--twin-mute)]":"relative min-h-[82px] rounded-twin-md text-[10px] leading-tight border-2 text-slate-900 hover:brightness-95";
  const cls=`${baseCls}${selected?" border-blue-500 bg-blue-100/20":""}`;
  const handleCardClick=(e:React.MouseEvent)=>{
    if(isSelectable&&isToggleMode&&onToggle){onToggle(e);return;}
    if(isSelectable&&!isToggleMode){onClick(cell);return;}
    if(!cell.empty)onClick(cell);
  };
  const handleCheckboxClick=(e:React.MouseEvent)=>{e.stopPropagation();if(onToggle)onToggle(e);};
  return <button type="button" className={cls} style={selected?{...style,borderColor:"#3b82f6",borderWidth:"2px"}:style}
    onClick={handleCardClick} disabled={cell.empty&&!isSelectable}
    data-x={cell.x} data-y={cell.y}>
    {allocMode&&isSelectable&&<div className="absolute top-0.5 left-0.5 z-20" onClick={handleCheckboxClick}><input type="checkbox" checked={selected??false} readOnly className="w-3 h-3 accent-blue-600 pointer-events-none"/></div>}
    {!allocMode&&alert&&(()=>{const ALERT_COLORS:Record<string,string>={NEED_DIVIDE:"bg-amber-500 ring-amber-300",HEALTH_ABNORMAL:"bg-purple-500 ring-purple-300",ANIMAL_TRANSFER:"bg-cyan-500 ring-cyan-300",SPECIAL_FEEDING:"bg-red-500 ring-red-300",COHABITATION:"bg-emerald-500 ring-emerald-300"};const ac=ALERT_COLORS[alert.statusCode]||"bg-red-500 ring-red-300";return<div className="absolute top-0.5 left-0.5 z-20" title={`${alert.statusLabel} · 已存在${alert.spanDays ?? alert.persistedDays}天（不超过${alert.thresholdDays}天）`}><div className={`w-4 h-4 rounded-full ring-1 flex items-center justify-center shadow-sm animate-pulse ${ac}`}><span className="text-white text-[9px] font-bold leading-none">!</span></div></div>;})()}
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

function ShelfGrid({title,detail,loading,emptyHint,onCellClick,isBookmarked,onToggleBookmark,alertMap,selectable,selectedCells,onToggleCell,allocMode,clickMode}:{
  title:string;detail:CageShelfDetail|null;loading:boolean;emptyHint?:string;
  onCellClick:(c:CageShelfCell)=>void;isBookmarked?:boolean;onToggleBookmark?:()=>void;
  alertMap:Map<string,PersistedAlert>;
  selectable?:boolean;selectedCells?:Set<string>;onToggleCell?:(shelveId:string,x:number,y:number,shiftKey?:boolean)=>void;allocMode?:boolean;
  clickMode?:"toggle"|"checkbox";
}){
  const sid=detail?.shelfMeta?.shelveId??"";
  const cells=detail?.grid??[];

  const gridContent=loading?<div className="flex-1 rounded-twin-lg border border-dashed text-xs text-[var(--twin-mute)] grid place-items-center">加载中...</div>
    :!detail||detail.totalCells===0?<div className="flex-1 rounded-twin-lg border border-dashed text-xs text-[var(--twin-mute)] grid place-items-center px-2 text-center">{emptyHint??"暂无数据"}</div>
    :<div className="flex-1 min-h-0 overflow-y-auto content-start p-[3px]">
        <div className="grid grid-cols-8 gap-1.5">{cells.map(c=>{const alertKey=`${sid}:${c.position}`;const selKey=`${sid}:${c.x}:${c.y}`;return<CellButton key={c.position} cell={c} onClick={onCellClick} alert={alertMap.get(alertKey)} selectable={selectable} selected={selectedCells?.has(selKey)} onToggle={onToggleCell?(e:React.MouseEvent)=>onToggleCell(sid,c.x,c.y,e.shiftKey):undefined} allocMode={allocMode} clickMode={clickMode}/>;})}</div>
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
  const { casStatus, openCasDialog } = useCasBinding();
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

    if(pageMode==="allocate"){
      // 分配模式：走实时数据源
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
  },[aRid,roomShelveMap,selectedBatchId,pageMode]);

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
    if(pageMode==="allocate"||pageMode==="booking"){
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
      <div className="flex-1 min-w-0 flex flex-col h-full pr-1">
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
              <button type="button" onClick={()=>{pageMode==="allocate"?setPageMode("view"):setPageMode("allocate");setSelectedCells(new Set());anchorCellRef.current=null;boxSelectAnchorRef.current=null;setBoxSelectMode(false);shiftHintShownRef.current=false;setCell(null);setShelfId(null);}}
                className={`rounded-twin-md px-2.5 py-1 text-[11px] font-semibold transition ${pageMode==="allocate"?"bg-blue-600 text-white shadow-sm":"text-[var(--twin-mute)] hover:text-[var(--twin-ink)]"}`}>
                笼位分配{pageMode==="allocate"?" ▾":""}
              </button>
              <button type="button" onClick={()=>{pageMode==="booking"?setPageMode("view"):setPageMode("booking");setSelectedCells(new Set());anchorCellRef.current=null;boxSelectAnchorRef.current=null;setBoxSelectMode(false);shiftHintShownRef.current=false;setCell(null);setShelfId(null);}}
                className={`rounded-twin-md px-2.5 py-1 text-[11px] font-semibold transition ${pageMode==="booking"?"bg-emerald-600 text-white shadow-sm":"text-[var(--twin-mute)] hover:text-[var(--twin-ink)]"}`}>
                笼位预约{pageMode==="booking"?" ▾":""}
              </button>
              {pageMode==="allocate"&&realtimeMeta&&(
                <span className="text-[10px] text-[var(--twin-mute)] ml-0.5">{realtimeMeta.fromRealtime?"✅ 实时":"📦 缓存"}{realtimeMeta.cachedAt?" · "+realtimeMeta.cachedAt.substring(11,19):""}</span>
              )}
              {pageMode==="booking"&&realtimeMeta&&(
                <span className="text-[10px] text-[var(--twin-mute)] ml-0.5">🖥️ {realtimeMeta.fromRealtime?"实时":"缓存"}{realtimeMeta.cachedAt?" · "+realtimeMeta.cachedAt.substring(11,19):""}</span>
              )}
              {pageMode==="booking"&&<AupSearchBar onSelectRoom={(rid,rname)=>{onOpenRoom(rid,rname);expandToRoom(rid);}}/>}
              {pageMode==="allocate"&&<button type="button" onClick={()=>{setBoxSelectMode(v=>!v);boxSelectAnchorRef.current=null;}}
                className={`rounded-twin-md px-2 py-1 text-[11px] font-semibold transition ${boxSelectMode?"bg-amber-500 text-white shadow-sm":"text-[var(--twin-mute)] hover:text-[var(--twin-ink)] border border-dashed border-[var(--twin-hairline)]"}`}>
                {boxSelectMode?"框选中 · 点击两格":"⬜ 矩形框选"}
              </button>}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {/* ---- 查看模式控件 ---- */}
            {pageMode==="view"&&<>
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

            <button type="button" onClick={()=>setLegend(v=>!v)} className={`flex items-center gap-1 rounded-twin-md px-2 py-1 text-[10px] transition ${legend?'bg-[var(--twin-link-deep)] text-white':'text-[var(--twin-mute)] hover:text-[var(--twin-ink)]'}`}><Info className="h-3 w-3"/>图例{legend?' ▲':' ▼'}</button>
          </div>
        </div>
        {legend&&<CageShelfLegend/>}
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
                    onCellClick={c=>{setCell(c);setShelfId(String(shelfDetail.shelfMeta?.shelveId??""));}}
                    alertMap={alertMap}
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
              return<div key={sid||idx} id={`shelf-${sid}`}><ShelfGrid title={d.shelfMeta?.shelveName??`笼架 ${idx+1}`} detail={d} loading={false} emptyHint="暂无笼架数据" isBookmarked={isBm} onToggleBookmark={sid!==""?()=>toggleBm(sid):undefined} onCellClick={c=>{if(!c.empty){setCell(c);setShelfId(sid);}}} alertMap={alertMap} selectable={pageMode==="allocate"} selectedCells={pageMode==="allocate"?selectedCells:undefined} onToggleCell={pageMode==="allocate"?handleAllocateToggle:undefined} allocMode={pageMode==="allocate"} clickMode="checkbox"/></div>;
            })}</div>}
          </>}

          {/* SHELF MODE: left grid + right detail (like student page) */}
          {pageMode!=="booking"&&viewMode==="shelf"&&<div className="flex gap-3 min-h-0" style={{height:"calc(100vh - 190px)"}}>
            {/* Left: 8×10 grid */}
            <div className="w-1/2 flex flex-col min-w-0">
              {shelfLoading&&<div className="flex-1 rounded-twin-xl border border-dashed border-[var(--twin-hairline)] bg-[var(--twin-canvas)] grid place-items-center text-sm text-[var(--twin-mute)]">加载笼架…</div>}
              {!shelfLoading&&!shelfDetail&&<div className="flex-1 rounded-twin-xl border border-dashed border-[var(--twin-hairline)] bg-[var(--twin-canvas)] flex flex-col items-center justify-center text-sm text-[var(--twin-mute)]"><LayoutGrid className="h-10 w-10 mb-3 opacity-20"/>点击左侧笼架<br/><span className="text-[11px]">选中后显示该笼架 8×10 笼位</span></div>}
              {!shelfLoading&&shelfDetail&&<ShelfGrid title={shelfDetail.shelfMeta?.shelveName||"笼架"} detail={shelfDetail} loading={false} emptyHint="暂无数据" onCellClick={c=>{if(pageMode==="allocate"&&!c.empty)return;setCell(c);setShelfId(String(shelfDetail.shelfMeta?.shelveId??""));}} alertMap={alertMap} selectable={pageMode==="allocate"} selectedCells={pageMode==="allocate"?selectedCells:undefined} onToggleCell={pageMode==="allocate"?handleAllocateToggle:undefined} allocMode={pageMode==="allocate"} clickMode="checkbox"/>}
            </div>
            {/* Right: cell detail "预备画面" */}
            <div className="w-1/2 flex flex-col min-w-0">
              {!cell&&<div className="flex-1 rounded-twin-xl border border-dashed border-[var(--twin-hairline)] bg-[var(--twin-canvas)] flex flex-col items-center justify-center text-sm text-[var(--twin-mute)]">
                <div className="text-4xl mb-3 opacity-20">📋</div>笼盒详情预备画面<br/><span className="text-[11px]">点击左侧笼位格子显示笼盒信息</span>
              </div>}
              {cell&&<div className="flex-1 overflow-y-auto rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-3">
                <div className="mb-2 flex items-center justify-between"><div className="text-sm font-semibold text-[var(--twin-ink)]">笼盒详情 · 格位 {displayPosition(cell.position)}</div><button type="button" className="text-xs text-[var(--twin-mute)] hover:text-[var(--twin-ink)]" onClick={()=>setCell(null)}>清除</button></div>
                <div className="grid grid-cols-2 gap-2 text-xs">{CAGE_BOX_INFO_FIELD_ORDER.map(k=>{const source=cell.cageBoxInfo??cell.detail??{};const v=source[k];const display=formatCageDetailValue(v,k);const qr=k==="CageBoxQrCode"&&v!=null&&String(v).trim()!==""?String(v).trim():"";
                  return<div key={k} className={`rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1.5 ${k==="CageBoxQrCode"?"col-span-2":""}`}><div className="text-[var(--twin-mute)]">{CAGE_BOX_INFO_LABEL[k]??k}</div><div className="mt-0.5 flex flex-wrap items-start gap-3"><div className="min-w-0 flex-1 break-all text-[var(--twin-ink)]">{display}</div>{k==="CageBoxQrCode"&&qr!==""&&<div className="shrink-0 rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-1"><QRCodeSVG value={qr} size={80} level="M" includeMargin={false}/></div>}</div></div>;
                })}</div>
                {cell.annotation&&(cell.annotation.richText||cell.annotation.images)&&<div className="mt-2 pt-2 border-t border-[var(--twin-hairline)]"><div className="text-xs font-semibold text-[var(--twin-ink)] mb-1">学生标注</div>
                  {cell.annotation.richText&&<div className="rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1 mb-1 text-xs"><div className="text-[var(--twin-mute)]">备注</div><div className="text-[var(--twin-ink)] whitespace-pre-wrap">{cell.annotation.richText}</div></div>}
                </div>}
              </div>}
            </div>
          </div>}
        </>}
        {tab==="bookmarks"&&<>
          {pinned.size===0&&!bmLoading&&<div className="rounded-twin-xl border border-dashed border-[var(--twin-hairline)] bg-[var(--twin-canvas)] h-full flex flex-col items-center justify-center text-center text-sm text-[var(--twin-mute)]"><Star className="h-10 w-10 mx-auto mb-3 opacity-20"/>选择左侧收藏的笼架<br/><span className="text-[11px]">点击左侧列表中的笼架查看详情</span></div>}
          {!bmLoading&&bmList.length>0&&<div className="grid grid-cols-1 xl:grid-cols-2 gap-3">{bmList.map(b=><BookmarkShelfGrid key={`${b.roomId}-${b.shelveId}`} roomId={String(b.roomId)} shelveId={String(b.shelveId)} title={b.shelveName&&String(b.shelveName)!==String(b.shelveId)?b.shelveName:(shelfNameMap.get(String(b.shelveId))||`笼架 ${b.shelveId}`)} campusName={b.campusName} roomName={b.roomName} isBookmarked={true} onToggleBookmark={()=>toggleBookmarkApi(String(b.roomId),String(b.shelveId)).then(r=>{if(!r.bookmarked){setPinned(p=>{const n=new Set(p);n.delete(`${b.roomId}:${b.shelveId}`);return n;});setBmList(l=>l.filter(x=>`${x.roomId}:${x.shelveId}`!==`${b.roomId}:${b.shelveId}`));}})} onCellClick={c=>{setCell(c);setShelfId(String(b.shelveId));}} alertMap={alertMap}/>)}</div>}
        </>}
      </div>
    </div>

    {cell&&viewMode!=="shelf"&&<Portal><div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={()=>{setCell(null);setShelfId(null);}}>
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
