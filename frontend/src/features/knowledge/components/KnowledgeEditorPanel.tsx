import { useState, useEffect } from "react";
import { Save, Loader2 } from "lucide-react";
import { useKnowledgeSave } from "@/features/knowledge/hooks/useKnowledgeSave";
import { generateSlug } from "@/features/knowledge/utils";
import type { KnowledgePage, KnowledgePageSaveRequest } from "@/features/knowledge/types";

interface Props {
  page: KnowledgePage | null;
  categoryId?: number;
  onSaved: (p: KnowledgePage) => void;
  onCancel: () => void;
}

export function KnowledgeEditorPanel({ page, categoryId, onSaved, onCancel }: Props) {
  const saveMutation = useKnowledgeSave(page?.id);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [contentMd, setContentMd] = useState("");
  const [summary, setSummary] = useState("");
  const [init, setInit] = useState(false);

  useEffect(() => {
    if (page && !init) { setTitle(page.title); setSlug(page.slug); setContentMd(page.contentMd || page.contentHtml || ""); setInit(true); }
  }, [page, init]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); handleSave(); } };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  });

  function handleSave() {
    if (!title.trim()) return;
    const data: KnowledgePageSaveRequest = {
      categoryId: page?.categoryId ?? categoryId ?? 0,
      slug: slug || generateSlug(title),
      title,
      contentMd,
      summary: summary || undefined,
    };
    saveMutation.mutate(data, { onSuccess: (p) => onSaved(p) });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-[var(--app-color-border-default)] px-4 py-2 shrink-0">
        <button onClick={onCancel} className="text-xs text-[var(--app-color-text-secondary)] hover:text-[var(--app-color-accent)]">← 返回</button>
        <span className="flex-1 text-xs text-[var(--app-color-text-tertiary)]">{page ? "编辑文档" : "新建文档"}</span>
        <button onClick={handleSave} disabled={saveMutation.isPending || !title} className="flex items-center gap-1 rounded-[var(--app-radius-element)] bg-[var(--app-color-accent)] px-3 py-1 text-xs font-medium text-white disabled:opacity-50">
          {saveMutation.isPending ? <Loader2 className="size-3 animate-spin" /> : <Save className="size-3" />}保存
        </button>
      </div>
      <div className="space-y-2 border-b border-[var(--app-color-border-default)] px-4 py-3 shrink-0">
        <input value={title} onChange={e => { setTitle(e.target.value); if (!slug || slug === generateSlug(title)) setSlug(generateSlug(e.target.value)); }} placeholder="文档标题" className="w-full rounded border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-3 py-2 text-lg font-semibold outline-none focus:ring-2 focus:ring-[var(--app-color-accent)]/25" />
        <input value={slug} onChange={e => setSlug(e.target.value)} placeholder="URL 标识" className="w-full rounded border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-3 py-1.5 text-sm font-mono outline-none" />
      </div>
      <textarea value={contentMd} onChange={e => setContentMd(e.target.value)} placeholder="# Markdown 内容…" className="flex-1 resize-none bg-[var(--app-color-surface-page)] p-4 font-mono text-sm outline-none min-h-0" />
      <div className="flex items-center gap-2 border-t border-[var(--app-color-border-default)] px-4 py-2 shrink-0">
        <input value={summary} onChange={e => setSummary(e.target.value)} placeholder="修改摘要" className="flex-1 rounded border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-3 py-1.5 text-xs outline-none" />
        <button onClick={handleSave} disabled={saveMutation.isPending || !title} className="rounded-[var(--app-radius-element)] bg-[var(--app-color-accent)] px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50">保存</button>
      </div>
    </div>
  );
}
