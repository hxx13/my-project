import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Save, Loader2, X } from "lucide-react";
import { useKnowledgeSave } from "@/features/knowledge/hooks/useKnowledgeSave";
import { KnowledgePageRenderer } from "@/features/knowledge/components/KnowledgePageRenderer";
import { generateSlug } from "@/features/knowledge/utils";
import type { KnowledgePage } from "@/api/domains/knowledge.api";
import type { KnowledgePageSaveRequest } from "@/api/domains/knowledge.api";

interface KnowledgeEditorPanelProps {
  existingPage?: KnowledgePage | null;
  onSaved?: (page: KnowledgePage) => void;
  onCancel?: () => void;
}

export function KnowledgeEditorPanel({
  existingPage,
  onSaved,
  onCancel,
}: KnowledgeEditorPanelProps) {
  const saveMutation = useKnowledgeSave(existingPage?.id ?? null);

  const [initialized, setInitialized] = useState(false);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [contentMd, setContentMd] = useState("");
  const [summary, setSummary] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [preview, setPreview] = useState(false);

  // Lazy init from existing page
  useEffect(() => {
    if (existingPage && !initialized) {
      setTitle(existingPage.title);
      setSlug(existingPage.slug);
      setContentMd(existingPage.contentMd ?? existingPage.contentHtml ?? "");
      // Parse tags from page if available
      try {
        if ((existingPage as any).tags) {
          const parsed = typeof (existingPage as any).tags === "string"
            ? JSON.parse((existingPage as any).tags)
            : (existingPage as any).tags;
          if (Array.isArray(parsed)) setTags(parsed);
        }
      } catch {}
      setInitialized(true);
    }
  }, [existingPage, initialized]);

  const handleTitleChange = (v: string) => {
    setTitle(v);
    if (!slug || slug === generateSlug(title)) {
      setSlug(generateSlug(v));
    }
  };

  const addTag = useCallback(() => {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) {
      setTags(prev => [...prev, t]);
    }
    setTagInput("");
  }, [tagInput, tags]);

  const removeTag = (t: string) => {
    setTags(prev => prev.filter(x => x !== t));
  };

  // Ctrl+S shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [title, slug, contentMd, summary, tags]);

  const handleSave = () => {
    if (!title) return;
    const data: KnowledgePageSaveRequest & { tags?: string[] } = {
      categoryId: existingPage?.categoryId ?? 0,
      slug,
      title,
      contentMd,
      summary: summary || undefined,
      tags,
    };
    saveMutation.mutate(data, {
      onSuccess: (page) => {
        onSaved?.(page);
      },
    });
  };

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-[var(--app-color-border-default)] px-4 py-2">
        <button
          onClick={onCancel}
          className="rounded-[var(--app-radius-element)] p-1.5 text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]"
        >
          <ArrowLeft className="size-4" />
        </button>
        <div className="flex-1 text-sm font-medium text-[var(--app-color-text-secondary)]">
          {existingPage ? "编辑文档" : "新建文档"}
        </div>
        <button
          onClick={() => setPreview(!preview)}
          className="rounded-[var(--app-radius-element)] px-2.5 py-1 text-xs font-medium text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]"
        >
          {preview ? "编辑" : "预览"}
        </button>
        <button
          onClick={handleSave}
          disabled={saveMutation.isPending || !title}
          className="rounded-[var(--app-radius-element)] bg-[var(--app-color-accent)] px-3 py-1 text-xs font-medium text-white hover:bg-[var(--app-color-accent-hover)] disabled:opacity-50"
        >
          {saveMutation.isPending ? (
            <><Loader2 className="mr-1 inline size-3 animate-spin" />保存中...</>
          ) : (
            <><Save className="mr-1 inline size-3" />保存</>
          )}
        </button>
      </div>

      {/* Metadata fields */}
      <div className="space-y-2 border-b border-[var(--app-color-border-default)] px-4 py-3">
        <input
          type="text"
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="文档标题"
          className="w-full rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-3 py-2 text-lg font-semibold text-[var(--app-color-text-primary)] placeholder:text-[var(--app-color-text-tertiary)] focus:border-[var(--app-color-border-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--app-color-accent)]/25"
        />
        <input
          type="text"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="URL 标识（自动生成）"
          className="w-full rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-3 py-1.5 text-sm font-mono text-[var(--app-color-text-secondary)] placeholder:text-[var(--app-color-text-tertiary)] focus:border-[var(--app-color-border-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--app-color-accent)]/25"
        />
        {/* Tags row */}
        <div className="flex items-center gap-2 flex-wrap">
          {tags.map(t => (
            <span key={t} className="inline-flex items-center gap-1 rounded-full bg-[var(--app-color-accent-soft)] px-2 py-0.5 text-[10px] font-mono text-[var(--app-color-accent)]">
              {t}
              <button onClick={() => removeTag(t)}><X className="size-2.5" /></button>
            </span>
          ))}
          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addTag();
              }
            }}
            placeholder={tags.length === 0 ? "添加标签（回车确认）" : "+ 标签"}
            className="w-32 rounded-[var(--app-radius-element)] border border-transparent bg-transparent px-2 py-0.5 text-[10px] font-mono text-[var(--app-color-text-tertiary)] placeholder:text-[var(--app-color-text-tertiary)] focus:border-[var(--app-color-border-default)] focus:outline-none"
          />
        </div>
      </div>

      {/* Editor / Preview */}
      <div className="flex-1 overflow-hidden">
        {preview ? (
          <div className="h-full overflow-y-auto p-4">
            <KnowledgePageRenderer contentMd={contentMd || "# 暂无内容"} />
          </div>
        ) : (
          <textarea
            value={contentMd}
            onChange={(e) => setContentMd(e.target.value)}
            placeholder="# 输入 Markdown 内容…&#10;&#10;使用 [[文档标题]] 创建内部链接"
            className="h-full w-full resize-none bg-[var(--app-color-surface-page)] p-4 font-mono text-sm text-[var(--app-color-text-primary)] placeholder:text-[var(--app-color-text-tertiary)] focus:outline-none"
          />
        )}
      </div>

      {/* Summary + Save footer */}
      <div className="flex items-center gap-2 border-t border-[var(--app-color-border-default)] px-4 py-2">
        <input
          type="text"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="修改摘要（可选）"
          className="flex-1 rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-3 py-1.5 text-xs text-[var(--app-color-text-secondary)] placeholder:text-[var(--app-color-text-tertiary)] focus:border-[var(--app-color-border-strong)] focus:outline-none"
        />
        <button
          onClick={handleSave}
          disabled={saveMutation.isPending || !title}
          className="rounded-[var(--app-radius-element)] bg-[var(--app-color-accent)] px-4 py-1.5 text-xs font-medium text-white hover:bg-[var(--app-color-accent-hover)] disabled:opacity-50"
        >
          {saveMutation.isPending ? "保存中..." : "保存"}
        </button>
      </div>
    </div>
  );
}
