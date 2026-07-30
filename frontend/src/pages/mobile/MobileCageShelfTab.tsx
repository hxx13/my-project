/** 手机版 — 笼架 Tab（列表 → 8×10 网格页 → 笼盒详情弹窗） */
import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, LayoutGrid, Loader2, RefreshCw, Search, WifiOff, Scan, AlertCircle, Check, X as XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CageShelfCell, CageShelfDetail } from "@/features/student/api/student.api";
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
import { DEFAULT_COLORS } from "@/features/cage-shelf/components/CageColorContext";
import { formatSpecialStatusCodesForDisplay } from "@/utils/cageSpecialStatusLabels";
import { hasMinRole } from "@/features/auth/roleAccess";
import { authStorage } from "@/features/auth/authStorage";
import MobileSpecialStatusPanel from "./MobileSpecialStatusPanel";
import CageShelfLegend from "@/features/cage-shelf/components/CageShelfLegend";
import { CageColorProvider } from "@/features/cage-shelf/components/CageColorContext";
import MobileCageCellDetailDialog from "./MobileCageCellDetailDialog";
import MobileScanDialog from "./MobileScanDialog";
import { executeCageBoxAction, fetchFullTree, refreshShelfDetail, cancelCageBoxColor, ACTION_CANCEL_COLOR, bindCageBox, updateAnimalCage, type CageBoxAction, type AnimalCageUpdatePayload } from "@/api/domains/cageShelf.api";
import toast from "react-hot-toast";
import { buildPlaceholderGridCells } from "./mobileCageShelfGrid";

const PAGE_BG = "#eef0f6";
const BRAND = "#ac1736";

/** 坐标显示反转：后端 A-1(顶行) → 显示 A-10(底行)，内容不动仅编号反转 */
function displayPosition(pos: string): string {
  const m = pos.match(/^([A-H])-(\d+)$/);
  if (!m) return pos;
  return `${m[1]}-${11 - parseInt(m[2])}`;
}

const CAMPUS_ORDER = ["浦东", "浦西"] as const;

/** 从 roomName 提取父房间 key（例：201A → 201） */
function extractParentRoomKey(roomName: string): string {
  const m = /^(\d+)/.exec(roomName || "");
  return m ? m[1] : (roomName || "其他");
}

interface ShelfGroupEntry {
  key: string;
  name: string;
  shelves: MobileCageShelfSummary[];
  hasHighlight: boolean;
}

interface RoomShelfGroup {
  key: string;
  roomName: string;
  campusName: string;
  shelfGroups: ShelfGroupEntry[];
  hasHighlight: boolean;
}

interface CampusShelfGroup {
  key: string;
  campusName: string;
  rooms: RoomShelfGroup[];
  shelfCount: number;
}

function buildShelfGroups(shelves: MobileCageShelfSummary[]): {
  roomGroups: RoomShelfGroup[];
  byRoomKey: Map<string, RoomShelfGroup>;
} {
  const byRoomKey = new Map<string, RoomShelfGroup>();
  for (const s of shelves) {
    const roomName = s.roomName || "其他";
    const campusName = s.campusName || "其他";
    const parentKey = extractParentRoomKey(roomName);
    const rk = `${campusName}::${parentKey}`;
    let room = byRoomKey.get(rk);
    if (!room) {
      room = { key: rk, roomName: parentKey, campusName, shelfGroups: [], hasHighlight: false };
      byRoomKey.set(rk, room);
    }
    // Find or create shelf group within room
    let sg = room.shelfGroups.find(g => g.key === roomName);
    if (!sg) {
      sg = { key: roomName, name: roomName, shelves: [], hasHighlight: false };
      room.shelfGroups.push(sg);
    }
    sg.shelves.push(s);
    if (s.highlight) {
      room.hasHighlight = true;
      sg.hasHighlight = true;
    }
  }
  // Sort shelfGroups within each room
  for (const room of byRoomKey.values()) {
    room.shelfGroups.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  }
  const roomGroups = Array.from(byRoomKey.values()).sort((a, b) => {
    const cc = a.campusName.localeCompare(b.campusName, "zh-CN");
    if (cc !== 0) return cc;
    return a.roomName.localeCompare(b.roomName, "zh-CN");
  });
  return { roomGroups, byRoomKey };
}

function buildCampusGroups(shelves: MobileCageShelfSummary[]): CampusShelfGroup[] {
  const { roomGroups } = buildShelfGroups(shelves);
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
    let shelfCount = 0;
    for (const r of rooms) {
      for (const sg of r.shelfGroups) shelfCount += sg.shelves.length;
    }
    return { key: campusName, campusName, rooms, shelfCount };
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

/** 缓存动作 → 临时替换底色 */
const ACTION_BG: Record<string, string> = {
  DIVIDE: "#fef08a",           // 请分笼 → 黄
  SPECIAL_BREEDING: "#fecaca", // 特殊饲养 → 红
  HEALTH_CHECK: "#e9d5ff",     // 健康检查 → 紫
};
const ACTION_BORDER: Record<string, string> = {
  DIVIDE: "#eab308",
  SPECIAL_BREEDING: "#ef4444",
  HEALTH_CHECK: "#a855f7",
};

const GridCellButton = memo(function GridCellButton({
  cell,
  onSelect,
  crossCol,
  crossRow,
  isCached,
  isLastScanned,
  cachedActions,
  isBindHighlight,
}: {
  cell: CageShelfCell;
  onSelect: () => void;
  crossCol?: number;
  crossRow?: number;
  isCached?: boolean;
  isLastScanned?: boolean;
  cachedActions?: Set<CageBoxAction>;
  isBindHighlight?: boolean;
}) {
  const isCrossCol = crossCol != null && cell.x === crossCol;
  const isCrossRow = crossRow != null && cell.y === crossRow;
  const isInCross = (isCrossCol || isCrossRow);

  // 高亮环：刚扫=红(始终)，缓存仅在有动作选择时=琥珀，否则不高亮
  const hasCacheActions = cachedActions && cachedActions.size > 0;
  const ringColor = isLastScanned ? "#ac1736" : hasCacheActions ? "#d97706" : null;
  const ringShadow = isLastScanned ? "rgba(172,23,54,0.5)" : hasCacheActions ? "rgba(217,119,6,0.45)" : null;

  const dominant = getDominantStatusCode(cell.specialStatuses, cell.cageBoxInfo);
  const computedStyle = useStatusStyle(dominant);
  // 硬兜底：context 未就绪或颜色查找失败时用 NORMAL 默认色，防止单元格丢失背景
  const safeStyle = computedStyle ?? { backgroundColor: DEFAULT_COLORS.NORMAL.bg, borderColor: DEFAULT_COLORS.NORMAL.border, borderWidth: 2 } as React.CSSProperties;

  // 合并已有状态 + 缓存动作 → 统一分色
  const allBgColors: string[] = [];
  (cell.specialStatuses ?? [])
    .filter((s: any) => s.code !== "NORMAL")
    .forEach((s: any) => {
      const c = DEFAULT_COLORS[s.code as keyof typeof DEFAULT_COLORS];
      if (c) allBgColors.push(c.bg);
    });
  if (cachedActions) {
    if (cachedActions.has("DIVIDE")) allBgColors.push("#fef08a");
    if (cachedActions.has("SPECIAL_BREEDING")) allBgColors.push("#fecaca");
    if (cachedActions.has("HEALTH_CHECK")) allBgColors.push("#e9d5ff");
  }
  const combinedBg = allBgColors.length >= 2
    ? (() => {
        const n = allBgColors.length;
        const stops = allBgColors.map((bg, i) => {
          const pct = Math.round((i / n) * 100);
          const pctNext = Math.round(((i + 1) / n) * 100);
          return `${bg} ${pct}%, ${bg} ${pctNext}%`;
        });
        return `linear-gradient(to bottom, ${stops.join(", ")})`;
      })()
    : allBgColors.length === 1 ? allBgColors[0] : null;

  // 单色用 backgroundColor，多色用 background(gradient)，避免 React 混用警告
  const statusStyle = combinedBg
    ? (allBgColors.length === 1
        ? { ...safeStyle, backgroundColor: combinedBg }
        : { ...safeStyle, background: combinedBg })
    : safeStyle;
  const multiBg = allBgColors.length >= 2;
  const piName = nonEmptyText(cell.projectPiName) ? cell.projectPiName!.trim() : "";
  const statusLabel = cell.empty || !cell.visible ? "" : getCellStatusDisplayLabel(cell.specialStatuses, cell.cageBoxInfo);

  const statusCodes = formatSpecialStatusCodesForDisplay(
    Array.isArray(cell.specialStatuses) ? cell.specialStatuses : undefined,
    cell.cageBoxInfo,
  );

  const tooltip = cell.empty
    ? undefined
    : `${displayPosition(cell.position)} · ${CAGE_TYPE_LABEL[cell.animalCageType ?? 0] || cell.stateLabel}${statusCodes ? ` [${statusCodes}]` : ""}`;

  if (cell.empty) {
    return (
      <div
        className={cn(
          "relative min-h-[48px] rounded-md border border-[var(--student-hairline)] bg-[var(--student-canvas-soft)] text-[9px] leading-tight flex flex-col items-center justify-center text-center px-0.5 py-1 text-[var(--student-mute)]",
          isCached && hasCacheActions && "ring-2 ring-[#d97706]/50 shadow-[0_0_4px_rgba(217,119,6,0.15)]",
          isInCross && "ring-2 ring-[#ac1736]/40 bg-[rgba(172,23,54,0.1)] shadow-[0_0_4px_rgba(172,23,54,0.1)]",
        )}
        title={displayPosition(cell.position)}
      >
        <div className="w-full font-bold text-[8px]">{displayPosition(cell.position)}</div>
        <div className="text-[7px]">空位</div>
      </div>
    );
  }

  const hit = isLastScanned || hasCacheActions;
  return (
    <button
      type="button"
      className={cn(
        "relative min-h-[48px] rounded-md text-[9px] leading-tight transition",
        !cell.empty && cell.visible ? "ring-1 ring-[var(--student-primary-muted)]" : "",
        hit && "scale-[1.05] z-10",
        isInCross && !hit && "ring-2 ring-[#ac1736]/50 shadow-[0_0_6px_rgba(172,23,54,0.15)]",
        isBindHighlight && "scale-[1.05] z-10 ring-2 ring-[#2563eb] shadow-[0_0_10px_rgba(37,99,235,0.3)]",
        cageCardTone(cell),
      )}
      style={hit ? {
        ...statusStyle,
        boxShadow: `0 0 14px ${ringShadow}`,
        outline: `3px solid ${ringColor}`,
        outlineOffset: -1,
      } : isBindHighlight ? {
        ...statusStyle,
        boxShadow: "0 0 14px rgba(37,99,235,0.4)",
        outline: "3px solid #2563eb",
        outlineOffset: -1,
      } : isInCross && !multiBg ? {
        ...statusStyle,
        backgroundColor: `color-mix(in srgb, ${statusStyle?.backgroundColor || '#f1f5f9'} 88%, #ac1736)`,
      } : statusStyle}
      onClick={onSelect}
      title={tooltip}
    >
      <CageCellOverlays animalCageType={cell.animalCageType} compact />
      <div className="flex min-h-[44px] flex-col items-center justify-center gap-0.5 px-0.5 py-0.5 text-center">
        <div className="w-full font-bold text-[8px]">{displayPosition(cell.position)}</div>
        {cell.visible ? (
          <>
            {nonEmptyText(piName) && (
              <div className="w-full truncate text-[8px] font-semibold"
                style={{ color: "var(--app-color-text-primary, #1e293b)" }}>{piName}</div>
            )}
            {nonEmptyText(statusLabel) && (
              <div className="w-full truncate text-[7px] font-medium leading-tight"
                style={{ color: "var(--app-color-text-secondary, #475569)" }}>{statusLabel}</div>
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
  scannedAt,
  onRetry,
  onOpenShelf,
  onOpenSpecialStatus,
  showSpecialStatusEntry,
}: {
  loading: boolean;
  error: string | null;
  shelves: MobileCageShelfSummary[];
  shelfTypeCounts: Record<string, { type1: number; type2: number; type3: number; type4: number }>;
  scannedAt?: string;
  onRetry: () => void;
  onOpenShelf: (shelf: MobileCageShelfSummary) => void;
  onOpenSpecialStatus: () => void;
  showSpecialStatusEntry: boolean;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCampuses, setExpandedCampuses] = useState<Record<string, boolean>>({});
  const [expandedRooms, setExpandedRooms] = useState<Record<string, boolean>>({});

  const anyExpanded = useMemo(() => {
    return Object.values(expandedCampuses).some(v => v) || Object.values(expandedRooms).some(v => v);
  }, [expandedCampuses, expandedRooms]);

  const filteredShelves = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return shelves;
    return shelves.filter((s) => {
      const roomName = s.roomName || "其他";
      return roomNameMatchesQuery(roomName, q);
    });
  }, [shelves, searchQuery]);

  const campusGroups = useMemo(() => buildCampusGroups(filteredShelves), [filteredShelves]);

  // 搜素时自动展开匹配结果；清空搜索时收起全部
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setExpandedCampuses({});
      setExpandedRooms({});
      return;
    }
    // 展开所有包含匹配结果的校区和房间
    const camps: Record<string, boolean> = {};
    const rooms: Record<string, boolean> = {};
    for (const cg of campusGroups) {
      camps[cg.key] = true;
      for (const rg of cg.rooms) {
        rooms[rg.key] = true;
      }
    }
    setExpandedCampuses(camps);
    setExpandedRooms(rooms);
  }, [searchQuery, campusGroups]);

  const toggleCampus = (key: string) => {
    setExpandedCampuses((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleRoom = (key: string) => {
    setExpandedRooms((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleAllRooms = () => {
    if (anyExpanded) {
      setExpandedCampuses({});
      setExpandedRooms({});
    } else {
      const camps: Record<string, boolean> = {};
      const rooms: Record<string, boolean> = {};
      for (const cg of campusGroups) {
        camps[cg.key] = true;
        for (const rg of cg.rooms) {
          rooms[rg.key] = true;
        }
      }
      setExpandedCampuses(camps);
      setExpandedRooms(rooms);
    }
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
        {/* Row 1: 计数 + 时间戳 + 特殊状态 */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[11px] font-medium" style={{ color: "#64748b" }}>
              共 {shelves.length} 个笼架
            </span>
            {scannedAt && (
              <span className="text-[9px]" style={{ color: "#94a3b8" }}>
                {scannedAt}
              </span>
            )}
            {filteredShelves.length !== shelves.length && (
              <span className="text-[10px]" style={{ color: "#94a3b8" }}>
                筛选 {filteredShelves.length} 个
              </span>
            )}
          </div>
          {showSpecialStatusEntry && (
            <button
              type="button"
              onClick={onOpenSpecialStatus}
              className="flex items-center gap-0.5 px-2 py-1.5 rounded-xl active:bg-black/5 shrink-0"
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
        </div>

        {/* Row 2: 搜索框 + 展开全部 + 刷新 */}
        <div className="flex items-center gap-2">
          <div
            className="flex-1 min-w-0 flex items-center gap-2 rounded-xl px-3 py-2"
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
            onClick={toggleAllRooms}
            className="shrink-0 px-2.5 py-2 rounded-xl text-[11px] font-medium whitespace-nowrap"
            style={{
              color: anyExpanded ? BRAND : "#646566",
              background: "rgba(255,255,255,0.92)",
              border: "1px solid rgba(30,55,90,0.08)",
              boxShadow: "0 1px 4px rgba(15,23,42,0.04)",
            }}
          >
            {anyExpanded ? "收起全部" : "展开全部"}
          </button>
          <button
            type="button"
            onClick={onRetry}
            className="flex items-center justify-center size-8 rounded-full shrink-0 active:bg-black/5"
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
              <div key={campus.key} className="mb-4 rounded-2xl overflow-hidden" style={{
                border: "2px solid #dde1e8",
                background: "#fafbfc",
              }}>
                <button
                  type="button"
                  onClick={() => toggleCampus(campus.key)}
                  className="w-full flex items-center justify-between gap-2 px-4 py-3 active:scale-[0.99] transition-transform"
                  style={{
                    background: "linear-gradient(135deg, #eef0f6 0%, #e2e5ed 100%)",
                  }}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    {campusExpanded ? (
                      <ChevronDown className="size-4 shrink-0" style={{ color: campusStyle.color }} />
                    ) : (
                      <ChevronRight className="size-4 shrink-0" style={{ color: campusStyle.color }} />
                    )}
                    <span className="text-[13px] font-bold truncate" style={{ color: "#323233" }}>
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
                  <div className="px-3 pb-3 space-y-2">
                    {campus.rooms.map((group) => {
                      const expanded = expandedRooms[group.key] === true;
                      const totalShelves = group.shelfGroups.reduce((n, sg) => n + sg.shelves.length, 0);
                      return (
                        <div key={group.key}>
                          <button
                            type="button"
                            onClick={() => toggleRoom(group.key)}
                            className="w-full flex items-center gap-2 px-2.5 py-2.5 rounded-xl mb-1 active:scale-[0.99] transition-transform"
                            style={{
                              background: "#fff",
                              border: group.hasHighlight ? `1.5px solid rgba(172, 23, 54, 0.25)` : "1.5px solid #dde1e8",
                              boxShadow: group.hasHighlight ? "0 2px 8px rgba(172,23,54,0.06)" : "0 2px 8px rgba(0,0,0,0.04)",
                            }}
                          >
                            <div className="flex items-center gap-1.5 min-w-0 flex-shrink-0" style={{maxWidth:"50%"}}>
                              {expanded ? (
                                <ChevronDown className="size-3.5 shrink-0" style={{ color: group.hasHighlight ? BRAND : "#969799" }} />
                              ) : (
                                <ChevronRight className="size-3.5 shrink-0" style={{ color: group.hasHighlight ? BRAND : "#969799" }} />
                              )}
                              <span className="text-[12px] font-semibold truncate" style={{ color: group.hasHighlight ? BRAND : "#323233" }}>
                                {group.roomName}房间
                              </span>
                            </div>
                            <div className="flex-1 min-w-0 flex flex-col items-end gap-1">
                              {(() => {
                                const roomCt = shelfTypeCounts[`room:${group.key}`];
                                if (!roomCt) return null;
                                const total = roomCt.type1 + roomCt.type2 + roomCt.type3 + roomCt.type4;
                                if (total === 0) return null;
                                return (
                                  <>
                                    <div className="flex items-center gap-1.5 text-[10px] font-semibold">
                                      {roomCt.type3 > 0 && <><span style={{color:"#f43f5e"}}>饲{roomCt.type3}</span>{(roomCt.type1>0||roomCt.type4>0||roomCt.type2>0) && <span className="text-[9px]" style={{color:"#c0c4cc"}}>/</span>}</>}
                                      {roomCt.type1 > 0 && <><span style={{color:"#f59e0b"}}>待{roomCt.type1}</span>{(roomCt.type4>0||roomCt.type2>0) && <span className="text-[9px]" style={{color:"#c0c4cc"}}>/</span>}</>}
                                      {roomCt.type4 > 0 && <><span style={{color:"#3b82f6"}}>异{roomCt.type4}</span>{roomCt.type2>0 && <span className="text-[9px]" style={{color:"#c0c4cc"}}>/</span>}</>}
                                      {roomCt.type2 > 0 && <span style={{color:"#10b981"}}>空{roomCt.type2}</span>}
                                    </div>
                                    <div className="w-[90%] flex h-2.5 rounded-full overflow-hidden" style={{background:"#f2f3f5"}}>
                                      {roomCt.type3 > 0 && <div className="h-full min-w-[2px]" style={{width:`${Math.round(roomCt.type3/total*100)}%`,background:"#f43f5e"}} />}
                                      {roomCt.type1 > 0 && <div className="h-full min-w-[2px]" style={{width:`${Math.round(roomCt.type1/total*100)}%`,background:"#f59e0b"}} />}
                                      {roomCt.type4 > 0 && <div className="h-full min-w-[2px]" style={{width:`${Math.round(roomCt.type4/total*100)}%`,background:"#3b82f6"}} />}
                                      {roomCt.type2 > 0 && <div className="h-full min-w-[2px]" style={{width:`${Math.round(roomCt.type2/total*100)}%`,background:"#10b981"}} />}
                                    </div>
                                  </>
                                );
                              })()}
                            </div>
                            <span className="text-[10px] shrink-0 px-1.5 py-0.5 rounded-full" style={{ color: "#969799", background: "#f2f3f5" }}>
                              {totalShelves}架
                            </span>
                          </button>

                          {expanded && (
                            <div className="space-y-1.5 pl-2">
                              {group.shelfGroups.map((sg) => {
                                const sgExpanded = expandedRooms[`${group.key}:sg:${sg.key}`] === true;
                                const sgTotal = sg.shelves.reduce((n, s) => {
                                  const ct = shelfTypeCounts[s.shelveId];
                                  return n + (ct ? ct.type1 + ct.type2 + ct.type3 + ct.type4 : 0);
                                }, 0);
                                const sgCt = sg.shelves.reduce((agg, s) => {
                                  const ct = shelfTypeCounts[s.shelveId];
                                  if (ct) { agg.t1+=ct.type1; agg.t2+=ct.type2; agg.t3+=ct.type3; agg.t4+=ct.type4; }
                                  return agg;
                                }, {t1:0,t2:0,t3:0,t4:0});
                                return (
                                  <div key={sg.key} className="rounded-xl overflow-hidden" style={{
                                    borderLeft: sg.hasHighlight ? `5px solid ${BRAND}` : "5px solid #dde1e8",
                                    background: sg.hasHighlight ? "rgba(172,23,54,0.03)" : "#f8f9fc",
                                  }}>
                                    <button
                                      type="button"
                                      onClick={() => toggleRoom(`${group.key}:sg:${sg.key}`)}
                                      className="w-full flex items-center gap-2 px-2.5 py-2 active:bg-black/5"
                                    >
                                      <div className="flex items-center gap-1.5 min-w-0 flex-shrink-0">
                                        {sgExpanded ? (
                                          <ChevronDown className="size-3 shrink-0" style={{ color: sg.hasHighlight ? BRAND : "#969799" }} />
                                        ) : (
                                          <ChevronRight className="size-3 shrink-0" style={{ color: sg.hasHighlight ? BRAND : "#969799" }} />
                                        )}
                                        <span className="text-[11px] font-semibold truncate" style={{ color: sg.hasHighlight ? BRAND : "#323233" }}>
                                          {sg.name}
                                        </span>
                                      </div>
                                      <div className="flex-1 min-w-0 flex flex-col items-end gap-0.5">
                                        {sgTotal > 0 && (
                                          <>
                                            <div className="flex items-center gap-1 text-[9px] font-semibold">
                                              {sgCt.t3 > 0 && <><span style={{color:"#f43f5e"}}>饲{sgCt.t3}</span>{(sgCt.t1>0||sgCt.t4>0||sgCt.t2>0) && <span className="text-[8px]" style={{color:"#c0c4cc"}}>/</span>}</>}
                                              {sgCt.t1 > 0 && <><span style={{color:"#f59e0b"}}>待{sgCt.t1}</span>{(sgCt.t4>0||sgCt.t2>0) && <span className="text-[8px]" style={{color:"#c0c4cc"}}>/</span>}</>}
                                              {sgCt.t4 > 0 && <><span style={{color:"#3b82f6"}}>异{sgCt.t4}</span>{sgCt.t2>0 && <span className="text-[8px]" style={{color:"#c0c4cc"}}>/</span>}</>}
                                              {sgCt.t2 > 0 && <span style={{color:"#10b981"}}>空{sgCt.t2}</span>}
                                            </div>
                                            <div className="w-[70%] flex h-2 rounded-full overflow-hidden" style={{background:"#e8eaef"}}>
                                              {sgCt.t3 > 0 && <div className="h-full min-w-[2px]" style={{width:`${Math.round(sgCt.t3/sgTotal*100)}%`,background:"#f43f5e"}} />}
                                              {sgCt.t1 > 0 && <div className="h-full min-w-[2px]" style={{width:`${Math.round(sgCt.t1/sgTotal*100)}%`,background:"#f59e0b"}} />}
                                              {sgCt.t4 > 0 && <div className="h-full min-w-[2px]" style={{width:`${Math.round(sgCt.t4/sgTotal*100)}%`,background:"#3b82f6"}} />}
                                              {sgCt.t2 > 0 && <div className="h-full min-w-[2px]" style={{width:`${Math.round(sgCt.t2/sgTotal*100)}%`,background:"#10b981"}} />}
                                            </div>
                                          </>
                                        )}
                                      </div>
                                      <span className="text-[9px] shrink-0 px-1 py-0.5 rounded-full" style={{color:"#969799",background:"#f2f3f5"}}>
                                        {sg.shelves.length}架
                                      </span>
                                    </button>
                                    {sgExpanded && (
                                      <div className="grid grid-cols-2 gap-1.5 px-2 pb-2">
                                        {sg.shelves.map((s) => {
                                          const ct = shelfTypeCounts[s.shelveId];
                                          const total = ct ? ct.type1+ct.type2+ct.type3+ct.type4 : 0;
                                          return (
                                          <button
                                            key={s.shelveId}
                                            type="button"
                                            onClick={() => onOpenShelf(s)}
                                            className="rounded-lg px-2.5 py-2 text-left active:scale-[0.98] transition-transform"
                                            style={{
                                              background: "#fff",
                                              border: "1px solid #eef0f6",
                                              boxShadow: "0 2px 6px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
                                            }}
                                          >
                                            <div className="flex items-center gap-1.5">
                                              {/* 左侧：名称，高度与右侧内容区持平 */}
                                              <span className="text-[12px] font-semibold truncate shrink-0 leading-snug" style={{maxWidth:"42%", color:"#1e293b"}}>
                                                {s.shelveName || s.shelveId}
                                              </span>
                                              {/* 右侧：图例(上) + 进度条(下)，垂直堆叠 */}
                                              {total > 0 && (
                                                <div className="flex-1 min-w-0 flex flex-col items-end gap-0.5">
                                                  {/* 图例行：彩色圆点 + 标签 + 数字 */}
                                                  <div className="flex flex-wrap items-center justify-end gap-x-1.5 gap-y-0 text-[8px] font-semibold">
                                                    {ct.type3 > 0 && (
                                                      <span className="inline-flex items-center gap-0.5" style={{color:"#969799"}}>
                                                        <span className="inline-block w-1.5 h-1.5 rounded-full shrink-0" style={{background:"#f43f5e"}} />
                                                        饲养{ct.type3}
                                                      </span>
                                                    )}
                                                    {ct.type1 > 0 && (
                                                      <span className="inline-flex items-center gap-0.5" style={{color:"#969799"}}>
                                                        <span className="inline-block w-1.5 h-1.5 rounded-full shrink-0" style={{background:"#f59e0b"}} />
                                                        待{ct.type1}
                                                      </span>
                                                    )}
                                                    {ct.type4 > 0 && (
                                                      <span className="inline-flex items-center gap-0.5" style={{color:"#969799"}}>
                                                        <span className="inline-block w-1.5 h-1.5 rounded-full shrink-0" style={{background:"#3b82f6"}} />
                                                        异{ct.type4}
                                                      </span>
                                                    )}
                                                    {ct.type2 > 0 && (
                                                      <span className="inline-flex items-center gap-0.5" style={{color:"#969799"}}>
                                                        <span className="inline-block w-1.5 h-1.5 rounded-full shrink-0" style={{background:"#10b981"}} />
                                                        空{ct.type2}
                                                      </span>
                                                    )}
                                                  </div>
                                                  {/* 进度条 */}
                                                  <div className="w-full flex h-1.5 rounded-full overflow-hidden" style={{background:"#f2f3f5"}}>
                                                    {ct.type3>0 && <div className="h-full min-w-[2px]" style={{width:`${Math.round(ct.type3/total*100)}%`,background:"#f43f5e"}} />}
                                                    {ct.type1>0 && <div className="h-full min-w-[2px]" style={{width:`${Math.round(ct.type1/total*100)}%`,background:"#f59e0b"}} />}
                                                    {ct.type4>0 && <div className="h-full min-w-[2px]" style={{width:`${Math.round(ct.type4/total*100)}%`,background:"#3b82f6"}} />}
                                                    {ct.type2>0 && <div className="h-full min-w-[2px]" style={{width:`${Math.round(ct.type2/total*100)}%`,background:"#10b981"}} />}
                                                  </div>
                                                </div>
                                              )}
                                            </div>
                                          </button>
                                        )})}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
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

type ScanCacheEntry = {
  cell: CageShelfCell;
  code: string;
  /** 创建缓存条目时的初始状态（来自 cageBoxInfo 预选），不可变 */
  initialActions: Set<CageBoxAction>;
  /** 用户当前修改后的状态 */
  currentActions: Set<CageBoxAction>;
};

/** 是否有任何差异（新增或反选） */
function entryHasDiff(e: ScanCacheEntry): boolean {
  if (e.initialActions.size !== e.currentActions.size) return true;
  for (const a of e.initialActions) { if (!e.currentActions.has(a)) return true; }
  return false;
}

/** 统计所有缓存条目中的总差异数（新增 + 反选） */
function countTotalDiffs(cache: Map<string, ScanCacheEntry>): number {
  let n = 0;
  for (const e of cache.values()) {
    for (const a of e.currentActions) { if (!e.initialActions.has(a)) n++; }
    for (const a of e.initialActions) { if (!e.currentActions.has(a)) n++; }
  }
  return n;
}

function CageShelfGridView({
  shelf, detail, loading, error, onBack, onRetry, onCellClick,
  staffView, scanOpen, onOpenScan, onCloseScan,
  scanCache, lastScannedKey, onScanResult, onActionSubmit, actionSubmitting,
  onToggleAction, onRemoveCache, editMode, onToggleRealtime,
  bindMode, onToggleBindMode, bindSelectedKey,
  bindScanOpen, onOpenBindScan, onCloseBindScan, onBindScanResult,
  unbindActive, onToggleUnbind,
}: {
  shelf: MobileCageShelfSummary;
  detail: CageShelfDetail | null;
  loading: boolean; error: string | null;
  onBack: () => void; onRetry: () => void;
  onCellClick: (cell: CageShelfCell) => void;
  staffView: boolean;
  scanOpen: boolean; onOpenScan: () => void; onCloseScan: () => void;
  scanCache: Map<string, ScanCacheEntry>;
  lastScannedKey: string | null;
  onScanResult: (text: string) => void;
  onActionSubmit: () => void; actionSubmitting: boolean;
  onToggleAction: (key: string, action: CageBoxAction) => void;
  onRemoveCache: (key: string) => void;
  editMode?: boolean;
  onToggleRealtime?: () => void;
  bindMode?: boolean;
  onToggleBindMode?: () => void;
  bindSelectedKey?: string | null;
  bindScanOpen?: boolean;
  onOpenBindScan?: () => void;
  onCloseBindScan?: () => void;
  onBindScanResult?: (text: string) => void;
  unbindActive?: boolean;
  onToggleUnbind?: () => void;
}) {
  const cells = detail && detail.grid.length > 0 ? detail.grid : buildPlaceholderGridCells();
  const meta = detail?.shelfMeta;
  const title = meta?.shelveName || shelf.shelveName || shelf.shelveId;
  const [legendOpen, setLegendOpen] = useState(false);
  const cacheSize = scanCache.size;
  const showLegend = legendOpen;

  // 行/列交叉定位：仅编辑模式生效
  const lc = editMode ? lastScannedKey : null;
  const crossX = lc != null ? Number(lc.split(":")[0]) : undefined;
  const crossY = lc != null ? Number(lc.split(":")[1]) : undefined;

  // 缓存位置集合（用于高亮）
  const cachedKeys = new Set(scanCache.keys());

  // 总差异数（新增 + 反选），驱动提交按钮
  const totalDiffs = countTotalDiffs(scanCache);

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: PAGE_BG }}>
      {/* ── 顶栏：始终保留扫码按钮 ── */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b"
        style={{ background: "rgba(255,255,255,0.92)", borderColor: "rgba(30,55,90,0.06)" }}>
        {/* 返回由 shell MobileTopNavBar 统管，此处不再重复 */}
        {/* 编辑按钮 — 最左侧，独立排布 */}
        {staffView && (
          <button type="button" onClick={onToggleRealtime}
            className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold active:scale-95 transition shrink-0"
            style={{
              color: editMode ? "#fff" : BRAND,
              background: editMode ? BRAND : "rgba(172,23,54,0.1)",
              border: `1px solid ${editMode ? BRAND : "rgba(172,23,54,0.25)"}`,
            }}>
            {editMode ? "编辑中" : "编辑"}
          </button>
        )}
        {/* 绑定按钮 */}
        {staffView && !editMode && (
          <button type="button" onClick={onToggleBindMode}
            className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold active:scale-95 transition shrink-0"
            style={{
              color: bindMode ? "#fff" : "#2563eb",
              background: bindMode ? "#2563eb" : "rgba(37,99,235,0.1)",
              border: `1px solid ${bindMode ? "#2563eb" : "rgba(37,99,235,0.25)"}`,
            }}>
            {bindMode ? "绑定中" : "绑定"}
          </button>
        )}
        <div className="flex-1 min-w-0 text-center">
          <p className="text-[13px] font-bold truncate" style={{ color: "#1e293b" }}>{title}</p>
          {meta && <p className="text-[10px] truncate" style={{ color: "#94a3b8" }}>
            已填 {detail?.filledCells ?? 0}/{detail?.totalCells ?? 80}
            {meta.campusName && ` · ${meta.campusName}`}{meta.roomName && ` / ${meta.roomName}`}
          </p>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" onClick={() => setLegendOpen((v) => !v)}
            className="flex items-center justify-center rounded-full w-7 h-7 active:scale-95 transition"
            style={{ color: legendOpen ? "#fff" : BRAND, background: legendOpen ? BRAND : "rgba(172,23,54,0.08)" }}
            aria-label="图例"><AlertCircle className="size-4" strokeWidth={2} /></button>
          <button type="button" onClick={onRetry}
            className="flex items-center justify-center rounded-full w-7 h-7 active:scale-95"
            style={{ background: "rgba(0,0,0,0.05)" }} aria-label="刷新">
            <RefreshCw className="size-3.5" style={{ color: "#969799" }} /></button>
          {/* 编辑模式扫码（红色圆形） */}
          {staffView && editMode && (<>
                <button type="button" onClick={onOpenScan}
                  className="relative flex items-center justify-center rounded-full w-7 h-7 active:scale-95 transition"
                  style={{ background: totalDiffs > 0 ? "rgba(172,23,54,0.15)" : "rgba(172,23,54,0.12)" }} aria-label="扫码">
                  <Scan className="size-4" style={{ color: BRAND }} strokeWidth={1.5} />
                  {totalDiffs > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] rounded-full text-white text-[9px] font-bold flex items-center justify-center" style={{ background: BRAND }}>{totalDiffs}</span>}
                </button>
                {(totalDiffs > 0) && (
                  <button type="button" disabled={actionSubmitting} onClick={onActionSubmit}
                    className="flex items-center gap-1 shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold text-white active:scale-95 transition disabled:opacity-50"
                    style={{ background: BRAND }}>
                    <Check className="size-3" strokeWidth={3} />提交{totalDiffs}
                  </button>
                )}
              </>)}
          {/* 绑定模式：扫码 + 解绑 */}
          {staffView && bindMode && (
            <>
              <button type="button" onClick={onOpenBindScan}
                className="relative flex items-center justify-center rounded-md w-7 h-7 active:scale-95 transition"
                style={{ background: "rgba(37,99,235,0.12)" }} aria-label="绑定扫码">
                <Scan className="size-4" style={{ color: "#2563eb" }} strokeWidth={1.5} />
              </button>
              <button type="button"
                className="flex items-center gap-1 shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold active:scale-95 transition"
                style={{
                  color: unbindActive ? "#fff" : "#dc2626",
                  background: unbindActive ? "#dc2626" : "rgba(220,38,38,0.1)",
                  border: `1px solid ${unbindActive ? "#dc2626" : "rgba(220,38,38,0.25)"}`,
                }}
                onClick={onToggleUnbind}>
                {unbindActive ? "解绑中" : "解绑"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── 图例 ── */}
      {showLegend && <div className="shrink-0 px-3 pt-2"><CageShelfLegend collapsed /></div>}

      {/* ── 缓存面板 ── */}
      {editMode && cacheSize > 0 && lastScannedKey && (
        <div className="shrink-0 px-3 pt-2 pb-1">
          {scanCache.has(lastScannedKey) && (() => {
            const entry = scanCache.get(lastScannedKey)!;
            const key = lastScannedKey;
            return (
              <div key={key} className="mb-2 rounded-xl p-2"
                style={{ background: "rgba(172,23,54,0.06)", border: "1px solid rgba(172,23,54,0.2)" }}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold" style={{ color: BRAND }}>
                    {displayPosition(entry.cell.position)} · {entry.code}
                    <span className="ml-1 text-[9px] font-normal" style={{ color: BRAND }}>← 刚扫</span>
                    {cacheSize > 1 && <span className="ml-1 text-[9px]" style={{ color: "#969799" }}>+{cacheSize - 1} 个缓存</span>}
                  </span>
                  {/* 关闭面板不取消选择 */}
                </div>
                <div className="flex flex-wrap gap-1">
                  {(["DIVIDE", "SPECIAL_BREEDING", "HEALTH_CHECK"] as const).map((act) => {
                    const active = entry.currentActions.has(act);
                    const lb = act === "DIVIDE" ? "请分笼" : act === "SPECIAL_BREEDING" ? "特殊饲养" : "健康检查";
                    return (
                      <button key={act} type="button" onClick={() => onToggleAction(key, act)}
                        className="rounded-full px-2 py-1 text-[10px] font-semibold active:scale-95 transition"
                        style={{
                          color: active ? "#fff" : BRAND,
                          background: active ? BRAND : "rgba(172,23,54,0.08)",
                          border: active ? `1.5px solid ${BRAND}` : "1px solid rgba(172,23,54,0.2)",
                        }}>{active && <Check className="size-2.5 inline mr-0.5" strokeWidth={3} />}{lb}</button>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ── 网格 ── */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
        {loading ? <div className="flex items-center justify-center py-20"><Loader2 className="size-6 animate-spin" style={{ color: "#94a3b8" }} /></div>
        : error ? <div className="flex flex-col items-center justify-center gap-3 py-16"><WifiOff className="size-10" style={{ color: "#c8c9cc" }} /><p className="text-xs text-center px-4" style={{ color: "#969799" }}>{error}</p><button type="button" onClick={onRetry} className="px-5 py-2 rounded-full text-white text-sm font-medium" style={{ background: `linear-gradient(135deg, ${BRAND}, #8B1229)` }}>重新加载</button></div>
        : <div className="rounded-xl p-2" style={{ background: "rgba(255,255,255,0.85)", border: "1px solid rgba(30,55,90,0.06)", boxShadow: "0 2px 8px rgba(15,23,42,0.04)" }}>
            <div className="grid grid-cols-8 gap-1">
              {cells.map((cell) => {
                const ck = `${cell.x}:${cell.y}`;
                const cacheEntry = scanCache.get(ck);
                return (
                  <GridCellButton key={cell.position} cell={cell} onSelect={() => onCellClick(cell)}
                    crossCol={crossX} crossRow={crossY}
                    isCached={cachedKeys.has(ck)}
                    isLastScanned={ck === lastScannedKey}
                    cachedActions={cacheEntry?.currentActions}
                    isBindHighlight={bindSelectedKey === ck}
                  />
                );
              })}
            </div>
          </div>}
      </div>
      <MobileScanDialog open={scanOpen} onClose={onCloseScan} onResult={onScanResult} />
      {bindScanOpen && <MobileScanDialog open={bindScanOpen} onClose={onCloseBindScan!} onResult={onBindScanResult!} />}
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
  const [scannedAt, setScannedAt] = useState("");
  const [listReloadKey, setListReloadKey] = useState(0);

  const [shelfTypeCounts, setShelfTypeCounts] = useState<Record<string, { type1: number; type2: number; type3: number; type4: number }>>({});
  const [selectedShelf, setSelectedShelf] = useState<MobileCageShelfSummary | null>(null);
  const [detail, setDetail] = useState<CageShelfDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailReloadKey, setDetailReloadKey] = useState(0);

  const [selectedCell, setSelectedCell] = useState<CageShelfCell | null>(null);
  const [specialStatusOpen, setSpecialStatusOpen] = useState(false);

  // ── 扫码缓存（支持连续扫码，统一提交） ──
  const [scanOpen, setScanOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [bindMode, setBindMode] = useState(false);
  const [bindScanOpen, setBindScanOpen] = useState(false);
  const [bindScannedCode, setBindScannedCode] = useState("");
  const [bindSelectedKey, setBindSelectedKey] = useState<string | null>(null);
  const [bindSubmitting, setBindSubmitting] = useState(false);
  const [unbindActive, setUnbindActive] = useState(false);
  const [scanCache, setScanCache] = useState<Map<string, ScanCacheEntry>>(new Map());
  const [lastScannedKey, setLastScannedKey] = useState<string | null>(null);  // "x:y" 刚扫的
  const [actionSubmitting, setActionSubmitting] = useState(false);
  const hasChanges = countTotalDiffs(scanCache) > 0;

  const staffSpecialStatusView = !!(
    html5PrivilegeBypass ||
    (jwtMode && hasMinRole(authStorage.getRole(), "STAFF"))
  );

  const specialStatusApiFn = useCallback(() => {
    return jwtMode
      ? fetchStudentMobileSpecialStatusOverview()
      : fetchMobileSpecialStatusOverview(token);
  }, [jwtMode, token]);

  useEffect(() => {
    if (!jwtMode && !token) return;
    setListLoading(true);
    setListError(null);

    const shelfPromise = jwtMode
      ? fetchStudentMobileCageShelvesAll()
      : fetchMobileCageShelvesAll(token!);

    // JWT 模式并行调用 full-tree（对齐小程序：不受快照有无影响，从网格表获取 type1~4）
    const treePromise = jwtMode
      ? fetchFullTree().catch(() => [] as any[])
      : Promise.resolve([] as any[]);

    Promise.all([shelfPromise, treePromise])
      .then(([d, treeRows]) => {
        const list = d.shelves ?? [];
        setShelves(list);
        if (d.scannedAt) setScannedAt(d.scannedAt);

        // 从 full-tree 构建类型计数索引（网格表兜底）
        const treeMap: Record<string, { type1: number; type2: number; type3: number; type4: number }> = {};
        for (const row of treeRows) {
          if (row.shelveId) {
            treeMap[String(row.shelveId)] = {
              type1: Number((row as any).type1 ?? 0),
              type2: Number((row as any).type2 ?? 0),
              type3: Number((row as any).type3 ?? 0),
              type4: Number((row as any).type4 ?? 0),
            };
          }
        }

        const map: Record<string, { type1: number; type2: number; type3: number; type4: number }> = {};
        const roomAgg: Record<string, { type1: number; type2: number; type3: number; type4: number }> = {};
        for (const s of list) {
          const tc = s.cageTypeCounts ?? {};
          let t1 = Number(tc["1"] ?? 0);
          let t2 = Number(tc["2"] ?? 0);
          let t3 = Number(tc["3"] ?? 0);
          let t4 = Number(tc["4"] ?? 0);
          // 快照无数据时回退到 full-tree 网格表计数（对齐小程序合并逻辑）
          if (t1 + t2 + t3 + t4 === 0) {
            const ft = treeMap[String(s.shelveId)];
            if (ft) { t1 = ft.type1; t2 = ft.type2; t3 = ft.type3; t4 = ft.type4; }
          }
          map[String(s.shelveId)] = { type1: t1, type2: t2, type3: t3, type4: t4 };
          const rk = `${s.campusName || "其他"}::${extractParentRoomKey(s.roomName || "其他")}`;
          const a = roomAgg[rk] ?? { type1: 0, type2: 0, type3: 0, type4: 0 };
          a.type1 += t1; a.type2 += t2; a.type3 += t3; a.type4 += t4;
          roomAgg[rk] = a;
        }
        for (const [rk, c] of Object.entries(roomAgg)) { map[`room:${rk}`] = c; }
        setShelfTypeCounts(map);
      })
      .catch((e) => setListError(e instanceof Error ? e.message : "加载失败"))
      .finally(() => setListLoading(false));
  }, [token, jwtMode, listReloadKey]);

  useEffect(() => {
    if ((!jwtMode && !token) || !selectedShelf || screen !== "grid") return;
    setDetailLoading(true);
    setDetailError(null);
    setDetail(null);
    (jwtMode
      ? fetchStudentMobileCageShelfDetail(selectedShelf.shelveId, editMode || bindMode)
      : fetchMobileCageShelfDetail(token!, selectedShelf.shelveId)
    )
      .then(setDetail)
      .catch((e) => setDetailError(e instanceof Error ? e.message : "加载笼架详情失败"))
      .finally(() => setDetailLoading(false));
  }, [token, jwtMode, selectedShelf, screen, detailReloadKey, editMode, bindMode]);

  const openShelf = (shelf: MobileCageShelfSummary) => {
    setSelectedShelf(shelf);
    setSelectedCell(null);
    setScreen("grid");
  };

  const toggleScanAction = useCallback((key: string, action: CageBoxAction) => {
    setScanCache((prev) => {
      const next = new Map(prev);
      const entry = next.get(key);
      if (!entry) return prev;
      const currentActions = new Set(entry.currentActions);
      if (currentActions.has(action)) currentActions.delete(action); else currentActions.add(action);
      next.set(key, { ...entry, currentActions });
      return next;
    });
  }, []);

  const removeScanCache = useCallback((key: string) => {
    setScanCache((prev) => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
    setLastScannedKey((prev) => prev === key ? null : prev);
  }, []);

  const handleCellClick = (cell: CageShelfCell) => {
    if (cell.empty) return;
    // bind 模式：case2=绑定(需扫码) / case3=解绑(需点解绑按钮)
    if (bindMode) {
      const cellType = (cell as any).animalCageType;
      if (cellType === 2) {
        if (unbindActive) { toast.error("当前是解绑模式，请先关闭"); return; }
        if (!bindScannedCode) {
          toast.error("请先扫码获取笼盒编号");
          return;
        }
        setBindSelectedKey(`${cell.x}:${cell.y}`);
        setSelectedCell(cell);
        return;
      }
      if (cellType === 3) {
        if (!unbindActive) { toast.error("请先点击「解绑」按钮进入解绑模式"); return; }
        setBindSelectedKey(`${cell.x}:${cell.y}`);
        setSelectedCell(cell);
        return;
      }
      toast.error(cellType === 1 ? "该笼位尚未预约" : cellType === 4 ? "该笼位状态异常" : "该笼位不可操作");
      return;
    }
    setSelectedCell(cell);
  };

  // ── 扫码结果处理 ──
  const handleScanResult = useCallback((text: string) => {
    // 编辑模式：匹配 grid → 加入缓存
    if (!detail?.grid) return;
    const matched = detail.grid.find((cell) => {
      if (cell.empty) return false;
      // 兼容嵌套 cageBoxVo 结构（对齐小程序：cageBoxCode 可能在 cageBoxVo 内）
      const cbi = cell.cageBoxInfo as Record<string, any> | undefined;
      let code = (cell as any).cageBoxCode ?? cbi?.cageBoxCode;
      if (!code) {
        const cvo = cbi?.cageBoxVo ?? cbi?.['cageBoxVo'] ?? {};
        code = cvo.cageBoxCode ?? cvo['cageBoxCode'] ?? '';
      }
      return String(code ?? "") === text;
    });
    if (!matched) {
      toast.error("未找到笼盒 " + text);
      setScanOpen(false);
      return;
    }
    const key = `${matched.x}:${matched.y}`;
    setScanCache((prev) => {
      const next = new Map(prev);
      if (!next.has(key)) {
        // 对齐小程序：从 cageBoxInfo 预选已有动作状态
        const cbi = matched.cageBoxInfo as Record<string, any> | undefined;
        const cvo = cbi?.cageBoxVo ?? cbi?.['cageBoxVo'] ?? {};
        const preActions = new Set<CageBoxAction>();
        if (cbi?.NeedDivideYn === 1 || cbi?.NeedDivideYn === "1" || cvo.needDivideYn === 1 || cvo.needDivideYn === "1")
          preActions.add("DIVIDE");
        if (cbi?.NeedFeedingYn === 1 || cbi?.NeedFeedingYn === "1" || cvo.needFeedingYn === 1 || cvo.needFeedingYn === "1"
            || (typeof cbi?.specialBreedingName === 'string' && cbi.specialBreedingName.trim())
            || (typeof cvo.specialBreedingName === 'string' && cvo.specialBreedingName.trim()))
          preActions.add("SPECIAL_BREEDING");
        if (cbi?.AbnormalHealthYn === 1 || cbi?.AbnormalHealthYn === "1" || cvo.abnormalHealthYn === 1 || cvo.abnormalHealthYn === "1"
            || cbi?.animalHealthEntity != null || cvo.animalHealthEntity != null)
          preActions.add("HEALTH_CHECK");
        next.set(key, { cell: matched, code: text, initialActions: new Set(preActions), currentActions: new Set(preActions) });
      }
      return next;
    });
    setLastScannedKey(key);
    setScanOpen(false);
  }, [detail]);

  // ── 绑定模式扫码：直接存编码 ──
  const handleBindScanResult = useCallback((text: string) => {
    console.log("[bind-scan] 扫码结果:", text);
    setBindScannedCode(text);
    setBindSelectedKey(null);
    setBindScanOpen(false);
    toast.success("已扫码: " + text);
  }, []);

  // ── 弹窗动作 → scanCache 同步（统一 tap/scan 为同一条缓存路径）──
  const syncDialogActionsToCache = useCallback((currentActions: Set<CageBoxAction>) => {
    if (!selectedCell) return;
    const ck = `${selectedCell.x}:${selectedCell.y}`;
    setScanCache((prev) => {
      const next = new Map(prev);
      const entry = next.get(ck);
      if (entry) {
        next.set(ck, { ...entry, currentActions });
      } else {
        // 点击格子（非扫码）→ 创建缓存条目，同时记录初始状态用于 diff
        const cbi = selectedCell.cageBoxInfo as Record<string, any> | undefined;
        const cvo = cbi?.cageBoxVo ?? cbi?.['cageBoxVo'] ?? {};
        const code = String((selectedCell as any).cageBoxCode ?? cbi?.cageBoxCode ?? cvo.cageBoxCode ?? cvo['cageBoxCode'] ?? '');
        // 从 cageBoxInfo 计算初始状态
        const initial = new Set<CageBoxAction>();
        if (cbi?.NeedDivideYn === 1 || cbi?.NeedDivideYn === "1" || cvo.needDivideYn === 1 || cvo.needDivideYn === "1") initial.add("DIVIDE");
        if (cbi?.NeedFeedingYn === 1 || cbi?.NeedFeedingYn === "1" || cvo.needFeedingYn === 1 || cvo.needFeedingYn === "1"
            || (typeof cbi?.specialBreedingName === 'string' && cbi.specialBreedingName.trim())
            || (typeof cvo.specialBreedingName === 'string' && cvo.specialBreedingName.trim())) initial.add("SPECIAL_BREEDING");
        if (cbi?.AbnormalHealthYn === 1 || cbi?.AbnormalHealthYn === "1" || cvo.abnormalHealthYn === 1 || cvo.abnormalHealthYn === "1"
            || cbi?.animalHealthEntity != null || cvo.animalHealthEntity != null) initial.add("HEALTH_CHECK");
        next.set(ck, { cell: selectedCell, code, initialActions: initial, currentActions });
      }
      return next;
    });
  }, [selectedCell]);
  const handleScanActionsSubmit = useCallback(async () => {
    if (!selectedShelf || scanCache.size === 0) return;
    setActionSubmitting(true);
    const meta = detail?.shelfMeta;
    const roomId = String((meta as any)?.roomId ?? selectedShelf.roomId ?? "");
    const shelveId = String(selectedShelf.shelveId);

    // 区分新增(0→1)和反选(1→0)
    const toAdd: { entry: ScanCacheEntry; action: CageBoxAction }[] = [];
    const toRemove: { entry: ScanCacheEntry; action: CageBoxAction }[] = [];
    for (const [, entry] of scanCache) {
      for (const a of entry.currentActions) {
        if (!entry.initialActions.has(a)) toAdd.push({ entry, action: a });
      }
      for (const a of entry.initialActions) {
        if (!entry.currentActions.has(a)) toRemove.push({ entry, action: a });
      }
    }
    if (toAdd.length === 0 && toRemove.length === 0) { setActionSubmitting(false); return; }

    let okCount = 0, failCount = 0;
    // 新增
    for (const { entry, action } of toAdd) {
      try {
        await executeCageBoxAction({ roomId, shelveId, cageBoxCode: entry.code, action });
        okCount++;
      } catch (e: any) {
        toast.error(`${displayPosition(entry.cell.position)} ${action}: ${e?.message || "失败"}`);
        failCount++;
      }
    }
    // 取消（反选）
    for (const { entry, action } of toRemove) {
      const color = ACTION_CANCEL_COLOR[action];
      try {
        await cancelCageBoxColor(roomId, shelveId, entry.code, color);
        okCount++;
      } catch (e: any) {
        toast.error(`${displayPosition(entry.cell.position)} 取消${action}: ${e?.message || "失败"}`);
        failCount++;
      }
    }
    if (failCount === 0) {
      toast.success(`已完成 ${okCount} 个操作`);
      setScanCache(new Map());
      setLastScannedKey(null);
      setDetailReloadKey((k) => k + 1);
    } else {
      toast(`${okCount} 成功 / ${failCount} 失败`, { icon: '⚠️' });
    }
    setActionSubmitting(false);
  }, [selectedShelf, detail, scanCache]);

  // ── 绑定模式提交 ──
  const handleBindConfirm = useCallback(async () => {
    if (!selectedCell || !bindScannedCode || !selectedShelf) return;
    const cellType = (selectedCell as any).animalCageType;
    if (cellType !== 2) { toast.error("只能绑定到「已预约(空笼盒)」的笼位"); return; }

    setBindSubmitting(true);
    try {
      const cageData: any = detail?.grid?.find((c) => c.x === selectedCell.x && c.y === selectedCell.y) ?? selectedCell;
      const cageId = String((cageData as any).id ?? "");
      const cageName = String((cageData as any).name ?? "");
      const meta = detail?.shelfMeta;
      const roomId = String((meta as any)?.roomId ?? selectedShelf.roomId ?? "");
      const shelveId = String(selectedShelf.shelveId ?? "");

      console.log("[bind-confirm] animalCageId:", cageId, "cageBoxCode:", bindScannedCode);

      await bindCageBox(cageId, bindScannedCode);
      await updateAnimalCage({
        id: cageId, name: cageName, roomId, shelveId,
        postionX: selectedCell.x, postionY: selectedCell.y,
        qrcode: bindScannedCode, state: 3,
      });
      toast.success("绑定成功！");
      setBindScannedCode("");
      setBindSelectedKey(null);
      setSelectedCell(null);
      setDetailReloadKey((k) => k + 1); // 先刷新（bindMode 仍为 true 拉实时）
      setBindMode(false); // 再退出
    } catch (e: any) {
      toast.error(e?.message || "绑定失败");
    } finally {
      setBindSubmitting(false);
    }
  }, [selectedCell, bindScannedCode, selectedShelf, detail]);

  // ── 绑定模式解绑提交 ──
  const handleUnbindConfirm = useCallback(async () => {
    if (!selectedCell || !selectedShelf) return;
    const cellType = (selectedCell as any).animalCageType;
    if (cellType !== 3) { toast.error("只能解绑「已预约(饲养中)」的笼位"); return; }

    setBindSubmitting(true);
    try {
      const cageData: any = detail?.grid?.find((c) => c.x === selectedCell.x && c.y === selectedCell.y) ?? selectedCell;
      const cageId = String((cageData as any).id ?? "");
      const cageName = String((cageData as any).name ?? "");
      const meta = detail?.shelfMeta;
      const roomId = String((meta as any)?.roomId ?? selectedShelf.roomId ?? "");
      const shelveId = String(selectedShelf.shelveId ?? "");

      await updateAnimalCage({
        id: cageId, name: cageName, roomId, shelveId,
        postionX: selectedCell.x, postionY: selectedCell.y,
        qrcode: "", state: 2,
      });
      toast.success("解绑成功！");
      setBindSelectedKey(null);
      setSelectedCell(null);
      setDetailReloadKey((k) => k + 1);
    } catch (e: any) {
      toast.error(e?.message || "解绑失败");
    } finally {
      setBindSubmitting(false);
    }
  }, [selectedCell, selectedShelf, detail]);

  // ── 返回列表：检查未保存修改 ──
  const goBackToList = useCallback(() => {
    if (hasChanges) {
      if (!window.confirm("有未提交的扫码修改，是否放弃？\n\n「确定」放弃并返回\n「取消」继续编辑")) return;
    }
    setScanCache(new Map());
    setLastScannedKey(null);
    setEditMode(false);
    // 绑定模式退出清空
    setBindMode(false);
    setBindScannedCode("");
    setBindSelectedKey(null);
    setUnbindActive(false);
    setScreen("list");
    setSelectedCell(null);
    setDetailError(null);
  }, [hasChanges]);

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
            scannedAt={scannedAt}
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
              staffView={staffSpecialStatusView}
              scanOpen={scanOpen}
              onOpenScan={() => setScanOpen(true)}
              onCloseScan={() => setScanOpen(false)}
              scanCache={scanCache}
              lastScannedKey={lastScannedKey}
              onScanResult={handleScanResult}
              onActionSubmit={handleScanActionsSubmit}
              actionSubmitting={actionSubmitting}
              onToggleAction={toggleScanAction}
              onRemoveCache={removeScanCache}
              editMode={editMode}
              bindMode={bindMode}
              bindSelectedKey={bindSelectedKey}
              bindScanOpen={bindScanOpen}
              onOpenBindScan={() => setBindScanOpen(true)}
              onCloseBindScan={() => setBindScanOpen(false)}
              onBindScanResult={handleBindScanResult}
              unbindActive={unbindActive}
              onToggleUnbind={() => { setUnbindActive((v) => !v); setBindSelectedKey(null); setSelectedCell(null); }}
              onToggleRealtime={async () => {
                const next = !editMode;
                // 退出编辑模式且有未提交修改 → 弹窗确认
                if (!next && hasChanges) {
                  if (!window.confirm("有未提交的修改，是否放弃？\n\n「确定」放弃修改并退出\n「取消」继续编辑")) return;
                }
                setEditMode(next);
                if (next && selectedShelf) {
                  try {
                    await refreshShelfDetail(selectedShelf.shelveId);
                    setDetailReloadKey((k) => k + 1);
                  } catch { /* 静默 */ }
                } else {
                  setScanCache(new Map());
                  setLastScannedKey(null);
                }
              }}
              onToggleBindMode={() => {
                if (bindMode) {
                  setBindMode(false); setBindScannedCode(""); setBindSelectedKey(null);
                  setSelectedCell(null); setUnbindActive(false);
                } else {
                  setBindMode(true);
                }
              }}
            />
          </div>
        )}

        {selectedCell && selectedShelf && !bindMode && (
          <MobileCageCellDetailDialog
            token={token}
            jwtMode={jwtMode}
            shelveId={selectedShelf.shelveId}
            cell={selectedCell}
            gridMeta={detail?.shelfMeta ?? null}
            onClose={() => setSelectedCell(null)}
            staffView={staffSpecialStatusView}
            editMode={editMode}
            roomId={String((detail?.shelfMeta as any)?.roomId ?? selectedShelf.roomId ?? "")}
            cachedActions={selectedCell ? scanCache.get(`${selectedCell.x}:${selectedCell.y}`)?.currentActions : undefined}
            initialCachedActions={selectedCell ? scanCache.get(`${selectedCell.x}:${selectedCell.y}`)?.initialActions : undefined}
            onCacheUpdate={syncDialogActionsToCache}
          />
        )}

        <MobileSpecialStatusPanel
          open={specialStatusOpen}
          onClose={() => setSpecialStatusOpen(false)}
          apiFn={specialStatusApiFn}
          variant={staffSpecialStatusView ? "staff" : "student"}
        />

        {/* ── 绑定模式确认栏：case2=绑定 / case3=解绑 ── */}
        {bindMode && selectedCell && (() => {
          const cellType = (selectedCell as any).animalCageType;
          const isBind = cellType === 2 && bindScannedCode && !unbindActive;
          const isUnbind = cellType === 3 && unbindActive;
          if (!isBind && !isUnbind) return null;
          const accentColor = isBind ? "#2563eb" : "#dc2626";
          const label = isBind ? "绑定确认" : "解绑确认";
          const actionLabel = isBind ? "确认绑定" : "确认解绑";
          const handler = isBind ? handleBindConfirm : handleUnbindConfirm;
          return (
            <div className="fixed bottom-0 left-0 right-0 z-[var(--z-modal)] p-3"
              style={{ background: "rgba(255,255,255,0.96)", borderTop: "1px solid var(--app-color-border)" }}>
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-[var(--app-color-text-secondary)]">{label}</div>
                  <div className="text-sm font-semibold text-[var(--app-color-text-primary)]">
                    {isBind
                      ? `笼盒 ${bindScannedCode} → 笼位 ${selectedCell.position}`
                      : `笼位 ${selectedCell.position} 解绑并恢复空笼盒`}
                  </div>
                  {(selectedCell as any).piName && (
                    <div className="text-xs text-[var(--app-color-text-secondary)]">
                      PI: {(selectedCell as any).piName}
                    </div>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => { setBindSelectedKey(null); setSelectedCell(null); }}
                    className="px-4 py-2 rounded-[var(--app-radius-container)] text-sm text-[var(--app-color-text-secondary)] bg-[var(--app-color-surface-raised)]">
                    取消
                  </button>
                  <button
                    onClick={handler}
                    disabled={bindSubmitting}
                    className="px-4 py-2 rounded-[var(--app-radius-container)] text-sm text-white font-semibold disabled:opacity-50"
                    style={{ background: accentColor }}>
                    {bindSubmitting ? "处理中..." : actionLabel}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </CageColorProvider>
  );
});
