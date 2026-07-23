import { useMemo } from "react";

export function KnowledgePageOutline({ contentHtml, contentMd }: { contentHtml?: string; contentMd?: string }) {
  const headings = useMemo(() => {
    const src = contentMd || contentHtml || "";
    const re = /<h([23])[^>]*>(.*?)<\/h[23]>/gi;
    const items: { level: number; text: string; id: string }[] = [];
    let m;
    while ((m = re.exec(src)) !== null) {
      const text = m[2].replace(/<[^>]+>/g, "").trim();
      if (text) items.push({ level: Number(m[1]), text, id: text.toLowerCase().replace(/\s+/g, "-") });
    }
    return items;
  }, [contentHtml, contentMd]);

  if (!headings.length) return null;

  return (
    <nav>
      <h4 className="text-[10px] font-semibold text-[var(--app-color-text-tertiary)] uppercase tracking-wider mb-2 font-mono">本页大纲</h4>
      {headings.map((h, i) => (
        <a key={i} href={`#${h.id}`} className={`block text-[11px] py-0.5 text-[var(--app-color-text-secondary)] hover:text-[var(--app-color-accent)] ${h.level === 3 ? "pl-3" : ""}`}>
          {h.text}
        </a>
      ))}
    </nav>
  );
}
