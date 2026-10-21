import DOMPurify, { type Config } from "dompurify";

/** TipTap 字色 / 高亮色块 / 站内视频 — 与后端 MpHtmlSanitizer 白名单对齐 */
export const RICH_TEXT_HTML_SANITIZE_CONFIG: Config = {
  USE_PROFILES: { html: true },
  ADD_TAGS: ["mark", "video", "source", "audio"],
  ADD_ATTR: [
    "style",
    "data-color",
    "controls",
    "preload",
    "playsinline",
    "poster",
    "muted",
    "loop",
  ],
};

export function sanitizeRichTextHtml(html: string): string {
  return DOMPurify.sanitize(html, RICH_TEXT_HTML_SANITIZE_CONFIG);
}
