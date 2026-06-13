import { useMemo, useRef } from "react";
import { Clock, Megaphone } from "lucide-react";
import { dashTone, useDashboardVisual } from "@/features/dashboard-scifi-theme/DashboardSciFiVisualContext";
import { DASH_NIGHT_CLASS } from "@/features/dashboard-scifi-theme/dashboardNightTokens";
import { useVerticalAutoScroll } from "./useVerticalAutoScroll";
import { prepareAnnouncementHtml } from "@/utils/announcementHtml";

/**
 * 公告 Tab：单一滚动容器同时承载公告标题/正文 + 还卡时段 + 还卡规则；
 * 没有内部卡片外框，仅靠字号、颜色、间距、一根分隔线（border-t）做富文本式区分。
 */
type Props = {
  noticeTitle: string;
  noticeBody: string;
  hoursLabel: string;
  startTime: string;
  endTime: string;
  returnRules: string;
  active: boolean;
  generation: number;
  onCycleComplete: () => void;
  fallbackSeconds: number;
  scrollMode?: "loop" | "cycle";
};

function SafeHtmlBlock({
  raw,
  className = "",
}: {
  raw: string;
  className?: string;
}) {
  const html = useMemo(() => prepareAnnouncementHtml(raw ?? ""), [raw]);
  if (!html) {
    return <p className={className}>暂无内容。</p>;
  }
  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function CodexNoticeStreamPanel({
  noticeTitle,
  noticeBody,
  hoursLabel,
  startTime,
  endTime,
  returnRules,
  active,
  generation,
  onCycleComplete,
  fallbackSeconds,
  scrollMode = "cycle",
}: Props) {
  const visual = useDashboardVisual();
  const ref = useRef<HTMLDivElement | null>(null);

  useVerticalAutoScroll(ref, {
    enabled: active,
    pauseStartMs: 1500,
    pauseEndMs: 2000,
    msPerPx: 38,
    fallbackTimeoutMs: Math.max(4000, fallbackSeconds * 1000),
    onCycleComplete,
    resetKey: generation,
    mode: scrollMode,
  });

  const headTone = dashTone(visual, "text-cyan-100", DASH_NIGHT_CLASS.title, "text-amber-900");
  const noticeBodyTone = dashTone(visual, "text-slate-100", DASH_NIGHT_CLASS.title, "text-amber-950");
  const dividerTone = dashTone(visual, "border-cyan-500/25", DASH_NIGHT_CLASS.header, "border-amber-300/60");
  const hoursHeadTone = dashTone(visual, "text-slate-200", DASH_NIGHT_CLASS.textMuted, "text-slate-700");
  const hoursTimeTone = dashTone(visual, "text-cyan-100", DASH_NIGHT_CLASS.title, "text-slate-900");
  const rulesTone = dashTone(visual, "text-slate-300", DASH_NIGHT_CLASS.textMuted, "text-slate-600");

  return (
    <div
      ref={ref}
      className="h-full w-full overflow-y-auto overflow-x-hidden pr-1 [scrollbar-gutter:stable]"
    >
      <div className="flex min-w-0 items-center gap-2 pb-1.5">
        <Megaphone
          className={`h-5 w-5 shrink-0 ${dashTone(visual, "text-cyan-400", DASH_NIGHT_CLASS.legendWarm, "text-amber-600")}`}
        />
        <span className={`min-w-0 text-base font-black tracking-wide md:text-lg ${headTone}`}>
          {noticeTitle}
        </span>
      </div>
      {noticeBody.trim() ? (
        <SafeHtmlBlock
          raw={noticeBody}
          className={`text-base leading-relaxed md:text-lg ${noticeBodyTone}`}
        />
      ) : (
        <p className={`text-sm ${dashTone(visual, "text-slate-400", DASH_NIGHT_CLASS.textMuted, "text-amber-800/70")}`}>
          暂无公告内容。
        </p>
      )}

      <div className={`my-4 border-t ${dividerTone}`} />

      <div className={`flex min-w-0 items-center gap-2 pb-1 ${hoursHeadTone}`}>
        <Clock
          className={`h-4 w-4 shrink-0 ${dashTone(visual, "text-cyan-300", DASH_NIGHT_CLASS.legendSteel, "text-amber-500")}`}
        />
        <span className="text-sm font-bold tracking-wide md:text-base">{hoursLabel}</span>
      </div>
      <div className="flex items-baseline gap-2 pb-1.5">
        <span
          className={`text-2xl font-black tabular-nums tracking-tight md:text-3xl ${hoursTimeTone}`}
        >
          {startTime}
        </span>
        <span className={`text-base font-black ${dashTone(visual, "text-slate-500", DASH_NIGHT_CLASS.textMuted, "text-slate-400")}`}>
          —
        </span>
        <span
          className={`text-2xl font-black tabular-nums tracking-tight md:text-3xl ${hoursTimeTone}`}
        >
          {endTime}
        </span>
      </div>
      <SafeHtmlBlock
        raw={returnRules}
        className={`text-xs leading-snug md:text-sm ${rulesTone}`}
      />

      <div className="h-3" />
    </div>
  );
}
