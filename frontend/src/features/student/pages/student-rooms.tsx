import { useState, useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Star, Building2, X, Clock, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStudentRooms } from "../hooks/use-student-rooms";
import { toggleRoomPin, fetchRoomStatusList } from "../api/student.api";
import type { RoomData, FetchRoomsParams, RoomStatusData } from "../api/student.api";
import {
  RoomCard,
  ViewToggle,
  Tabs,
  StudentInput,
  StudentSelect,
  EmptyState,
  ErrorRetry,
  Skeleton,
  Badge,
  Table,
} from "../components/ui";
import type { Column } from "../components/ui";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/** 校区 tab 一次拉取足够多的房间，前端按校区过滤，不翻页 */
const CAMPUS_PAGE_SIZE = 200;

const CAMPUS_TABS = ["浦东", "浦西"] as const;
type CampusTab = (typeof CAMPUS_TABS)[number];

const STATUS_OPTIONS = [
  { value: "idle", label: "空闲" },
  { value: "busy", label: "较满" },
  { value: "full", label: "已满" },
];

const STATUS_BADGE_VARIANT: Record<RoomData["status"], "success" | "warning" | "error"> = {
  idle: "success",
  busy: "warning",
  full: "error",
};

const STATUS_LABEL: Record<RoomData["status"], string> = {
  idle: "空闲",
  busy: "较满",
  full: "已满",
};

const STATUS_BAR_COLOR: Record<RoomData["status"], string> = {
  idle: "#16a34a",
  busy: "#d97706",
  full: "#dc2626",
};

/* ------------------------------------------------------------------ */
/*  Loading skeleton                                                   */
/* ------------------------------------------------------------------ */

function RoomsSkeleton({ viewMode }: { viewMode: "card" | "list" }) {
  return (
    <div className="p-6 bg-[var(--student-canvas-soft)] min-h-full">
      <div className="flex items-center justify-between mb-4">
        <Skeleton variant="rectangular" className="h-9 w-56" />
        <Skeleton variant="rectangular" className="h-8 w-16" />
      </div>
      <div className="flex items-center gap-3 mb-4">
        <Skeleton className="h-9 flex-1" />
        <Skeleton className="h-9 w-24" />
      </div>
      {viewMode === "card" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} variant="rectangular" className="h-[120px]" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} variant="rectangular" className="h-12" />
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */

export default function StudentRoomsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  /* ---- Local state ---- */
  const [activeTab, setActiveTab] = useState<"pinned" | CampusTab>("pinned");

  const [viewMode, setViewMode] = useState<"card" | "list">(() => {
    try {
      const stored = localStorage.getItem("student-room-view");
      if (stored === "list") return "list";
    } catch {
      /* noop */
    }
    return "card";
  });

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [occupantRoom, setOccupantRoom] = useState<RoomData | null>(null); // 当前打开在室人员弹窗的房间

  /* ---- Query params — "我的" = pinned, campus tabs = all rooms filtered client-side ---- */
  const params = useMemo<FetchRoomsParams>(() => {
    if (activeTab === "pinned") {
      return { pinned: "1" };
    }
    // 拉取全部房间，前端按校区过滤，不翻页
    const p: FetchRoomsParams = { page: 1, size: CAMPUS_PAGE_SIZE };
    if (search) p.search = search;
    if (status) p.status = status;
    return p;
  }, [activeTab, search, status]);

  const { data, isLoading, isError, error, refetch } = useStudentRooms(params);

  /* ---- Room status (occupant details) query ---- */
  const { data: roomStatusList } = useQuery<RoomStatusData[]>({
    queryKey: ["room-status"],
    queryFn: fetchRoomStatusList,
    staleTime: 60_000, // 1 min cache
    enabled: true,
  });

  const getOccRoom = useCallback(
    (room: RoomData): RoomStatusData | null => {
      if (!roomStatusList) return null;
      return roomStatusList.find(
        (rs) => rs.roomName === room.roomName,
      ) ?? null;
    },
    [roomStatusList],
  );

  /* ---- Pin toggle mutation ---- */
  const pinMutation = useMutation({
    mutationFn: toggleRoomPin,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student", "rooms"] });
      queryClient.invalidateQueries({ queryKey: ["student", "dashboard"] });
    },
  });

  const handleTogglePin = useCallback(
    (roomId: string) => {
      pinMutation.mutate(roomId);
    },
    [pinMutation.mutate],
  );

  /* ---- Handlers ---- */
  const handleTabChange = useCallback((tabId: string) => {
    setActiveTab(tabId as "pinned" | CampusTab);
  }, []);

  const handleViewChange = useCallback((v: "card" | "list") => {
    setViewMode(v);
    try {
      localStorage.setItem("student-room-view", v);
    } catch {
      /* noop */
    }
  }, []);

  const onSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearch(e.target.value);
    },
    [],
  );

  const onStatusChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setStatus(e.target.value);
    },
    [],
  );

  /* ---- Derived data ---- */
  const allRooms = data?.data ?? [];

  // Filter + sort by campus tab
  const roomsForDisplay = useMemo(() => {
    if (activeTab === "pinned") {
      return [...allRooms].sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return a.roomName.localeCompare(b.roomName, "zh-CN", { numeric: true });
      });
    }
    // Campus tab: only rooms belonging to that campus, natural sort by roomName
    const filtered = allRooms.filter((r) => (r.zone || "") === activeTab);
    return filtered.sort((a, b) =>
      a.roomName.localeCompare(b.roomName, "zh-CN", { numeric: true }),
    );
  }, [allRooms, activeTab]);

  const pinnedCount = activeTab === "pinned" ? allRooms.length : "...";

  /* ---- Table columns (list view) ---- */
  const columns = useMemo<Column<RoomData>[]>(
    () => [
      {
        key: "pin",
        header: "",
        render: (row: RoomData) => (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleTogglePin(row.roomId);
            }}
            className="p-1 rounded hover:bg-[var(--student-canvas-soft)] transition-colors"
            aria-label={row.isPinned ? "取消收藏" : "收藏"}
          >
            <Star
              className={cn(
                "size-4",
                row.isPinned
                  ? "fill-amber-400 text-amber-400"
                  : "text-[var(--student-mute)]",
              )}
            />
          </button>
        ),
        className: "w-10",
      },
      {
        key: "roomName",
        header: "房间名",
        render: (row: RoomData) => (
          <span className="font-medium">{row.roomName}</span>
        ),
      },
      {
        key: "location",
        header: "位置",
        render: (row: RoomData) => (
          <span className="text-[var(--student-mute)]">
            {row.floor} · {row.zone}
          </span>
        ),
      },
      {
        key: "occupancy",
        header: "在室/容量",
        render: (row: RoomData) => (
          <span>
            {row.occupantCount}/{row.capacity}
          </span>
        ),
      },
      {
        key: "occupancyRate",
        header: "占用率",
        render: (row: RoomData) => (
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-[var(--student-hairline)]">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(row.occupancyRate, 100)}%`,
                  backgroundColor: STATUS_BAR_COLOR[row.status],
                }}
              />
            </div>
            <span className="text-xs text-[var(--student-mute)]">
              {row.occupancyRate}%
            </span>
          </div>
        ),
      },
      {
        key: "status",
        header: "状态",
        render: (row: RoomData) => (
          <Badge variant={STATUS_BADGE_VARIANT[row.status]}>
            {STATUS_LABEL[row.status]}
          </Badge>
        ),
      },
    ],
    [handleTogglePin],
  );

  /* ---- Loading state ---- */
  if (isLoading) {
    return <RoomsSkeleton viewMode={viewMode} />;
  }

  /* ---- Error state ---- */
  if (isError) {
    return (
      <div className="flex items-center justify-center min-h-full bg-[var(--student-canvas-soft)]">
        <ErrorRetry
          message={
            error instanceof Error ? error.message : "加载房间数据失败"
          }
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  /* ---- Normal render ---- */
  return (
    <div className="p-6 bg-[var(--student-canvas-soft)] min-h-full">
      {/* Top bar: Tabs + ViewToggle */}
      <div className="flex items-center justify-between mb-4">
        <Tabs
          variant="pills"
          tabs={[
            { id: "pinned", label: `⭐ 我的 (${pinnedCount})` },
            { id: "浦东", label: "浦东" },
            { id: "浦西", label: "浦西" },
          ]}
          activeTab={activeTab}
          onTabChange={handleTabChange}
        />
        <ViewToggle value={viewMode} onChange={handleViewChange} />
      </div>

      {/* Filter bar — only on campus tabs */}
      {activeTab !== "pinned" && (
        <div className="flex items-center gap-3 mb-4">
          <StudentInput
            placeholder="搜索房间..."
            value={search}
            onChange={onSearchChange}
          />
          <StudentSelect
            placeholder="状态"
            options={STATUS_OPTIONS}
            value={status}
            onChange={onStatusChange}
          />
        </div>
      )}

      {/* Empty state */}
      {roomsForDisplay.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="暂无房间数据"
          description={
            activeTab === "pinned"
              ? "你还没有收藏的房间，切换到「浦东」或「浦西」浏览房间并收藏"
              : "未找到符合条件的房间，请尝试调整筛选条件"
          }
        />
      ) : viewMode === "card" ? (
        /* ---- Card Grid — flat, naturally sorted (matches mini-program) ---- */
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {roomsForDisplay.map((room) => (
            <RoomCard
              key={room.roomId}
              roomName={room.roomName}
              floor={room.floor}
              zone={room.zone}
              occupantCount={room.occupantCount}
              capacity={room.capacity}
              status={room.status}
              isPinned={room.isPinned}
              onTogglePin={() => handleTogglePin(room.roomId)}
              onClick={() => setOccupantRoom(room)}
            />
          ))}
        </div>
      ) : (
        /* ---- List View ---- */
        <Table<RoomData>
          columns={columns}
          data={roomsForDisplay}
          rowKey={(row) => row.roomId}
          onRowClick={(row) => setOccupantRoom(row)}
        />
      )}

      {/* ---- Occupant Modal ---- */}
      {occupantRoom && (() => {
        const occ = getOccRoom(occupantRoom);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOccupantRoom(null)}>
            <div
              className="w-full max-w-md max-h-[70vh] overflow-hidden rounded-xl border border-[var(--student-hairline)] bg-white shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-[var(--student-hairline)] px-5 py-3">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--student-ink)]">{occupantRoom.roomName}</h3>
                  <p className="text-[11px] text-[var(--student-mute)]">{occupantRoom.floor} · {occupantRoom.zone}</p>
                </div>
                <button
                  onClick={() => setOccupantRoom(null)}
                  className="rounded-md p-1 hover:bg-[var(--student-canvas-soft)] transition-colors"
                >
                  <X className="size-4 text-[var(--student-mute)]" />
                </button>
              </div>

              {/* Stats bar */}
              <div className="flex items-center gap-4 border-b border-[var(--student-hairline)] bg-[var(--student-canvas-soft)] px-5 py-2.5 text-[12px]">
                <span>
                  在室 <span className="font-semibold text-[var(--student-ink)]">{occ?.campusUserCount ?? occupantRoom.occupantCount}</span> 人
                </span>
                {occ && occ.borrowedCardCount > 0 && (
                  <span className="text-[var(--student-mute)]">
                    借卡 {occ.borrowedCardCount} 人
                  </span>
                )}
                <span className="text-[var(--student-mute)]">
                  容量 {occupantRoom.capacity} 人
                </span>
              </div>

              {/* Occupant list */}
              <div className="max-h-[50vh] overflow-y-auto">
                {occ && occ.occupants.length > 0 ? (
                  occ.occupants.map((o, i) => (
                    <div
                      key={o.userId || i}
                      className="flex items-center gap-3 border-b border-[var(--student-hairline)] px-5 py-3 last:border-b-0 hover:bg-[var(--student-canvas-soft)]/50 transition-colors"
                    >
                      <div className={cn(
                        "size-8 shrink-0 rounded-full flex items-center justify-center",
                        o.entryType === "BORROWED_CARD" ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600",
                      )}>
                        <User className="size-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium text-[var(--student-ink)]">
                          {o.userName}
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-[var(--student-mute)]">
                          <Clock className="size-3" />
                          <span>进入 {o.entryTime}</span>
                          {o.entryType === "BORROWED_CARD" && (
                            <span className="rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700">借卡</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="px-5 py-8 text-center text-[13px] text-[var(--student-mute)]">
                    暂无在室人员数据
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
