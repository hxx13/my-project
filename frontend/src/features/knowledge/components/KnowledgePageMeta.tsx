import { type KnowledgePage } from "@/features/knowledge/types";
import { formatKnowledgeDate, SOURCE_LABELS } from "@/features/knowledge/utils";

interface KnowledgePageMetaProps {
  page: KnowledgePage;
}

export function KnowledgePageMeta({ page }: KnowledgePageMetaProps) {
  return (
    <div className="mt-[var(--app-space-section-gap)] border-t border-[var(--app-color-border-default)] pt-[var(--app-space-element-gap)]">
      <p className="text-[var(--app-font-caption)] text-[var(--app-color-text-tertiary)]">
        <span>创建于 {formatKnowledgeDate(page.createdAt)}</span>
        <span className="mx-1.5">·</span>
        <span>版本 v{page.version}</span>
        <span className="mx-1.5">·</span>
        <span>作者 {page.author}</span>
        {page.source && (
          <>
            <span className="mx-1.5">·</span>
            <span className="inline-flex items-center rounded-full bg-[var(--app-color-accent-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--app-color-accent)]">
              {SOURCE_LABELS[page.source] || page.source}
            </span>
          </>
        )}
        {page.updatedAt !== page.createdAt && (
          <>
            <span className="mx-1.5">·</span>
            <span>最后修改 {formatKnowledgeDate(page.updatedAt)}</span>
          </>
        )}
      </p>
    </div>
  );
}
