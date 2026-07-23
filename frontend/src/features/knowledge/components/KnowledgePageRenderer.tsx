import { useMemo } from "react";
import { renderMarkdownToSafeHtml } from "@/utils/markdownHtml";

interface Props { contentHtml?: string; contentMd?: string; className?: string }

export function KnowledgePageRenderer({ contentHtml, contentMd, className }: Props) {
  const html = useMemo(() => {
    const md = contentMd?.trim();
    return md ? renderMarkdownToSafeHtml(md, "light") : (contentHtml || "");
  }, [contentHtml, contentMd]);

  if (!html) return <p className="text-sm text-[var(--app-color-text-tertiary)] italic">暂无内容</p>;
  return <article className={`docs-prose ${className || ""}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
