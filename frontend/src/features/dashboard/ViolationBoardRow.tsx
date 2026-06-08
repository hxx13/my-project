import { useState } from "react";
import type { DashboardViolationBoardItem } from "@/api/domains/dashboardViolationBoard.api";
import { useDashboardSciFiVisual } from "@/features/dashboard-scifi-theme/DashboardSciFiVisualContext";

type Props = {
  item: DashboardViolationBoardItem;
};

/**
 * 惩戒公示单行：姓名 → 简短说明 → 末尾照片（无图不渲染占位）。
 */
export function ViolationBoardRow({ item }: Props) {
  const sf = useDashboardSciFiVisual();
  const [imgHidden, setImgHidden] = useState(false);
  const url = item.coverImageUrl?.trim();
  const showImg = Boolean(url) && !imgHidden;

  const nameTone = sf ? "text-fuchsia-100" : "text-rose-900";
  const summaryTone = sf ? "text-fuchsia-100/85" : "text-rose-950/85";
  const borderTone = sf ? "border-fuchsia-500/15" : "border-rose-200/50";

  // 姓名拆分为单字，固定3字宽容器 + space-between：
  // 3字名自然填满，2字名左右撑开中间留空，保证右侧文案上下对齐
  const nameChars = [...(item.displayName || "—")];

  return (
    <div
      className={`flex items-center gap-2 border-b py-2.5 md:gap-3 md:py-3 ${borderTone}`}
    >
      <span
        className={`shrink-0 inline-flex justify-between text-xs font-bold md:text-sm ${nameTone}`}
        style={{ width: "2.7em" }}
      >
        {nameChars.map((ch, i) => (
          <span key={i}>{ch}</span>
        ))}
      </span>
      <span className={`min-w-0 flex-1 text-[11px] leading-snug line-clamp-3 md:text-xs ${summaryTone}`}>
        {item.summary || "—"}
      </span>
      {showImg ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          className={`h-12 w-12 shrink-0 rounded-lg object-cover md:h-14 md:w-14 ${
            sf ? "ring-1 ring-fuchsia-500/35" : "ring-1 ring-rose-200"
          }`}
          onError={() => setImgHidden(true)}
        />
      ) : null}
    </div>
  );
}
