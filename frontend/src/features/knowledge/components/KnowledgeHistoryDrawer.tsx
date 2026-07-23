import { X, RotateCcw } from "lucide-react";
import { useState } from "react";
import { useKnowledgeHistory } from "@/features/knowledge/hooks/useKnowledgeHistory";
import { rollbackKnowledgePage } from "@/api/domains/knowledge.api";

interface Props { open: boolean; pageId: number | null; onClose: () => void; onRollback: () => void }

export function KnowledgeHistoryDrawer({ open, pageId, onClose, onRollback }: Props) {
  const { data: history, isLoading } = useKnowledgeHistory(pageId);
  const [rolling, setRolling] = useState<number | null>(null);

  if (!open || !pageId) return null;

  async function handleRollback(v: number) {
    if (!pageId || !confirm(`回滚到 v${v}？`)) return;
    setRolling(v);
    try { await rollbackKnowledgePage(pageId, v); onRollback(); onClose(); } catch { alert("回滚失败"); } finally { setRolling(null); }
  }

  return (
    <>
      <div className="fixed inset-0 top-16 bg-black/30" style={{ zIndex: "var(--z-overlay)" }} onClick={onClose} />
      <div className="fixed top-16 bottom-0 right-0 w-[360px] border-l border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] flex flex-col" style={{ zIndex: "var(--z-modal)", boxShadow: "var(--app-elevation-modal)" }}>
        <div className="flex items-center justify-between border-b px-4 py-3 shrink-0">
          <h3 className="text-sm font-semibold font-mono">版本历史</h3>
          <button onClick={onClose} className="rounded p-1 hover:bg-[var(--app-color-surface-hover)]"><X className="size-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded bg-[var(--app-color-surface-hover)]" />)}</div>
            : !history?.length ? <div className="py-8 text-center text-sm text-[var(--app-color-text-tertiary)]">暂无版本</div>
            : <div className="relative"><div className="absolute left-[11px] top-1 bottom-1 w-px bg-[var(--app-color-border-default)]" />
              {history.map((h, i) => (
                <div key={h.id} className="relative pl-7 pb-5">
                  <div className={`absolute left-[5px] top-1.5 w-3.5 h-3.5 rounded-full border-2 ${i === 0 ? "bg-[var(--app-color-accent)] border-[var(--app-color-accent)]" : "bg-[var(--app-color-surface-page)] border-[var(--app-color-border-default)]"}`} />
                  <div className="text-xs">
                    <span className="font-mono font-bold">v{h.version}</span>
                    {i === 0 && <span className="ml-2 text-[9px] bg-[var(--app-color-accent-soft)] text-[var(--app-color-accent)] px-1.5 py-0.5 rounded font-mono">当前</span>}
                    <div className="mt-0.5 text-[var(--app-color-text-tertiary)] font-mono">{h.author} · {new Date(h.createdAt).toLocaleString("zh-CN")}</div>
                    {h.summary && <div className="mt-1 text-[var(--app-color-text-secondary)]">{h.summary}</div>}
                    {i > 0 && <button onClick={() => handleRollback(h.version)} disabled={rolling === h.version} className="mt-1.5 text-[10px] text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-accent)] font-mono"><RotateCcw className="size-3 inline mr-1" />回滚到此版本</button>}
                  </div>
                </div>
              ))}
            </div>}
        </div>
      </div>
    </>
  );
}
