import type { RefDataItem } from "@/api/domains/referenceData.api";
import type { ReferenceTypeConfig } from "./typeRegistry";
import ReferenceCard from "./ReferenceCard";

interface CardGridProps {
  items: RefDataItem[];
  typeConfig: ReferenceTypeConfig;
  isAdmin: boolean;
  mode: string;
  onEdit: (item: RefDataItem) => void;
  onDrillDown: (item: RefDataItem) => void;
  onAddToCart?: (item: RefDataItem) => void;
  onDelete?: (item: RefDataItem) => void;
  onCreateNew?: () => void;
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
  orderingBlocked?: boolean;
}

export default function CardGrid({
  items, typeConfig, isAdmin, mode, onEdit, onDrillDown, onAddToCart, onDelete, onCreateNew, isLoading, isError, errorMessage, orderingBlocked,
}: CardGridProps) {
  return (
    <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-2">
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-xs text-[var(--twin-mute)]">加载中…</div>
      ) : isError ? (
        <div className="flex items-center justify-center py-12 text-xs text-red-500">
          加载失败{errorMessage ? `：${errorMessage}` : ""}
        </div>
      ) : (
        <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 320px), 1fr))" }}>
          {items.map((item) => (
            <ReferenceCard
              key={item.id}
              item={item}
              typeConfig={typeConfig}
              isAdmin={isAdmin}
              mode={mode}
              onEdit={onEdit}
              onDrillDown={onDrillDown}
              onAddToCart={onAddToCart}
              onDelete={onDelete}
              orderingBlocked={orderingBlocked}
            />
          ))}
          {isAdmin && onCreateNew && (
            <button
              type="button" onClick={onCreateNew}
              className="relative flex flex-row items-center justify-center gap-2 rounded-twin-md border-2 border-dashed border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-3 text-[var(--twin-mute)] hover:border-[var(--twin-link)] hover:text-[var(--twin-link)] hover:bg-[var(--twin-canvas)] transition-all duration-150 min-h-[7.5rem]"
            >
              <span className="text-2xl leading-none">{typeConfig.label.charAt(0)}</span>
              <span className="text-sm font-medium">+ 新建{typeConfig.label}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
