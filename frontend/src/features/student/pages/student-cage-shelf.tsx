import { useState, useMemo, useEffect, useRef, memo } from "react";
import { LayoutGrid, Star, Search, ChevronDown, ChevronRight, PanelLeft, PanelLeftClose, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { CageColorProvider } from "@/features/cage-shelf/components/CageColorContext";
import CageCellOverlays, { CAGE_TYPE_LABEL, useStatusStyle, getDominantStatusCode } from "@/features/cage-shelf/components/CageCellOverlays";
import CageShelfLegend from "@/features/cage-shelf/components/CageShelfLegend";
import { fetchFullTree, type CageShelfTreeNode } from "@/api/domains/cageShelf.api";
import { fetchStudentCageShelfDetail, fetchPinnedCageShelves, toggleCageShelfPin, type CageShelfCell, type PinnedCageShelfDetail } from "../api/student.api";
import { CellDetailPanel } from "./cage-shelf-detail-panel";
import { useQuery } from "@tanstack/react-query";
import { createPortal } from "react-dom";

/* ================================================================== */
/*  Tree building (from AdminCageShelfPage)                              */
/* ================================================================== */

const CAMPUS_STYLES: Record<string, { bg: string; badge: string; text: string }> = {
  "浦东": { bg: "linear-gradient(135deg,#0284c7,#0369a1)", badge: "rgba(255,255,255,0.18)", text: "#fff" },
  "浦西": { bg: "linear-gradient(135deg,#d97706,#b45309)", badge: "rgba(255,255,255,0.18)", text: "#fff" },
};
const cs = (n: string) => CAMPUS_STYLES[n] ?? { bg: "#64748b", badge: "rgba(255,255,255,0.15)", text: "#fff" };

interface TreeNode {
  key: string; label: string; type: "campus" | "area" | "floor" | "room" | "shelf";
  children: TreeNode[];
  raw?: any;
}

function buildTree(rows: CageShelfTreeNode[]): TreeNode[] {
  const campusMap = new Map<string, TreeNode>();
  for (const r of rows) {
    const cid = String(r.campusId ?? ""); if (!cid) continue;
    if (!campusMap.has(cid)) { campusMap.set(cid, { key: `c:${cid}`, label: r.campusName, type: "campus", children: [], raw: r }); }
    const campus = campusMap.get(cid)!;
    const aid = String(r.areaId ?? "");
    let area = campus.children.find(a => a.key === `a:${aid}`);
    if (!area && aid) { area = { key: `a:${aid}`, label: r.areaName, type: "area", children: [], raw: r }; campus.children.push(area); }
    const fid = String(r.floorId ?? "");
    let floor = (area || campus).children.find(f => f.key === `f:${fid}`);
    if (!floor && fid) { floor = { key: `f:${fid}`, label: r.floorName, type: "floor", children: [], raw: r }; (area || campus).children.push(floor); }
    const rid = String(r.roomId ?? "");
    let room = (floor || area || campus).children.find(rm => rm.key === `r:${rid}`);
    if (!room && rid) { room = { key: `r:${rid}`, label: r.roomName, type: "room", children: [], raw: r }; (floor || area || campus).children.push(room); }
    if (room && r.shelveId) { room.children.push({ key: `s:${r.shelveId}`, label: r.shelveName || String(r.shelveId), type: "shelf", children: [], raw: r }); }
  }
  return Array.from(campusMap.values()).sort((a, b) => { const ai = ["浦东", "浦西"].indexOf(a.label); const bi = ["浦东", "浦西"].indexOf(b.label); if (ai >= 0 && bi >= 0) return ai - bi; if (ai >= 0) return -1; if (bi >= 0) return 1; return a.label.localeCompare(b.label); });
}

/* ================================================================== */
/*  CellButton + ShelfGrid (copied from AdminCageShelfPage)              */
/* ================================================================== */

const CellButton = memo(function CellButton({ cell, onClick }: { cell: any; onClick: (c: any) => void }) {
  const dominant = getDominantStatusCode(cell.specialStatuses, cell.cageBoxInfo);
  const style = useStatusStyle(dominant);
  const cls = cell.empty ? "relative min-h-[82px] rounded-twin-md text-[10px] leading-tight border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] text-[var(--twin-mute)]"
    : "relative min-h-[82px] rounded-twin-md text-[10px] leading-tight border-2 text-slate-900 hover:brightness-95";
  return <button type="button" className={cls} style={style} onClick={() => !cell.empty && onClick(cell)} disabled={cell.empty}>
    {!cell.empty && <CageCellOverlays animalCageType={cell.animalCageType} compact />}
    <div className="flex min-h-[76px] flex-col items-center justify-center gap-0.5 px-1 py-1 text-center">
      <div className="w-full font-bold">{cell.position}</div>
      {cell.empty ? <div className="text-[9px] text-[var(--twin-mute)]">空位</div> : <>
        {cell.projectGroup && <div className="w-full truncate">{cell.projectGroup}</div>}
        {(cell.projectPiName || cell.piName) && <div className="w-full truncate text-[11px] font-semibold text-[var(--twin-ink)]">{cell.projectPiName || cell.piName}</div>}
        <div className="w-full text-[9px] text-[var(--twin-mute)]">{CAGE_TYPE_LABEL[cell.animalCageType ?? 0] || cell.stateLabel}</div>
      </>}
    </div>
  </button>;
});

function ShelfGrid({ title, detail, loading, emptyHint, onCellClick, isBookmarked, onToggleBookmark }: {
  title: string; detail: any; loading: boolean; emptyHint?: string;
  onCellClick: (c: any) => void; isBookmarked?: boolean; onToggleBookmark?: () => void;
}) {
  const cells = detail?.grid ?? [];
  return <div className="rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-3 min-h-0 flex flex-col">
    <div className="mb-2 flex items-center justify-between shrink-0">
      <div className="text-sm font-semibold text-[var(--twin-ink)]">{title}</div>
      <div className="flex items-center gap-2">
        {detail?.shelfMeta && <div className="text-[11px] text-[var(--twin-mute)]">{detail.shelfMeta.campusName}/{detail.shelfMeta.areaName}/{detail.shelfMeta.floorName}/{detail.shelfMeta.roomName}/{detail.shelfMeta.shelveName || detail.shelfMeta.shelveId}</div>}
        {onToggleBookmark && <button type="button" className={`shrink-0 p-0.5 rounded transition ${isBookmarked ? "text-amber-500 hover:text-amber-600" : "text-slate-300 hover:text-amber-400"}`} onClick={onToggleBookmark} title={isBookmarked ? "取消收藏" : "收藏此笼架"}><Star className={`h-4 w-4 ${isBookmarked ? "fill-amber-500" : ""}`} /></button>}
      </div>
    </div>
    {loading ? <div className="flex-1 rounded-twin-lg border border-dashed text-xs text-[var(--twin-mute)] grid place-items-center">加载中...</div>
      : !detail || detail.totalCells === 0 ? <div className="flex-1 rounded-twin-lg border border-dashed text-xs text-[var(--twin-mute)] grid place-items-center px-2 text-center">{emptyHint ?? "暂无数据"}</div>
        : <div className="flex-1 min-h-0 overflow-y-auto content-start p-[3px]"><div className="grid grid-cols-8 gap-1.5">{cells.map((c: any) => <CellButton key={c.position} cell={c} onClick={onCellClick} />)}</div></div>}
  </div>;
}

/* ================================================================== */
/*  Bookmark Shelf Grid (copied from AdminCageShelfPage)                 */
/* ================================================================== */

/* ================================================================== */
/*  Tree rendering                                                      */
/* ================================================================== */

function CampusTree({ tree, exp, onToggle, onOpenRoom, viewMode, onOpenShelf }: {
  tree: TreeNode[]; exp: Set<string>; onToggle: (k: string) => void;
  onOpenRoom: (rid: string, rname: string) => void; viewMode: "room" | "shelf"; onOpenShelf: (sid: string) => void;
}) {
  return <div className="text-[11px] space-y-1.5">
    {tree.map(c => { const open = exp.has(c.key), sty = cs(c.label);
      return <div key={c.key}>
        <button onClick={() => onToggle(c.key)} className="w-full flex items-center gap-1.5 px-2.5 py-2 rounded-twin-lg text-left shadow-sm active:scale-[0.99] transition" style={{ background: sty.bg }}>
          {open ? <ChevronDown className="h-3.5 w-3.5 text-white/80" /> : <ChevronRight className="h-3.5 w-3.5 text-white/80" />}
          <span className="flex-1 truncate text-xs font-bold" style={{ color: sty.text }}>{c.label}校区</span>
        </button>
        {open && <div className="mt-1 ml-1 space-y-0.5">{c.children.map(n => renderTree(n, exp, onToggle, onOpenRoom, viewMode, onOpenShelf))}</div>}
      </div>;
    })}
    {tree.length === 0 && <div className="text-[var(--twin-mute)] py-6 text-center">暂无数据</div>}
  </div>;
}

function renderTree(n: TreeNode, exp: Set<string>, onToggle: (k: string) => void, onOpenRoom: (rid: string, rname: string) => void, viewMode: "room" | "shelf", onOpenShelf?: (sid: string) => void): any {
  const open = exp.has(n.key);
  if (n.type === "shelf") {
    const r = n.raw; const counts = [r.type3 || 0, r.type1 || 0, r.type4 || 0, r.type2 || 0];
    const colors = ["#f43f5e", "#f59e0b", "#3b82f6", "#10b981"];
    const total = counts.reduce((a: number, b: number) => a + b, 0) || 80;
    const bars = counts.map((c: number, i: number) => ({ pct: Math.round(c / total * 100), color: colors[i] })).filter((b: any) => b.pct > 0);
    const hasData = counts.some((c: number) => c > 0);
    const handleClick = () => {
      if (viewMode === "shelf" && onOpenShelf) { onOpenShelf(String(r.shelveId)); return; }
      onOpenRoom(r.roomId, r.roomName);
      setTimeout(() => document.getElementById(`shelf-${r.shelveId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
    };
    return <button key={n.key} onClick={handleClick} className="w-full text-left rounded-twin-sm border border-[var(--student-border)] bg-[var(--student-canvas)] px-2 py-1 hover:border-[var(--student-primary)] transition ml-2">
      <div className="flex items-center gap-1"><LayoutGrid className="h-2.5 w-2.5 shrink-0 text-[var(--twin-mute)]" /><span className="truncate text-[10px] font-medium text-[var(--student-ink)]">{n.label}</span></div>
      <div className="flex h-1 rounded-full overflow-hidden bg-[var(--student-canvas-soft)] mt-1">{hasData ? bars.map((b: any, i: number) => <div key={i} className="h-full min-w-[2px]" style={{ width: `${b.pct}%`, background: b.color }} />) : <div className="h-full w-full bg-[var(--student-canvas-soft)]" />}</div>
    </button>;
  }
  if (n.type === "room") {
    const shelfChildren = n.children.filter(c => c.type === "shelf");
    const aggCounts = shelfChildren.reduce((acc: number[], s) => { const r = s.raw; acc[0] += (r.type3 || 0); acc[1] += (r.type1 || 0); acc[2] += (r.type4 || 0); acc[3] += (r.type2 || 0); return acc; }, [0, 0, 0, 0]);
    const aggTotal = aggCounts.reduce((a: number, b: number) => a + b, 0) || (shelfChildren.length * 80);
    const colors = ["#f43f5e", "#f59e0b", "#3b82f6", "#10b981"];
    const aggBars = aggCounts.map((c: number, i: number) => ({ pct: Math.round((c / aggTotal) * 100), color: colors[i] })).filter((b: any) => b.pct > 0);
    const aggHasData = aggCounts.some((c: number) => c > 0);
    return <div key={n.key}>
      <button onClick={() => onToggle(n.key)} className="w-full text-left rounded-twin-md border border-[var(--student-border)] bg-[var(--student-canvas)] px-2.5 py-1.5 hover:border-[var(--student-primary)] transition">
        <div className="flex items-center gap-1.5">
          {open ? <ChevronDown className="h-3 w-3 text-[var(--twin-mute)]" /> : <ChevronRight className="h-3 w-3 text-[var(--twin-mute)]" />}
          <span className="flex-1 truncate text-xs font-medium text-[var(--student-ink)]">{n.label}</span>
          <span className="text-[10px] text-[var(--twin-mute)]">{shelfChildren.length}架</span>
        </div>
        {aggHasData && <div className="flex h-1 rounded-full overflow-hidden bg-[var(--student-canvas-soft)] mt-1.5">{aggBars.map((b: any, i: number) => <div key={i} className="h-full min-w-[2px]" style={{ width: `${b.pct}%`, background: b.color }} />)}</div>}
      </button>
      {open && n.children.length > 0 && <div className="flex flex-col gap-0.5 mt-1 ml-2">{n.children.map(s => renderTree(s, exp, onToggle, onOpenRoom, viewMode, onOpenShelf))}</div>}
    </div>;
  }
  return <div key={n.key}>
    <button onClick={() => onToggle(n.key)} className="w-full flex items-center gap-1 rounded-twin-sm px-1.5 py-1 hover:bg-[var(--student-canvas-soft)] transition">
      {open ? <ChevronDown className="h-3 w-3 text-[var(--twin-mute)]" /> : <ChevronRight className="h-3 w-3 text-[var(--twin-mute)]" />}
      <span className="truncate text-[11px]">{n.label}</span>
    </button>
    {open && <div className="ml-2 space-y-0.5">{n.children.map(c => renderTree(c, exp, onToggle, onOpenRoom, viewMode, onOpenShelf))}</div>}
  </div>;
}

/* ================================================================== */
/*  Main Page                                                            */
/* ================================================================== */

export default function StudentCageShelfPage() {
  const [tab, setTab] = useState<"filter" | "bookmarks">("filter");
  const [collapsed, setCollapsed] = useState(false);
  const [viewMode, setViewMode] = useState<"room" | "shelf">("room");
  const [search, setSearch] = useState("");
  const [legend, setLegend] = useState(false);

  // Tree
  const { data: fullTree = [] } = useQuery({ queryKey: ["cageShelfFullTree"], queryFn: fetchFullTree, staleTime: 10 * 60 * 1000 });
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

  const [aRid, setARid] = useState(""); const [aRname, setARname] = useState("");
  const [details, setDetails] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [cell, setCell] = useState<CageShelfCell | null>(null);
  const [shelfId, setShelfId] = useState<string | null>(null);

  useEffect(() => {
    if (!aRid) { setDetails([]); return; }
    const shelves = roomShelveMap.get(aRid) ?? [];
    if (shelves.length === 0) { setDetails([]); return; }
    let cancelled = false; setLoading(true);
    void (async () => {
      try {
        const results = await Promise.all(shelves.map(s => fetchStudentCageShelfDetail(s.shelveId).catch(() => null)));
        if (cancelled) return;
        setDetails(results.filter((r): r is any => r !== null));
        setLoading(false);
      } catch { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [aRid, roomShelveMap]);

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

  const onOpenRoom = (roomId: string, roomName: string) => { setARid(roomId); setARname(roomName); setShelfDetail(null); };
  const onOpenShelf = async (shelveId: string) => { setShelfLoading(true); setShelfDetail(null); try { const d = await fetchStudentCageShelfDetail(shelveId); setShelfDetail(d); } catch { setShelfDetail(null); } finally { setShelfLoading(false); } };

  // Cell detail modal
  const [cellModal, setCellModal] = useState(false);

  return (
    <CageColorProvider>
      <style>{`.cage-scroll::-webkit-scrollbar{width:4px;height:4px}.cage-scroll::-webkit-scrollbar-track{background:transparent}.cage-scroll::-webkit-scrollbar-thumb{background:var(--student-border);border-radius:4px}.cage-scroll::-webkit-scrollbar-thumb:hover{background:var(--student-mute)}`}</style>
      <div className="flex gap-2" style={{ height: "calc(100vh - 120px)" }}>
        {/* LEFT PANEL */}
        <div className={`shrink-0 flex-col gap-1.5 transition-all h-full ${collapsed ? 'hidden' : 'flex w-48 xl:w-52'}`}>
          {!collapsed && <div className="shrink-0 flex items-center gap-1 rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-1.5 py-1">
            <Search className="h-3.5 w-3.5 shrink-0 text-[var(--twin-mute)]" /><input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索…" className="flex-1 min-w-0 bg-transparent text-[11px] outline-none text-[var(--twin-ink)] placeholder:text-[var(--twin-mute)]" />
          </div>}
          {!collapsed && <div className="cage-scroll flex-1 min-h-0 overflow-y-auto overflow-x-hidden rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-1.5">
            {tab === "filter" && <CampusTree tree={tree} exp={exp} onToggle={k => setExp(p => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; })} onOpenRoom={onOpenRoom} viewMode={viewMode} onOpenShelf={onOpenShelf} />}
            {tab === "bookmarks" && <>
              {bmLoading && <div className="text-[var(--twin-mute)] py-4 text-center text-[11px]">加载中…</div>}
              {!bmLoading && bmList.length === 0 && <div className="text-[var(--twin-mute)] py-4 text-center text-[11px]">暂无收藏</div>}
              {!bmLoading && bmList.map(b => <button key={b.shelfMeta.shelveId} onClick={() => { setTab("filter"); onOpenRoom(String(b.roomId ?? ""), b.shelfMeta.roomName); }} className="w-full text-left rounded-[var(--student-radius-md)] border border-[var(--student-border)] bg-[var(--student-canvas)] px-2 py-1.5 mb-1 hover:border-[var(--student-primary)] transition">
                <div className="flex items-center gap-1"><Star className="h-2.5 w-2.5 shrink-0 fill-amber-400 text-amber-400" /><span className="truncate text-[11px] font-medium text-[var(--student-ink)]">{b.shelfMeta.shelveName}</span></div>
                <div className="text-[10px] text-[var(--twin-mute)] mt-0.5">{b.shelfMeta.campusName} · {b.shelfMeta.roomName}</div>
              </button>)}
            </>}
          </div>}
        </div>

        {/* RIGHT PANEL */}
        <div className="flex-1 min-w-0 flex flex-col h-full pr-1">
          <div className="shrink-0 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setCollapsed(v => !v)} className="shrink-0 rounded p-1 text-[var(--twin-mute)] hover:text-[var(--twin-ink)] hover:bg-[var(--twin-canvas)]" title={collapsed ? "展开侧栏" : "收起侧栏"}>
                  {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                </button>
                <div className="flex items-center gap-1 rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-1">
                  <button onClick={() => setTab("bookmarks")} className={`flex items-center gap-1 rounded-twin-md px-2.5 py-1 text-[11px] font-semibold transition ${tab === "bookmarks" ? "bg-[var(--twin-link-deep)] text-white shadow-sm" : "text-[var(--twin-mute)] hover:text-[var(--twin-ink)]"}`}><Star className="h-3 w-3" />收藏</button>
                  <button onClick={() => setTab("filter")} className={`flex items-center gap-1 rounded-twin-md px-2.5 py-1 text-[11px] font-semibold transition ${tab === "filter" ? "bg-[var(--twin-link-deep)] text-white shadow-sm" : "text-[var(--twin-mute)] hover:text-[var(--twin-ink)]"}`}><LayoutGrid className="h-3 w-3" />筛选</button>
                </div>
                {tab === "filter" && <div className="flex items-center gap-1 rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-1">
                  <button onClick={() => setViewMode("room")} className={`rounded-twin-md px-2.5 py-1 text-[11px] font-semibold transition ${viewMode === "room" ? "bg-[var(--twin-link-deep)] text-white shadow-sm" : "text-[var(--twin-mute)] hover:text-[var(--twin-ink)]"}`}>全房间</button>
                  <button onClick={() => setViewMode("shelf")} className={`rounded-twin-md px-2.5 py-1 text-[11px] font-semibold transition ${viewMode === "shelf" ? "bg-[var(--twin-link-deep)] text-white shadow-sm" : "text-[var(--twin-mute)] hover:text-[var(--twin-ink)]"}`}>单笼架</button>
                </div>}
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setLegend(v => !v)} className={`flex items-center gap-1 rounded-twin-md px-2 py-1 text-[10px] transition ${legend ? "bg-[var(--twin-link-deep)] text-white" : "text-[var(--twin-mute)] hover:text-[var(--twin-ink)]"}`}><Info className="h-3 w-3" />图例{legend ? " ▲" : " ▼"}</button>
              </div>
            </div>
            {legend && <CageShelfLegend />}
          </div>

          <div className="cage-scroll flex-1 min-h-0 overflow-y-auto space-y-2">
            {tab === "filter" && <>
              {/* ROOM MODE */}
              {viewMode === "room" && <>
                {!aRid && <div className="rounded-twin-xl border border-dashed border-[var(--twin-hairline)] bg-[var(--twin-canvas)] h-full flex flex-col items-center justify-center text-center text-sm text-[var(--twin-mute)]"><LayoutGrid className="h-10 w-10 mx-auto mb-3 opacity-20" />展开左侧目录，点击房间下的笼架<br /><span className="text-[11px]">点击笼架后加载该房间所有笼架详情</span></div>}
                {loading && <div className="rounded-twin-xl border border-dashed border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4 text-center text-sm text-[var(--twin-mute)]">正在加载房间笼架（{details.length}）…</div>}
                {!loading && aRid && details.length === 0 && <div className="rounded-twin-xl border border-amber-200/90 bg-amber-50/80 p-4 text-sm text-amber-900">当前房间暂无笼架数据</div>}
                {details.length > 0 && <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">{details.map((d, idx) => {
                  const sid = String(d.shelfMeta?.shelveId ?? ""), isBm = sid !== "" && pinned.has(sid);
                  return <div key={sid || idx} id={`shelf-${sid}`}><ShelfGrid title={d.shelfMeta?.shelveName ?? `笼架 ${idx + 1}`} detail={d} loading={false} emptyHint="暂无笼架数据" isBookmarked={isBm} onToggleBookmark={sid !== "" ? () => toggleBm(sid) : undefined} onCellClick={(c: any) => { setCell(c); setShelfId(sid); }} /></div>;
                })}</div>}
              </>}

              {/* SHELF MODE */}
              {viewMode === "shelf" && <div className="flex gap-3 min-h-0" style={{ height: "calc(100vh - 190px)" }}>
                <div className="w-1/2 flex flex-col min-w-0">
                  {shelfLoading && <div className="flex-1 rounded-twin-xl border border-dashed border-[var(--twin-hairline)] bg-[var(--twin-canvas)] grid place-items-center text-sm text-[var(--twin-mute)]">加载笼架…</div>}
                  {!shelfLoading && !shelfDetail && <div className="flex-1 rounded-twin-xl border border-dashed border-[var(--twin-hairline)] bg-[var(--twin-canvas)] flex flex-col items-center justify-center text-sm text-[var(--twin-mute)]"><LayoutGrid className="h-10 w-10 mb-3 opacity-20" />点击左侧笼架<br /><span className="text-[11px]">选中后显示该笼架 8x10 笼位</span></div>}
                  {!shelfLoading && shelfDetail && <ShelfGrid title={shelfDetail.shelfMeta?.shelveName || "笼架"} detail={shelfDetail} loading={false} emptyHint="暂无数据" onCellClick={(c: any) => { setCell(c); setShelfId(String(shelfDetail.shelfMeta?.shelveId ?? "")); }} />}
                </div>
                <div className="w-1/2 flex flex-col min-w-0">
                  {cell ? <CellDetailPanel cell={cell} gridMeta={shelfDetail?.shelfMeta ?? null} shelveId={shelfId ?? ""} onClose={() => setCell(null)} /> :
                    <div className="flex-1 rounded-twin-xl border border-dashed border-[var(--twin-hairline)] bg-[var(--twin-canvas)] flex flex-col items-center justify-center text-sm text-[var(--twin-mute)]"><div className="text-4xl mb-3 opacity-20">📋</div>笼盒详情预备画面<br /><span className="text-[11px]">点击左侧笼位格子显示笼盒信息</span></div>}
                </div>
              </div>}
            </>}

            {tab === "bookmarks" && <>
              {pinned.size === 0 && !bmLoading && <div className="rounded-twin-xl border border-dashed border-[var(--twin-hairline)] bg-[var(--twin-canvas)] h-full flex flex-col items-center justify-center text-center text-sm text-[var(--twin-mute)]"><Star className="h-10 w-10 mx-auto mb-3 opacity-20" />暂无收藏的笼架<br /><span className="text-[11px]">在筛选页面将笼架加入收藏后在此处查看</span></div>}
              {!bmLoading && bmList.length > 0 && <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">{bmList.map(b => {
                const sid = b.shelfMeta.shelveId;
                return <div key={sid}><ShelfGrid title={b.shelfMeta.shelveName || sid} detail={b} loading={false} emptyHint="暂无数据" isBookmarked={true} onToggleBookmark={() => toggleBm(sid)} onCellClick={(c: any) => { setCell(c); setShelfId(sid); }} /></div>;
              })}</div>}
            </>}
          </div>
        </div>
      </div>

      {cell && viewMode !== "shelf" && createPortal(<div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={() => { setCell(null); setShelfId(null); }}>
        <div className="w-full max-w-xl max-h-[85vh] overflow-y-auto rounded-twin-xl bg-[var(--twin-canvas)] p-4 shadow-twin-level-3" onClick={e => e.stopPropagation()}>
          <div className="mb-2 flex items-center justify-between"><div className="text-sm font-semibold text-[var(--twin-ink)]">笼盒详情 · 格位 {cell.position}</div><button className="text-xs text-[var(--twin-mute)] hover:text-[var(--twin-ink)]" onClick={() => { setCell(null); setShelfId(null); }}>关闭</button></div>
          <CellDetailPanel cell={cell} gridMeta={null} shelveId={shelfId ?? ""} onClose={() => { setCell(null); setShelfId(null); }} />
        </div>
      </div>, document.body)}
    </CageColorProvider>
  );
}
