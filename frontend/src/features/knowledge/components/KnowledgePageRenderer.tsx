import { useMemo } from "react";
import { renderMarkdownToSafeHtml } from "@/utils/markdownHtml";
import { cn } from "@/lib/utils";

interface Props {
  contentHtml?: string;
  contentMd?: string;
  className?: string;
  onNavigateToPage?: (pageId: number) => void;
}

/**
 * Documentation-grade Markdown renderer.
 * Supports [[wikilink]] syntax: [[Title]] becomes a clickable link.
 */
export function KnowledgePageRenderer({ contentHtml, contentMd, className, onNavigateToPage }: Props) {
  const html = useMemo(() => {
    let source = contentMd?.trim()
      ? renderMarkdownToSafeHtml(contentMd!.trim(), "light")
      : (contentHtml || "");

    // Transform remaining [[wikilinks]] that survive markdown rendering
    if (source && onNavigateToPage) {
      source = source.replace(
        /\[\[([^\]]+)\]\]/g,
        (_match, title: string) =>
          `<span class="knowledge-wikilink" data-title="${escapeAttr(title)}">${escapeHtml(title)}</span>`
      );
    }

    return source;
  }, [contentHtml, contentMd, onNavigateToPage]);

  if (!html) {
    return <p className="text-sm text-[var(--app-color-text-tertiary)] italic">暂无内容</p>;
  }

  return (
    <article
      className={cn("docs-prose", className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
