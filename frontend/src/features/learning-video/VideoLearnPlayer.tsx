import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Maximize2, Minimize2, Pause, Play, X } from "lucide-react";
import { Portal } from "@/components/Portal";
import { cn } from "@/lib/utils";
import { resolveApiMediaUrl } from "@/utils/mediaUrl";
import {
  reportLearningVideoProgress,
  type LearningVideoProgressResult,
} from "@/api/domains/learningVideo.api";

export type LearnableVideo = {
  id: number;
  title: string;
  fileUrl: string;
  allowSeek?: boolean | number;
  resumeSeconds?: number;
  percent?: number;
  completed?: boolean;
};

type Props = {
  video: LearnableVideo;
  onClose: () => void;
  /** 管理端预览：不上报进度 */
  previewOnly?: boolean;
  onProgressed?: (p: LearningVideoProgressResult) => void;
};

function fmt(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

/**
 * 学习视频播放器。全部自绘控件（原生控件会自带倍速与下载入口，无法关闭）：
 * - 按 resumeSeconds 续播（后端已按「记住位置 / 未看完重来」折算）；
 * - 禁止快进时只显示观看进度条，不提供拖动；服务端也会丢弃异常跨度；
 * - 每 5 秒心跳一次；暂停、结束、关闭时补报；
 * - 「全屏」只铺满页面，不走浏览器原生的全屏接口。
 */
export function VideoLearnPlayer({ video, onClose, previewOnly = false, onProgressed }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastPosRef = useRef(0);
  const [paused, setPaused] = useState(true);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [percent, setPercent] = useState(video.percent ?? 0);
  const [completed, setCompleted] = useState(Boolean(video.completed));
  const [pageFull, setPageFull] = useState(false);

  const allowSeek = previewOnly || (video.allowSeek !== false && video.allowSeek !== 0);

  const flush = useCallback(
    async (ended = false) => {
      const el = videoRef.current;
      if (!el || previewOnly) return;
      const pos = Math.floor(el.currentTime || 0);
      const rawDelta = pos - lastPosRef.current;
      // 一次心跳跨度过大 = 拖动/跳转，不计入有效观看
      const watchedDelta = rawDelta > 0 && rawDelta <= 5 ? rawDelta : 0;
      lastPosRef.current = pos;
      try {
        const p = await reportLearningVideoProgress(video.id, {
          position: pos,
          watchedDelta,
          duration: Math.floor(el.duration || 0),
          ended,
        });
        setPercent(p.percent);
        setCompleted(p.completed);
        onProgressed?.(p);
      } catch {
        // 断网/下架时静默，下一次心跳继续
      }
    },
    [video.id, previewOnly, onProgressed],
  );

  useEffect(() => {
    if (previewOnly || paused) return;
    const id = window.setInterval(() => void flush(false), 5000);
    return () => window.clearInterval(id);
  }, [previewOnly, paused, flush]);

  // 关闭/卸载时补报一次，避免最后几秒丢失
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => {
    return () => {
      void flushRef.current(false);
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      if (pageFull) {
        setPageFull(false);
        return;
      }
      close();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageFull]);

  const close = () => {
    void flush(false);
    onClose();
  };

  const togglePlay = async () => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      try {
        await el.play();
      } catch {
        /* 浏览器拒绝播放时保持暂停 */
      }
    } else {
      el.pause();
    }
  };

  const seekTo = (value: number) => {
    const el = videoRef.current;
    if (!el || !allowSeek) return;
    const t = Math.max(0, Math.min(value, el.duration || 0));
    el.currentTime = t;
    lastPosRef.current = Math.floor(t);
    setCurrent(t);
  };

  const onLoadedMetadata = () => {
    const el = videoRef.current;
    if (!el) return;
    setDuration(el.duration || 0);
    const resume = Math.floor(video.resumeSeconds ?? 0);
    if (!previewOnly && resume > 0 && resume < (el.duration || 0) - 1) {
      el.currentTime = resume;
    }
    lastPosRef.current = Math.floor(el.currentTime || 0);
    setCurrent(el.currentTime || 0);
  };

  return (
    <Portal>
      <div
        className={cn(
          "pointer-events-auto fixed inset-0 isolate z-[1200] flex items-center justify-center bg-black/80",
          pageFull ? "p-0" : "p-3 sm:p-6",
        )}
        role="dialog"
        aria-modal="true"
        aria-label={video.title || "视频学习"}
        onClick={close}
      >
        <div
          className={cn(
            "flex w-full flex-col overflow-hidden bg-slate-950 text-white",
            pageFull ? "h-full max-w-none rounded-none" : "max-w-4xl rounded-xl shadow-2xl",
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-4 py-2.5">
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{video.title}</span>
            {completed ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5" /> 已完成
              </span>
            ) : (
              <span className="shrink-0 text-xs text-white/60">已看 {percent}%</span>
            )}
            <button
              type="button"
              onClick={() => setPageFull((v) => !v)}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-white/70 hover:bg-white/10 hover:text-white"
              aria-label={pageFull ? "退出全屏" : "全屏"}
              title={pageFull ? "退出全屏" : "全屏"}
            >
              {pageFull ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={close}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-white/70 hover:bg-white/10 hover:text-white"
              aria-label="关闭"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div
            className={cn(
              "relative bg-black",
              pageFull && "flex min-h-0 flex-1 items-center justify-center",
            )}
          >
            {/* eslint-disable-next-line jsx-a11y/media-has-caption -- 站内培训视频无字幕轨 */}
            <video
              ref={videoRef}
              src={resolveApiMediaUrl(video.fileUrl) ?? video.fileUrl}
              preload="metadata"
              playsInline
              controls={false}
              controlsList="nodownload noplaybackrate"
              disablePictureInPicture
              onContextMenu={(e) => e.preventDefault()}
              className={cn("block w-full bg-black", pageFull ? "h-full object-contain" : "max-h-[68vh]")}
              onClick={() => void togglePlay()}
              onLoadedMetadata={onLoadedMetadata}
              onPlay={() => setPaused(false)}
              onPause={() => {
                setPaused(true);
                void flush(false);
              }}
              onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
              onRateChange={(e) => {
                // 倍速入口已随原生控件关闭，这里再兜一层
                if (Math.abs(e.currentTarget.playbackRate - 1) > 0.01) {
                  e.currentTarget.playbackRate = 1;
                }
              }}
              onEnded={() => {
                setPaused(true);
                void flush(true);
              }}
            />
            {paused ? (
              <button
                type="button"
                onClick={() => void togglePlay()}
                className="absolute inset-0 grid place-items-center bg-black/25"
                aria-label="播放"
              >
                <span className="grid h-16 w-16 place-items-center rounded-full bg-white/90 text-slate-900 shadow-xl">
                  <Play className="ml-1 h-7 w-7" />
                </span>
              </button>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-3 border-t border-white/10 px-4 py-2.5 text-xs text-white/70">
            <button
              type="button"
              onClick={() => void togglePlay()}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/10 hover:bg-white/20"
              aria-label={paused ? "播放" : "暂停"}
            >
              {paused ? <Play className="ml-0.5 h-4 w-4" /> : <Pause className="h-4 w-4" />}
            </button>
            <span className="shrink-0 tabular-nums">
              {fmt(current)} / {fmt(duration)}
            </span>
            {allowSeek ? (
              <input
                type="range"
                min={0}
                max={Math.max(1, Math.floor(duration))}
                step={1}
                value={Math.min(Math.floor(current), Math.max(1, Math.floor(duration)))}
                onChange={(e) => seekTo(Number(e.target.value))}
                aria-label="播放进度"
                className="h-1.5 min-w-0 flex-1 cursor-pointer accent-[var(--app-color-accent,#22d3ee)]"
              />
            ) : (
              <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/15">
                <div
                  className="h-full rounded-full bg-[var(--app-color-accent,#22d3ee)]"
                  style={{ width: `${Math.min(100, percent)}%` }}
                />
              </div>
            )}
            <span className="shrink-0">{allowSeek ? `观看进度 ${percent}%` : "不可拖动"}</span>
          </div>
        </div>
      </div>
    </Portal>
  );
}
