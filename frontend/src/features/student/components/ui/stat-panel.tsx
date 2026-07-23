import * as React from "react"

import { cn } from "@/lib/utils"

export interface StatPanelProps {
  title: string
  children: React.ReactNode
  className?: string
  emptyText?: string
  isEmpty?: boolean
}

export function StatPanel({
  title,
  children,
  className,
  emptyText = "暂无数据",
  isEmpty = false,
}: StatPanelProps) {
  return (
    <div
      className={cn(
        "rounded-[var(--student-radius-md)] border border-[var(--student-hairline)] bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)]",
        className,
      )}
    >
      <h3 className="mb-3 text-[13px] font-semibold text-[var(--student-ink)]">
        {title}
      </h3>
      <div className="min-h-[40px]">
        {isEmpty ? (
          <p className="text-center text-[13px] text-[var(--student-mute)]">
            {emptyText}
          </p>
        ) : (
          children
        )}
      </div>
    </div>
  )
}
