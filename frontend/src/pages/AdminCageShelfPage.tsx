import { useEffect, useMemo, useState, memo } from "react";
import { useNavigate } from "react-router-dom";
import { toAdminRoutePath } from "@/features/admin/buildAdminNavModel";
import toast from "react-hot-toast";
import { useQuery } from "@tanstack/react-query";
import { LayoutGrid, Star, ChevronDown, ChevronRight, Search, Info, PanelLeftClose, PanelLeft } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import {
  fetchCageShelfDetail, fetchCageShelfFilterOptions, fetchCageScanProgress,
  refreshCellDetail,
  type CageShelfCell, type CageShelfDetail, type CageShelfFilterOptions,
  fetchBookmarks, toggleBookmarkApi, fetchShelfCells,
  type BookmarkEntry,
} from "@/api/domains/cageShelf.api";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { Portal } from "@/components/Portal";
import CageCellOverlays, { getDominantStatusCode, useStatusStyle, CAGE_TYPE_LABEL } from "@/features/cage-shelf/components/CageCellOverlays";
import CageShelfLegend from "@/features/cage-shelf/components/CageShelfLegend";
import CageScanProgressBanner from "@/features/cage-shelf/components/CageScanProgressBanner";
import { CageColorProvider } from "@/features/cage-shelf/components/CageColorContext";

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
function formatCageDetailValue(v:unknown):string{
  if(v===null||v===undefined||v==="")return"-";
  if(typeof v==="boolean")return v?"是":"否";
  return String(v);
}

/* ================================================================== */
/*  CellButton + ShelfGrid                                              */
/* ================================================================== */

const CellButton=memo(function CellButton({cell,onClick}:{cell:CageShelfCell;onClick:(c:CageShelfCell)=>void}){
  const dominant=getDominantStatusCode(cell.specialStatuses,cell.cageBoxInfo);
  const style=useStatusStyle(dominant);
  const pi=nonEmptyText(cell.projectPiName)?cell.projectPiName!.trim():nonEmptyText(cell.piName)?cell.piName!.trim():"";
  const cls=cell.empty?"relative min-h-[82px] rounded-twin-md text-[10px] leading-tight border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] text-[var(--twin-mute)]":"relative min-h-[82px] rounded-twin-md text-[10px] leading-tight border-2 text-slate-900 hover:brightness-95";
  return <button type="button" className={cls} style={style} onClick={()=>!cell.empty&&onClick(cell)} disabled={cell.empty}>
    {!cell.empty&&<CageCellOverlays animalCageType={cell.animalCageType} compact/>}
    <div className="flex min-h-[76px] flex-col items-center justify-center gap-0.5 px-1 py-1 text-center">
      <div className="w-full font-bold">{cell.position}</div>
      {cell.empty?<div className="text-[9px] text-[var(--twin-mute)]">空位</div>:<>
        {nonEmptyText(cell.projectGroup)&&<div className="w-full truncate">{cell.projectGroup}</div>}
        {pi&&<div className="w-full truncate text-[11px] font-semibold text-[var(--twin-ink)]">{pi}</div>}
        <div className="w-full text-[9px] text-[var(--twin-mute)]">{CAGE_TYPE_LABEL[cell.animalCageType??0]||cell.stateLabel}</div>
      </>}
    </div>
  </button>;
});

function ShelfGrid({title,detail,loading,emptyHint,onCellClick,isBookmarked,onToggleBookmark}:{
  title:string;detail:CageShelfDetail|null;loading:boolean;emptyHint?:string;
  onCellClick:(c:CageShelfCell)=>void;isBookmarked?:boolean;onToggleBookmark?:()=>void;
}){
  const cells=detail?.grid??[];
  return <div className="rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-3 min-h-0 flex flex-col">
    <div className="mb-2 flex items-center justify-between shrink-0">
      <div className="text-sm font-semibold text-[var(--twin-ink)]">{title}</div>
      <div className="flex items-center gap-2">
        {detail?.shelfMeta&&<div className="text-[11px] text-[var(--twin-mute)]">{detail.shelfMeta.campusName}/{detail.shelfMeta.areaName}/{detail.shelfMeta.floorName}/{detail.shelfMeta.roomName}/{detail.shelfMeta.shelveName||detail.shelfMeta.shelveId}</div>}
        {onToggleBookmark&&<button type="button" className={`shrink-0 p-0.5 rounded transition ${isBookmarked?"text-amber-500 hover:text-amber-600":"text-slate-300 hover:text-amber-400"}`} onClick={onToggleBookmark} title={isBookmarked?"取消收藏":"收藏此笼架"}><Star className={`h-4 w-4 ${isBookmarked?"fill-amber-500":""}`}/></button>}
      </div>
    </div>
    {loading?<div className="flex-1 rounded-twin-lg border border-dashed text-xs text-[var(--twin-mute)] grid place-items-center">加载中...</div>
    :!detail||detail.totalCells===0?<div className="flex-1 rounded-twin-lg border border-dashed text-xs text-[var(--twin-mute)] grid place-items-center px-2 text-center">{emptyHint??"暂无数据"}</div>
    :<div className="flex-1 min-h-0 overflow-y-auto content-start p-[3px]"><div className="grid grid-cols-8 gap-1.5">{cells.map(c=><CellButton key={c.position} cell={c} onClick={onCellClick}/>)}</div></div>}
  </div>;
}

/* ================================================================== */
/*  BookmarkShelfGrid                                                   */
/* ================================================================== */

function BookmarkShelfGrid({roomId,shelveId,title,campusName,roomName,isBookmarked,onToggleBookmark,onCellClick}:{
  roomId:string;shelveId:string;title:string;campusName?:string;roomName?:string;
  isBookmarked?:boolean;onToggleBookmark?:()=>void;onCellClick:(c:CageShelfCell)=>void;
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
  return<ShelfGrid title={title} detail={detail} loading={false} emptyHint="暂无笼架数据" isBookmarked={isBookmarked} onToggleBookmark={onToggleBookmark} onCellClick={onCellClick}/>;
}
function snapshotCellToShelfCell(c:any):CageShelfCell{
  let cageBoxInfo:Record<string,unknown>|undefined;let specialStatuses:any[]|undefined;
  try{if(c.cageBoxJson)cageBoxInfo=JSON.parse(c.cageBoxJson);}catch{}
  try{if(c.specialStatusesJson)specialStatuses=JSON.parse(c.specialStatusesJson);}catch{}
  const x=c.positionX??0,y=c.positionY??0,label=c.positionLabel||`${String.fromCharCode(64+x)}-${y}`,empty=c.empty||(!c.animalCageType&&!cageBoxInfo);
  return{x,y,position:label,empty,stateLabel:empty?"空位":"",animalCageType:c.animalCageType??undefined,projectPiName:cageBoxInfo?.projectPiName as string??undefined,departmentName:cageBoxInfo?.departmentName as string??undefined,piName:cageBoxInfo?.piName as string??undefined,cageBoxInfo,specialStatuses};
}

/* ================================================================== */
/*  CampusTree                                                          */
/* ================================================================== */

const CAMPUS_ORDER=["浦东","浦西"]as const;
const CAMPUS_STYLES:Record<string,{bg:string;badge:string;text:string}>={
  "浦东":{bg:"linear-gradient(135deg,#0284c7,#0369a1)",badge:"rgba(255,255,255,0.18)",text:"#fff"},
  "浦西":{bg:"linear-gradient(135deg,#d97706,#b45309)",badge:"rgba(255,255,255,0.18)",text:"#fff"},
};
const CAMPUS_FALLBACK={bg:"#64748b",badge:"rgba(255,255,255,0.15)",text:"#fff"};
const cs=(n:string)=>CAMPUS_STYLES[n]??CAMPUS_FALLBACK;

function CampusTree({opts,cid,aid,fid,rid,exp,search,onToggle,onSelC,onSelA,onSelF,onSelR,onOpenRoom}:{
  opts:CageShelfFilterOptions;cid:string;aid:string;fid:string;rid:string;
  exp:Set<string>;search:string;
  onToggle:(k:string)=>void;onSelC:(id:string)=>void;onSelA:(id:string,name:string)=>void;onSelF:(id:string,name:string)=>void;onSelR:(id:string,name:string)=>void;
  onOpenRoom:(id:string,name:string)=>void;
}){
  const q=search.trim().toLowerCase();
  const campuses=opts.campuses??[];const areas=opts.areas??[];const floors=opts.floors??[];const rooms=opts.rooms??[];const shelves=opts.shelves??[];
  const tg=(k:string)=>{const n=new Set(exp);n.has(k)?n.delete(k):n.add(k);onToggle(k);};
  const sorted=[...campuses].sort((a,b)=>{const ai=CAMPUS_ORDER.indexOf(a.campusName as any),bi=CAMPUS_ORDER.indexOf(b.campusName as any);if(ai!==-1&&bi!==-1)return ai-bi;if(ai!==-1)return-1;if(bi!==-1)return 1;return a.campusName.localeCompare(b.campusName,"zh-CN");});
  return <div className="text-[11px] space-y-1.5">
    {sorted.map(c=>{const ckey=`c:${c.campusId}`,open=exp.has(ckey),sty=cs(c.campusName);
      return <div key={ckey}>
        <button type="button" onClick={()=>{tg(ckey);if(!open)onSelC(String(c.campusId));}}
          className="w-full flex items-center gap-1.5 px-2.5 py-2 rounded-twin-lg text-left shadow-sm active:scale-[0.99] transition" style={{background:sty.bg}}>
          {open?<ChevronDown className="h-3.5 w-3.5 shrink-0 text-white/80"/>:<ChevronRight className="h-3.5 w-3.5 shrink-0 text-white/80"/>}
          <span className="flex-1 truncate text-xs font-bold" style={{color:sty.text}}>{c.campusName}校区</span>
        </button>
        {open&&<div className="mt-1 ml-1 space-y-0.5">
          {areas.length>0?areas.map(a=>{const akey=`a:${a.areaId}`,aOpen=exp.has(akey);
            return <div key={akey}><button onClick={()=>{tg(akey);if(!aOpen)onSelA(a.areaId,a.areaName);}} className="w-full flex items-center gap-1 rounded-twin-sm px-1.5 py-1 hover:bg-[var(--twin-canvas-soft)] transition">{aOpen?<ChevronDown className="h-3 w-3 text-[var(--twin-mute)]"/>:<ChevronRight className="h-3 w-3 text-[var(--twin-mute)]"/>}<span className="truncate">{a.areaName}</span></button>
            {aOpen&&<div className="ml-2">{floors.map((f:any)=>floorNode(f,exp,tg,onSelF,rooms,q,rid,onSelR,onOpenRoom,shelves))}</div>}</div>;
          }):floors.length>0?floors.map((f:any)=>floorNode(f,exp,tg,onSelF,rooms,q,rid,onSelR,onOpenRoom,shelves))
          :rooms.filter((r:any)=>!q||r.roomName.toLowerCase().includes(q)).map((r:any)=>roomNode(r,rid,exp,tg,onSelR,onOpenRoom,shelves))}
        </div>}
      </div>;
    })}
    {sorted.length===0&&<div className="text-[var(--twin-mute)] py-6 text-center">暂无校区数据</div>}
  </div>;
}
function floorNode(f:any,exp:Set<string>,tg:Function,onSelF:Function,rooms:any[],q:string,rid:string,onSelR:Function,onOpenRoom:Function,shelves:any[]){
  const fkey=`f:${f.floorId}`,open=exp.has(fkey);
  return <div key={fkey}><button onClick={()=>{tg(fkey);if(!open)onSelF(String(f.floorId),f.floorName);}} className="w-full flex items-center gap-1 rounded-twin-sm px-1.5 py-1 hover:bg-[var(--twin-canvas-soft)] transition">{open?<ChevronDown className="h-3 w-3 text-[var(--twin-mute)]"/>:<ChevronRight className="h-3 w-3 text-[var(--twin-mute)]"/>}<span className="truncate">{f.floorName}</span></button>
  {open&&<div className="ml-2 space-y-0.5">{rooms.filter((r:any)=>!q||r.roomName.toLowerCase().includes(q)).map((r:any)=>roomNode(r,rid,exp,tg,onSelR,onOpenRoom,shelves))}</div>}</div>;
}
function roomNode(r:any,rid:string,exp:Set<string>,tg:Function,onExpandRoom:Function,onOpenRoom:Function,shelves:any[]){
  const rkey=`room:${r.roomId}`,expanded=exp.has(rkey),isActive=rid===r.roomId;
  return <div key={rkey}>
    <button onClick={()=>{tg(rkey);if(!isActive)onExpandRoom(r.roomId,r.roomName);}}
      className="w-full rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2.5 py-1.5 text-left hover:border-[var(--twin-hairline-strong)] transition">
      <div className="flex items-center gap-1.5">
        {expanded?<ChevronDown className="h-3 w-3 shrink-0 text-[var(--twin-mute)]"/>:<ChevronRight className="h-3 w-3 shrink-0 text-[var(--twin-mute)]"/>}
        <span className="flex-1 truncate text-xs font-medium text-[var(--twin-ink)]">{r.roomName}</span>
        {isActive&&shelves.length>0&&<span className="shrink-0 text-[10px] text-[var(--twin-mute)]">{shelves.length}架</span>}
      </div>
    </button>
    {expanded&&isActive&&shelves.length>0&&<div className="grid grid-cols-2 gap-1 mt-1 ml-2">
      {shelves.map((s:any)=>{const sid=String(s.shelveId??'');
        return <button key={sid} onClick={(e)=>{e.stopPropagation();onOpenRoom(r.roomId,r.roomName);setTimeout(()=>document.getElementById(`shelf-${sid}`)?.scrollIntoView({behavior:'smooth',block:'start'}),200);}}
          className="text-left rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1.5 hover:border-[var(--twin-hairline-strong)] transition">
          <div className="flex items-center gap-1"><LayoutGrid className="h-2.5 w-2.5 shrink-0 text-[var(--twin-mute)]"/><span className="truncate text-[10px] font-medium text-[var(--twin-ink)]">{s.shelveName||sid}</span></div>
        </button>;
      })}</div>}
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
  const[cid,setCid]=useState("");const[aid,setAid]=useState("");const[aname,setAname]=useState("");
  const[fid,setFid]=useState("");const[fname,setFname]=useState("");
  const[rid,setRid]=useState("");const[rname,setRname]=useState("");         // 树用：展开房间时设rid拉取 shelves
  const[aRid,setARid]=useState("");const[aRname,setARname]=useState("");  // 右侧用：点笼架时触发加载
  const[details,setDetails]=useState<CageShelfDetail[]>([]);
  const[loading,setLoading]=useState(false);
  const[cell,setCell]=useState<CageShelfCell|null>(null);
  const[shelfId,setShelfId]=useState<string|null>(null);
  const[exp,setExp]=useState<Set<string>>(new Set());
  const[search,setSearch]=useState("");
  const[legend,setLegend]=useState(false);
  const[collapsed,setCollapsed]=useState(false);
  const[pinned,setPinned]=useState<Set<string>>(new Set());
  const[bmList,setBmList]=useState<BookmarkEntry[]>([]);
  const[bmLoading,setBmLoading]=useState(false);

  const{data:opts={campuses:[],areas:[],floors:[],rooms:[],shelves:[]}}=useQuery({
    queryKey:["cageShelfFilterOptions",{cid,aid,aname,fid,fname,rid,rname}],
    queryFn:()=>fetchCageShelfFilterOptions({campusId:cid?Number(cid):undefined,areaId:aid||undefined,areaName:aname||undefined,floorId:fid||undefined,floorName:fname||undefined,roomId:rid||undefined,roomName:rname||undefined}),
    placeholderData:(prev)=>prev,
  });
  const{data:scan}=useQuery({queryKey:["cageScanProgress"],queryFn:fetchCageScanProgress,refetchInterval:(q)=>q.state.data?.status==="running"?5000:30000});

  const shelfNameMap=useMemo(()=>{const m=new Map<string,string>();for(const s of opts.shelves??[])m.set(String(s.shelveId),s.shelveName);return m;},[opts.shelves]);
  const sig=useMemo(()=>(opts.shelves??[]).map(s=>s.shelveId).join(","),[opts.shelves]);

  const toggleBm=async(sid:string)=>{if(!aRid){toast.error("请先选择房间");return;}const key=`${aRid}:${sid}`;try{const r=await toggleBookmarkApi(aRid,sid);setPinned(p=>{const n=new Set(p);if(r.bookmarked)n.add(key);else n.delete(key);return n;});if(r.bookmarked){if(tab==="bookmarks")await loadBm();}else{setBmList(p=>p.filter(b=>`${b.roomId}:${b.shelveId}`!==key));}}catch(e:any){toast.error("收藏操作失败");}};
  const loadBm=async()=>{setBmLoading(true);try{const list=await fetchBookmarks();setBmList(list);setPinned(new Set(list.map(b=>`${b.roomId}:${b.shelveId}`)));}catch{}finally{setBmLoading(false);}};
  useEffect(()=>{if(tab==="bookmarks")loadBm();},[tab]);

  useEffect(()=>{if(!aRid||!aRname||!sig){setDetails([]);return;}const shelves=opts.shelves??[];if(shelves.length===0){setDetails([]);return;}let cancelled=false;setLoading(true);void(async()=>{try{const results=await Promise.all(shelves.map(s=>fetchCageShelfDetail(s.shelveId).catch(()=>null)));if(cancelled)return;setDetails(results.filter((r):r is CageShelfDetail=>r!==null));setLoading(false);}catch(e){if(!cancelled){toast.error(e instanceof Error?e.message:"加载失败");setLoading(false);}}})();return()=>{cancelled=true;};},[aRid,aRname,sig]);

  useEffect(()=>{if(!cell||!shelfId||cell.empty)return;let cancelled=false;void(async()=>{try{const fresh=await refreshCellDetail(shelfId,cell.x,cell.y);if(!cancelled)setCell(fresh);}catch{}finally{if(!cancelled)setCell(p=>p?.position===cell.position?fresh:p);}})();return()=>{cancelled=true;};},[cell?.position,shelfId]);

  return<AdminPageShell title="">
    <div className="flex gap-2">
      {/* ======== LEFT PANEL ======== */}
      <div className={`shrink-0 flex flex-col gap-1.5 max-h-[calc(100vh-130px)] transition-all ${collapsed?'w-10':'w-48 xl:w-52'}`}>
        {/* Tabs */}
        <div className="shrink-0 flex items-center gap-1 rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-1">
          <button type="button" onClick={()=>setTab("bookmarks")} className={`flex-1 flex items-center justify-center gap-1 rounded-twin-md py-1 text-[11px] font-semibold transition ${tab==="bookmarks"?"bg-[var(--twin-link-deep)] text-white shadow-sm":"text-[var(--twin-mute)] hover:text-[var(--twin-ink)]"}`}><Star className="h-3 w-3"/>收藏</button>
          <button type="button" onClick={()=>setTab("filter")} className={`flex-1 flex items-center justify-center gap-1 rounded-twin-md py-1 text-[11px] font-semibold transition ${tab==="filter"?"bg-[var(--twin-link-deep)] text-white shadow-sm":"text-[var(--twin-mute)] hover:text-[var(--twin-ink)]"}`}><LayoutGrid className="h-3 w-3"/>筛选</button>
        </div>
        {/* Special status link + Legend toggle */}
        <div className="shrink-0 flex items-center justify-between gap-1">
          <a href={toAdminRoutePath("/admin/cage-shelves/special-status")} onClick={e=>{e.preventDefault();nav(toAdminRoutePath("/admin/cage-shelves/special-status"));}} className="text-[10px] text-[var(--twin-mute)] hover:text-[var(--twin-link-deep)] no-underline">特殊状态总览 →</a>
          <button type="button" onClick={()=>setLegend(v=>!v)} className={`flex items-center gap-1 rounded-twin-md px-2 py-1 text-[10px] transition ${legend?'bg-[var(--twin-link-deep)] text-white':'text-[var(--twin-mute)] hover:text-[var(--twin-ink)]'}`}><Info className="h-3 w-3"/>图例{legend?' ▲':' ▼'}</button>
        </div>
        {legend&&<div className="shrink-0"><CageShelfLegend/></div>}

        {/* Search + Collapse */}
        <div className="shrink-0 flex items-center gap-1 rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-1.5 py-1">
          <button type="button" onClick={()=>setCollapsed(v=>!v)} className="shrink-0 rounded p-0.5 text-[var(--twin-mute)] hover:text-[var(--twin-ink)]" title={collapsed?"展开":"收起"}>{collapsed?<PanelLeft className="h-3.5 w-3.5"/>:<PanelLeftClose className="h-3.5 w-3.5"/>}</button>
          {!collapsed&&<><Search className="h-3.5 w-3.5 shrink-0 text-[var(--twin-mute)]"/><input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="搜索…" className="flex-1 min-w-0 bg-transparent text-[11px] outline-none text-[var(--twin-ink)] placeholder:text-[var(--twin-mute)]"/></>}
        </div>

        {/* Tree (filter) or Bookmark list */}
        {!collapsed&&<div className="flex-1 min-h-0 overflow-y-auto rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-1.5">
          {tab==="filter"&&<CampusTree opts={opts} cid={cid} aid={aid} fid={fid} rid={rid} exp={exp} search={search}
            onToggle={k=>setExp(p=>{const n=new Set(p);n.has(k)?n.delete(k):n.add(k);return n;})}
            onSelC={id=>{setCid(id);}}
            onSelA={(id,name)=>{setAid(id);setAname(name);}}
            onSelF={(id,name)=>{setFid(id);setFname(name);}}
            onSelR={(id,name)=>{setRid(id);setRname(name);}}
            onOpenRoom={(id,name)=>{setARid(id);setARname(name);}}/>}
          {tab==="bookmarks"&&<>
            {bmLoading&&<div className="text-[var(--twin-mute)] py-4 text-center text-[11px]">加载中…</div>}
            {!bmLoading&&bmList.length===0&&<div className="text-[var(--twin-mute)] py-4 text-center text-[11px]">暂无收藏</div>}
            {!bmLoading&&bmList.map(b=><button key={`${b.roomId}-${b.shelveId}`} onClick={()=>{setTab("filter");setRid(String(b.roomId));setRname(b.roomName);setARid(String(b.roomId));setARname(b.roomName);}}
              className="w-full text-left rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1.5 mb-1 hover:border-[var(--twin-hairline-strong)] transition">
              <div className="flex items-center gap-1"><Star className="h-2.5 w-2.5 shrink-0 fill-amber-400 text-amber-400"/><span className="truncate text-[11px] font-medium text-[var(--twin-ink)]">{b.shelveName||b.shelveId}</span></div>
              <div className="text-[10px] text-[var(--twin-mute)] mt-0.5">{b.campusName} · {b.roomName}</div>
            </button>)}
          </>}
        </div>}
      </div>

      {/* ======== RIGHT PANEL ======== */}
      <div className="flex-1 min-w-0 max-h-[calc(100vh-130px)] overflow-y-auto space-y-2 pr-1">
        {scan&&scan.status!=="idle"&&<CageScanProgressBanner progress={scan}/>}
        {/* Filter tab: shelf grids */}
        {tab==="filter"&&<>
          {!aRid&&<div className="rounded-twin-xl border border-dashed border-[var(--twin-hairline)] bg-[var(--twin-canvas)] py-16 text-center text-sm text-[var(--twin-mute)]"><LayoutGrid className="h-10 w-10 mx-auto mb-3 opacity-20"/>展开左侧目录并点击房间名称<br/><span className="text-[11px]">点击房间后自动加载该房间下所有笼架</span></div>}
          {loading&&<div className="rounded-twin-xl border border-dashed border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4 text-center text-sm text-[var(--twin-mute)]">正在加载房间笼架（{details.length}/{opts.shelves?.length??0}）…</div>}
          {!loading&&aRid&&aRname&&(opts.shelves?.length??0)===0&&<div className="rounded-twin-xl border border-amber-200/90 bg-amber-50/80 p-4 text-sm text-amber-900">当前房间暂无笼架索引</div>}
          {details.length>0&&<div className="grid grid-cols-1 xl:grid-cols-2 gap-3">{details.map((d,idx)=>{const sid=String(d.shelfMeta?.shelveId??""),isBm=sid!==""&&pinned.has(`${aRid}:${sid}`);
            return<div key={sid||idx} id={`shelf-${sid}`}><ShelfGrid title={d.shelfMeta?.shelveName??`笼架 ${idx+1}`} detail={d} loading={false} emptyHint="暂无笼架数据" isBookmarked={isBm} onToggleBookmark={sid!==""?()=>toggleBm(sid):undefined} onCellClick={c=>{setCell(c);setShelfId(sid);}}/></div>;
          })}</div>}
        </>}
        {/* Bookmarks tab: bookmark grids */}
        {tab==="bookmarks"&&<>
          {pinned.size===0&&!bmLoading&&<div className="rounded-twin-xl border border-dashed border-[var(--twin-hairline)] bg-[var(--twin-canvas)] py-16 text-center text-sm text-[var(--twin-mute)]"><Star className="h-10 w-10 mx-auto mb-3 opacity-20"/>选择左侧收藏的笼架<br/><span className="text-[11px]">点击左侧列表中的笼架查看详情</span></div>}
          {!bmLoading&&bmList.length>0&&<div className="grid grid-cols-1 xl:grid-cols-2 gap-3">{bmList.map(b=><BookmarkShelfGrid key={`${b.roomId}-${b.shelveId}`} roomId={String(b.roomId)} shelveId={String(b.shelveId)} title={b.shelveName&&String(b.shelveName)!==String(b.shelveId)?b.shelveName:(shelfNameMap.get(String(b.shelveId))||`笼架 ${b.shelveId}`)} campusName={b.campusName} roomName={b.roomName} isBookmarked={true} onToggleBookmark={()=>toggleBookmarkApi(String(b.roomId),String(b.shelveId)).then(r=>{if(!r.bookmarked){setPinned(p=>{const n=new Set(p);n.delete(`${b.roomId}:${b.shelveId}`);return n;});setBmList(l=>l.filter(x=>`${x.roomId}:${x.shelveId}`!==`${b.roomId}:${b.shelveId}`));}})} onCellClick={c=>{setCell(c);setShelfId(String(b.shelveId));}}/>)}</div>}
        </>}
      </div>
    </div>

    {/* ---- Cell Popup ---- */}
    {cell&&<Portal><div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={()=>{setCell(null);setShelfId(null);}}>
      <div className="w-full max-w-xl max-h-[85vh] overflow-y-auto rounded-twin-xl bg-[var(--twin-canvas)] p-4 shadow-twin-level-3" onClick={e=>e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between"><div className="text-sm font-semibold text-[var(--twin-ink)]">笼盒详情 · 格位 {cell.position}</div><button type="button" className="text-xs text-[var(--twin-mute)] hover:text-[var(--twin-ink)]" onClick={()=>{setCell(null);setShelfId(null);}}>关闭</button></div>
        <div className="grid grid-cols-2 gap-2 text-xs">{CAGE_BOX_INFO_FIELD_ORDER.map(k=>{const source=cell.cageBoxInfo??cell.detail??{};const v=source[k];const display=formatCageDetailValue(v);const qr=k==="CageBoxQrCode"&&v!=null&&String(v).trim()!==""?String(v).trim():"";
          return<div key={k} className={`rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1.5 ${k==="CageBoxQrCode"?"col-span-2":""}`}><div className="text-[var(--twin-mute)]">{CAGE_BOX_INFO_LABEL[k]??k}</div><div className="mt-0.5 flex flex-wrap items-start gap-3"><div className="min-w-0 flex-1 break-all text-[var(--twin-ink)]">{display}</div>{k==="CageBoxQrCode"&&qr!==""&&<div className="shrink-0 rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-1"><QRCodeSVG value={qr} size={112} level="M" includeMargin={false}/></div>}</div></div>;
        })}</div>
        {cell.annotation&&(cell.annotation.richText||cell.annotation.images)&&<div className="mt-3 pt-3 border-t border-[var(--twin-hairline)]"><div className="text-xs font-semibold text-[var(--twin-ink)] mb-2">学生标注</div>
          {cell.annotation.richText&&<div className="rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1.5 mb-1.5 text-xs"><div className="text-[var(--twin-mute)] mb-0.5">备注</div><div className="text-[var(--twin-ink)] whitespace-pre-wrap">{cell.annotation.richText}</div></div>}
          {cell.annotation.images&&(()=>{try{const urls=JSON.parse(cell.annotation.images);if(Array.isArray(urls)&&urls.length>0)return<div className="rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1.5 text-xs"><div className="text-[var(--twin-mute)] mb-1">图片({urls.length})</div><div className="flex flex-wrap gap-2">{urls.filter(Boolean).map((url:string,i:number)=><img key={i} src={url} alt={`标注${i+1}`} className="h-16 w-16 object-cover rounded-twin-sm border border-[var(--twin-hairline)]"/>)}</div></div>;}catch{return null;}})()}
          {cell.annotation.updatedAt&&<div className="text-[10px] text-[var(--twin-mute)] mt-1">{cell.annotation.updatedBy?`${cell.annotation.updatedBy} 于 `:""}{cell.annotation.updatedAt}</div>}</div>}
      </div>
    </div></Portal>}
  </AdminPageShell>;
}
