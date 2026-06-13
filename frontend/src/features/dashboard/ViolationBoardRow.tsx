import { useMemo, useState } from "react";
import DOMPurify from "dompurify";
import type { DashboardViolationBoardItem } from "@/api/domains/dashboardViolationBoard.api";
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
};

/**
 * 惩戒公示单行：姓名 → 简短说明 → 末尾照片（无图不渲染占位）。
 */
export function ViolationBoardRow({ item }: Props) {
  const visual = useDashboardVisual();
  const [imgHidden, setImgHidden] = useState(false);
  const url = item.coverImageUrl?.trim();
  const showImg = Boolean(url) && !imgHidden;

  const nameTone = dashTone(visual, "text-fuchsia-100", DASH_NIGHT_CLASS.title, "text-rose-900");
  const summaryTone = dashTone(visual, "text-fuchsia-100/85", DASH_NIGHT_CLASS.textMuted, "text-rose-950/85");
  const borderTone = dashTone(visual, "border-fuchsia-500/15", DASH_NIGHT_CLASS.header, "border-rose-200/50");

  // 姓名拆分为单字，固定3字宽容器 + space-between：
  // 3字名自然填满，2字名左右撑开中间留空，保证右侧文案上下对齐
  const nameChars = [...(item.displayName || "—")];

  const summaryHtml = useMemo(
    () => toInlineHtml(item.summary || "—"),
    [item.summary],
  );

  return (
    <div
      className={`flex items-start gap-2 border-b py-2.5 md:gap-3 md:py-3 ${borderTone}`}
    >
      <span
        className={`shrink-0 inline-flex justify-between text-xs font-bold md:text-sm mt-[2px] ${nameTone}`}
        style={{ width: "2.7em" }}
      >
        {nameChars.map((ch, i) => (
          <span key={i}>{ch}</span>
        ))}
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={`text-[11px] leading-snug md:text-xs ${summaryTone}`}
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
        <img
          src={url}
          alt=""
          loading="lazy"
          className={`h-12 w-12 shrink-0 rounded-lg object-cover md:h-14 md:w-14 ${
            dashTone(visual, "ring-1 ring-fuchsia-500/35", "ring-1 ring-[var(--dash-night-border-warm)]", "ring-1 ring-rose-200")
          }`}
          onError={() => setImgHidden(true)}
        />
      ) : null}
    </div>
  );
}
