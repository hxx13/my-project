import * as React from "react"

import { cn } from "@/lib/utils"

export interface NotificationItemProps {
  title: string
  summary: string
  type: "ARO" | "PLATFORM" | "WORK_ORDER"
  publishDate: string
  isRead: boolean
  onClick: () => void
  className?: string
}

const typeConfig: Record<
  "ARO" | "PLATFORM" | "WORK_ORDER",
  { label: string; textClass: string; bgClass: string }
> = {
  ARO: {
    label: "ARO 官方",
    textClass: "text-[#dc2626]",
    bgClass: "bg-[#fee2e2]",
  },
  PLATFORM: {
    label: "平台公告",
    textClass: "text-[#2563eb]",
    bgClass: "bg-[#dbeafe]",
  },
  WORK_ORDER: {
    label: "工单通知",
    textClass: "text-[#7c3aed]",
    bgClass: "bg-[#ede9fe]",
  },
}

export function NotificationItem({
  title,
  summary,
  type,
  publishDate,
  isRead,
  onClick,
  className,
}: NotificationItemProps) {
  const badgeConf = typeConfig[type]

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full cursor-pointer items-start gap-3 rounded-[10px] px-4 py-3 text-left transition-colors hover:bg-[var(--student-primary-soft)]/20",
        isRead ? "bg-white" : "bg-[#fafaff]",
        className,
      )}
    >
      {/* Left dot */}
      <span
        className={cn(
          "mt-[6px] block h-2 w-2 shrink-0 rounded-full",
          isRead ? "bg-transparent" : "bg-[#dc2626]",
        )}
      />

      {/* Content */}
      <div className="min-w-0 flex-1">
        {/* Top row: badge + date */}
        <div className="mb-1 flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center rounded-[var(--student-radius-full)] px-2 py-px text-[11px] font-medium",
              badgeConf.textClass,
              badgeConf.bgClass,
            )}
          >
            {badgeConf.label}
          </span>
          <span className="shrink-0 text-[11px] text-[var(--student-mute)]">
            {publishDate}
          </span>
        </div>

        {/* Title */}
        <p
          className={cn(
            "text-[14px] leading-snug",
            isRead
              ? "font-normal text-[var(--student-body)]"
              : "font-semibold text-[var(--student-ink)]",
          )}
        >
          {title}
        </p>

        {/* Summary */}
        <p
          className="mt-1 text-[12px] leading-snug text-[var(--student-mute)]"
          style={{
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {summary}
        </p>
      </div>
    </button>
  )
}
