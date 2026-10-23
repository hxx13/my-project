import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
 * 正文视频从 HTML 里抽出来，交给面板顶部固定的视频区渲染。
 *
 * 不再把 <video> 留在滚动正文里再搬运：搬运会让浏览器重置播放，
 * 而且在原位置/固定区之间来回插拔容易留下双份画面。
 * 抽出来只渲染一次，正文在视频下方滚动。
 */
function prepareBody(raw: string): { html: string; srcs: string[] } {
  const safe = prepareAnnouncementHtml(raw ?? "");
  if (!safe.includes("<video")) return { html: safe, srcs: [] };
  const doc = new DOMParser().parseFromString(safe, "text/html");
  const srcs: string[] = [];
  doc.querySelectorAll("video").forEach((video) => {
    const src =
      video.getAttribute("src") || video.querySelector("source")?.getAttribute("src") || "";
    if (src.trim()) srcs.push(src.trim());
    const parent = video.parentElement;
    video.remove();
    // 只剩空壳的段落一起收掉，避免正文里留下大块空白
    if (
      parent &&
      parent.tagName === "P" &&
      parent.textContent?.trim() === "" &&
      parent.querySelectorAll("img, video").length === 0
    ) {
      parent.remove();
    }
  });
  return { html: doc.body.innerHTML, srcs };
}

function SafeHtmlBlock({
  html,
  className = "",
}: {
  html: string;
  className?: string;
}) {
  if (!html.trim()) {
    return <p className={className}>暂无内容。</p>;
  }
  return (
    <div
      className={`${className} [&_img]:max-w-[70%] [&_img]:h-auto [&_img]:block [&_img]:mx-auto [&_img]:my-2 [&_img]:rounded-[var(--app-radius-element)] [&_img]:cursor-zoom-in`}
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
  const stripRef = useRef<HTMLDivElement>(null);
  const mediaHoldRef = useRef(false);
  const holdCbRef = useRef(onMediaHoldChange);
  holdCbRef.current = onMediaHoldChange;
  const cycleCbRef = useRef(onCycleComplete);
  cycleCbRef.current = onCycleComplete;

  const preparedNotice = useMemo(() => prepareBody(noticeBody), [noticeBody]);
  const preparedRules = useMemo(() => prepareBody(returnRules), [returnRules]);
  /** 顶部固定区渲染的视频地址；正文里已经抽掉，只渲染这一份 */
  const videoSrcs = useMemo(
    () => [...preparedNotice.srcs, ...preparedRules.srcs],
    [preparedNotice, preparedRules],
  );

  useEffect(() => {
    mediaHoldRef.current = mediaHold;
    holdCbRef.current?.(mediaHold);
    return () => holdCbRef.current?.(false);
  }, [mediaHold]);

  /** 播放期间滚动先到底了：先不切，等视频播完由定时器统一切。 */
  const handleCycleComplete = useCallback(() => {
    if (mediaHoldRef.current) return;
    cycleCbRef.current();
  }, []);

  /**
   * 顶部视频区常驻，以「最长视频时长」为上限挂起 Tab 轮播；播完停 2 秒再切。
   * 切回本 Tab 时组件重新挂载，视频自然从头播放。
   */
  useEffect(() => {
    if (!active || videoSrcs.length === 0) return;
    const videos = Array.from(stripRef.current?.querySelectorAll<HTMLVideoElement>("video") ?? []);
    if (videos.length === 0) return;

    let cancelled = false;
    let timer: number | null = null;
    let retry: number | null = null;
    const beganAt = Date.now();

    videos.forEach((v) => {
      v.muted = true;
      v.loop = true;
      void v.play().catch(() => {});
    });

    const begin = () => {
      if (cancelled) return;
      const known = videos
        .map((v) => (Number.isFinite(v.duration) ? v.duration : 0))
        .filter((d) => d > 0);
      // 元数据没到齐先等一会儿，不能按 10 秒把长视频切掉
      if (known.length === 0 && Date.now() - beganAt < 5000) {
        retry = window.setTimeout(begin, 400);
        return;
      }
      const holdMs = Math.max(10, ...(known.length ? known : [10])) * 1000;
      setMediaHold(true);
      // 视频播完先停一拍再切，别让画面在结尾瞬间跳走
      const VIDEO_END_DWELL_MS = 2000;
      timer = window.setTimeout(() => {
        if (cancelled) return;
        timer = window.setTimeout(() => {
          if (cancelled) return;
          setMediaHold(false);
          cycleCbRef.current();
        }, VIDEO_END_DWELL_MS);
      }, holdMs);
    };
    begin();

    return () => {
      cancelled = true;
      if (timer != null) clearTimeout(timer);
      if (retry != null) clearTimeout(retry);
      setMediaHold(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, generation, videoSrcs]);

  const scrollHandlers = useVerticalAutoScroll(containerRef, {
    enabled: active && !lightbox,
    pauseStartMs: 1500,
    pauseEndMs: 2000,
    msPerPx: 24,
    fallbackTimeoutMs: Math.max(4000, fallbackSeconds * 1000),
    onCycleComplete: handleCycleComplete,
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
      <div className="flex h-full min-h-0 w-full flex-col">
      {/* 视频常驻顶部，正文在下方滚动；只渲染这一份，不再搬运节点 */}
      {videoSrcs.length > 0 ? (
        <div ref={stripRef} className="rt-video-pinned">
          {videoSrcs.map((src) => (
            <video key={src} src={src} autoPlay muted loop playsInline preload="auto" />
          ))}
        </div>
      ) : null}
      <div
        ref={containerRef}
        className="min-h-0 w-full flex-1 touch-pan-y overflow-y-auto overflow-x-hidden pr-1 [scrollbar-gutter:stable] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
          html={preparedNotice.html}
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
        html={preparedRules.html}
        className={`text-xs leading-snug md:text-sm ${rulesTone}`}
      />

      <div className="h-3" />
      </div>
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
