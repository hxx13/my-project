import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAgvCurrent, fetchAgvTrajectory, fetchCoordConfigs, type AgvRobotStatus } from "@/api/domains/agv.api";
import { useSpatialElements } from "@/api/domains/agv-analysis.api";
import { useAgvTrailRef } from "@/features/agv-tracker/useAgvTrailRef";
import { computeSpeed, smoothSpeed, currentSpeed, detectDwellSegments, type TrailPoint } from "@/features/agv-tracker/agvAnalytics";
import AgvQuadrant from "@/features/agv-tracker/AgvQuadrant";
import AgvSidebar from "@/features/agv-tracker/AgvSidebar";
import AgvAnalysisModal from "@/features/agv-tracker/AgvAnalysisModal";

const ROBOTS = [
  { ip: "172.22.159.16", label: "AGV-1", color: "#3b82f6" },
  { ip: "172.22.159.18", label: "AGV-2", color: "#22c55e" },
  { ip: "172.22.159.20", label: "AGV-3", color: "#f59e0b" },
  { ip: "172.22.159.22", label: "AGV-4", color: "#8b5cf6" },
];

type LayoutMode = "quad" | "single";

function useTrailSeed(seed: (ip: string, points: TrailPoint[]) => void) {
  const [, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const now = new Date().toISOString();
    const ago = new Date(Date.now() - 24 * 3600_000).toISOString();
    Promise.all(ROBOTS.map((r) =>
      fetchAgvTrajectory(r.ip, ago, now, 10000).then((rows) => {
        if (cancelled || !rows.length) return;
        const sorted = rows
          .filter((row) => row.x != null && row.y != null)
          .sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime())
          .map((row) => ({ x: row.x, y: row.y, angle: row.angle ?? 0, ts: new Date(row.recorded_at).getTime() }));
        const filtered = smartSample(sorted);
        if (filtered.length > 0) seed(r.ip, filtered);
      }).catch(() => {}),
    )).finally(() => { if (!cancelled) setTick((t) => t + 1); });
    return () => { cancelled = true; };
  }, [seed]);
}

function smartSample(points: { x: number; y: number; angle: number; ts: number }[]): typeof points {
  if (points.length < 2) return points;
  const result = [points[points.length - 1]];
  let last = result[0];
  for (let i = points.length - 2; i >= 0; i--) {
    const p = points[i], dx = Math.abs(last.x - p.x), dy = Math.abs(last.y - p.y);
    if (dx > 0.05 || dy > 0.05 || Math.abs(last.angle - p.angle) > 0.087) { result.push(p); last = p; }
    else if (result.length <= 3) result.push(p);
    if ((result[0].ts - p.ts) / 3600_000 >= 2 && result.length >= 50) break;
  }
  result.reverse();
  return result;
}

export default function AgvTrackerPage() {
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [layout, setLayout] = useState<LayoutMode>("quad");
  const [singleTab, setSingleTab] = useState(0);
  const { append, seed, getTrail, clearAll } = useAgvTrailRef();

  useTrailSeed(seed);

  // 时间窗口手动回放
  const [timeWindows, setTimeWindows] = useState<Record<string, { from: string; to: string } | null>>({});
  const [seedTick, setSeedTick] = useState(0);
  const loadTimeWindow = async (ip: string, from: string, to: string) => {
    try {
      const rows = await fetchAgvTrajectory(ip, from, to, 5000);
      if (!rows.length) return;
      const pts = rows.filter(r => r.x != null && r.y != null)
        .sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime())
        .map(r => ({ x: r.x, y: r.y, angle: r.angle ?? 0, ts: new Date(r.recorded_at).getTime() }));
      const filtered = smartSample(pts);
      if (filtered.length > 0) {
        seed(ip, filtered);
        setTimeWindows(prev => ({ ...prev, [ip]: { from, to } }));
        setSeedTick(t => t + 1); // force re-render after seed
      }
    } catch (e) { console.warn("loadTimeWindow failed", e); }
  };

  const { data: coordConfigs } = useQuery({

    queryKey: ["agvCoordConfigs"],
    queryFn: fetchCoordConfigs,
    staleTime: 60_000,
  });

  // 时间窗口选择器状态
  const [showTimePicker, setShowTimePicker] = useState<string | null>(null);
  const [pickerFrom, setPickerFrom] = useState("");
  const [pickerTo, setPickerTo] = useState("");

  const openTimePicker = (ip: string) => {
    const trail = getTrail(ip);
    const pad = (n: number) => String(n).padStart(2, "0");
    const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    if (trail.length >= 2) {
      const first = new Date(trail[0].ts);
      const last = new Date(trail[trail.length - 1].ts);
      const margin = Math.max((last.getTime() - first.getTime()) * 0.05, 60_000);
      setPickerFrom(fmt(new Date(first.getTime() - margin)));
      setPickerTo(fmt(new Date(last.getTime() + margin)));
    } else {
      const now = new Date();
      setPickerFrom(fmt(new Date(now.getTime() - 2 * 3600_000)));
      setPickerTo(fmt(now));
    }
    setShowTimePicker(ip);
  };

  const applyTimeWindow = () => {
    if (showTimePicker) {
      loadTimeWindow(showTimePicker, pickerFrom + ":00", pickerTo + ":00");
      setShowTimePicker(null);
    }
  };

  const { data, dataUpdatedAt } = useQuery({
    queryKey: ["agvCurrent"], queryFn: fetchAgvCurrent,
    refetchInterval: 1000, staleTime: 0, refetchOnWindowFocus: true,
  });

  // Zone overlays for canvas (loaded once, shared)
  const { data: zones = [] } = useSpatialElements();

  useEffect(() => {
    if (!data?.robots) return;
    for (const r of ROBOTS) {
      const e = data.robots[r.ip];
      if (e?.status && e.status.x != null && e.status.y != null) {
        append(r.ip, { x: e.status.x, y: e.status.y, angle: e.status.angle ?? 0, ts: Date.now() });
      }
    }
  }, [dataUpdatedAt]);

  useEffect(() => () => clearAll(), [clearAll]);

  const getStatus = (ip: string): AgvRobotStatus | null => data?.robots?.[ip]?.status ?? null;
  const getLastPolled = (ip: string): string | null => data?.robots?.[ip]?.last_polled_at ?? null;

  const robotAnalytics = useMemo(() => {
    const result: Record<string, { speed: number | null; avgSpeed: number | null; maxSpeed: number | null }> = {};
    for (const r of ROBOTS) {
      const trail = getTrail(r.ip);
      const speeds = computeSpeed(trail);
      const smooth = smoothSpeed(speeds, 5);
      const nonZero = smooth.filter((s) => s.speedMps > 0.01);
      result[r.ip] = {
        speed: currentSpeed(trail),
        avgSpeed: nonZero.length ? nonZero.reduce((a, b) => a + b.speedMps, 0) / nonZero.length : null,
        maxSpeed: nonZero.length ? Math.max(...nonZero.map((s) => s.speedMps)) : null,
      };
    }
    return result;
  }, [dataUpdatedAt]);

  const dwellByIp = useMemo(() => {
    const map: Record<string, { x: number; y: number; durationSec: number }[]> = {};
    for (const r of ROBOTS) {
      const trail = getTrail(r.ip);
      if (trail.length < 10) { map[r.ip] = []; continue; }
      const spots = detectDwellSegments(trail, new Map(), 2, 0.3);
      const cellMap = new Map<string, { x: number; y: number; count: number }>();
      for (const p of trail) {
        const cx = Math.round(p.x * 10) / 10;
        const cy = Math.round(p.y * 10) / 10;
        const k = `${cx},${cy}`;
        const c = cellMap.get(k);
        if (c) c.count++; else cellMap.set(k, { x: cx, y: cy, count: 1 });
      }
      const density: { x: number; y: number; durationSec: number }[] = [];
      const MAX_HEAT = 300;
      for (const [, v] of cellMap) { if (v.count >= 3) density.push({ x: v.x, y: v.y, durationSec: Math.min(v.count, MAX_HEAT) }); }
      map[r.ip] = [...spots.map((s) => ({ x: s.x, y: s.y, durationSec: s.durationSec })), ...density];
    }
    return map;
  }, [dataUpdatedAt]);

  // Zone overlays for canvas rendering
  const canvasZoneOverlays = useMemo(() => {
    return zones
      .filter(z => z.polygonJson && (z.elementType === "POLYGON_ZONE" || z.elementType === "STATION_ZONE"))
      .map(z => ({
        id: z.id!,
        polygonJson: z.polygonJson!,
        color: z.color || "#3b82f6",
        name: z.name,
      }));
  }, [zones]);

  const quadrant = (r: typeof ROBOTS[number]) => {
    const s = getStatus(r.ip);
    const lp = getLastPolled(r.ip);
    const online = lp != null && Date.now() - new Date(lp).getTime() < 10_000;
    const a = robotAnalytics[r.ip];
    const tw = timeWindows[r.ip];
    return (
      <div key={r.ip} className="relative">
        <AgvQuadrant ip={r.ip} label={r.label}
          online={online} color={r.color} trail={getTrail(r.ip)}
          x={s?.x ?? null} y={s?.y ?? null} angle={s?.angle ?? null}
          speed={a.speed} avgSpeed={a.avgSpeed} maxSpeed={a.maxSpeed}
          dwellSpots={dwellByIp[r.ip]}
          battery={s?.battery_level ?? null} charging={s?.charging ?? null}
          taskStatus={s?.task_status ?? null} blocked={s?.blocked ?? null} emergency={s?.emergency ?? null}
          station={s?.current_station ?? null} mapName={s?.current_map ?? null}
          confidence={s?.confidence ?? null} relocStatus={s?.reloc_status ?? null} loadmapStatus={s?.loadmap_status ?? null}
          odo={s?.odo ?? null} rssi={s?.rssi ?? null} driverEmc={s?.driver_emc ?? null}
          forkHeight={s?.fork_height ?? null} forkInPlace={s?.fork_height_in_place ?? null}
          jackEnable={s?.jack_enable ?? null} jackState={s?.jack_state ?? null} jackIsFull={s?.jack_isFull ?? null}
          jackMode={s?.jack_mode ?? null} jackErrorCode={s?.jack_error_code ?? null}
          errors={s?.errors ?? null} warnings={s?.warnings ?? null}
          diChannels={s?.DI ?? null}
          coordRotationDeg={coordConfigs?.[r.ip] ?? 0}
          onTimeWindow={() => showTimePicker === r.ip ? setShowTimePicker(null) : openTimePicker(r.ip)}
          timeWindowActive={!!tw}
          zoneOverlays={canvasZoneOverlays}
        />
        {/* Time picker popup */}
        {showTimePicker === r.ip && (
          <div className="absolute top-7 right-1 z-20 bg-[var(--app-color-surface-container)] border border-[var(--app-color-border-default)] rounded shadow-lg p-2 flex gap-1 text-[10px]">
            <input type="datetime-local" value={pickerFrom} onChange={e => setPickerFrom(e.target.value)}
              className="px-1 py-0.5 rounded border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)]" />
            <span className="text-[var(--app-color-text-tertiary)] self-center">→</span>
            <input type="datetime-local" value={pickerTo} onChange={e => setPickerTo(e.target.value)}
              className="px-1 py-0.5 rounded border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)]" />
            <button onClick={applyTimeWindow}
              className="px-2 py-0.5 rounded bg-[var(--app-color-accent)] text-white font-medium">加载</button>
            {tw && <button onClick={() => { setTimeWindows(p => ({...p, [r.ip]: null})); }}
              className="px-1.5 py-0.5 rounded border border-red-300 text-red-500">清除</button>}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col relative">
      {/* Floating pill toolbar */}
      <AgvSidebar
        serverTime={data?.server_time ?? null}
        layout={layout} onLayoutChange={setLayout}
        singleTab={singleTab} onSingleTabChange={setSingleTab}
        analysisOpen={analysisOpen} onAnalysisToggle={() => setAnalysisOpen(v => !v)}
      />

      {/* Quadrant grid */}
      {layout === "quad" ? (
        <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-2 p-2">
          {ROBOTS.map(quadrant)}
        </div>
      ) : (
        <div className="flex-1 min-h-0 p-2">{quadrant(ROBOTS[singleTab])}</div>
      )}

      {/* Analysis modal */}
      <AgvAnalysisModal
        open={analysisOpen}
        onClose={() => setAnalysisOpen(false)}
      />
    </div>
  );
}
