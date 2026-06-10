import { useMemo } from "react";
import { cn } from "@/lib/utils";

interface Heading {
  level: number;
  text: string;
  id: string;
}

/** Extract h2/h3 headings from Markdown content for right sidebar TOC */
function extractHeadings(md?: string, html?: string): Heading[] {
  const source = md || html || "";
  const headings: Heading[] = [];
  const lines = source.split("\n");
  for (const line of lines) {
    const m = line.match(/^(#{2,3})\s+(.+)$/);
    if (m) {
      const level = m[1].length;
      const text = m[2].trim();
      const id = text.toLowerCase().replace(/[^a-z0-9一-龥]+/g, "-").replace(/^-|-$/g, "");
      headings.push({ level, text, id });
    }
  }
  return headings;
}

interface Props {
  contentMd?: string;
  contentHtml?: string;
  className?: string;
}

export function KnowledgePageOutline({ contentMd, contentHtml, className }: Props) {
  const headings = useMemo(() => extractHeadings(contentMd, contentHtml), [contentMd, contentHtml]);

  if (!headings.length) return null;

  return (
    <nav className={cn("space-y-0.5 text-xs", className)}>
      <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--app-color-text-tertiary)]">
        本页目录
      </h4>
      {headings.map((h, i) => (
        <a
          key={i}
          href={`#${h.id}`}
          className={cn(
            "block truncate py-1 transition-colors hover:text-[var(--app-color-accent)]",
            h.level === 2 ? "pl-0 text-[var(--app-color-text-secondary)]" : "pl-3 text-[var(--app-color-text-tertiary)]"
          )}
          onClick={(e) => {
            e.preventDefault();
            const el = document.getElementById(h.id);
            if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        >
          {h.text}
        </a>
      ))}
    </nav>
  );
}
