import * as React from "react"
import { ChevronDown, ChevronUp } from "lucide-react"

import { cn } from "@/lib/utils"

export interface FaqGroup {
  category: string
  items: { question: string; answer: string }[]
}

export interface FaqAccordionProps {
  groups: FaqGroup[]
  searchQuery?: string
  className?: string
}

export function FaqAccordion({
  groups,
  searchQuery = "",
  className,
}: FaqAccordionProps) {
  const [openIds, setOpenIds] = React.useState<Set<string>>(new Set())

  const toggle = (id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const q = searchQuery.toLowerCase().trim()

  const filteredGroups = React.useMemo(() => {
    if (!q) return groups
    return groups
      .map((g) => ({
        ...g,
        items: g.items.filter(
          (item) =>
            item.question.toLowerCase().includes(q) ||
            item.answer.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.items.length > 0)
  }, [groups, q])

  if (filteredGroups.length === 0) {
    return (
      <div className={cn("py-10 text-center", className)}>
        <p className="text-[13px] text-[var(--student-mute)]">未找到相关问题</p>
      </div>
    )
  }

  return (
    <div className={cn("space-y-4", className)}>
      {filteredGroups.map((group, gi) => (
        <div key={gi}>
          <h3 className="border-b border-[var(--student-hairline)] pb-2 text-[14px] font-semibold text-[var(--student-ink)]">
            {group.category}
          </h3>
          <div className="divide-y divide-[var(--student-hairline)]">
            {group.items.map((item, ii) => {
              const id = `${gi}-${ii}`
              const isOpen = openIds.has(id)
              return (
                <div key={id}>
                  <button
                    type="button"
                    onClick={() => toggle(id)}
                    className="flex w-full items-center justify-between gap-3 px-1 py-3 text-left text-[14px] font-medium text-[var(--student-body)] transition-colors hover:text-[var(--student-primary)]"
                  >
                    <span className="min-w-0">{item.question}</span>
                    {isOpen ? (
                      <ChevronUp className="h-4 w-4 shrink-0 text-[var(--student-mute)]" />
                    ) : (
                      <ChevronDown className="h-4 w-4 shrink-0 text-[var(--student-mute)]" />
                    )}
                  </button>
                  {isOpen && (
                    <div className="px-1 pb-3">
                      <p className="text-[13px] leading-relaxed text-[var(--student-body)] whitespace-pre-wrap">
                        {item.answer}
                      </p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
