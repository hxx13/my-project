import { useState, useMemo, useRef, useEffect } from "react";
import { useSegments, useAnalysisRun, useCorrectSegment, useSpatialElements, ACTIVITY_COLORS, ACTIVITY_LABELS, type AgvActivitySegment } from "@/api/domains/agv-analysis.api";
import { Activity, Check, AlertTriangle } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

const ROBOTS = [
  { ip: "172.22.159.16", label: "AGV-1" },
  { ip: "172.22.159.18", label: "AGV-2" },
  { ip: "172.22.159.20", label: "AGV-3" },
  { ip: "172.22.159.22", label: "AGV-4" },
];

const ACTIVITY_TYPES = Object.keys(ACTIVITY_LABELS);

function fmtTime(iso: string) { return new Date(iso).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }); }
function fmtDuration(sec: number) {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
}

/** Format a Date as local-time ISO string: YYYY-MM-DDTHH:MM (no UTC conversion) */
function toLocalISO(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface Props {
  selectedRobot: string;
  onSelectRobot: (ip: string) => void;
  onJumpToZone?: (stationName: string) => void;
}

export default function AgvTimelineTab({ selectedRobot, onSelectRobot, onJumpToZone }: Props) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const [from, setFrom] = useState(toLocalISO(todayStart));
  const [to, setTo] = useState(toLocalISO(now));
  const [selectedSeg, setSelectedSeg] = useState<AgvActivitySegment | null>(null);
  const [correcting, setCorrecting] = useState(false);

  const { data: queriedSegments = [], isLoading, isError, error } = useSegments(selectedRobot, from + ":00", to + ":00");
  const { data: zones = [] } = useSpatialElements();
  const runAnalysis = useAnalysisRun();
  const correctMut = useCorrectSegment();

  // zoneId → 区域名 映射
  const zoneNameMap = useMemo(() => {
    const map: Record<number, string> = {};
    for (const z of zones) {
      if (z.id != null) map[z.id] = z.name;
    }
    return map;
  }, [zones]);

  // Local segment state: populated by mutation, cleared on param change
  const [segments, setSegments] = useState<AgvActivitySegment[]>([]);
  const paramKey = `${selectedRobot}|${from}|${to}`;
  const [lastParamKey, setLastParamKey] = useState(paramKey);

  // Clear segments when robot/time range changes
  useEffect(() => {
    if (paramKey !== lastParamKey) {
      setSegments([]);
      setLastParamKey(paramKey);
    }
  }, [paramKey, lastParamKey]);

  // Populate from mutation result
  useEffect(() => {
    if (runAnalysis.data && runAnalysis.data.length > 0) {
      setSegments(runAnalysis.data);
    }
  }, [runAnalysis.data]);

  // Fallback: also accept queried data if no mutation data yet
  useEffect(() => {
    if (segments.length === 0 && queriedSegments.length > 0 && !runAnalysis.data) {
      setSegments(queriedSegments);
    }
  }, [queriedSegments, segments.length, runAnalysis.data]);

  // Auto-run analysis on mount if no data
  useEffect(() => {
    if (segments.length === 0 && !isLoading && !runAnalysis.isPending) {
      runAnalysis.mutate({ robotIp: selectedRobot, from: from + ":00", to: to + ":00" });
    }
  }, [paramKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sort + merge consecutive same-type segments, drop sub-10s noise sandwiched by same type
  const sorted = useMemo(() => {
    const raw = [...segments].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    if (raw.length < 2) return raw;
    const merged: AgvActivitySegment[] = [];
    let cur = { ...raw[0] };
    for (let i = 1; i < raw.length; i++) {
      const next = raw[i];
      const gapSec = (new Date(next.startTime).getTime() - new Date(cur.endTime).getTime()) / 1000;
      if (cur.activityType === next.activityType && gapSec < 60) {
        // Merge: extend current segment
        cur = { ...cur, endTime: next.endTime, endX: next.endX, endY: next.endY,
          distanceM: (cur.distanceM ?? 0) + (next.distanceM ?? 0) };
      } else {
        // Only keep segments with meaningful duration (>10s) or significant distance
        const dur = (new Date(cur.endTime).getTime() - new Date(cur.startTime).getTime()) / 1000;
        if (dur > 10 || (cur.distanceM ?? 0) > 2) merged.push(cur);
        cur = { ...next };
      }
    }
    const lastDur = (new Date(cur.endTime).getTime() - new Date(cur.startTime).getTime()) / 1000;
    if (lastDur > 10 || (cur.distanceM ?? 0) > 2) merged.push(cur);
    return merged;
  }, [segments]);

  const totalSpan = useMemo(() => {
    if (sorted.length === 0) return 0;
    return new Date(sorted[sorted.length - 1].endTime).getTime() -
           new Date(sorted[0].startTime).getTime();
  }, [sorted]);

  const [hoveredSeg, setHoveredSeg] = useState<AgvActivitySegment | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const timelineRef = useRef<HTMLDivElement>(null);
  const MIN_PX_PER_SEC = 0.05;   // 最小缩放: 1h=180px
  const MAX_PX_PER_SEC = 2.0;    // 最大缩放: 1min=120px
  const ROW_H = 22;                     // 紧凑行高 (14行 × 22 = 308px)
  const RULER_H = 22;                  // 时间标尺高度
  const baseTs = sorted.length > 0 ? new Date(sorted[0].startTime).getTime() : 0;
  const LABEL_W = 52;

  // 自适应缩放: 窗口宽度内尽量容纳全部时间轴，超出下限则触发滚动条
  const [containerW, setContainerW] = useState(800);
  const containerWRef = useRef(800);
  useEffect(() => {
    const el = timelineRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const w = e.contentRect.width;
        // 宽度变化 < 2px 忽略，防止滚动条出现/消失导致的循环抖动
        if (Math.abs(w - containerWRef.current) >= 2) {
          containerWRef.current = w;
          setContainerW(w);
        }
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const availW = Math.max(containerW - LABEL_W - 20, 200);

  // ── Compressed layout: collapse gaps >30min into thin markers ──
  const GAP_MS = 30 * 60_000;
  const GAP_PX = 6;
  const compressedLayout = useMemo(() => {
    if (sorted.length === 0) {
      const autoPx = totalSpan > 0 ? availW / (totalSpan / 1000) : MAX_PX_PER_SEC;
      const pxPerSec = Math.max(MIN_PX_PER_SEC, Math.min(MAX_PX_PER_SEC, autoPx));
      const tp = totalSpan > 0 ? Math.max(totalSpan / 1000 * pxPerSec + LABEL_W, availW) : 0;
      return {
        leftPx: (t: string) => LABEL_W + (new Date(t).getTime() - baseTs) / 1000 * pxPerSec,
        widthPx: (s: string, e: string) => Math.max((new Date(e).getTime() - new Date(s).getTime()) / 1000 * pxPerSec, 3),
        totalPx: tp, useScroll: tp - LABEL_W > availW, gapBlocks: [] as { from: number; px: number }[],
      };
    }
    // Build blocks: active segments + gap markers
    type Block = { type: "active"|"gap"; from: number; to: number; displayPx: number };
    const blocks: Block[] = [];
    let cursor = new Date(sorted[0].startTime).getTime();
    for (let i = 0; i < sorted.length; i++) {
      const ss = new Date(sorted[i].startTime).getTime();
      const se = new Date(sorted[i].endTime).getTime();
      if (ss > cursor) {
        const gapMs = ss - cursor;
        blocks.push({ type: gapMs > GAP_MS ? "gap" : "active", from: cursor, to: ss, displayPx: gapMs > GAP_MS ? GAP_PX : 0 });
      }
      blocks.push({ type: "active", from: ss, to: se, displayPx: 0 });
      cursor = Math.max(cursor, se);
    }
    const totalGapPx = blocks.filter(b => b.type === "gap").reduce((s, b) => s + b.displayPx, 0);
    const remainingPx = Math.max(availW - totalGapPx, 20);
    const totalActiveMs = blocks.filter(b => b.type === "active").reduce((s, b) => s + (b.to - b.from), 0) || 1;
    for (const b of blocks) { if (b.type === "active") b.displayPx = (b.to - b.from) / totalActiveMs * remainingPx; }

    let cum = LABEL_W;
    const off: number[] = [];
    for (const b of blocks) { off.push(cum); cum += b.displayPx; }
    const tp = cum;

    const leftPxComp = (t: string): number => {
      const ts = new Date(t).getTime();
      for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        if (ts >= b.from && ts <= b.to) {
          if (b.type === "gap") return off[i] + b.displayPx / 2;
          return off[i] + ((ts - b.from) / (b.to - b.from || 1)) * b.displayPx;
        }
      }
      if (ts < blocks[0]?.from) return LABEL_W;
      return tp;
    };
    const widthPxComp = (s: string, e: string) => Math.max(leftPxComp(e) - leftPxComp(s), 3);

    const gapBlocks = blocks.filter(b => b.type === "gap").map((b, i) => ({
      from: b.from, px: off[blocks.indexOf(b)],
    }));

    return { leftPx: leftPxComp, widthPx: widthPxComp, totalPx: tp, useScroll: tp - LABEL_W > availW, gapBlocks };
  }, [sorted, availW, baseTs, totalSpan, containerW]);

  // Swimlane layout: 固定顺序显示全部活动类型（即使当前窗口无数据也显示空行）
  const ALL_ACTIVITY_TYPES = [
    "CHARGING", "CHARGING_COMPLETE", "STATION_WORK", "STATION_DWELL",
    "TRANSPORT", "NAVIGATING", "REVERSE_MANEUVER", "FORK_OPERATION",
    "PATH_WAIT", "REST_STATION", "BLOCKED_WAIT", "EMERGENCY_STOP",
    "RELOC_EVENT", "UNKNOWN_IDLE",
  ] as const;
  const activityTypes = ALL_ACTIVITY_TYPES as unknown as string[];

  return (
    <div className="flex flex-col flex-1 min-h-0 text-[11px]">
      {/* Controls */}
      <div className="shrink-0 space-y-2 px-1 pb-2 border-b border-[var(--app-color-border-default)]">
        <select value={selectedRobot} onChange={(e) => onSelectRobot(e.target.value)}
          className="w-full px-2 py-1.5 rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] text-[var(--app-color-text-primary)] text-[11px]">
          {ROBOTS.map(r => <option key={r.ip} value={r.ip}>{r.label} ({r.ip})</option>)}
        </select>
        <div className="flex gap-1.5">
          <input type="datetime-local" value={from} onChange={e => setFrom(e.target.value)}
            className="flex-1 px-1.5 py-1 rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] text-[var(--app-color-text-primary)] text-[10px]" />
          <input type="datetime-local" value={to} onChange={e => setTo(e.target.value)}
            className="flex-1 px-1.5 py-1 rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] text-[var(--app-color-text-primary)] text-[10px]" />
        </div>
        <button onClick={() => runAnalysis.mutate({ robotIp: selectedRobot, from: from + ":00", to: to + ":00" })}
          disabled={runAnalysis.isPending}
          className="w-full flex items-center justify-center gap-1 px-3 py-1.5 rounded-full bg-[var(--app-color-accent)] text-white text-[11px] font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
          <Activity size={12} /> {runAnalysis.isPending ? "分析中..." : "分析"}
        </button>
        {runAnalysis.isError && (
          <div className="text-[9px] text-red-500">分析失败: {runAnalysis.error?.message || "未知错误"}</div>
        )}
      </div>

      {/* Timeline — 固定顺序显示全部活动标签，高度自适应 */}
      <div className="overflow-auto flex flex-1 min-h-0" ref={timelineRef}
        style={{ overflowX: compressedLayout.useScroll ? "auto" : "hidden", scrollbarGutter: "stable" }}>
        {/* Sticky left label column — 始终显示 */}
        <div className="sticky left-0 z-10 shrink-0 bg-[var(--app-color-surface-container)] pr-1 border-r border-[var(--app-color-border-default)]" style={{ width: LABEL_W }}>
          <div style={{ height: RULER_H }} />
          {activityTypes.map((t) => (
            <div key={t} className="text-[9px] font-medium text-[var(--app-color-text-secondary)] truncate px-1"
              style={{ height: ROW_H, lineHeight: ROW_H + "px" }}>
              {ACTIVITY_LABELS[t] || t}
            </div>
          ))}
        </div>
        {/* Scrollable timeline area */}
        <div className="flex-1 min-w-0">
          {isLoading ? (
            <div className="text-center text-[var(--app-color-text-tertiary)] py-8">加载中...</div>
          ) : isError ? (
            <div className="text-center py-8 px-2">
              <AlertTriangle size={20} className="mx-auto mb-2 text-red-500" />
              <div className="text-[11px] text-red-500 font-medium mb-1">加载失败</div>
              <div className="text-[10px] text-[var(--app-color-text-tertiary)]">{error?.message || "未知错误"}</div>
            </div>
          ) : (
            <div className="relative" style={{ width: Math.max(compressedLayout.totalPx - LABEL_W, availW), height: activityTypes.length * ROW_H + RULER_H }}>
              {/* Time ruler with compressed gap markers */}
              {sorted.length > 0 && (
                <>
                  {/* Gap markers in ruler */}
                  {compressedLayout.gapBlocks.map((gap, i) => (
                    <div key={`gap-ruler-${i}`} className="absolute top-0 pointer-events-none"
                      style={{ left: gap.px - LABEL_W, width: GAP_PX, height: RULER_H,
                        background: "repeating-linear-gradient(-45deg, transparent, transparent 2px, rgba(239,68,68,0.2) 2px, rgba(239,68,68,0.2) 4px)" }}
                      title={`无活动 (${Math.round((gap.from) / 3600000)}h)`} />
                  ))}
                  {/* Time labels (deduped by unique compressed position) */}
                  {Array.from(new Map(
                    sorted.flatMap(s => [s.startTime, s.endTime])
                      .map(ts => {
                        const px = Math.round(compressedLayout.leftPx(ts));
                        return [px, ts] as const;
                      })
                      .filter(([px], i, arr) => i === 0 || px - arr[i - 1][0] >= 35)
                  )).map(([px, ts]) => (
                    <div key={ts} className="absolute top-0 text-[8px] whitespace-nowrap text-[var(--app-color-text-secondary)]"
                      style={{ left: px - LABEL_W }}>
                      <div className="w-px h-2 mb-0.5 bg-[var(--app-color-border-default)]" />
                      {new Date(ts).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  ))}
                </>
              )}
              {/* 固定行：每个活动类型一行，有数据的渲染段条 */}
              {activityTypes.map((t, ri) => (
                <div key={t} className="absolute left-0 right-0"
                  style={{ top: RULER_H + ri * ROW_H, height: ROW_H - 2 }}>
                  <div className="absolute inset-0 rounded-sm bg-[var(--app-color-surface-page)] opacity-50" />
                  {sorted.filter(s => s.activityType === t).map(seg => (
                    <div key={seg.id} className="absolute"
                      style={{ left: compressedLayout.leftPx(seg.startTime) - LABEL_W, width: Math.max(compressedLayout.widthPx(seg.startTime, seg.endTime), 4), height: "100%" }}>
                      <button
                        onClick={() => setSelectedSeg(selectedSeg?.id === seg.id ? null : seg)}
                        onMouseEnter={(e) => { setHoveredSeg(seg); const r = (e.target as HTMLElement).getBoundingClientRect(); setTooltipPos({ x: r.left + r.width / 2, y: r.top }); }}
                        onMouseLeave={() => setHoveredSeg(null)}
                        className="w-full h-full rounded-[3px] transition-opacity hover:opacity-80 flex items-center px-1 overflow-hidden"
                        style={{ backgroundColor: ACTIVITY_COLORS[seg.activityType] || "#d1d5db" }}>
                        <span className="text-[9px] text-white font-medium truncate leading-none">
                          {(() => {
                            const w = compressedLayout.widthPx(seg.startTime, seg.endTime);
                            const zoneLabel = seg.zoneId != null ? zoneNameMap[seg.zoneId] : "";
                            const actLabel = ACTIVITY_LABELS[seg.activityType] || seg.activityType;
                            if (w > 80 && zoneLabel) return zoneLabel + " · " + actLabel;
                            if (w > 40) return zoneLabel || actLabel;
                            if (w > 24 && zoneLabel) return zoneLabel;
                            return "";
                          })()}
                        </span>
                      </button>
                    </div>
                  ))}
                </div>
              ))}
              {sorted.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center text-[var(--app-color-text-tertiary)] text-[11px]">
                  暂无分析结果，点击"分析"开始
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Hover tooltip — inside timeline container, positioned relative to bar */}
      {hoveredSeg && !selectedSeg && (() => {
        const containerRect = timelineRef.current?.getBoundingClientRect();
        const x = containerRect ? tooltipPos.x - containerRect.left + (timelineRef.current?.scrollLeft ?? 0) : tooltipPos.x;
        return (
        <div className="absolute z-50 px-2 py-1.5 rounded-[var(--app-radius-element)] bg-[var(--app-color-text-primary)] text-white text-[10px] shadow-lg pointer-events-none"
          style={{ left: x - 80, top: -8, transform: "translateY(-100%)" }}>
          <div className="font-medium">
            {hoveredSeg.zoneId != null && zoneNameMap[hoveredSeg.zoneId] && (
              <span className="text-white/70 mr-1">{zoneNameMap[hoveredSeg.zoneId]}</span>
            )}
            {ACTIVITY_LABELS[hoveredSeg.activityType] || hoveredSeg.activityType}
          </div>
          <div className="text-white/70 mt-0.5">
            {fmtTime(hoveredSeg.startTime)} → {fmtTime(hoveredSeg.endTime)}
          </div>
          <div className="text-white/70">
            时长 {fmtDuration(Math.round((new Date(hoveredSeg.endTime).getTime() - new Date(hoveredSeg.startTime).getTime()) / 1000))}
            {hoveredSeg.distanceM != null ? ` · ${hoveredSeg.distanceM}m` : ""}
          </div>
        </div>
      )})()}

      {/* Detail bar — compact, adaptive height */}
      <AnimatePresence>
        {selectedSeg && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="shrink-0 border-t border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] overflow-hidden"
          >
            <div className="px-3 py-2 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ACTIVITY_COLORS[selectedSeg.activityType] || "#d1d5db" }} />
                  {selectedSeg.zoneId != null && zoneNameMap[selectedSeg.zoneId] && (
                    <span className="text-[var(--app-color-accent)]">{zoneNameMap[selectedSeg.zoneId]}</span>
                  )}
                  {ACTIVITY_LABELS[selectedSeg.activityType] || selectedSeg.activityType}
                </span>
                <button onClick={() => setSelectedSeg(null)} className="text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-text-primary)]">×</button>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] text-[var(--app-color-text-secondary)]">
                <span>{fmtTime(selectedSeg.startTime)} → {fmtTime(selectedSeg.endTime)}</span>
                <span>{fmtDuration(Math.round((new Date(selectedSeg.endTime).getTime() - new Date(selectedSeg.startTime).getTime()) / 1000))}</span>
                {selectedSeg.distanceM != null && <span>{selectedSeg.distanceM}m</span>}
                <span>置信度 {(selectedSeg.confidence * 100).toFixed(0)}%</span>
              </div>
              {!correcting ? (
                <button onClick={() => setCorrecting(true)} className="text-[10px] text-[var(--app-color-accent)] hover:underline">纠正标注</button>
              ) : (
                <div className="flex gap-1">
                  <select onChange={(e) => { if (e.target.value) { correctMut.mutate({ id: selectedSeg.id, type: e.target.value }); setCorrecting(false); setSelectedSeg(null); } }}
                    className="px-1.5 py-1 rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] text-[10px]">
                    <option value="">选择正确类型...</option>
                    {ACTIVITY_TYPES.map(t => <option key={t} value={t}>{ACTIVITY_LABELS[t]}</option>)}
                  </select>
                  <button onClick={() => setCorrecting(false)} className="px-2 py-1 text-[10px] text-[var(--app-color-text-tertiary)]">取消</button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
