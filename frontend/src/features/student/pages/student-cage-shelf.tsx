import { useState, useMemo, useEffect } from "react";
import { LayoutGrid, RefreshCw, Hash, MapPin, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useStudentCageShelfFilterOptions,
  useStudentCageShelfDetail,
  useRefreshCageShelf,
} from "../hooks/use-student-cage-shelf";
import type { CageShelfCell } from "../api/student.api";
import {
  StudentCard,
  StudentSelect,
  StudentButton,
  Skeleton,
  EmptyState,
  ErrorRetry,
} from "../components/ui";
import { CellDetailPanel } from "./cage-shelf-detail-panel";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function cageTypeLabel(animalCageType?: number): string {
  if (animalCageType === 1) return "等待分配";
  if (animalCageType === 2) return "已预约(无笼盒)";
  if (animalCageType === 3) return "已预约(有笼盒)";
  return "未知";
}

function nonEmptyText(s?: string | null): boolean {
  return typeof s === "string" && s.trim() !== "";
}

function cageCardTone(cell: CageShelfCell): string {
  if (cell.empty)
    return "border-[var(--student-hairline)] bg-[var(--student-canvas-soft)] text-[var(--student-mute)]";
  if (cell.animalCageType === 1 || cell.stateLabel === "等待分配")
    return "border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-900";
  if (cell.animalCageType === 2 || cell.stateLabel === "已预约(无笼盒)")
    return "border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-900";
  if (cell.animalCageType === 3 || cell.stateLabel === "已预约(有笼盒)")
    return "border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-900";
  return "border-blue-200 bg-blue-50 hover:bg-blue-100 text-slate-700";
}

/* ------------------------------------------------------------------ */
/*  Loading skeleton                                                   */
/* ------------------------------------------------------------------ */

function CageShelfSkeleton() {
  return (
    <div className="p-6 bg-[var(--student-canvas-soft)] min-h-full">
      <div className="flex items-center justify-between mb-4">
        <Skeleton variant="rectangular" className="h-8 w-40" />
        <Skeleton variant="rectangular" className="h-8 w-24" />
      </div>
      <div className="flex items-center gap-3 mb-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} variant="rectangular" className="h-9 w-32" />
        ))}
      </div>
      <StudentCard variant="bordered" padding="md" className="mb-4">
        <Skeleton variant="rectangular" className="h-5 w-32 mb-3" />
        <div className="grid grid-cols-8 gap-1.5">
          {Array.from({ length: 80 }).map((_, i) => (
            <Skeleton key={i} variant="rectangular" className="min-h-[82px]" />
          ))}
        </div>
      </StudentCard>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Cascade Filter                                                     */
/* ------------------------------------------------------------------ */

interface CascadeSelections {
  campusId: string;
  areaId: string;
  floorId: string;
  roomId: string;
  shelveId: string;
}

const EMPTY_SELECTIONS: CascadeSelections = {
  campusId: "", areaId: "", floorId: "", roomId: "", shelveId: "",
};

const CASCADE_LS_KEY = "student-cage-shelf-cascade";

function loadCascadeSelections(): CascadeSelections {
  try {
    const raw = localStorage.getItem(CASCADE_LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        campusId: parsed.campusId ?? "",
        areaId: parsed.areaId ?? "",
        floorId: parsed.floorId ?? "",
        roomId: parsed.roomId ?? "",
        shelveId: parsed.shelveId ?? "",
      };
    }
  } catch { /* noop */ }
  return { ...EMPTY_SELECTIONS };
}

function saveCascadeSelections(s: CascadeSelections) {
  try { localStorage.setItem(CASCADE_LS_KEY, JSON.stringify(s)); } catch { /* noop */ }
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function StudentCageShelfPage() {
  const [selections, setSelections] = useState<CascadeSelections>(() => loadCascadeSelections());
  const [selectedCell, setSelectedCell] = useState<CageShelfCell | null>(null);

  const { data: filterOpts, isLoading: optsLoading, isError: optsError, refetch: refetchOpts } =
    useStudentCageShelfFilterOptions(
      selections.campusId && !isNaN(Number(selections.campusId))
        ? { campusId: Number(selections.campusId), areaId: selections.areaId || undefined, floorId: selections.floorId || undefined, roomId: selections.roomId || undefined }
        : {},
    );

  const { data: detail, isLoading: detailLoading, isError: detailError, refetch: refetchDetail } =
    useStudentCageShelfDetail(selections.shelveId || null);

  const refreshMutation = useRefreshCageShelf();

  /* ---- Auto-select first shelf ---- */
  useEffect(() => {
    const shelves = filterOpts?.shelves;
    if (selections.roomId && shelves && shelves.length > 0 && !selections.shelveId) {
      updateSelection("shelveId", shelves[0].shelveId);
    }
    if (selections.roomId && shelves && shelves.length === 0) {
      updateSelection("shelveId", "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterOpts?.shelves, selections.roomId, selections.shelveId]);

  /* ---- Auto-refresh on first access ---- */
  const [autoRefreshed, setAutoRefreshed] = useState(false);
  useEffect(() => {
    if (autoRefreshed) return;
    if (detail && detail.latestBatchId === null && !refreshMutation.isPending && selections.shelveId) {
      setAutoRefreshed(true);
      refreshMutation.mutate();
    }
  }, [detail, autoRefreshed, refreshMutation, selections.shelveId]);

  /* ---- Update cascade, clear downstream ---- */
  function updateSelection(key: keyof CascadeSelections, value: string) {
    setSelections((prev) => {
      const next: CascadeSelections = { ...prev };
      if (key === "campusId") { next.campusId = value; next.areaId = ""; next.floorId = ""; next.roomId = ""; next.shelveId = ""; }
      else if (key === "areaId") { next.areaId = value; next.floorId = ""; next.roomId = ""; next.shelveId = ""; }
      else if (key === "floorId") { next.floorId = value; next.roomId = ""; next.shelveId = ""; }
      else if (key === "roomId") { next.roomId = value; next.shelveId = ""; }
      else { next[key] = value; }
      saveCascadeSelections(next);
      return next;
    });
    setSelectedCell(null);
  }

  function resetSelections() {
    setSelections({ ...EMPTY_SELECTIONS });
    saveCascadeSelections({ ...EMPTY_SELECTIONS });
    setSelectedCell(null);
  }

  /* ---- Option lists ---- */
  const campusOptions = useMemo(() => (filterOpts?.campuses ?? []).map(c => ({ value: String(c.campusId), label: c.campusName })), [filterOpts?.campuses]);
  const areaOptions   = useMemo(() => (filterOpts?.areas ?? []).map(a => ({ value: a.areaId, label: a.areaName })), [filterOpts?.areas]);
  const floorOptions  = useMemo(() => (filterOpts?.floors ?? []).map(f => ({ value: f.floorId, label: f.floorName })), [filterOpts?.floors]);
  const roomOptions   = useMemo(() => (filterOpts?.rooms ?? []).map(r => ({ value: r.roomId, label: r.roomName })), [filterOpts?.rooms]);
  const shelfOptions  = useMemo(() => (filterOpts?.shelves ?? []).map(s => ({ value: s.shelveId, label: s.shelveName })), [filterOpts?.shelves]);

  const cells = detail?.grid ?? [];
  const gridMeta = detail?.shelfMeta;

  /* ---- Loading / Error ---- */
  if (optsLoading && !filterOpts) return <CageShelfSkeleton />;
  if (optsError) {
    return (
      <div className="flex items-center justify-center min-h-full bg-[var(--student-canvas-soft)]">
        <ErrorRetry message="加载笼架筛选选项失败，请检查网络后重试" onRetry={() => refetchOpts()} />
      </div>
    );
  }

  const showGrid = !!selections.shelveId && !detailError && !detailLoading && detail;

  return (
    <div className="flex flex-col h-full bg-[var(--student-canvas-soft)]">
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-6 pb-3 shrink-0">
        <h1 className="text-lg font-semibold text-[var(--student-ink)] inline-flex items-center gap-2">
          <LayoutGrid className="size-5 shrink-0 text-[var(--student-primary)]" />
          笼架信息
        </h1>
        <StudentButton variant="secondary" size="sm" onClick={() => refreshMutation.mutate()} disabled={refreshMutation.isPending}>
          <RefreshCw className={cn("size-4 mr-1", refreshMutation.isPending && "animate-spin")} />
          刷新数据
        </StudentButton>
      </div>

      {/* Cascade filter */}
      <div className="px-6 pb-3 shrink-0">
        <StudentCard variant="bordered" padding="md">
          <div className="flex flex-wrap items-end gap-3">
            <FilterSelect label="校区" placeholder="请选择" options={campusOptions} value={selections.campusId} onChange={e => updateSelection("campusId", e.target.value)} />
            <FilterSelect label="区域" placeholder={selections.campusId ? "请选择" : "先选校区"} options={areaOptions} value={selections.areaId} disabled={!selections.campusId} onChange={e => updateSelection("areaId", e.target.value)} />
            <FilterSelect label="楼层" placeholder={selections.areaId ? "请选择" : "先选区域"} options={floorOptions} value={selections.floorId} disabled={!selections.areaId} onChange={e => updateSelection("floorId", e.target.value)} />
            <FilterSelect label="房间" placeholder={selections.floorId ? "请选择" : "先选楼层"} options={roomOptions} value={selections.roomId} disabled={!selections.floorId} onChange={e => updateSelection("roomId", e.target.value)} />
            <FilterSelect label="笼架" placeholder={selections.roomId ? (shelfOptions.length > 0 ? "请选择笼架" : "无可用笼架") : "先选房间"} options={shelfOptions} value={selections.shelveId} disabled={!selections.roomId || shelfOptions.length === 0} onChange={e => updateSelection("shelveId", e.target.value)} className="min-w-[160px] max-w-[240px]" />
            {selections.campusId && (
              <div className="flex items-end pb-0.5">
                <button type="button" className="text-[11px] text-[var(--student-mute)] hover:text-[var(--student-primary)]" onClick={resetSelections}>重置</button>
              </div>
            )}
          </div>
        </StudentCard>
      </div>

      {/* Main content: grid (left, 50%) + detail panel (right, 50%) */}
      <div className="flex-1 flex gap-4 px-6 pb-6 min-h-0">
        {/* ---- Left: Grid (50%) ---- */}
        <div className="w-1/2 flex flex-col min-w-0">
          {!selections.shelveId ? (
            <EmptyState icon={Hash} title="请选择笼架" description="通过上方级联筛选选择校区→区域→楼层→房间→笼架后查看笼位" />
          ) : detailError ? (
            <StudentCard variant="bordered" padding="md"><ErrorRetry message="加载笼架详情失败" onRetry={() => refetchDetail()} /></StudentCard>
          ) : detailLoading ? (
            <GridSkeleton />
          ) : !detail ? (
            <StudentCard variant="bordered" padding="md"><EmptyState icon={Hash} title="暂无笼架数据" description="请尝试其他笼架或刷新" /></StudentCard>
          ) : (
            <StudentCard variant="bordered" padding="md" className="flex-1 flex flex-col min-h-0">
              {/* Meta bar */}
              <div className="mb-3 flex items-center justify-between shrink-0">
                <div className="text-sm font-semibold text-[var(--student-ink)]">{gridMeta?.shelveName || gridMeta?.shelveId || "笼架"}</div>
                {gridMeta && (
                  <div className="text-[11px] text-[var(--student-mute)]">
                    <span className="mr-2">已填 {detail.filledCells} / {detail.totalCells}</span>
                    {gridMeta.campusName} / {gridMeta.areaName} / {gridMeta.floorName} / {gridMeta.roomName}
                  </div>
                )}
              </div>
              {/* 8-column grid */}
              <div className="flex-1 overflow-auto min-h-0">
                <div className="grid grid-cols-8 gap-1.5">
                  {cells.map((cell) => {
                    const piName = nonEmptyText(cell.projectPiName) ? cell.projectPiName!.trim() : "";
                    return (
                      <button
                        key={cell.position}
                        type="button"
                        className={`min-h-[72px] rounded-[var(--student-radius-md)] border text-[10px] leading-tight transition ${selectedCell?.position === cell.position ? "ring-2 ring-[var(--student-primary)] ring-offset-1" : ""} ${cageCardTone(cell)}`}
                        onClick={() => setSelectedCell(cell)}
                        disabled={cell.empty}
                        title={cell.empty ? undefined : `${cell.position} · ${cageTypeLabel(cell.animalCageType)} · ${cell.stateLabel}`}
                      >
                        <div className="flex min-h-[66px] flex-col items-center justify-center gap-0.5 px-1 py-1 text-center">
                          <div className="w-full font-bold">{cell.position}</div>
                          {cell.empty ? (
                            <div className="text-[9px] text-[var(--student-mute)]">空位</div>
                          ) : (
                            <>
                              {cell.visible ? (
                                <>
                                  {nonEmptyText(cell.departmentName) && <div className="w-full truncate text-[9px] font-medium opacity-70">{cell.departmentName}</div>}
                                  {nonEmptyText(piName) && <div className="w-full truncate text-[11px] font-semibold text-[var(--student-ink)]">{piName}</div>}
                                </>
                              ) : (
                                <div className="text-[9px] text-[var(--student-mute)]">***</div>
                              )}
                              <div className="w-full text-[9px] opacity-70">{cageTypeLabel(cell.animalCageType)}</div>
                            </>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
              {/* Legend */}
              <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px] text-[var(--student-mute)] shrink-0">
                <LegendDot className="bg-[var(--student-canvas-soft)] border-[var(--student-hairline)]" label="空位" />
                <LegendDot className="bg-amber-50 border-amber-200" label="等待分配" />
                <LegendDot className="bg-rose-50 border-rose-200" label="已预约(无笼盒)" />
                <LegendDot className="bg-emerald-50 border-emerald-200" label="已预约(有笼盒)" />
                <LegendDot className="bg-blue-50 border-blue-200" label="其他" />
              </div>
            </StudentCard>
          )}
        </div>

        {/* ---- Right: Detail Panel (50%) ---- */}
        {showGrid && (
          <div className="w-1/2 flex flex-col min-h-0">
            <CellDetailPanel
              cell={selectedCell}
              gridMeta={gridMeta ?? null}
              shelveId={selections.shelveId}
              onClose={() => setSelectedCell(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tiny sub-components                                                */
/* ------------------------------------------------------------------ */

function FilterSelect({ label, placeholder, options, value, disabled, onChange, className }: {
  label: string; placeholder: string; options: { value: string; label: string }[];
  value: string; disabled?: boolean; onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void; className?: string;
}) {
  return (
    <div className={cn("min-w-[120px] max-w-[180px]", className)}>
      <label className="block text-[11px] text-[var(--student-mute)] mb-1">{label}</label>
      <StudentSelect placeholder={placeholder} options={options} value={value} disabled={disabled} onChange={onChange} />
    </div>
  );
}

function GridSkeleton() {
  return (
    <StudentCard variant="bordered" padding="md">
      <div className="flex items-center justify-between mb-3">
        <Skeleton variant="rectangular" className="h-5 w-40" />
        <Skeleton variant="rectangular" className="h-4 w-64" />
      </div>
      <div className="grid grid-cols-8 gap-1.5">
        {Array.from({ length: 80 }).map((_, i) => (
          <div key={i} className="min-h-[82px] rounded-[var(--student-radius-md)] border border-[var(--student-hairline)] animate-pulse bg-[var(--student-canvas-soft)]" />
        ))}
      </div>
    </StudentCard>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("size-2.5 rounded-sm border", className)} />
      {label}
    </span>
  );
}
