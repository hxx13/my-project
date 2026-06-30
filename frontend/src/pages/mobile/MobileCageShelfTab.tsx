/** 手机版 — 笼架 Tab（列表 → 8×10 网格页 → 笼盒详情弹窗） */
import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { ChevronLeft, ChevronDown, ChevronRight, LayoutGrid, Loader2, Search, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CageShelfCell, CageShelfDetail } from "@/features/student/api/student.api";
import {
  fetchMobileCageShelfDetail,
  fetchMobileCageShelvesAll,
  type MobileCageShelfSummary,
} from "@/api/domains/mobileStudent.api";
import {
  fetchStudentMobileCageShelvesAll,
  fetchStudentMobileCageShelfDetail,
} from "@/api/domains/studentMobile.api";
import CageCellOverlays, {
  CAGE_TYPE_LABEL,
  getDominantStatusCode,
  useStatusStyle,
} from "@/features/cage-shelf/components/CageCellOverlays";
import CageShelfLegend from "@/features/cage-shelf/components/CageShelfLegend";
import { CageColorProvider } from "@/features/cage-shelf/components/CageColorContext";
import MobileCageCellDetailDialog from "./MobileCageCellDetailDialog";
import { buildPlaceholderGridCells } from "./mobileCageShelfGrid";

const PAGE_BG = "#eef0f6";
const BRAND = "#ac1736";

interface RoomShelfGroup {
  key: string;
  roomName: string;
  campusName: string;
  label: string;
  shelves: MobileCageShelfSummary[];
}

function buildRoomGroups(shelves: MobileCageShelfSummary[]): RoomShelfGroup[] {
  const map = new Map<string, RoomShelfGroup>();
  for (const s of shelves) {
    const roomName = s.roomName || "其他";
    const campusName = s.campusName || "";
    const key = `${campusName}::${roomName}`;
    const existing = map.get(key);
    if (existing) {
      existing.shelves.push(s);
    } else {
      map.set(key, {
        key,
        roomName,
        campusName,
        label: campusName ? `${roomName} · ${campusName}` : roomName,
        shelves: [s],
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, "zh-CN"));
}

function roomNameMatchesQuery(roomName: string, q: string): boolean {
  return roomName.toLowerCase().includes(q);
}

function nonEmptyText(s?: string | null): boolean {
  return typeof s === "string" && s.trim() !== "";
}

function cageTypeLabel(animalCageType?: number): string {
  if (animalCageType === 1) return "等待分配";
  if (animalCageType === 2) return "已预约(空笼盒)";
  if (animalCageType === 3) return "已预约(饲养中)";
  return "未知";
}

function cageCardTone(cell: CageShelfCell): string {
  if (cell.empty) {
    return "border-[var(--student-hairline)] bg-[var(--student-canvas-soft)] text-[var(--student-mute)]";
  }
  return "border-2 text-slate-900 active:brightness-95";
}

const GridCellButton = memo(function GridCellButton({
  cell,
  onSelect,
}: {
  cell: CageShelfCell;
  onSelect: () => void;
}) {
  const dominant = getDominantStatusCode(cell.specialStatuses, cell.cageBoxInfo);
  const statusStyle = useStatusStyle(dominant);
  const piName = nonEmptyText(cell.projectPiName) ? cell.projectPiName!.trim() : "";

  const statusCodes = (() => {
    const raw = cell.specialStatuses;
    if (!raw || (Array.isArray(raw) && raw.length === 0)) {
      const bi = cell.cageBoxInfo;
      if (!bi) return "";
      const parts: string[] = [];
      if (bi["ClosingDate"]) parts.push("合笼");
      if (bi["NeedFeedingYn"] === 1) parts.push("特殊饲养");
      if (bi["NeedDivideYn"] === 1) parts.push("请分笼");
      if (bi["AbnormalHealthYn"] === 1) parts.push("健康异常");
      if (bi["NeedTransferYn"] === 1) parts.push("动物转移");
      return parts.length > 0 ? parts.join("+") : "";
    }
    if (Array.isArray(raw)) {
      return raw.map((s) => s.code).filter((c) => c !== "NORMAL").join("+");
    }
    return "";
  })();

  const tooltip = cell.empty
    ? undefined
    : `${cell.position} · ${CAGE_TYPE_LABEL[cell.animalCageType ?? 0] || cell.stateLabel}${statusCodes ? ` [${statusCodes}]` : ""}`;

  if (cell.empty) {
    return (
      <div
        className="relative min-h-[48px] rounded-md border border-[var(--student-hairline)] bg-[var(--student-canvas-soft)] text-[9px] leading-tight flex flex-col items-center justify-center text-center px-0.5 py-1 text-[var(--student-mute)]"
        title={cell.position}
      >
        <div className="w-full font-bold text-[8px]">{cell.position}</div>
        <div className="text-[7px]">空位</div>
      </div>
    );
  }

  return (
    <button
      type="button"
      className={cn(
        "relative min-h-[48px] rounded-md text-[9px] leading-tight transition",
        !cell.empty && cell.visible ? "ring-1 ring-[var(--student-primary)]/50" : "",
        cageCardTone(cell),
      )}
      style={statusStyle}
      onClick={onSelect}
      title={tooltip}
    >
      <CageCellOverlays animalCageType={cell.animalCageType} compact />
      <div className="flex min-h-[44px] flex-col items-center justify-center gap-0.5 px-0.5 py-0.5 text-center">
        <div className="w-full font-bold text-[8px]">{cell.position}</div>
        {cell.visible ? (
          <>
            {nonEmptyText(cell.departmentName) && (
              <div className="w-full truncate text-[7px] font-medium opacity-70">{cell.departmentName}</div>
            )}
            {nonEmptyText(piName) && (
              <div className="w-full truncate text-[8px] font-semibold text-[var(--student-ink)]">{piName}</div>
            )}
          </>
        ) : (
          <div className="text-[7px] text-[var(--student-mute)]">***</div>
        )}
        <div className="w-full text-[7px] opacity-70 truncate">
          {CAGE_TYPE_LABEL[cell.animalCageType ?? 0] || cageTypeLabel(cell.animalCageType)}
        </div>
      </div>
    </button>
  );
});

function CageShelfListView({
  loading,
  error,
  shelves,
  onRetry,
  onOpenShelf,
}: {
  loading: boolean;
  error: string | null;
  shelves: MobileCageShelfSummary[];
  onRetry: () => void;
  onOpenShelf: (shelf: MobileCageShelfSummary) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [roomFilter, setRoomFilter] = useState("");
  const [expandedRooms, setExpandedRooms] = useState<Record<string, boolean>>({});

  const allRoomGroups = useMemo(() => buildRoomGroups(shelves), [shelves]);

  const roomFilterOptions = useMemo(
    () =>
      allRoomGroups.map((g) => ({
        value: g.key,
        label: g.label,
      })),
    [allRoomGroups],
  );

  const filteredShelves = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return shelves.filter((s) => {
      if (roomFilter) {
        const roomName = s.roomName || "其他";
        const campusName = s.campusName || "";
        const key = `${campusName}::${roomName}`;
        if (key !== roomFilter) return false;
      }
      if (!q) return true;
      const roomName = s.roomName || "其他";
      return roomNameMatchesQuery(roomName, q);
    });
  }, [shelves, searchQuery, roomFilter]);

  const visibleGroups = useMemo(() => buildRoomGroups(filteredShelves), [filteredShelves]);

  useEffect(() => {
    if (!roomFilter) return;
    setExpandedRooms((prev) => ({ ...prev, [roomFilter]: true }));
  }, [roomFilter]);

  useEffect(() => {
    if (searchQuery.trim()) return;
    setExpandedRooms({});
  }, [searchQuery]);

  const toggleRoom = (key: string) => {
    setExpandedRooms((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const collapseAllRooms = () => {
    setExpandedRooms({});
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="size-6 animate-spin" style={{ color: "#94a3b8" }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 px-6">
        <WifiOff className="size-10" style={{ color: "#c8c9cc" }} />
        <p className="text-xs text-center" style={{ color: "#969799" }}>{error}</p>
        <button
          type="button"
          onClick={onRetry}
          className="px-5 py-2 rounded-full text-white text-sm font-medium"
          style={{ background: `linear-gradient(135deg, ${BRAND}, #8B1229)` }}
        >
          重新加载
        </button>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto" style={{ background: PAGE_BG }}>
      <div className="sticky top-0 z-10 px-3 pt-2 pb-2 space-y-2" style={{ background: PAGE_BG }}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-medium" style={{ color: "#64748b" }}>
            共 {shelves.length} 个笼架
          </span>
          {filteredShelves.length !== shelves.length && (
            <span className="text-[10px]" style={{ color: "#94a3b8" }}>
              筛选 {filteredShelves.length} 个
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div
            className="flex flex-1 min-w-0 items-center gap-2 rounded-xl px-3 py-2"
            style={{
              background: "rgba(255,255,255,0.92)",
              border: "1px solid rgba(30,55,90,0.08)",
              boxShadow: "0 1px 4px rgba(15,23,42,0.04)",
            }}
          >
            <Search className="size-4 shrink-0" style={{ color: "#94a3b8" }} />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索房间名称…"
              className="flex-1 min-w-0 text-[13px] bg-transparent outline-none"
              style={{ color: "#323233" }}
            />
          </div>
          <button
            type="button"
            onClick={collapseAllRooms}
            className="shrink-0 px-2.5 py-2 rounded-xl text-[11px] font-medium whitespace-nowrap"
            style={{
              color: "#646566",
              background: "rgba(255,255,255,0.92)",
              border: "1px solid rgba(30,55,90,0.08)",
              boxShadow: "0 1px 4px rgba(15,23,42,0.04)",
            }}
          >
            收起全部
          </button>
        </div>

        <select
          value={roomFilter}
          onChange={(e) => setRoomFilter(e.target.value)}
          className="w-full rounded-xl px-3 py-2.5 text-[13px] outline-none appearance-none"
          style={{
            color: "#323233",
            background: "rgba(255,255,255,0.92)",
            border: "1px solid rgba(30,55,90,0.08)",
            boxShadow: "0 1px 4px rgba(15,23,42,0.04)",
          }}
        >
          <option value="">全部房间</option>
          {roomFilterOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      <div className="px-3 pt-1 pb-4">
        {shelves.length === 0 ? (
          <div className="py-16 text-center">
            <LayoutGrid className="size-10 mx-auto mb-2" style={{ color: "#c8c9cc" }} />
            <p className="text-xs" style={{ color: "#969799" }}>暂无笼架数据</p>
          </div>
        ) : filteredShelves.length === 0 ? (
          <div className="py-16 text-center">
            <Search className="size-10 mx-auto mb-2" style={{ color: "#c8c9cc" }} />
            <p className="text-xs" style={{ color: "#969799" }}>没有匹配的房间</p>
            <button
              type="button"
              className="mt-3 text-[12px] font-medium"
              style={{ color: BRAND }}
              onClick={() => {
                setSearchQuery("");
                setRoomFilter("");
              }}
            >
              清除筛选
            </button>
          </div>
        ) : (
          visibleGroups.map((group) => {
            const expanded = expandedRooms[group.key] === true;
            const hasOwnGroup = group.shelves.some((s) => s.highlight);
            return (
              <div key={group.key} className="mb-2">
                <button
                  type="button"
                  onClick={() => toggleRoom(group.key)}
                  className="w-full flex items-center justify-between gap-2 px-2 py-2.5 rounded-xl mb-1.5 active:scale-[0.99] transition-transform"
                  style={{
                    background: hasOwnGroup ? "rgba(172, 23, 54, 0.06)" : "rgba(255,255,255,0.75)",
                    border: hasOwnGroup ? `1px solid rgba(172, 23, 54, 0.22)` : "1px solid rgba(30,55,90,0.06)",
                  }}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    {expanded ? (
                      <ChevronDown className="size-4 shrink-0" style={{ color: hasOwnGroup ? BRAND : "#969799" }} />
                    ) : (
                      <ChevronRight className="size-4 shrink-0" style={{ color: hasOwnGroup ? BRAND : "#969799" }} />
                    )}
                    <span
                      className="text-[12px] font-semibold truncate"
                      style={{ color: hasOwnGroup ? BRAND : "#323233" }}
                    >
                      {group.label}
                      {hasOwnGroup && (
                        <span className="ml-1.5 text-[10px] font-medium opacity-80">本组</span>
                      )}
                    </span>
                  </div>
                  <span
                    className="text-[10px] shrink-0 px-1.5 py-0.5 rounded-full"
                    style={{ color: "#969799", background: "#f2f3f5" }}
                  >
                    {group.shelves.length} 架
                  </span>
                </button>

                {expanded && (
                  <div className="grid grid-cols-2 gap-2 pl-1">
                    {group.shelves.map((s) => (
                      <button
                        key={s.shelveId}
                        type="button"
                        onClick={() => onOpenShelf(s)}
                        className="rounded-xl px-3 py-3 text-left flex items-center gap-2.5 active:scale-[0.98] transition-transform"
                        style={{
                          background: s.highlight ? "rgba(172, 23, 54, 0.08)" : "rgba(255,255,255,0.7)",
                          border: s.highlight ? `1.5px solid rgba(172, 23, 54, 0.35)` : "1px solid rgba(30,55,90,0.06)",
                          boxShadow: s.highlight ? "0 2px 10px rgba(172, 23, 54, 0.12)" : "0 2px 8px rgba(15,23,42,0.03)",
                        }}
                      >
                        <LayoutGrid
                          className="size-5 shrink-0"
                          style={{ color: s.highlight ? BRAND : BRAND }}
                          strokeWidth={1.5}
                        />
                        <span
                          className="text-[11px] font-semibold truncate"
                          style={{ color: s.highlight ? BRAND : "#1e293b" }}
                        >
                          {s.shelveName || s.shelveId}
                          {s.highlight && (
                            <span className="ml-1 text-[9px] font-medium opacity-75">本组</span>
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function CageShelfGridView({
  shelf,
  detail,
  loading,
  error,
  onBack,
  onRetry,
  onCellClick,
}: {
  shelf: MobileCageShelfSummary;
  detail: CageShelfDetail | null;
  loading: boolean;
  error: string | null;
  onBack: () => void;
  onRetry: () => void;
  onCellClick: (cell: CageShelfCell) => void;
}) {
  const cells = detail && detail.grid.length > 0 ? detail.grid : buildPlaceholderGridCells();
  const meta = detail?.shelfMeta;
  const title = meta?.shelveName || shelf.shelveName || shelf.shelveId;

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: PAGE_BG }}>
      <div
        className="shrink-0 flex items-center gap-2 px-3 py-2 border-b"
        style={{ background: "rgba(255,255,255,0.92)", borderColor: "rgba(30,55,90,0.06)" }}
      >
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-0.5 px-1 py-1 rounded-lg active:bg-black/5"
          style={{ color: BRAND }}
        >
          <ChevronLeft className="size-5" />
          <span className="text-[13px] font-medium">返回</span>
        </button>
        <div className="flex-1 min-w-0 text-center pr-8">
          <p className="text-[13px] font-bold truncate" style={{ color: "#1e293b" }}>{title}</p>
          {meta && (
            <p className="text-[10px] truncate" style={{ color: "#94a3b8" }}>
              已填 {detail?.filledCells ?? 0} / {detail?.totalCells ?? 80}
              {meta.campusName && ` · ${meta.campusName}`}
              {meta.roomName && ` / ${meta.roomName}`}
            </p>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="size-6 animate-spin" style={{ color: "#94a3b8" }} />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <WifiOff className="size-10" style={{ color: "#c8c9cc" }} />
            <p className="text-xs text-center px-4" style={{ color: "#969799" }}>{error}</p>
            <button
              type="button"
              onClick={onRetry}
              className="px-5 py-2 rounded-full text-white text-sm font-medium"
              style={{ background: `linear-gradient(135deg, ${BRAND}, #8B1229)` }}
            >
              重新加载
            </button>
          </div>
        ) : (
          <>
            <div className="mb-3">
              <CageShelfLegend collapsed />
            </div>
            <div
              className="rounded-xl p-2"
              style={{
                background: "rgba(255,255,255,0.85)",
                border: "1px solid rgba(30,55,90,0.06)",
                boxShadow: "0 2px 8px rgba(15,23,42,0.04)",
              }}
            >
              <div className="grid grid-cols-8 gap-1">
                {cells.map((cell) => (
                  <GridCellButton
                    key={cell.position}
                    cell={cell}
                    onSelect={() => onCellClick(cell)}
                  />
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export type MobileCageShelfTabHandle = {
  /** 是否消费了返回（弹窗 / 网格 → 列表）；false 表示已在列表页 */
  pop: () => boolean;
};

interface MobileCageShelfTabProps {
  token: string;
  jwtMode?: boolean;
  onScreenChange?: (screen: "list" | "grid", shelfTitle?: string) => void;
}

export default forwardRef<MobileCageShelfTabHandle, MobileCageShelfTabProps>(
  function MobileCageShelfTab({ token, jwtMode, onScreenChange }, ref) {
  const [screen, setScreen] = useState<"list" | "grid">("list");
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [shelves, setShelves] = useState<MobileCageShelfSummary[]>([]);
  const [listReloadKey, setListReloadKey] = useState(0);

  const [selectedShelf, setSelectedShelf] = useState<MobileCageShelfSummary | null>(null);
  const [detail, setDetail] = useState<CageShelfDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailReloadKey, setDetailReloadKey] = useState(0);

  const [selectedCell, setSelectedCell] = useState<CageShelfCell | null>(null);

  useEffect(() => {
    if (!jwtMode && !token) return;
    setListLoading(true);
    setListError(null);
    (jwtMode
      ? fetchStudentMobileCageShelvesAll()
      : fetchMobileCageShelvesAll(token!)
    )
      .then((d) => setShelves(d.shelves ?? []))
      .catch((e) => setListError(e instanceof Error ? e.message : "加载失败"))
      .finally(() => setListLoading(false));
  }, [token, jwtMode, listReloadKey]);

  useEffect(() => {
    if ((!jwtMode && !token) || !selectedShelf || screen !== "grid") return;
    setDetailLoading(true);
    setDetailError(null);
    setDetail(null);
    (jwtMode
      ? fetchStudentMobileCageShelfDetail(selectedShelf.shelveId)
      : fetchMobileCageShelfDetail(token!, selectedShelf.shelveId)
    )
      .then(setDetail)
      .catch((e) => setDetailError(e instanceof Error ? e.message : "加载笼架详情失败"))
      .finally(() => setDetailLoading(false));
  }, [token, jwtMode, selectedShelf, screen, detailReloadKey]);

  const openShelf = (shelf: MobileCageShelfSummary) => {
    setSelectedShelf(shelf);
    setSelectedCell(null);
    setScreen("grid");
  };

  const goBackToList = useCallback(() => {
    setScreen("list");
    setSelectedCell(null);
    setDetailError(null);
  }, []);

  const handleCellClick = (cell: CageShelfCell) => {
    if (cell.empty) return;
    setSelectedCell(cell);
  };

  const popNavigation = useCallback((): boolean => {
    if (selectedCell) {
      setSelectedCell(null);
      return true;
    }
    if (screen === "grid") {
      goBackToList();
      return true;
    }
    return false;
  }, [selectedCell, screen, goBackToList]);

  useImperativeHandle(ref, () => ({ pop: popNavigation }), [popNavigation]);

  const gridTitle =
    detail?.shelfMeta?.shelveName ||
    selectedShelf?.shelveName ||
    selectedShelf?.shelveId ||
    undefined;

  useEffect(() => {
    onScreenChange?.(screen, screen === "grid" ? gridTitle : undefined);
  }, [screen, gridTitle, onScreenChange]);

  return (
    <CageColorProvider>
      <div className="relative h-full overflow-hidden">
        {/* 列表层保持挂载，返回时保留滚动位置与筛选/展开状态 */}
        <div
          className={screen === "grid" ? "hidden" : "h-full"}
          aria-hidden={screen === "grid"}
        >
          <CageShelfListView
            loading={listLoading}
            error={listError}
            shelves={shelves}
            onRetry={() => setListReloadKey((k) => k + 1)}
            onOpenShelf={openShelf}
          />
        </div>

        {screen === "grid" && selectedShelf && (
          <div className="absolute inset-0 z-10 flex flex-col">
            <CageShelfGridView
              shelf={selectedShelf}
              detail={detail}
              loading={detailLoading}
              error={detailError}
              onBack={goBackToList}
              onRetry={() => setDetailReloadKey((k) => k + 1)}
              onCellClick={handleCellClick}
            />
          </div>
        )}

        {selectedCell && selectedShelf && (
          <MobileCageCellDetailDialog
            token={token}
            jwtMode={jwtMode}
            shelveId={selectedShelf.shelveId}
            cell={selectedCell}
            gridMeta={detail?.shelfMeta ?? null}
            onClose={() => setSelectedCell(null)}
          />
        )}
      </div>
    </CageColorProvider>
  );
});
