import DOMPurify from "dompurify";
import { looksLikeMarkdown, renderMarkdownToSafeHtml, stripSimpleHtml } from "@/utils/markdownHtml";

export { looksLikeMarkdown } from "@/utils/markdownHtml";

export function prepareAnnouncementHtml(raw: string): string {
  const trimmed = (raw || "").trim();
  if (!trimmed) return "";
  const plain = trimmed.includes("<") ? stripSimpleHtml(trimmed) : trimmed;
  if (!looksLikeMarkdown(trimmed)) {
    return DOMPurify.sanitize(trimmed, { USE_PROFILES: { html: true } });
  }
  return renderMarkdownToSafeHtml(plain, "dark");
}

/**
 * 扫码公告正文容器 — 🍱 Bento 暗色排版
 *
 * 不在内容层强制剥离边框/阴影，让公告 HTML 自带的元素
 * 可以保留视觉层次。彩色强调统一通过 --app-color-accent。
 */
export const SCAN_ANNOUNCEMENT_BODY_CLASS =
  "scan-announcement-body text-sm leading-relaxed text-[var(--app-color-text-primary)] " +
  /* 保留 pre/code 无背景适配暗色卡片 */
  "[&_pre]:m-0 [&_pre]:bg-transparent [&_pre]:p-0 [&_pre]:whitespace-pre-wrap " +
  "[&_code]:bg-[var(--app-color-surface-hover)] [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[var(--app-color-text-primary)] [&_code]:font-mono [&_code]:text-[0.85em] " +
  /* 图片居中 + 圆角 */
  "[&_img]:mx-auto [&_img]:my-3 [&_img]:max-h-[min(50vh,400px)] [&_img]:rounded-[var(--app-radius-element)] " +
  /* 链接 + 强调 */
  "[&_a]:text-[var(--app-color-accent)] [&_a]:underline [&_a]:decoration-[var(--app-color-accent)]/40 " +
  /* 标题层次 */
  "[&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-[var(--app-color-text-primary)] [&_h2]:mt-5 [&_h2]:mb-2 " +
  "[&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-[var(--app-color-text-secondary)] [&_h3]:mt-4 [&_h3]:mb-1.5 " +
  /* 段落 */
  "[&_p]:leading-7 [&_p]:mb-3 " +
  /* 强调 */
  "[&_strong]:text-[var(--app-color-text-primary)] [&_strong]:font-bold " +
  /* 列表 */
  "[&_ul]:pl-5 [&_ul]:mb-3 [&_li]:mb-1 [&_li]:leading-relaxed " +
  /* 分割线 */
  "[&_hr]:border-[var(--app-color-border-default)] [&_hr]:my-4";
