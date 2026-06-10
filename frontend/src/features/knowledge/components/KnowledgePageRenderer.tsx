export function KnowledgePageRenderer({ contentHtml, contentMd }: { contentHtml?: string; contentMd?: string }) {
  const html = contentMd?.trim() || contentHtml || "";
  if (!html) return <p className="text-sm text-[var(--app-color-text-tertiary)] italic">暂无内容</p>;

  return <article className="docs-prose" dangerouslySetInnerHTML={{ __html: html }} />;
}
