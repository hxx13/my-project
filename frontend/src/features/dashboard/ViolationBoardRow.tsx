import { useEffect, useMemo, useRef, useState } from "react";
import DOMPurify from "dompurify";
import type { DashboardViolationBoardItem } from "@/api/domains/dashboardViolationBoard.api";
import { PageHelpImageLightbox } from "@/features/page-help/PageHelpImageLightbox";
import { useRichTextImageLightbox } from "@/components/rich-text/useRichTextImageLightbox";
import { dashTone, useDashboardVisual } from "@/features/dashboard-scifi-theme/DashboardSciFiVisualContext";
import { DASH_NIGHT_CLASS } from "@/features/dashboard-scifi-theme/dashboardNightTokens";

/**
 * 将富文本 HTML 转为适合 line-clamp 的行内格式：
 * - 块级标签 <p>/<div> 替换为 <br>（保留换行但不产生块盒）
 * - <img> 保留（行内元素，clamp 时计入行高）
 * - 其他标签通过 DOMPurify 消毒保留
 */
function toInlineHtml(raw: string): string {
  return DOMPurify.sanitize(raw || "—", { USE_PROFILES: { html: true } })
    .replace(/<\/p>\s*/gi, "<br>")
    .replace(/<p[^>]*>/gi, "")
    .replace(/<\/div>\s*/gi, "<br>")
    .replace(/<div[^>]*>/gi, "")
    .replace(/(<br\s*\/?>\s*){3,}/gi, "<br><br>");
}

type Props = {
  item: DashboardViolationBoardItem;
  onPreviewOpenChange?: (open: boolean) => void;
};

/**
 * 惩戒公示单行：姓名 → 简短说明 → 末尾照片（无图不渲染占位）。
 */
export function ViolationBoardRow({ item, onPreviewOpenChange }: Props) {
  const visual = useDashboardVisual();
  const [imgHidden, setImgHidden] = useState(false);
  const [coverPreviewOpen, setCoverPreviewOpen] = useState(false);
  const url = item.coverImageUrl?.trim();
  const showImg = Boolean(url) && !imgHidden;

  const summaryHtml = useMemo(
    () => toInlineHtml(item.summary || "—"),
    [item.summary],
  );
  const { containerRef, lightbox, closeLightbox } = useRichTextImageLightbox([summaryHtml]);
  const previewOpenRef = useRef(false);

  useEffect(() => {
    const open = coverPreviewOpen || lightbox != null;
    if (open === previewOpenRef.current) return;
    previewOpenRef.current = open;
    onPreviewOpenChange?.(open);
  }, [coverPreviewOpen, lightbox, onPreviewOpenChange]);

  const nameTone = dashTone(visual, "text-fuchsia-100", DASH_NIGHT_CLASS.title, "text-rose-900");
  const summaryTone = dashTone(visual, "text-fuchsia-100/85", DASH_NIGHT_CLASS.textMuted, "text-rose-950/85");
  const borderTone = dashTone(visual, "border-fuchsia-500/15", DASH_NIGHT_CLASS.header, "border-rose-200/50");

  const isGroup = Boolean(item.groupName);

  // 个人违规：姓名拆分为单字，固定3字宽容器 + space-between
  // 课题组违规：普通文本 + truncate
  const nameChars = isGroup ? [] : [...(item.displayName || "—")];

  const closeCoverPreview = () => setCoverPreviewOpen(false);

  return (
    <>
    <div
      className={`flex items-center gap-2 border-b py-2.5 md:gap-3 md:py-3 ${borderTone}`}
    >
      {isGroup ? (
        <span
          className={`shrink-0 max-w-[140px] truncate text-xs font-bold md:text-sm ${nameTone}`}
          title={item.displayName || ""}
        >
          {item.displayName || "—"}
        </span>
      ) : (
        <span
          className={`shrink-0 inline-flex justify-between text-xs font-bold md:text-sm ${nameTone}`}
          style={{ width: "2.7em" }}
        >
          {nameChars.map((ch, i) => (
            <span key={i}>{ch}</span>
          ))}
        </span>
      )}
      <div ref={containerRef} className="min-w-0 flex-1">
        <p
          className={`text-[11px] leading-snug md:text-xs [&_img]:my-1 [&_img]:max-h-16 [&_img]:cursor-zoom-in [&_img]:rounded-md ${summaryTone}`}
          style={{
            overflow: "hidden",
            display: "-webkit-box",
            WebkitBoxOrient: "vertical",
            WebkitLineClamp: 3,
          }}
          dangerouslySetInnerHTML={{ __html: summaryHtml }}
        />
      </div>
      {showImg ? (
        <button
          type="button"
          className="shrink-0 cursor-zoom-in rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-color-accent)]"
          aria-label={`查看 ${item.displayName || "违规"} 惩戒图片大图`}
          onClick={(event) => {
            event.stopPropagation();
            setCoverPreviewOpen(true);
          }}
        >
          <img
            src={url}
            alt=""
            loading="lazy"
            draggable={false}
            className={`h-12 w-12 rounded-lg object-cover md:h-14 md:w-14 ${
              dashTone(visual, "ring-1 ring-fuchsia-500/35", "ring-1 ring-[var(--dash-night-border-warm)]", "ring-1 ring-rose-200")
            }`}
            onError={() => setImgHidden(true)}
          />
        </button>
      ) : null}
    </div>
    {coverPreviewOpen && url ? (
      <PageHelpImageLightbox
        src={url}
        alt={`${item.displayName || "违规"}惩戒图片`}
        onClose={closeCoverPreview}
        autoCloseMs={10_000}
      />
    ) : null}
    {lightbox ? (
      <PageHelpImageLightbox
        src={lightbox.src}
        alt={lightbox.alt}
        onClose={closeLightbox}
        autoCloseMs={10_000}
      />
    ) : null}
    </>
  );
}
