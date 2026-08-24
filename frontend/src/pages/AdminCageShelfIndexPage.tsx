import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { ChevronDown, ChevronRight, Check, X } from "lucide-react";
import {
  fetchCageShelfFilterOptions,
  fetchCageShelfIndexes,
  fetchCellIndexByShelf,
  updateCellAnimalCageId,
  lookupAnimalCageId,
  type CageShelfIndexRow,
  type CageCellIndexEntry,
} from "@/api/domains/cageShelf.api";
import { authHttp } from "@/api/core/authHttp";
import { AdminFormCard, AdminPageShell } from "@/components/admin/AdminPageShell";

const PAGE_SIZE = 30;

function CellIdEditor({ cell, onSaved }: { cell: CageCellIndexEntry; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(cell.animalCageId != null ? String(cell.animalCageId) : "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const t = value.trim();
    const id = t || null;
    if (t && !/^\d+$/.test(t)) { toast.error("无效ID"); return; }
    setSaving(true);
    try { await updateCellAnimalCageId(cell.shelfIndexId, cell.positionX, cell.positionY, id); setEditing(false); onSaved(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "保存失败"); }
    finally { setSaving(false); }
  };

  if (!editing) return (
    <button className="w-full text-left px-1 py-0.5 rounded text-[11px] font-mono hover:bg-[var(--twin-canvas-soft)]"
      style={{ color: cell.animalCageId ? "var(--twin-body)" : "var(--twin-mute)" }}
      onClick={() => { setValue(cell.animalCageId != null ? String(cell.animalCageId) : ""); setEditing(true); }}>
      {cell.animalCageId ?? "—"}
    </button>
  );
  return (
    <div className="flex items-center gap-1">
      <input autoFocus type="text" inputMode="numeric"
        className="w-16 rounded border border-[var(--twin-hairline)] px-1 py-0 text-[11px] font-mono bg-[var(--twin-canvas)]"
        value={value} onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))}
        onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }} />
      <button onClick={save} disabled={saving} className="text-[10px] px-1 rounded bg-[var(--twin-primary)] text-[var(--twin-on-primary)]">{saving ? "…" : <Check size={10} />}</button>
      <button onClick={() => setEditing(false)} className="text-[10px] px-1 rounded border border-[var(--twin-hairline)]"><X size={10} /></button>
    </div>
  );
}

function CellGrid({ shelfIndexId }: { shelfIndexId: number }) {
  const { data: cells = [], isLoading, refetch } = useQuery({
    queryKey: ["cageCellIndex", "cells", shelfIndexId],
    queryFn: () => fetchCellIndexByShelf(shelfIndexId),
    staleTime: 5 * 60_000,
  });

  const cellMap = new Map<string, CageCellIndexEntry>();
  for (const c of cells) cellMap.set(`${c.positionY}-${c.positionX}`, c);

  // 固定 8×10 网格，API 数据到了自动填入
  const maxY = 10, maxX = 8;

  const rows: CageCellIndexEntry[][] = [];
  for (let y = 1; y <= maxY; y++) {
    const row: CageCellIndexEntry[] = [];
    for (let x = 1; x <= maxX; x++) {
      row.push(cellMap.get(`${y}-${x}`) ?? {
        id: 0, shelfIndexId, shelveId: "", positionX: x, positionY: y,
        animalCageId: null, hasCageBox: false, cageBoxCode: null,
        lastSyncStatus: isLoading ? "LOADING" : "PENDING", lastSyncError: null, syncedAt: null,
      } as CageCellIndexEntry);
    }
    rows.push(row);
  }

  return (
    <div className="overflow-x-auto py-1">
      <div className="flex items-center gap-px mb-px">
        <div className="w-5 shrink-0" />
        {Array.from({ length: maxX }, (_, i) => <div key={i} className="flex-1 min-w-[3.5rem] text-center text-[10px] font-semibold text-[var(--twin-mute)]">X{i + 1}</div>)}
      </div>
      {rows.map((row, ri) => (
        <div key={ri} className="flex items-center gap-px mb-px">
          <div className="w-5 shrink-0 text-center text-[10px] font-semibold text-[var(--twin-mute)]">Y{ri + 1}</div>
          {row.map((cell) => (
            <div key={`${cell.positionX}-${cell.positionY}`}
              className="flex-1 min-w-[3.5rem] border border-[var(--twin-hairline)] rounded"
              style={{ backgroundColor: cell.animalCageId ? "var(--twin-canvas)" : "var(--twin-canvas-soft)" }}>
              <CellIdEditor cell={cell} onSaved={() => refetch()} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export default function AdminCageShelfIndexPage() {
  const [campusId, setCampusId] = useState("");
  const [areaId, setAreaId] = useState(""); const [areaName, setAreaName] = useState("");
  const [floorId, setFloorId] = useState(""); const [floorName, setFloorName] = useState("");
  const [roomId, setRoomId] = useState(""); const [roomName, setRoomName] = useState("");
  const [searchText, setSearchText] = useState("");
  const [lookupId, setLookupId] = useState("");
  const [activeTab, setActiveTab] = useState<"index"|"outbox">("index");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (shelveId: string) => setExpanded(prev => { const n = new Set(prev); n.has(shelveId) ? n.delete(shelveId) : n.add(shelveId); return n; });

  const { data: options = { campuses: [], areas: [], floors: [], rooms: [], shelves: [] } } = useQuery({
    queryKey: ["cageShelfIndexFilterOptions", { campusId, areaId, areaName, floorId, floorName, roomId, roomName }],
    queryFn: () => fetchCageShelfFilterOptions({
      campusId: campusId ? Number(campusId) : undefined,
      areaId: areaId || undefined, areaName: areaName || undefined,
      floorId: floorId || undefined, floorName: floorName || undefined,
      roomId: roomId || undefined, roomName: roomName || undefined,
    }),
    placeholderData: (prev) => prev,
  });

  const kw = searchText.trim();
  const { data: indexData, isLoading } = useQuery({
    queryKey: ["cageShelfIndexes", { campusId, areaId, floorId, roomId, keyword: kw, page }],
    queryFn: () => fetchCageShelfIndexes({
      campusId: campusId ? Number(campusId) : undefined,
      areaId: areaId || undefined, floorId: floorId || undefined, roomId: roomId || undefined,
      keyword: kw || undefined,
      page, size: PAGE_SIZE,
    }),
    placeholderData: (prev) => prev,
  });

  const handleLookup = useCallback(async () => {
    const id = lookupId.trim();
    if (!/^\d+$/.test(id)) { toast.error("请输入有效的 animalCageId"); return; }
    try {
      const result = await lookupAnimalCageId(id);
      toast.success(`${result.campusName} / ${result.roomName} / ${result.shelveName} (${result.positionX},${result.positionY})`);
      // 自动展开对应架子
      setExpanded(prev => new Set(prev).add(String(result.shelveId)));
      // 跳到该 shelveId 所在页（需重新搜索定位）
      setSearchText(String(result.shelveId));
    } catch (e) { toast.error(e instanceof Error ? e.message : "未找到"); }
  }, [lookupId]);

  const rows: CageShelfIndexRow[] = (indexData?.rows || []) as CageShelfIndexRow[];
  const total = Number(indexData?.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <AdminPageShell>
      <div className="flex flex-col max-h-[calc(100dvh-var(--admin-chrome-offset))] min-h-[200px]">

        {/* ═══ 筛选 + 操作 — shrink-0 ═══ */}
        <AdminFormCard className="shrink-0 mb-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-[var(--twin-mute)] text-xs font-medium">校区</span>
            <select className="rounded-twin-md border border-[var(--twin-hairline-strong)] bg-[var(--twin-canvas)] px-2 py-1 text-sm"
              value={campusId} onChange={(e) => { setCampusId(e.target.value); setAreaId(""); setFloorId(""); setRoomId(""); setPage(1); }}>
              <option value="">全部</option>
              {options.campuses.map((c) => <option key={c.campusId} value={String(c.campusId)}>{c.campusName}</option>)}
            </select>
            {campusId && (<>
              <span className="text-[var(--twin-mute)]">→</span><span className="text-[var(--twin-mute)] text-xs font-medium">区域</span>
              <select className="rounded-twin-md border border-[var(--twin-hairline-strong)] bg-[var(--twin-canvas)] px-2 py-1 text-sm"
                value={areaId ? `${areaId}|${areaName}` : ""}
                onChange={(e) => { const [id, name] = e.target.value.split("|"); setAreaId(id); setAreaName(name || ""); setFloorId(""); setRoomId(""); setPage(1); }}>
                <option value="">全部</option>
                {options.areas.map((a) => <option key={`${a.areaId}-${a.areaName}`} value={`${a.areaId}|${a.areaName}`}>{a.areaName}</option>)}
              </select>
            </>)}
            {areaId && (<>
              <span className="text-[var(--twin-mute)]">→</span><span className="text-[var(--twin-mute)] text-xs font-medium">楼层</span>
              <select className="rounded-twin-md border border-[var(--twin-hairline-strong)] bg-[var(--twin-canvas)] px-2 py-1 text-sm"
                value={floorId ? `${floorId}|${floorName}` : ""}
                onChange={(e) => { const [id, name] = e.target.value.split("|"); setFloorId(id); setFloorName(name || ""); setRoomId(""); setPage(1); }}>
                <option value="">全部</option>
                {options.floors.map((f) => <option key={`${f.floorId}-${f.floorName}`} value={`${f.floorId}|${f.floorName}`}>{f.floorName}</option>)}
              </select>
            </>)}
            {floorId && (<>
              <span className="text-[var(--twin-mute)]">→</span><span className="text-[var(--twin-mute)] text-xs font-medium">房间</span>
              <select className="rounded-twin-md border border-[var(--twin-hairline-strong)] bg-[var(--twin-canvas)] px-2 py-1 text-sm"
                value={roomId ? `${roomId}|${roomName}` : ""}
                onChange={(e) => { const [id, name] = e.target.value.split("|"); setRoomId(id); setRoomName(name || ""); setPage(1); }}>
                <option value="">全部</option>
                {options.rooms.map((r) => <option key={`${r.roomId}-${r.roomName}`} value={`${r.roomId}|${r.roomName}`}>{r.roomName}</option>)}
              </select>
            </>)}
            <span className="text-[var(--twin-mute)] text-xs font-medium">搜索架子</span>
            <input type="text" placeholder="shelveId 或架子名"
              className="rounded-twin-md border border-[var(--twin-hairline-strong)] bg-[var(--twin-canvas)] px-2 py-1 text-sm w-44 font-mono"
              value={searchText} onChange={(e) => { setSearchText(e.target.value); setPage(1); }} />
            <span className="text-[var(--twin-mute)] text-xs font-medium">反查笼位</span>
            <input type="text" placeholder="animalCageId → 定位"
              className="rounded-twin-md border border-[var(--twin-hairline-strong)] bg-[var(--twin-canvas)] px-2 py-1 text-sm w-48 font-mono"
              value={lookupId} onChange={(e) => setLookupId(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleLookup(); }} />
            <button type="button"
              className="rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1 text-xs hover:bg-[var(--twin-canvas-soft)]"
              onClick={handleLookup}>定位</button>
          </div>
        </AdminFormCard>

        {/* Tab 切换 */}
        <div className="flex gap-0 shrink-0 border-b border-[var(--twin-hairline)] mb-1">
          {(["index","outbox"] as const).map(tab => (
            <button key={tab} type="button" onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-xs font-semibold border-b-2 transition ${
                activeTab===tab ? "border-[var(--twin-primary)] text-[var(--twin-link-deep)]" : "border-transparent text-[var(--twin-mute)] hover:text-[var(--twin-body)]"
              }`}>
              {tab==="index"?"笼架索引列表":"📮 投递同步日志"}
            </button>
          ))}
        </div>

        {activeTab==="outbox" && <OutboxLogPanel />}

        {activeTab==="index" && <>
        {/* ═══ 表格 — flex-1 min-h-0 overflow-y-auto（唯一滚动层） ═══ */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-[var(--twin-canvas-soft)] text-[var(--twin-body)] sticky top-0 z-[2]">
              <tr>
                <th className="px-2 py-1.5 text-left w-6"></th>
                <th className="px-2 py-1.5 text-left">校区</th>
                <th className="px-2 py-1.5 text-left">区域</th>
                <th className="px-2 py-1.5 text-left">楼层</th>
                <th className="px-2 py-1.5 text-left">房间</th>
                <th className="px-2 py-1.5 text-left">架子</th>
                <th className="px-2 py-1.5 text-left">更新时间</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="text-center py-8 text-[var(--twin-mute)]">加载中…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-[var(--twin-mute)]">暂无数据</td></tr>
              ) : (
                rows.map((r) => {
                  const isExpanded = expanded.has(r.shelveId);
                  const label = `${r.campusName} / ${r.areaName} / ${r.floorName} / ${r.roomName}`;
                  return (
                    <tr key={r.shelveId} className="border-t border-[var(--twin-hairline)] align-top">
                      <td className="px-2 py-1.5" colSpan={isExpanded ? 7 : 1}>
                        {isExpanded ? (
                          <div>
                            <div className="flex items-center cursor-pointer py-1" onClick={() => toggle(r.shelveId)}>
                              <ChevronDown size={14} />
                              <span className="ml-1 font-medium">{label} / <span className="text-[var(--twin-link-deep)]">{r.shelveName || r.shelveId}</span></span>
                            </div>
                            <CellGrid shelfIndexId={r.id} />
                          </div>
                        ) : null}
                      </td>
                      {!isExpanded && (
                        <>
                          <td className="px-2 py-1.5">{r.campusName}</td>
                          <td className="px-2 py-1.5">{r.areaName}</td>
                          <td className="px-2 py-1.5">{r.floorName}</td>
                          <td className="px-2 py-1.5">{r.roomName}</td>
                          <td className="px-2 py-1.5 cursor-pointer hover:text-[var(--twin-link-deep)]" onClick={() => toggle(r.shelveId)}>
                            <span className="inline-flex items-center gap-1"><ChevronRight size={12} />{r.shelveName || "—"}</span>
                          </td>
                          <td className="px-2 py-1.5 text-[var(--twin-mute)]">{r.updateTime || "—"}</td>
                        </>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ═══ 翻页 — shrink-0 ═══ */}
        <div className="shrink-0 flex items-center justify-between gap-3 px-1 py-2 border-t border-[var(--twin-hairline)] text-sm">
          <span className="text-xs text-[var(--twin-mute)]">共 {total} 条 · 每页 {PAGE_SIZE} 条</span>
          <div className="flex items-center gap-2">
            <button className="rounded-twin-sm border border-[var(--twin-hairline)] px-3 py-1 text-xs disabled:opacity-30"
              disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>上一页</button>
            <span className="text-xs text-[var(--twin-mute)]">{page} / {totalPages}</span>
            <button className="rounded-twin-sm border border-[var(--twin-hairline)] px-3 py-1 text-xs disabled:opacity-30"
              disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>下一页</button>
          </div>
        </div>

      </>}

      </div>
    </AdminPageShell>
  );
}

/** Outbox 投递日志面板 */
function OutboxLogPanel() {
  const { data } = useQuery({
    queryKey: ["outbox-stats"],
    queryFn: async () => {
      const r = await authHttp.get<any>("/cage-cell-index/outbox-stats");
      if (!r.data?.success) throw new Error(r.data?.message);
      return r.data.data!;
    },
    refetchInterval: 8_000,
  });
  const arr: Array<{status:string;cnt:number}> = Array.isArray(data?.stats) ? data.stats : [];
  const m: Record<string,number> = {};
  for (const s of arr) m[s.status] = s.cnt;
  const recent = data?.recent ?? [];

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="flex items-center gap-3 px-1 py-2 text-[11px]">
        <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-800">✅ 已投递 {m.delivered ?? 0}</span>
        <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">⏳ 待投递 {(m.pending??0)+(m.failed??0)}</span>
        {(m.dead??0)>0 && <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-800">💀 死信 {m.dead}</span>}
      </div>
      {recent.length===0 ? (
        <div className="text-xs text-[var(--twin-mute)] py-8 text-center">暂无投递记录</div>
      ) : (
        <table className="min-w-full text-[11px]">
          <thead><tr className="text-left text-[var(--twin-mute)] sticky top-0 bg-[var(--twin-canvas)]">
            <th className="pb-1 pr-3">时间</th><th className="pb-1 pr-3">操作</th><th className="pb-1 pr-3">调用ARO接口</th><th className="pb-1 pr-3">状态</th><th className="pb-1 pr-3">重试</th><th className="pb-1">错误</th>
          </tr></thead>
          <tbody>
            {recent.map((r:any) => (
              <tr key={r.id} className="border-t border-[var(--twin-hairline)]">
                <td className="py-1 pr-3 font-mono text-[10px] whitespace-nowrap">{r.createdAt?.substring(0,19)??"-"}</td>
                <td className="py-1 pr-3 text-[10px] max-w-[18rem] truncate" title={r.summary??""}>{r.summary??r.eventType??"-"}</td>
                <td className="py-1 pr-3 font-mono text-[10px] max-w-[14rem] truncate" title={r.aroUrl??r.aroEndpoint}>{r.aroUrl??r.aroEndpoint??"-"}</td>
                <td className="py-1 pr-3"><span className={`px-1 rounded text-[10px] ${r.status==="delivered"?"bg-green-100 text-green-800":r.status==="dead"?"bg-red-100 text-red-800":r.status==="failed"?"bg-amber-100 text-amber-800":"bg-slate-100 text-slate-600"}`}>{r.status}</span></td>
                <td className="py-1 pr-3 font-mono text-[10px]">{r.retryCount??0}/10</td>
                <td className="py-1 text-[10px] text-[var(--twin-mute)] max-w-[16rem] truncate" title={r.lastError??""}>{r.lastError??"-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** @deprecated */
function OutboxBadge() {
  const { data } = useQuery({
    queryKey: ["outbox-stats"],
    queryFn: async () => {
      const r = await authHttp.get<any>("/cage-cell-index/outbox-stats");
      if (!r.data?.success) throw new Error(r.data?.message);
      return r.data.data!;
    },
    refetchInterval: 10_000,
  });
  const arr: Array<{status:string;cnt:number}> = Array.isArray(data?.stats) ? data.stats : [];
  const m: Record<string,number> = {};
  for (const s of arr) m[s.status] = s.cnt;
  const pending = (m.pending ?? 0) + (m.failed ?? 0);
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px]">
      <span className="px-1.5 py-0.5 rounded-full bg-green-100 text-green-800">已投递 {m.delivered ?? 0}</span>
      {pending > 0 && <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800">待投递 {pending}</span>}
      {(m.dead ?? 0) > 0 && <span className="px-1.5 py-0.5 rounded-full bg-red-100 text-red-800">死信 {m.dead}</span>}
    </span>
  );
}
