import DOMPurify from "dompurify";
import { resolveApiMediaUrl } from "@/utils/mediaUrl";

/** 帮助弹窗正文排版（教程预览、版本历史、首次介绍共用） */
export const PAGE_HELP_PROSE_CLASS = "page-help-prose";

/** 帮助弹窗壳层（覆盖 Dialog 默认 bg-white，适配亮/暗主题） */
export const PAGE_HELP_DIALOG_CLASS = "page-help-dialog";

/** 帮助弹窗内可滚动区域 — 与 --app-color-* 主题联动 */
export const PAGE_HELP_SCROLL_CLASS = "page-help-scrollbar";

/** 首次「新功能介绍」弹窗 — 50vw × 80vh，图片上限略放宽 */
export const PAGE_HELP_INTRO_DIALOG_CLASS = "page-help-intro-dialog";

function normalizePageHelpImages(html: string): string {
  if (!html || !/<img\b/i.test(html)) return html;
  if (typeof DOMParser === "undefined") return html;

  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("img").forEach((img) => {
    const src = img.getAttribute("src");
    const resolved = src ? resolveApiMediaUrl(src) : undefined;
    if (resolved) {
      img.setAttribute("src", resolved);
    }
    img.removeAttribute("width");
    img.removeAttribute("height");
    img.style.removeProperty("width");
    img.style.removeProperty("height");
    img.style.removeProperty("max-width");
    img.style.removeProperty("max-height");
    if (!img.getAttribute("style")?.trim()) {
      img.removeAttribute("style");
    }
    img.classList.add("page-help-content-img");
  });
  return doc.body.innerHTML;
}

export function preparePageHelpHtml(raw: string): string {
  const trimmed = (raw || "").trim();
  if (!trimmed) return "";
  const sanitized = DOMPurify.sanitize(trimmed, { USE_PROFILES: { html: true } });
  return normalizePageHelpImages(sanitized);
}
