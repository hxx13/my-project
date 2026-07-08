import { useEffect, useMemo, useRef, useState, memo } from "react";
import { useNavigate } from "react-router-dom";
import { toAdminRoutePath } from "@/features/admin/buildAdminNavModel";
import toast from "react-hot-toast";
import { useQuery } from "@tanstack/react-query";
import { LayoutGrid, Star, ChevronDown, ChevronRight, Search, Info, PanelLeftClose, PanelLeft } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import {
  fetchCageShelfDetail, fetchCageScanProgress, refreshCellDetail,
  type CageShelfCell, type CageShelfDetail,
  fetchBookmarks, toggleBookmarkApi, fetchShelfCells,
  type BookmarkEntry,
  fetchFullTree, type CageShelfTreeNode,
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

function CampusTree({tree,exp,search,onToggle,onOpenRoom,viewMode,onOpenShelf}:{
  tree:TreeNode[];exp:Set<string>;search:string;onToggle:(k:string)=>void;onOpenRoom:(roomId:string,roomName:string)=>void;
  viewMode:"room"|"shelf";onOpenShelf:(shelveId:string)=>void;
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
        {open&&<div className="mt-1 ml-1 space-y-0.5">{c.children.map(n=>renderNode(n,exp,q,tg,onOpenRoom,viewMode,onOpenShelf))}</div>}
      </div>;
    })}
    {tree.length===0&&<div className="text-[var(--twin-mute)] py-6 text-center">暂无数据，请先导入 CSV</div>}
  </div>;
}
function renderNode(n:TreeNode,exp:Set<string>,q:string,tg:(k:string)=>void,onOpenRoom:(rid:string,rname:string)=>void,viewMode?:"room"|"shelf",onOpenShelf?:(sid:string)=>void):React.ReactNode{
  const open=exp.has(n.key);
  if(n.type==="shelf"){
    const r=n.raw;const counts=[r.type3||0,r.type1||0,r.type4||0,r.type2||0];
    const colors=["#f43f5e","#f59e0b","#3b82f6","#10b981"];
    const total=counts.reduce((a:number,b:number)=>a+b,0)||80;
    const bars=counts.map((c:number,i:number)=>({pct:Math.round(c/total*100),color:colors[i]})).filter((b:any)=>b.pct>0);
    const hasData=counts.some((c:number)=>c>0);
    const handleClick=()=>{
      if(viewMode==="shelf"&&onOpenShelf){onOpenShelf(String(r.shelveId));return;}
      onOpenRoom(r.roomId,r.roomName);
      setTimeout(()=>document.getElementById(`shelf-${r.shelveId}`)?.scrollIntoView({behavior:'smooth',block:'start'}),300);
    };
    return <button key={n.key} onClick={handleClick}
      className="w-full text-left rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 hover:border-[var(--twin-hairline-strong)] transition ml-2">
      <div className="flex items-center gap-1"><LayoutGrid className="h-2.5 w-2.5 shrink-0 text-[var(--twin-mute)]"/><span className="truncate text-[10px] font-medium text-[var(--twin-ink)]">{n.label}</span></div>
      <div className="flex h-1 rounded-full overflow-hidden bg-[var(--twin-canvas-soft)] mt-1">
        {hasData?bars.map((b:any,i:number)=><div key={i} className="h-full min-w-[2px]" style={{width:`${b.pct}%`,background:b.color}}/>):<div className="h-full w-full bg-[var(--twin-canvas-soft)]"/>}
      </div>
    </button>;
  }
  // room has special treatment: expand shows shelf children, plus aggregate progress bar
  if(n.type==="room"){
    const filtered=q?n.label.toLowerCase().includes(q):true;
    if(!filtered)return null;
    // Aggregate type1~4 from all shelf children for room-level progress bar
    // Order matches shelf rendering: type3, type1, type4, type2
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
    return <div key={n.key}>
      <button onClick={()=>tg(n.key)} className="w-full text-left rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2.5 py-1.5 hover:border-[var(--twin-hairline-strong)] transition">
        <div className="flex items-center gap-1.5">
          {open?<ChevronDown className="h-3 w-3 text-[var(--twin-mute)]"/>:<ChevronRight className="h-3 w-3 text-[var(--twin-mute)]"/>}
          <span className="flex-1 truncate text-xs font-medium text-[var(--twin-ink)]">{n.label}</span>
          <span className="text-[10px] text-[var(--twin-mute)]">{n.children.length}架</span>
        </div>
        <div className="flex h-1 rounded-full overflow-hidden bg-[var(--twin-canvas-soft)] mt-1.5">
          {aggHasData ? aggBars.map((b: any, i: number) => <div key={i} className="h-full min-w-[2px]" style={{ width: `${b.pct}%`, background: b.color }} />) : <div className="h-full w-full bg-[var(--twin-canvas-soft)]" />}
        </div>
      </button>
      {open&&n.children.length>0&&<div className="flex flex-col gap-0.5 mt-1 ml-2">{n.children.map(s=>renderNode(s,exp,q,tg,onOpenRoom,viewMode,onOpenShelf))}</div>}
    </div>;
  }
  // area / floor
  return <div key={n.key}>
    <button onClick={()=>tg(n.key)} className="w-full flex items-center gap-1 rounded-twin-sm px-1.5 py-1 hover:bg-[var(--twin-canvas-soft)] transition">
      {open?<ChevronDown className="h-3 w-3 text-[var(--twin-mute)]"/>:<ChevronRight className="h-3 w-3 text-[var(--twin-mute)]"/>}
      <span className="truncate">{n.label}</span>
    </button>
    {open&&<div className="ml-2 space-y-0.5">{n.children.map(c=>renderNode(c,exp,q,tg,onOpenRoom,viewMode,onOpenShelf))}</div>}
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

  // Load shelf details when aRid changes
  useEffect(()=>{
    if(!aRid){setDetails([]);return;}
    const shelves=roomShelveMap.get(aRid)??[];
    if(shelves.length===0){setDetails([]);return;}
    let cancelled=false;setLoading(true);
    void(async()=>{
      try{
        const results=await Promise.all(shelves.map(s=>fetchCageShelfDetail(s.shelveId).catch(()=>null)));
        if(cancelled)return;
        setDetails(results.filter((r):r is CageShelfDetail=>r!==null));
        setLoading(false);
      }catch(e){
        if(!cancelled){toast.error(e instanceof Error?e.message:"加载失败");setLoading(false);}
      }
    })();
    return()=>{cancelled=true;};
  },[aRid,roomShelveMap]);

  const{data:scan}=useQuery({queryKey:["cageScanProgress"],queryFn:fetchCageScanProgress,refetchInterval:(q)=>q.state.data?.status==="running"?5000:30000});
  const[pinned,setPinned]=useState<Set<string>>(new Set());
  const[bmList,setBmList]=useState<BookmarkEntry[]>([]);
  const[bmLoading,setBmLoading]=useState(false);
  const shelfNameMap=useMemo(()=>{const m=new Map<string,string>();for(const r of fullTree){const sid=String(r.shelveId??"");if(sid)m.set(sid,r.shelveName||sid);}return m;},[fullTree]);

  const toggleBm=async(sid:string)=>{if(!aRid){toast.error("请先选择房间");return;}const key=`${aRid}:${sid}`;try{const r=await toggleBookmarkApi(aRid,sid);setPinned(p=>{const n=new Set(p);if(r.bookmarked)n.add(key);else n.delete(key);return n;});if(r.bookmarked){if(tab==="bookmarks")await loadBm();}else{setBmList(p=>p.filter(b=>`${b.roomId}:${b.shelveId}`!==key));}}catch(e:any){toast.error("收藏操作失败");}};
  const loadBm=async()=>{setBmLoading(true);try{const list=await fetchBookmarks();setBmList(list);setPinned(new Set(list.map(b=>`${b.roomId}:${b.shelveId}`)));}catch{}finally{setBmLoading(false);}};
  useEffect(()=>{if(tab==="bookmarks")loadBm();},[tab]);

  useEffect(()=>{if(!cell||!shelfId||cell.empty)return;let cancelled=false;void(async()=>{try{const fresh=await refreshCellDetail(shelfId,cell.x,cell.y);if(!cancelled)setCell(fresh);}catch{}})();return()=>{cancelled=true;};},[cell?.position,shelfId]);

  const onOpenRoom=(roomId:string,roomName:string)=>{
    setARid(roomId);setARname(roomName);setShelfDetail(null);
  };
  const onOpenShelf=async(shelveId:string)=>{
    setShelfLoading(true);setShelfDetail(null);
    try{const d=await fetchCageShelfDetail(shelveId);setShelfDetail(d);}catch{setShelfDetail(null);}
    finally{setShelfLoading(false);}
  };

  return<AdminPageShell>
    <style>{`
      .cage-scroll::-webkit-scrollbar{width:4px;height:4px}
      .cage-scroll::-webkit-scrollbar-track{background:transparent}
      .cage-scroll::-webkit-scrollbar-thumb{background:var(--twin-hairline);border-radius:4px}
      .cage-scroll::-webkit-scrollbar-thumb:hover{background:var(--twin-mute)}
    `}</style>
    <div className="flex gap-2" style={{height:"calc(100vh - var(--admin-chrome-offset) - 24px)"}}>
      {/* ======== LEFT PANEL ======== */}
      <div className={`shrink-0 flex-col gap-1.5 transition-all h-full ${collapsed?'hidden':'flex w-48 xl:w-52'}`}>
        {!collapsed&&<div className="shrink-0 flex items-center gap-1 rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-1.5 py-1">
          <Search className="h-3.5 w-3.5 shrink-0 text-[var(--twin-mute)]"/><input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="搜索…" className="flex-1 min-w-0 bg-transparent text-[11px] outline-none text-[var(--twin-ink)] placeholder:text-[var(--twin-mute)]"/>
        </div>}
        {!collapsed&&<div className="cage-scroll flex-1 min-h-0 overflow-y-auto overflow-x-hidden rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-1.5 [scrollbar-width:thin] [scrollbar-color:var(--twin-hairline)_transparent]">
          {tab==="filter"&&<CampusTree tree={tree} exp={exp} search={search} onToggle={k=>setExp(p=>{const n=new Set(p);n.has(k)?n.delete(k):n.add(k);return n;})} onOpenRoom={onOpenRoom} viewMode={viewMode} onOpenShelf={onOpenShelf}/>}
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
            {tab==="filter"&&<div className="flex items-center gap-1 rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-1">
              <button type="button" onClick={()=>setViewMode("room")} className={`rounded-twin-md px-2.5 py-1 text-[11px] font-semibold transition ${viewMode==="room"?"bg-[var(--twin-link-deep)] text-white shadow-sm":"text-[var(--twin-mute)] hover:text-[var(--twin-ink)]"}`}>全房间</button>
              <button type="button" onClick={()=>setViewMode("shelf")} className={`rounded-twin-md px-2.5 py-1 text-[11px] font-semibold transition ${viewMode==="shelf"?"bg-[var(--twin-link-deep)] text-white shadow-sm":"text-[var(--twin-mute)] hover:text-[var(--twin-ink)]"}`}>单笼架</button>
            </div>}
          </div>
          <div className="flex items-center gap-1">
            <a href={toAdminRoutePath("/admin/cage-shelves/special-status")} onClick={e=>{e.preventDefault();nav(toAdminRoutePath("/admin/cage-shelves/special-status"));}} className="rounded-twin-md px-2.5 py-1 text-[11px] font-semibold no-underline bg-[var(--twin-link-deep)] text-white hover:opacity-90 transition">特殊状态总览</a>
            <button type="button" onClick={()=>setLegend(v=>!v)} className={`flex items-center gap-1 rounded-twin-md px-2 py-1 text-[10px] transition ${legend?'bg-[var(--twin-link-deep)] text-white':'text-[var(--twin-mute)] hover:text-[var(--twin-ink)]'}`}><Info className="h-3 w-3"/>图例{legend?' ▲':' ▼'}</button>
          </div>
        </div>
        {legend&&<CageShelfLegend/>}
        </div>
        <div className="cage-scroll flex-1 min-h-0 overflow-y-auto space-y-2 [scrollbar-width:thin] [scrollbar-color:var(--twin-hairline)_transparent]">
        {tab==="filter"&&<>
          {/* ROOM MODE: all shelf grids */}
          {viewMode==="room"&&<>
            {!aRid&&<div className="rounded-twin-xl border border-dashed border-[var(--twin-hairline)] bg-[var(--twin-canvas)] h-full flex flex-col items-center justify-center text-center text-sm text-[var(--twin-mute)]"><LayoutGrid className="h-10 w-10 mx-auto mb-3 opacity-20"/>展开左侧目录，点击房间下的笼架<br/><span className="text-[11px]">点击笼架后加载该房间所有笼架详情</span></div>}
            {loading&&<div className="rounded-twin-xl border border-dashed border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4 text-center text-sm text-[var(--twin-mute)]">正在加载房间笼架（{details.length}）…</div>}
            {!loading&&aRid&&details.length===0&&<div className="rounded-twin-xl border border-amber-200/90 bg-amber-50/80 p-4 text-sm text-amber-900">当前房间暂无笼架数据</div>}
            {details.length>0&&<div className="grid grid-cols-1 xl:grid-cols-2 gap-3">{details.map((d,idx)=>{const sid=String(d.shelfMeta?.shelveId??""),isBm=sid!==""&&pinned.has(`${aRid}:${sid}`);
              return<div key={sid||idx} id={`shelf-${sid}`}><ShelfGrid title={d.shelfMeta?.shelveName??`笼架 ${idx+1}`} detail={d} loading={false} emptyHint="暂无笼架数据" isBookmarked={isBm} onToggleBookmark={sid!==""?()=>toggleBm(sid):undefined} onCellClick={c=>{setCell(c);setShelfId(sid);}}/></div>;
            })}</div>}
          </>}

          {/* SHELF MODE: left grid + right detail (like student page) */}
          {viewMode==="shelf"&&<div className="flex gap-3 min-h-0" style={{height:"calc(100vh - 190px)"}}>
            {/* Left: 8×10 grid */}
            <div className="w-1/2 flex flex-col min-w-0">
              {shelfLoading&&<div className="flex-1 rounded-twin-xl border border-dashed border-[var(--twin-hairline)] bg-[var(--twin-canvas)] grid place-items-center text-sm text-[var(--twin-mute)]">加载笼架…</div>}
              {!shelfLoading&&!shelfDetail&&<div className="flex-1 rounded-twin-xl border border-dashed border-[var(--twin-hairline)] bg-[var(--twin-canvas)] flex flex-col items-center justify-center text-sm text-[var(--twin-mute)]"><LayoutGrid className="h-10 w-10 mb-3 opacity-20"/>点击左侧笼架<br/><span className="text-[11px]">选中后显示该笼架 8×10 笼位</span></div>}
              {!shelfLoading&&shelfDetail&&<ShelfGrid title={shelfDetail.shelfMeta?.shelveName||"笼架"} detail={shelfDetail} loading={false} emptyHint="暂无数据" onCellClick={c=>{setCell(c);setShelfId(String(shelfDetail.shelfMeta?.shelveId??""));}}/>}
            </div>
            {/* Right: cell detail "预备画面" */}
            <div className="w-1/2 flex flex-col min-w-0">
              {!cell&&<div className="flex-1 rounded-twin-xl border border-dashed border-[var(--twin-hairline)] bg-[var(--twin-canvas)] flex flex-col items-center justify-center text-sm text-[var(--twin-mute)]">
                <div className="text-4xl mb-3 opacity-20">📋</div>笼盒详情预备画面<br/><span className="text-[11px]">点击左侧笼位格子显示笼盒信息</span>
              </div>}
              {cell&&<div className="flex-1 overflow-y-auto rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-3">
                <div className="mb-2 flex items-center justify-between"><div className="text-sm font-semibold text-[var(--twin-ink)]">笼盒详情 · 格位 {cell.position}</div><button type="button" className="text-xs text-[var(--twin-mute)] hover:text-[var(--twin-ink)]" onClick={()=>setCell(null)}>清除</button></div>
                <div className="grid grid-cols-2 gap-2 text-xs">{CAGE_BOX_INFO_FIELD_ORDER.map(k=>{const source=cell.cageBoxInfo??cell.detail??{};const v=source[k];const display=formatCageDetailValue(v);const qr=k==="CageBoxQrCode"&&v!=null&&String(v).trim()!==""?String(v).trim():"";
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
          {!bmLoading&&bmList.length>0&&<div className="grid grid-cols-1 xl:grid-cols-2 gap-3">{bmList.map(b=><BookmarkShelfGrid key={`${b.roomId}-${b.shelveId}`} roomId={String(b.roomId)} shelveId={String(b.shelveId)} title={b.shelveName&&String(b.shelveName)!==String(b.shelveId)?b.shelveName:(shelfNameMap.get(String(b.shelveId))||`笼架 ${b.shelveId}`)} campusName={b.campusName} roomName={b.roomName} isBookmarked={true} onToggleBookmark={()=>toggleBookmarkApi(String(b.roomId),String(b.shelveId)).then(r=>{if(!r.bookmarked){setPinned(p=>{const n=new Set(p);n.delete(`${b.roomId}:${b.shelveId}`);return n;});setBmList(l=>l.filter(x=>`${x.roomId}:${x.shelveId}`!==`${b.roomId}:${b.shelveId}`));}})} onCellClick={c=>{setCell(c);setShelfId(String(b.shelveId));}}/>)}</div>}
        </>}
      </div>
    </div>

    {cell&&viewMode!=="shelf"&&<Portal><div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={()=>{setCell(null);setShelfId(null);}}>
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
    </div>
  </AdminPageShell>;
}
