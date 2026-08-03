import { useState, useCallback, useEffect, useRef } from "react";
import toast from "react-hot-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, RefreshCw, Loader2, Check, X } from "lucide-react";
import {
  fetchCellIndexSummary,
  fetchCellIndexByShelf,
  syncAllCellIds,
  updateCellAnimalCageId,
  type ShelfCellSummary,
  type CageCellIndexEntry,
  type CellSyncStats,
} from "@/api/domains/cageShelf.api";

const PAGE_SIZE = 20;

/** 单个笼位格子的编辑态 */
function CellEditor({
  cell,
  onSaved,
}: {
  cell: CageCellIndexEntry;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(cell.animalCageId != null ? String(cell.animalCageId) : "");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValue(cell.animalCageId != null ? String(cell.animalCageId) : "");
  }, [cell.animalCageId]);

  const save = async () => {
    const t = value.trim();
    const id = t ? Number(t) : null;
    if (t && (!Number.isFinite(id) || id! <= 0)) {
      toast.error("请输入有效的正整数ID");
      return;
    }
    setSaving(true);
    try {
      await updateCellAnimalCageId(cell.shelfIndexId, cell.positionX, cell.positionY, id as number | null);
      toast.success(`(${cell.positionX},${cell.positionY}) 已保存`);
      setEditing(false);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <button
        className="w-full text-left px-1.5 py-1 rounded text-xs font-mono hover:bg-[var(--twin-canvas-soft)]"
        style={{ color: cell.animalCageId ? "var(--twin-body)" : "var(--twin-mute)" }}
        onClick={() => { setEditing(true); }}
        title="点击编辑 animalCageId"
      >
        {cell.animalCageId ?? "—"}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <input
        ref={inputRef}
        autoFocus
        type="text"
        inputMode="numeric"
        className="w-full rounded border border-[var(--twin-hairline)] px-1.5 py-0.5 text-xs font-mono bg-[var(--twin-canvas)]"
        value={value}
        onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))}
        onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
      />
      <div className="flex gap-1">
        <button onClick={save} disabled={saving}
          className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--twin-primary)] text-[var(--twin-on-primary)]">
          {saving ? "…" : <Check size={10} />}
        </button>
        <button onClick={() => setEditing(false)}
          className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--twin-hairline)] text-[var(--twin-mute)]">
          <X size={10} />
        </button>
      </div>
    </div>
  );
}

/** 8×10 笼格网格 */
function CellGrid({
  shelfIndexId,
}: {
  shelfIndexId: number;
}) {
  const { data: cells = [], isLoading, refetch } = useQuery({
    queryKey: ["cageCellIndex", "cells", shelfIndexId],
    queryFn: () => fetchCellIndexByShelf(shelfIndexId),
    staleTime: 0, // 禁用缓存，每次展开都拉最新
  });

  // DEBUG: 每次查询都打印，确认不是缓存
  console.log(`[CellGrid-RAW] shelfIndexId=${shelfIndexId} loaded ${cells.length} cells, sample:`,
    cells.slice(0, 3).map(c => ({ x: c.positionX, y: c.positionY, id: c.animalCageId, status: c.lastSyncStatus })));

  if (isLoading) {
    return <div className="text-xs text-[var(--twin-mute)] py-4 text-center">加载笼位中…</div>;
  }

  // DEBUG: 打印 API 返回的前 5 条
  console.log(`[CellGrid] shelfIndexId=${shelfIndexId} total=${cells.length} first5=`, cells.slice(0, 5).map(c => `(${c.positionX},${c.positionY})=${c.animalCageId}`));

  // 统计唯一 ID 数
  const uniqueIds = new Set(cells.map(c => c.animalCageId).filter(Boolean));
  console.log(`[CellGrid] unique animalCageIds: ${uniqueIds.size} / ${cells.length} cells`);

  // Build 8×10 map: key = "y-x"
  const cellMap = new Map<string, CageCellIndexEntry>();
  for (const c of cells) {
    cellMap.set(`${c.positionY}-${c.positionX}`, c);
  }

  const rows: CageCellIndexEntry[][] = [];
  for (let y = 1; y <= 10; y++) {
    const row: CageCellIndexEntry[] = [];
    for (let x = 1; x <= 8; x++) {
      const key = `${y}-${x}`;
      row.push(cellMap.get(key) ?? {
        id: 0, shelfIndexId, shelveId: 0,
        positionX: x, positionY: y,
        animalCageId: null, hasCageBox: false,
        cageBoxCode: null, lastSyncStatus: "PENDING",
        lastSyncError: null, syncedAt: null,
      } as CageCellIndexEntry);
    }
    rows.push(row);
  }

  return (
    <div className="overflow-x-auto py-2">
      {/* Column headers */}
      <div className="flex items-center gap-px mb-px">
        <div className="w-6 shrink-0" />
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex-1 min-w-[4rem] text-center text-[10px] font-semibold text-[var(--twin-mute)]">
            X{i + 1}
          </div>
        ))}
      </div>
      {rows.map((row, ri) => (
        <div key={ri} className="flex items-center gap-px mb-px">
          <div className="w-6 shrink-0 text-center text-[10px] font-semibold text-[var(--twin-mute)]">
            Y{ri + 1}
          </div>
          {row.map((cell) => (
            <div
              key={`${cell.positionX}-${cell.positionY}`}
              className="flex-1 min-w-[4rem] border border-[var(--twin-hairline)] rounded"
              style={{
                backgroundColor: cell.hasCageBox
                  ? "var(--twin-primary)/8"
                  : cell.animalCageId
                    ? "var(--twin-canvas)"
                    : "var(--twin-canvas-soft)",
              }}
            >
              <CellEditor cell={cell} onSaved={() => refetch()} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** 单个架子行（可展开） */
function ShelfRow({
  row,
}: {
  row: ShelfCellSummary;
}) {
  const [expanded, setExpanded] = useState(false);
  const syncedPct = row.totalCells > 0 ? Math.round((row.syncedCells / row.totalCells) * 100) : 0;

  return (
    <>
      <tr
        className="hover:bg-[var(--twin-canvas-soft)] cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <td className="border-b border-[var(--twin-hairline)] px-3 py-2 align-top">
          <span className="inline-flex items-center gap-1">
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span className="text-xs font-mono">{row.shelveId}</span>
          </span>
        </td>
        <td className="border-b border-[var(--twin-hairline)] px-3 py-2 align-top text-xs">
          <div className="font-medium">{row.campusName}</div>
          <div className="text-[var(--twin-mute)]">{row.areaName} / {row.floorName} / {row.roomName}</div>
        </td>
        <td className="border-b border-[var(--twin-hairline)] px-3 py-2 align-top text-xs font-medium"
            title={row.shelveName}>
          {row.shelveName || `架子-${row.shelveId}`}
        </td>
        <td className="border-b border-[var(--twin-hairline)] px-3 py-2 align-top text-xs text-center">
          <div className="flex items-center gap-1.5 justify-center">
            {/* progress bar */}
            <div className="w-16 h-1.5 rounded-full bg-[var(--twin-canvas-soft)] overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${syncedPct}%`,
                  backgroundColor: syncedPct === 100 ? "var(--twin-success)" : "var(--twin-warning)",
                }}
              />
            </div>
            <span className="font-mono text-[10px]">{row.syncedCells}/{row.totalCells}</span>
          </div>
        </td>
        <td className="border-b border-[var(--twin-hairline)] px-3 py-2 align-top text-xs text-center">
          {row.boundCells > 0 ? (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-[var(--twin-primary)]/10 text-[var(--twin-link-deep)]">
              {row.boundCells}
            </span>
          ) : (
            <span className="text-[var(--twin-mute)]">0</span>
          )}
        </td>
        <td className="border-b border-[var(--twin-hairline)] px-3 py-2 align-top text-[10px] text-[var(--twin-mute)] whitespace-nowrap">
          {row.lastSyncedAt ? new Date(row.lastSyncedAt).toLocaleString() : "未同步"}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={6} className="border-b border-[var(--twin-hairline)] px-4 py-2 bg-[var(--twin-canvas-soft)]">
            <CellGrid shelfIndexId={row.shelfIndexId} />
          </td>
        </tr>
      )}
    </>
  );
}

/** 主视图 */
export default function CageCellIndexView() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [syncing, setSyncing] = useState(false);
  const [syncStats, setSyncStats] = useState<CellSyncStats | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["cageCellIndex", "summary", page],
    queryFn: () => fetchCellIndexSummary({ page, pageSize: PAGE_SIZE }),
    placeholderData: (prev) => prev,
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleSync = useCallback(async () => {
    setSyncing(true);
    setSyncStats(null);
    try {
      const stats = await syncAllCellIds();
      setSyncStats(stats);
      toast.success(`同步完成: ${stats.successShelves}/${stats.totalShelves} 架子, 写入 ${stats.totalCellsWritten} 个笼位`);
      // 暴力清缓存：先 remove 再 invalidate，确保所有展开的架子都重拉
      qc.removeQueries({ queryKey: ["cageCellIndex"] });
      await qc.invalidateQueries({ queryKey: ["cageCellIndex"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "同步失败");
    } finally {
      setSyncing(false);
    }
  }, [qc]);

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="text-sm">
          {total > 0 && (
            <span className="text-[var(--twin-mute)]">
              共 <strong className="text-[var(--twin-body)]">{total}</strong> 个架子
            </span>
          )}
        </div>
        <div className="flex gap-2 items-center">
          {syncStats && (
            <span className="text-xs text-[var(--twin-mute)]">
              上次同步: {syncStats.finishedAt} |
              成功 {syncStats.successShelves} 失败 {syncStats.failShelves}
              {syncStats.failures && syncStats.failures.length > 0 && (
                <span className="text-red-500 ml-1">
                  ({syncStats.failures.length} 个失败)
                </span>
              )}
            </span>
          )}
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-twin-sm bg-[var(--twin-primary)] px-4 py-2 text-sm font-medium text-[var(--twin-on-primary)] hover:opacity-90 disabled:opacity-50"
            disabled={syncing}
            onClick={handleSync}
          >
            {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {syncing ? "同步中…" : "从 ARO 同步全部笼位ID"}
          </button>
        </div>
      </div>

      {/* Failure detail */}
      {syncStats?.failures && syncStats.failures.length > 0 && (
        <div className="rounded-twin-sm border border-red-300/40 bg-red-50 px-4 py-3 text-xs text-red-900">
          <div className="font-semibold mb-1">同步失败的架子：</div>
          {syncStats.failures.slice(0, 10).map((f, i) => (
            <div key={i}>
              shelveId={f.shelveId}: {f.error}
            </div>
          ))}
          {syncStats.failures.length > 10 && (
            <div className="text-[var(--twin-mute)]">
              …及其他 {syncStats.failures.length - 10} 个
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div className="overflow-y-auto max-h-[calc(100dvh-var(--admin-chrome-offset)-12rem)]">
        <table className="w-full">
          <thead>
            <tr className="sticky top-0 z-[2] bg-[var(--twin-canvas)]">
              <th className="border-b-2 border-[var(--twin-hairline)] px-3 py-2 text-left text-xs font-semibold w-10">
                ID
              </th>
              <th className="border-b-2 border-[var(--twin-hairline)] px-3 py-2 text-left text-xs font-semibold">
                位置
              </th>
              <th className="border-b-2 border-[var(--twin-hairline)] px-3 py-2 text-left text-xs font-semibold">
                架子
              </th>
              <th className="border-b-2 border-[var(--twin-hairline)] px-3 py-2 text-center text-xs font-semibold w-28">
                笼位索引
              </th>
              <th className="border-b-2 border-[var(--twin-hairline)] px-3 py-2 text-center text-xs font-semibold w-16">
                绑盒
              </th>
              <th className="border-b-2 border-[var(--twin-hairline)] px-3 py-2 text-left text-xs font-semibold w-36">
                最后同步
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading && rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-8 text-xs text-[var(--twin-mute)]">
                  加载中…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-8 text-xs text-[var(--twin-mute)]">
                  暂无数据。请先点击「从 ARO 同步全部笼位ID」拉取笼位数据。
                </td>
              </tr>
            ) : (
              rows.map((row) => <ShelfRow key={row.shelfIndexId} row={row} />)
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > 0 && (
        <div className="flex items-center justify-end gap-3 text-xs text-[var(--twin-body)]">
          <button
            className="rounded-twin-sm border border-[var(--twin-hairline)] px-3 py-1 disabled:opacity-30"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            上一页
          </button>
          <span>{page} / {totalPages} 页，共 {total} 架</span>
          <button
            className="rounded-twin-sm border border-[var(--twin-hairline)] px-3 py-1 disabled:opacity-30"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
}
