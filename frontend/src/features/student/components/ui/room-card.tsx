import { cn } from "@/lib/utils";

type RoomStatus = "idle" | "busy" | "full";

const statusConfig: Record<RoomStatus, { color: string; label: string; bgClass: string; textClass: string; dotClass: string }> = {
  idle: {
    color: "#16a34a",
    label: "空闲",
    bgClass: "bg-[var(--student-success-soft)]",
    textClass: "text-[var(--student-success)]",
    dotClass: "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]",
  },
  busy: {
    color: "#d97706",
    label: "较满",
    bgClass: "bg-[var(--student-warning-soft)]",
    textClass: "text-[var(--student-warning)]",
    dotClass: "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]",
  },
  full: {
    color: "#dc2626",
    label: "已满",
    bgClass: "bg-[var(--student-error-soft)]",
    textClass: "text-[var(--student-error)]",
    dotClass: "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]",
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
  const pct = capacity > 0 ? Math.round((occupantCount / capacity) * 100) : 0;

  return (
    <div
      onClick={onClick}
      className={cn(
        "group relative cursor-pointer rounded-[var(--student-radius-md)] border border-[var(--student-hairline)] bg-white p-[14px] transition-shadow hover:shadow-md",
        className,
      )}
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
      <div className="mb-[6px] text-[11px] text-[var(--student-mute)]">
        {floor} · {zone}
      </div>

      {/* Third row: traffic-light indicator + occupancy */}
      <div className="flex items-center gap-2.5">
        {/* Large traffic-light dot (mini-program style) */}
        <span
          className={cn("inline-block size-3 shrink-0 rounded-full", config.dotClass)}
          title={config.label}
        />
        {/* Occupancy stats */}
        <span className="text-[12px] font-medium text-[var(--student-ink)]">
          {occupantCount}/{capacity}
        </span>
        {/* Progress bar */}
        <div className="flex-1 h-1.5 rounded-full bg-[var(--student-hairline)] overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${Math.min(pct, 100)}%`,
              backgroundColor: config.color,
            }}
          />
        </div>
        <span className="text-[11px] text-[var(--student-mute)] tabular-nums">
          {pct}%
        </span>
      </div>
    </div>
  );
}

export type { RoomCardProps };
