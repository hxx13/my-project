/** 手机 H5 公告列表/详情 — 与小程序首页 news-card、homeBulletinDetail 对齐 */
import type { CSSProperties } from "react";
import type { MobileAlertItem } from "@/api/domains/mobileStudent.api";
import {
  looksLikeMarkdown,
  renderMarkdownToSafeHtml,
  stripSimpleHtml,
} from "@/utils/markdownHtml";
import { sanitizeRichTextHtml } from "@/utils/richTextHtmlSanitize";

export function alertKindLabel(kind: MobileAlertItem["kind"]): string {
  switch (kind) {
    case "violation":
      return "违规提醒";
    case "exempt":
      return "豁免";
    case "material_feedback":
      return "物资审核";
    case "scan_delay_feedback":
      return "延迟申请";
    default:
      return "公告";
  }
}

export function alertKindColors(kind: MobileAlertItem["kind"]): { bg: string; color: string } {
  switch (kind) {
    case "violation":
      return { bg: "#fee2e2", color: "#dc2626" };
    case "exempt":
      return { bg: "#dcfce7", color: "#16a34a" };
    case "material_feedback":
      return { bg: "#fef3c7", color: "#a16207" };
    case "scan_delay_feedback":
      return { bg: "#e0e7ff", color: "#4338ca" };
    default:
      return { bg: "#dbeafe", color: "#2563eb" };
  }
}

/** 解码实体编码的 HTML（如 &lt;p&gt;），避免被当成纯文本二次转义 */
export function decodeHtmlEntitiesIfNeeded(raw: string): string {
  const text = (raw || "").trim();
  if (!text.includes("&")) return text;
  if (text.includes("<") && !text.includes("&lt;")) return text;
  if (typeof document !== "undefined") {
    const el = document.createElement("textarea");
    el.innerHTML = text;
    return el.value;
  }
  return text
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, "&");
}

/** 剥离旧版/脏数据中的来源、时间等元数据行，仅保留违规正文 */
export function extractViolationBodyForDisplay(raw: string): string {
  let text = decodeHtmlEntitiesIfNeeded(raw).trim();
  if (!text) return "";
  text = text.replace(/^\s*来源\s*[:：]\s*.+$/gim, "");
  text = text.replace(/^\s*时间\s*[:：]\s*.+$/gim, "");
  text = text.replace(/^\s*原因\s*[:：]\s*/gim, "");
  text = text.replace(/\s*[·•]\s*来源\s*[:：]\s*[^·•\n]+/gi, "");
  text = text.replace(/\s*来源\s*[:：]\s*[^·•\n]+/gi, "");
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

function escapePlainText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 手机端正文：与扫码弹窗 prepareAnnouncementHtml 同源，Markdown 使用浅色主题 */
export function prepareMobileNoticeHtml(raw: string): string {
  const trimmed = decodeHtmlEntitiesIfNeeded(raw).trim();
  if (!trimmed) return "";
  if (!trimmed.includes("<") && !looksLikeMarkdown(trimmed)) {
    return `<p>${escapePlainText(trimmed).replace(/\r?\n/g, "<br/>")}</p>`;
  }
  const plain = trimmed.includes("<") ? stripSimpleHtml(trimmed) : trimmed;
  if (!looksLikeMarkdown(trimmed)) {
    return sanitizeRichTextHtml(trimmed);
  }
  return renderMarkdownToSafeHtml(plain, "light");
}

function noticeDateOnly(item: MobileAlertItem): string {
  return item.publishAt?.slice(0, 10) || item.createdAt?.slice(0, 10) || "";
}

/** 列表副标题：日期 + 可选摘要（不含类型标签，类型由角标展示） */
export function formatNoticeListSubtitle(item: MobileAlertItem): string {
  const date = noticeDateOnly(item);
  if (item.kind === "violation") {
    const plain = stripSimpleHtml(
      extractViolationBodyForDisplay(item.contentHtml || ""),
    ).trim();
    const title = (item.title || "").trim();
    let preview = "";
    if (plain && plain !== title && !title.includes(plain)) {
      preview = plain.length > 36 ? `${plain.slice(0, 36)}…` : plain;
    }
    if (preview && date) return `${date} · ${preview}`;
    return date || preview;
  }
  const plain = stripSimpleHtml(item.contentHtml || "").trim();
  const title = (item.title || "").trim();
  let preview = "";
  if (plain && plain !== title && !title.includes(plain)) {
    preview = plain.length > 36 ? `${plain.slice(0, 36)}…` : plain;
  }
  if (preview && date) return `${date} · ${preview}`;
  if (date) return date;
  return preview;
}

/** @deprecated 使用 formatNoticeListSubtitle */
export function formatNoticeListLabel(item: MobileAlertItem): string {
  return formatNoticeListSubtitle(item);
}

export const MOBILE_NOTICE_BODY_CLASS =
  "rich-text-content text-[14px] leading-relaxed break-words";

export function formatNoticeMeta(item: MobileAlertItem): string {
  const date = noticeDateOnly(item);
  if (item.kind === "violation") {
    return date;
  }
  const kind = alertKindLabel(item.kind);
  const timePart = item.publishAt?.slice(0, 16) || item.createdAt?.slice(0, 16) || "";
  return [timePart, kind].filter(Boolean).join(" · ");
}

/** 小程序 .news-card 容器样式（首页公告区，独立于 Hero） */
export const MOBILE_NOTICE_LIST_CARD_STYLE: CSSProperties = {
  background: "rgba(255,255,255,0.88)",
  borderRadius: 12,
  boxShadow: "0 4px 14px rgba(15, 23, 42, 0.06)",
  border: "1px solid rgba(91, 92, 230, 0.08)",
  overflow: "hidden",
};

/** 首页公告区外层 — 与小程序 .section 同级，不侵入 Hero */
export const MOBILE_HOME_NOTICE_SECTION_STYLE: CSSProperties = {
  marginTop: 12,
};
