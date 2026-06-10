import { useState } from "react";
import { RotateCcw, ChevronDown, ChevronRight, Circle } from "lucide-react";
import { useKnowledgeHistory, useKnowledgeRollback } from "@/features/knowledge/hooks/useKnowledgeHistory";
import { formatKnowledgeDate } from "@/features/knowledge/utils";
import { renderMarkdownToSafeHtml } from "@/utils/markdownHtml";

interface KnowledgeHistoryTimelineProps {
  pageId: number;
}

export function KnowledgeHistoryTimeline({ pageId }: KnowledgeHistoryTimelineProps) {
  const { data: history, isLoading } = useKnowledgeHistory(pageId);
  const rollbackMutation = useKnowledgeRollback(pageId);
  const [expandedDiff, setExpandedDiff] = useState<number | null>(null);

  const handleRollback = (version: number) => {
    if (confirm(`确定回滚到 v${version} 吗？当前内容将作为新版本保存。`)) {
      rollbackMutation.mutate(version);
    }
  };

  if (isLoading || !history) {
    return (
      <div className="space-y-3 p-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-16 animate-skeleton-pulse rounded bg-[var(--app-color-surface-hover)]" />
        ))}
      </div>
    );
  }

  if (!history.length) {
    return <p className="p-4 text-xs text-[var(--app-color-text-tertiary)]">暂无修改历史</p>;
  }

  const renderPreview = (md?: string, html?: string) => {
    if (md && md.trim()) {
      return renderMarkdownToSafeHtml(md.substring(0, 800), "light");
    }
    if (html && html.trim()) {
      return html.substring(0, 800);
    }
    return "(无内容)";
  };

  return (
    <div className="relative space-y-0 p-4">
      <div className="absolute bottom-0 left-[23px] top-0 w-px bg-[var(--app-color-border-default)]" />

      {history.map((item, idx) => {
        const isLatest = idx === 0;
        const isExpanded = expandedDiff === item.id;
        const previewHtml = renderPreview((item as any).contentMd, (item as any).contentHtml);

        return (
          <div key={item.id} className="relative pb-4 pl-10">
            <div className="absolute left-[19px] top-1.5">
              <Circle
                className={isLatest ? "size-[9px] fill-[var(--app-color-accent)] text-[var(--app-color-accent)]" : "size-[9px] text-[var(--app-color-border-default)]"}
              />
            </div>

            <div className="rounded-[var(--app-radius-container)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-3">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-sm font-semibold text-[var(--app-color-text-primary)]">
                    v{item.version}
                    {isLatest && (
                      <span className="ml-2 rounded-full bg-[var(--app-color-accent-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--app-color-accent)]">
                        当前
                      </span>
                    )}
                  </span>
                  <p className="mt-0.5 text-xs text-[var(--app-color-text-secondary)]">
                    {formatKnowledgeDate(item.createdAt)} · {item.author}
                    {item.summary && <> · {item.summary}</>}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  {!isLatest && (
                    <button
                      onClick={() => handleRollback(item.version)}
                      disabled={rollbackMutation.isPending}
                      className="rounded-[var(--app-radius-element)] px-2 py-1 text-[10px] font-medium text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)] hover:text-[var(--app-color-text-primary)] disabled:opacity-50"
                    >
                      <RotateCcw className="mr-1 inline size-3" />
                      回滚
                    </button>
                  )}
                  <button
                    onClick={() => setExpandedDiff(isExpanded ? null : item.id)}
                    className="rounded-[var(--app-radius-element)] px-2 py-1 text-[10px] font-medium text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)] hover:text-[var(--app-color-text-primary)]"
                  >
                    {isExpanded ? <ChevronDown className="mr-1 inline size-3" /> : <ChevronRight className="mr-1 inline size-3" />}
                    预览
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div
                  className="mt-2 max-h-[300px] overflow-y-auto rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] p-3 text-xs"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
