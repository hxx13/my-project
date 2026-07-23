/** 手机版 — 笼架 Tab（列表 → 8×10 网格页 → 笼盒详情弹窗） */
import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronDown, ChevronRight, LayoutGrid, Loader2, RefreshCw, Search, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CageShelfCell, CageShelfDetail } from "@/features/student/api/student.api";
import { fetchFullTree } from "@/api/domains/cageShelf.api";
import {
  fetchMobileCageShelfDetail,
  fetchMobileCageShelvesAll,
  fetchMobileSpecialStatusOverview,
  type MobileCageShelfSummary,
} from "@/api/domains/mobileStudent.api";
import {
  fetchStudentMobileCageShelvesAll,
  fetchStudentMobileCageShelfDetail,
  fetchStudentMobileSpecialStatusOverview,
} from "@/api/domains/studentMobile.api";
import CageCellOverlays, {
  CAGE_TYPE_LABEL,
  CageTypeProgressBar,
  getCellStatusDisplayLabel,
  getDominantStatusCode,
  useStatusStyle,
} from "@/features/cage-shelf/components/CageCellOverlays";
import { formatSpecialStatusCodesForDisplay } from "@/utils/cageSpecialStatusLabels";
import { hasMinRole } from "@/features/auth/roleAccess";
import { authStorage } from "@/features/auth/authStorage";
import MobileSpecialStatusPanel from "./MobileSpecialStatusPanel";
import CageShelfLegend from "@/features/cage-shelf/components/CageShelfLegend";
import { CageColorProvider } from "@/features/cage-shelf/components/CageColorContext";
import MobileCageCellDetailDialog from "./MobileCageCellDetailDialog";
import { buildPlaceholderGridCells } from "./mobileCageShelfGrid";

const PAGE_BG = "#eef0f6";
const BRAND = "#ac1736";

const CAMPUS_ORDER = ["浦东", "浦西"] as const;

interface RoomShelfGroup {
  key: string;
  roomName: string;
  campusName: string;
  label: string;
  shelves: MobileCageShelfSummary[];
}

interface CampusShelfGroup {
  key: string;
  campusName: string;
  rooms: RoomShelfGroup[];
  shelfCount: number;
}

function buildRoomGroups(shelves: MobileCageShelfSummary[]): RoomShelfGroup[] {
  const map = new Map<string, RoomShelfGroup>();
  for (const s of shelves) {
    const roomName = s.roomName || "其他";
    const campusName = s.campusName || "其他";
    const key = `${campusName}::${roomName}`;
    const existing = map.get(key);
    if (existing) {
      existing.shelves.push(s);
    } else {
      map.set(key, {
        key,
        roomName,
        campusName,
        label: roomName,
        shelves: [s],
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    const campusCmp = a.campusName.localeCompare(b.campusName, "zh-CN");
    if (campusCmp !== 0) return campusCmp;
    return a.roomName.localeCompare(b.roomName, "zh-CN");
  });
}

function buildCampusGroups(shelves: MobileCageShelfSummary[]): CampusShelfGroup[] {
  const roomGroups = buildRoomGroups(shelves);
  const byCampus = new Map<string, RoomShelfGroup[]>();
  for (const rg of roomGroups) {
    const campus = rg.campusName || "其他";
    const list = byCampus.get(campus) ?? [];
    list.push(rg);
    byCampus.set(campus, list);
  }
  const orderedCampuses = [
    ...CAMPUS_ORDER.filter((c) => byCampus.has(c)),
    ...Array.from(byCampus.keys()).filter((c) => !CAMPUS_ORDER.includes(c as (typeof CAMPUS_ORDER)[number])),
  ];
  return orderedCampuses.map((campusName) => {
    const rooms = byCampus.get(campusName) ?? [];
    return {
      key: campusName,
      campusName,
      rooms,
      shelfCount: rooms.reduce((n, r) => n + r.shelves.length, 0),
    };
  });
}

function campusHeaderStyle(campusName: string): {
  background: string;
  color: string;
  badgeBackground: string;
  badgeColor: string;
} {
  if (campusName === "浦东") {
    return {
      background: "var(--student-accent-telemetry-soft, #e0f2fe)",
      color: "var(--student-accent-telemetry, #0284c7)",
      badgeBackground: "color-mix(in srgb, var(--student-accent-telemetry, #0284c7) 14%, transparent)",
      badgeColor: "var(--student-accent-telemetry, #0284c7)",
    };
  }
  if (campusName === "浦西") {
    return {
      background: "var(--student-accent-alert-soft, #fef3c7)",
      color: "var(--student-accent-alert, #d97706)",
      badgeBackground: "color-mix(in srgb, var(--student-accent-alert, #d97706) 14%, transparent)",
      badgeColor: "var(--student-accent-alert, #d97706)",
    };
  }
  return {
    background: "rgba(255,255,255,0.85)",
    color: "#323233",
    badgeBackground: "#f2f3f5",
    badgeColor: "#646566",
  };
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
  const statusLabel = cell.empty || !cell.visible ? "" : getCellStatusDisplayLabel(cell.specialStatuses, cell.cageBoxInfo);

  const statusCodes = formatSpecialStatusCodesForDisplay(
    Array.isArray(cell.specialStatuses) ? cell.specialStatuses : undefined,
    cell.cageBoxInfo,
  );

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
        !cell.empty && cell.visible ? "ring-1 ring-[var(--student-primary-muted)]" : "",
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
            {nonEmptyText(piName) && (
              <div
                className="w-full truncate text-[8px] font-semibold"
                style={{ color: "var(--app-color-text-primary, #1e293b)" }}
              >
                {piName}
              </div>
            )}
            {nonEmptyText(statusLabel) && (
              <div
                className="w-full truncate text-[7px] font-medium leading-tight"
                style={{ color: "var(--app-color-text-secondary, #475569)" }}
              >
                {statusLabel}
              </div>
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
  shelfTypeCounts,
  onRetry,
  onOpenShelf,
  onOpenSpecialStatus,
  showSpecialStatusEntry,
}: {
  loading: boolean;
  error: string | null;
  shelves: MobileCageShelfSummary[];
  shelfTypeCounts: Record<string, { type1: number; type2: number; type3: number; type4: number }>;
  onRetry: () => void;
  onOpenShelf: (shelf: MobileCageShelfSummary) => void;
  onOpenSpecialStatus: () => void;
  showSpecialStatusEntry: boolean;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCampuses, setExpandedCampuses] = useState<Record<string, boolean>>({});
  const [expandedRooms, setExpandedRooms] = useState<Record<string, boolean>>({});

  const filteredShelves = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return shelves;
    return shelves.filter((s) => {
      const roomName = s.roomName || "其他";
      return roomNameMatchesQuery(roomName, q);
    });
  }, [shelves, searchQuery]);

  const campusGroups = useMemo(() => buildCampusGroups(filteredShelves), [filteredShelves]);

  useEffect(() => {
    if (searchQuery.trim()) return;
    setExpandedCampuses({});
    setExpandedRooms({});
  }, [searchQuery]);

  const toggleCampus = (key: string) => {
    setExpandedCampuses((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleRoom = (key: string) => {
    setExpandedRooms((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const collapseAllRooms = () => {
    setExpandedCampuses({});
    setExpandedRooms({});
  };

  const clearFilters = () => {
    setSearchQuery("");
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
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[11px] font-medium" style={{ color: "#64748b" }}>
              共 {shelves.length} 个笼架
            </span>
            {filteredShelves.length !== shelves.length && (
              <span className="text-[10px]" style={{ color: "#94a3b8" }}>
                筛选 {filteredShelves.length} 个
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {showSpecialStatusEntry && (
              <button
                type="button"
                onClick={onOpenSpecialStatus}
                className="flex items-center gap-0.5 px-2 py-1.5 rounded-xl active:bg-black/5"
                style={{
                  color: BRAND,
                  background: "rgba(255,255,255,0.92)",
                  border: "1px solid rgba(30,55,90,0.08)",
                  boxShadow: "0 1px 4px rgba(15,23,42,0.04)",
                }}
                aria-label="特殊状态总览"
              >
                <AlertTriangle className="size-3.5" />
                <span className="text-[10px] font-medium whitespace-nowrap">特殊状态</span>
              </button>
            )}
            <button
              type="button"
              onClick={onRetry}
              className="flex items-center justify-center size-8 rounded-full active:bg-black/5"
              style={{
                background: "rgba(255,255,255,0.92)",
                border: "1px solid rgba(30,55,90,0.08)",
                boxShadow: "0 1px 4px rgba(15,23,42,0.04)",
              }}
              aria-label="刷新笼架列表"
            >
              <RefreshCw className="size-3.5" style={{ color: "#969799" }} />
            </button>
          </div>
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
              onClick={clearFilters}
            >
              清除筛选
            </button>
          </div>
        ) : (
          campusGroups.map((campus) => {
            const campusExpanded = expandedCampuses[campus.key] === true;
            const campusStyle = campusHeaderStyle(campus.campusName);
            return (
              <div key={campus.key} className="mb-3">
                <button
                  type="button"
                  onClick={() => toggleCampus(campus.key)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl mb-1.5 active:scale-[0.99] transition-transform"
                  style={{
                    background: campusStyle.background,
                    border: "1px solid rgba(30,55,90,0.08)",
                    boxShadow: "0 2px 8px rgba(15,23,42,0.06)",
                  }}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    {campusExpanded ? (
                      <ChevronDown className="size-4 shrink-0" style={{ color: campusStyle.color }} />
                    ) : (
                      <ChevronRight className="size-4 shrink-0" style={{ color: campusStyle.color }} />
                    )}
                    <span className="text-[13px] font-bold truncate" style={{ color: campusStyle.color }}>
                      {campus.campusName}校区
                    </span>
                  </div>
                  <span
                    className="text-[10px] shrink-0 px-1.5 py-0.5 rounded-full font-medium"
                    style={{
                      color: campusStyle.badgeColor,
                      background: campusStyle.badgeBackground,
                    }}
                  >
                    {campus.shelfCount} 架
                  </span>
                </button>

                {campusExpanded && (
                  <div className="space-y-2 pl-1">
                    {campus.rooms.map((group) => {
                      const expanded = expandedRooms[group.key] === true;
                      const hasOwnGroup = group.shelves.some((s) => s.highlight);
                      return (
                        <div key={group.key}>
                          <button
                            type="button"
                            onClick={() => toggleRoom(group.key)}
                            className="w-full flex items-center justify-between gap-2 px-2 py-2 rounded-xl mb-1 active:scale-[0.99] transition-transform"
                            style={{
                              background: hasOwnGroup ? "rgba(172, 23, 54, 0.06)" : "rgba(255,255,255,0.75)",
                              border: hasOwnGroup ? `1px solid rgba(172, 23, 54, 0.22)` : "1px solid rgba(30,55,90,0.06)",
                            }}
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              {expanded ? (
                                <ChevronDown className="size-3.5 shrink-0" style={{ color: hasOwnGroup ? BRAND : "#969799" }} />
                              ) : (
                                <ChevronRight className="size-3.5 shrink-0" style={{ color: hasOwnGroup ? BRAND : "#969799" }} />
                              )}
                              <span
                                className="text-[12px] font-semibold truncate"
                                style={{ color: hasOwnGroup ? BRAND : "#323233" }}
                              >
                                {group.roomName}
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
                          {(() => {
                            const roomCt = shelfTypeCounts[`room:${group.key}`];
                            if (!roomCt) return null;
                            const counts: Record<number, number> = { 1: roomCt.type1, 2: roomCt.type2, 3: roomCt.type3, 4: roomCt.type4 };
                            return <div className="px-2 pb-1 w-[70%]"><CageTypeProgressBar counts={counts} /></div>;
                          })()}

                          {expanded && (
                            <div className="grid grid-cols-2 gap-2 pl-1 pb-1">
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
                                    style={{ color: BRAND }}
                                    strokeWidth={1.5}
                                  />
                                  <span className="flex-1 min-w-0">
                                    <span
                                      className="text-[11px] font-semibold truncate block"
                                      style={{ color: s.highlight ? BRAND : "#1e293b" }}
                                    >
                                      {s.shelveName || s.shelveId}
                                      {s.highlight && (
                                        <span className="ml-1 text-[9px] font-medium opacity-75">本组</span>
                                      )}
                                    </span>
                                    {(() => {
                                      const ct = shelfTypeCounts[s.shelveId];
                                      if (!ct) return null;
                                      const counts: Record<number, number> = { 1: ct.type1, 2: ct.type2, 3: ct.type3, 4: ct.type4 };
                                      return <CageTypeProgressBar counts={counts} />;
                                    })()}
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
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
        <div className="flex-1 min-w-0 text-center">
          <p className="text-[13px] font-bold truncate" style={{ color: "#1e293b" }}>{title}</p>
          {meta && (
            <p className="text-[10px] truncate" style={{ color: "#94a3b8" }}>
              已填 {detail?.filledCells ?? 0} / {detail?.totalCells ?? 80}
              {meta.campusName && ` · ${meta.campusName}`}
              {meta.roomName && ` / ${meta.roomName}`}
            </p>
          )}
        </div>
        <div className="w-8 shrink-0" aria-hidden />
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
  /** ADMIN+ 手机特权；token 模式由 mobile-center profile 注入 */
  html5PrivilegeBypass?: boolean;
  onScreenChange?: (screen: "list" | "grid", shelfTitle?: string) => void;
}

export default forwardRef<MobileCageShelfTabHandle, MobileCageShelfTabProps>(
  function MobileCageShelfTab({ token, jwtMode, html5PrivilegeBypass = false, onScreenChange }, ref) {
  const [screen, setScreen] = useState<"list" | "grid">("list");
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [shelves, setShelves] = useState<MobileCageShelfSummary[]>([]);
  const [listReloadKey, setListReloadKey] = useState(0);

  const [shelfTypeCounts, setShelfTypeCounts] = useState<Record<string, { type1: number; type2: number; type3: number; type4: number }>>({});
  const [selectedShelf, setSelectedShelf] = useState<MobileCageShelfSummary | null>(null);
  const [detail, setDetail] = useState<CageShelfDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailReloadKey, setDetailReloadKey] = useState(0);

  const [selectedCell, setSelectedCell] = useState<CageShelfCell | null>(null);
  const [specialStatusOpen, setSpecialStatusOpen] = useState(false);

  const staffSpecialStatusView =
    html5PrivilegeBypass ||
    (jwtMode && hasMinRole(authStorage.getRole(), "STAFF"));

  const specialStatusApiFn = useCallback(() => {
    return jwtMode
      ? fetchStudentMobileSpecialStatusOverview()
      : fetchMobileSpecialStatusOverview(token);
  }, [jwtMode, token]);

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
    // 并行拉取笼位类型计数（与 admin 侧边栏同源）
    fetchFullTree().then((tree) => {
      // API 返回扁平 shelf 数组，每项直接含 type1~4、shelveId、roomId、campusName、roomName
      const map: Record<string, { type1: number; type2: number; type3: number; type4: number }> = {};
      const roomAgg: Record<string, { type1: number; type2: number; type3: number; type4: number }> = {};
      for (const n of (tree ?? [])) {
        map[String(n.shelveId)] = { type1: n.type1 ?? 0, type2: n.type2 ?? 0, type3: n.type3 ?? 0, type4: n.type4 ?? 0 };
        // 用 campusName::roomName 做 key，与 buildRoomGroups 对齐
        const rk = `${n.campusName || "其他"}::${n.roomName || "其他"}`;
        const a = roomAgg[rk] ?? { type1: 0, type2: 0, type3: 0, type4: 0 };
        a.type1 += n.type1 ?? 0; a.type2 += n.type2 ?? 0; a.type3 += n.type3 ?? 0; a.type4 += n.type4 ?? 0;
        roomAgg[rk] = a;
      }
      for (const [rk, c] of Object.entries(roomAgg)) { map[`room:${rk}`] = c; }
      setShelfTypeCounts(map);
    }).catch(() => {});
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
    if (specialStatusOpen) {
      setSpecialStatusOpen(false);
      return true;
    }
    if (selectedCell) {
      setSelectedCell(null);
      return true;
    }
    if (screen === "grid") {
      goBackToList();
      return true;
    }
    return false;
  }, [specialStatusOpen, selectedCell, screen, goBackToList]);

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
        {/* 列表层保持挂载，返回时保留滚动位置与展开状态 */}
        <div
          className={screen === "grid" ? "hidden" : "h-full"}
          aria-hidden={screen === "grid"}
        >
          <CageShelfListView
            loading={listLoading}
            error={listError}
            shelves={shelves}
            shelfTypeCounts={shelfTypeCounts}
            onRetry={() => setListReloadKey((k) => k + 1)}
            onOpenShelf={openShelf}
            onOpenSpecialStatus={() => setSpecialStatusOpen(true)}
            showSpecialStatusEntry
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

        <MobileSpecialStatusPanel
          open={specialStatusOpen}
          onClose={() => setSpecialStatusOpen(false)}
          apiFn={specialStatusApiFn}
          variant={staffSpecialStatusView ? "staff" : "student"}
        />
      </div>
    </CageColorProvider>
  );
});
