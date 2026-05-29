import * as React from "react"

import { cn } from "@/lib/utils"

const THEMES = [
  { id: "violet", label: "浅紫", color: "#8b5cf6" },
  { id: "blue", label: "蓝色", color: "#3b82f6" },
  { id: "green", label: "绿色", color: "#22c55e" },
  { id: "amber", label: "琥珀", color: "#f59e0b" },
  { id: "rose", label: "玫瑰", color: "#f43f5e" },
] as const

interface ThemePickerProps {
  current: string
  onChange: (theme: string) => void
}

function ThemePicker({ current, onChange }: ThemePickerProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {THEMES.map((theme) => {
        const isSelected = current === theme.id
        return (
          <button
            key={theme.id}
            type="button"
            onClick={() => onChange(theme.id)}
            className={cn(
              "inline-flex items-center gap-2 rounded-[var(--student-radius-md)] px-3 py-2 text-sm transition-colors",
              isSelected
                ? "bg-[var(--student-primary-soft)] ring-2 ring-[var(--student-primary)]"
                : "bg-[var(--student-canvas-soft)] hover:bg-[var(--student-canvas-soft-2)] ring-1 ring-[var(--student-hairline)]"
            )}
          >
            <span
              className="size-4 rounded-full"
              style={{ backgroundColor: theme.color }}
            />
            <span className={cn(
              "font-medium",
              isSelected ? "text-[var(--student-primary)]" : "text-[var(--student-body)]"
            )}>
              {theme.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

ThemePicker.displayName = "ThemePicker"

export { ThemePicker, THEMES }
