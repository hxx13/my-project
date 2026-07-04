import { useState, useMemo, useEffect, memo } from "react";
import { LayoutGrid, RefreshCw, Hash, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useStudentCageShelfFilterOptions,
  useStudentCageShelfDetail,
  useRefreshCageShelf,
} from "../hooks/use-student-cage-shelf";
import type { CageShelfCell } from "../api/student.api";
import { fetchStudentSpecialStatusOverview, fetchPinnedCageShelves, toggleCageShelfPin } from "../api/student.api";
import {
  StudentCard,
  StudentSelect,
  StudentButton,
  Skeleton,
  EmptyState,
  ErrorRetry,
} from "../components/ui";
import { CellDetailPanel } from "./cage-shelf-detail-panel";
import CageCellOverlays, { getCellStatusDisplayLabel, getDominantStatusCode, useStatusStyle, CAGE_TYPE_LABEL } from "@/features/cage-shelf/components/CageCellOverlays";
import { formatSpecialStatusCodesForDisplay } from "@/utils/cageSpecialStatusLabels";
import CageShelfLegend from "@/features/cage-shelf/components/CageShelfLegend";
import SpecialStatusOverviewModal from "@/features/cage-shelf/components/SpecialStatusOverviewModal";
import { CageColorProvider } from "@/features/cage-shelf/components/CageColorContext";

/* ---- bookmarks: GET /student/cage-shelves/pinned + PUT .../pin ---- */

type ShelfTab = "bookmarks" | "filter";

type BookmarkEntry = { shelveId: string; shelveName: string; roomId: string; gridMeta: any; cells: CageShelfCell[]; filledCells: number; totalCells: number };

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function cageTypeLabel(animalCageType?: number): string {
  if (animalCageType === 1) return "等待分配";
  if (animalCageType === 2) return "已预约(空笼盒)";
  if (animalCageType === 3) return "已预约(饲养中)";
  return "未知";
}

function nonEmptyText(s?: string | null): boolean {
  return typeof s === "string" && s.trim() !== "";
}

function cageCardTone(cell: CageShelfCell): string {
  if (cell.empty)
    return "border-[var(--student-hairline)] bg-[var(--student-canvas-soft)] text-[var(--student-mute)]";
  return "border-2 text-slate-900 hover:brightness-95";
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
  return <CageColorProvider><StudentCageShelfInner /></CageColorProvider>;
}

const GridCellButton = memo(function GridCellButton({ cell, isSelected, onSelect }: {
  cell: CageShelfCell;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const dominant = getDominantStatusCode(cell.specialStatuses, cell.cageBoxInfo);
  const statusStyle = useStatusStyle(dominant);
  const piName = nonEmptyText(cell.projectPiName) ? cell.projectPiName!.trim() : "";
  const statusLabel = cell.empty || !cell.visible ? "" : getCellStatusDisplayLabel(cell.specialStatuses, cell.cageBoxInfo);

  const statusCodes = formatSpecialStatusCodesForDisplay(
    Array.isArray(cell.specialStatuses) ? cell.specialStatuses : undefined,
    cell.cageBoxInfo,
  );

  const tooltip = cell.empty ? undefined
    : `${cell.position} · ${CAGE_TYPE_LABEL[cell.animalCageType ?? 0] || cell.stateLabel}${statusCodes ? ` [${statusCodes}]` : ""}`;

  return (
    <button type="button"
      className={cn(
        "relative min-h-[72px] rounded-[var(--student-radius-md)] text-[10px] leading-tight transition",
        isSelected ? "ring-2 ring-[var(--student-primary)] ring-offset-1" : "",
        !cell.empty && cell.visible ? "ring-1 ring-[var(--student-primary)]/50 shadow-sm" : "",
        cageCardTone(cell),
      )}
      style={statusStyle}
      onClick={onSelect}
      disabled={cell.empty}
      title={tooltip}>
      {!cell.empty && <CageCellOverlays animalCageType={cell.animalCageType} compact />}
      <div className="flex min-h-[66px] flex-col items-center justify-center gap-0.5 px-1 py-1 text-center">
        <div className="w-full font-bold">{cell.position}</div>
        {cell.empty ? (
          <div className="text-[9px] text-[var(--student-mute)]">空位</div>
        ) : (
          <>
            {cell.visible ? (
              <>
                {nonEmptyText(piName) && <div className="w-full truncate text-[11px] font-semibold text-[var(--student-ink)]">{piName}</div>}
                {nonEmptyText(statusLabel) && <div className="w-full truncate text-[9px] font-medium text-[var(--student-body)] opacity-80">{statusLabel}</div>}
              </>
            ) : (
              <div className="text-[9px] text-[var(--student-mute)]">***</div>
            )}
            <div className="w-full truncate text-[9px] opacity-70">{CAGE_TYPE_LABEL[cell.animalCageType ?? 0] || cageTypeLabel(cell.animalCageType)}</div>
          </>
        )}
      </div>
    </button>
  );
});

function BookmarkCellButton({ cell, isSelected, onSelect }: { cell: CageShelfCell; isSelected: boolean; onSelect: () => void }) {
  const dominant = getDominantStatusCode(cell.specialStatuses, cell.cageBoxInfo);
  const statusStyle = useStatusStyle(dominant);
  const piName = nonEmptyText(cell.projectPiName) ? cell.projectPiName!.trim() : "";
  const statusLabel = cell.empty || !cell.visible ? "" : getCellStatusDisplayLabel(cell.specialStatuses, cell.cageBoxInfo);

  return (
    <button type="button"
      className={`relative min-h-[72px] rounded-[var(--student-radius-md)] text-[10px] leading-tight transition ${isSelected ? "ring-2 ring-[var(--student-primary)] ring-offset-1" : ""} ${cageCardTone(cell)}`}
      style={statusStyle}
      onClick={onSelect}
      disabled={cell.empty}
      title={cell.empty ? undefined : `${cell.position} · ${CAGE_TYPE_LABEL[cell.animalCageType ?? 0] || cell.stateLabel}`}>
      {!cell.empty && <CageCellOverlays animalCageType={cell.animalCageType} compact />}
      <div className="flex min-h-[66px] flex-col items-center justify-center gap-0.5 px-1 py-1 text-center">
        <div className="w-full font-bold">{cell.position}</div>
        {cell.empty ? (
          <div className="text-[9px] text-[var(--student-mute)]">空位</div>
        ) : (
          <>
            {cell.visible ? (
              <>
                {nonEmptyText(piName) && <div className="w-full truncate text-[11px] font-semibold text-[var(--student-ink)]">{piName}</div>}
                {nonEmptyText(statusLabel) && <div className="w-full truncate text-[9px] font-medium text-[var(--student-body)] opacity-80">{statusLabel}</div>}
              </>
            ) : (
              <div className="text-[9px] text-[var(--student-mute)]">***</div>
            )}
            <div className="w-full truncate text-[9px] opacity-70">{CAGE_TYPE_LABEL[cell.animalCageType ?? 0] || cageTypeLabel(cell.animalCageType)}</div>
          </>
        )}
      </div>
    </button>
  );
}

function StudentCageShelfInner() {
  const [selections, setSelections] = useState<CascadeSelections>(() => loadCascadeSelections());
  const [selectedCell, setSelectedCell] = useState<CageShelfCell | null>(null);
  const [activeTab, setActiveTab] = useState<ShelfTab>("filter");
  const [bookmarkDetails, setBookmarkDetails] = useState<BookmarkEntry[]>([]);
  const [bookmarkLoading, setBookmarkLoading] = useState(false);
  const [bookmarkRetryKey, setBookmarkRetryKey] = useState(0);
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [bookmarkShelveId, setBookmarkShelveId] = useState<string>(""); // selected shelf in bookmarks tab

  // 同步服务端收藏状态（筛选项 Tab 星标）
  useEffect(() => {
    let cancelled = false;
    void fetchPinnedCageShelves()
      .then((list) => {
        if (cancelled) return;
        const ids = list
          .map((d) => String(d.shelfMeta?.shelveId ?? ""))
          .filter((id) => id.length > 0);
        setPinnedIds(new Set(ids));
      })
      .catch(() => { /* 星标稍后随收藏 Tab 重试 */ });
    return () => { cancelled = true; };
  }, []);

  // Auto-select first bookmark on mount
  useEffect(() => {
    if (activeTab !== "bookmarks" || bookmarkShelveId) return;
    if (bookmarkDetails.length > 0) {
      setBookmarkShelveId(bookmarkDetails[0].shelveId);
    }
  }, [activeTab, bookmarkDetails, bookmarkShelveId]);

  const toggleBookmark = async (shelveId: string) => {
    try {
      const res = await toggleCageShelfPin(shelveId);
      setPinnedIds((prev) => {
        const next = new Set(prev);
        if (res.isPinned) next.add(shelveId);
        else next.delete(shelveId);
        return next;
      });
      if (!res.isPinned) {
        // 保存后仅合并当前行，禁止整表 load — post-save-no-full-refresh.mdc
        setBookmarkDetails((prev) => prev.filter((d) => d.shelveId !== shelveId));
        if (bookmarkShelveId === shelveId) setBookmarkShelveId("");
      } else if (activeTab === "bookmarks") {
        setBookmarkRetryKey((k) => k + 1);
      }
    } catch {
      /* 星标失败时保持原状态，由用户重试 */
    }
  };

  // GET /api/student/cage-shelves/pinned — 单次请求加载收藏列表
  useEffect(() => {
    if (activeTab !== "bookmarks") return;
    let cancelled = false;
    setBookmarkLoading(true);
    void fetchPinnedCageShelves()
      .then((list) => {
        if (cancelled) return;
        const results: BookmarkEntry[] = list.map((d) => ({
          shelveId: String(d.shelfMeta?.shelveId ?? ""),
          shelveName: d.shelfMeta?.shelveName || String(d.shelfMeta?.shelveId ?? ""),
          roomId: String(d.roomId ?? ""),
          gridMeta: d.shelfMeta,
          cells: d.grid ?? [],
          filledCells: d.filledCells ?? 0,
          totalCells: d.totalCells ?? 80,
        }));
        setBookmarkDetails(results);
        setPinnedIds(new Set(results.map((r) => r.shelveId).filter(Boolean)));
      })
      .catch(() => {
        if (!cancelled) setBookmarkDetails([]);
      })
      .finally(() => {
        if (!cancelled) setBookmarkLoading(false);
      });
    return () => { cancelled = true; };
  }, [activeTab, bookmarkRetryKey]);

  const { data: filterOpts, isLoading: optsLoading, isError: optsError, refetch: refetchOpts } =
    useStudentCageShelfFilterOptions(
      selections.campusId && !isNaN(Number(selections.campusId))
        ? { campusId: Number(selections.campusId), areaId: selections.areaId || undefined, floorId: selections.floorId || undefined, roomId: selections.roomId || undefined }
        : {},
    );

  const { data: detail, isLoading: detailLoading, isError: detailError, refetch: refetchDetail } =
    useStudentCageShelfDetail(selections.shelveId || null);

  // Bookmark shelf detail (separate from cascade filter's detail)
  const { data: bmDetail, isLoading: bmDetailLoading, isError: bmDetailError, refetch: refetchBmDetail } =
    useStudentCageShelfDetail(activeTab === "bookmarks" && bookmarkShelveId ? bookmarkShelveId : null);

  const refreshMutation = useRefreshCageShelf();

  // Unified: which detail to show
  const activeDetail = activeTab === "bookmarks" ? bmDetail : detail;
  const activeDetailLoading = activeTab === "bookmarks" ? bmDetailLoading : detailLoading;
  const activeDetailError = activeTab === "bookmarks" ? bmDetailError : detailError;
  const activeShelveId = activeTab === "bookmarks" ? bookmarkShelveId : selections.shelveId;

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

  const [overviewOpen, setOverviewOpen] = useState(false);

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
  const roomOptions   = useMemo(() => (filterOpts?.rooms ?? []).map(r => ({
    value: r.roomId,
    label: r.highlight ? `${r.roomName} · 本组` : r.roomName,
  })), [filterOpts?.rooms]);
  const shelfOptions  = useMemo(() => (filterOpts?.shelves ?? []).map(s => ({
    value: s.shelveId,
    label: s.shelveName,
    highlight: Boolean(s.highlight),
  })), [filterOpts?.shelves]);

  const cells = activeDetail?.grid ?? [];
  const gridMeta = activeDetail?.shelfMeta;

  const showGrid = !!activeShelveId && !activeDetailError && !activeDetailLoading && activeDetail;

  // Build bookmark shelf options for the dropdown
  const bookmarkShelfOptions = useMemo(() => {
    return bookmarkDetails.map((bm) => ({ value: bm.shelveId, label: bm.shelveName || bm.shelveId }));
  }, [bookmarkDetails]);

  /* ---- Loading / Error ---- */
  if (optsLoading && !filterOpts) return <CageShelfSkeleton />;
  if (optsError) {
    return (
      <div className="flex items-center justify-center min-h-full bg-[var(--student-canvas-soft)]">
        <ErrorRetry message="加载笼架筛选选项失败，请检查网络后重试" onRetry={() => refetchOpts()} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[var(--student-canvas-soft)]">
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-6 pb-3 shrink-0">
        <h1 className="text-lg font-semibold text-[var(--student-ink)] inline-flex items-center gap-2">
          <LayoutGrid className="size-5 shrink-0 text-[var(--student-primary)]" />
          笼架信息
        </h1>
        <div className="flex items-center gap-2">
          <StudentButton variant="secondary" size="sm" onClick={() => setOverviewOpen(true)}>
            特殊状态
          </StudentButton>
          <StudentButton variant="secondary" size="sm" onClick={() => refreshMutation.mutate()} disabled={refreshMutation.isPending}>
            <RefreshCw className={cn("size-4 mr-1", refreshMutation.isPending && "animate-spin")} />
            刷新数据
          </StudentButton>
        </div>
      </div>

      {/* ---- Tabs ---- */}
      <div className="px-6 pb-3 shrink-0">
        <div className="flex items-center gap-1 rounded-lg border border-[var(--student-border)] bg-white p-1">
          <button type="button" onClick={() => setActiveTab("bookmarks")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${activeTab === "bookmarks" ? "bg-[var(--student-primary)] text-white shadow-sm" : "text-[var(--student-mute)] hover:text-[var(--student-ink)]"}`}>
            <Star className="h-3.5 w-3.5" /> 收藏的笼架 {pinnedIds.size > 0 && <span className="rounded-full bg-white/20 px-1.5 text-[10px]">{pinnedIds.size}</span>}
          </button>
          <button type="button" onClick={() => setActiveTab("filter")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${activeTab === "filter" ? "bg-[var(--student-primary)] text-white shadow-sm" : "text-[var(--student-mute)] hover:text-[var(--student-ink)]"}`}>
            <LayoutGrid className="h-3.5 w-3.5" /> 笼架筛选
          </button>
        </div>
      </div>

      {/* ---- Bookmarks Tab ---- */}
      {activeTab === "bookmarks" && (
        <>
          {/* Shelf selector — horizontal tag buttons (same card style as filter tab) */}
          <div className="px-6 pb-3 shrink-0">
            <StudentCard variant="bordered" padding="md">
              {bookmarkLoading && (
                <div className="flex items-center gap-2 text-[11px] text-[var(--student-mute)]">
                  <RefreshCw className="size-3.5 animate-spin" /> 加载收藏…
                </div>
              )}
              {!bookmarkLoading && bookmarkShelfOptions.length === 0 && (
                <p className="text-[11px] text-[var(--student-mute)]">暂无收藏的笼架，切换到「笼架筛选」选择笼架后点击 ☆ 即可收藏</p>
              )}
              {!bookmarkLoading && bookmarkShelfOptions.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-medium text-[var(--student-mute)] shrink-0">收藏的笼架:</span>
                  {bookmarkShelfOptions.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => { setBookmarkShelveId(opt.value); setSelectedCell(null); }}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium transition border ${
                        bookmarkShelveId === opt.value
                          ? "bg-[var(--student-primary)] text-white border-[var(--student-primary)] shadow-sm"
                          : "bg-white text-[var(--student-body)] border-[var(--student-border)] hover:border-[var(--student-primary)] hover:text-[var(--student-primary)]"
                      }`}
                    >
                      <span className="flex items-center gap-1">
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                        {opt.label}
                      </span>
                    </button>
                  ))}
                  {bookmarkShelveId && (
                    <button type="button" className="text-[10px] text-[var(--student-mute)] hover:text-[var(--student-primary)] underline" onClick={() => setBookmarkShelveId("")}>清除</button>
                  )}
                </div>
              )}
            </StudentCard>
          </div>

          {/* Same left-right split as filter tab */}
          <div className="flex-1 flex gap-4 px-6 pb-6 min-h-0">
            <div className="w-1/2 flex flex-col min-w-0">
              {pinnedIds.size === 0 ? (
                <EmptyState icon={Star} title="暂无收藏" description="切换到「笼架筛选」选择笼架后，点击 ☆ 即可收藏" />
              ) : !bookmarkShelveId ? (
                <EmptyState icon={Star} title="请选择笼架" description="在上方标签中选择已收藏的笼架查看笼位" />
              ) : bmDetailError ? (
                <StudentCard variant="bordered" padding="md"><ErrorRetry message="加载笼架详情失败" onRetry={() => refetchBmDetail()} /></StudentCard>
              ) : bmDetailLoading ? (
                <GridSkeleton />
              ) : !bmDetail ? (
                <StudentCard variant="bordered" padding="md"><EmptyState icon={Hash} title="暂无笼架数据" description="请尝试其他笼架或刷新" /></StudentCard>
              ) : (
                <StudentCard variant="bordered" padding="md" className="flex-1 flex flex-col min-h-0">
                  <div className="mb-3 flex items-center justify-between shrink-0">
                    <div className="text-sm font-semibold text-[var(--student-ink)]">{bmDetail.shelfMeta?.shelveName || bookmarkShelveId || "笼架"}</div>
                    <div className="flex items-center gap-2">
                      {bmDetail.shelfMeta && (
                        <div className="text-[11px] text-[var(--student-mute)]">
                          <span className="mr-2">已填 {bmDetail.filledCells} / {bmDetail.totalCells}</span>
                          {bmDetail.shelfMeta.campusName} / {bmDetail.shelfMeta.roomName}
                        </div>
                      )}
                      <button type="button"
                        className={`shrink-0 p-0.5 rounded transition ${bookmarkShelveId && pinnedIds.has(bookmarkShelveId) ? "text-amber-500" : "text-slate-300 hover:text-amber-400"}`}
                        onClick={() => bookmarkShelveId && toggleBookmark(bookmarkShelveId)}
                        title={bookmarkShelveId && pinnedIds.has(bookmarkShelveId) ? "取消收藏" : "收藏此笼架"}>
                        <Star className={`h-4 w-4 ${bookmarkShelveId && pinnedIds.has(bookmarkShelveId) ? "fill-amber-500" : ""}`} />
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 overflow-auto min-h-0 content-start p-[3px]">
                    <div className="grid grid-cols-8 gap-1.5">
                      {cells.length > 0 ? cells.map((cell) => (
                        <GridCellButton
                          key={cell.position}
                          cell={cell}
                          isSelected={selectedCell?.position === cell.position}
                          onSelect={() => setSelectedCell(cell)}
                        />
                      )) : Array.from({ length: 80 }).map((_, i) => {
                        const y = Math.floor(i / 8) + 1;
                        const x = (i % 8) + 1;
                        const label = `${String.fromCharCode(64 + x)}-${y}`;
                        return (
                          <div key={label} className="relative min-h-[72px] rounded-[var(--student-radius-md)] border border-[var(--student-border)] bg-[var(--student-canvas-soft)] text-[10px] leading-tight flex flex-col items-center justify-center text-center px-1 py-1 text-[var(--student-mute)]">
                            <div className="w-full font-bold">{label}</div>
                            <div className="text-[9px]">空位</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </StudentCard>
              )}
            </div>

            {bookmarkShelveId && (
              <div className="w-1/2 flex flex-col min-h-0 gap-3">
                <div className="shrink-0 px-1"><CageShelfLegend /></div>
                <CellDetailPanel
                  cell={selectedCell}
                  gridMeta={bmDetail?.shelfMeta ?? null}
                  shelveId={bookmarkShelveId}
                  onClose={() => setSelectedCell(null)}
                />
              </div>
            )}
          </div>
        </>
      )}

      {/* ---- Filter Tab ---- */}
      {activeTab === "filter" && (
        <>
          <div className="px-6 pb-3 shrink-0">
            <StudentCard variant="bordered" padding="md">
              <div className="flex flex-wrap items-end gap-3">
                <FilterSelect label="校区" placeholder="请选择" options={campusOptions} value={selections.campusId} onChange={e => updateSelection("campusId", e.target.value)} />
                <FilterSelect label="区域" placeholder={selections.campusId ? "请选择" : "先选校区"} options={areaOptions} value={selections.areaId} disabled={!selections.campusId} onChange={e => updateSelection("areaId", e.target.value)} />
                <FilterSelect label="楼层" placeholder={selections.areaId ? "请选择" : "先选区域"} options={floorOptions} value={selections.floorId} disabled={!selections.areaId} onChange={e => updateSelection("floorId", e.target.value)} />
                <FilterSelect label="房间" placeholder={selections.floorId ? "请选择" : "先选楼层"} options={roomOptions} value={selections.roomId} disabled={!selections.floorId} onChange={e => updateSelection("roomId", e.target.value)} />
              </div>
              {selections.roomId && shelfOptions.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-[var(--student-border)]">
                  <span className="text-[11px] font-medium text-[var(--student-mute)] shrink-0">笼架</span>
                  {shelfOptions.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => updateSelection("shelveId", opt.value)}
                      className={cn(
                        "rounded-full px-3 py-1.5 text-xs font-medium transition border",
                        selections.shelveId === opt.value
                          ? "bg-[var(--student-primary)] text-white border-[var(--student-primary)] shadow-sm"
                          : opt.highlight
                            ? "bg-[var(--student-primary)]/10 text-[var(--student-primary)] border-[var(--student-primary)]/40 hover:border-[var(--student-primary)]"
                            : "bg-white text-[var(--student-body)] border-[var(--student-border)] hover:border-[var(--student-primary)] hover:text-[var(--student-primary)]",
                      )}
                    >
                      {opt.label}
                      {opt.highlight && selections.shelveId !== opt.value && (
                        <span className="ml-1 text-[9px] opacity-80">本组</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
              {selections.roomId && shelfOptions.length === 0 && (
                <p className="mt-3 pt-3 border-t border-[var(--student-border)] text-[11px] text-[var(--student-mute)]">该房间暂无可用笼架</p>
              )}
              {selections.campusId && (
                <div className="flex items-end pb-0.5 mt-2">
                  <button type="button" className="text-[11px] text-[var(--student-mute)] hover:text-[var(--student-primary)]" onClick={resetSelections}>重置</button>
                </div>
              )}
            </StudentCard>
          </div>

          <div className="flex-1 flex gap-4 px-6 pb-6 min-h-0">
            {/* ---- Left: Grid ---- */}
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
                  <div className="mb-3 flex items-center justify-between shrink-0">
                    <div className="text-sm font-semibold text-[var(--student-ink)]">{gridMeta?.shelveName || gridMeta?.shelveId || "笼架"}</div>
                    <div className="flex items-center gap-2">
                      {gridMeta && (
                        <div className="text-[11px] text-[var(--student-mute)]">
                          <span className="mr-2">已填 {detail.filledCells} / {detail.totalCells}</span>
                          {gridMeta.campusName} / {gridMeta.areaName} / {gridMeta.floorName} / {gridMeta.roomName}
                        </div>
                      )}
                      <button type="button"
                        className={`shrink-0 p-0.5 rounded transition ${selections.shelveId && pinnedIds.has(selections.shelveId) ? "text-amber-500" : "text-slate-300 hover:text-amber-400"}`}
                        onClick={() => selections.shelveId && toggleBookmark(selections.shelveId)}
                        title={selections.shelveId && pinnedIds.has(selections.shelveId) ? "取消收藏" : "收藏此笼架"}>
                        <Star className={`h-4 w-4 ${selections.shelveId && pinnedIds.has(selections.shelveId) ? "fill-amber-500" : ""}`} />
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 overflow-auto min-h-0 content-start p-[3px]">
                    <div className="grid grid-cols-8 gap-1.5">
                      {cells.length > 0 ? cells.map((cell) => (
                        <GridCellButton
                          key={cell.position}
                          cell={cell}
                          isSelected={selectedCell?.position === cell.position}
                          onSelect={() => setSelectedCell(cell)}
                        />
                      )) : Array.from({ length: 80 }).map((_, i) => {
                        const y = Math.floor(i / 8) + 1;
                        const x = (i % 8) + 1;
                        const label = `${String.fromCharCode(64 + x)}-${y}`;
                        return (
                          <div key={label} className="relative min-h-[72px] rounded-[var(--student-radius-md)] border border-[var(--student-border)] bg-[var(--student-canvas-soft)] text-[10px] leading-tight flex flex-col items-center justify-center text-center px-1 py-1 text-[var(--student-mute)]">
                            <div className="w-full font-bold">{label}</div>
                            <div className="text-[9px]">空位</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </StudentCard>
              )}
            </div>

            {/* ---- Right: Detail Panel ---- */}
            {showGrid && (
              <div className="w-1/2 flex flex-col min-h-0 gap-3">
                <div className="shrink-0 px-1"><CageShelfLegend /></div>
                <CellDetailPanel
                  cell={selectedCell}
                  gridMeta={gridMeta ?? null}
                  shelveId={selections.shelveId}
                  onClose={() => setSelectedCell(null)}
                />
              </div>
            )}
          </div>
        </>
      )}

      <SpecialStatusOverviewModal open={overviewOpen} onClose={() => setOverviewOpen(false)} apiFn={fetchStudentSpecialStatusOverview} variant="student" />
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
