/** 手机版 — 笼架 Tab（列表 → 8×10 网格页 → 笼盒详情弹窗） */
import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, LayoutGrid, Loader2, Search, WifiOff, Scan, AlertCircle, Check, ClipboardList, MapPin, X as XIcon } from "lucide-react";
import { useMobilePullToRefresh } from "./useMobilePullToRefresh";
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
  getDominantStatusCode,
  useStatusStyle,
} from "@/features/cage-shelf/components/CageCellOverlays";
import { DEFAULT_COLORS } from "@/features/cage-shelf/components/CageColorContext";
import { formatSpecialStatusCodesForDisplay } from "@/utils/cageSpecialStatusLabels";
import { isStudentAccount } from "@/features/auth/postLoginNavigation";
import MobileSpecialStatusPanel from "./MobileSpecialStatusPanel";
import CageShelfLegend from "@/features/cage-shelf/components/CageShelfLegend";
import ReservePersonDialog from "@/features/cage-shelf/components/ReservePersonDialog";
import AllocDialog from "@/features/cage-shelf/components/AllocDialog";
import CageHistoryModal from "@/features/cage-shelf/components/CageHistoryModal";
import CageBookingPanel from "@/features/cage-shelf/components/CageBookingPanel";
import CageFormFill from "@/features/cage-shelf/components/CageFormFill";
import { CageColorProvider } from "@/features/cage-shelf/components/CageColorContext";
import MobileCageCellDetailDialog from "./MobileCageCellDetailDialog";
import MobileScanDialog from "./MobileScanDialog";
import {
  fetchFullTree, fetchLocalShelfGridByShelveId, localEdit, lookupCode, confirmClaim, adminConfirmClaim,
  fetchAllocationAups, type AupItem, localAllocate, localCancelAllocate, assignBatchCages,
  archiveCage, fetchBookingRooms, type BookingRoom,
  fetchPoolCells, type PoolCell, claimCage, fetchMyClaims, type CageClaimItem, cancelClaim,
  type CodeLookupResult, type CageBoxAction, fetchCageModeVisible,
} from "@/api/domains/cageShelf.api";
import toast from "react-hot-toast";
import {
  CAGE_BOX_ACTIONS,
  cageBoxAction,
  actionsFromFormValues,
  actionsFromCageBoxInfo,
  statusPhotoKeys,
  allocSelectVerdict,
  ALLOC_MIXED_KIND_HINT,
  type AllocSelectKind,
} from "@/features/cage-shelf/constants";
import { fetchCageInfoValues, type CageInfoValueRow } from "@/features/cage-shelf/api/cageForm.api";
import { buildPlaceholderGridCells } from "./mobileCageShelfGrid";
import { useViewportHeight } from "./useViewportHeight";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

import { appConfirm } from "@/lib/appDialog";
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

function cageCardTone(cell: CageShelfCell): string {
  if (cell.empty) {
    return "border-[var(--student-hairline)] bg-[var(--student-canvas-soft)] text-[var(--student-mute)]";
  }
  return "border-2 text-slate-900 active:brightness-95";
}

/** 缓存动作 → 临时替换底色（配色单一来源是 CageColorContext.DEFAULT_COLORS，用户可调色） */
const ACTION_BG: Record<string, string> = Object.fromEntries(CAGE_BOX_ACTIONS.map(a => [a.action, DEFAULT_COLORS[a.statusCode]?.bg ?? "#ccc"]));
const ACTION_BORDER: Record<string, string> = Object.fromEntries(CAGE_BOX_ACTIONS.map(a => [a.action, DEFAULT_COLORS[a.statusCode]?.border ?? "#999"]));

const GridCellButton = memo(function GridCellButton({
  cell,
  onSelect,
  crossCol,
  crossRow,
  isCached,
  isLastScanned,
  cachedActions,
  selected,
  isPoolCell,
  isMyClaimCell,
}: {
  cell: CageShelfCell;
  onSelect: () => void;
  crossCol?: number;
  crossRow?: number;
  isCached?: boolean;
  isLastScanned?: boolean;
  cachedActions?: Set<CageBoxAction>;
  selected?: boolean;
  isPoolCell?: boolean;
  /** 本人待确认到位的认领笼位 */
  isMyClaimCell?: boolean;
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
    for (const a of CAGE_BOX_ACTIONS) if (cachedActions.has(a.action)) allBgColors.push(DEFAULT_COLORS[a.statusCode]?.bg ?? "#ccc");
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
  const piName = (() => {
    if (nonEmptyText(cell.projectPiName)) return cell.projectPiName!.trim();
    if (nonEmptyText(cell.piName)) return cell.piName!.trim();
    const cbi = cell.cageBoxInfo as Record<string, unknown> | undefined;
    if (cbi) {
      const fromBi =
        (typeof cbi.ProjectPiName === "string" && cbi.ProjectPiName.trim()) ||
        (typeof cbi.projectPiName === "string" && cbi.projectPiName.trim()) ||
        "";
      if (fromBi) return fromBi;
    }
    return "";
  })();
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
        // 选中态（分配/认领/申请勾选）
        selected && "ring-2 ring-blue-500/80 shadow-[0_0_4px_rgba(59,130,246,0.25)]",
        // 申请模式：池内可用笼位（未选中时绿色描边提示）
        isPoolCell && !selected && "ring-2 ring-emerald-400/70 shadow-[0_0_4px_rgba(52,211,153,0.2)]",
        // 确认模式：本人待确认到位的笼位（琥珀环，与「未到位」徽标同色系）
        isMyClaimCell && !selected && "ring-2 ring-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.35)]",
      )}
      style={isEmpty
        ? (isInCross ? { backgroundColor: "rgba(172,23,54,0.1)" } : undefined)
        : hit ? {
            ...statusStyle,
            boxShadow: `0 0 14px ${ringShadow}`,
            outline: `3px solid ${ringColor}`,
            outlineOffset: -1,
          } : isInCross && !multiBg ? {
            ...statusStyle,
            backgroundColor: `color-mix(in srgb, ${statusStyle?.backgroundColor || '#f1f5f9'} 88%, #ac1736)`,
          } : statusStyle
      }
      onClick={isEmpty ? undefined : onSelect}
      title={isEmpty ? displayPosition(cell.position) : tooltip}
    >
      {/* 待到位（locked）过渡态：左上角已有「未到位」徽标，右上角「空」图标会误导，隐藏 */}
      {!isEmpty && cell.claimStatus !== "locked" && cell.claimStatus !== "pending_approval" && <CageCellOverlays animalCageType={cell.animalCageType} compact />}
      {/* 认领状态徽标：语义与 CellButton.tsx 完全一致（琥珀=未到位 / 蓝=待审批 / 橙=待释放） */}
      {cell.claimStatus && (() => {
        const badge: Record<string, { txt: string; bg: string }> = {
          locked: { txt: "未到位", bg: "#f59e0b" },
          pending_approval: { txt: "待审批", bg: "#3b82f6" },
          pending_release_approval: { txt: "待释放", bg: "#f97316" },
        };
        const s = badge[cell.claimStatus];
        if (!s) return null;
        return (
          <div className="absolute top-0.5 left-0.5 z-20 px-1 py-px rounded text-[8px] font-bold leading-tight text-white"
            style={{ background: s.bg }}>
            {s.txt}
          </div>
        );
      })()}
      {selected && (
        <div className="absolute top-0.5 right-0.5 z-20 w-3.5 h-3.5 rounded-full flex items-center justify-center text-white text-[9px] font-bold"
          style={{ background: "#3b82f6" }}>
          <Check className="size-2.5" strokeWidth={3} />
        </div>
      )}
      <div className="flex flex-col items-center justify-center gap-0.5 px-0.5 py-0.5 text-center w-full h-full">
        <div className="w-full font-bold text-[10px] leading-tight">{displayPosition(cell.position)}</div>
        {isEmpty ? (
          <div className="text-[8px]">空位</div>
        ) : cell.visible !== false ? (
          <>
            {nonEmptyText(piName) && (
              <div className="w-full truncate text-[8px] leading-tight font-semibold"
                style={{ color: "var(--app-color-text-primary, #1e293b)" }}>{piName}</div>
            )}
            {nonEmptyText(cell.experimenterName) && (
              <div className="w-full truncate text-[7px] leading-tight"
                style={{ color: "var(--app-color-text-primary, #1e293b)" }}>{cell.experimenterName}</div>
            )}
          </>
        ) : (
          <div className="text-[9px] text-[var(--student-mute)]">***</div>
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
  onOpenMyClaims,
  showMyClaimsEntry,
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
  onOpenMyClaims?: () => void;
  showMyClaimsEntry?: boolean;
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

  // 下拉刷新：与网格页共用同一个 hook，列表页顶栏因此不再需要刷新按钮
  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const listPull = useMobilePullToRefresh(async () => { onRetry(); }, listScrollRef);

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
    <div ref={listScrollRef} className="h-full overflow-y-auto" style={{ background: PAGE_BG }}
      onTouchStart={listPull.handlers.onTouchStart}
      onTouchMove={listPull.handlers.onTouchMove}
      onTouchEnd={listPull.handlers.onTouchEnd}>
      {(listPull.indicatorVisible || listPull.refreshing) && (
        <div className="flex items-center justify-center gap-1.5 transition-opacity"
          style={{
            height: listPull.refreshing ? 24 : Math.min(24, listPull.pullDistance),
            opacity: listPull.refreshing ? 1 : 0.35 + listPull.indicatorProgress * 0.65,
          }}>
          <Loader2 className={`size-3.5 ${listPull.refreshing ? "animate-spin" : ""}`} style={{ color: "#969799" }} />
          <span className="text-[10px]" style={{ color: "#969799" }}>
            {listPull.refreshing ? "刷新中…" : listPull.indicatorProgress >= 1 ? "松开刷新" : "下拉刷新"}
          </span>
        </div>
      )}
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
          <div className="flex items-center gap-1.5 shrink-0">
            {showMyClaimsEntry && (
              <button
                type="button"
                onClick={onOpenMyClaims}
                className="flex items-center gap-0.5 px-2 py-1.5 rounded-xl active:bg-black/5 shrink-0"
                style={{
                  color: BRAND,
                  background: "rgba(255,255,255,0.92)",
                  border: "1px solid rgba(30,55,90,0.08)",
                  boxShadow: "0 1px 4px rgba(15,23,42,0.04)",
                }}
                aria-label="我的申请"
              >
                <ClipboardList className="size-3.5" />
                <span className="text-[10px] font-medium whitespace-nowrap">我的申请</span>
              </button>
            )}
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
          {/* 刷新按钮已移除，改为整页下拉刷新 */}
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

/** 预约模式（教职工）：房间级预约面板，横向滚动承载桌面端 CageBookingPanel */
/**
 * 预约模式（移动端）：房间**由当前笼架所在房间直接决定**，不提供房间切换。
 *
 * 移动端不再渲染自己的返回按钮（返回统一由 shell MobileTopNavBar 承担，
 * 否则同屏出现两个返回），也不再提供「同步 ARO」——同步是管理端动作，
 * 手机上只读当前房间的预约情况。跨房间浏览如后续确有需要，再单独适配。
 */
function CageBookingMobileView({ initialRoomId }: { initialRoomId?: string | number }) {
  const [rooms, setRooms] = useState<BookingRoom[]>([]);
  const [loading, setLoading] = useState(false);
  const roomId = String(initialRoomId ?? "");

  const loadRooms = useCallback(async () => {
    setLoading(true);
    try { const r = await fetchBookingRooms(1, 200); setRooms(r?.data?.list ?? []); }
    catch { setRooms([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadRooms(); }, [loadRooms]);

  const room = useMemo(() => rooms.find((r) => String(r.roomId) === roomId) ?? null, [rooms, roomId]);

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: PAGE_BG }}>
      <div className="flex-1 min-h-0 overflow-hidden px-3 py-3">
        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="size-6 animate-spin" style={{ color: "#94a3b8" }} /></div>
        ) : room ? (
          <CageBookingPanel room={room} roomId={String(room.roomId)} onChanged={loadRooms} />
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <LayoutGrid className="size-10" style={{ color: "#c8c9cc" }} />
            <p className="text-xs" style={{ color: "#969799" }}>当前房间暂无预约数据</p>
          </div>
        )}
      </div>
    </div>
  );
}

const CLAIM_STATUS_LABEL: Record<string, string> = {
  pending_approval: "审批中", locked: "已锁定", confirmed: "已确认",
  pending_release_approval: "释放审批中", rejected: "已驳回", cancelled: "已取消", released: "已释放",
};
const CLAIM_STATUS_COLOR: Record<string, string> = {
  pending_approval: "#d97706", locked: "#0284c7", confirmed: "#16a34a",
  pending_release_approval: "#ea580c", rejected: "#dc2626", cancelled: "#969799", released: "#969799",
};

/** 学生「我的申请」列表：无释放入口，仅 pending_approval 可取消、locked 可确认到位 */
function MyClaimsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [list, setList] = useState<CageClaimItem[]>([]);
  const [loading, setLoading] = useState(false);
  const viewportHeight = useViewportHeight();

  const load = useCallback(() => {
    setLoading(true);
    fetchMyClaims().then(setList).catch(() => setList([])).finally(() => setLoading(false));
  }, []);

  useEffect(() => { if (open) load(); }, [open, load]);

  if (!open) return null;

  // 申请项短位置：房间已在分组标题里，条目只显示笼架 + 格位
  const claimShort = (c: CageClaimItem) => {
    const pos = c.positionX != null && c.positionY != null ? displayPosition(`${c.positionX}-${c.positionY}`) : "";
    return [c.shelveName, pos].filter(Boolean).join(" · ") || `笼位 #${c.animalCageId}`;
  };

  // 按 校区/房间 分组，避免平铺
  const groups = useMemo(() => {
    const m = new Map<string, CageClaimItem[]>();
    for (const c of list) {
      const key = [c.campusName, c.roomName].filter(Boolean).join(" / ") || "未指定房间";
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(c);
    }
    return Array.from(m.entries());
  }, [list]);

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: "var(--z-modal, 800)", background: "rgba(0,0,0,0.45)", height: viewportHeight > 0 ? viewportHeight : "100dvh", padding: "calc(env(safe-area-inset-top, 0px) + 12px) 16px calc(env(safe-area-inset-bottom, 0px) + 12px)" }} onClick={onClose}>
      <div className="w-full flex flex-col rounded-2xl overflow-hidden shadow-2xl" style={{ background: "#fff", maxWidth: 400, maxHeight: "100%" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0" style={{ borderColor: "#ebedf0" }}>
          <span className="text-sm font-bold" style={{ color: "#323233" }}>我的申请</span>
          <button type="button" onClick={onClose} className="p-1 rounded-lg"><XIcon className="size-5" style={{ color: "#94a3b8" }} /></button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-3">
          {loading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="size-6 animate-spin" style={{ color: "#94a3b8" }} /></div>
          ) : list.length === 0 ? (
            <div className="py-16 text-center"><p className="text-xs" style={{ color: "#969799" }}>暂无申请记录</p></div>
          ) : groups.map(([room, items]) => (
            <div key={room} className="mb-3">
              <div className="flex items-center gap-1.5 px-1 pb-1.5">
                <MapPin className="size-3" style={{ color: "#94a3b8" }} />
                <span className="text-[11px] font-semibold" style={{ color: "#64748b" }}>{room}</span>
                <span className="text-[10px]" style={{ color: "#c0c4cc" }}>{items.length}</span>
              </div>
              <div className="space-y-1.5">
                {items.map((c) => (
                  <div key={c.id} className="flex items-center gap-2 rounded-lg border px-2.5 py-2" style={{ borderColor: "#eef0f6", background: "#fafbfc" }}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[12px] font-semibold truncate" style={{ color: "#1e293b" }}>{claimShort(c)}</span>
                        <span className="inline-flex items-center shrink-0 px-1.5 py-0.5 rounded-full text-[9px] font-semibold text-white" style={{ background: CLAIM_STATUS_COLOR[c.claimStatus] || "#969799" }}>{CLAIM_STATUS_LABEL[c.claimStatus] || c.claimStatus}</span>
                      </div>
                      <div className="text-[10px] truncate" style={{ color: "#969799" }}>
                        申请时间：{c.createdAt?.substring(0, 16)?.replace("T", " ")}
                        {c.claimStatus === "rejected" && c.latestRejectReason ? <span style={{ color: "#dc2626" }}> · 驳回：{c.latestRejectReason}</span> : null}
                      </div>
                    </div>
                    <div className="shrink-0 flex items-center gap-1">
                      {c.claimStatus === "pending_approval" && (
                        <button type="button" onClick={async () => { try { await cancelClaim(c.id); load(); toast.success("已取消"); } catch (e: any) { toast.error(e?.message || "取消失败"); } }}
                          className="rounded-md px-2 py-1 text-[10px] font-semibold border border-red-300 active:scale-95 transition" style={{ color: "#dc2626" }}>取消</button>
                      )}
                      {c.claimStatus === "locked" && (
                        <button type="button" onClick={async () => { try { await confirmClaim(c.id); load(); toast.success("已确认到位"); } catch (e: any) { toast.error(e?.message || "确认失败"); } }}
                          className="rounded-md px-2 py-1 text-[10px] font-semibold text-white active:scale-95 transition" style={{ background: BRAND }}>确认到位</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
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

/**
 * 三端统一的笼架模式（只分教职工/学生两个视角）。
 * 教职工 8 模式：查看/分配/预约/编辑/扫码确认/归档/认领/记录
 * 学生 3 模式：查看/申请/扫码确认
 */
type ShelfMode = "view" | "allocate" | "booking" | "edit" | "confirm" | "archive" | "reserve" | "record" | "claim";

/**
 * 从 /v1/scan/lookup 结果提取坐标。
 * CAGE_CELL 的字段在 cageCell 下；LEGACY_CAGE_BOX 兜底时平铺在顶层。
 * shelveId 与笼架列表同一 ID 空间，不需要任何兼容映射。
 */
function lookupPosition(r: CodeLookupResult): { x: number; y: number; sid: string; label: string } | null {
  if (r.type === "CAGE_CELL" && r.cageCell) {
    const c = r.cageCell;
    return {
      x: Number(c.positionX),
      y: Number(c.positionY),
      sid: String(c.shelveId ?? ""),
      label: c.positionLabel || `${c.positionX},${c.positionY}`,
    };
  }
  if (r.type === "LEGACY_CAGE_BOX" && r.positionX != null && r.positionY != null) {
    return {
      x: Number(r.positionX),
      y: Number(r.positionY),
      sid: String(r.shelveId ?? ""),
      label: `${r.positionX},${r.positionY}`,
    };
  }
  return null;
}

const STAFF_MODE_ITEMS: { key: ShelfMode; label: string }[] = [
  { key: "view", label: "查看" },
  { key: "allocate", label: "分配" },
  { key: "booking", label: "预约" },
  { key: "edit", label: "状态" },
  { key: "confirm", label: "确认" },
  { key: "archive", label: "归档" },
  { key: "reserve", label: "预定" },
  { key: "record", label: "记录" },
];

const STUDENT_MODE_ITEMS: { key: ShelfMode; label: string }[] = [
  { key: "view", label: "查看" },
  { key: "claim", label: "申请预约" },
  { key: "confirm", label: "确认" },
];

function CageShelfGridView({
  shelf, detail, loading, error, onRetry, onCellClick,
  isStaffView, mode, onSetMode, visibleModes,
  scanOpen, onOpenScan, onCloseScan, onScanResult,
  scanCache, lastScannedKey, onActionSubmit, actionSubmitting,
  scanLockHighlight,
  selectedCells, claimPoolIds, myClaimCageIds,
  onAllocateOpen, onAllocateCancel, allocSubmitting, allocBatchKind,
  onReserveOpen, reserveSubmitting,
  onClaimSubmit, claimSubmitting,
}: {
  shelf: MobileCageShelfSummary;
  detail: CageShelfDetail | null;
  loading: boolean; error: string | null;
  onRetry: () => void;
  onCellClick: (cell: CageShelfCell) => void;
  /** 教职工视角（8 模式）；false = 学生视角（3 模式） */
  isStaffView: boolean;
  mode: ShelfMode;
  onSetMode: (m: ShelfMode) => void;
  /** 后端下发的可见模式 key 列表（null=尚未拉取或失败，回退本地硬编码） */
  visibleModes?: string[] | null;
  /** 单一常驻扫码入口，全角色可见，结果按 mode 分派 */
  scanOpen: boolean; onOpenScan: () => void; onCloseScan: () => void;
  onScanResult: (text: string) => void;
  scanCache: Map<string, ScanCacheEntry>;
  lastScannedKey: string | null;
  onActionSubmit: () => void; actionSubmitting: boolean;
  scanLockHighlight?: { sid: string; x: number; y: number } | null;
  /** 分配/认领/申请三模式的勾选集（key = sid:x:y） */
  selectedCells: Set<string>;
  /** 申请模式：池内可用笼位 animalCageId 集合 */
  claimPoolIds: Set<string>;
  /** 本人待确认到位的 animalCageId 集合 */
  myClaimCageIds: Set<string>;
  onAllocateOpen: () => void;
  onAllocateCancel: () => void;
  /** 分配批次动作类型：allocate=下发AUP / cancel=撤回AUP；null=未起头 */
  allocBatchKind: AllocSelectKind | null;
  allocSubmitting: boolean;
  onReserveOpen: () => void;
  reserveSubmitting: boolean;
  onClaimSubmit: () => void;
  claimSubmitting: boolean;
}) {
  const cells = detail && detail.grid.length > 0 ? detail.grid : buildPlaceholderGridCells();
  const meta = detail?.shelfMeta;
  const [legendOpen, setLegendOpen] = useState(false);
  // 下拉刷新：复用房间页同一个 hook，取代原顶栏的刷新按钮
  const gridScrollRef = useRef<HTMLDivElement | null>(null);
  const pullRefresh = useMobilePullToRefresh(async () => { onRetry(); }, gridScrollRef);
  const showLegend = legendOpen;
  const editMode = mode === "edit";
  const baseModeItems = isStaffView ? STAFF_MODE_ITEMS : STUDENT_MODE_ITEMS;
  // 后端下发的可见模式过滤本地常量（保留后端顺序、用常量 label）；拉取失败/未返回时回退硬编码
  const modeItems = visibleModes && visibleModes.length > 0
    ? visibleModes
        .map((k) => baseModeItems.find((m) => m.key === k || (k === "studentClaim" && m.key === "claim")))
        .filter((m): m is { key: ShelfMode; label: string } => m != null)
    : baseModeItems;
  const isAlloc = mode === "allocate" || mode === "reserve";
  const isClaim = mode === "claim";
  const sid = String(detail?.shelfMeta?.shelveId ?? shelf.shelveId ?? "");

  // 行/列交叉定位：仅编辑模式生效
  const lc = editMode ? lastScannedKey : null;
  const crossX = lc != null ? Number(lc.split(":")[0]) : undefined;
  const crossY = lc != null ? Number(lc.split(":")[1]) : undefined;

  // 缓存位置集合（用于高亮）
  const cachedKeys = new Set(scanCache.keys());

  // 总差异数（新增 + 反选），驱动提交按钮
  const totalDiffs = countTotalDiffs(scanCache);

  // 预约模式：整页替换为房间级预约面板
  if (mode === "booking") {
    return <CageBookingMobileView initialRoomId={(meta as any)?.roomId ?? shelf.roomId} />;
  }

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: PAGE_BG }}>
      <style>{`@keyframes scan-flash{0%{opacity:0.2;transform:scale(0.95)}30%{opacity:0.85;transform:scale(1.03)}100%{opacity:0.35;transform:scale(1)}}.scan-flash-overlay{animation:scan-flash 0.5s ease-in-out 2;pointer-events:none}`}</style>
      {/* ── 顶栏：单行 = 模式选择器（横向滚动）+ 操作按钮 ──
          返回由 shell MobileTopNavBar 统管；笼架名/房间名也已在 shell 标题栏显示，
          此处不再重复渲染标题行，把整行宽度让给 8 个模式。
          刷新改为网格区下拉刷新，不再占一个按钮位。 */}
      <div className="shrink-0 flex items-center gap-1.5 px-3 py-2 border-b"
        style={{ background: "rgba(255,255,255,0.92)", borderColor: "rgba(30,55,90,0.06)" }}>
        <div className="flex-1 min-w-0 overflow-x-auto" style={{ WebkitOverflowScrolling: "touch" }}>
          <div className="inline-flex items-center gap-0.5 rounded-full p-0.5"
            style={{ background: "rgba(15,23,42,0.05)" }}>
            {modeItems.map((m) => {
              const active = mode === m.key;
              return (
                <button key={m.key} type="button" onClick={() => onSetMode(m.key)}
                  className="rounded-full px-2 py-1 text-[10px] font-semibold active:scale-95 transition whitespace-nowrap shrink-0"
                  style={{ color: active ? "#fff" : "#64748b", background: active ? BRAND : "transparent" }}>
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {/* 常驻扫码入口（顶栏）：全角色可见，结果按当前模式分派 */}
          <button type="button" onClick={onOpenScan}
            className="flex items-center justify-center rounded-full w-7 h-7 active:scale-95 transition"
            style={{ color: "#fff", background: BRAND }}
            aria-label="扫码">
            <Scan className="size-4" strokeWidth={2} />
          </button>
          <button type="button" onClick={() => setLegendOpen((v) => !v)}
            className="flex items-center justify-center rounded-full w-7 h-7 active:scale-95 transition"
            style={{ color: legendOpen ? "#fff" : BRAND, background: legendOpen ? BRAND : "rgba(172,23,54,0.08)" }}
            aria-label="图例"><AlertCircle className="size-4" strokeWidth={2} /></button>
          {/* 编辑模式提交（扫码入口统一走右下常驻 FAB） */}
          {editMode && totalDiffs > 0 && (
            <button type="button" disabled={actionSubmitting} onClick={onActionSubmit}
              className="flex items-center gap-1 shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold text-white active:scale-95 transition disabled:opacity-50"
              style={{ background: BRAND }}>
              <Check className="size-3" strokeWidth={3} />提交{totalDiffs}
            </button>
          )}
        </div>
      </div>

      {/* ── 分配/认领/申请：勾选操作条 ── */}
      {(isAlloc || isClaim) && (
        <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 border-b overflow-x-auto" style={{ background: "rgba(255,255,255,0.6)", borderColor: "rgba(30,55,90,0.06)" }}>
          <span className="shrink-0 text-[10px] font-medium" style={{ color: "#64748b" }}>
            {mode === "allocate"
              ? (allocBatchKind === "cancel" ? "勾选「空笼位」撤回 AUP" : "勾选「等待分配」笼位")
              : mode === "reserve" ? "勾选「已预约空笼盒」笼位" : "勾选可申请笼位"} · 已选 {selectedCells.size}
          </span>
          {/* 按批次类型二选一：待分配→下发 AUP；已预约空笼盒→撤回 AUP 退回待分配 */}
          {mode === "allocate" && selectedCells.size > 0 && allocBatchKind === "allocate" && (
            <button type="button" onClick={onAllocateOpen}
              className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold text-white active:scale-95 transition"
              style={{ background: "#3b82f6" }}>分配选定({selectedCells.size})</button>
          )}
          {mode === "allocate" && selectedCells.size > 0 && allocBatchKind === "cancel" && (
            <button type="button" onClick={onAllocateCancel} disabled={allocSubmitting}
              className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold border active:scale-95 transition disabled:opacity-50"
              style={{ color: "#dc2626", borderColor: "#fca5a5" }}>取消分配({selectedCells.size})</button>
          )}
          {mode === "reserve" && selectedCells.size > 0 && (
            <button type="button" onClick={onReserveOpen}
              className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold text-white active:scale-95 transition"
              style={{ background: "#059669" }}>确认预定({selectedCells.size})</button>
          )}
          {isClaim && selectedCells.size > 0 && (
            <button type="button" onClick={onClaimSubmit} disabled={claimSubmitting}
              className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold text-white active:scale-95 transition disabled:opacity-50"
              style={{ background: "#059669" }}>{claimSubmitting ? "提交中…" : `提交申请(${selectedCells.size})`}</button>
          )}
        </div>
      )}

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

      {/* ── 网格（下拉刷新，取代原顶栏刷新按钮）── */}
      <div ref={gridScrollRef} className="flex-1 min-h-0 overflow-y-auto px-2 py-3"
        onTouchStart={pullRefresh.handlers.onTouchStart}
        onTouchMove={pullRefresh.handlers.onTouchMove}
        onTouchEnd={pullRefresh.handlers.onTouchEnd}>
        {(pullRefresh.indicatorVisible || pullRefresh.refreshing) && (
          <div className="flex items-center justify-center gap-1.5 pb-2 transition-opacity"
            style={{
              height: pullRefresh.refreshing ? 24 : Math.min(24, pullRefresh.pullDistance),
              opacity: pullRefresh.refreshing ? 1 : 0.35 + pullRefresh.indicatorProgress * 0.65,
            }}>
            <Loader2 className={`size-3.5 ${pullRefresh.refreshing ? "animate-spin" : ""}`} style={{ color: "#969799" }} />
            <span className="text-[10px]" style={{ color: "#969799" }}>
              {pullRefresh.refreshing ? "刷新中…" : pullRefresh.indicatorProgress >= 1 ? "松开刷新" : "下拉刷新"}
            </span>
          </div>
        )}
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
                const aid = String((cell as any).id ?? (cell as any).animalCageId ?? "");
                return (
                  <div key={cell.position} className="relative">
                    <GridCellButton cell={cell} onSelect={() => onCellClick(cell)}
                      crossCol={crossX} crossRow={crossY}
                      isCached={cachedKeys.has(ck)}
                      isLastScanned={ck === lastScannedKey}
                      cachedActions={cacheEntry?.currentActions}
                      selected={(isAlloc || isClaim) && selectedCells.has(`${sid}:${cell.x}:${cell.y}`)}
                      isPoolCell={isClaim && aid !== "" && claimPoolIds.has(aid)}
                      isMyClaimCell={aid !== "" && myClaimCageIds.has(aid)}
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

      {/* ── 常驻扫码 FAB：全角色可见，结果按当前模式分派（对齐 Web handleResidentScan）── */}
      <button
        type="button"
        onClick={onOpenScan}
        className="fixed right-4 flex items-center justify-center rounded-full active:scale-95 transition-transform"
        style={{
          width: 48,
          height: 48,
          bottom: "calc(50px + env(safe-area-inset-bottom, 0px) + 16px)",
          background: BRAND,
          boxShadow: "0 4px 16px rgba(172,23,54,0.35)",
          zIndex: 50,
        }}
        aria-label={mode === "edit" ? "状态扫码" : mode === "confirm" ? "确认" : "扫码定位"}
      >
        <Scan className="size-6 text-white" strokeWidth={1.5} />
        {editMode && totalDiffs > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-white text-[10px] font-bold flex items-center justify-center"
            style={{ color: BRAND }}>{totalDiffs}</span>
        )}
      </button>

      <MobileScanDialog open={scanOpen} onClose={onCloseScan} onResult={onScanResult} />
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
  const [mode, setMode] = useState<ShelfMode>("view");
  // 后端下发的可见模式 key 列表（null=尚未拉取/失败，网格页回退本地硬编码）
  const [visibleModes, setVisibleModes] = useState<string[] | null>(null);
  const editMode = mode === "edit";
  const [scanCache, setScanCache] = useState<Map<string, ScanCacheEntry>>(new Map());
  const [lastScannedKey, setLastScannedKey] = useState<string | null>(null);  // "x:y" 刚扫的
  const [actionSubmitting, setActionSubmitting] = useState(false);
  const [scanLockHighlight, setScanLockHighlight] = useState<{sid: string; x: number; y: number} | null>(null);
  // ── 扫码确认模式 ──
  const [confirmLookup, setConfirmLookup] = useState<CodeLookupResult | null>(null);
  const [confirmSubmitting, setConfirmSubmitting] = useState(false);
  const hasChanges = countTotalDiffs(scanCache) > 0;

  // ── 分配/认领（教职工）勾选集 ──
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [aupList, setAupList] = useState<AupItem[]>([]);
  const [allocDialogOpen, setAllocDialogOpen] = useState(false);
  const [selectedAupId, setSelectedAupId] = useState("");
  const [allocSubmitting, setAllocSubmitting] = useState(false);
  const [reserveOpen, setReserveOpen] = useState(false);
  const [reserveSubmitting, setReserveSubmitting] = useState(false);
  // ── 归档 ──
  const [archiveTarget, setArchiveTarget] = useState<{ animalCageId: string; positionLabel: string; occupantName?: string; projectPiName?: string; aupNumber?: string } | null>(null);
  const [archiveSubmitting, setArchiveSubmitting] = useState(false);
  // ── 记录 ──
  const [recordTarget, setRecordTarget] = useState<string | null>(null);
  // ── 学生申请 ──
  const [poolCells, setPoolCells] = useState<Map<string, PoolCell>>(new Map());
  const [claimSubmitting, setClaimSubmitting] = useState(false);
  const [myClaimsOpen, setMyClaimsOpen] = useState(false);
  /**
   * 本人待确认到位（locked）的笼位 id 集合 —— 供确认模式高亮。
   * 教职工看到的 locked 是全院的，不属于「自己的」，故仅学生视角加载。
   */
  const [myClaimCageIds, setMyClaimCageIds] = useState<Set<string>>(new Set());
  // shelveId → cage_shelf_index.id（shelfIndexId），申请模式反查池数据用
  const [shelfIndexIdMap, setShelfIndexIdMap] = useState<Record<string, number>>({});

  /** 只分两个视角：教职工 = html5PrivilegeBypass 或非学生账号 */
  const isStaffView = !!(html5PrivilegeBypass || !isStudentAccount());

  // 拉一次后端下发的可见模式列表（身份由后端算好）；失败保留 null，网格页回退本地硬编码
  useEffect(() => {
    let cancelled = false;
    fetchCageModeVisible()
      .then((r) => { if (!cancelled && r.modes?.length) setVisibleModes(r.modes); })
      .catch(() => { /* 回退本地硬编码 */ });
    return () => { cancelled = true; };
  }, []);

  // 学生视角进入确认模式时拉一次「我的认领」，用于高亮本人待到位的笼位
  useEffect(() => {
    if (isStaffView || mode !== "confirm") { setMyClaimCageIds(new Set()); return; }
    let cancelled = false;
    fetchMyClaims()
      .then((list) => {
        if (cancelled) return;
        setMyClaimCageIds(new Set(list.filter((c) => c.claimStatus === "locked").map((c) => String(c.animalCageId))));
      })
      .catch(() => { if (!cancelled) setMyClaimCageIds(new Set()); });
    return () => { cancelled = true; };
  }, [isStaffView, mode, detailReloadKey]);

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
        const idxMap: Record<string, number> = {};
        for (const row of treeRows) {
          if (row.shelveId) {
            treeMap[String(row.shelveId)] = {
              type1: Number((row as any).type1 ?? 0),
              type2: Number((row as any).type2 ?? 0),
              type3: Number((row as any).type3 ?? 0),
              type4: Number((row as any).type4 ?? 0),
            };
            if (row.id != null) idxMap[String(row.shelveId)] = row.id;
          }
        }
        setShelfIndexIdMap(idxMap);

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
  }, [token, jwtMode, selectedShelf, screen, detailReloadKey, editMode]);

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
  const [editFormValues, setEditFormValues] = useState<CageInfoValueRow[] | null>(null);
  const editViewportHeight = useViewportHeight();
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

  const handleEditHistoryDelete = useCallback(async (id: number) => {
    if (!await appConfirm("确定删除该条历史记录？")) return;
    authHttp.delete(`/local/history/${id}`).then(() => {
      setEditHistory(p => p.filter(h => h.id !== id));
      toast.success("已删除");
    }).catch(() => toast.error("删除失败"));
  }, []);

  // 从勾选集提取笼位 cageId（H5 单笼架，key = sid:x:y）
  const cageIdsFromSelection = useCallback((cells: Set<string>): string[] => {
    const ids: string[] = [];
    for (const key of cells) {
      const parts = key.split(":");
      const x = parseInt(parts[1]), y = parseInt(parts[2]);
      const c = detail?.grid?.find((c) => c.x === x && c.y === y);
      if (c) { const id = String((c as any).id ?? (c as any).animalCageId ?? ""); if (id) ids.push(id); }
    }
    return ids;
  }, [detail]);

  const currentSid = String(detail?.shelfMeta?.shelveId ?? selectedShelf?.shelveId ?? "");

  /**
   * 分配模式当前批次的动作类型（与 Web 管理端同一套规则）：
   * `allocate` = 选中「等待分配」，下一步下发 AUP；
   * `cancel`   = 选中「已预约(空笼盒)」，下一步撤回 AUP 退回「等待分配」。
   * 空选为 null，两种都能起头；起头后不允许混选。
   */
  const allocBatchKind = useMemo(() => {
    for (const key of selectedCells) {
      const parts = key.split(":");
      const x = parseInt(parts[1]), y = parseInt(parts[2]);
      const c = detail?.grid?.find((g) => g.x === x && g.y === y);
      if (!c) continue;
      const v = allocSelectVerdict((c as any).cageTypeCode ?? c.animalCageType);
      if (v.ok) return v.kind;
    }
    return null;
  }, [selectedCells, detail]);

  // 分配：等待分配(1)→分配；已预约空笼盒(2)→取消分配；其余须先归档
  const handleAllocateToggle = useCallback((cell: CageShelfCell) => {
    const key = `${currentSid}:${cell.x}:${cell.y}`;
    // 已选中的再点一次是取消勾选，不必再过闸门
    if (!selectedCells.has(key)) {
      const v = allocSelectVerdict((cell as any).cageTypeCode ?? cell.animalCageType);
      if (!v.ok) { toast(v.reason); return; }
      if (allocBatchKind !== null && v.kind !== allocBatchKind) { toast(ALLOC_MIXED_KIND_HINT); return; }
    }
    setSelectedCells((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }, [currentSid, selectedCells, allocBatchKind]);

  // 认领（教职工）：仅 cageTypeCode===2 且无活跃认领
  const handleReserveToggle = useCallback((cell: CageShelfCell) => {
    const ct = (cell as any).cageTypeCode ?? cell.animalCageType;
    const status = (cell as any).claimStatus;
    if (ct !== 2) { toast("只能选择「已预约空笼盒」状态的笼位"); return; }
    if (status && ["pending_approval", "locked", "confirmed", "pending_release_approval"].includes(status)) {
      toast("该笼位已有预定，不可重复选择"); return;
    }
    const key = `${currentSid}:${cell.x}:${cell.y}`;
    setSelectedCells((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }, [currentSid]);

  // 学生申请：仅池内
  const handleClaimToggle = useCallback((cell: CageShelfCell) => {
    const aid = String((cell as any).id ?? (cell as any).animalCageId ?? "");
    if (!aid || !poolCells.has(aid)) {
      toast.error("该笼位不在你的可申请范围内，无法申请。");
      return;
    }
    const key = `${currentSid}:${cell.x}:${cell.y}`;
    setSelectedCells((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }, [poolCells, currentSid]);

  // 扫码确认：点格子 → 开核对弹窗（仅 locked）
  const handleConfirmCell = useCallback((cell: CageShelfCell) => {
    const status = (cell as any).claimStatus;
    const claimId = (cell as any).activeClaimId;
    if (!status) { toast.error("该笼位未分配"); return; }
    if (status === "locked" && claimId) {
      setConfirmLookup({
        type: "CAGE_CELL",
        cageCell: {
          animalCageId: String((cell as any).id ?? (cell as any).animalCageId ?? ""),
          positionLabel: displayPosition(cell.position),
          positionX: cell.x,
          positionY: cell.y,
          campusName: "",
          roomName: "",
          shelveId: currentSid,
        } as any,
        claim: {
          id: Number(claimId),
          claimStatus: status,
          claimantId: "",
          claimantName: (cell as any).occupantName ?? "",
          projectPiName: (cell as any).projectPiName ?? "",
          aupNumber: (cell as any).aupNumber ?? (cell as any).detail?.aupNumber ?? "",
          projectName: (cell as any).projectGroup ?? "",
          hasInfo: true,
        } as any,
      });
      return;
    }
    if (status === "confirmed") { toast.success("该笼位已到位"); return; }
    if (status === "pending_approval") { toast.error("该笼位待审批"); return; }
    if (status === "pending_release_approval") { toast.error("该笼位待释放审批"); return; }
    toast.error("该笼位状态：" + status);
  }, [currentSid]);

  // 归档：仅 cageTypeCode===3
  const handleArchiveCell = useCallback((cell: CageShelfCell) => {
    const ct = (cell as any).cageTypeCode ?? cell.animalCageType;
    if (ct !== 3) { toast.error("该笼位当前无笼盒/未占用，无需归档"); return; }
    setArchiveTarget({
      animalCageId: String((cell as any).id ?? (cell as any).animalCageId ?? ""),
      positionLabel: displayPosition(cell.position),
      occupantName: (cell as any).occupantName,
      projectPiName: (cell as any).projectPiName ?? (cell as any).detail?.projectPiName,
      aupNumber: (cell as any).aupNumber ?? (cell as any).detail?.aupNumber,
    });
  }, []);

  // 记录：任意非空笼位 → 历史弹窗
  const handleRecordCell = useCallback((cell: CageShelfCell) => {
    const cageId = String((cell as any).id ?? (cell as any).animalCageId ?? "");
    if (cageId) setRecordTarget(cageId); else toast.error("该笼位无 ID");
  }, []);

  const handleCellClick = (cell: CageShelfCell) => {
    if (cell.empty) return;
    // 编辑模式：点击单元格 → 打开 action popup（仅 cageTypeCode 3/4 可编辑）
    if (mode === "edit") {
      const ct = (cell as any).cageTypeCode ?? cell.animalCageType;
      if (ct !== 3 && ct !== 4) { toast.error("该笼位不可标记状态"); return; }
      openEditActionPopup(cell);
      return;
    }
    if (mode === "allocate") { handleAllocateToggle(cell); return; }
    if (mode === "reserve") { handleReserveToggle(cell); return; }
    if (mode === "claim") { handleClaimToggle(cell); return; }
    if (mode === "confirm") { handleConfirmCell(cell); return; }
    if (mode === "archive") { handleArchiveCell(cell); return; }
    if (mode === "record") { handleRecordCell(cell); return; }
    // 查看模式：打开详情弹窗
    setSelectedCell(cell);
  };

  // ── 扫码结果处理 ──
  // 编辑操作弹窗：打开时从 /local/annotate 加载备注和照片（非 cell.detail）
  const openEditActionPopup = useCallback((cell: CageShelfCell) => {
    setActionPhotos([]);
    setActionNote("");
    setEditActionCell(cell);
    setEditFormValues(null);
    const cageId = String((cell as any).id ?? (cell as any).animalCageId ?? "");
    if (cageId) {
      // 拉取表单值(cage_info_value)：状态标记唯一真相源，据此反向使能按钮
      fetchCageInfoValues(cageId).then(setEditFormValues).catch(() => setEditFormValues(null));
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
        for (const k of statusPhotoKeys(actionsFromFormValues(editFormValues))) sp[k] = actionPhotos;
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

  // ── 扫码定位：跳转到目标笼架并高亮闪烁 ──
  const locateLookup = useCallback((r: CodeLookupResult): boolean => {
    const p = lookupPosition(r);
    if (!p) { toast.error("未找到对应笼位坐标"); return false; }
    if (!p.sid) { toast.error("未找到关联笼架"); return false; }
    const targetShelf = shelves.find((s) => String(s.shelveId) === p.sid);
    if (!targetShelf) { toast.error("当前列表未找到对应笼架"); return false; }
    setSelectedShelf(targetShelf);
    setScreen("grid");
    setScanLockHighlight({ sid: p.sid, x: p.x, y: p.y });
    toast.success(`已定位: ${p.label}`, { icon: "📍" });
    return true;
  }, [shelves]);

  // ── 编辑模式扫码：匹配格子 → 落入待提交缓存 → 打开动作弹窗 ──
  const handleEditScan = useCallback(async (r: CodeLookupResult, code: string) => {
    if (!detail?.grid) return;
    if (r.type === "NOT_FOUND") { toast.error("未找到对应笼位"); return; }
    if (r.type === "ASSET") { toast.error("该编码为资产编号，非笼位"); return; }
    if (r.type === "LEGACY_CAGE_BOX") { toast.error("旧盒码已废弃，请扫笼位码"); return; }
    const p = lookupPosition(r);
    if (!p) { toast.error("未找到对应笼位坐标"); return; }
    const matched = detail.grid.find((c: any) => c.x === p.x && c.y === p.y);
    if (!matched) { toast.error(`当前笼架未找到坐标 (${p.x},${p.y})`); return; }
    const key = `${matched.x}:${matched.y}`;
    // 状态标记以表单为真相源：先拉表单值再建缓存条目
    let preActions = new Set<CageBoxAction>();
    const cageId = String((matched as any).id ?? (matched as any).animalCageId ?? "");
    if (cageId) {
      try {
        const rows = await fetchCageInfoValues(cageId);
        setEditFormValues(rows);
        preActions = actionsFromFormValues(rows);
      } catch { /* 拉取失败按空集，弹窗打开后仍会再拉一次 */ }
    }
    setScanCache((prev) => {
      const next = new Map(prev);
      if (!next.has(key)) {
        next.set(key, { cell: matched, code, initialActions: new Set(preActions), currentActions: new Set(preActions) });
      }
      return next;
    });
    setLastScannedKey(key);
    openEditActionPopup(matched);
  }, [detail, openEditActionPopup]);

  // ── 扫码确认模式：定位 → 判定认领状态 → 打开核对弹窗 ──
  const handleConfirmScan = useCallback(async (r: CodeLookupResult) => {
    if (r.type === "NOT_FOUND") { toast.error("未识别笼位"); return; }
    if (r.type === "ASSET") { toast.error("该编码为资产编号，非笼位"); return; }
    if (r.type === "LEGACY_CAGE_BOX") { toast.error("旧盒码已废弃，请扫笼位码"); locateLookup(r); return; }
    locateLookup(r);
    const claim = r.claim;
    if (!claim) { toast.error("该笼位未分配"); return; }
    if (claim.claimStatus === "locked") { setConfirmLookup(r); return; }
    if (claim.claimStatus === "confirmed") { toast.success("该笼位已到位"); return; }
    if (claim.claimStatus === "pending_approval") { toast.error("该笼位待审批"); return; }
    if (claim.claimStatus === "pending_release_approval") { toast.error("该笼位待释放审批"); return; }
    toast.error("该笼位状态：" + claim.claimStatus);
  }, [locateLookup]);

  // ── 确认到位（教职工代确认 / 学生本人确认）──
  const handleConfirmArrival = useCallback(async () => {
    if (!confirmLookup?.claim?.id) return;
    setConfirmSubmitting(true);
    try {
      if (isStaffView) await adminConfirmClaim(confirmLookup.claim.id);
      else await confirmClaim(confirmLookup.claim.id);
      toast.success("已确认到位");
      setConfirmLookup(null);
      setDetailReloadKey((k) => k + 1);
    } catch (e: any) {
      toast.error(e?.message || "确认失败");
    } finally {
      setConfirmSubmitting(false);
    }
  }, [confirmLookup, isStaffView]);

  // ── 归档模式：扫码 → 定位 → 开归档弹窗 ──
  const handleArchiveScan = useCallback(async (r: CodeLookupResult) => {
    if (r.type === "NOT_FOUND") { toast.error("未识别笼位"); return; }
    if (r.type === "ASSET") { toast.error("该编码为资产编号，非笼位"); return; }
    if (r.type === "LEGACY_CAGE_BOX") { toast.error("旧盒码已废弃，请扫笼位码"); await locateLookup(r); return; }
    await locateLookup(r);
    if (r.claim) {
      setArchiveTarget({
        animalCageId: String(r.cageCell?.animalCageId ?? ""),
        positionLabel: r.cageCell?.positionLabel ?? "",
        occupantName: r.claim.claimantName,
        projectPiName: r.claim.projectPiName ?? "",
        aupNumber: r.claim.aupNumber ?? "",
      });
    } else {
      toast.error("该笼位无占用记录，无需归档");
    }
  }, [locateLookup]);

  // ── 常驻扫码入口：按当前模式分派（对齐 Web handleResidentScan）──
  const handleResidentScan = useCallback(async (text: string) => {
    setScanOpen(false);
    const code = text.trim();
    if (!code) return;
    let r: CodeLookupResult;
    try {
      r = await lookupCode(code);
    } catch (e: any) {
      toast.error(e?.message || "扫码查询失败");
      return;
    }
    if (mode === "edit") { await handleEditScan(r, code); return; }
    if (mode === "confirm") { await handleConfirmScan(r); return; }
    if (mode === "archive") { await handleArchiveScan(r); return; }
    // 查看/分配/认领/记录/预约/申请：纯定位（勾选靠点格子）
    if (r.type === "NOT_FOUND") { toast.error("未找到对应笼位"); return; }
    if (r.type === "ASSET") { toast.error("该编码为资产编号，非笼位"); return; }
    if (r.type === "LEGACY_CAGE_BOX") toast.error("旧盒码已废弃，请扫笼位码");
    locateLookup(r);
  }, [mode, handleEditScan, handleConfirmScan, handleArchiveScan, locateLookup]);

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
      const toggle = cageBoxAction(action).statusField;
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
      const toggle = cageBoxAction(action).statusField;
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
          let sp2: Record<string,string[]> = {};
          try {
            const r = await authHttp.get(`/local/annotate/${cageId}`);
            if (r.data?.success && r.data.data?.statusPhotos) {
              const existing = JSON.parse(r.data.data.statusPhotos);
              if (typeof existing === "object") sp2 = existing;
            }
          } catch {}
          for (const k of statusPhotoKeys(actionsFromFormValues(editFormValues))) sp2[k] = actionPhotos;
          if (actionPhotos.length > 0) sp2._status = actionPhotos;
          if (actionNote.trim()) (sp2 as any)._note = actionNote;
          const body: Record<string,any> = { animalCageId: cageId, statusPhotos: JSON.stringify(sp2) };
          try { await authHttp.post("/local/annotate", body); } catch { /* 非致命 */ }
        }
      }
      toast.success(`已完成 ${okCount} 个操作（本地）`);
      setScanCache(new Map());
      setLastScannedKey(null);
      setEditActionCell(null); setActionPhotos([]); setActionNote("");
      setDetailReloadKey((k) => k + 1);
    } else {
      toast(`${okCount} 成功 / ${failCount} 失败`, { icon: '⚠️' });
    }
    setActionSubmitting(false);
  }, [selectedShelf, detail, scanCache, editActionCell, actionPhotos, actionNote]);

  // ── 分配/认领：进入对应模式时懒加载 AUP 列表 ──
  useEffect(() => {
    if (mode !== "allocate" && mode !== "reserve") return;
    fetchAllocationAups().then(setAupList).catch(() => setAupList([]));
  }, [mode]);

  // ── 申请：进入申请模式时加载当前笼架池数据 ──
  useEffect(() => {
    if (mode !== "claim" || !selectedShelf) { setPoolCells(new Map()); return; }
    const idxId = shelfIndexIdMap[String(selectedShelf.shelveId)];
    if (!idxId) { setPoolCells(new Map()); return; }
    let cancelled = false;
    fetchPoolCells(idxId).then((list) => {
      if (cancelled) return;
      const m = new Map<string, PoolCell>();
      for (const c of list) m.set(String(c.animalCageId), c);
      setPoolCells(m);
    }).catch(() => { if (!cancelled) setPoolCells(new Map()); });
    return () => { cancelled = true; };
  }, [mode, selectedShelf, shelfIndexIdMap, detailReloadKey]);

  // 认领弹窗：按已选笼位的 AUP 课题组预览成员
  const reserveAupGroupNames = useMemo(() => {
    const byAup = new Map<string, string>();
    for (const a of aupList) if (a.registerNo && a.projectGroupName) byAup.set(a.registerNo, a.projectGroupName);
    const s = new Set<string>();
    for (const key of selectedCells) {
      const parts = key.split(":");
      const x = parseInt(parts[1]), y = parseInt(parts[2]);
      const c = detail?.grid?.find((c) => c.x === x && c.y === y);
      const aup = (c as any)?.aupNumber ?? (c as any)?.detail?.aupNumber;
      if (aup && byAup.has(String(aup))) s.add(byAup.get(String(aup))!);
    }
    return Array.from(s);
  }, [selectedCells, detail, aupList]);

  // ── 分配：确认分配（本地数据源） ──
  const handleConfirmAlloc = useCallback(async () => {
    if (!selectedAupId || selectedCells.size === 0) return;
    const cageIds = cageIdsFromSelection(selectedCells);
    if (cageIds.length === 0) { toast.error("无法获取选中笼位的 ID"); return; }
    const roomId = String((detail?.shelfMeta as any)?.roomId ?? selectedShelf?.roomId ?? "");
    const aup = aupList.find((x) => String(x.id) === String(selectedAupId));
    // 二次确认：手机误触成本高，批量写入前先让用户核对笼位数与目标 AUP
    if (!await appConfirm(`确定将 ${cageIds.length} 个笼位分配给「${aup?.registerNo || selectedAupId}${aup?.piName ? " · " + aup.piName : ""}」？`)) return;
    setAllocSubmitting(true);
    try {
      await localAllocate(cageIds, selectedAupId, roomId, currentSid, aup?.piName || "", aup?.registerNo || "");
      toast.success(`已分配 ${cageIds.length} 个笼位（本地）`);
      setAllocDialogOpen(false);
      setSelectedCells(new Set());
      setSelectedAupId("");
      setDetailReloadKey((k) => k + 1);
    } catch (e: any) { toast.error(e?.message || "分配失败"); }
    finally { setAllocSubmitting(false); }
  }, [selectedAupId, selectedCells, cageIdsFromSelection, aupList, detail, selectedShelf, currentSid]);

  // ── 分配：取消分配 ──
  const handleCancelAlloc = useCallback(async () => {
    const cageIds = cageIdsFromSelection(selectedCells);
    if (cageIds.length === 0) return;
    // 二次确认：取消分配会清空笼位 AUP 并退回「等待分配」，不可一键撤销
    if (!await appConfirm(`确定取消 ${cageIds.length} 个笼位的分配？

取消后笼位将清空 AUP，退回「等待分配」。`)) return;
    setAllocSubmitting(true);
    try {
      await localCancelAllocate(cageIds);
      toast.success(`已取消 ${cageIds.length} 个笼位分配（本地）`);
      setSelectedCells(new Set());
      setDetailReloadKey((k) => k + 1);
    } catch (e: any) { toast.error(e?.message || "取消分配失败"); }
    finally { setAllocSubmitting(false); }
  }, [selectedCells, cageIdsFromSelection]);

  // ── 认领：确认认领（指派占用者，免审核建 locked 认领） ──
  const handleReserveConfirm = useCallback(async (p: { name: string; accountId: string }) => {
    if (selectedCells.size === 0 || !p.accountId) return;
    const cageIds = cageIdsFromSelection(selectedCells);
    if (cageIds.length === 0) { toast.error("无法获取选中笼位的 ID"); return; }
    setReserveSubmitting(true);
    try {
      const results = await assignBatchCages(cageIds, p.accountId);
      const failed = results.filter((r) => !r.ok).length;
      if (failed > 0) toast.error(`已预定 ${cageIds.length - failed} 个笼位给 ${p.name}，${failed} 个失败`);
      else toast.success(`已预定 ${cageIds.length} 个笼位给 ${p.name}`);
    } catch (e: any) { toast.error(e?.message || "预定失败"); }
    finally {
      setReserveSubmitting(false);
      setReserveOpen(false);
      setSelectedCells(new Set());
      setDetailReloadKey((k) => k + 1);
    }
  }, [selectedCells, cageIdsFromSelection]);

  // ── 归档：确认归档 ──
  const handleArchiveConfirm = useCallback(async () => {
    if (!archiveTarget?.animalCageId) return;
    setArchiveSubmitting(true);
    try {
      await archiveCage(archiveTarget.animalCageId);
      toast.success("已归档");
      setArchiveTarget(null);
      setDetailReloadKey((k) => k + 1);
    } catch (e: any) { toast.error(e?.message || "归档失败"); }
    finally { setArchiveSubmitting(false); }
  }, [archiveTarget]);

  // ── 学生：提交申请 ──
  const submitClaims = useCallback(async () => {
    if (selectedCells.size === 0) return;
    const idxId = shelfIndexIdMap[String(selectedShelf?.shelveId ?? "")];
    if (!idxId) { toast.error("未找到笼架索引"); return; }
    setClaimSubmitting(true);
    let ok = 0, fail = 0;
    const errors: string[] = [];
    for (const key of Array.from(selectedCells)) {
      const parts = key.split(":");
      const x = parseInt(parts[1]), y = parseInt(parts[2]);
      const c = detail?.grid?.find((c) => c.x === x && c.y === y);
      const aid = String((c as any)?.id ?? (c as any)?.animalCageId ?? "");
      if (!aid) { fail++; errors.push("无法定位笼位ID"); continue; }
      if (!poolCells.has(aid)) { fail++; errors.push("该笼位已不在可申请池中"); continue; }
      try { await claimCage(aid, idxId); ok++; } catch (e: any) { fail++; errors.push(e?.message || "申请失败"); }
    }
    setClaimSubmitting(false);
    setSelectedCells(new Set());
    if (ok > 0) setDetailReloadKey((k) => k + 1);
    const firstErr = errors[0];
    if (ok > 0 && fail > 0) toast(`${ok} 成功 / ${fail} 失败${firstErr ? `：${firstErr}` : ""}`, { icon: "⚠️" });
    else if (ok > 0) toast.success(`申请已提交：${ok} 个`);
    else toast.error(firstErr || `申请失败 ${fail} 个`);
  }, [selectedCells, shelfIndexIdMap, selectedShelf, detail, poolCells]);

  // ── 返回列表：检查未保存修改 ──
  const goBackToList = useCallback(async () => {
    if (hasChanges) {
      if (!await appConfirm("有未提交的扫码修改，是否放弃？\n\n「确定」放弃并返回\n「取消」继续编辑")) return;
    }
    setScanCache(new Map());
    setLastScannedKey(null);
    setScanLockHighlight(null);
    setMode("view");
    setConfirmLookup(null);
    setSelectedCells(new Set());
    setArchiveTarget(null);
    setRecordTarget(null);
    setAllocDialogOpen(false);
    setSelectedAupId("");
    setReserveOpen(false);
    setPoolCells(new Map());
    setEditActionCell(null);
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
    // 预约模式整页替换了网格，且自身不再画返回按钮（避免与 shell 的返回并存）；
    // 返回时先退回「查看」模式露出网格，再按一次才回列表。
    if (screen === "grid" && mode === "booking") {
      setMode("view");
      return true;
    }
    if (screen === "grid") {
      goBackToList();
      return true;
    }
    return false;
  }, [specialStatusOpen, selectedCell, screen, mode, goBackToList]);

  useImperativeHandle(ref, () => ({ pop: popNavigation }), [popNavigation]);

  /** 统一模式切换：清空选中集 / 扫码缓存 / 待提交态，避免模式间状态串味（对齐 Web switchMode） */
  const switchMode = useCallback(async (next: ShelfMode) => {
    if (next === mode) return;
    // 离开编辑模式且有未提交修改 → 先确认
    if (mode === "edit" && hasChanges) {
      if (!await appConfirm("有未提交的修改，是否放弃？\n\n「确定」放弃修改并退出\n「取消」继续编辑")) return;
    }
    setSelectedCells(new Set());
    setScanCache(new Map());
    setLastScannedKey(null);
    setConfirmLookup(null);
    setArchiveTarget(null);
    setRecordTarget(null);
    setAllocDialogOpen(false);
    setSelectedAupId("");
    setReserveOpen(false);
    setPoolCells(new Map());
    setEditActionCell(null);
    setSelectedCell(null);
    setMode(next);
    // 进入编辑模式需要实时数据
    if (next === "edit") setDetailReloadKey((k) => k + 1);
  }, [mode, hasChanges]);

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
            onOpenMyClaims={() => setMyClaimsOpen(true)}
            showMyClaimsEntry={!isStaffView}
          />
          {/* ── 扫码定位 FAB（列表页常驻，全角色可见）── */}
          <button
            type="button"
            onClick={() => setScanOpen(true)}
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
          <MobileScanDialog open={scanOpen} onClose={() => setScanOpen(false)} onResult={handleResidentScan} />
        </div>

        {screen === "grid" && selectedShelf && (
          <div className="absolute inset-0 z-10 flex flex-col">
            <CageShelfGridView
              shelf={selectedShelf}
              detail={detail}
              loading={detailLoading}
              error={detailError}
              onRetry={() => setDetailReloadKey((k) => k + 1)}
              onCellClick={handleCellClick}
              isStaffView={isStaffView}
              mode={mode}
              onSetMode={switchMode}
              visibleModes={visibleModes}
              scanOpen={scanOpen}
              onOpenScan={() => setScanOpen(true)}
              onCloseScan={() => setScanOpen(false)}
              onScanResult={handleResidentScan}
              scanCache={scanCache}
              lastScannedKey={lastScannedKey}
              onActionSubmit={handleScanActionsSubmit}
              actionSubmitting={actionSubmitting}
              scanLockHighlight={scanLockHighlight}
              selectedCells={selectedCells}
              claimPoolIds={new Set(poolCells.keys())}
              myClaimCageIds={myClaimCageIds}
              onAllocateOpen={() => setAllocDialogOpen(true)}
              onAllocateCancel={handleCancelAlloc}
              allocBatchKind={allocBatchKind}
              allocSubmitting={allocSubmitting}
              onReserveOpen={() => setReserveOpen(true)}
              reserveSubmitting={reserveSubmitting}
              onClaimSubmit={submitClaims}
              claimSubmitting={claimSubmitting}
            />
          </div>
        )}

        {/* 查看模式：查看详情弹窗 */}
        {selectedCell && selectedShelf && mode === "view" && (
          <MobileCageCellDetailDialog
            cell={selectedCell}
            onClose={() => setSelectedCell(null)}
            staffView={isStaffView}
          />
        )}

        {/* ── 编辑模式：轻量 action popup（3 个 chip + 上传按钮）── */}
        {editMode && editActionCell && (
          <div
            className="fixed inset-0 flex items-center justify-center"
            style={{
              zIndex: "var(--z-modal, 800)",
              background: "rgba(0,0,0,0.4)",
              height: editViewportHeight > 0 ? editViewportHeight : "100dvh",
              padding: "calc(env(safe-area-inset-top, 0px) + 12px) 16px calc(env(safe-area-inset-bottom, 0px) + 12px)",
            }}
            onClick={saveAndCloseActionPopup}
          >
            {/* 容器必须限高 + 内滚：照片一多内容就超过视口，
                以前没有 max-height/overflow 会把底部的「保存标注」直接裁出可视区，
                表现为「加完照片没有保存按钮」。 */}
            <div
              className="w-full flex flex-col rounded-2xl overflow-hidden shadow-2xl"
              style={{ background: "#fff", maxWidth: 320, maxHeight: "100%" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b shrink-0" style={{ borderColor: "#ebedf0" }}>
                <span className="text-sm font-bold" style={{ color: "#323233" }}>
                  {displayPosition(editActionCell.position)}
                </span>
                {/* 走与点遮罩一致的保存后关闭，否则从 X 退出会丢掉刚上传的照片 */}
                <button type="button" onClick={saveAndCloseActionPopup} className="p-1 rounded-lg">
                  <XIcon className="size-4" style={{ color: "#94a3b8" }} />
                </button>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4 space-y-3">
                <div className="grid grid-cols-2 gap-1.5">
                  {CAGE_BOX_ACTIONS.map(({ action, label }) => {
                    const ck = `${editActionCell.x}:${editActionCell.y}`;
                    const entry = scanCache.get(ck);
                    // 无缓存条目时回退到格子当前状态（打开即同步，而非首次点击才懒加载）
                    const cbi = editActionCell.cageBoxInfo as Record<string, any> | undefined;
                    const cvo = cbi?.cageBoxVo ?? cbi?.['cageBoxVo'] ?? {};
                    const srvHas = new Set([
                      ...actionsFromFormValues(editFormValues),
                      ...actionsFromCageBoxInfo(cbi, cvo),
                    ]);
                    if ((typeof cbi?.specialBreedingName === 'string' && cbi.specialBreedingName.trim())
                        || (typeof cvo.specialBreedingName === 'string' && cvo.specialBreedingName.trim())) srvHas.add("SPECIAL_BREEDING");
                    if (cbi?.animalHealthEntity != null || cvo.animalHealthEntity != null) srvHas.add("HEALTH_CHECK");
                    const active = entry ? entry.currentActions.has(action) : srvHas.has(action);
                    const wasExisting = entry ? entry.initialActions.has(action) : srvHas.has(action);
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
                            // 本地状态字段与 ARO 快照都可能带信息，取并集
                            const initial = new Set([
                              ...actionsFromFormValues(editFormValues),
                              ...actionsFromCageBoxInfo(cbi, cvo),
                            ]);
                            // ARO 侧的两个旁证字段：有特殊饲养名 / 有健康记录也视为已标记
                            if ((typeof cbi?.specialBreedingName === 'string' && cbi.specialBreedingName.trim())
                                || (typeof cvo.specialBreedingName === 'string' && cvo.specialBreedingName.trim())) initial.add("SPECIAL_BREEDING");
                            if (cbi?.animalHealthEntity != null || cvo.animalHealthEntity != null) initial.add("HEALTH_CHECK");
                            setScanCache(prev => {
                              const next = new Map(prev);
                              next.set(key, { cell: editActionCell, code: "", initialActions: initial, currentActions: new Set(initial) });
                              return next;
                            });
                          }
                          toggleScanAction(key, action);
                        }}
                        className="rounded-md px-2 py-1.5 text-[11px] font-semibold active:scale-[0.98] transition flex items-center justify-center gap-1 min-h-0"
                        style={{ color: active ? (wasExisting ? "#059669" : BRAND) : "#94a3b8", background: bg, border: `1.5px solid ${accent}` }}
                      >
                        {active && <Check className="size-3" strokeWidth={3} />}
                        {!active && wasExisting && <XIcon className="size-3" strokeWidth={2} />}
                        <span className="truncate">{label}</span>
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
                          let sp: Record<string,string[]> = {};
                          try {
                            const r = await authHttp.get('/local/annotate/' + cageId);
                            if (r.data?.success && r.data.data?.statusPhotos) {
                              const existing = JSON.parse(r.data.data.statusPhotos);
                              if (typeof existing === "object") sp = existing;
                            }
                          } catch { }
                          for (const k of statusPhotoKeys(actionsFromFormValues(editFormValues))) sp[k] = actionPhotos;
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
                          let sp: Record<string,string[]> = {};
                          try {
                            const r = await authHttp.get('/local/annotate/' + cageId);
                            if (r.data?.success && r.data.data?.statusPhotos) {
                              const existing = JSON.parse(r.data.data.statusPhotos);
                              if (typeof existing === "object") sp = existing;
                            }
                          } catch { }
                          for (const k of statusPhotoKeys(actionsFromFormValues(editFormValues))) sp[k] = actionPhotos;
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
                      const label = h.statusField === "_annotation"
                        ? "标注记录"
                        : (CAGE_BOX_ACTIONS.find(a => a.statusField === h.statusField)?.label ?? h.statusField);
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
          variant={isStaffView ? "staff" : "student"}
        />

        {/* ── 扫码确认 · 核对信息（对齐 Web AdminCageShelfPage 确认弹窗）── */}
        <Dialog open={!!confirmLookup} onOpenChange={(o) => { if (!o) setConfirmLookup(null); }}>
          <DialogContent className="z-[var(--z-modal)] !max-w-[320px] !p-0 !gap-0 !rounded-2xl overflow-hidden shadow-[0_8px_40px_rgba(0,0,0,0.18)] border-0">
            <div className="px-5 pt-5 pb-2 text-center">
              <DialogTitle className="!text-base font-bold" style={{ color: "#1e293b" }}>确认 · 核对信息</DialogTitle>
            </div>
            <div className="px-4 pb-4 space-y-3 max-h-[60vh] overflow-y-auto">
              <div className="rounded-xl border border-[#eef0f6] divide-y divide-[#eef0f6]">
                {(() => {
                  const cc = confirmLookup?.cageCell;
                  const cl = confirmLookup?.claim;
                  const rows: { label: string; value: string; em?: boolean }[] = [];
                  if (cc) rows.push({ label: "笼位", value: cc.positionLabel || `${cc.positionX}-${cc.positionY}` });
                  if (cc?.roomName) rows.push({ label: "房间", value: cc.roomName });
                  if (cl?.claimantName) rows.push({ label: "认领人", value: cl.claimantName, em: true });
                  if (cl?.projectPiName) rows.push({ label: "课题组 PI", value: cl.projectPiName, em: true });
                  if (cl?.aupNumber) rows.push({ label: "AUP 编号", value: cl.aupNumber });
                  if (cl?.projectName) rows.push({ label: "项目", value: cl.projectName });
                  rows.push({ label: "当前状态", value: cl?.claimStatus === "locked" ? "待确认" : (cl?.claimStatus || "-"), em: true });
                  return rows.map((r, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 px-3 py-2 text-[11px]">
                      <span className="shrink-0 text-[#969799]">{r.label}</span>
                      <span className={r.em ? "truncate font-semibold text-[#1e293b]" : "truncate text-[#1e293b]"}>{r.value || "-"}</span>
                    </div>
                  ));
                })()}
              </div>
              {confirmLookup?.claim && !confirmLookup.claim.hasInfo && (
                <div className="border-t border-[#eef0f6] pt-2">
                  <div className="mb-1 text-[11px] font-semibold text-[#1e293b]">填写信息</div>
                  <CageFormFill animalCageId={confirmLookup.cageCell?.animalCageId ?? null} claimed editable />
                </div>
              )}
              <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-center">
                <span className="text-[11px] font-semibold text-amber-700">
                  {isStaffView ? "确认该笼位已到位（由管理员/饲养组长代确认）" : "确认该笼位已到位（由学生本人账号确认）"}
                </span>
              </div>
            </div>
            <div className="flex gap-3 px-5 pb-5 pt-1">
              <button onClick={() => setConfirmLookup(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-[#646566] bg-[#f2f3f5] active:bg-[#ebedf0] transition-colors">取消</button>
              <button onClick={handleConfirmArrival} disabled={confirmSubmitting}
                className="flex-1 py-2.5 rounded-xl text-sm text-white font-semibold active:opacity-80 disabled:opacity-50 transition-colors"
                style={{ background: BRAND }}>
                {confirmSubmitting ? "处理中..." : "确认到位"}
              </button>
            </div>
          </DialogContent>
        </Dialog>

        {/* ── 分配弹窗 ── */}
        {allocDialogOpen && (
          <AllocDialog aupList={aupList} selectedAupId={selectedAupId} setSelectedAupId={setSelectedAupId} selectedCells={selectedCells} allocSubmitting={allocSubmitting} onClose={() => setAllocDialogOpen(false)} onConfirm={handleConfirmAlloc} />
        )}
        {/* ── 认领弹窗 ── */}
        <ReservePersonDialog open={reserveOpen} submitting={reserveSubmitting} groupNames={reserveAupGroupNames} onClose={() => setReserveOpen(false)} onConfirm={handleReserveConfirm} />
        {/* ── 记录模式历史弹窗 ── */}
        <CageHistoryModal animalCageId={recordTarget} onClose={() => setRecordTarget(null)} />
        {/* ── 学生「我的申请」 ── */}
        <MyClaimsModal open={myClaimsOpen} onClose={() => setMyClaimsOpen(false)} />

        {/* ── 归档弹窗 ── */}
        <Dialog open={mode === "archive" && !!archiveTarget} onOpenChange={(o) => { if (!o) setArchiveTarget(null); }}>
          <DialogContent className="z-[var(--z-modal)] !max-w-[320px] !p-0 !gap-0 !rounded-2xl overflow-hidden shadow-[0_8px_40px_rgba(0,0,0,0.18)] border-0">
            <div className="px-5 pt-5 pb-2 text-center">
              <DialogTitle className="!text-base font-bold" style={{ color: "#1e293b" }}>归档笼位</DialogTitle>
            </div>
            <div className="px-4 pb-4 space-y-3">
              <div className="rounded-xl border border-[#eef0f6] divide-y divide-[#eef0f6]">
                {(() => {
                  const rows: { label: string; value: string; em?: boolean }[] = [];
                  if (archiveTarget?.positionLabel) rows.push({ label: "笼位", value: archiveTarget.positionLabel });
                  if (archiveTarget?.occupantName) rows.push({ label: "占用者", value: archiveTarget.occupantName, em: true });
                  if (archiveTarget?.projectPiName) rows.push({ label: "课题组 PI", value: archiveTarget.projectPiName });
                  if (archiveTarget?.aupNumber) rows.push({ label: "AUP 编号", value: archiveTarget.aupNumber });
                  return rows.map((r, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 px-3 py-2 text-[11px]">
                      <span className="shrink-0 text-[#969799]">{r.label}</span>
                      <span className={r.em ? "truncate font-semibold text-[#1e293b]" : "truncate text-[#1e293b]"}>{r.value || "-"}</span>
                    </div>
                  ));
                })()}
              </div>
              <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-center">
                <span className="text-[11px] font-semibold text-amber-700">确认归档该笼位？归档后释放占用并回到空笼盒</span>
              </div>
            </div>
            <div className="flex gap-3 px-5 pb-5 pt-1">
              <button onClick={() => setArchiveTarget(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-[#646566] bg-[#f2f3f5] active:bg-[#ebedf0] transition-colors">取消</button>
              <button onClick={handleArchiveConfirm} disabled={archiveSubmitting}
                className="flex-1 py-2.5 rounded-xl text-sm text-white font-semibold active:opacity-80 disabled:opacity-50 transition-colors"
                style={{ background: BRAND }}>
                {archiveSubmitting ? "归档中..." : "确认归档"}
              </button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </CageColorProvider>
  );
});
