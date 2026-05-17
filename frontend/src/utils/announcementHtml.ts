import DOMPurify from "dompurify";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineFormat(s: string): string {
  return s
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

function stripSimpleHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*/gi, "\n")
    .replace(/<p[^>]*>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 管理端粘贴的 Markdown 或 TipTap 将 Markdown 包在 &lt;p&gt; 内的 HTML */
export function looksLikeMarkdown(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  const plain = t.includes("<") ? stripSimpleHtml(t) : t;
  if (/<(h[1-6]|ul|ol|li|img|table|blockquote)\b/i.test(t) && !/^#{1,6}\s/m.test(plain)) {
    return false;
  }
  return /^(#{1,6}\s|[-*]\s+\S|\d+\.\s+\S|---\s*$)/m.test(plain) || /\*\*[^*]+\*\*/.test(plain);
}

function markdownToHtml(md: string): string {
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
    out.push(`<p class="mb-3 leading-relaxed">${inlineFormat(escapeHtml(text))}</p>`);
  };

  let paraBuf: string[] = [];

  for (const raw of lines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph(paraBuf);
      paraBuf = [];
      continue;
    }

    if (/^---\s*$/.test(trimmed)) {
      flushParagraph(paraBuf);
      paraBuf = [];
      closeUl();
      out.push('<hr class="my-4 border-0 border-t border-violet-500/25" />');
      continue;
    }

    const h3 = trimmed.match(/^###\s+(.+)$/);
    if (h3) {
      flushParagraph(paraBuf);
      paraBuf = [];
      closeUl();
      out.push(`<h3 class="mb-2 mt-4 text-base font-bold text-violet-100">${inlineFormat(escapeHtml(h3[1]))}</h3>`);
      continue;
    }

    const h2 = trimmed.match(/^##\s+(.+)$/);
    if (h2) {
      flushParagraph(paraBuf);
      paraBuf = [];
      closeUl();
      out.push(`<h2 class="mb-2 mt-4 text-lg font-bold text-violet-50">${inlineFormat(escapeHtml(h2[1]))}</h2>`);
      continue;
    }

    const h1 = trimmed.match(/^#\s+(.+)$/);
    if (h1) {
      flushParagraph(paraBuf);
      paraBuf = [];
      closeUl();
      out.push(`<h1 class="mb-3 mt-2 text-xl font-black text-violet-50">${inlineFormat(escapeHtml(h1[1]))}</h1>`);
      continue;
    }

    const li = trimmed.match(/^[-*]\s+(.+)$/);
    if (li) {
      flushParagraph(paraBuf);
      paraBuf = [];
      if (!inUl) {
        out.push('<ul class="mb-3 list-disc space-y-1.5 pl-5">');
        inUl = true;
      }
      out.push(`<li>${inlineFormat(escapeHtml(li[1]))}</li>`);
      continue;
    }

    const oli = trimmed.match(/^\d+\.\s+(.+)$/);
    if (oli) {
      flushParagraph(paraBuf);
      paraBuf = [];
      closeUl();
      out.push(`<p class="mb-1.5 pl-1 leading-relaxed"><span class="mr-2 font-bold text-violet-300/90">•</span>${inlineFormat(escapeHtml(oli[1]))}</p>`);
      continue;
    }

    paraBuf.push(trimmed);
  }

  flushParagraph(paraBuf);
  closeUl();
  return out.join("\n");
}

export function prepareAnnouncementHtml(raw: string): string {
  const trimmed = (raw || "").trim();
  if (!trimmed) return "";
  const plain = trimmed.includes("<") ? stripSimpleHtml(trimmed) : trimmed;
  const html = looksLikeMarkdown(trimmed) ? markdownToHtml(plain) : trimmed;
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}

/** 扫码公告正文容器：无大边框、适配暗色弹窗 */
export const SCAN_ANNOUNCEMENT_BODY_CLASS =
  "scan-announcement-body text-sm leading-relaxed text-violet-50/95 " +
  "[&_*]:border-0 [&_*]:shadow-none " +
  "[&_pre]:m-0 [&_pre]:bg-transparent [&_pre]:p-0 [&_pre]:whitespace-pre-wrap " +
  "[&_code]:bg-transparent [&_code]:p-0 [&_code]:text-inherit " +
  "[&_img]:mx-auto [&_img]:my-3 [&_img]:max-h-[min(50vh,400px)] [&_img]:rounded-lg " +
  "[&_a]:text-violet-300 [&_a]:underline";
