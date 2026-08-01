import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Play, Pause, X, Loader2 } from "lucide-react";
import { fetchSegments, runAnalysis, ACTIVITY_COLORS, ACTIVITY_LABELS, type AgvActivitySegment } from "@/api/domains/agv-analysis.api";
import type { HistoryPlaybackResponse } from "@/api/domains/agv.api";

interface Props {
  ip: string;
  playbackActive: boolean;
  playbackData: HistoryPlaybackResponse | null;
  playbackPlaying: boolean;
  playbackProgress: number;
  playbackSpeed: number;
  playbackLoading: boolean;
  onStartPlayback: (ip: string, from: string, to: string, autoPlay?: boolean) => void;
  onClearPlayback: () => void;
  onStopPlayback?: () => void;
  onPlaybackPlay: () => void;
  onPlaybackPause: () => void;
  onPlaybackProgress: (p: number) => void;
  onPlaybackSpeed: (s: number) => void;
}

const MAX_WINDOW_MS = 2 * 3600 * 1000; // 最大回放窗口：2小时
const BAR_H = 64;        // timeline bar height
const HANDLE_W = 6;      // selection handle width

function pad(n: number) { return String(n).padStart(2, "0"); }
function fmtHM(ms: number) {
  const t = new Date(ms);
  return `${pad(t.getHours())}:${pad(t.getMinutes())}`;
}

export default function AgvPlaybackTimeline(props: Props) {
  const {
    ip, playbackActive, playbackData, playbackPlaying, playbackProgress,
    playbackSpeed, playbackLoading,
    onStartPlayback, onClearPlayback, onStopPlayback, onPlaybackPlay, onPlaybackPause,
    onPlaybackProgress, onPlaybackSpeed,
  } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(800);
  const [daySegments, setDaySegments] = useState<AgvActivitySegment[]>([]);
  const [segmentsLoading, setSegmentsLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  // ── Gap threshold (also used in compressed layout) ──
  const GAP_THRESHOLD_MS = 30 * 60 * 1000; // 30min+ = gap

  // ── View date navigation ──
  const todayStart = useMemo(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
  }, []);
  const [viewDate, setViewDate] = useState(todayStart);
  const viewDateEnd = viewDate + 24 * 3600_000;
  const fmtDate = (ts: number) => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  // ── Time bounds: 掐头去尾 — 以首个/末个事件为界，无事件时用当天 ──
  const timeBounds = useMemo(() => {
    if (daySegments.length > 0) {
      const sorted = [...daySegments].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
      const first = new Date(sorted[0].startTime).getTime();
      const last = new Date(sorted[sorted.length - 1].endTime).getTime();
      const padMs = Math.max((last - first) * 0.05, 60_000); // 5% padding or 1min
      return { start: first - padMs, end: last + padMs };
    }
    return { start: viewDate, end: viewDateEnd };
  }, [daySegments, viewDate, viewDateEnd]);

  // ── Selection window (ms since epoch), initialized later via effect ──
  const [selStart, setSelStart] = useState(timeBounds.start);
  const [selEnd, setSelEnd] = useState(Math.min(timeBounds.start + MAX_WINDOW_MS, timeBounds.end));

  // 数据加载后居中到视觉中点（而非时间中点）
  const selInitRef = useRef(false);
  useEffect(() => {
    if (daySegments.length === 0 || compressed.totalPx <= 0) return;
    const centerTs = compressed.fromPx(compressed.totalPx / 2);
    const start = Math.max(centerTs - MAX_WINDOW_MS / 2, timeBounds.start);
    const end = Math.min(centerTs + MAX_WINDOW_MS / 2, timeBounds.end);
    setSelStart(start);
    setSelEnd(end);
    selInitRef.current = true;
  }, [daySegments]); // eslint-disable-line react-hooks/exhaustive-deps

  // 时间边界变化时重新居中
  useEffect(() => {
    if (!selInitRef.current) return;
    const centerTs = compressed.fromPx(compressed.totalPx / 2);
    setSelStart(Math.max(centerTs - MAX_WINDOW_MS / 2, timeBounds.start));
    setSelEnd(Math.min(centerTs + MAX_WINDOW_MS / 2, timeBounds.end));
  }, [timeBounds.start, timeBounds.end]); // eslint-disable-line react-hooks/exhaustive-deps
  const [dragging, setDragging] = useState<"left" | "right" | "body" | "progress" | null>(null);
  const dragRef = useRef({ startX: 0, startSelStart: 0, startSelEnd: 0, startProgress: 0, startSelLeftPx: 0, startSelRightPx: 0 });

  // ── Fetch segments for viewDate, auto-analyze if empty ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setSegmentsLoading(true);
      const from = new Date(viewDate).toISOString();
      const to = new Date(viewDateEnd).toISOString();
      try {
        let segs = await fetchSegments(ip, from, to);
        if (!cancelled) { setDaySegments(segs); setSegmentsLoading(false); }
        // 无数据 → 自动触发分析
        if (segs.length === 0 && !cancelled) {
          setAnalyzing(true);
          try {
            const analyzed = await runAnalysis({ robotIp: ip, from, to });
            if (!cancelled) setDaySegments(analyzed);
          } catch {} finally {
            if (!cancelled) setAnalyzing(false);
          }
        }
      } catch {
        if (!cancelled) setSegmentsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [ip, viewDate]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── ResizeObserver ──
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setContainerW(e.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Compressed pixel mapping: gaps collapsed to thin markers ──
  const GAP_DISPLAY_PX = 6;
  const dayPx = containerW - 20;

  const compressed = useMemo(() => {
    if (daySegments.length === 0) {
      // Fallback: linear mapping
      const r = timeBounds.end - timeBounds.start || 1;
      return {
        toPx: (ts: number) => (ts - timeBounds.start) / r * dayPx + 10,
        fromPx: (px: number) => timeBounds.start + (px - 10) / dayPx * r,
        pxPerMs: dayPx / r,
        totalPx: dayPx + 20,
        gapBlocks: [] as { from: number; to: number; px: number; w: number }[],
      };
    }
    const sorted = [...daySegments].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    const blocks: { type: "active"|"gap"; from: number; to: number; displayPx: number }[] = [];

    let cursor = timeBounds.start;
    for (const seg of sorted) {
      const ss = new Date(seg.startTime).getTime();
      const se = new Date(seg.endTime).getTime();
      if (ss > cursor) {
        const gapMs = ss - cursor;
        if (gapMs > GAP_THRESHOLD_MS) blocks.push({ type: "gap", from: cursor, to: ss, displayPx: GAP_DISPLAY_PX });
        else blocks.push({ type: "active", from: cursor, to: ss, displayPx: 0 });
      }
      blocks.push({ type: "active", from: ss, to: se, displayPx: 0 });
      cursor = Math.max(cursor, se);
    }
    if (timeBounds.end > cursor) {
      const tailMs = timeBounds.end - cursor;
      if (tailMs > GAP_THRESHOLD_MS) blocks.push({ type: "gap", from: cursor, to: timeBounds.end, displayPx: GAP_DISPLAY_PX });
      else blocks.push({ type: "active", from: cursor, to: timeBounds.end, displayPx: 0 });
    }

    const totalGapPx = blocks.filter(b => b.type === "gap").reduce((s, b) => s + b.displayPx, 0);
    const remainingPx = Math.max(dayPx - totalGapPx, 20);
    const totalActiveMs = blocks.filter(b => b.type === "active").reduce((s, b) => s + (b.to - b.from), 0) || 1;
    for (const b of blocks) { if (b.type === "active") b.displayPx = (b.to - b.from) / totalActiveMs * remainingPx; }

    // Cumulative offsets
    let cum = 10;
    const off: number[] = [];
    for (const b of blocks) { off.push(cum); cum += b.displayPx; }

    const toPxComp = (ts: number): number => {
      for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        if (ts >= b.from && ts <= b.to) {
          if (b.type === "gap") return off[i] + b.displayPx / 2;
          return off[i] + ((ts - b.from) / (b.to - b.from || 1)) * b.displayPx;
        }
      }
      if (ts < blocks[0]?.from) return 10;
      return 10 + dayPx;
    };

    // Inverse mapping: pixel → timestamp (true inverse of toPx)
    const fromPxComp = (px: number): number => {
      for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        const blockStart = off[i];
        const blockEnd = off[i] + b.displayPx;
        if (px >= blockStart && px <= blockEnd) {
          // Linear interpolation for both active and gap blocks —
          // gaps are 6px wide but span large time ranges; interpolating
          // across those 6px prevents the drag from feeling "stuck".
          const frac = (px - blockStart) / (b.displayPx || 1);
          return b.from + frac * (b.to - b.from);
        }
      }
      if (px < (blocks[0] ? off[0] : 10)) return timeBounds.start;
      return timeBounds.end;
    };

    // compressed.pxPerMs for drag: use avg over active time only (fallback for progress scrubber)
    const avgPxPerMs = remainingPx / totalActiveMs;

    const gapBlocks = blocks.filter(b => b.type === "gap").map((b, i) => ({
      from: b.from, to: b.to, px: off[blocks.indexOf(b)], w: b.displayPx,
    }));

    return { toPx: toPxComp, fromPx: fromPxComp, pxPerMs: avgPxPerMs, totalPx: cum, gapBlocks };
  }, [daySegments, timeBounds, dayPx]);

  // Clamp selection within bounds, max window 2h
  const clampSel = useCallback((start: number, end: number) => {
    let s = Math.max(start, timeBounds.start);
    let e = Math.min(end, timeBounds.end);
    if (e - s > MAX_WINDOW_MS) {
      if (s === timeBounds.start) e = s + MAX_WINDOW_MS;
      else s = e - MAX_WINDOW_MS;
    }
    // Enforce min 1s
    if (e - s < 1000) e = Math.min(s + 1000, timeBounds.end);
    return { start: s, end: e };
  }, [timeBounds.start, timeBounds.end]);

  // ── Pointer handlers ──
  const onPointerDown = (part: "left" | "right" | "body" | "progress", e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(part);
    dragRef.current = { startX: e.clientX, startSelStart: selStart, startSelEnd: selEnd, startProgress: playbackProgress, startSelLeftPx: compressed.toPx(selStart), startSelRightPx: compressed.toPx(selEnd) };
  };

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      const pixelDelta = e.clientX - dragRef.current.startX;
      const { startSelStart: s, startSelEnd: en, startProgress: sp, startSelLeftPx, startSelRightPx } = dragRef.current;
      if (dragging === "progress") {
        if (playbackData) {
          const winMs = en - s;
          if (winMs > 0) {
            const dp = pixelDelta / compressed.pxPerMs / winMs;
            onPlaybackProgress(Math.min(1, Math.max(0, sp + dp)));
          }
        }
      } else if (dragging === "body") {
        // Position-based: track absolute pixel → timestamp via fromPx inverse
        const newLeftPx = startSelLeftPx + pixelDelta;
        const newRightPx = startSelRightPx + pixelDelta;
        let ns = compressed.fromPx(newLeftPx);
        let ne = compressed.fromPx(newRightPx);
        const dur = en - s;
        ns = Math.max(timeBounds.start, Math.min(ns, timeBounds.end - dur));
        ne = Math.min(timeBounds.end, Math.max(ne, timeBounds.start + dur));
        if (ne - ns < 1000) ne = Math.min(ns + 1000, timeBounds.end);
        setSelStart(ns); setSelEnd(ne);
      } else if (dragging === "left") {
        // Position-based: pixel → timestamp via fromPx, then clamp
        const newPx = startSelLeftPx + pixelDelta;
        const newTs = compressed.fromPx(newPx);
        setSelStart(clampSel(newTs, en).start);
      } else if (dragging === "right") {
        const newPx = startSelRightPx + pixelDelta;
        const newTs = compressed.fromPx(newPx);
        setSelEnd(clampSel(s, newTs).end);
      }
    };
    const onUp = () => setDragging(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
  }, [dragging, compressed, clampSel, timeBounds.start, timeBounds.end, playbackData, onPlaybackProgress]);

  // ── Confirm selection → load + auto-play ──
  const handleConfirm = () => {
    const from = new Date(selStart).toISOString();
    const to = new Date(selEnd).toISOString();
    onStartPlayback(ip, from, to, true); // autoPlay: load完成后自动播放
  };

  // Clamp display positions
  const selLeft = Math.max(10, compressed.toPx(selStart));
  const selRight = Math.min(10 + dayPx, compressed.toPx(selEnd));
  const selW = Math.max(20, selRight - selLeft);

  const nowPx = compressed.toPx(Date.now());

  return (
    <div ref={containerRef} className="w-full select-none flex flex-col gap-1">

      {/* ── Playback mode: compact scrubber bar only ── */}
      {playbackActive && playbackData && (
      <div className="flex items-center justify-center gap-2 px-2 py-1 bg-[var(--app-color-surface-container)] rounded-lg border border-[var(--app-color-accent)]/30 shadow-sm">
        {/* Play/Pause */}
        <button onClick={playbackPlaying ? onPlaybackPause : onPlaybackPlay}
          className="w-5 h-5 rounded-full bg-white border-2 border-[var(--app-color-accent)] text-[var(--app-color-accent)] flex items-center justify-center shadow-sm hover:bg-[var(--app-color-accent-soft)] shrink-0 transition-colors">
          {playbackPlaying ? <Pause size={10} /> : <Play size={10} className="ml-0.5" />}
        </button>

        {/* Scrubber */}
        <div className="relative h-5 bg-[var(--app-color-surface-page)] rounded-full border border-[var(--app-color-border-default)] cursor-pointer overflow-hidden shadow-inner"
          style={{ width: "clamp(140px, 50%, 400px)" }}
          onPointerDown={e => {
            const rect = e.currentTarget.getBoundingClientRect();
            const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            onPlaybackProgress(frac);
            e.currentTarget.setPointerCapture(e.pointerId);
            const onMove2 = (ev: PointerEvent) => {
              const el = e.currentTarget as HTMLElement | null;
              if (!el) return;
              const r = el.getBoundingClientRect();
              onPlaybackProgress(Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)));
            };
            const onUp2 = () => {
              const el = e.currentTarget as HTMLElement | null;
              if (el) el.releasePointerCapture(e.pointerId);
              window.removeEventListener("pointermove", onMove2);
              window.removeEventListener("pointerup", onUp2);
            };
            window.addEventListener("pointermove", onMove2);
            window.addEventListener("pointerup", onUp2);
          }}>
          {/* Fill */}
          <div className="absolute top-0 left-0 h-full bg-gradient-to-r from-[var(--app-color-accent)]/40 to-[var(--app-color-accent)]/60 rounded-full"
            style={{ width: `${(playbackProgress ?? 0) * 100}%` }} />
          {/* Knob */}
          <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 -translate-x-1.5 rounded-full bg-[var(--app-color-accent)] border-2 border-white shadow-md ring-1 ring-[var(--app-color-accent)]/30"
            style={{ left: `${(playbackProgress ?? 0) * 100}%` }} />
        </div>

        {/* Time */}
        <span className="text-[10px] font-semibold text-[var(--app-color-accent)] tabular-nums whitespace-nowrap shrink-0 min-w-[38px]">
          {fmtHM(new Date(playbackData.from).getTime() + (new Date(playbackData.to).getTime() - new Date(playbackData.from).getTime()) * playbackProgress)}
        </span>

        {/* Speed */}
        <select value={playbackSpeed} onChange={e => onPlaybackSpeed(parseFloat(e.target.value))}
          className="px-1 h-5 rounded text-[9px] bg-[var(--app-color-surface-container)] border border-[var(--app-color-border-default)] text-[var(--app-color-text-primary)] shrink-0">
          {[0.5, 1, 2, 4, 8].map(s => <option key={s} value={s}>{s}×</option>)}
        </select>

        {/* REC */}
        <span className="flex items-center gap-0.5 text-[9px] text-red-500 font-bold shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />回放
        </span>

        {/* Close */}
        <button onClick={onStopPlayback || onClearPlayback}
          className="p-1 rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors shrink-0 shadow-sm">
          <X size={14} />
        </button>
      </div>
      )}

      {/* ── Non-playback mode: full timeline with date picker ── */}
      {!playbackActive && (
      <>
      {/* Date picker */}
      <div className="flex items-center justify-center">
        <input type="date" value={fmtDate(viewDate)}
          max={fmtDate(todayStart)}
          onChange={e => {
            const ts = new Date(e.target.value + "T00:00:00").getTime();
            if (!isNaN(ts)) setViewDate(ts);
          }}
          className="px-3 py-1 rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] text-[var(--app-color-text-primary)] text-xs font-medium text-center cursor-pointer hover:border-[var(--app-color-accent)] focus:border-[var(--app-color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--app-color-accent)] transition-colors" />
      </div>

      {/* ── Timeline bar ── */}
      <div className="relative bg-[var(--app-color-surface-page)] rounded-lg border border-[var(--app-color-border-default)]"
        style={{ height: BAR_H, overflow: "visible" }}>
        {/* Time tick markers — adaptive step + minor ticks */}
        {(() => {
          const rMs = timeBounds.end - timeBounds.start;
          const tickMs = rMs > 6 * 3600_000 ? 1800_000 : rMs > 2 * 3600_000 ? 600_000 : 300_000;
          const minorMs = tickMs / 2; // half-step minor tick
          const labels: { ts: number; minor: boolean }[] = [];
          // Major ticks with labels
          let t = Math.ceil(timeBounds.start / tickMs) * tickMs;
          while (t <= timeBounds.end) { labels.push({ ts: t, minor: false }); t += tickMs; }
          // Minor ticks (no label, shorter line)
          t = Math.ceil(timeBounds.start / minorMs) * minorMs;
          while (t <= timeBounds.end) {
            if (t % tickMs !== 0) labels.push({ ts: t, minor: true });
            t += minorMs;
          }
          return labels.map(({ ts, minor }) => {
            const px = compressed.toPx(ts);
            const d = new Date(ts);
            return (
              <div key={ts} className="absolute top-0 h-full" style={{ left: px }}>
                <div className={`absolute top-0 w-px ${minor ? "h-1 bg-[var(--app-color-border-default)]/50" : "h-1.5 bg-[var(--app-color-border-default)]"}`} />
                {!minor && (
                  <span className="absolute top-1.5 left-0 -translate-x-1/2 text-[7px] font-medium text-[var(--app-color-text-tertiary)] whitespace-nowrap">
                    {`${pad(d.getHours())}:${pad(d.getMinutes())}`}
                  </span>
                )}
              </div>
            );
          });
        })()}

        {/* Activity segments + gap markers (clipped to bar) */}
        <div className="absolute inset-0 overflow-hidden rounded-lg pointer-events-none">
        {/* Gap markers — compressed to thin strips */}
        {compressed.gapBlocks.map((gap, i) => (
          <div key={`gap-${i}`} className="absolute pointer-events-auto"
            style={{ left: gap.px - 0.5, width: gap.w + 1, top: 20, height: BAR_H - 24,
              background: `repeating-linear-gradient(-45deg, transparent, transparent 2px, rgba(239,68,68,0.25) 2px, rgba(239,68,68,0.25) 4px)`,
              borderLeft: "1px solid rgba(239,68,68,0.4)", borderRight: "1px solid rgba(239,68,68,0.4)" }}
            title={`无活动 ${fmtHM(gap.from)} → ${fmtHM(gap.to)}`} />
        ))}
        {/* Activity segments */}
        {daySegments.map(seg => {
          const sx = compressed.toPx(new Date(seg.startTime).getTime());
          const ex = compressed.toPx(new Date(seg.endTime).getTime());
          const w = Math.max(2, ex - sx);
          const segColor = ACTIVITY_COLORS[seg.activityType] || "#9ca3af";
          return (
            <div key={seg.id} className="absolute rounded-sm opacity-70 hover:opacity-100 transition-opacity pointer-events-auto"
              style={{ left: sx, width: w, top: 20, height: BAR_H - 24, backgroundColor: segColor }}
              title={`${ACTIVITY_LABELS[seg.activityType] || seg.activityType}\n${fmtHM(new Date(seg.startTime).getTime())} → ${fmtHM(new Date(seg.endTime).getTime())}`}
            />
          );
        })}
        </div>

        {/* Now indicator */}
        {nowPx >= 10 && nowPx <= 10 + dayPx && (
          <div className="absolute top-0 h-full z-10 pointer-events-none" style={{ left: nowPx }}>
            <div className="absolute top-0 w-0.5 h-full bg-red-500 opacity-60" />
            <div className="absolute top-0 left-0 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-red-500" />
          </div>
        )}

        {/* Selection window (idle only; hidden during playback) */}
        {!playbackActive && (
        <div className="absolute top-0 h-full border border-[var(--app-color-accent)]/50 z-10"
          style={{ left: selLeft, width: selW }}>
          <div className="absolute inset-0 cursor-grab active:cursor-grabbing bg-[var(--app-color-accent)]/12"
            onPointerDown={e => onPointerDown("body", e)} />
          {/* Left anchor pin */}
          <div className="absolute -left-2 top-0 w-5 h-full flex flex-col items-center cursor-ew-resize z-10"
            onPointerDown={e => onPointerDown("left", e)}>
            <div className="w-3 h-3 rounded-full bg-[var(--app-color-accent)] border-2 border-white shadow mt-0.5" />
            <div className="w-0.5 flex-1 bg-[var(--app-color-accent)]" />
            <div className="w-3 h-3 rounded-full bg-[var(--app-color-accent)] border-2 border-white shadow mb-0.5" />
          </div>
          {/* Right anchor pin */}
          <div className="absolute -right-2 top-0 w-5 h-full flex flex-col items-center cursor-ew-resize z-10"
            onPointerDown={e => onPointerDown("right", e)}>
            <div className="w-3 h-3 rounded-full bg-[var(--app-color-accent)] border-2 border-white shadow mt-0.5" />
            <div className="w-0.5 flex-1 bg-[var(--app-color-accent)]" />
            <div className="w-3 h-3 rounded-full bg-[var(--app-color-accent)] border-2 border-white shadow mb-0.5" />
          </div>
          <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] font-bold text-[var(--app-color-accent)] whitespace-nowrap pointer-events-none select-none">
            {`${fmtHM(selStart)} → ${fmtHM(selEnd)}`}
          </span>
        </div>
        )}
      </div>

      {/* ── Control row ── */}
      <div className="flex items-center gap-1.5">
        {playbackActive ? (
          <span className="text-[9px] text-[var(--app-color-text-tertiary)]">
            {playbackData ? `${playbackData.totalPoints} 个轨迹点` : ""}
          </span>
        ) : (
          <>
            {segmentsLoading ? (
              <span className="flex items-center gap-1 text-[10px] text-[var(--app-color-text-tertiary)]">
                <Loader2 size={10} className="animate-spin" />加载事件...
              </span>
            ) : analyzing ? (
              <span className="flex items-center gap-1 text-[10px] text-[var(--app-color-accent)]">
                <Loader2 size={10} className="animate-spin" />正在分析行为数据...
              </span>
            ) : (
              <span className="text-[9px] text-[var(--app-color-text-tertiary)]">
                {daySegments.length} 个活动段 · 最长2小时
              </span>
            )}
            <button onClick={handleConfirm} disabled={playbackLoading}
              className="ml-auto px-3 py-1 rounded-full bg-[var(--app-color-accent)] text-white text-[10px] font-medium hover:opacity-90 disabled:opacity-40 transition-opacity">
              {playbackLoading ? "加载中..." : "确认"}
            </button>
          </>
        )}
      </div>
      </>
      )}
    </div>
  );
}
