import { useEffect, useMemo, useRef, useState } from "react";
import { Clock, Megaphone } from "lucide-react";
import { PageHelpImageLightbox } from "@/features/page-help/PageHelpImageLightbox";
import { useRichTextImageLightbox } from "@/components/rich-text/useRichTextImageLightbox";
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
  /** 视频吸附播放期间为 true：外层据此暂停 Tab 定时轮播 */
  onMediaHoldChange?: (held: boolean) => void;
};

/**
 * 正文视频：所有视频收进一个可吸附的竖排容器。
 *
 * - 跟随正文滚动，容器顶部到达视口顶部后自动吸附（CSS sticky）；
 * - 多个视频按顺序往下排，一起循环播放；
 * - 大屏只允许静音自动播放，所以固定 muted。
 */
function prepareInlineVideos(html: string): string {
  if (!html.includes("<video")) return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const source = Array.from(doc.querySelectorAll("video"));
  if (source.length === 0) return html;

  const slots: HTMLElement[] = [];
  for (const video of source) {
    video.removeAttribute("controls");
    video.setAttribute("autoplay", "");
    video.setAttribute("muted", "");
    video.setAttribute("loop", "");
    video.setAttribute("playsinline", "");
    video.setAttribute("preload", "auto");
    const slot = doc.createElement("div");
    video.replaceWith(slot);
    slot.appendChild(video);
    slots.push(slot);
  }

  const stack = doc.createElement("div");
  stack.className = "rt-video-stack";
  for (const slot of slots) {
    while (slot.firstChild) stack.appendChild(slot.firstChild);
  }
  slots[0].replaceWith(stack);
  slots.slice(1).forEach((s) => s.remove());
  return doc.body.innerHTML;
}

function SafeHtmlBlock({
  raw,
  className = "",
}: {
  raw: string;
  className?: string;
}) {
  const html = useMemo(() => prepareInlineVideos(prepareAnnouncementHtml(raw ?? "")), [raw]);
  if (!html) {
    return <p className={className}>暂无内容。</p>;
  }
  return (
    <div
      className={`${className} [&_img]:max-w-[70%] [&_img]:h-auto [&_img]:block [&_img]:mx-auto [&_img]:my-2 [&_img]:rounded-[var(--app-radius-element)] [&_img]:cursor-zoom-in [&_video]:block [&_video]:w-full [&_video]:max-w-[560px] [&_video]:mx-auto [&_video]:my-2 [&_video]:rounded-[var(--app-radius-element)]`}
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
  onMediaHoldChange,
}: Props) {
  const visual = useDashboardVisual();
  const { containerRef, lightbox, closeLightbox } = useRichTextImageLightbox([noticeBody, returnRules]);
  const [mediaHold, setMediaHold] = useState(false);
  const holdCbRef = useRef(onMediaHoldChange);
  holdCbRef.current = onMediaHoldChange;
  const cycleCbRef = useRef(onCycleComplete);
  cycleCbRef.current = onCycleComplete;

  useEffect(() => {
    holdCbRef.current?.(mediaHold);
    return () => holdCbRef.current?.(false);
  }, [mediaHold]);

  /**
   * 视频吸附后暂停滚动，并以「最长视频时长」为上限挂起 Tab 轮播；到点再切下一个。
   * 切回本 Tab 时组件重新挂载，视频自然从头播放。
   */
  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;
    const stack = container.querySelector<HTMLElement>(".rt-video-stack");
    const videos = Array.from(container.querySelectorAll<HTMLVideoElement>("video"));
    if (!stack || videos.length === 0) return;

    let cancelled = false;
    let started = false;
    let timer: number | null = null;
    let retry: number | null = null;
    const beganAt = Date.now();

    videos.forEach((v) => {
      v.muted = true;
      v.loop = true;
      try {
        v.currentTime = 0;
      } catch {
        /* 尚未加载元数据 */
      }
      void v.play().catch(() => {});
    });

    const begin = () => {
      if (started || cancelled) return;
      const known = videos
        .map((v) => (Number.isFinite(v.duration) ? v.duration : 0))
        .filter((d) => d > 0);
      // 元数据没到齐先等一会儿，不能按 10 秒把长视频切掉
      if (known.length === 0 && Date.now() - beganAt < 5000) {
        retry = window.setTimeout(begin, 400);
        return;
      }
      started = true;
      const holdMs = Math.max(10, ...(known.length ? known : [10])) * 1000;
      setMediaHold(true);
      timer = window.setTimeout(() => {
        if (cancelled) return;
        setMediaHold(false);
        cycleCbRef.current();
      }, holdMs);
    };

    const onScroll = () => {
      if (started) return;
      const cTop = container.getBoundingClientRect().top;
      const sTop = stack.getBoundingClientRect().top;
      if (sTop <= cTop + 2) begin();
    };

    const raf = requestAnimationFrame(() => {
      if (cancelled) return;
      if (container.scrollHeight <= container.clientHeight + 2) begin();
      else onScroll();
    });
    container.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      container.removeEventListener("scroll", onScroll);
      if (timer != null) clearTimeout(timer);
      if (retry != null) clearTimeout(retry);
      setMediaHold(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, generation, noticeBody, returnRules]);

  const scrollHandlers = useVerticalAutoScroll(containerRef, {
    enabled: active && !lightbox && !mediaHold,
    pauseStartMs: 1500,
    pauseEndMs: 2000,
    msPerPx: 24,
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
    <>
      <div
        ref={containerRef}
        className="h-full w-full touch-pan-y overflow-y-auto overflow-x-hidden pr-1 [scrollbar-gutter:stable] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        {...scrollHandlers}
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
