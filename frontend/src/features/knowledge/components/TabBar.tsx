import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ShellView } from "@/features/knowledge/types";

interface Props {
  view: ShellView;
  onViewChange: (v: ShellView) => void;
  onNewDocument: () => void;
}

const TABS: { key: ShellView; label: string; icon: string }[] = [
  { key: "browse", label: "文档浏览", icon: "📄" },
  { key: "graph", label: "知识图谱", icon: "🕸️" },
  { key: "timeline", label: "生长记录", icon: "🌱" },
];

export function TabBar({ view, onViewChange, onNewDocument }: Props) {
  return (
    <div className="flex items-center border-b border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] px-2 h-9 shrink-0">
      <div className="flex items-center gap-0">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => onViewChange(tab.key)}
            className={cn(
              "px-3 py-1.5 text-[11px] font-medium transition-colors border-b-2 -mb-[1px]",
              view === tab.key
                ? "border-[var(--app-color-accent)] text-[var(--app-color-accent)]"
                : "border-transparent text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-text-secondary)]"
            )}
          >
            <span className="mr-1">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>
      <div className="ml-auto">
        <button
          onClick={onNewDocument}
          className="flex items-center gap-1 rounded-[var(--app-radius-element)] bg-[var(--app-color-accent)] px-3 py-1 text-[11px] font-medium text-white hover:bg-[var(--app-color-accent-hover)]"
        >
          <Plus className="size-3" />
          新建
        </button>
      </div>
    </div>
  );
}
