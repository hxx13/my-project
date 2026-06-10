import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ShellView } from "@/features/knowledge/types";

const TABS: { key: ShellView; label: string }[] = [
  { key: "browse", label: "文档" },
  { key: "graph", label: "图谱" },
  { key: "timeline", label: "时间线" },
];

interface Props {
  view: ShellView;
  onViewChange: (v: ShellView) => void;
  onNewDocument: () => void;
}

export function TabBar({ view, onViewChange, onNewDocument }: Props) {
  return (
    <div className="flex items-center border-b border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] px-2 h-9 shrink-0">
      {TABS.map(tab => (
        <button
          key={tab.key}
          onClick={() => onViewChange(tab.key)}
          className={cn(
            "px-3 py-1.5 text-xs font-medium border-b-2 -mb-[1px] transition-colors",
            view === tab.key
              ? "border-[var(--app-color-accent)] text-[var(--app-color-accent)]"
              : "border-transparent text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-text-secondary)]"
          )}
        >
          {tab.label}
        </button>
      ))}
      <div className="ml-auto">
        <button
          onClick={onNewDocument}
          className="flex items-center gap-1 rounded-[var(--app-radius-element)] bg-[var(--app-color-accent)] px-3 py-1 text-[11px] font-medium text-white hover:opacity-90"
        >
          <Plus className="size-3" />新建
        </button>
      </div>
    </div>
  );
}
