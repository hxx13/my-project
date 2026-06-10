import DOMPurify from "dompurify";

export type MarkdownTheme = "light" | "dark";

// ── inline formatting ──

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatInline(s: string): string {
  // Order matters: code before bold/italic, images before links
  return escapeHtml(s)
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" class="my-1 max-w-full rounded" loading="lazy" />')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-[var(--app-color-accent)] underline" target="_blank" rel="noopener">$1</a>')
    .replace(/`([^`]+)`/g, '<code class="rounded bg-[var(--app-color-surface-hover)] px-1 py-0.5 font-mono text-[0.85em] text-[var(--app-color-text-primary)]">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

// ── Table parsing ──

function parseTableRow(line: string): string[] {
  const t = line.trim();
  const inner = t.startsWith("|") ? t.slice(1) : t;
  const body = inner.endsWith("|") ? inner.slice(0, -1) : inner;
  return body.split("|").map(c => c.trim());
}

function isTableSep(cells: string[]): boolean {
  return cells.length > 0 && cells.every(c => /^:?-{2,}:?$/.test(c.replace(/\s/g, "")));
}

// ── Theme styles ──

// Minimal semantic classes — docs-prose CSS handles all typography
const S: Record<MarkdownTheme, Record<string, string>> = {
  light: {
    h1: "", h2: "", h3: "", h4: "",
    hr: "",
    ul: "", ol: "",
    p: "",
    blockquote: "",
    table: "docs-table", th: "", td: "",
    pre: "docs-code-block", codeBlock: "",
  },
  dark: {
    h1: "", h2: "", h3: "", h4: "",
    hr: "",
    ul: "", ol: "",
    p: "",
    blockquote: "",
    table: "docs-table", th: "", td: "",
    pre: "docs-code-block", codeBlock: "",
  },
};

// ── Main converter ──

export function markdownToHtml(md: string, theme: MarkdownTheme = "light"): string {
  const st = S[theme];
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let inUl = false, inOl = false, paraBuf: string[] = [];

  const flushPara = () => {
    if (!paraBuf.length) return;
    const text = paraBuf.join(" ").trim();
    paraBuf = [];
    if (!text) return;
    closeLists();
    out.push(`<p class="${st.p}">${formatInline(text)}</p>`);
  };

  const closeLists = () => {
    if (inUl) { out.push("</ul>"); inUl = false; }
    if (inOl) { out.push("</ol>"); inOl = false; }
  };

  const renderTable = (tableLines: string[]) => {
    const parsed = tableLines.map(parseTableRow);
    let header = parsed[0], bodyStart = 1;
    if (parsed.length > 1 && isTableSep(parsed[1])) bodyStart = 2;
    const rows = parsed.slice(bodyStart).filter(r => r.some(c => c.length > 0));
    const cols = Math.max(header.length, ...rows.map(r => r.length));
    const pad = (cells: string[]) => { const r = [...cells]; while (r.length < cols) r.push(""); return r; };
    header = pad(header);
    out.push(`<div class="mb-3 overflow-x-auto"><table class="${st.table}"><thead><tr>`);
    for (const c of header) out.push(`<th class="${st.th}">${formatInline(c)}</th>`);
    out.push("</tr></thead><tbody>");
    for (const r of rows) {
      out.push("<tr>");
      for (const c of pad(r)) out.push(`<td class="${st.td}">${formatInline(c)}</td>`);
      out.push("</tr>");
    }
    out.push("</tbody></table></div>");
  };

  let i = 0;
  while (i < lines.length) {
    const raw = lines[i], line = raw.trimEnd(), t = line.trim();

    // ── Fenced code block ──
    if (t.startsWith("```")) {
      flushPara();
      closeLists();
      const lang = t.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      const code = escapeHtml(codeLines.join("\n"));
      out.push(`<pre class="${st.pre}"><code${lang ? ` class="language-${lang}"` : ""}>${code}</code></pre>`);
      continue;
    }

    // ── Empty line ──
    if (!t) { flushPara(); closeLists(); i++; continue; }

    // ── Horizontal rule ──
    if (/^---\s*$/.test(t) || /^\*\*\*+\s*$/.test(t)) { flushPara(); closeLists(); out.push(`<hr class="${st.hr}" />`); i++; continue; }

    // ── Headers ──
    const headingId = (text: string) => text.toLowerCase().replace(/<[^>]+>/g, "").replace(/[^a-z0-9一-龥]+/g, "-").replace(/^-|-$/g, "");
    const h4 = t.match(/^####\s+(.+)$/);
    if (h4) { flushPara(); closeLists(); out.push(`<h4 class="${st.h4}" id="${headingId(h4[1])}">${formatInline(h4[1])}</h4>`); i++; continue; }
    const h3 = t.match(/^###\s+(.+)$/);
    if (h3) { flushPara(); closeLists(); out.push(`<h3 class="${st.h3}" id="${headingId(h3[1])}">${formatInline(h3[1])}</h3>`); i++; continue; }
    const h2 = t.match(/^##\s+(.+)$/);
    if (h2) { flushPara(); closeLists(); out.push(`<h2 class="${st.h2}" id="${headingId(h2[1])}">${formatInline(h2[1])}</h2>`); i++; continue; }
    const h1 = t.match(/^#\s+(.+)$/);
    if (h1) { flushPara(); closeLists(); out.push(`<h1 class="${st.h1}" id="${headingId(h1[1])}">${formatInline(h1[1])}</h1>`); i++; continue; }

    // ── Blockquote ──
    const bq = t.match(/^>\s?(.+)$/);
    if (bq) { flushPara(); closeLists(); out.push(`<blockquote class="${st.blockquote}">${formatInline(bq[1])}</blockquote>`); i++; continue; }

    // ── Tables ──
    if (t.startsWith("|") && t.endsWith("|")) {
      const tbl: string[] = [];
      while (i < lines.length) {
        const tl = lines[i].trim();
        if (!tl.startsWith("|") || !tl.endsWith("|")) break;
        tbl.push(tl); i++;
      }
      flushPara(); closeLists(); renderTable(tbl); continue;
    }

    // ── Unordered list ──
    const li = t.match(/^[-*•]\s+(.+)$/);
    if (li) { flushPara(); closeOl(); if (!inUl) { out.push(`<ul class="${st.ul}">`); inUl = true; } out.push(`<li>${formatInline(li[1])}</li>`); i++; continue; }

    // ── Ordered list ──
    const oli = t.match(/^\d+\.\s+(.+)$/);
    if (oli) { flushPara(); closeUl(); if (!inOl) { out.push(`<ol class="${st.ol}">`); inOl = true; } out.push(`<li>${formatInline(oli[1])}</li>`); i++; continue; }

    // ── Paragraph ──
    paraBuf.push(t); i++;
  }

  flushPara(); closeLists();
  return out.join("\n");

  function closeUl() { if (inUl) { out.push("</ul>"); inUl = false; } }
  function closeOl() { if (inOl) { out.push("</ol>"); inOl = false; } }
}

// ── Public API ──

export function stripSimpleHtml(html: string): string {
  return html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>\s*/gi, "\n").replace(/<p[^>]*>/gi, "").replace(/<[^>]+>/g, "").replace(/\n{3,}/g, "\n\n").trim();
}

export function looksLikeMarkdown(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  const plain = t.includes("<") ? stripSimpleHtml(t) : t;
  if (/<(h[1-6]|ul|ol|li|img|table|blockquote)\b/i.test(t) && !/^#{1,6}\s/m.test(plain)) return false;
  return /^(#{1,6}\s|[-*]\s+\S|\d+\.\s+\S|---\s*$|>\s+\S|```)/m.test(plain)
    || /\*\*[^*]+\*\*/.test(plain) || /`[^`]+`/.test(plain) || /^\|.+\|$/m.test(plain);
}

export function renderMarkdownToSafeHtml(raw: string, theme: MarkdownTheme = "light"): string {
  const trimmed = (raw || "").trim();
  if (!trimmed) return "";
  const plain = trimmed.includes("<") ? stripSimpleHtml(trimmed) : trimmed;
  return DOMPurify.sanitize(markdownToHtml(plain, theme), { USE_PROFILES: { html: true } });
}
