import DOMPurify, { type Config } from "dompurify";

/** TipTap 字色 / 高亮色块 — 与后端 MpHtmlSanitizer 白名单对齐 */
export const RICH_TEXT_HTML_SANITIZE_CONFIG: Config = {
  USE_PROFILES: { html: true },
  ADD_TAGS: ["mark"],
  ADD_ATTR: ["style", "data-color"],
};

export function sanitizeRichTextHtml(html: string): string {
  return DOMPurify.sanitize(html, RICH_TEXT_HTML_SANITIZE_CONFIG);
}
