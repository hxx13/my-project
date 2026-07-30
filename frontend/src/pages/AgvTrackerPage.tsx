import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAgvCurrent, fetchAgvRecent, fetchAgvTrajectory, fetchCoordConfigs, fetchHistoryPlayback, type AgvRobotStatus, type HistoryPlaybackResponse } from "@/api/domains/agv.api";
import { useSpatialElements, useRouteTopology, buildTopologyOverlays, useGenerateRouteTopology } from "@/api/domains/agv-analysis.api";
import { useAgvTrailRef } from "@/features/agv-tracker/useAgvTrailRef";
import { computeSpeed, smoothSpeed, currentSpeed, detectDwellSegments, type TrailPoint } from "@/features/agv-tracker/agvAnalytics";
import AgvQuadrant from "@/features/agv-tracker/AgvQuadrant";
import AgvDualQuadrant from "@/features/agv-tracker/AgvDualQuadrant";
import AgvSidebar from "@/features/agv-tracker/AgvSidebar";
import AgvAnalysisModal from "@/features/agv-tracker/AgvAnalysisModal";

const ROBOTS = [
  { ip: "172.22.159.16", label: "AGV-1", color: "#3b82f6" },
  { ip: "172.22.159.18", label: "AGV-2", color: "#22c55e" },
  { ip: "172.22.159.20", label: "AGV-3", color: "#f59e0b" },
  { ip: "172.22.159.22", label: "AGV-4", color: "#8b5cf6" },
];

/** Derive activity type from raw telemetry, matching analysis rule logic */
function deriveActivity(s: AgvRobotStatus | null): string | undefined {
  if (!s) return undefined;
  if (s.emergency) return "EMERGENCY_STOP";
  if (s.blocked) return "BLOCKED_WAIT";
  if (s.charging && s.task_status === 4) return "CHARGING";
  if (s.task_status === 2 && !s.charging && (s.fork_height ?? 0) > 0.001) return "TRANSPORT";
  if (s.task_status === 2 && !s.charging) return "NAVIGATING";
  if (s.task_status === 4 && (s.fork_height ?? 0) > 0.001 && s.current_station?.startsWith("LM")) return "STATION_WORK";
  if (s.task_status === 4 && s.current_station?.startsWith("LM")) return "STATION_DWELL";
  if (s.task_status === 4 && s.current_station?.startsWith("CP") && !s.charging) return "REST_STATION";
  if (s.task_status === 4) return "UNKNOWN_IDLE";
  return undefined;
}

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

  const newest = points[points.length - 1];
  const oldest = points[0];
  const result = [newest];      // 始终保留最新位置（哪怕是原地不动）
  let last = result[0];

  for (let i = points.length - 2; i >= 0; i--) {
    const p = points[i], dx = Math.abs(last.x - p.x), dy = Math.abs(last.y - p.y);
    if (dx > 0.05 || dy > 0.05 || Math.abs(last.angle - p.angle) > 0.087) { result.push(p); last = p; }
    // 不够密集时补点（防止原地太久轨迹全空）
    if (result.length < 3) result.push(p);
    // 超过2小时窗口且至少50个有效点 → 截断（防止无限加载）
    if ((result[0].ts - p.ts) / 3600_000 >= 2 && result.length >= 20) break;
  }
  // 始终保留最旧的参考点（如果还没被包含）
  if (result[result.length - 1] !== oldest && (result[result.length - 1].ts - oldest.ts) > 600_000) {
    result.push(oldest);
  }
  result.reverse();

  // 原地停留补偿：如果有效点位太少但原始数据很多，说明长期静止，保留首尾至少2个点
  if (result.length < 3 && points.length >= 10) {
    return [oldest, newest];
  }
  return result;
}

export default function AgvTrackerPage() {
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [showZones, setShowZones] = useState(true);
  const [routeMode, setRouteMode] = useState(false);
  const [followMode, setFollowMode] = useState(false);
  const [layout, setLayout] = useState<LayoutMode>("quad");
  const [quadVehicles, setQuadVehicles] = useState([0, 1]); // 双象限各选哪台车 (index into ROBOTS)
  const [singleTab, setSingleTab] = useState(0);
  // 地图选点模式
  const [pickMode, setPickMode] = useState(false);
  const [pendingPick, setPendingPick] = useState<{ x: number; y: number } | null>(null);
  const { append, seed, getTrail, clearAll } = useAgvTrailRef();

  useTrailSeed(seed);

  // 地图选点模式回调
  const handleStartPick = () => { setPickMode(true); setPendingPick(null); };
  const handlePointPicked = (x: number, y: number) => { setPendingPick({ x, y }); setPickMode(false); };
  const handleCancelPick = () => { setPickMode(false); setPendingPick(null); };
  // Esc 键取消选点
  useEffect(() => {
    if (!pickMode) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") handleCancelPick(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pickMode]);

  // 历史回放模式（仅单象限模式使用）
  const [playback, setPlayback] = useState<{
    ip: string;
    from: string; to: string;
    data: HistoryPlaybackResponse | null;
    loading: boolean;
    error: string | null;
  } | null>(null);
  // 回放控制器：当前播放进度 (0-1)，播放速度倍率，播放/暂停
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [playbackPlaying, setPlaybackPlaying] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState(0); // 0..1

  // 回放动画循环：播放时自动推进 progress
  useEffect(() => {
    if (!playbackPlaying || !playback || !playback.data) return;
    let raf: number;
    let lastTs: number | null = null;
    const totalMs = new Date(playback.to).getTime() - new Date(playback.from).getTime();
    if (totalMs <= 0) return;

    const loop = (ts: number) => {
      if (lastTs == null) lastTs = ts;
      const elapsed = (ts - lastTs) * playbackSpeed;
      lastTs = ts;
      setPlaybackProgress(prev => {
        const next = prev + elapsed / totalMs;
        if (next >= 1) {
          setPlaybackPlaying(false);
          return 1;
        }
        return next;
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playbackPlaying, playback?.from, playback?.to, playbackSpeed]);

  const startHistoryPlayback = async (ip: string, from: string, to: string, autoPlay = false) => {
    setPlayback({ ip, from, to, data: null, loading: true, error: null });
    setPlaybackProgress(1);
    setPlaybackPlaying(false);
    try {
      const data = await fetchHistoryPlayback(ip, from, to);
      setPlayback({ ip, from, to, data, loading: false, error: null });
      if (autoPlay) {
        // 数据加载完成后自动开始从头播放
        setPlaybackProgress(0);
        setPlaybackPlaying(true);
      }
    } catch (e: any) {
      setPlayback({ ip, from, to, data: null, loading: false, error: e?.message || "加载失败" });
    }
  };

  const clearPlayback = () => {
    setPlayback(null);
    setPlaybackProgress(1);
    setPlaybackPlaying(false);
  };

  // 播放按钮：重置到开头再开始
  const handlePlaybackPlay = () => {
    setPlaybackProgress(0);
    setPlaybackPlaying(true);
  };

  const { data: coordConfigs } = useQuery({

    queryKey: ["agvCoordConfigs"],
    queryFn: fetchCoordConfigs,
    staleTime: 60_000,
  });

  // 轨迹：低频批量拉取
  const { data: recentData, dataUpdatedAt } = useQuery({
    queryKey: ["agvRecent"], queryFn: () => fetchAgvRecent(2),
    refetchInterval: 500, staleTime: 0, refetchOnWindowFocus: true,
  });

  // 状态：高频（缓存秒返，几乎无开销）
  const { data } = useQuery({
    queryKey: ["agvCurrent"], queryFn: fetchAgvCurrent,
    refetchInterval: 500, staleTime: 0, refetchOnWindowFocus: true,
  });

  // Zone overlays for canvas (loaded once, shared)
  const { data: zones = [] } = useSpatialElements();

  useEffect(() => {
    if (!recentData) return;
    for (const r of ROBOTS) {
      const points = recentData[r.ip];
      if (points?.length) {
        for (const p of points) {
          if (p.x != null && p.y != null) {
            append(r.ip, { x: p.x, y: p.y, angle: p.angle ?? 0, ts: new Date(p.recorded_at).getTime() });
          }
        }
      }
    }
  }, [dataUpdatedAt]);

  // 定期补种：每5分钟拉一次历史数据混入实时轨迹
  useEffect(() => {
    const reseed = () => {
      const now = new Date().toISOString();
      const ago = new Date(Date.now() - 2 * 3600_000).toISOString();
      ROBOTS.forEach(r => {
        fetchAgvTrajectory(r.ip, ago, now, 2000).then(rows => {
          const pts = rows.filter(row => row.x != null && row.y != null)
            .sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime())
            .map(row => ({ x: row.x, y: row.y, angle: row.angle ?? 0, ts: new Date(row.recorded_at).getTime() }));
          const filtered = smartSample(pts);
          if (filtered.length > 0) {
            seed(r.ip, filtered);
          }
        }).catch(() => {});
      });
    };
    const timer = setInterval(reseed, 5 * 60_000);
    return () => clearInterval(timer);
  }, [seed]);

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

  // 固定路线拓扑（机械化分析修正结果，非算法动态发现）
  const { data: routeTopology } = useRouteTopology();
  const generateTopologyMut = useGenerateRouteTopology();

  const routeOverlays = useMemo(() => buildTopologyOverlays(routeTopology), [routeTopology]);

  // Zone overlays — 按 AGV 结对的历史坐标范围过滤，每象限只显示自己区域
  const pairZoneOverlays = useMemo(() => {
    const allZones = zones
      .filter(z => z.polygonJson && (z.elementType === "POLYGON_ZONE" || z.elementType === "STATION_ZONE"))
      .filter(z => z.source === "BEHAVIOR" || z.source === "MANUAL" || (z.source === "AUTO" && (z.hitCount ?? 0) > 0))
      .map(z => {
        let cx = 0, cy = 0;
        try { const p: number[][] = JSON.parse(z.polygonJson!); for (const v of p) { cx += v[0]; cy += v[1]; } cx /= p.length; cy /= p.length; } catch {}
        return { id: z.id!, polygonJson: z.polygonJson!, color: z.color || "#3b82f6", name: z.name, cx, cy };
      });
    // Pair 0: AGV-1+2, Pair 1: AGV-3+4
    const pairs = [[ROBOTS[0], ROBOTS[1]], [ROBOTS[2], ROBOTS[3]]];
    return pairs.map(([a, b]) => {
      const trailA = getTrail(a.ip), trailB = getTrail(b.ip);
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const t of [...trailA, ...trailB]) {
        if (t.x < minX) minX = t.x; if (t.x > maxX) maxX = t.x;
        if (t.y < minY) minY = t.y; if (t.y > maxY) maxY = t.y;
      }
      if (!isFinite(minX)) return allZones; // no trail yet → show all
      const MARGIN = 5; // 5m world-coord margin
      return allZones.filter(z => z.cx >= minX - MARGIN && z.cx <= maxX + MARGIN && z.cy >= minY - MARGIN && z.cy <= maxY + MARGIN);
    });
  }, [zones, dataUpdatedAt]);

  // 单象限：每个机器人独立的世界坐标隔离
  const robotZoneOverlays = useMemo(() => {
    const allZones = zones
      .filter(z => z.polygonJson && (z.elementType === "POLYGON_ZONE" || z.elementType === "STATION_ZONE"))
      .filter(z => z.source === "BEHAVIOR" || z.source === "MANUAL" || (z.source === "AUTO" && (z.hitCount ?? 0) > 0))
      .map(z => {
        let cx = 0, cy = 0;
        try { const p: number[][] = JSON.parse(z.polygonJson!); for (const v of p) { cx += v[0]; cy += v[1]; } cx /= p.length; cy /= p.length; } catch {}
        return { id: z.id!, polygonJson: z.polygonJson!, color: z.color || "#3b82f6", name: z.name, cx, cy };
      });
    const result: Record<string, typeof allZones> = {};
    for (const r of ROBOTS) {
      const trail = getTrail(r.ip);
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const t of trail) {
        if (t.x < minX) minX = t.x; if (t.x > maxX) maxX = t.x;
        if (t.y < minY) minY = t.y; if (t.y > maxY) maxY = t.y;
      }
      if (!isFinite(minX)) { result[r.ip] = allZones; continue; }
      const MARGIN = 5;
      result[r.ip] = allZones.filter(z => z.cx >= minX - MARGIN && z.cx <= maxX + MARGIN && z.cy >= minY - MARGIN && z.cy <= maxY + MARGIN);
    }
    return result;
  }, [zones, dataUpdatedAt]);

  const canvasZoneOverlays = useMemo(() => {
    return zones
      .filter(z => z.polygonJson && (z.elementType === "POLYGON_ZONE" || z.elementType === "STATION_ZONE"))
      .filter(z => z.source === "BEHAVIOR" || z.source === "MANUAL" || (z.source === "AUTO" && (z.hitCount ?? 0) > 0))
      .map(z => ({
        id: z.id!,
        polygonJson: z.polygonJson!,
        color: z.color || "#3b82f6",
        name: z.name,
      }));
  }, [zones]);

  // Shared AGV info extractor — used by both single (AgvQuadrant) and merged (AgvDualQuadrant) views
  const buildAgvInfo = (r: typeof ROBOTS[number]) => {
    const s = getStatus(r.ip);
    const lp = getLastPolled(r.ip);
    const online = lp != null && Date.now() - new Date(lp).getTime() < 10_000;
    const a = robotAnalytics[r.ip];
    return {
      ip: r.ip, label: r.label, online, color: r.color, trail: getTrail(r.ip),
      x: s?.x ?? null, y: s?.y ?? null, angle: s?.angle ?? null,
      speed: a.speed, avgSpeed: a.avgSpeed, maxSpeed: a.maxSpeed,
      dwellSpots: dwellByIp[r.ip],
      battery: s?.battery_level ?? null, charging: s?.charging ?? null,
      taskStatus: s?.task_status ?? null, blocked: s?.blocked ?? null, emergency: s?.emergency ?? null,
      station: s?.current_station ?? null, mapName: s?.current_map ?? null,
      confidence: s?.confidence ?? null, relocStatus: s?.reloc_status ?? null, loadmapStatus: s?.loadmap_status ?? null,
      odo: s?.odo ?? null, rssi: s?.rssi ?? null, driverEmc: s?.driver_emc ?? null,
      forkHeight: s?.fork_height ?? null, forkInPlace: s?.fork_height_in_place ?? null,
      jackEnable: s?.jack_enable ?? null, jackState: s?.jack_state ?? null, jackIsFull: s?.jack_isFull ?? null,
      jackMode: s?.jack_mode ?? null, jackErrorCode: s?.jack_error_code ?? null,
      errors: s?.errors ?? null, warnings: s?.warnings ?? null,
      diChannels: s?.DI ?? null,
      coordRotationDeg: coordConfigs?.[r.ip] ?? 0,
      currentActivity: deriveActivity(s),
    };
  };

  const quadrant = (r: typeof ROBOTS[number]) => {
    const info = buildAgvInfo(r);
    const isPlaybackActive = playback != null && playback.ip === r.ip && playback.data != null;
    return (
      <div key={r.ip} className="relative h-full">
        <AgvQuadrant ip={info.ip} label={info.label}
          online={info.online} color={info.color} trail={info.trail}
          x={info.x} y={info.y} angle={info.angle}
          speed={info.speed} avgSpeed={info.avgSpeed} maxSpeed={info.maxSpeed}
          dwellSpots={info.dwellSpots}
          battery={info.battery} charging={info.charging}
          taskStatus={info.taskStatus} blocked={info.blocked} emergency={info.emergency}
          station={info.station} mapName={info.mapName}
          confidence={info.confidence} relocStatus={info.relocStatus} loadmapStatus={info.loadmapStatus}
          odo={info.odo} rssi={info.rssi} driverEmc={info.driverEmc}
          forkHeight={info.forkHeight} forkInPlace={info.forkInPlace}
          jackEnable={info.jackEnable} jackState={info.jackState} jackIsFull={info.jackIsFull}
          jackMode={info.jackMode} jackErrorCode={info.jackErrorCode}
          errors={info.errors} warnings={info.warnings}
          diChannels={info.diChannels}
          coordRotationDeg={info.coordRotationDeg}
          zoneOverlays={showZones ? robotZoneOverlays[r.ip] : []}
          routeOverlays={routeMode ? routeOverlays.filter(ro => ro.robotIp === r.ip) : []}
          routeMode={routeMode}
          followMode={followMode}
          currentActivity={info.currentActivity}
          pickMode={pickMode}
          onPointPick={handlePointPicked}
          // History playback props (single-quadrant only)
          playbackActive={isPlaybackActive}
          playbackData={isPlaybackActive ? playback!.data! : null}
          playbackPlaying={playbackPlaying}
          playbackProgress={playbackProgress}
          playbackSpeed={playbackSpeed}
          playbackLoading={playback?.loading ?? false}
          playbackError={playback?.error ?? null}
          onStartPlayback={(ip, from, to) => startHistoryPlayback(ip, from, to)}
          onClearPlayback={clearPlayback}
          onPlaybackPlay={handlePlaybackPlay}
          onPlaybackPause={() => setPlaybackPlaying(false)}
          onPlaybackProgress={setPlaybackProgress}
          onPlaybackSpeed={setPlaybackSpeed}
        />
      </div>
    );
  };

  // Merged quadrants: AGV-1+AGV-2 (left), AGV-3+AGV-4 (right)

  return (
    <div className="flex-1 flex flex-col relative">
      {/* Floating pill toolbar */}
      <AgvSidebar
        serverTime={data?.server_time ?? null}
        layout={layout} onLayoutChange={setLayout}
        singleTab={singleTab} onSingleTabChange={setSingleTab}
        analysisOpen={analysisOpen} onAnalysisToggle={() => setAnalysisOpen(v => !v)}
        showZones={showZones} onToggleZones={() => setShowZones(v => !v)}
        routeMode={routeMode} onToggleRouteMode={() => setRouteMode(v => !v)}
        followMode={followMode} onToggleFollowMode={() => setFollowMode(v => !v)}
        topologyGenerating={generateTopologyMut.isPending}
        onGenerateTopology={() => generateTopologyMut.mutate()}
      />

      {/* Quadrant grid — 双象限: AGV-1+2 (左), AGV-3+4 (右) */}
      {layout === "quad" ? (
        <div className="flex-1 grid grid-cols-2 gap-2 p-2">
          {[[0, 1], [2, 3]].map(([ai, bi], qi) => {
            const infoA = buildAgvInfo(ROBOTS[ai]);
            const infoB = buildAgvInfo(ROBOTS[bi]);
            return (
              <AgvDualQuadrant key={`${ai}-${bi}`}
                agvA={infoA} agvB={infoB}
                zoneOverlays={showZones ? pairZoneOverlays[qi] : []}
                routeOverlaysA={routeMode ? routeOverlays.filter(ro => ro.robotIp === ROBOTS[ai].ip) : []}
                routeOverlaysB={routeMode ? routeOverlays.filter(ro => ro.robotIp === ROBOTS[bi].ip) : []}
                routeMode={routeMode}
                pickMode={pickMode}
                onPointPick={handlePointPicked}
              />
            );
          })}
        </div>
      ) : (
        <div className="flex-1 min-h-0 p-2">{quadrant(ROBOTS[singleTab])}</div>
      )}

      {/* Analysis modal */}
      <AgvAnalysisModal
        open={analysisOpen && !pickMode}
        onClose={() => setAnalysisOpen(false)}
        onRequestPick={handleStartPick}
        pendingPick={pendingPick}
        onClearPick={() => setPendingPick(null)}
      />

      {/* 地图选点模式浮动提示条 */}
      {pickMode && (
        <div
          onClick={handleCancelPick}
          className="absolute top-10 left-1/2 -translate-x-1/2 z-[var(--z-overlay)] flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--app-color-accent)] text-white text-xs font-medium shadow-lg cursor-pointer hover:opacity-90 transition-opacity select-none"
        >
          <span className="text-base">📍</span>
          <span>在地图上点击标记位置</span>
          <span className="text-[10px] opacity-70">· Esc 取消</span>
        </div>
      )}
    </div>
  );
}
