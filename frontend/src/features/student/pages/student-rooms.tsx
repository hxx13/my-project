import { useState, useCallback, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Star,
  Building2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useStudentRooms } from "../hooks/use-student-rooms";
import { toggleRoomPin } from "../api/student.api";
import type { RoomData, FetchRoomsParams } from "../api/student.api";
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

const PAGE_SIZE = 12;

const FLOOR_OPTIONS = [
  { value: "1F", label: "1F" },
  { value: "2F", label: "2F" },
  { value: "3F", label: "3F" },
  { value: "4F", label: "4F" },
  { value: "5F", label: "5F" },
];

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
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-9 w-24" />
      </div>
      {viewMode === "card" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} variant="rectangular" className="h-[108px]" />
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
  const [activeTab, setActiveTab] = useState<"pinned" | "all">("pinned");

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
  const [floor, setFloor] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  /* ---- Query params — only one fires at a time ---- */
  const params = useMemo<FetchRoomsParams>(() => {
    if (activeTab === "pinned") {
      return { pinned: "1" };
    }
    const p: FetchRoomsParams = { page, size: PAGE_SIZE };
    if (search) p.search = search;
    if (floor) p.floor = floor;
    if (status) p.status = status;
    return p;
  }, [activeTab, page, search, floor, status]);

  const { data, isLoading, isError, error, refetch } = useStudentRooms(params);

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
    setActiveTab(tabId as "pinned" | "all");
    setPage(1);
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
      setPage(1);
    },
    [],
  );

  const onFloorChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setFloor(e.target.value);
      setPage(1);
    },
    [],
  );

  const onStatusChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setStatus(e.target.value);
      setPage(1);
    },
    [],
  );

  /* ---- Derived data ---- */
  const rooms = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Pinned items sort to top automatically in both views
  const roomsForDisplay = useMemo(() => {
    if (!rooms.length) return rooms;
    return [...rooms].sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return 0;
    });
  }, [rooms]);

  // Tab labels — counts are only accurate for the active tab
  const pinnedCount = activeTab === "pinned" ? rooms.length : "...";
  const allCount = activeTab === "all" ? total : "...";

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
            aria-label={row.isPinned ? "取消置顶" : "置顶"}
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
            { id: "pinned", label: `⭐ 我的置顶 (${pinnedCount})` },
            { id: "all", label: `全部房间 (${allCount})` },
          ]}
          activeTab={activeTab}
          onTabChange={handleTabChange}
        />
        <ViewToggle value={viewMode} onChange={handleViewChange} />
      </div>

      {/* Filter bar — only on "all" tab */}
      {activeTab === "all" && (
        <div className="flex items-center gap-3 mb-4">
          <StudentInput
            placeholder="搜索房间..."
            value={search}
            onChange={onSearchChange}
          />
          <StudentSelect
            placeholder="楼层"
            options={FLOOR_OPTIONS}
            value={floor}
            onChange={onFloorChange}
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
              ? "你还没有置顶任何房间，切换到「全部房间」可浏览所有可用房间"
              : "未找到符合条件的房间，请尝试调整筛选条件"
          }
        />
      ) : viewMode === "card" ? (
        /* ---- Card Grid View ---- */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
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
              onClick={() =>
                navigate(`/student/rooms?highlight=${room.roomId}`)
              }
            />
          ))}
        </div>
      ) : (
        /* ---- List View ---- */
        <Table<RoomData>
          columns={columns}
          data={roomsForDisplay}
          rowKey={(row) => row.roomId}
          onRowClick={(row) =>
            navigate(`/student/rooms?highlight=${row.roomId}`)
          }
        />
      )}

      {/* Pagination — on "all" tab for both views */}
      {activeTab === "all" && totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 mt-6">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className={cn(
              "inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-[var(--student-radius-md)] transition-colors",
              page <= 1
                ? "text-[var(--student-mute)] cursor-not-allowed"
                : "text-[var(--student-body)] hover:bg-[var(--student-canvas-soft-2)]",
            )}
          >
            <ChevronLeft className="size-4" />
            上一页
          </button>
          <span className="text-sm text-[var(--student-body)]">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className={cn(
              "inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-[var(--student-radius-md)] transition-colors",
              page >= totalPages
                ? "text-[var(--student-mute)] cursor-not-allowed"
                : "text-[var(--student-body)] hover:bg-[var(--student-canvas-soft-2)]",
            )}
          >
            下一页
            <ChevronRight className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}
