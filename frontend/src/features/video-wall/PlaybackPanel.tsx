import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  VideoOff,
} from "lucide-react";
import toast from "react-hot-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { VideoChannel } from "@/api/domains/videoWall.api";
import {
  fetchPlaybackChunkFile,
  fetchPlaybackChunkStatus,
  fetchPlaybackSegments,
  startPlaybackChunk,
  type PlaybackSegment,
} from "@/api/domains/playback.api";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const CHUNK_SECONDS = 60;

type TimelineSegment = { start: number; end: number };

const pad = (n: number) => String(n).padStart(2, "0");

function formatDateKey(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dayStartOf(dateKey: string) {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}

function parseLocal(value: string) {
  const [datePart, timePart = "00:00:00"] = value.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm, ss] = timePart.split(":").map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0, ss || 0, 0).getTime();
}

function offsetSuffix(d: Date) {
  const offset = -d.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

function toLocalIso(ms: number) {
  const d = new Date(ms);
  return `${formatDateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${offsetSuffix(d)}`;
}

function clock(ms: number) {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function findSegment(segs: TimelineSegment[], ms: number) {
  return segs.find((s) => ms >= s.start && ms < s.end) ?? null;
}

function nearestSegmentStart(segs: TimelineSegment[], ms: number) {
  let best: TimelineSegment | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const s of segs) {
    const distance = ms < s.start ? s.start - ms : ms >= s.end ? ms - s.end : 0;
    if (distance < bestDistance) {
      best = s;
      bestDistance = distance;
    }
  }
  return best;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type Props = {
  channel: VideoChannel | null;
};

export default function PlaybackPanel({ channel }: Props) {
  const todayKey = formatDateKey(new Date());
  const [dateKey, setDateKey] = useState(todayKey);
  const [segments, setSegments] = useState<TimelineSegment[]>([]);
  const [segmentsLoading, setSegmentsLoading] = useState(false);
  const [cursorMs, setCursorMs] = useState(() => Date.now());
  const [chunkStartMs, setChunkStartMs] = useState<number | null>(null);
  const [chunkSeconds, setChunkSeconds] = useState(CHUNK_SECONDS);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [zoom, setZoom] = useState<24 | 1>(24);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());

  const videoRef = useRef<HTMLVideoElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const seqRef = useRef(0);
  const chunkRef = useRef<{ startMs: number; seconds: number } | null>(null);
  const nextRef = useRef<{ startMs: number; seconds: number; url: string } | null>(null);
  const prefetchSeqRef = useRef(0);

  const clearNext = useCallback(() => {
    prefetchSeqRef.current += 1;
    if (nextRef.current) URL.revokeObjectURL(nextRef.current.url);
    nextRef.current = null;
  }, []);

  const dayStart = useMemo(() => dayStartOf(dateKey), [dateKey]);
  const dayEnd = dayStart + DAY_MS;

  const releaseUrl = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setVideoUrl(null);
  }, []);

  /** 预取下一段，避免每 60 秒停一次等生成；失败静默，不影响当前播放 */
  const prefetchNext = useCallback(
    async (startMs: number, seconds: number, segs: TimelineSegment[]) => {
      if (!channel) return;
      const nextStart = startMs + seconds * 1000;
      if (!findSegment(segs, nextStart)) return;
      if (nextRef.current?.startMs === nextStart) return;
      const mySeq = ++prefetchSeqRef.current;
      try {
        const job = await startPlaybackChunk(channel.channelCode, toLocalIso(nextStart), seconds);
        let current = job;
        const deadline = Date.now() + 90_000;
        while (current.status === "pending" || current.status === "running") {
          if (prefetchSeqRef.current !== mySeq) return;
          if (Date.now() > deadline) return;
          await sleep(700);
          current = await fetchPlaybackChunkStatus(job.jobId);
        }
        if (current.status === "error") return;
        const blob = await fetchPlaybackChunkFile(job.jobId);
        if (prefetchSeqRef.current !== mySeq) return;
        const url = URL.createObjectURL(blob);
        if (prefetchSeqRef.current !== mySeq) {
          URL.revokeObjectURL(url);
          return;
        }
        if (nextRef.current) URL.revokeObjectURL(nextRef.current.url);
        nextRef.current = { startMs: nextStart, seconds: current.seconds || seconds, url };
      } catch {
        // 预取失败时保留正常播放；到片尾再走按需加载
      }
    },
    [channel]
  );

  const loadChunk = useCallback(
    async (targetMs: number, segs: TimelineSegment[]) => {
      if (!channel) return;
      const seg = findSegment(segs, targetMs) ?? nearestSegmentStart(segs, targetMs);
      if (!seg) {
        setError("该日期没有录像");
        return;
      }
      const startMs = Math.min(Math.max(targetMs, seg.start), Math.max(seg.start, seg.end - 1000));
      const seq = ++seqRef.current;
      clearNext();
      videoRef.current?.pause();
      setLoading(true);
      setError(null);
      setPlaying(false);
      setCursorMs(startMs);
      try {
        const job = await startPlaybackChunk(channel.channelCode, toLocalIso(startMs), CHUNK_SECONDS);
        let current = job;
        const deadline = Date.now() + 90_000;
        while (current.status === "pending" || current.status === "running") {
          if (seqRef.current !== seq) return;
          if (Date.now() > deadline) throw new Error("回放生成超时");
          await sleep(600);
          current = await fetchPlaybackChunkStatus(job.jobId);
        }
        if (current.status === "error") throw new Error(current.error || "回放生成失败");
        const blob = await fetchPlaybackChunkFile(job.jobId);
        if (seqRef.current !== seq) return;
        const url = URL.createObjectURL(blob);
        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = url;
        setVideoUrl(url);
        setChunkStartMs(startMs);
        setChunkSeconds(current.seconds || CHUNK_SECONDS);
        chunkRef.current = { startMs, seconds: current.seconds || CHUNK_SECONDS };
        void prefetchNext(startMs, current.seconds || CHUNK_SECONDS, segs);
      } catch (e) {
        if (seqRef.current === seq) {
          setError(e instanceof Error ? e.message : "回放加载失败");
          setChunkStartMs(null);
        }
      } finally {
        if (seqRef.current === seq) setLoading(false);
      }
    },
    [channel, clearNext, prefetchNext]
  );

  useEffect(() => {
    releaseUrl();
    clearNext();
    setChunkStartMs(null);
    setPlaying(false);
    setError(null);
    setSegments([]);
    setSegmentsLoading(false);
    if (!channel) return;
    let cancelled = false;
    setSegmentsLoading(true);
    fetchPlaybackSegments(channel.channelCode, dateKey)
      .then((list: PlaybackSegment[]) => {
        if (cancelled) return;
        const segs = list
          .map((s) => ({ start: parseLocal(s.start), end: parseLocal(s.end) }))
          .filter((s) => s.end > s.start)
          .sort((a, b) => a.start - b.start);
        setSegments(segs);
        if (!segs.length) {
          setError("该日期没有录像");
          return;
        }
        const now = new Date();
        let target: number;
        if (dateKey === todayKey) {
          target = now.getTime();
        } else {
          const sameClock = new Date(dayStart);
          sameClock.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), 0);
          target = sameClock.getTime();
        }
        if (!findSegment(segs, target)) {
          target = nearestSegmentStart(segs, target)?.start ?? segs[0].start;
        }
        setCursorMs(target);
        void loadChunk(target, segs);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "录像检索失败");
      })
      .finally(() => {
        if (!cancelled) setSegmentsLoading(false);
      });
    return () => {
      cancelled = true;
      seqRef.current += 1;
    };
  }, [channel?.channelCode, clearNext, dateKey, dayStart, dayEnd, loadChunk, releaseUrl, todayKey]);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      if (nextRef.current) URL.revokeObjectURL(nextRef.current.url);
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (video && videoUrl) {
      video.playbackRate = speed;
      void video.play().catch(() => setPlaying(false));
    }
    // 只在换片段时自动播放；变速不应把已暂停的视频重新拉起来
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (video) video.playbackRate = speed;
  }, [speed]);

  const seekTo = useCallback(
    (targetMs: number) => {
      const clamped = Math.min(Math.max(targetMs, dayStart), dayEnd - 1000);
      if (!segments.length) {
        toast.error("该日期没有录像");
        return;
      }
      if (!findSegment(segments, clamped)) {
        const nearest = nearestSegmentStart(segments, clamped);
        if (!nearest) {
          toast.error("该时间没有录像");
          return;
        }
        toast("该时间没有录像，已跳到最近的录像");
        setCursorMs(nearest.start);
        void loadChunk(nearest.start, segments);
        return;
      }
      setCursorMs(clamped);
      if (
        chunkStartMs != null &&
        clamped >= chunkStartMs &&
        clamped < chunkStartMs + chunkSeconds * 1000 - 300
      ) {
        const video = videoRef.current;
        if (video) {
          video.currentTime = (clamped - chunkStartMs) / 1000;
          void video.play().catch(() => {});
        }
        return;
      }
      void loadChunk(clamped, segments);
    },
    [chunkStartMs, chunkSeconds, dayEnd, dayStart, loadChunk, segments]
  );

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => {});
    else video.pause();
  }, []);

  const changeSpeed = useCallback((value: number) => {
    setSpeed(value);
    const video = videoRef.current;
    if (video) video.playbackRate = value;
  }, []);

  const skip = useCallback((deltaMs: number) => {
    seekTo(cursorMs + deltaMs);
  }, [cursorMs, seekTo]);

  const windowStart =
    zoom === 24
      ? dayStart
      : Math.max(dayStart, Math.min(Math.floor(cursorMs / HOUR_MS) * HOUR_MS, dayEnd - HOUR_MS));
  const windowEnd = Math.min(dayEnd, windowStart + (zoom === 24 ? DAY_MS : HOUR_MS));

  if (!channel) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-[var(--app-color-border-default)] bg-black/90 text-sm text-white/60">
        <div className="flex flex-col items-center gap-2">
          <VideoOff className="h-7 w-7" />
          <span>点击左侧通道进入回放</span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-[var(--app-color-border-default)] bg-black">
      <div className="relative min-h-0 flex-1">
        {videoUrl ? (
          <video
            ref={videoRef}
            src={videoUrl}
            muted
            playsInline
            className="h-full w-full bg-black object-contain"
            onTimeUpdate={(event) => {
              if (chunkStartMs != null) {
                setCursorMs(chunkStartMs + event.currentTarget.currentTime * 1000);
              }
            }}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => {
              setPlaying(false);
              if (chunkStartMs == null) return;
              const expected = chunkStartMs + chunkSeconds * 1000;
              const nx = nextRef.current;
              if (nx && nx.startMs === expected) {
                if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
                objectUrlRef.current = nx.url;
                setVideoUrl(nx.url);
                setChunkStartMs(nx.startMs);
                setChunkSeconds(nx.seconds);
                setCursorMs(nx.startMs);
                chunkRef.current = { startMs: nx.startMs, seconds: nx.seconds };
                nextRef.current = null;
                void prefetchNext(nx.startMs, nx.seconds, segments);
              } else if (findSegment(segments, expected)) {
                seekTo(expected);
              }
            }}
          />
        ) : null}

        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
            <span className="flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-sm text-white/85">
              <Loader2 className="h-4 w-4 animate-spin" />
              正在准备回放…
            </span>
          </div>
        ) : null}

        {!loading && error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 px-6 text-center">
            <span className="text-sm text-white/80">{error}</span>
            <button
              type="button"
              className="rounded border border-white/20 px-2 py-1 text-xs text-white/80 hover:bg-white/10"
              onClick={() => void loadChunk(cursorMs, segments)}
            >
              重试
            </button>
          </div>
        ) : null}

        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 bg-gradient-to-b from-black/65 to-transparent px-3 py-2">
          <div className="min-w-0">
            <div className="truncate text-xs font-medium text-white">{channel.channelName}</div>
            <div className="text-[11px] text-white/60">
              {dateKey} {clock(cursorMs)}
            </div>
          </div>
          {segmentsLoading ? <Loader2 className="h-4 w-4 animate-spin text-white/60" /> : null}
        </div>
      </div>

      <div className="shrink-0 border-t border-white/10 bg-[#0b0f14] px-3 pb-2 pt-1.5 text-white">
        <div className="mb-1.5 flex items-center gap-2">
          <button
            type="button"
            onClick={togglePlay}
            disabled={!videoUrl}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 disabled:opacity-40"
            aria-label={playing ? "暂停" : "播放"}
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => skip(-10_000)}
            className="inline-flex h-7 items-center gap-1 rounded px-1.5 text-xs text-white/75 hover:bg-white/10"
            title="后退 10 秒"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            10s
          </button>
          <button
            type="button"
            onClick={() => skip(10_000)}
            className="inline-flex h-7 items-center gap-1 rounded px-1.5 text-xs text-white/75 hover:bg-white/10"
            title="前进 10 秒"
          >
            10s
            <RotateCcw className="h-3.5 w-3.5 scale-x-[-1]" />
          </button>

          <span className="ml-1 text-xs tabular-nums text-white/80">{clock(cursorMs)}</span>

          <div className="ml-auto flex items-center gap-1">
            {[0.5, 1, 1.5, 2].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => changeSpeed(value)}
                className={cn(
                  "h-6 rounded px-1.5 text-[11px] tabular-nums transition",
                  speed === value
                    ? "bg-[var(--app-color-accent)] text-white"
                    : "text-white/60 hover:bg-white/10 hover:text-white"
                )}
              >
                {value}x
              </button>
            ))}
            <span className="mx-1 h-4 w-px bg-white/15" aria-hidden />
            <button
              type="button"
              onClick={() => setZoom(24)}
              className={cn(
                "h-6 rounded px-1.5 text-[11px] transition",
                zoom === 24 ? "bg-white/20 text-white" : "text-white/60 hover:bg-white/10"
              )}
            >
              24小时
            </button>
            <button
              type="button"
              onClick={() => setZoom(1)}
              className={cn(
                "h-6 rounded px-1.5 text-[11px] transition",
                zoom === 1 ? "bg-white/20 text-white" : "text-white/60 hover:bg-white/10"
              )}
            >
              1小时
            </button>
            <span className="mx-1 h-4 w-px bg-white/15" aria-hidden />
            <button
              type="button"
              onClick={() => {
                const d = new Date(dayStart);
                setCalendarMonth(new Date(d.getFullYear(), d.getMonth(), 1));
                setCalendarOpen(true);
              }}
              className="inline-flex h-7 items-center gap-1 rounded px-1.5 text-xs text-white/75 hover:bg-white/10"
            >
              <CalendarDays className="h-3.5 w-3.5" />
              {dateKey}
            </button>
          </div>
        </div>

        <Timeline
          windowStart={windowStart}
          windowEnd={windowEnd}
          segments={segments}
          cursorMs={cursorMs}
          onSeek={seekTo}
        />
      </div>

      <Dialog open={calendarOpen} onOpenChange={setCalendarOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>选择回放日期</DialogTitle>
          </DialogHeader>
          <CalendarGrid
            month={calendarMonth}
            onMonthChange={setCalendarMonth}
            selected={dateKey}
            maxDate={todayKey}
            onSelect={(value) => {
              setDateKey(value);
              setCalendarOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Timeline({
  windowStart,
  windowEnd,
  segments,
  cursorMs,
  onSeek,
}: {
  windowStart: number;
  windowEnd: number;
  segments: TimelineSegment[];
  cursorMs: number;
  onSeek: (ms: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [dragMs, setDragMs] = useState(cursorMs);

  useEffect(() => {
    if (!dragging) setDragMs(cursorMs);
  }, [cursorMs, dragging]);

  const span = Math.max(1, windowEnd - windowStart);
  const pct = (ms: number) => Math.min(100, Math.max(0, ((ms - windowStart) / span) * 100));

  const timeFromEvent = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return windowStart;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return windowStart + ratio * span;
  };

  const shown = dragging ? dragMs : cursorMs;
  const bands = segments
    .map((s) => ({
      start: Math.max(s.start, windowStart),
      end: Math.min(s.end, windowEnd),
    }))
    .filter((s) => s.end > s.start);

  const tickCount = windowEnd - windowStart > HOUR_MS * 12 ? 8 : 12;
  const label = (ms: number) =>
    ms === windowEnd && clock(ms).startsWith("00:00") ? "24:00" : clock(ms).slice(0, 5);

  return (
    <div className="pt-1">
      <div
        ref={trackRef}
        className="relative h-9 cursor-pointer touch-none select-none rounded bg-white/10"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          setDragging(true);
          setDragMs(timeFromEvent(event.clientX));
        }}
        onPointerMove={(event) => {
          if (dragging) setDragMs(timeFromEvent(event.clientX));
        }}
        onPointerUp={(event) => {
          const value = timeFromEvent(event.clientX);
          setDragging(false);
          setDragMs(value);
          onSeek(value);
        }}
        onPointerCancel={() => setDragging(false)}
      >
        {bands.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[11px] text-white/40">
            该时间段没有录像
          </div>
        ) : null}
        {bands.map((band, index) => (
          <div
            key={`${band.start}-${band.end}-${index}`}
            className="absolute inset-y-1 rounded-sm bg-emerald-500/60"
            style={{ left: `${pct(band.start)}%`, width: `${Math.max(0.15, pct(band.end) - pct(band.start))}%` }}
            title={`${clock(band.start)} - ${clock(band.end)}`}
          />
        ))}
        {Array.from({ length: tickCount + 1 }).map((_, index) => {
          const t = windowStart + (span * index) / tickCount;
          return (
            <div key={index} className="absolute top-0 h-full" style={{ left: `${(index / tickCount) * 100}%` }}>
              <div className="h-1.5 w-px bg-white/25" />
              {index % (tickCount > 8 ? 2 : 1) === 0 ? (
                <span className="absolute top-1.5 -translate-x-1/2 whitespace-nowrap text-[9px] tabular-nums text-white/35">
                  {label(t)}
                </span>
              ) : null}
            </div>
          );
        })}
        <div
          className={cn(
            "pointer-events-none absolute inset-y-0 z-10 w-px bg-[var(--app-color-accent)]",
            dragging ? "" : "transition-[left] duration-150 ease-linear"
          )}
          style={{ left: `${pct(shown)}%` }}
        >
          <div className="absolute -left-[5px] top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-[var(--app-color-accent)] shadow" />
          <div className="absolute bottom-full left-1/2 mb-1 -translate-x-1/2 rounded bg-black/85 px-1.5 py-0.5 text-[10px] tabular-nums text-white">
            {clock(shown)}
          </div>
        </div>
      </div>
      <div className="mt-0.5 flex justify-between text-[9px] tabular-nums text-white/35">
        <span>{clock(windowStart).slice(0, 5)}</span>
        <span>{label(windowEnd)}</span>
      </div>
    </div>
  );
}

function CalendarGrid({
  month,
  onMonthChange,
  selected,
  maxDate,
  onSelect,
}: {
  month: Date;
  onMonthChange: (d: Date) => void;
  selected: string;
  maxDate: string;
  onSelect: (value: string) => void;
}) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstDay = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cells: Array<number | null> = [
    ...Array.from({ length: firstDay }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          className="rounded p-1 hover:bg-[var(--app-color-surface-hover)]"
          onClick={() => onMonthChange(new Date(year, monthIndex - 1, 1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium">
          {year} 年 {monthIndex + 1} 月
        </span>
        <button
          type="button"
          className="rounded p-1 hover:bg-[var(--app-color-surface-hover)]"
          onClick={() => onMonthChange(new Date(year, monthIndex + 1, 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-[var(--app-color-text-tertiary)]">
        {["日", "一", "二", "三", "四", "五", "六"].map((d) => (
          <span key={d} className="py-1">
            {d}
          </span>
        ))}
        {cells.map((day, index) => {
          if (day == null) return <span key={`empty-${index}`} />;
          const value = `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
          const disabled = value > maxDate;
          const active = value === selected;
          return (
            <button
              key={value}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(value)}
              className={cn(
                "h-8 rounded text-xs tabular-nums transition",
                active
                  ? "bg-[var(--app-color-accent)] font-medium text-white"
                  : disabled
                    ? "cursor-not-allowed text-[var(--app-color-text-tertiary)]/40"
                    : "hover:bg-[var(--app-color-surface-hover)]"
              )}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
