import { cn } from "@/lib/utils";

type RoomStatus = "idle" | "busy" | "full";

const statusConfig: Record<RoomStatus, { color: string; label: string; bgClass: string; textClass: string }> = {
  idle: {
    color: "#16a34a",
    label: "空闲",
    bgClass: "bg-[var(--student-success-soft)]",
    textClass: "text-[var(--student-success)]",
  },
  busy: {
    color: "#d97706",
    label: "较满",
    bgClass: "bg-[var(--student-warning-soft)]",
    textClass: "text-[var(--student-warning)]",
  },
  full: {
    color: "#dc2626",
    label: "已满",
    bgClass: "bg-[var(--student-error-soft)]",
    textClass: "text-[var(--student-error)]",
  },
};

interface RoomCardProps {
  roomName: string;
  floor: string;
  zone: string;
  occupantCount: number;
  capacity: number;
  status: RoomStatus;
  isPinned?: boolean;
  onTogglePin?: () => void;
  onClick?: () => void;
  className?: string;
}

export function RoomCard({
  roomName,
  floor,
  zone,
  occupantCount,
  capacity,
  status,
  isPinned = false,
  onTogglePin,
  onClick,
  className,
}: RoomCardProps) {
  const config = statusConfig[status];
  const occupancyRatio = capacity > 0 ? (occupantCount / capacity) * 100 : 0;

  return (
    <div
      onClick={onClick}
      className={cn(
        "group relative cursor-pointer rounded-[var(--student-radius-md)] border border-[var(--student-hairline)] bg-white p-[14px] transition-shadow hover:shadow-sm",
        className,
      )}
      style={{ borderLeft: `3px solid ${config.color}` }}
    >
      {/* Pin button — visible on hover */}
      {onTogglePin && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onTogglePin();
          }}
          className={cn(
            "absolute right-[10px] top-[10px] rounded-[var(--student-radius-xs)] p-[2px] text-sm leading-none opacity-0 transition-opacity hover:bg-[var(--student-canvas-soft)] group-hover:opacity-100",
            isPinned ? "opacity-100" : "",
          )}
          aria-label={isPinned ? "取消收藏" : "收藏"}
        >
          <span className={isPinned ? "text-amber-400" : "text-gray-400"}>
            {isPinned ? "★" : "☆"}
          </span>
        </button>
      )}

      {/* Top row: room name + status badge */}
      <div className="mb-[6px] flex items-center justify-between">
        <span className="text-[13px] font-semibold text-[var(--student-ink)]">
          {roomName}
        </span>
        <span
          className={cn(
            "inline-flex items-center rounded-[var(--student-radius-pill)] px-[8px] py-[1px] text-[11px] font-medium",
            config.bgClass,
            config.textClass,
          )}
        >
          {config.label}
        </span>
      </div>

      {/* Second row: floor · zone */}
      <div className="mb-[4px] text-[11px] text-[var(--student-mute)]">
        {floor} · {zone}
      </div>

      {/* Third row: occupant count */}
      <div className="mb-[8px] text-[11px] text-[var(--student-body)]">
        在室 {occupantCount}人 / 容量 {capacity}人
      </div>

      {/* Progress bar */}
      <div className="h-[4px] w-full overflow-hidden rounded-[var(--student-radius-pill)] bg-[var(--student-hairline)]">
        <div
          className="h-full rounded-[var(--student-radius-pill)] transition-all"
          style={{
            width: `${Math.min(occupancyRatio, 100)}%`,
            backgroundColor: config.color,
          }}
        />
      </div>
    </div>
  );
}

export type { RoomCardProps };
