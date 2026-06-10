import { useState, useEffect, useCallback } from "react";
import { fetchKnowledgeTimeline } from "@/api/domains/knowledge.api";
import type { TimelineEvent } from "@/features/knowledge/types";

interface Props {
  onSelectPage: (pageId: number) => void;
}

const TYPE_ICONS: Record<string, string> = {
  created: "🆕",
  edited: "✏️",
  imported: "📥",
  rollback: "⏪",
};

const TYPE_COLORS: Record<string, string> = {
  created: "#22c55e",
  edited: "#f59e0b",
  imported: "#6366f1",
  rollback: "#ef4444",
};

function groupByDate(events: TimelineEvent[]): Map<string, TimelineEvent[]> {
  const groups = new Map<string, TimelineEvent[]>();
  for (const e of events) {
    const date = new Date(e.createdAt);
    const now = new Date();
    let key: string;
    if (date.toDateString() === now.toDateString()) {
      key = "今天";
    } else if (new Date(now.getTime() - 86400000).toDateString() === date.toDateString()) {
      key = "昨天";
    } else {
      key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    }
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }
  return groups;
}

export function KnowledgeTimelineView({ onSelectPage }: Props) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchKnowledgeTimeline({ limit: 80, type: typeFilter === "all" ? undefined : typeFilter })
      .then((data) => setEvents(data as TimelineEvent[]))
      .finally(() => setLoading(false));
  }, [typeFilter]);

  const grouped = groupByDate(events);

  return (
    <div className="flex h-full">
      {/* Filter sidebar */}
      <div className="w-[150px] shrink-0 border-r border-[var(--app-color-border-default)] p-3 text-[11px]">
        <div className="font-semibold mb-3 text-[var(--app-color-text-primary)]">筛选</div>
        {["all", "created", "edited", "imported", "rollback"].map(t => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            className={`block w-full text-left py-1 px-2 rounded ${typeFilter === t ? "bg-[var(--app-color-accent-soft)] font-medium text-[var(--app-color-accent)]" : "text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]"}`}
          >
            {t === "all" ? "全部活动" : `${TYPE_ICONS[t]} ${t === "created" ? "新建" : t === "edited" ? "编辑" : t === "imported" ? "导入" : "回滚"}`}
          </button>
        ))}
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto p-4 font-mono text-[11px]">
        {loading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-6 animate-skeleton-pulse rounded bg-[var(--app-color-surface-hover)]" style={{ width: `${60 + Math.random() * 40}%` }} />
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-[var(--app-color-text-tertiary)]">暂无活动记录</div>
        ) : (
          <>
            {[...grouped.entries()].map(([date, items]) => (
              <div key={date} className="mb-5">
                <div className="text-[var(--app-color-accent)] font-bold mb-2 text-xs">📅 {date}</div>
                {items.map(e => (
                  <button
                    key={e.id}
                    onClick={() => onSelectPage(e.pageId)}
                    className="flex w-full items-center gap-2.5 py-1.5 px-2 rounded text-left hover:bg-[var(--app-color-surface-hover)] transition-colors"
                    style={{ borderLeft: `2px solid ${TYPE_COLORS[e.type] || "#999"}` }}
                  >
                    <span className="w-4 text-center">{TYPE_ICONS[e.type] || "📄"}</span>
                    <span className="flex-1 truncate font-medium text-[var(--app-color-text-primary)]">{e.pageTitle}</span>
                    <span className="text-[var(--app-color-text-tertiary)] text-[10px] shrink-0">{e.author}</span>
                    <span className="text-[var(--app-color-text-tertiary)] text-[10px] w-12 text-right shrink-0">
                      {new Date(e.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
