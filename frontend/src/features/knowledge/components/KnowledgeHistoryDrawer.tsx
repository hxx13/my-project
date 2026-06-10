import { useKnowledgeHistory } from "@/features/knowledge/hooks/useKnowledgeHistory";
import { rollbackKnowledgePage } from "@/api/domains/knowledge.api";
import { X, RotateCcw } from "lucide-react";
import { useState } from "react";

interface Props {
  open: boolean;
  pageId: number | null;
  onClose: () => void;
  onRollback?: () => void;
}

export function KnowledgeHistoryDrawer({ open, pageId, onClose, onRollback }: Props) {
  const { data: history, isLoading } = useKnowledgeHistory(pageId ?? null);
  const [rollingBack, setRollingBack] = useState<number | null>(null);

  const handleRollback = async (version: number) => {
    if (!pageId || !confirm(`回滚到版本 v${version}？当前内容将被覆盖。`)) return;
    setRollingBack(version);
    try {
      await rollbackKnowledgePage(pageId, version);
      onRollback?.();
      onClose();
    } catch {
      alert("回滚失败");
    } finally {
      setRollingBack(null);
    }
  };

  if (!open || !pageId) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      {/* Drawer panel — slides in from right */}
      <div className="fixed inset-y-0 right-0 z-50 w-[380px] border-l border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] shadow-2xl flex flex-col animate-[slideInRight_0.25s_cubic-bezier(0.4,0,0.2,1)]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--app-color-border-default)] px-4 py-3 shrink-0">
          <h3 className="text-sm font-semibold text-[var(--app-color-text-primary)] font-mono">
            📜 版本历史
          </h3>
          <button
            onClick={onClose}
            className="rounded p-1 text-[var(--app-color-text-tertiary)] hover:bg-[var(--app-color-surface-hover)]"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Timeline */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-12 animate-skeleton-pulse rounded bg-[var(--app-color-surface-hover)]" />
              ))}
            </div>
          ) : !history || history.length === 0 ? (
            <div className="py-8 text-center text-sm text-[var(--app-color-text-tertiary)]">暂无版本记录</div>
          ) : (
            <div className="relative">
              {/* Vertical line */}
              <div className="absolute left-[11px] top-1 bottom-1 w-px bg-[var(--app-color-border-default)]" />

              {history.map((h, i) => (
                <div key={h.id} className="relative pl-7 pb-5">
                  {/* Dot */}
                  <div
                    className={`absolute left-[5px] top-1.5 w-3.5 h-3.5 rounded-full border-2 ${
                      i === 0
                        ? "bg-[var(--app-color-accent)] border-[var(--app-color-accent)]"
                        : "bg-[var(--app-color-surface-page)] border-[var(--app-color-border-default)]"
                    }`}
                  />

                  {/* Content */}
                  <div className="text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-[var(--app-color-text-primary)]">
                        v{h.version}
                      </span>
                      {i === 0 && (
                        <span className="text-[9px] bg-[var(--app-color-accent-soft)] text-[var(--app-color-accent)] px-1.5 py-0.5 rounded font-mono">
                          当前
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[var(--app-color-text-tertiary)] flex gap-2">
                      <span className="font-mono">{h.author}</span>
                      <span className="font-mono">
                        {new Date(h.createdAt).toLocaleString("zh-CN", {
                          month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                        })}
                      </span>
                    </div>
                    {h.summary && (
                      <div className="mt-1 text-[var(--app-color-text-secondary)]">{h.summary}</div>
                    )}
                    {i > 0 && (
                      <button
                        onClick={() => handleRollback(h.version)}
                        disabled={rollingBack === h.version}
                        className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-accent)] font-mono disabled:opacity-50"
                      >
                        <RotateCcw className="size-3" />
                        回滚到此版本
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
