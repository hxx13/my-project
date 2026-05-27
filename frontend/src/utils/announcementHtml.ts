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

/** 扫码公告正文容器：无大边框、适配暗色弹窗 */
export const SCAN_ANNOUNCEMENT_BODY_CLASS =
  "scan-announcement-body text-sm leading-relaxed text-violet-50/95 " +
  "[&_*]:border-0 [&_*]:shadow-none " +
  "[&_pre]:m-0 [&_pre]:bg-transparent [&_pre]:p-0 [&_pre]:whitespace-pre-wrap " +
  "[&_code]:bg-transparent [&_code]:p-0 [&_code]:text-inherit " +
  "[&_img]:mx-auto [&_img]:my-3 [&_img]:max-h-[min(50vh,400px)] [&_img]:rounded-lg " +
  "[&_a]:text-violet-300 [&_a]:underline";
