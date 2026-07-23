import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Star, Building2, X, Clock, User, RefreshCw, ShieldCheck, DoorOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStudentRooms } from "../hooks/use-student-rooms";
import { getStudentSessionScope, studentQueryKey } from "../utils/studentQueryScope";
import { toggleRoomPin, fetchRoomStatusList, fetchRooms } from "../api/student.api";
import type { RoomData, FetchRoomsParams, RoomStatusData } from "../api/student.api";
import {
  RoomCard,
  ViewToggle,
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

const ALL_ROOMS_SIZE = 300;

const CAMPUS_ORDER = ["浦东", "浦西"] as const;

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
    <div className="p-6 min-h-full">
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
/*  Room grid / list helpers                                           */
/* ------------------------------------------------------------------ */

function RoomGrid({ rooms, onTogglePin, onClick }: {
  rooms: RoomData[];
  onTogglePin: (id: string) => void;
  onClick: (room: RoomData) => void;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      {rooms.map((room) => (
        <RoomCard
          key={room.roomId}
          className="w-[200px]"
          roomName={room.roomName}
          floor={room.floor}
          zone={room.zone}
          occupantCount={room.occupantCount}
          capacity={room.capacity}
          status={room.status}
          isPinned={room.isPinned}
          onTogglePin={() => onTogglePin(room.roomId)}
          onClick={() => onClick(room)}
        />
      ))}
    </div>
  );
}

function RoomTable({ rooms, columns, onClick }: {
  rooms: RoomData[];
  columns: Column<RoomData>[];
  onClick: (room: RoomData) => void;
}) {
  return (
    <Table
      columns={columns}
      data={rooms}
      rowKey={(row) => row.roomId}
      onRowClick={(row) => onClick(row)}
    />
  );
}

function SectionHeader({ icon: Icon, label, count, colorClass }: {
  icon: React.ElementType;
  label: string;
  count: number;
  colorClass: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold", colorClass)}>
      <Icon className="size-3.5" /> {label} · {count} 间
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */

export default function StudentRoomsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [viewMode, setViewMode] = useState<"card" | "list">(() => {
    try {
      if (localStorage.getItem("student-room-view") === "list") return "list";
    } catch { /* noop */ }
    return "card";
  });

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [occupantRoom, setOccupantRoom] = useState<RoomData | null>(null);

  /* ---- 常用房间：ARO API 匹配（pinned=1 触发 getMyRooms） ---- */
  const scope = getStudentSessionScope();
  const myRoomsQuery = useQuery({
    queryKey: studentQueryKey("rooms", { pinned: "1" }),
    queryFn: () => fetchRooms({ pinned: "1", page: 1, size: ALL_ROOMS_SIZE }),
    enabled: scope !== "anonymous",
    staleTime: 30 * 1000,
    retry: 1,
    // 后台静默刷新
    refetchInterval: 5 * 60 * 1000,
  });
  const aroMatchedRooms: RoomData[] = myRoomsQuery.data?.data ?? [];

  /* ---- 全部房间（筛选/搜索用） ---- */
  const params = useMemo<FetchRoomsParams>(() => {
    const p: FetchRoomsParams = { page: 1, size: ALL_ROOMS_SIZE };
    if (search) p.search = search;
    if (status) p.status = status;
    return p;
  }, [search, status]);

  const { data, isLoading, isError, error, refetch, isFetching } = useStudentRooms(params);

  const allRooms = data?.data ?? [];
  const totalRoomCount = allRooms.length;

  // 收藏的房间：从 ARO 匹配房间中筛选 isPinned
  const { pinnedRooms, frequentRooms } = useMemo(() => {
    const pinned: RoomData[] = [];
    const frequent: RoomData[] = [];
    for (const r of aroMatchedRooms) {
      if (r.isPinned) pinned.push(r);
      else frequent.push(r);
    }
    return { pinnedRooms: pinned, frequentRooms: frequent };
  }, [aroMatchedRooms]);

  // 全部房间（排除已在常用区显示的）
  const aroMatchedIds = useMemo(() => new Set(aroMatchedRooms.map((r) => r.roomId)), [aroMatchedRooms]);

  const campusGroups = useMemo(() => {
    const sorter = (a: RoomData, b: RoomData) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return a.roomName.localeCompare(b.roomName, "zh-CN", { numeric: true });
    };
    const others = allRooms.filter((r) => !aroMatchedIds.has(r.roomId));
    const groups: { campus: string; rooms: RoomData[] }[] = [];
    for (const campus of CAMPUS_ORDER) {
      const campusRooms = others.filter((r) => (r.zone || "") === campus).sort(sorter);
      if (campusRooms.length > 0) groups.push({ campus, rooms: campusRooms });
    }
    const other = others.filter((r) => !(CAMPUS_ORDER as readonly string[]).includes(r.zone || "")).sort(sorter);
    if (other.length > 0) groups.push({ campus: "其他", rooms: other });
    return groups;
  }, [allRooms, aroMatchedIds]);

  /* ---- Room status (occupant details) ---- */
  const { data: roomStatusList } = useQuery<RoomStatusData[]>({
    queryKey: ["room-status"],
    queryFn: fetchRoomStatusList,
    staleTime: 60_000,
    enabled: true,
  });

  const getOccRoom = useCallback(
    (room: RoomData): RoomStatusData | null => {
      if (!roomStatusList) return null;
      return roomStatusList.find((rs) => rs.roomName === room.roomName) ?? null;
    },
    [roomStatusList],
  );

  /* ---- Pin toggle ---- */
  const pinMutation = useMutation({
    mutationFn: toggleRoomPin,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student", "rooms"] });
    },
  });

  const handleTogglePin = useCallback(
    (roomId: string) => pinMutation.mutate(roomId),
    [pinMutation.mutate],
  );

  const handleViewChange = useCallback((v: "card" | "list") => {
    setViewMode(v);
    try { localStorage.setItem("student-room-view", v); } catch { /* noop */ }
  }, []);

  /* ---- Table columns ---- */
  const columns = useMemo<Column<RoomData>[]>(() => [
    {
      key: "pin", header: "",
      render: (row: RoomData) => (
        <button
          onClick={(e) => { e.stopPropagation(); handleTogglePin(row.roomId); }}
          className="p-1 rounded hover:bg-[var(--student-canvas-soft)] transition-colors"
          aria-label={row.isPinned ? "取消收藏" : "收藏"}
        >
          <Star className={cn("size-4", row.isPinned ? "fill-amber-400 text-amber-400" : "text-[var(--student-mute)]")} />
        </button>
      ),
      className: "w-10",
    },
    {
      key: "roomName", header: "房间名",
      render: (row: RoomData) => <span className="font-medium">{row.roomName}</span>,
    },
    {
      key: "location", header: "位置",
      render: (row: RoomData) => (
        <span className="text-[var(--student-mute)]">{row.floor} · {row.zone}</span>
      ),
    },
    {
      key: "occupancy", header: "在室/容量",
      render: (row: RoomData) => <span>{row.occupantCount}/{row.capacity}</span>,
    },
    {
      key: "occupancyRate", header: "占用率",
      render: (row: RoomData) => (
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-[var(--student-hairline)]">
            <div className="h-full rounded-full" style={{ width: `${Math.min(row.occupancyRate, 100)}%`, backgroundColor: STATUS_BAR_COLOR[row.status] }} />
          </div>
          <span className="text-xs text-[var(--student-mute)]">{row.occupancyRate}%</span>
        </div>
      ),
    },
    {
      key: "status", header: "状态",
      render: (row: RoomData) => <Badge variant={STATUS_BADGE_VARIANT[row.status]}>{STATUS_LABEL[row.status]}</Badge>,
    },
  ], [handleTogglePin]);

  /* ---- Render ---- */
  if (isLoading) return <RoomsSkeleton viewMode={viewMode} />;
  if (isError) {
    return (
      <div className="flex items-center justify-center min-h-full">
        <ErrorRetry message={error instanceof Error ? error.message : "加载房间数据失败"} onRetry={() => refetch()} />
      </div>
    );
  }

  const hasTopSections = frequentRooms.length > 0 || pinnedRooms.length > 0;

  return (
    <div className="p-6 min-h-full">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-[var(--student-ink)]">
            全部房间 · {totalRoomCount}
          </h2>
          {isFetching && <RefreshCw className="size-4 text-[var(--student-mute)] animate-spin" />}
        </div>
        <ViewToggle value={viewMode} onChange={handleViewChange} />
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 mb-4">
        <StudentInput placeholder="搜索房间..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <StudentSelect placeholder="状态" options={STATUS_OPTIONS} value={status} onChange={(e) => setStatus(e.target.value)} />
      </div>

      {/* ================================================================ */}
      {/* 1. 收藏的房间（isPinned）                                         */}
      {/* ================================================================ */}
      {pinnedRooms.length > 0 && (
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-3">
            <SectionHeader icon={Star} label="收藏的房间" count={pinnedRooms.length} colorClass="bg-amber-50 text-amber-700" />
          </div>
          {viewMode === "card"
            ? <RoomGrid rooms={pinnedRooms} onTogglePin={handleTogglePin} onClick={setOccupantRoom} />
            : <RoomTable rooms={pinnedRooms} columns={columns} onClick={setOccupantRoom} />
          }
        </div>
      )}

      {/* ================================================================ */}
      {/* 2. 常用房间（ARO API 匹配，自动填充）                              */}
      {/* ================================================================ */}
      {frequentRooms.length > 0 && (
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-3">
            <SectionHeader icon={DoorOpen} label="常用房间" count={frequentRooms.length} colorClass="bg-[var(--student-primary-soft)] text-[var(--student-primary)]" />
            {myRoomsQuery.isFetching && <RefreshCw className="size-3 text-[var(--student-mute)] animate-spin" />}
          </div>
          {viewMode === "card"
            ? <RoomGrid rooms={frequentRooms} onTogglePin={handleTogglePin} onClick={setOccupantRoom} />
            : <RoomTable rooms={frequentRooms} columns={columns} onClick={setOccupantRoom} />
          }
        </div>
      )}

      {/* Divider between top sections and all rooms */}
      {hasTopSections && <div className="mb-5 border-b border-[var(--student-border)]" />}

      {/* ================================================================ */}
      {/* 3. 全部房间（按校区分组）                                         */}
      {/* ================================================================ */}
      {!hasTopSections && allRooms.length === 0 ? (
        <EmptyState icon={Building2} title="暂无房间数据" description="未找到符合条件的房间" />
      ) : (
        <div className="space-y-6">
          {campusGroups.map((group) => (
            <div key={group.campus}>
              {campusGroups.length > 1 && (
                <h3 className="text-[13px] font-semibold text-[var(--student-foreground)] mb-3 flex items-center gap-2">
                  📍 {group.campus}
                  <span className="text-[11px] font-normal text-[var(--student-mute-foreground)]">{group.rooms.length} 间</span>
                </h3>
              )}
              {viewMode === "card" ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {group.rooms.map((room) => (
                    <RoomCard
                      key={room.roomId}
                      className="room-card-item"
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
                <RoomTable rooms={group.rooms} columns={columns} onClick={setOccupantRoom} />
              )}
            </div>
          ))}
        </div>
      )}

      {/* ---- Occupant Modal ---- */}
      {occupantRoom && createPortal((() => {
        const occ = getOccRoom(occupantRoom);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOccupantRoom(null)}>
            <div className="w-full max-w-md max-h-[70vh] overflow-hidden rounded-xl border border-[var(--student-hairline)] bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between border-b border-[var(--student-hairline)] px-5 py-3">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--student-ink)]">{occupantRoom.roomName}</h3>
                  <p className="text-[11px] text-[var(--student-mute)]">{occupantRoom.floor} · {occupantRoom.zone}</p>
                </div>
                <button onClick={() => setOccupantRoom(null)} className="rounded-md p-1 hover:bg-[var(--student-canvas-soft)] transition-colors">
                  <X className="size-4 text-[var(--student-mute)]" />
                </button>
              </div>
              <div className="flex items-center gap-4 border-b border-[var(--student-hairline)] bg-[var(--student-canvas-soft)] px-5 py-2.5 text-[12px]">
                <span>在室 <span className="font-semibold text-[var(--student-ink)]">{occ?.campusUserCount ?? occupantRoom.occupantCount}</span> 人</span>
                {occ && occ.borrowedCardCount > 0 && <span className="text-[var(--student-mute)]">借卡 {occ.borrowedCardCount} 人</span>}
                <span className="text-[var(--student-mute)]">容量 {occupantRoom.capacity} 人</span>
              </div>
              <div className="max-h-[50vh] overflow-y-auto">
                {occ && occ.occupants.length > 0 ? (
                  occ.occupants.map((o, i) => (
                    <div key={o.userId || i} className="flex items-center gap-3 border-b border-[var(--student-hairline)] px-5 py-3 last:border-b-0 hover:bg-[var(--student-canvas-soft)]/50 transition-colors">
                      <div className={cn("size-8 shrink-0 rounded-full flex items-center justify-center", o.entryType === "BORROWED_CARD" ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600")}>
                        <User className="size-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium text-[var(--student-ink)]">{o.userName}</div>
                        <div className="flex items-center gap-1.5 text-[11px] text-[var(--student-mute)]">
                          <Clock className="size-3" /><span>进入 {o.entryTime}</span>
                          {o.entryType === "BORROWED_CARD" && <span className="rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700">借卡</span>}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="px-5 py-8 text-center text-[13px] text-[var(--student-mute)]">暂无在室人员数据</div>
                )}
              </div>
            </div>
          </div>
        );
      })(), document.body)}
    </div>
  );
}
