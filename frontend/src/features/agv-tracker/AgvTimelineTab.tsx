import { useState, useMemo, useRef, useEffect } from "react";
import { useSegments, useAnalysisRun, useCorrectSegment, ACTIVITY_COLORS, ACTIVITY_LABELS, type AgvActivitySegment } from "@/api/domains/agv-analysis.api";
import { Activity, Check, AlertTriangle } from "lucide-react";

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
  const runAnalysis = useAnalysisRun();
  const correctMut = useCorrectSegment();

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

  // Sort by startTime ascending (API may not guarantee order)
  const sorted = useMemo(() => [...segments].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()), [segments]);

  const totalSpan = useMemo(() => {
    if (sorted.length === 0) return 0;
    return new Date(sorted[sorted.length - 1].endTime).getTime() -
           new Date(sorted[0].startTime).getTime();
  }, [sorted]);

  const [hoveredSeg, setHoveredSeg] = useState<AgvActivitySegment | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const timelineRef = useRef<HTMLDivElement>(null);
  const PX_PER_SEC = 0.3;
  const ROW_H = 30;
  const baseTs = sorted.length > 0 ? new Date(sorted[0].startTime).getTime() : 0;
  const LABEL_W = 52;
  const totalPx = totalSpan > 0 ? Math.max(totalSpan / 1000 * PX_PER_SEC + LABEL_W, 200) : 0;
  const leftPx = (t: string) => LABEL_W + (new Date(t).getTime() - baseTs) / 1000 * PX_PER_SEC;
  const widthPx = (start: string, end: string) => Math.max((new Date(end).getTime() - new Date(start).getTime()) / 1000 * PX_PER_SEC, 3);

  // Swimlane layout: each activity type gets its own row
  const activityTypes = useMemo(() => [...new Set(sorted.map(s => s.activityType))], [sorted]);

  return (
    <div className="flex flex-col h-full text-[11px]">
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

      {/* Timeline — horizontal scroll, sticky labels */}
      <div className="flex-1 overflow-auto mt-2 flex" ref={timelineRef}>
        {/* Sticky left label column */}
        {sorted.length > 0 && (
          <div className="sticky left-0 z-10 shrink-0 bg-[var(--app-color-surface-container)] pr-1 border-r border-[var(--app-color-border-default)]" style={{ width: LABEL_W }}>
            <div style={{ height: 18 }} />
            {activityTypes.map((t, i) => (
              <div key={t} className="text-[9px] font-medium text-[var(--app-color-text-secondary)] truncate px-1"
                style={{ height: ROW_H, lineHeight: ROW_H + "px" }}>
                {ACTIVITY_LABELS[t] || t}
              </div>
            ))}
          </div>
        )}
        {/* Scrollable timeline area */}
        <div className="flex-1 min-w-0">
          {sorted.length === 0 ? (
            isLoading ? (
              <div className="text-center text-[var(--app-color-text-tertiary)] py-8">加载中...</div>
            ) : isError ? (
              <div className="text-center py-8 px-2">
                <AlertTriangle size={20} className="mx-auto mb-2 text-red-500" />
                <div className="text-[11px] text-red-500 font-medium mb-1">加载失败</div>
                <div className="text-[10px] text-[var(--app-color-text-tertiary)]">{error?.message || "未知错误"}</div>
              </div>
            ) : (
              <div className="text-center text-[var(--app-color-text-tertiary)] py-8">暂无分析结果。<br />点击"分析"开始。</div>
            )
          ) : (
            <div className="relative" style={{ width: totalPx - LABEL_W, minHeight: activityTypes.length * ROW_H + 20 }}>
              {/* Time ruler */}
              {Array.from({ length: Math.ceil(totalSpan / 1000 / 600) + 1 }, (_, i) => {
                const tickTs = baseTs + i * 600_000;
                return (
                  <div key={i} className="absolute top-0 text-[8px] text-[var(--app-color-text-tertiary)]"
                    style={{ left: (tickTs - baseTs) / 1000 * PX_PER_SEC }}>
                    {new Date(tickTs).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                  </div>
                );
              })}
              {/* Row backgrounds + segment bars */}
              {activityTypes.map((t, ri) => (
                <div key={t} className="absolute left-0 right-0"
                  style={{ top: 18 + ri * ROW_H, height: ROW_H - 2 }}>
                  {/* Subtle row stripe */}
                  <div className="absolute inset-0 rounded-sm bg-[var(--app-color-surface-page)] opacity-50" />
                  {sorted.filter(s => s.activityType === t).map(seg => (
                    <div key={seg.id} className="absolute"
                      style={{ left: leftPx(seg.startTime) - LABEL_W, width: Math.max(widthPx(seg.startTime, seg.endTime), 4), height: "100%" }}>
                      <button
                        onClick={() => setSelectedSeg(selectedSeg?.id === seg.id ? null : seg)}
                        onMouseEnter={(e) => { setHoveredSeg(seg); const r = (e.target as HTMLElement).getBoundingClientRect(); setTooltipPos({ x: r.left + r.width / 2, y: r.top }); }}
                        onMouseLeave={() => setHoveredSeg(null)}
                        className="w-full h-full rounded-[3px] transition-opacity hover:opacity-80 flex items-center px-1 overflow-hidden"
                        style={{ backgroundColor: ACTIVITY_COLORS[seg.activityType] || "#d1d5db" }}>
                        <span className="text-[9px] text-white font-medium truncate leading-none">
                          {widthPx(seg.startTime, seg.endTime) > 40 ? ACTIVITY_LABELS[seg.activityType] || seg.activityType : ""}
                        </span>
                      </button>
                    </div>
                  ))}
                </div>
              ))}
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
          <div className="font-medium">{ACTIVITY_LABELS[hoveredSeg.activityType] || hoveredSeg.activityType}</div>
          <div className="text-white/70 mt-0.5">
            {fmtTime(hoveredSeg.startTime)} → {fmtTime(hoveredSeg.endTime)}
          </div>
          <div className="text-white/70">
            时长 {fmtDuration(Math.round((new Date(hoveredSeg.endTime).getTime() - new Date(hoveredSeg.startTime).getTime()) / 1000))}
            {hoveredSeg.distanceM != null ? ` · ${hoveredSeg.distanceM}m` : ""}
          </div>
        </div>
      )})()}

      {/* Detail popover */}
      {selectedSeg && (
        <div className="shrink-0 border-t border-[var(--app-color-border-default)] p-2 space-y-1.5 bg-[var(--app-color-surface-container)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ACTIVITY_COLORS[selectedSeg.activityType] || "#d1d5db" }} />
              {ACTIVITY_LABELS[selectedSeg.activityType] || selectedSeg.activityType}
            </span>
            <span className="text-[9px] text-[var(--app-color-text-tertiary)]">
              置信度 {(selectedSeg.confidence * 100).toFixed(0)}%
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1 text-[10px] text-[var(--app-color-text-secondary)]">
            <span>开始: {fmtTime(selectedSeg.startTime)}</span>
            <span>结束: {fmtTime(selectedSeg.endTime)}</span>
            <span>时长: {fmtDuration(
              Math.round((new Date(selectedSeg.endTime).getTime() - new Date(selectedSeg.startTime).getTime()) / 1000)
            )}</span>
            {selectedSeg.distanceM != null && <span>距离: {selectedSeg.distanceM}m</span>}
            {selectedSeg.batteryDelta != null && <span>电量变化: {(selectedSeg.batteryDelta * 100).toFixed(1)}%</span>}
            <span>来源: {selectedSeg.source === "AUTO" ? "自动" : selectedSeg.source === "CORRECTED" ? "已纠正" : "手动"}</span>
            {selectedSeg.avgX != null && <span>坐标: ({selectedSeg.avgX?.toFixed(1)}, {selectedSeg.avgY?.toFixed(1)})</span>}
          </div>
          {/* Correction UI */}
          {correctMut.isError && (
            <div className="text-[9px] text-red-500">纠正失败: {correctMut.error?.message || "未知错误"}</div>
          )}
          {correcting ? (
            <div className="flex gap-1">
              <select onChange={(e) => {
                if (e.target.value) {
                  correctMut.mutate({ id: selectedSeg.id, type: e.target.value });
                  setCorrecting(false); setSelectedSeg(null);
                }
              }} className="flex-1 px-1.5 py-1 rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] text-[10px]">
                <option value="">选择正确类型...</option>
                {ACTIVITY_TYPES.map(t => (
                  <option key={t} value={t}>{ACTIVITY_LABELS[t]}</option>
                ))}
              </select>
              <button onClick={() => setCorrecting(false)}
                className="px-2 py-1 text-[10px] text-[var(--app-color-text-tertiary)]">取消</button>
            </div>
          ) : (
            <button onClick={() => setCorrecting(true)}
              className="text-[10px] text-[var(--app-color-accent)] hover:underline">
              纠正标注
            </button>
          )}
        </div>
      )}
    </div>
  );
}
