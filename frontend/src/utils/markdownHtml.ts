import DOMPurify from "dompurify";

export type MarkdownTheme = "light" | "dark";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineFormat(s: string): string {
  return escapeHtml(s)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, '<code class="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.85em] text-slate-800">$1</code>');
}

function parseTableRow(line: string): string[] {
  const trimmed = line.trim();
  const inner = trimmed.startsWith("|") ? trimmed.slice(1) : trimmed;
  const body = inner.endsWith("|") ? inner.slice(0, -1) : inner;
  return body.split("|").map((c) => c.trim());
}

function isTableSeparatorRow(cells: string[]): boolean {
  if (cells.length === 0) return false;
  return cells.every((c) => /^:?-{2,}:?$/.test(c.replace(/\s/g, "")));
}

export function stripSimpleHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*/gi, "\n")
    .replace(/<p[^>]*>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function looksLikeMarkdown(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  const plain = t.includes("<") ? stripSimpleHtml(t) : t;
  if (/<(h[1-6]|ul|ol|li|img|table|blockquote)\b/i.test(t) && !/^#{1,6}\s/m.test(plain)) {
    return false;
  }
  return (
    /^(#{1,6}\s|[-*]\s+\S|\d+\.\s+\S|---\s*$|>\s+\S)/m.test(plain) ||
    /\*\*[^*]+\*\*/.test(plain) ||
    /`[^`]+`/.test(plain) ||
    /^\|.+\|$/m.test(plain)
  );
}

const THEME_STYLES: Record<
  MarkdownTheme,
  {
    h1: string;
    h2: string;
    h3: string;
    h4: string;
    hr: string;
    ul: string;
    p: string;
    olItem: string;
    olBullet: string;
    table: string;
    th: string;
    td: string;
    blockquote: string;
  }
> = {
  light: {
    h1: "mb-3 mt-2 text-lg font-bold text-slate-900",
    h2: "mb-2 mt-4 text-base font-bold text-slate-900",
    h3: "mb-2 mt-3 text-sm font-semibold text-slate-900",
    h4: "mb-2 mt-2 text-sm font-semibold text-slate-800",
    hr: "my-3 border-0 border-t border-slate-200",
    ul: "mb-3 list-disc space-y-1.5 pl-5",
    p: "mb-2 leading-relaxed",
    olItem: "mb-1.5 pl-1 leading-relaxed",
    olBullet: "mr-2 font-semibold text-slate-500",
    table: "mb-3 w-full border-collapse overflow-x-auto text-left text-xs",
    th: "border border-slate-200 bg-slate-50 px-2 py-1.5 font-semibold text-slate-800",
    td: "border border-slate-200 px-2 py-1.5 align-top text-slate-700",
    blockquote: "mb-3 border-l-4 border-violet-300 pl-3 text-slate-600 italic",
  },
  dark: {
    h1: "mb-3 mt-2 text-xl font-black text-violet-50",
    h2: "mb-2 mt-4 text-lg font-bold text-violet-50",
    h3: "mb-2 mt-4 text-base font-bold text-violet-100",
    h4: "mb-2 mt-3 text-sm font-bold text-violet-100/95",
    hr: "my-4 border-0 border-t border-violet-500/25",
    ul: "mb-3 list-disc space-y-1.5 pl-5",
    p: "mb-3 leading-relaxed",
    olItem: "mb-1.5 pl-1 leading-relaxed",
    olBullet: "mr-2 font-bold text-violet-300/90",
    table: "mb-3 w-full border-collapse overflow-x-auto text-left text-xs",
    th: "border border-violet-500/30 bg-violet-950/40 px-2 py-1.5 font-semibold text-violet-100",
    td: "border border-violet-500/25 px-2 py-1.5 align-top text-violet-50/90",
    blockquote: "mb-3 border-l-4 border-violet-400/50 pl-3 text-violet-200/80 italic",
  },
};

export function markdownToHtml(md: string, theme: MarkdownTheme = "light"): string {
  const styles = THEME_STYLES[theme];
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let inUl = false;

  const closeUl = () => {
    if (inUl) {
      out.push("</ul>");
      inUl = false;
    }
  };

  const flushParagraph = (buf: string[]) => {
    if (!buf.length) return;
    const text = buf.join(" ").trim();
    if (!text) return;
    closeUl();
    out.push(`<p class="${styles.p}">${inlineFormat(text)}</p>`);
  };

  const renderTable = (tableLines: string[]) => {
    if (tableLines.length < 1) return;
    const parsed = tableLines.map(parseTableRow);
    let header = parsed[0];
    let bodyStart = 1;
    if (parsed.length > 1 && isTableSeparatorRow(parsed[1])) {
      bodyStart = 2;
    } else if (parsed.length > 2 && isTableSeparatorRow(parsed[1])) {
      bodyStart = 2;
    }
    const bodyRows = parsed.slice(bodyStart).filter((r) => r.some((c) => c.length > 0));
    const cols = Math.max(header.length, ...bodyRows.map((r) => r.length));
    const pad = (cells: string[]) => {
      const row = [...cells];
      while (row.length < cols) row.push("");
      return row;
    };
    header = pad(header);
    out.push(`<div class="mb-3 overflow-x-auto"><table class="${styles.table}"><thead><tr>`);
    for (const cell of header) {
      out.push(`<th class="${styles.th}">${inlineFormat(cell)}</th>`);
    }
    out.push("</tr></thead><tbody>");
    for (const row of bodyRows) {
      out.push("<tr>");
      for (const cell of pad(row)) {
        out.push(`<td class="${styles.td}">${inlineFormat(cell)}</td>`);
      }
      out.push("</tr>");
    }
    out.push("</tbody></table></div>");
  };

  let paraBuf: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trimEnd();
    const trimmed = line.trim();

    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length) {
        const t = lines[i].trim();
        if (!t.startsWith("|") || !t.endsWith("|")) break;
        tableLines.push(t);
        i += 1;
      }
      flushParagraph(paraBuf);
      paraBuf = [];
      closeUl();
      renderTable(tableLines);
      continue;
    }

    if (!trimmed) {
      flushParagraph(paraBuf);
      paraBuf = [];
      i += 1;
      continue;
    }

    if (/^---\s*$/.test(trimmed)) {
      flushParagraph(paraBuf);
      paraBuf = [];
      closeUl();
      out.push(`<hr class="${styles.hr}" />`);
      i += 1;
      continue;
    }

    const h4 = trimmed.match(/^####\s+(.+)$/);
    if (h4) {
      flushParagraph(paraBuf);
      paraBuf = [];
      closeUl();
      out.push(`<h4 class="${styles.h4}">${inlineFormat(h4[1])}</h4>`);
      i += 1;
      continue;
    }

    const h3 = trimmed.match(/^###\s+(.+)$/);
    if (h3) {
      flushParagraph(paraBuf);
      paraBuf = [];
      closeUl();
      out.push(`<h3 class="${styles.h3}">${inlineFormat(h3[1])}</h3>`);
      i += 1;
      continue;
    }

    const h2 = trimmed.match(/^##\s+(.+)$/);
    if (h2) {
      flushParagraph(paraBuf);
      paraBuf = [];
      closeUl();
      out.push(`<h2 class="${styles.h2}">${inlineFormat(h2[1])}</h2>`);
      i += 1;
      continue;
    }

    const h1 = trimmed.match(/^#\s+(.+)$/);
    if (h1) {
      flushParagraph(paraBuf);
      paraBuf = [];
      closeUl();
      out.push(`<h1 class="${styles.h1}">${inlineFormat(h1[1])}</h1>`);
      i += 1;
      continue;
    }

    const bq = trimmed.match(/^>\s+(.+)$/);
    if (bq) {
      flushParagraph(paraBuf);
      paraBuf = [];
      closeUl();
      out.push(`<blockquote class="${styles.blockquote}">${inlineFormat(bq[1])}</blockquote>`);
      i += 1;
      continue;
    }

    const li = trimmed.match(/^[-*•]\s+(.+)$/);
    if (li) {
      flushParagraph(paraBuf);
      paraBuf = [];
      if (!inUl) {
        out.push(`<ul class="${styles.ul}">`);
        inUl = true;
      }
      out.push(`<li>${inlineFormat(li[1])}</li>`);
      i += 1;
      continue;
    }

    const oli = trimmed.match(/^\d+\.\s+(.+)$/);
    if (oli) {
      flushParagraph(paraBuf);
      paraBuf = [];
      closeUl();
      out.push(
        `<p class="${styles.olItem}"><span class="${styles.olBullet}">•</span>${inlineFormat(oli[1])}</p>`
      );
      i += 1;
      continue;
    }

    paraBuf.push(trimmed);
    i += 1;
  }

  flushParagraph(paraBuf);
  closeUl();
  return out.join("\n");
}

/** 将 Markdown 转为经 DOMPurify 消毒后的 HTML 片段 */
export function renderMarkdownToSafeHtml(raw: string, theme: MarkdownTheme = "light"): string {
  const trimmed = (raw || "").trim();
  if (!trimmed) return "";
  const plain = trimmed.includes("<") ? stripSimpleHtml(trimmed) : trimmed;
  const html = markdownToHtml(plain, theme);
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}
