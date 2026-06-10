import { renderMarkdownToSafeHtml } from "@/utils/markdownHtml";
import { cn } from "@/lib/utils";

interface Props {
  contentHtml?: string;
  contentMd?: string;
  className?: string;
}

/**
 * Documentation-grade Markdown renderer.
 * Uses the shared renderMarkdownToSafeHtml but applies docs-specific prose styling.
 */
export function KnowledgePageRenderer({ contentHtml, contentMd, className }: Props) {
  const md = contentMd?.trim();
  const html = md ? renderMarkdownToSafeHtml(md, "light") : (contentHtml || "");

  if (!html && !md) {
    return <p className="text-sm text-[var(--app-color-text-tertiary)] italic">暂无内容</p>;
  }

  return (
    <article
      className={cn("docs-prose", className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
