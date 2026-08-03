/** 手机版 — 笼架 Tab（列表 → 8×10 网格页 → 笼盒详情弹窗） */
import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, LayoutGrid, Loader2, RefreshCw, Search, WifiOff, Scan, AlertCircle, Check, X as XIcon } from "lucide-react";
import { authHttp } from "@/api/core/authHttp";
import { cn } from "@/lib/utils";
import type { CageShelfCell, CageShelfDetail } from "@/api/domains/cageShelf.api";
import {
  fetchMobileCageShelvesAll,
  fetchMobileSpecialStatusOverview,
  type MobileCageShelfSummary,
} from "@/api/domains/mobileStudent.api";
import {
  fetchStudentMobileCageShelvesAll,
  fetchStudentMobileSpecialStatusOverview,
} from "@/api/domains/studentMobile.api";
import CageCellOverlays, {
  CAGE_TYPE_LABEL,
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
import { fetchFullTree, fetchLocalShelfGridByShelveId, localEdit, localBind, localUnbind, localAnnotate, bindCageBox, unbindCageBox, type CageBoxAction } from "@/api/domains/cageShelf.api";
import toast from "react-hot-toast";
import { buildPlaceholderGridCells } from "./mobileCageShelfGrid";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

const PAGE_BG = "#eef0f6";
const BRAND = "#ac1736";

/** 坐标显示反转：后端 A-1(顶行) → 显示 A-10(底行)，兼容数字格式 1-1 → A-10 */
function displayPosition(pos: string): string {
  const m1 = pos.match(/^([A-H])-(\d+)$/);
  if (m1) return `${m1[1]}-${11 - parseInt(m1[2])}`;
  const m2 = pos.match(/^(\d+)-(\d+)$/);
  if (m2) { const col = String.fromCharCode(64 + parseInt(m2[1])); return `${col}-${11 - parseInt(m2[2])}`; }
  return pos;
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

  const hasCacheActions = cachedActions && cachedActions.size > 0;
  const ringColor = isLastScanned ? "#ac1736" : hasCacheActions ? "#d97706" : null;
  const ringShadow = isLastScanned ? "rgba(172,23,54,0.5)" : hasCacheActions ? "rgba(217,119,6,0.45)" : null;

  const dominant = getDominantStatusCode(cell.specialStatuses, cell.cageBoxInfo);
  const computedStyle = useStatusStyle(dominant);
  const safeStyle = computedStyle ?? { backgroundColor: DEFAULT_COLORS.NORMAL.bg, borderColor: DEFAULT_COLORS.NORMAL.border, borderWidth: 2 } as React.CSSProperties;

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

  // ── 统一盒模型：空位和占位都用 <button>，杜绝 div/button 盒模型偏差 ──
  const hit = isLastScanned || hasCacheActions;
  const isEmpty = cell.empty;

  return (
    <button
      type="button"
      disabled={isEmpty}
      className={cn(
        // 基础：w-full 撑满 grid 列宽 + aspect-square 保证 1:1 + overflow-hidden 防撑大
        "relative w-full aspect-square rounded-md text-[11px] leading-tight transition box-border overflow-hidden",
        // 空位外观
        isEmpty && "border border-[var(--student-hairline)] bg-[var(--student-canvas-soft)] text-[var(--student-mute)]",
        // 有内容格外观
        !isEmpty && cell.visible !== false && "ring-1 ring-[var(--student-primary-muted)]",
        !isEmpty && cageCardTone(cell),
        // 编辑扫描高亮
        hit && "scale-[1.05] z-10",
        isCached && hasCacheActions && !isLastScanned && "ring-2 ring-[#d97706]/50 shadow-[0_0_4px_rgba(217,119,6,0.15)]",
        isInCross && !hit && "ring-2 ring-[#ac1736]/40 shadow-[0_0_4px_rgba(172,23,54,0.1)]",
        isBindHighlight && "scale-[1.05] z-10 ring-2 ring-[#2563eb] shadow-[0_0_10px_rgba(37,99,235,0.3)]",
      )}
      style={isEmpty
        ? (isInCross ? { backgroundColor: "rgba(172,23,54,0.1)" } : undefined)
        : hit ? {
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
          } : statusStyle
      }
      onClick={isEmpty ? undefined : onSelect}
      title={isEmpty ? displayPosition(cell.position) : tooltip}
    >
      {!isEmpty && <CageCellOverlays animalCageType={cell.animalCageType} compact />}
      <div className="flex flex-col items-center justify-center gap-0.5 px-0.5 py-0.5 text-center w-full h-full">
        <div className="w-full font-bold text-[10px] leading-tight">{displayPosition(cell.position)}</div>
        {isEmpty ? (
          <div className="text-[8px]">空位</div>
        ) : cell.visible !== false ? (
          <>
            {nonEmptyText(piName) && (
              <div className="w-full truncate text-[9px] font-semibold leading-tight"
                style={{ color: "var(--app-color-text-primary, #1e293b)" }}>{piName}</div>
            )}
            {nonEmptyText(statusLabel) && (
              <div className="w-full truncate text-[8px] leading-tight"
                style={{ color: "var(--app-color-text-secondary, #475569)" }}>{statusLabel}</div>
            )}
          </>
        ) : (
          <div className="text-[9px] text-[var(--student-mute)]">***</div>
        )}
        {!isEmpty && (
          <div className="w-full text-[8px] opacity-70 truncate leading-tight">
            {CAGE_TYPE_LABEL[cell.animalCageType ?? 0] || cageTypeLabel(cell.animalCageType)}
          </div>
        )}
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
  autoExpandRoomName,
  autoExpandCampusName,
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
  autoExpandRoomName?: string;
  autoExpandCampusName?: string;
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
  }, [searchQuery]);

  // 扫码跳转：自动展开到目标 campus/room
  useEffect(() => {
    if (!autoExpandRoomName && !autoExpandCampusName) return;
    const cn = autoExpandCampusName || '';
    const rn = autoExpandRoomName || '';
    for (const cg of campusGroups) {
      if (cn && cg.key !== cn) continue;
      setExpandedCampuses((prev) => ({ ...prev, [cg.key]: true }));
      for (const rg of cg.rooms) {
        if (rn && rg.roomName !== rn) continue;
        setExpandedRooms((prev) => ({ ...prev, [rg.key]: true }));
      }
    }
  }, [autoExpandRoomName, autoExpandCampusName, campusGroups]);

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
  onToggleAction, onRemoveCache, onDismissCrosshair, editMode, onToggleRealtime,
  bindMode, onToggleBindMode, bindSelectedKey,
  bindScanOpen, onOpenBindScan, onCloseBindScan, onBindScanResult,
  unbindActive, onToggleUnbind, bindScannedCode,
  bindPairCache, bindPairCacheSize, onBatchBindSubmit, onClearBindCache, onRemoveBindPair, bindSubmitting,
  unbindPairCache, unbindPairCacheSize, onBatchUnbindSubmit, onClearUnbindCache, onRemoveUnbindPair,
  scanLockHighlight,
  scanLocateOpen, onOpenScanLocate, onCloseScanLocate, onScanLocateResult,
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
  onDismissCrosshair: () => void;
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
  bindScannedCode?: string;
  bindPairCacheSize?: number;
  onBatchBindSubmit?: () => void;
  onClearBindCache?: () => void;
  onRemoveBindPair?: (key: string) => void;
  bindPairCache?: Map<string, { cell: CageShelfCell; code: string }>;
  bindSubmitting?: boolean;
  unbindPairCache?: Set<string>;
  unbindPairCacheSize?: number;
  onBatchUnbindSubmit?: () => void;
  onClearUnbindCache?: () => void;
  onRemoveUnbindPair?: (key: string) => void;
  scanLockHighlight?: { sid: string; x: number; y: number } | null;
  scanLocateOpen?: boolean;
  onOpenScanLocate?: () => void;
  onCloseScanLocate?: () => void;
  onScanLocateResult?: (text: string) => void;
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
      <style>{`@keyframes scan-flash{0%{opacity:0.2;transform:scale(0.95)}30%{opacity:0.85;transform:scale(1.03)}100%{opacity:0.35;transform:scale(1)}}.scan-flash-overlay{animation:scan-flash 0.5s ease-in-out 2;pointer-events:none}`}</style>
      {/* ── 顶栏：始终保留扫码按钮 ── */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b"
        style={{ background: "rgba(255,255,255,0.92)", borderColor: "rgba(30,55,90,0.06)" }}>
        {/* 返回由 shell MobileTopNavBar 统管，此处不再重复 */}
        {/* 编辑按钮 — 最左侧，独立排布（绑定时隐藏） */}
        {staffView && !bindMode && (
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
                  color: unbindActive ? "#fff" : (bindScannedCode ? "#ef4444" : "#dc2626"),
                  background: unbindActive ? "#dc2626" : "rgba(220,38,38,0.1)",
                  border: `1px solid ${unbindActive ? "#dc2626" : "rgba(220,38,38,0.25)"}`,
                }}
                onClick={onToggleUnbind}>
                {(unbindActive||bindScannedCode) ? "取消" : "解绑"}
              </button>
              {!unbindActive && bindPairCacheSize != null && bindPairCacheSize > 0 && <>
                <button type="button" onClick={onBatchBindSubmit} disabled={bindSubmitting}
                  className="flex items-center gap-1 shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold text-white active:scale-95 transition disabled:opacity-50"
                  style={{ background: "#16a34a" }}>
                  {bindSubmitting ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" strokeWidth={3} />}
                  提交({bindPairCacheSize})
                </button>
                <button type="button" onClick={onClearBindCache}
                  className="shrink-0 rounded-full px-2 py-1 text-[10px] text-slate-500 active:text-red-500 transition">清空</button>
              </>}
              {/* 解绑批量提交 */}
              {unbindActive && unbindPairCacheSize != null && unbindPairCacheSize > 0 && <>
                <button type="button" onClick={onBatchUnbindSubmit} disabled={bindSubmitting}
                  className="flex items-center gap-1 shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold text-white active:scale-95 transition disabled:opacity-50"
                  style={{ background: "#dc2626" }}>
                  {bindSubmitting ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" strokeWidth={3} />}
                  提交({unbindPairCacheSize})
                </button>
                <button type="button" onClick={onClearUnbindCache}
                  className="shrink-0 rounded-full px-2 py-1 text-[10px] text-slate-500 active:text-red-500 transition">清空</button>
              </>}
            </>
          )}
        </div>
      </div>

      {/* ── 编辑模式缓存预览 ── */}
      {editMode && scanCache.size > 0 && (
        <div className="shrink-0 px-3 pt-1.5 pb-0.5 overflow-x-auto" style={{ WebkitOverflowScrolling: "touch" }}>
          <div className="flex gap-1.5">
            {Array.from(scanCache.entries()).map(([key, entry]) => {
              const diffs = Array.from(entry.currentActions).filter(a => !entry.initialActions.has(a));
              const removes = Array.from(entry.initialActions).filter(a => !entry.currentActions.has(a));
              const changed = diffs.length + removes.length;
              if (changed === 0) return null;
              return (
                <div key={key} className="shrink-0 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                  style={{ background: "rgba(172,23,54,0.08)", color: BRAND, border: "1px solid rgba(172,23,54,0.2)" }}>
                  <span>{displayPosition(entry.cell.position || key)}</span>
                  {changed > 0 && <span className="text-[9px] text-white px-1 rounded-full" style={{ background: BRAND }}>{changed}</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 图例 ── */}
      {showLegend && <div className="shrink-0 px-3 pt-2"><CageShelfLegend collapsed /></div>}

      {/* ── 批量绑定缓存面板 ── */}
      {bindMode && !unbindActive && bindPairCacheSize != null && bindPairCacheSize > 0 && (
        <div className="shrink-0 px-3 pt-2 pb-1">
          <div className="flex flex-wrap gap-1.5">
            {Array.from(bindPairCache?.entries() ?? []).map(([key, { cell, code }]) => (
              <div key={key} className="rounded-lg px-2.5 py-1.5 text-[11px] bg-green-50 border border-green-200 flex items-center gap-1.5">
                <span className="font-mono font-bold text-green-700">{code}</span>
                <span className="text-[#969799]">→</span>
                <span className="font-semibold text-[#1e293b]">{cell.position}</span>
                <button type="button" onClick={() => onRemoveBindPair?.(key)}
                  className="ml-1 text-xs text-[#969799] hover:text-red-500">✕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 网格 ── */}
      <div className="flex-1 min-h-0 overflow-y-auto px-2 py-3">
        {loading ? <div className="flex items-center justify-center py-20"><Loader2 className="size-6 animate-spin" style={{ color: "#94a3b8" }} /></div>
        : error ? <div className="flex flex-col items-center justify-center gap-3 py-16"><WifiOff className="size-10" style={{ color: "#c8c9cc" }} /><p className="text-xs text-center px-4" style={{ color: "#969799" }}>{error}</p><button type="button" onClick={onRetry} className="px-5 py-2 rounded-full text-white text-sm font-medium" style={{ background: `linear-gradient(135deg, ${BRAND}, #8B1229)` }}>重新加载</button></div>
        : <div className="rounded-xl p-1.5" style={{ background: "rgba(255,255,255,0.85)", border: "1px solid rgba(30,55,90,0.06)", boxShadow: "0 2px 8px rgba(15,23,42,0.04)" }}>
            <div className="grid grid-cols-8 gap-[3px]">
              {cells.map((cell) => {
                const ck = `${cell.x}:${cell.y}`;
                const cacheEntry = scanCache.get(ck);
                const isLockHighlight = !!(
                  scanLockHighlight &&
                  scanLockHighlight.sid === String(detail?.shelfMeta?.shelveId) &&
                  scanLockHighlight.x === cell.x &&
                  scanLockHighlight.y === cell.y
                );
                return (
                  <div key={cell.position} className="relative">
                    <GridCellButton cell={cell} onSelect={() => onCellClick(cell)}
                      crossCol={crossX} crossRow={crossY}
                      isCached={cachedKeys.has(ck)}
                      isLastScanned={ck === lastScannedKey}
                      cachedActions={cacheEntry?.currentActions}
                      isBindHighlight={bindSelectedKey === ck}
                    />
                    {isLockHighlight && (
                      <div className="absolute inset-0 z-10 rounded-md ring-[4px] ring-red-500/80 shadow-[0_0_16px_rgba(239,68,68,0.5)] scan-flash-overlay" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>}
      </div>

      {/* ── 扫码定位 FAB（右下悬浮圆形按钮，底距 = Tab栏50px + 安全区 + 16px人体工学间距）── */}
      {staffView && !editMode && !bindMode && (
        <button
          type="button"
          onClick={onOpenScanLocate}
          className="fixed right-4 flex items-center justify-center rounded-full active:scale-95 transition-transform"
          style={{
            width: 48,
            height: 48,
            bottom: "calc(50px + env(safe-area-inset-bottom, 0px) + 16px)",
            background: BRAND,
            boxShadow: "0 4px 16px rgba(172,23,54,0.35)",
            zIndex: 50,
          }}
          aria-label="扫码定位"
        >
          <Scan className="size-6 text-white" strokeWidth={1.5} />
        </button>
      )}

      <MobileScanDialog open={scanOpen} onClose={onCloseScan} onResult={onScanResult} />
      {bindScanOpen && <MobileScanDialog open={bindScanOpen} onClose={onCloseBindScan!} onResult={onBindScanResult!} />}
      {scanLocateOpen && <MobileScanDialog open={scanLocateOpen} onClose={onCloseScanLocate!} onResult={onScanLocateResult!} />}
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
  /** 扫码跳转目标：设置后自动打开对应笼架网格并高亮指定笼位 */
  jumpTarget?: { shelveId?: string; x: number; y: number; campusName?: string; roomName?: string } | null;
  onJumpConsumed?: () => void;
}

export default forwardRef<MobileCageShelfTabHandle, MobileCageShelfTabProps>(
  function MobileCageShelfTab({ token, jwtMode, html5PrivilegeBypass = false, onScreenChange, jumpTarget, onJumpConsumed }, ref) {
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
  const [bindConfirmOpen, setBindConfirmOpen] = useState(false);
  const [unbindActive, setUnbindActive] = useState(false);
  const [bindPairCache, setBindPairCache] = useState<Map<string, {cell: CageShelfCell; code: string}>>(new Map());
  const [unbindPairCache, setUnbindPairCache] = useState<Set<string>>(new Set());
  const [unbindCells, setUnbindCells] = useState<Map<string, CageShelfCell>>(new Map());
  const [scanCache, setScanCache] = useState<Map<string, ScanCacheEntry>>(new Map());
  const [lastScannedKey, setLastScannedKey] = useState<string | null>(null);  // "x:y" 刚扫的
  const [actionSubmitting, setActionSubmitting] = useState(false);
  const [scanLocateOpen, setScanLocateOpen] = useState(false);
  const [scanLockHighlight, setScanLockHighlight] = useState<{sid: string; x: number; y: number} | null>(null);
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
          // 优先用本地DB计数（full-tree 已改为 cage_cell_detail），快照做兜底
          const ft = treeMap[String(s.shelveId)];
          if (ft && ft.type1 + ft.type2 + ft.type3 + ft.type4 > 0) {
            t1 = ft.type1; t2 = ft.type2; t3 = ft.type3; t4 = ft.type4;
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
    // 本地DB数据源 — 秒加载
    fetchLocalShelfGridByShelveId(String(selectedShelf.shelveId))
      .then((d) => { setDetail(d); })
      .catch((e) => { console.error('[detail] error:', e); setDetailError(e instanceof Error ? e.message : "加载笼架详情失败"); })
      .finally(() => setDetailLoading(false));
  }, [token, jwtMode, selectedShelf, screen, detailReloadKey, editMode, bindMode]);

  const openShelf = (shelf: MobileCageShelfSummary) => {
    setSelectedShelf(shelf);
    setSelectedCell(null);
    setScanLockHighlight(null);
    setScreen("grid");
  };

  // ── 扫码跳转：用 campusName+roomName 找到列表中的 shelf → 走 openShelf 正常链路 ──
  const [jumpProcessed, setJumpProcessed] = useState(false);
  useEffect(() => {
    if (!jumpTarget || jumpProcessed || shelves.length === 0) return;
    const target = jumpTarget;

    // 用 campusName + roomName 匹配（shelveId 体系不同，不可靠）
    const cn = target.campusName || '';
    const rn = target.roomName || '';
    const shelf = shelves.find((s) => {
      return (!cn || (s.campusName || '') === cn) && (!rn || (s.roomName || '') === rn);
    });

    if (!shelf) return;

    setSelectedShelf(shelf);
    setScreen("grid");
    setJumpProcessed(true);
    // 不在这里清 jumpTarget — 等 grid 加载完设高亮后再清
  }, [jumpTarget, shelves, jumpProcessed]);

  // grid 加载完成后设置高亮，然后清 jumpTarget
  useEffect(() => {
    if (!jumpProcessed || !detail || screen !== "grid" || detailLoading) return;
    if (!jumpTarget) return;
    setLastScannedKey(`${jumpTarget.x}:${jumpTarget.y}`);
    onJumpConsumed?.();  // 高亮已设，可以清理了
  }, [jumpProcessed, detail, screen, detailLoading, jumpTarget, onJumpConsumed]);

  // 重置 jumpProcessed 当 jumpTarget 变化时
  useEffect(() => {
    if (jumpTarget) setJumpProcessed(false);
  }, [jumpTarget]);

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

  /** 仅关闭十字交叉高亮（保留有 diff 的缓存条目） */
  const dismissCrosshair = useCallback(() => {
    setScanCache((prev) => {
      const next = new Map(prev);
      for (const [k, e] of prev) {
        if (!entryHasDiff(e)) next.delete(k);
      }
      return next;
    });
    setLastScannedKey(null);
  }, []);

  // ── 编辑模式：当前正在编辑的笼位（action popup 目标）──
  const [editActionCell, setEditActionCell] = useState<CageShelfCell | null>(null);
  const [actionPhotos, setActionPhotos] = useState<string[]>([]);
  const [actionNote, setActionNote] = useState("");
  const [actionUploading, setActionUploading] = useState(false);
  const [editHistory, setEditHistory] = useState<any[]>([]);
  const [editHistoryLoading, setEditHistoryLoading] = useState(false);

  const loadEditHistory = useCallback((cageId: string) => {
    if (!cageId) { setEditHistory([]); setEditHistoryLoading(false); return; }
    setEditHistoryLoading(true);
    authHttp.get(`/local/history/${cageId}`).then(r => {
      const list = (r.data?.success ? r.data.data : []) || [];
      list.forEach((h: any) => {
        try { h._imgs = JSON.parse(h.imagesJson || '[]'); } catch { h._imgs = []; }
        if (h.createdAt) h.createdAt = (h.createdAt || '').substring(0, 16);
      });
      setEditHistory(list);
    }).catch(() => setEditHistory([]))
    .finally(() => setEditHistoryLoading(false));
  }, []);

  const handleEditHistoryDelete = useCallback((id: number) => {
    if (!confirm("确定删除该条历史记录？")) return;
    authHttp.delete(`/local/history/${id}`).then(() => {
      setEditHistory(p => p.filter(h => h.id !== id));
      toast.success("已删除");
    }).catch(() => toast.error("删除失败"));
  }, []);

  const handleCellClick = (cell: CageShelfCell) => {
    if (cell.empty) return;
    // bind 模式：case2=绑定(需扫码) / case3=解绑(需点解绑按钮)
    if (bindMode) {
      const cellType = (cell as any).animalCageType;
      // 绑定：加入批量缓存
      if (cellType === 2) {
        if (unbindActive) { toast.error("无需解绑"); return; }
        if (!bindScannedCode) { toast.error("请先扫码获取笼盒编号"); return; }
        const ck = `${cell.x}:${cell.y}`;
        if (bindPairCache.has(ck)) { toast.error("该笼位已在缓存中"); return; }
        setBindPairCache(prev => { const next = new Map(prev); next.set(ck, { cell, code: bindScannedCode }); return next; });
        setBindScannedCode("");
        setBindSelectedKey(`${cell.x}:${cell.y}`);
        toast.success(`已缓存 (${bindPairCache.size + 1} 个待提交)`);
        return;
      }
      // 解绑：加入批量缓存
      if (cellType === 3) {
        if (!unbindActive) { toast.error("请先进入解绑模式"); return; }
        const ck = `${cell.x}:${cell.y}`;
        if (unbindPairCache.has(ck)) { toast.error("该笼位已在缓存中"); return; }
        setUnbindPairCache(prev => { const next = new Set(prev); next.add(ck); return next; });
        setUnbindCells(prev => { const next = new Map(prev); next.set(ck, cell); return next; });
        setBindSelectedKey(`${cell.x}:${cell.y}`);
        toast.success(`已缓存 (${unbindPairCache.size + 1} 个待解绑)`);
        return;
      }
      toast.error(cellType === 1 ? "该笼位尚未预约" : cellType === 4 ? "该笼位状态异常" : "该笼位不可操作");
      return;
    }
    // 编辑模式：点击单元格 → 打开 action popup（3 个 chip + 上传）
    if (editMode) {
      openEditActionPopup(cell);
      return;
    }
    // 普通模式：打开详情弹窗
    setSelectedCell(cell);
  };

  // ── 扫码结果处理 ──
  // 编辑操作弹窗：打开时从 /local/annotate 加载备注和照片（非 cell.detail）
  const openEditActionPopup = useCallback((cell: CageShelfCell) => {
    setActionPhotos([]);
    setActionNote("");
    setEditActionCell(cell);
    const cageId = String((cell as any).id ?? (cell as any).animalCageId ?? "");
    if (cageId) {
      authHttp.get(`/local/annotate/${cageId}`).then(r => {
        if (r.data?.success) {
          const d = r.data.data;
          if (d.statusPhotos) {
            try {
              const sp = typeof d.statusPhotos === "string" ? JSON.parse(d.statusPhotos) : d.statusPhotos;
              if (typeof sp._note === "string") setActionNote(sp._note); else setActionNote("");
              const all: string[] = [];
              for (const k of Object.keys(sp)) { if (k !== "_note" && Array.isArray(sp[k])) all.push(...sp[k]); }
              if (all.length > 0) setActionPhotos(all); else setActionPhotos([]);
            } catch { setActionNote(""); setActionPhotos([]); }
          } else { setActionNote(""); setActionPhotos([]); }
        }
      }).catch(() => {});
      loadEditHistory(cageId);
    }
  }, [loadEditHistory]);

  // 关闭编辑弹窗时自动保存照片和备注（不依赖提交）
  const saveAndCloseActionPopup = useCallback(async () => {
    const cell = editActionCell;
    if (cell && (actionPhotos.length > 0 || actionNote.trim())) {
      const cageId = String((cell as any).id ?? (cell as any).animalCageId ?? "");
      if (cageId) {
        const ld2 = (cell as any).detail as Record<string,any>|undefined;
        // 合并后端的已有 statusPhotos，不覆盖其他 key 的照片
        let sp: Record<string,string[]> = {};
        try {
          const r = await authHttp.get(`/local/annotate/${cageId}`);
          if (r.data?.success && r.data.data?.statusPhotos) {
            const existing = JSON.parse(r.data.data.statusPhotos);
            if (typeof existing === "object") sp = existing;
          }
        } catch {}
        // 激活的状态 → 写入对应 key；同时 _status 兜底
        if (ld2?.needsDivision===true) sp.needs_division = actionPhotos;
        if (ld2?.needsSpecialFeeding===true) sp.needs_special_feeding = actionPhotos;
        if (ld2?.hasHealthAbnormality===true) sp.has_health_abnormality = actionPhotos;
        if (actionPhotos.length > 0) sp._status = actionPhotos;
        if (actionNote.trim()) (sp as any)._note = actionNote;
        const body: Record<string,any> = { animalCageId: cageId, statusPhotos: JSON.stringify(sp) };
        try { await authHttp.post("/local/annotate", body); } catch { /* 静默 */ }
      }
    }
    setEditActionCell(null); setActionPhotos([]); setActionNote("");
  }, [editActionCell, actionPhotos, actionNote]);

  const handleActionPhotoUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files; if (!files?.length) return;
    setActionUploading(true);
    try {
      const urls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const fd = new FormData();
        fd.append("file", files[i]);
        const r = await authHttp.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
        if (r.data?.success && r.data.data?.url) urls.push(r.data.data.url);
      }
      if (urls.length) {
        const np = [...actionPhotos, ...urls];
        setActionPhotos(np);
        // 不再自动保存，统一由「保存标注」按钮提交
      }
    } catch { toast.error("上传失败"); }
    finally { setActionUploading(false); }
  }, [actionPhotos, editActionCell]);

  const handleScanResult = useCallback(async (text: string) => {
    if (!detail?.grid) return;
    const code = text.trim(); if (!code) return;

    // 本地DB扫码检索 — 支持笼盒码和笼位ID
    try {
      const r = await authHttp.get("/local/scan-lookup", { params: { code } });
      if (!r.data?.success || r.data.data?.type === "NOT_FOUND") {
        toast.error("未找到对应笼位: " + code);
        setScanOpen(false);
        return;
      }
      const d = r.data.data;
      // 在 grid 中按坐标匹配
      const matched = detail.grid.find((c: any) => c.x === d.positionX && c.y === d.positionY);
      if (!matched) {
        toast.error("当前笼架未找到坐标 (" + d.positionX + "," + d.positionY + ")");
        setScanOpen(false);
        return;
      }
      const key = `${matched.x}:${matched.y}`;
      setScanCache((prev) => {
        const next = new Map(prev);
        if (!next.has(key)) {
          const ld = (matched as any).detail as Record<string, any> | undefined;
          const preActions = new Set<CageBoxAction>();
          if (ld?.needsDivision === true) preActions.add("DIVIDE");
          if (ld?.needsSpecialFeeding === true) preActions.add("SPECIAL_BREEDING");
          if (ld?.hasHealthAbnormality === true) preActions.add("HEALTH_CHECK");
          next.set(key, { cell: matched, code, initialActions: new Set(preActions), currentActions: new Set(preActions) });
        }
        return next;
      });
      setLastScannedKey(key);
      setScanOpen(false);
      openEditActionPopup(matched);
    } catch {
      toast.error("扫码查询失败");
      setScanOpen(false);
    }
  }, [detail]);

  // ── 绑定模式扫码：直接存编码 ──
  const handleBindScanResult = useCallback((text: string) => {
    console.log("[bind-scan] 扫码结果:", text);
    setBindScannedCode(text);
    setBindSelectedKey(null);
    setBindScanOpen(false);
    toast.success("已录入: " + text + "，请点击空笼盒格位完成绑定", { duration: 4000 });
  }, []);

  // ── 扫码定位：查找笼位并跳转到对应笼架网格 ──
  const handleScanLocateResult = useCallback(async (text: string) => {
    const code = text.trim();
    if (!code) return;
    try {
      const r = await authHttp.get("/local/scan-lookup", { params: { code } });
      if (!r.data?.success || r.data.data?.type === "NOT_FOUND") {
        toast.error("未找到对应笼位: " + code);
        setScanLocateOpen(false);
        return;
      }
      const d = r.data.data;
      const sid = String(d.shelveId ?? d.sid ?? "");
      if (!sid) {
        toast.error("未找到关联笼架");
        setScanLocateOpen(false);
        return;
      }
      // 找到对应笼架
      const targetShelf = shelves.find(s => String(s.shelveId) === sid);
      if (!targetShelf) {
        toast.error("当前列表未找到对应笼架");
        setScanLocateOpen(false);
        return;
      }
      const posLabel = d.positionLabel || `${d.positionX},${d.positionY}`;
      // 导航到网格视图
      setSelectedShelf(targetShelf);
      setScreen("grid");
      setScanLockHighlight({ sid, x: d.positionX, y: d.positionY });
      setScanLocateOpen(false);
      toast.success(`已定位: ${posLabel}`, { icon: "📍" });
    } catch {
      toast.error("扫码查询失败");
      setScanLocateOpen(false);
    }
  }, [shelves]);

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
    // 本地+异步投递 — 逐条调用 localEdit
    for (const { entry, action } of toAdd) {
      const cageId = String((entry.cell as any).id ?? (entry.cell as any).animalCageId ?? "");
      const toggle = action === "DIVIDE" ? "needs_division" : action === "SPECIAL_BREEDING" ? "needs_special_feeding" : "has_health_abnormality";
      try {
        await localEdit(cageId, toggle, true, entry.code);
        okCount++;
      } catch (e: any) {
        toast.error(`${displayPosition(entry.cell.position)} ${action}: ${e?.message || "失败"}`);
        failCount++;
      }
    }
    for (const { entry, action } of toRemove) {
      const cageId = String((entry.cell as any).id ?? (entry.cell as any).animalCageId ?? "");
      const toggle = action === "DIVIDE" ? "needs_division" : action === "SPECIAL_BREEDING" ? "needs_special_feeding" : "has_health_abnormality";
      try {
        await localEdit(cageId, toggle, false, entry.code);
        okCount++;
      } catch (e: any) {
        toast.error(`${displayPosition(entry.cell.position)} 取消${action}: ${e?.message || "失败"}`);
        failCount++;
      }
    }
    if (failCount === 0) {
      // 保存当前编辑弹窗的照片和备注（合并已有 statusPhotos，不覆盖其他 key）
      if (editActionCell && (actionPhotos.length > 0 || actionNote.trim())) {
        const cageId = String((editActionCell as any).id ?? (editActionCell as any).animalCageId ?? "");
        if (cageId) {
          const ld3 = (editActionCell as any).detail as Record<string,any>|undefined;
          let sp2: Record<string,string[]> = {};
          try {
            const r = await authHttp.get(`/local/annotate/${cageId}`);
            if (r.data?.success && r.data.data?.statusPhotos) {
              const existing = JSON.parse(r.data.data.statusPhotos);
              if (typeof existing === "object") sp2 = existing;
            }
          } catch {}
          if (ld3?.needsDivision===true) sp2.needs_division = actionPhotos;
          if (ld3?.needsSpecialFeeding===true) sp2.needs_special_feeding = actionPhotos;
          if (ld3?.hasHealthAbnormality===true) sp2.has_health_abnormality = actionPhotos;
          if (actionPhotos.length > 0) sp2._status = actionPhotos;
          if (actionNote.trim()) (sp2 as any)._note = actionNote;
          const body: Record<string,any> = { animalCageId: cageId, statusPhotos: JSON.stringify(sp2) };
          try { await authHttp.post("/local/annotate", body); } catch { /* 非致命 */ }
        }
      }
      toast.success(`已完成 ${okCount} 个操作（本地+异步投递）`);
      setScanCache(new Map());
      setLastScannedKey(null);
      setEditActionCell(null); setActionPhotos([]); setActionNote("");
      setDetailReloadKey((k) => k + 1);
    } else {
      toast(`${okCount} 成功 / ${failCount} 失败`, { icon: '⚠️' });
    }
    setActionSubmitting(false);
  }, [selectedShelf, detail, scanCache, editActionCell, actionPhotos, actionNote]);

  // ── 绑定模式提交 ──
  // ── 批量绑定提交 ──
  const handleBatchBindSubmit = useCallback(async () => {
    if (bindPairCache.size === 0 || !selectedShelf) return;
    setBindSubmitting(true);
    const entries = Array.from(bindPairCache.entries());
    let ok = 0, fail = 0;
    await Promise.all(entries.map(async ([key, { cell, code }]) => {
      try {
        const cageId = String((cell as any).id ?? (cell as any).animalCageId ?? "");
        await localBind(cageId, code);
        ok++;
      } catch (e: any) { fail++; toast.error(`${cell.position}: ${e?.message || "失败"}`); }
    }));
    setBindPairCache(new Map());
    setBindSubmitting(false);
    setDetailReloadKey((k) => k + 1);
    if (fail === 0) toast.success(`${ok} 个绑定全部成功！（本地+异步投递）`);
    else toast(`${ok} 成功 / ${fail} 失败`, { icon: "⚠️" });
  }, [bindPairCache, selectedShelf, setDetailReloadKey]);

  // ── 批量解绑提交 ──
  const handleBatchUnbindSubmit = useCallback(async () => {
    if (unbindPairCache.size === 0 || !selectedShelf) return;
    setBindSubmitting(true);
    const ids = Array.from(unbindPairCache);
    let ok = 0, fail = 0;
    await Promise.all(ids.map(async (ck) => {
      try {
        const cell = unbindCells.get(ck);
        const cageId = String((cell as any)?.id ?? (cell as any)?.animalCageId ?? "");
        await localUnbind(cageId);
        ok++;
      } catch { fail++; }
    }));
    setUnbindPairCache(new Set()); setUnbindCells(new Map());
    setBindSubmitting(false);
    setDetailReloadKey((k) => k + 1);  // 刷新 grid 数据
    if (fail === 0) toast.success(`${ok} 个解绑全部成功！`);
    else toast(`${ok} 成功 / ${fail} 失败`, { icon: "⚠️" });
  }, [unbindPairCache, unbindCells, selectedShelf, detail, setDetailReloadKey]);

  // ── 绑定模式确认（Dialog，仅解绑用）──
  const handleBindConfirm = useCallback(async () => {
    if (!selectedCell || !bindScannedCode || !selectedShelf) return;
    const cellType = (selectedCell as any).animalCageType;
    if (cellType !== 2) { toast.error("只能绑定到「已预约(空笼盒)」的笼位"); return; }

    setBindSubmitting(true);
    try {
      const cageData: any = detail?.grid?.find((c) => c.x === selectedCell.x && c.y === selectedCell.y) ?? selectedCell;
      const cageId = String((cageData as any).id ?? (cageData?.cageBoxInfo as Record<string, any>)?.id ?? "");
      const cageName = String((cageData as any).name ?? "");
      const meta = detail?.shelfMeta;
      const roomId = String((meta as any)?.roomId ?? selectedShelf.roomId ?? "");
      const shelveId = String(selectedShelf.shelveId ?? "");

      console.log("[bind-confirm] animalCageId:", cageId, "cageBoxCode:", bindScannedCode);

      await bindCageBox(cageId, bindScannedCode, roomId);
      toast.success("绑定成功！");
      setBindConfirmOpen(false);
      setBindScannedCode("");
      setBindSelectedKey(null);
      setSelectedCell(null);
      setDetailReloadKey((k) => k + 1);
      setBindMode(false);
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
      const cageId = String((cageData as any).id ?? (cageData?.cageBoxInfo as Record<string, any>)?.id ?? "");
      const meta = detail?.shelfMeta;
      const roomId = String((meta as any)?.roomId ?? selectedShelf.roomId ?? "");

      await unbindCageBox(cageId, roomId);
      toast.success("解绑成功！");
      setBindConfirmOpen(false);
      setBindSelectedKey(null);
      setSelectedCell(null);
      setDetailReloadKey((k) => k + 1);
      setUnbindActive(false);
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
    setScanLockHighlight(null);
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
            autoExpandCampusName={jumpTarget?.campusName}
            autoExpandRoomName={jumpTarget?.roomName}
          />
          {/* ── 扫码定位 FAB（列表页也常驻，底距 = Tab栏50px + 安全区 + 16px）── */}
          {staffSpecialStatusView && (
            <button
              type="button"
              onClick={() => setScanLocateOpen(true)}
              className="fixed right-4 flex items-center justify-center rounded-full active:scale-95 transition-transform"
              style={{
                width: 48,
                height: 48,
                bottom: "calc(50px + env(safe-area-inset-bottom, 0px) + 16px)",
                background: BRAND,
                boxShadow: "0 4px 16px rgba(172,23,54,0.35)",
                zIndex: 50,
              }}
              aria-label="扫码定位"
            >
              <Scan className="size-6 text-white" strokeWidth={1.5} />
            </button>
          )}
          <MobileScanDialog open={scanLocateOpen} onClose={() => setScanLocateOpen(false)} onResult={handleScanLocateResult} />
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
              onDismissCrosshair={dismissCrosshair}
              editMode={editMode}
              bindMode={bindMode}
              bindSelectedKey={bindSelectedKey}
              bindScanOpen={bindScanOpen}
              onOpenBindScan={() => setBindScanOpen(true)}
              onCloseBindScan={() => setBindScanOpen(false)}
              onBindScanResult={handleBindScanResult}
              unbindActive={unbindActive}
              onToggleUnbind={() => {
                  if (unbindActive) { setUnbindActive(false); setBindSelectedKey(null); return; }
                  if (bindScannedCode) { setBindScannedCode(""); setBindSelectedKey(null); return; }
                  setUnbindActive(true); setBindSelectedKey(null); setSelectedCell(null);
                  toast.success("请点击饲养中格位完成解绑", { duration: 3000 });
                }}
                bindScannedCode={bindScannedCode}
                bindPairCacheSize={bindPairCache.size}
                bindPairCache={bindPairCache as any}
                onBatchBindSubmit={handleBatchBindSubmit}
                onClearBindCache={() => setBindPairCache(new Map())}
                onRemoveBindPair={(key: string) => setBindPairCache(prev => { const next = new Map(prev); next.delete(key); return next; })}
                bindSubmitting={bindSubmitting}
                unbindPairCache={unbindPairCache}
                unbindPairCacheSize={unbindPairCache.size}
                onBatchUnbindSubmit={handleBatchUnbindSubmit}
                onClearUnbindCache={() => { setUnbindPairCache(new Set()); setUnbindCells(new Map()); }}
                onRemoveUnbindPair={(key: string) => {
                  setUnbindPairCache(prev => { const next = new Set(prev); next.delete(key); return next; });
                  setUnbindCells(prev => { const next = new Map(prev); next.delete(key); return next; });
                }}
              onToggleRealtime={async () => {
                const next = !editMode;
                // 退出编辑模式且有未提交修改 → 弹窗确认
                if (!next && hasChanges) {
                  if (!window.confirm("有未提交的修改，是否放弃？\n\n「确定」放弃修改并退出\n「取消」继续编辑")) return;
                }
                setEditMode(next);
                if (next && selectedShelf) {
                  setDetailReloadKey((k) => k + 1);
                } else {
                  setScanCache(new Map());
                  setLastScannedKey(null);
                }
              }}
              onToggleBindMode={() => {
                if (bindMode) {
                  if (bindPairCache.size > 0) {
                    if (!window.confirm(`有 ${bindPairCache.size} 个未提交的绑定，是否放弃？`)) return;
                    setBindPairCache(new Map());
                  }
                  setBindMode(false); setBindScannedCode(""); setBindSelectedKey(null);
                  setSelectedCell(null); setUnbindActive(false);
                } else {
                  setBindMode(true);
                }
              }}
              scanLockHighlight={scanLockHighlight}
              scanLocateOpen={scanLocateOpen}
              onOpenScanLocate={() => setScanLocateOpen(true)}
              onCloseScanLocate={() => setScanLocateOpen(false)}
              onScanLocateResult={handleScanLocateResult}
            />
          </div>
        )}

        {/* 普通模式：查看详情弹窗（编辑/绑定模式不显示） */}
        {selectedCell && selectedShelf && !editMode && !bindMode && (
          <MobileCageCellDetailDialog
            cell={selectedCell}
            onClose={() => setSelectedCell(null)}
            staffView={staffSpecialStatusView}
          />
        )}

        {/* ── 编辑模式：轻量 action popup（3 个 chip + 上传按钮）── */}
        {editMode && editActionCell && (
          <div
            className="fixed inset-0 flex items-center justify-center p-4"
            style={{ zIndex: "var(--z-modal, 800)", background: "rgba(0,0,0,0.4)" }}
            onClick={saveAndCloseActionPopup}
          >
            <div
              className="w-full rounded-2xl overflow-hidden shadow-2xl"
              style={{ background: "#fff", maxWidth: 320 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "#ebedf0" }}>
                <span className="text-sm font-bold" style={{ color: "#323233" }}>
                  {displayPosition(editActionCell.position)}
                </span>
                <span className="text-[11px]" style={{ color: "#969799" }}>
                  {CAGE_TYPE_LABEL[editActionCell.animalCageType ?? 0] || "未知"}
                </span>
                <button type="button" onClick={() => setEditActionCell(null)} className="p-1 rounded-lg">
                  <XIcon className="size-4" style={{ color: "#94a3b8" }} />
                </button>
              </div>

              <div className="px-4 py-4 space-y-3">
                <div className="flex flex-wrap gap-2">
                  {(["DIVIDE", "SPECIAL_BREEDING", "HEALTH_CHECK"] as CageBoxAction[]).map((action) => {
                    const ck = `${editActionCell.x}:${editActionCell.y}`;
                    const entry = scanCache.get(ck);
                    const active = entry?.currentActions.has(action) ?? false;
                    const wasExisting = entry?.initialActions.has(action) ?? false;
                    const label = action === "DIVIDE" ? "需分笼" : action === "SPECIAL_BREEDING" ? "特殊饲养" : "健康检查";
                    const accent = active ? (wasExisting ? "#10b981" : BRAND) : "#cbd5e1";
                    const bg = active ? (wasExisting ? "rgba(16,185,129,0.12)" : "rgba(172,23,54,0.08)") : "transparent";
                    return (
                      <button
                        key={action}
                        type="button"
                        onClick={() => {
                          // 确保缓存条目存在
                          const key = `${editActionCell.x}:${editActionCell.y}`;
                          if (!scanCache.has(key)) {
                            const cbi = editActionCell.cageBoxInfo as Record<string, any> | undefined;
                            const cvo = cbi?.cageBoxVo ?? cbi?.['cageBoxVo'] ?? {};
                            const initial = new Set<CageBoxAction>();
                            if (cbi?.NeedDivideYn === 1 || cbi?.NeedDivideYn === "1" || cvo.needDivideYn === 1 || cvo.needDivideYn === "1") initial.add("DIVIDE");
                            if (cbi?.NeedFeedingYn === 1 || cbi?.NeedFeedingYn === "1" || cvo.needFeedingYn === 1 || cvo.needFeedingYn === "1"
                                || (typeof cbi?.specialBreedingName === 'string' && cbi.specialBreedingName.trim())
                                || (typeof cvo.specialBreedingName === 'string' && cvo.specialBreedingName.trim())) initial.add("SPECIAL_BREEDING");
                            if (cbi?.AbnormalHealthYn === 1 || cbi?.AbnormalHealthYn === "1" || cvo.abnormalHealthYn === 1 || cvo.abnormalHealthYn === "1"
                                || cbi?.animalHealthEntity != null || cvo.animalHealthEntity != null) initial.add("HEALTH_CHECK");
                            setScanCache(prev => {
                              const next = new Map(prev);
                              next.set(key, { cell: editActionCell, code: "", initialActions: initial, currentActions: new Set(initial) });
                              return next;
                            });
                          }
                          toggleScanAction(key, action);
                        }}
                        className="rounded-full px-3 py-2 text-[12px] font-semibold active:scale-95 transition flex items-center gap-1"
                        style={{ color: active ? (wasExisting ? "#059669" : BRAND) : "#94a3b8", background: bg, border: `1.5px solid ${accent}` }}
                      >
                        {active && <Check className="size-3" strokeWidth={3} />}
                        {!active && wasExisting && <XIcon className="size-3" strokeWidth={2} />}
                        {label}
                      </button>
                    );
                  })}
                </div>

                {/* 📷 照片上传 + 备注 */}
                <div className="space-y-2 pt-1 border-t" style={{ borderColor: "#ebedf0" }}>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold" style={{ color: "#646566" }}>📷 状态专属照片 ({actionPhotos.length})</span>
                    <label className="cursor-pointer px-2 py-0.5 rounded text-[10px] font-semibold text-white" style={{ background: BRAND }}>
                      {actionUploading ? "上传中..." : "+ 添加状态照片"}
                      <input type="file" accept="image/*" multiple className="hidden" onChange={handleActionPhotoUpload} disabled={actionUploading} />
                    </label>
                  </div>
                  {actionPhotos.length > 0 && <div className="flex flex-wrap gap-1">
                    {actionPhotos.map((url, i) =>
                      <div key={i} className="relative group">
                        <img src={url} className="h-10 w-10 object-cover rounded border" alt="" />
                        <button onClick={() => {
                          setActionPhotos(p => p.filter((_, j) => j !== i));
                          // 同步从后端 statusPhotos 中移除对应 URL
                          const c = editActionCell;
                          if (c) {
                            const cid = String((c as any).id ?? (c as any).animalCageId ?? "");
                            if (cid) {
                              authHttp.get('/local/annotate/' + cid).then(r => {
                                if (r.data?.success && r.data.data?.statusPhotos) {
                                  try {
                                    const sp = typeof r.data.data.statusPhotos === 'string' ? JSON.parse(r.data.data.statusPhotos) : r.data.data.statusPhotos;
                                    for (const k of Object.keys(sp)) {
                                      if (Array.isArray(sp[k])) sp[k] = sp[k].filter((u: string) => u !== url);
                                    }
                                    authHttp.post('/local/annotate', { animalCageId: cid, statusPhotos: JSON.stringify(sp) }).catch(() => {});
                                  } catch { }
                                }
                              }).catch(() => {});
                            }
                          }
                        }}
                          className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] items-center justify-center hidden group-hover:flex">✕</button>
                      </div>
                    )}
                  </div>}
                  <textarea
                    value={actionNote}
                    onChange={e => setActionNote(e.target.value)}
                    placeholder="备注..."
                    rows={2}
                    className="w-full rounded border px-2 py-1 text-[11px]"
                    style={{ borderColor: "#ebedf0", resize: "vertical" }}
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      if (!editActionCell) return;
                      setActionSubmitting(true);
                      try {
                        const cell = editActionCell;
                        const cageId = String((cell as any).id ?? (cell as any).animalCageId ?? "");
                        if (cageId) {
                          const ld2 = (cell as any).detail as Record<string, any> | undefined;
                          let sp: Record<string,string[]> = {};
                          try {
                            const r = await authHttp.get('/local/annotate/' + cageId);
                            if (r.data?.success && r.data.data?.statusPhotos) {
                              const existing = JSON.parse(r.data.data.statusPhotos);
                              if (typeof existing === "object") sp = existing;
                            }
                          } catch { }
                          if (ld2?.needsDivision === true || ld2?.needsDivision === 1) sp.needs_division = actionPhotos;
                          if (ld2?.needsSpecialFeeding === true || ld2?.needsSpecialFeeding === 1) sp.needs_special_feeding = actionPhotos;
                          if (ld2?.hasHealthAbnormality === true || ld2?.hasHealthAbnormality === 1) sp.has_health_abnormality = actionPhotos;
                          if (actionPhotos.length > 0) sp._status = actionPhotos;
                          if (actionNote.trim()) (sp as any)._note = actionNote;
                          const body: Record<string, any> = { animalCageId: cageId, statusPhotos: JSON.stringify(sp) };
                          await authHttp.post("/local/annotate", body);
                        }
                        toast.success("标注已保存");
                      } catch (e: any) { toast.error("保存失败: " + (e?.message || "")); }
                      finally { setActionSubmitting(false); }
                    }}
                    disabled={actionSubmitting}
                    className="rounded-lg px-3 py-1.5 text-[11px] font-semibold text-white active:scale-95 transition self-end"
                    style={{ background: BRAND }}
                  >
                    {actionSubmitting ? "保存中..." : "💾 保存标注"}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!editActionCell) return;
                      setActionSubmitting(true);
                      try {
                        const cell = editActionCell;
                        const cageId = String((cell as any).id ?? (cell as any).animalCageId ?? "");
                        if (cageId) {
                          const ld2 = (cell as any).detail as Record<string, any> | undefined;
                          let sp: Record<string,string[]> = {};
                          try {
                            const r = await authHttp.get('/local/annotate/' + cageId);
                            if (r.data?.success && r.data.data?.statusPhotos) {
                              const existing = JSON.parse(r.data.data.statusPhotos);
                              if (typeof existing === "object") sp = existing;
                            }
                          } catch { }
                          if (ld2?.needsDivision === true || ld2?.needsDivision === 1) sp.needs_division = actionPhotos;
                          if (ld2?.needsSpecialFeeding === true || ld2?.needsSpecialFeeding === 1) sp.needs_special_feeding = actionPhotos;
                          if (ld2?.hasHealthAbnormality === true || ld2?.hasHealthAbnormality === 1) sp.has_health_abnormality = actionPhotos;
                          if (actionPhotos.length > 0) sp._status = actionPhotos;
                          if (actionNote.trim()) (sp as any)._note = actionNote;
                          await authHttp.post("/local/annotate", { animalCageId: cageId, statusPhotos: JSON.stringify(sp) });
                        }
                        toast.success("已归档为新记录");
                        setActionPhotos([]); setActionNote("");
                        loadEditHistory(cageId);
                      } catch (e: any) { toast.error("保存失败: " + (e?.message || "")); }
                      finally { setActionSubmitting(false); }
                    }}
                    disabled={actionSubmitting}
                    className="rounded-lg px-3 py-1.5 text-[11px] font-semibold border active:scale-95 transition self-end"
                    style={{ borderColor: BRAND, color: BRAND }}
                  >
                    📄 存为新记录
                  </button>
                </div>

              </div>

              {/* 历史记录 */}
                <details className="border-t mx-4 pb-2" style={{ borderColor: "#ebedf0" }}>
                  <summary className="text-[11px] font-semibold py-2 cursor-pointer" style={{ color: "#969799" }}>
                    📦 历史记录 ({editHistory.length})
                  </summary>
                  <div className="space-y-1 max-h-[160px] overflow-y-auto">
                    {editHistory.map((h: any, i: number) => {
                      const label = h.statusField === "needs_division" ? "需分笼" : h.statusField === "needs_special_feeding" ? "特殊饲养" : h.statusField === "_annotation" ? "标注记录" : "健康异常";
                      return (
                        <div key={i} className="flex items-center gap-2 text-[10px] rounded border px-2 py-1" style={{ borderColor: "#ebedf0" }}>
                          <span className={h.action === "unmarked" ? "text-red-600" : h.action === "annotated" ? "text-blue-600" : "text-green-600"}>
                            {h.action === "unmarked" ? "✕" : h.action === "annotated" ? "📝" : "✓"} {label}
                          </span>
                          <span style={{ color: "#969799" }} className="whitespace-nowrap">{h.createdAt?.substring(0, 16) || ""}</span>
                          {h._imgs?.length > 0 && (
                            <div className="flex gap-0.5">
                              {h._imgs.slice(0, 3).map((url: string, j: number) => (
                                <img key={j} src={url} className="h-6 w-6 object-cover rounded border" style={{ borderColor: "#ebedf0" }} alt="" />
                              ))}
                              {h._imgs.length > 3 && <span style={{ color: "#969799" }}>+{h._imgs.length - 3}</span>}
                            </div>
                          )}
                          {h.experimentDesc && <div style={{ color: "#969799" }} className="truncate max-w-[120px]">{h.experimentDesc.substring(0, 40)}</div>}
                          <button
                            onClick={() => h.id && handleEditHistoryDelete(h.id)}
                            className="ml-auto text-red-400 hover:text-red-600 text-[9px] px-1"
                          >✕</button>
                        </div>
                      );
                    })}
                  </div>
                </details>
              {editHistoryLoading && (
                <div className="text-center text-[11px] py-2" style={{ color: "#969799" }}>
                  <Loader2 className="h-3 w-3 inline animate-spin mr-1" />加载历史…
                </div>
              )}

              {/* 底部操作按钮 */}
              <div className="flex gap-2 px-4 py-3 border-t" style={{ borderColor: "#ebedf0" }}>
                <button
                  type="button"
                  onClick={() => { setEditActionCell(null); setActionPhotos([]); setActionNote(""); }}
                  className="flex-1 rounded-lg px-4 py-2 text-sm font-semibold border"
                  style={{ borderColor: "#ebedf0", color: "#323233" }}
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        )}

        <MobileSpecialStatusPanel
          open={specialStatusOpen}
          onClose={() => setSpecialStatusOpen(false)}
          apiFn={specialStatusApiFn}
          variant={staffSpecialStatusView ? "staff" : "student"}
        />

        {/* ── 绑定/解绑确认弹窗（居中 Dialog · 手机风格）── */}
        <Dialog open={bindMode && bindConfirmOpen && !!selectedCell} onOpenChange={(o)=>{if(!o){setBindConfirmOpen(false);setSelectedCell(null);setBindSelectedKey(null);}}}>
          <DialogContent className="z-[var(--z-modal)] !max-w-[280px] !p-0 !gap-0 !rounded-2xl overflow-hidden shadow-[0_8px_40px_rgba(0,0,0,0.18)] border-0">
            {/* Header */}
            <div className="px-5 pt-5 pb-2 text-center">
              <DialogTitle className="!text-base font-bold" style={{color:unbindActive?"#dc2626":"#1e293b"}}>
                {unbindActive?"确认解绑":"确认绑定"}
              </DialogTitle>
            </div>
            {/* Body */}
            <div className="px-5 pb-4 space-y-3">
              {!unbindActive&&<div className="rounded-xl bg-blue-50 px-4 py-3 text-center">
                <div className="text-[11px] text-blue-500 mb-0.5">笼盒编号</div>
                <div className="text-sm font-mono font-bold text-blue-700 tracking-wide">{bindScannedCode}</div>
              </div>}
              <div className="space-y-2">
                {(()=>{const cbi=selectedCell?.cageBoxInfo as Record<string,any>|undefined;
                  const pi=cbi?.ProjectPiName||(selectedCell as any)?.projectPiName||(selectedCell as any)?.piName||"";
                  const st=cbi?.StateName||(selectedCell as any)?.stateLabel||"";
                  return <>
                    <div className="text-center">
                      <div className="text-[11px] text-[#969799]">目标笼位</div>
                      <div className="text-sm font-semibold text-[#1e293b]">{selectedCell?selectedCell.position:""}</div>
                    </div>
                    {pi&&<div className="text-center">
                      <div className="text-[11px] text-[#969799]">课题组 PI</div>
                      <div className="text-[12px] font-semibold text-[#1e293b]">{pi}</div>
                    </div>}
                    {st&&<div className="text-center">
                      <div className="text-[11px] text-[#969799]">当前状态</div>
                      <div className="text-[12px] text-[#1e293b]">{st}</div>
                    </div>}
                  </>;
                })()}
              </div>
              {unbindActive&&<div className="rounded-xl bg-red-50 px-4 py-2.5 text-center">
                <span className="text-[11px] text-red-500 font-medium">解绑后恢复「空笼盒」状态</span>
              </div>}
            </div>
            {/* Footer */}
            <div className="flex gap-3 px-5 pb-5 pt-1">
              <button onClick={()=>{setBindConfirmOpen(false);setSelectedCell(null);setBindSelectedKey(null);}}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-[#646566] bg-[#f2f3f5] active:bg-[#ebedf0] transition-colors">取消</button>
              <button onClick={()=>{if(selectedCell){unbindActive?handleUnbindConfirm():handleBindConfirm();}}}
                disabled={bindSubmitting}
                className="flex-1 py-2.5 rounded-xl text-sm text-white font-semibold active:opacity-80 disabled:opacity-50 transition-colors"
                style={{background:unbindActive?"#dc2626":"#2563eb"}}>
                {bindSubmitting?"处理中...":unbindActive?"确认解绑":"确认绑定"}
              </button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </CageColorProvider>
  );
});
