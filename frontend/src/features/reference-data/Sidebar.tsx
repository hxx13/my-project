import type { RefDataItem } from "@/api/domains/referenceData.api";

interface SidebarProps {
  items: RefDataItem[];
  activeId?: number;
  onSelect: (id: number, label: string) => void;
  isAdmin: boolean;
  typeLabel: string;
  parentLabel?: string;
  onAddCategory?: () => void;
}

function getItemLabel(item: RefDataItem): string {
  const fd = item.fieldData as Record<string, unknown> | undefined;
  if (!fd) return `ID ${item.id}`;
  // Try title first, then subtitle
  return String(fd.title || fd.subtitle || `ID ${item.id}`);
}

export default function Sidebar({
  items,
  activeId,
  onSelect,
  isAdmin,
  typeLabel,
  parentLabel,
  onAddCategory,
}: SidebarProps) {
  return (
    <aside className="w-[140px] shrink-0 overflow-y-auto border-r border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] py-2 flex flex-col">
      <div className="px-3 py-1 shrink-0">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--twin-mute)]">
          {typeLabel}
        </div>
        {parentLabel && (
          <div className="text-[9px] text-[var(--twin-mute)] truncate mt-0.5" title={parentLabel}>
            {parentLabel}
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto mt-1">
        {items.length === 0 ? (
          <div className="px-3 py-4 text-center text-[10px] text-[var(--twin-mute)]">
            暂无可选项
          </div>
        ) : (
          items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id, getItemLabel(item))}
              className={`block w-full px-3 py-2 text-left text-xs leading-snug transition-colors ${
                activeId === item.id
                  ? "border-l-2 border-[var(--twin-link)] bg-[var(--twin-canvas)] font-semibold text-[var(--twin-link)]"
                  : "text-[var(--twin-body)] hover:bg-[var(--twin-canvas)]"
              }`}
            >
              <span className="truncate block">
                {getItemLabel(item)}
              </span>
            </button>
          ))
        )}
      </div>

      {isAdmin && onAddCategory && (
        <div className="shrink-0 border-t border-[var(--twin-hairline)] px-2 pt-2 pb-1">
          <button
            type="button"
            onClick={onAddCategory}
            className="flex w-full items-center justify-center gap-1 rounded-full border border-dashed border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1.5 text-[10px] font-medium text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft-2)] hover:border-[var(--twin-link)] hover:text-[var(--twin-link)] transition-colors"
          >
            <span className="text-xs leading-none">+</span>
            <span>新增</span>
          </button>
        </div>
      )}
    </aside>
  );
}
