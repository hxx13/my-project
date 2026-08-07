import { useState, useMemo, useEffect, useRef } from "react";
import { LayoutGrid, Star, Search, PanelLeft, PanelLeftClose, Info, ClipboardList } from "lucide-react";
import { AdminFullWidthPage } from "@/components/ui/AdminFullWidthPage";
import { CageColorProvider } from "@/features/cage-shelf/components/CageColorContext";
import CageShelfLegend from "@/features/cage-shelf/components/CageShelfLegend";
import { ShelfGrid } from "@/features/cage-shelf/components/ShelfGrid";
import { CampusTree, buildTree } from "@/features/cage-shelf/components/CampusTree";
import { displayPosition } from "@/features/cage-shelf/constants";
import { fetchFullTree, fetchLocalShelfGridByShelveId, fetchMyClaims, fetchPoolCells, claimCage, cancelClaim, confirmClaim, releaseClaim, type CageShelfCell, type CageShelfTreeNode, type CageClaimItem, type PoolCell } from "@/api/domains/cageShelf.api";
import { fetchPinnedCageShelves, toggleCageShelfPin, type PinnedCageShelfDetail } from "../api/student.api";
import { CellDetailPanel } from "./cage-shelf-detail-panel";
import { useQuery } from "@tanstack/react-query";
import { createPortal } from "react-dom";

/* ================================================================== */
/*  Main Page — uses shared ShelfGrid / CampusTree / CellButton         */
/* ================================================================== */

export default function StudentCageShelfPage() {
  const [tab, setTab] = useState<"filter" | "bookmarks" | "claims">("filter");
  const [myClaims, setMyClaims] = useState<CageClaimItem[]>([]);
  const [claimsLoading, setClaimsLoading] = useState(false);

  const loadMyClaims = async () => { setClaimsLoading(true); try { setMyClaims(await fetchMyClaims()); } catch { setMyClaims([]); } finally { setClaimsLoading(false); } };
  useEffect(() => { if (tab === "claims") loadMyClaims(); }, [tab]);

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
  const [collapsed, setCollapsed] = useState(false);
  const [viewMode, setViewMode] = useState<"room" | "shelf">("room");
  const [search, setSearch] = useState("");
  const [legend, setLegend] = useState(false);

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

  const [aRid, setARid] = useState(""); const [aRname, setARname] = useState("");
  const [details, setDetails] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [cell, setCell] = useState<CageShelfCell | null>(null);
  const [shelfId, setShelfId] = useState<string | null>(null);

  // ── 申请模式 ──
  const [claimMode, setClaimMode] = useState(false);
  const [poolCells, setPoolCells] = useState<Map<number, PoolCell>>(new Map()); // animalCageId → PoolCell
  const [claimSubmitting, setClaimSubmitting] = useState(false);

  // 进入申请模式时，加载当前房间所有架子的池数据
  useEffect(() => {
    if (!claimMode || !aRid) { setPoolCells(new Map()); return; }
    const shelves = roomShelveMap.get(aRid) ?? [];
    if (shelves.length === 0) return;
    (async () => {
      const all: PoolCell[] = [];
      for (const s of shelves) {
        try {
          const row = fullTree.find(r => String(r.shelveId) === s.shelveId && String(r.roomId) === aRid);
          const idxId = row?.id;
          if (idxId) {
            const cells = await fetchPoolCells(idxId);
            all.push(...cells);
          } else {
            console.warn("[claim] fullTree row 缺少 id (shelfIndexId)，shelveId=", s.shelveId);
          }
        } catch { /* shelf may not be synced yet */ }
      }
      const m = new Map<number, PoolCell>();
      for (const c of all) m.set(c.animalCageId, c);
      setPoolCells(m);
    })();
  }, [claimMode, aRid, fullTree, roomShelveMap]);

  const handleClaimCell = async (cell: CageShelfCell) => {
    // 从 grid cell 提取 animalCageId（注意：后端 String.valueOf 导致 id 可能是字符串，须转数字）
    const raw = (cell as any).id ?? (cell as any).animalCageId;
    const animalCageId = raw != null ? Number(raw) : 0;
    if (!animalCageId || isNaN(animalCageId)) {
      console.warn("[claim] cell 无有效 animalCageId", cell);
      return;
    }
    if (!poolCells.has(animalCageId)) {
      // 不在池中：该笼位不可申请（只有 cageTypeCode=2 已预约空笼盒才在池中）
      alert("该笼位暂不可申请。\n\n仅「已预约(空笼盒)」状态的笼位可被申请。");
      return;
    }
    if (!window.confirm(`确认申请笼位 ${cell.position}？\n\n课题组：${cell.projectPiName || "-"}\n申请后将进入审批流程。`)) return;

    // find shelfIndexId
    const row = fullTree.find(r => String(r.shelveId) === shelfId && String(r.roomId) === aRid);
    const shelfIndexId = row?.id;
    if (!shelfIndexId) {
      alert("系统错误：未找到笼架索引ID，请联系管理员。");
      return;
    }

    setClaimSubmitting(true);
    try {
      await claimCage(animalCageId, shelfIndexId);
      alert("申请已提交！");
      setPoolCells(prev => { const n = new Map(prev); n.delete(animalCageId); return n; });
    } catch (e: any) {
      alert(e.message || "申请失败");
    } finally {
      setClaimSubmitting(false);
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
  }, [aRid, fullTree]);

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
  const onOpenShelf = async (shelveId: string, _overrideRoomId?: string) => { setShelfLoading(true); setShelfDetail(null); try { const d = await fetchLocalShelfGridByShelveId(shelveId); setShelfDetail(d); } catch { setShelfDetail(null); } finally { setShelfLoading(false); } };

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
            {tab === "filter" && <CampusTree tree={tree} exp={exp} search={search} onToggle={k => setExp(p => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; })} onOpenRoom={onOpenRoom} viewMode={viewMode} onOpenShelf={onOpenShelf} alertStatusesByShelf={new Map()} alertStatusesByRoom={new Map()} />}
            {tab === "bookmarks" && <>
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
        <div className="flex-1 min-w-0 grid grid-rows-[auto_1fr] h-full pr-1 overflow-hidden">
          <div className="shrink-0 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setCollapsed(v => !v)} className="shrink-0 rounded p-1 text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-text-primary)] hover:bg-[var(--app-color-surface-container)]" title={collapsed ? "展开侧栏" : "收起侧栏"}>
                  {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                </button>
                <div className="flex items-center gap-1 rounded-student-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-1">
                  <button onClick={() => setTab("bookmarks")} className={`flex items-center gap-1 rounded-student-sm px-2.5 py-1 text-[11px] font-semibold transition ${tab === "bookmarks" ? "bg-[var(--app-color-accent-hover)] text-white shadow-sm" : "text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-text-primary)]"}`}><Star className="h-3 w-3" />收藏</button>
                  <button onClick={() => setTab("filter")} className={`flex items-center gap-1 rounded-student-sm px-2.5 py-1 text-[11px] font-semibold transition ${tab === "filter" ? "bg-[var(--app-color-accent-hover)] text-white shadow-sm" : "text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-text-primary)]"}`}><LayoutGrid className="h-3 w-3" />筛选</button>
                  <button onClick={() => setTab("claims")} className={`flex items-center gap-1 rounded-student-sm px-2.5 py-1 text-[11px] font-semibold transition ${tab === "claims" ? "bg-[var(--app-color-accent-hover)] text-white shadow-sm" : "text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-text-primary)]"}`}><ClipboardList className="h-3 w-3" />我的申请</button>
                </div>
                {tab === "filter" && <div className="flex items-center gap-1 rounded-student-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-1">
                  <button onClick={() => setViewMode("room")} className={`rounded-student-sm px-2.5 py-1 text-[11px] font-semibold transition ${viewMode === "room" ? "bg-[var(--app-color-accent-hover)] text-white shadow-sm" : "text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-text-primary)]"}`}>全房间</button>
                  <button onClick={() => setViewMode("shelf")} className={`rounded-student-sm px-2.5 py-1 text-[11px] font-semibold transition ${viewMode === "shelf" ? "bg-[var(--app-color-accent-hover)] text-white shadow-sm" : "text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-text-primary)]"}`}>单笼架</button>
                </div>}
                {/* ── 申请模式按钮 ── */}
                {tab === "filter" && <button
                  onClick={() => { setClaimMode(v => !v); if (claimMode) setPoolCells(new Map()); }}
                  className={`rounded-student-sm px-2.5 py-1 text-[11px] font-semibold transition ${claimMode ? "bg-emerald-600 text-white shadow-sm" : "text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-text-primary)] border border-dashed border-[var(--app-color-border-default)]"}`}
                >{claimMode ? "申请中 ▾" : "📝 笼位申请"}</button>}
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setLegend(v => !v)} className={`flex items-center gap-1 rounded-student-sm px-2 py-1 text-[10px] transition ${legend ? "bg-[var(--app-color-accent-hover)] text-white" : "text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-text-primary)]"}`}><Info className="h-3 w-3" />图例{legend ? " ▲" : " ▼"}</button>
              </div>
            </div>
            {legend && <CageShelfLegend />}
          </div>

          <div className="cage-scroll flex-1 min-h-0 overflow-y-auto space-y-2">
            {tab === "filter" && <>
              {/* ROOM MODE */}
              {viewMode === "room" && <>
                {!aRid && <div className="rounded-student-lg border border-dashed border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] h-full flex flex-col items-center justify-center text-center text-sm text-[var(--app-color-text-tertiary)]"><LayoutGrid className="h-10 w-10 mx-auto mb-3 opacity-20" />展开左侧目录，点击房间下的笼架<br /><span className="text-[11px]">点击笼架后加载该房间所有笼架详情</span></div>}
                {loading && <div className="rounded-student-lg border border-dashed border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-4 text-center text-sm text-[var(--app-color-text-tertiary)]">正在加载房间笼架（{details.length}）…</div>}
                {!loading && aRid && details.length === 0 && <div className="rounded-student-lg border border-amber-200/90 bg-amber-50/80 p-4 text-sm text-amber-900">当前房间暂无笼架数据</div>}
                {details.length > 0 && <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">{details.map((d, idx) => {
                  const sid = String(d.shelfMeta?.shelveId ?? ""), isBm = sid !== "" && pinned.has(sid);
                  return <div key={sid || idx} id={`shelf-${sid}`}><ShelfGrid title={d.shelfMeta?.shelveName ?? `笼架 ${idx + 1}`} detail={d} loading={false} emptyHint="暂无笼架数据" isBookmarked={isBm} alertMap={new Map()} onToggleBookmark={sid !== "" ? () => toggleBm(sid) : undefined} claimMode={claimMode} poolCells={poolCells} onCellClick={(c: any) => { setShelfId(sid); if (claimMode) { handleClaimCell(c); return; } setCell(c); }} /></div>;
                })}</div>}
              </>}

              {/* SHELF MODE */}
              {viewMode === "shelf" && <div className="flex gap-3 h-full min-h-0">
                <div className="w-1/2 flex flex-col min-w-0">
                  {shelfLoading && <div className="flex-1 rounded-student-lg border border-dashed border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] grid place-items-center text-sm text-[var(--app-color-text-tertiary)]">加载笼架…</div>}
                  {!shelfLoading && !shelfDetail && <div className="flex-1 rounded-student-lg border border-dashed border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] flex flex-col items-center justify-center text-sm text-[var(--app-color-text-tertiary)]"><LayoutGrid className="h-10 w-10 mb-3 opacity-20" />点击左侧笼架<br /><span className="text-[11px]">选中后显示该笼架 8x10 笼位</span></div>}
                  {!shelfLoading && shelfDetail && <ShelfGrid title={shelfDetail.shelfMeta?.shelveName || "笼架"} detail={shelfDetail} loading={false} emptyHint="暂无数据" claimMode={claimMode} poolCells={poolCells} alertMap={new Map()} onCellClick={(c: any) => { setShelfId(String(shelfDetail.shelfMeta?.shelveId ?? "")); if (claimMode) { handleClaimCell(c); return; } setCell(c); }} />}
                </div>
                <div className="w-1/2 flex flex-col min-w-0">
                  {cell ? <CellDetailPanel cell={cell} gridMeta={shelfDetail?.shelfMeta ?? null} shelveId={shelfId ?? ""} onClose={() => setCell(null)} /> :
                    <div className="flex-1 rounded-student-lg border border-dashed border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] flex flex-col items-center justify-center text-sm text-[var(--app-color-text-tertiary)]"><div className="text-4xl mb-3 opacity-20">📋</div>笼盒详情预备画面<br /><span className="text-[11px]">点击左侧笼位格子显示笼盒信息</span></div>}
                </div>
              </div>}
            </>}

            {tab === "bookmarks" && <>
              {pinned.size === 0 && !bmLoading && <div className="rounded-student-lg border border-dashed border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] h-full flex flex-col items-center justify-center text-center text-sm text-[var(--app-color-text-tertiary)]"><Star className="h-10 w-10 mx-auto mb-3 opacity-20" />暂无收藏的笼架<br /><span className="text-[11px]">在筛选页面将笼架加入收藏后在此处查看</span></div>}
              {!bmLoading && bmList.length > 0 && <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">{bmList.map(b => {
                const sid = b.shelfMeta.shelveId;
                return <div key={sid}><ShelfGrid title={b.shelfMeta.shelveName || sid} detail={b} loading={false} emptyHint="暂无数据" isBookmarked={true} alertMap={new Map()} onToggleBookmark={() => toggleBm(sid)} claimMode={claimMode} poolCells={poolCells} onCellClick={(c: any) => { if (claimMode) { handleClaimCell(c); return; } setCell(c); setShelfId(sid); }} /></div>;
              })}</div>}
            </>}

            {tab === "claims" && <>
              {claimsLoading && <div className="rounded-student-lg border border-dashed border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] h-full flex items-center justify-center text-sm text-[var(--app-color-text-tertiary)]">加载中…</div>}
              {!claimsLoading && myClaims.length === 0 && <div className="rounded-student-lg border border-dashed border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] h-full flex flex-col items-center justify-center text-center text-sm text-[var(--app-color-text-tertiary)]"><ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-20" />暂无申请记录<br /><span className="text-[11px]">在筛选页面选择笼位后点击申请</span></div>}
              {!claimsLoading && myClaims.length > 0 && <div className="space-y-2">
                {myClaims.map(c => (
                  <div key={c.id} className="rounded-student-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-[var(--app-color-text-primary)]">笼位 #{c.animalCageId}</span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${CLAIM_STATUS_COLOR[c.claimStatus] || "text-[var(--app-color-text-tertiary)] bg-[var(--app-color-surface-hover)] border-[var(--app-color-border-default)]"}`}>{CLAIM_STATUS_LABEL[c.claimStatus] || c.claimStatus}</span>
                    </div>
                    <div className="text-[11px] text-[var(--app-color-text-tertiary)] space-y-0.5">
                      <div>申请时间：{c.createdAt?.substring(0, 16)?.replace("T", " ")}</div>
                      {c.note && <div>备注：{c.note}</div>}
                    </div>
                    <div className="flex gap-2 mt-2">
                      {(c.claimStatus === "pending_approval" || c.claimStatus === "locked") && (
                        <button onClick={async () => { try { await cancelClaim(c.id); loadMyClaims(); } catch (e: any) { alert(e.message); } }}
                          className="rounded-student-sm px-2.5 py-1 text-[10px] font-semibold border border-red-300 text-red-600 hover:bg-red-50">取消</button>
                      )}
                      {c.claimStatus === "locked" && (
                        <button onClick={async () => { try { await confirmClaim(c.id); loadMyClaims(); } catch (e: any) { alert(e.message); } }}
                          className="rounded-student-sm px-2.5 py-1 text-[10px] font-semibold bg-emerald-600 text-white hover:bg-emerald-700">确认到位</button>
                      )}
                      {c.claimStatus === "confirmed" && (
                        <button onClick={async () => { const reason = prompt("释放原因（可选）："); try { await releaseClaim(c.id, reason || undefined); loadMyClaims(); } catch (e: any) { alert(e.message); } }}
                          className="rounded-student-sm px-2.5 py-1 text-[10px] font-semibold border border-orange-300 text-orange-600 hover:bg-orange-50">释放</button>
                      )}
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
          <CellDetailPanel cell={cell} gridMeta={null} shelveId={shelfId ?? ""} onClose={() => { setCell(null); setShelfId(null); }} />
        </div>
      </div>, document.body)}
    </CageColorProvider>
  );
}
