import { useState, useEffect } from "react";
import { fetchKnowledgeTimeline } from "@/api/domains/knowledge.api";
import type { TimelineEvent } from "@/features/knowledge/types";

interface Props { onSelectPage: (id: number) => void }

const ICONS: Record<string, string> = { created: "🆕", edited: "✏️", imported: "📥", rollback: "⏪" };
const COLORS: Record<string, string> = { created: "#22c55e", edited: "#f59e0b", imported: "#6366f1", rollback: "#ef4444" };

export function KnowledgeTimelineView({ onSelectPage }: Props) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchKnowledgeTimeline({ limit: 80, type: filter === "all" ? undefined : filter })
      .then(setEvents).finally(() => setLoading(false));
  }, [filter]);

  const groups = new Map<string, TimelineEvent[]>();
  for (const e of events) {
    const d = new Date(e.createdAt).toLocaleDateString("zh-CN");
    if (!groups.has(d)) groups.set(d, []);
    groups.get(d)!.push(e);
  }

  return (
    <div className="flex h-full">
      <div className="w-32 shrink-0 border-r border-[var(--app-color-border-default)] p-3 text-[11px]">
        <div className="font-semibold mb-2 text-[var(--app-color-text-primary)]">筛选</div>
        {["all", "created", "edited", "imported", "rollback"].map(t => (
          <button key={t} onClick={() => setFilter(t)} className={`block w-full text-left py-1 px-2 rounded ${filter === t ? "bg-[var(--app-color-accent-soft)] text-[var(--app-color-accent)] font-medium" : "text-[var(--app-color-text-secondary)]"}`}>
            {t === "all" ? "全部" : `${ICONS[t]} ${t}`}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-4 font-mono text-[11px]">
        {loading ? <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-5 animate-pulse rounded bg-[var(--app-color-surface-hover)]" style={{ width: `${50 + Math.random() * 50}%` }} />)}</div>
          : events.length === 0 ? <div className="py-16 text-center text-[var(--app-color-text-tertiary)]">暂无记录</div>
          : [...groups.entries()].map(([date, items]) => (
            <div key={date} className="mb-5">
              <div className="text-[var(--app-color-accent)] font-bold mb-2 text-xs">{date}</div>
              {items.map(e => (
                <button key={e.id} onClick={() => onSelectPage(e.pageId)} className="flex w-full items-center gap-2.5 py-1.5 px-2 rounded text-left hover:bg-[var(--app-color-surface-hover)]" style={{ borderLeft: `2px solid ${COLORS[e.type] || "#999"}` }}>
                  <span className="w-4 text-center">{ICONS[e.type] || "📄"}</span>
                  <span className="flex-1 truncate">{e.pageTitle}</span>
                  <span className="text-[10px] text-[var(--app-color-text-tertiary)]">{e.author}</span>
                  <span className="text-[10px] text-[var(--app-color-text-tertiary)] w-12 text-right">{new Date(e.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</span>
                </button>
              ))}
            </div>
          ))}
      </div>
    </div>
  );
}
