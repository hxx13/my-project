import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
import { useKnowledgePage } from "@/features/knowledge/hooks/useKnowledgePage";
import { useKnowledgeSave } from "@/features/knowledge/hooks/useKnowledgeSave";
import { KnowledgePageRenderer } from "@/features/knowledge/components/KnowledgePageRenderer";
import { generateSlug } from "@/features/knowledge/utils";
import type { KnowledgePageSaveRequest } from "@/api/domains/knowledge.api";

interface KnowledgeEditorPanelProps {
  pageId?: number | null;
  categoryId?: number | null;
}

export function KnowledgeEditorPanel({ pageId, categoryId }: KnowledgeEditorPanelProps) {
  const navigate = useNavigate();
  const { data: existingPage } = useKnowledgePage(pageId ?? null);
  const saveMutation = useKnowledgeSave(pageId);

  const [initialized, setInitialized] = useState(false);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [contentMd, setContentMd] = useState("");
  const [summary, setSummary] = useState("");
  const [preview, setPreview] = useState(false);

  // Lazy init from existing page
  if (existingPage && !initialized) {
    setTitle(existingPage.title);
    setSlug(existingPage.slug);
    setContentMd(existingPage.contentMd ?? existingPage.contentHtml ?? "");
    setInitialized(true);
  }

  const handleTitleChange = (v: string) => {
    setTitle(v);
    if (!slug || slug === generateSlug(title)) {
      setSlug(generateSlug(v));
    }
  };

  const handleSave = () => {
    const data: KnowledgePageSaveRequest = {
      categoryId: categoryId ?? existingPage?.categoryId ?? 0,
      slug,
      title,
      contentHtml: contentMd,
      contentMd,
      summary: summary || undefined,
    };
    saveMutation.mutate(data, {
      onSuccess: (page) => {
        navigate(`/admin/knowledge/page/${page.id}`, { replace: true });
      },
    });
  };

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-[var(--app-color-border-default)] px-4 py-2">
        <button
          onClick={() => navigate(-1)}
          className="rounded-[var(--app-radius-element)] p-1.5 text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]"
        >
          <ArrowLeft className="size-4" />
        </button>
        <div className="flex-1 text-sm font-medium text-[var(--app-color-text-secondary)]">
          {pageId ? "编辑文档" : "新建文档"}
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
      <div className="space-y-3 border-b border-[var(--app-color-border-default)] px-4 py-3">
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
            placeholder="# 输入 Markdown 内容..."
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
