import { useState, useMemo, useCallback } from "react";
import { useSegments, useAnalysisRun, useCorrectSegment, useSpatialElements, ACTIVITY_COLORS, ACTIVITY_LABELS, type AgvActivitySegment } from "@/api/domains/agv-analysis.api";
import { AnimatePresence, motion } from "framer-motion";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import { AGV_ROBOTS } from "@/features/agv-tracker/agvRobotConfig";

const ROBOTS = AGV_ROBOTS;

const ACTIVITY_TYPES = Object.keys(ACTIVITY_LABELS);

// ── 5 活动 → 3 大类 ──
const SUPER_MAP: Record<string, string> = {
  CHARGING: "charge", REST_STATION: "rest",
  STATION_WORK: "work", TRANSPORT: "work", NAVIGATING: "work",
};
const SUPER_LABELS: Record<string, string> = { charge: "充电", rest: "休息", work: "作业" };
const SUPER_COLORS: Record<string, string> = { charge: "#10b981", rest: "#8b5cf6", work: "#f97316" };
const SUPER_KEYS = ["charge", "rest", "work"] as const;

const ALL_ACTIVITY_TYPES = ["CHARGING", "STATION_WORK", "TRANSPORT", "NAVIGATING", "REST_STATION"] as const;
const Y_LABELS = [
  ...ALL_ACTIVITY_TYPES.map(t => ACTIVITY_LABELS[t]),
  "",
  ...SUPER_KEYS.map(k => SUPER_LABELS[k]),
];

const ACTIVITY_INDEX: Record<string, number> = {};
ALL_ACTIVITY_TYPES.forEach((t, i) => { ACTIVITY_INDEX[t] = i; });

/** 安全解析日期：兼容 ISO 8601 和 MySQL datetime 格式 (YYYY-MM-DD HH:mm:ss) */
function toMs(s: string): number {
  return new Date(s.includes("T") ? s : s.replace(" ", "T")).getTime();
}

function fmtTime(iso: string) { return new Date(iso.includes("T") ? iso : iso.replace(" ", "T")).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }); }
function fmtDuration(sec: number) {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
}

interface Props {
  selectedRobot: string;
  onSelectRobot: (ip: string) => void;
  onJumpToZone?: (stationName: string) => void;
}

export default function AgvTimelineTab({ selectedRobot, onSelectRobot, onJumpToZone }: Props) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(todayStr);
  const from = date + "T00:00:00";
  const to = date + "T23:59:59";

  const [selectedSeg, setSelectedSeg] = useState<AgvActivitySegment | null>(null);
  const [correcting, setCorrecting] = useState(false);

  const { data: queriedSegments = [], isLoading, isError, error } = useSegments(selectedRobot, from, to);
  const { data: zones = [] } = useSpatialElements();
  const runAnalysis = useAnalysisRun();
  const correctMut = useCorrectSegment();

  const zoneNameMap = useMemo(() => {
    const map: Record<number, string> = {};
    for (const z of zones) {
      if (z.id != null) map[z.id] = z.name;
    }
    return map;
  }, [zones]);

  const segments = queriedSegments.length > 0 ? queriedSegments : (runAnalysis.data ?? []);

  // Sort + merge consecutive same-type (≤60s gap)
  const sorted = useMemo(() => {
    const raw = [...segments].sort((a, b) => toMs(a.startTime) - toMs(b.startTime));
    if (raw.length < 2) return raw;
    const merged: AgvActivitySegment[] = [];
    let cur = { ...raw[0] };
    for (let i = 1; i < raw.length; i++) {
      const next = raw[i];
      const gapSec = (toMs(next.startTime) - toMs(cur.endTime)) / 1000;
      if (cur.activityType === next.activityType && gapSec < 60) {
        cur = { ...cur, endTime: next.endTime, endX: next.endX, endY: next.endY,
          distanceM: (cur.distanceM ?? 0) + (next.distanceM ?? 0) };
      } else {
        const dur = (toMs(cur.endTime) - toMs(cur.startTime)) / 1000;
        if (dur > 10 || (cur.distanceM ?? 0) > 2) merged.push(cur);
        cur = { ...next };
      }
    }
    const lastDur = (toMs(cur.endTime) - toMs(cur.startTime)) / 1000;
    if (lastDur > 10 || (cur.distanceM ?? 0) > 2) merged.push(cur);
    return merged;
  }, [segments]);

  // Super-category segments
  const superSegments = useMemo(() => {
    if (sorted.length === 0) return [];
    const groups: Record<string, AgvActivitySegment[]> = {};
    for (const seg of sorted) {
      const sc = SUPER_MAP[seg.activityType];
      if (!sc) continue;
      (groups[sc] || (groups[sc] = [])).push(seg);
    }
    const result: Array<{ superKey: string; startTime: string; endTime: string }> = [];
    for (const [superKey, segs] of Object.entries(groups)) {
      const chrono = [...segs].sort((a, b) => toMs(a.startTime) - toMs(b.startTime));
      let cur = { startTime: chrono[0].startTime, endTime: chrono[0].endTime };
      for (let i = 1; i < chrono.length; i++) {
        const n = chrono[i];
        const ce = toMs(cur.endTime);
        const ns = toMs(n.startTime);
        if (ns - ce < 60_000 || ns <= ce) {
          if (toMs(n.endTime) > ce) cur.endTime = n.endTime;
        } else {
          result.push({ superKey, ...cur });
          cur = { startTime: n.startTime, endTime: n.endTime };
        }
      }
      result.push({ superKey, ...cur });
    }
    return result.sort((a, b) => toMs(a.startTime) - toMs(b.startTime));
  }, [sorted]);

  // ── ECharts option ──
  const chartOption: EChartsOption = useMemo(() => {
    if (sorted.length === 0) return {};

    const barH = 14;

    // Activity data: [yIdx, startMs, endMs, color, segId, zoneId, label, distance, confidence]
    const actData = sorted.map(seg => ({
      value: [
        ACTIVITY_INDEX[seg.activityType] ?? 0,
        toMs(seg.startTime),
        toMs(seg.endTime),
        ACTIVITY_COLORS[seg.activityType] || "#d1d5db",
        seg.id,
        seg.zoneId ?? null,
        ACTIVITY_LABELS[seg.activityType] || seg.activityType,
        seg.distanceM ?? 0,
        seg.confidence,
      ],
    }));

    // Super-category data
    const superData = superSegments.map(seg => {
      const si = SUPER_KEYS.indexOf(seg.superKey as typeof SUPER_KEYS[number]);
      return {
        value: [
          6 + si,
          toMs(seg.startTime),
          toMs(seg.endTime),
          SUPER_COLORS[seg.superKey],
          -1,
          null,
          SUPER_LABELS[seg.superKey],
          0, 0,
        ],
      };
    });

    const allData = [...actData, ...superData];

    return {
      tooltip: {
        trigger: "item" as const,
        backgroundColor: "rgba(20,20,30,0.92)",
        borderColor: "transparent",
        textStyle: { color: "#fff", fontSize: 11 },
        formatter: (p: any) => {
          const v = p.value;
          if (v == null) return "";
          if (v[4] === -1) {
            return `<b style="color:${v[3]}">■ ${v[6]}</b><br/>
              ${new Date(v[1]).toLocaleTimeString("zh-CN")} → ${new Date(v[2]).toLocaleTimeString("zh-CN")}<br/>
              <span style="opacity:0.6">大类汇总区间</span>`;
          }
          const zoneLabel = v[5] != null ? zoneNameMap[v[5]] || "" : "";
          const dur = fmtDuration(Math.round((v[2] - v[1]) / 1000));
          return `<b style="color:${v[3]}">■ ${zoneLabel ? zoneLabel + " · " : ""}${v[6]}</b><br/>
            时间: ${new Date(v[1]).toLocaleTimeString("zh-CN")} → ${new Date(v[2]).toLocaleTimeString("zh-CN")}<br/>
            时长: ${dur}${v[7] ? " · " + v[7] + "m" : ""}<br/>
            置信度: ${(v[8] * 100).toFixed(0)}%`;
        },
      },
      grid: { left: 56, right: 16, top: 8, bottom: 48 },
      xAxis: {
        type: "time" as const,
        axisLabel: { fontSize: 10, color: "#71717a" },
        axisLine: { lineStyle: { color: "#d4d4d8" } },
      },
      yAxis: {
        type: "category" as const,
        data: Y_LABELS,
        axisLabel: {
          fontSize: 10,
          fontWeight: ((_value: string | number | undefined, index: number | undefined) => (index ?? 0) >= 6 ? "bold" : "normal") as any,
          color: (_value: string | number | undefined, index: number | undefined) => {
            if (index === 5) return "transparent";
            if (index === 6) return SUPER_COLORS.charge;
            if (index === 7) return SUPER_COLORS.rest;
            if (index === 8) return SUPER_COLORS.work;
            return "#71717a";
          },
        },
        axisLine: { lineStyle: { color: "#d4d4d8" } },
        splitLine: {
          show: true,
          lineStyle: { color: "#e4e4e7", type: "dashed" as const, opacity: 0.6 },
        },
      },
      dataZoom: [
        {
          type: "slider" as const, xAxisIndex: 0, height: 22, bottom: 6,
          borderColor: "#d4d4d8",
          fillerColor: "rgba(217,119,6,0.12)",
          handleStyle: { color: "#d97706" },
          textStyle: { fontSize: 9, color: "#71717a" },
          start: 0, end: 100,
        },
        {
          type: "inside" as const, xAxisIndex: 0,
          zoomOnMouseWheel: true, moveOnMouseMove: true, moveOnMouseWheel: false,
        },
      ],
      series: [{
        type: "custom" as const,
        clip: true,
        data: allData,
        encode: { x: [1, 2], y: 0 },
        renderItem: (_params: any, api: any) => {
          const catIdx = api.value(0);
          const sMs = api.value(1), eMs = api.value(2), color = api.value(3);
          const s = api.coord([sMs, catIdx]);
          const e = api.coord([eMs, catIdx]);
          return {
            type: "rect",
            shape: { x: s[0], y: s[1] - barH / 2, width: Math.max(e[0] - s[0], 3), height: barH },
            style: { fill: color, opacity: catIdx >= 6 ? 0.7 : 0.9 },
          };
        },
      }],
    };
  }, [sorted, superSegments, zoneNameMap]);

  const onChartClick = useCallback((params: any) => {
    if (params.value?.[4] > 0) {
      const seg = sorted.find(s => s.id === params.value[4]);
      if (seg) setSelectedSeg(prev => prev?.id === seg.id ? null : seg);
    }
  }, [sorted]);

  const onChartEvents = useMemo(() => ({ click: onChartClick }), [onChartClick]);
  const chartHeight = Y_LABELS.length * 26 + 56;

  return (
    <div className="flex flex-col flex-1 min-h-0 text-[11px]">
      {/* Controls */}
      <div className="shrink-0 flex gap-1.5 px-1 pb-2 border-b border-[var(--app-color-border-default)]">
        <select value={selectedRobot} onChange={(e) => onSelectRobot(e.target.value)}
          className="flex-1 px-2 py-1.5 rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] text-[var(--app-color-text-primary)] text-[11px]">
          {ROBOTS.map(r => <option key={r.ip} value={r.ip}>{r.label} ({r.ip})</option>)}
        </select>
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          className="w-32 px-2 py-1.5 rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] text-[var(--app-color-text-primary)] text-[11px]" />
        <button
          onClick={() => runAnalysis.mutate({ robotIp: selectedRobot, from, to })}
          disabled={runAnalysis.isPending}
          className="shrink-0 px-2 py-1.5 rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] text-[var(--app-color-text-secondary)] hover:text-[var(--app-color-text-primary)] text-[10px] disabled:opacity-50">
          {runAnalysis.isPending ? "分析中…" : "重新分析"}
        </button>
        {runAnalysis.isError && (
          <span className="text-[9px] text-red-500 flex items-center">分析失败</span>
        )}
      </div>

      {/* ECharts timeline */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-[var(--app-color-text-tertiary)]">加载中…</div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center h-full gap-1">
            <div className="text-[11px] text-red-500 font-medium">加载失败</div>
            <div className="text-[10px] text-[var(--app-color-text-tertiary)]">{error?.message || "未知错误"}</div>
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[var(--app-color-text-tertiary)]">
            暂无分析结果，点击"重新分析"开始
          </div>
        ) : (
          <ReactECharts
            option={chartOption}
            style={{ height: chartHeight, width: "100%" }}
            onEvents={onChartEvents}
            notMerge
            lazyUpdate
          />
        )}
      </div>

      {/* Detail bar */}
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
                <span>{fmtDuration(Math.round((toMs(selectedSeg.endTime) - toMs(selectedSeg.startTime)) / 1000))}</span>
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
