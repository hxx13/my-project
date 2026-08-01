import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAgvCurrent, fetchAgvRecent, fetchAgvTrajectory, fetchCoordConfigs, fetchHistoryPlayback, type AgvRobotStatus, type HistoryPlaybackResponse } from "@/api/domains/agv.api";
import { useSpatialElements, useRouteTopology, buildTopologyOverlays, useGenerateRouteTopology, useDeleteSpatialElement, useSaveSpatialElement, type AgvSpatialElement } from "@/api/domains/agv-analysis.api";
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

const TAG_OPTIONS = ["充电", "作业", "路径", "等待", "休息站", "运输", "倒车"];
const TAG_COLORS: Record<string, string> = { "充电": "#22c55e", "作业": "#f59e0b", "路径": "#6b7280", "等待": "#f97316", "休息站": "#14b8a6", "运输": "#3b82f6", "倒车": "#ec4899" };
function makeRectPolygon(x1: number, y1: number, x2: number, y2: number): string {
  const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
  return JSON.stringify([[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]]);
}

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
  // 每台 AGV 独立标签显隐：{ "172.22.159.16": Set<"充电","作业",...>, ... }
  const [hiddenTagsByIp, setHiddenTagsByIp] = useState<Record<string, Set<string>>>(() => {
    const init: Record<string, Set<string>> = {};
    for (const r of ROBOTS) init[r.ip] = new Set<string>();
    return init;
  });
  const [hiddenRouteTypes, setHiddenRouteTypes] = useState<Set<string>>(new Set());
  const [vehicleIcon, setVehicleIcon] = useState<'arrow'|'forklift'>('forklift');
  const [routeMode, setRouteMode] = useState(false);
  const [followMode, setFollowMode] = useState(false);
  const [layout, setLayout] = useState<LayoutMode>("quad");
  const [singleTab, setSingleTab] = useState(0);
  // 标签胶囊条当前控制目标 IP — 无论单/双象限，标签开关只操作这一台车的 hiddenTagsByIp
  const [tagControlIp, setTagControlIp] = useState(ROBOTS[0].ip);

  // 切换布局/车辆时同步标签控制目标
  useEffect(() => {
    if (layout === "single") {
      setTagControlIp(ROBOTS[singleTab].ip);
    }
    // quad 模式下保持用户上次选择不变，不自动覆盖
  }, [layout, singleTab]);
  // 地图选点模式 — 支持单点标记 + 两点矩形
  const [pickMode, setPickMode] = useState(false);
  const [pickTwoPoint, setPickTwoPoint] = useState(false);
  const [pickAnchor, setPickAnchor] = useState<{ x: number; y: number } | null>(null);
  const [pendingPick, setPendingPick] = useState<{ x: number; y: number } | { x1: number; y1: number; x2: number; y2: number } | null>(null);
  // 点击区域标签弹出操作面板
  const [zonePopover, setZonePopover] = useState<{ id: number; name: string } | null>(null);
  const { append, seed, getTrail, clearAll } = useAgvTrailRef();

  useTrailSeed(seed);

  // 单点标记（原有模式）
  const handleStartPick = () => { setPickMode(true); setPickTwoPoint(false); setPickAnchor(null); setPendingPick(null); };
  // 两点矩形（新模式）
  const handleStartRectPick = () => { setPickMode(true); setPickTwoPoint(true); setPickAnchor(null); setPendingPick(null); };
  const handlePointPicked = (x: number, y: number) => {
    if (pickTwoPoint) {
      if (!pickAnchor) {
        setPickAnchor({ x, y });
      } else {
        setPendingPick({ x1: pickAnchor.x, y1: pickAnchor.y, x2: x, y2: y });
        setPickAnchor(null);
        setPickMode(false);
        setPickTwoPoint(false);
      }
    } else {
      setPendingPick({ x, y });
      setPickMode(false);
    }
  };
  const handleCancelPick = () => { setPickMode(false); setPickTwoPoint(false); setPickAnchor(null); setPendingPick(null); };
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
  const stopPlaybackKeepTimeline = () => {
    // 清掉回放进度条，让时间轴选择器显示出来
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
  const deleteZoneMut = useDeleteSpatialElement();
  const saveZoneMut = useSaveSpatialElement();

  const handleQuickSaveZone = (tag: string) => {
    if (!pendingPick) return;
    const color = TAG_COLORS[tag] || "#3b82f6";
    const polygonJson = 'x1' in pendingPick
      ? makeRectPolygon(pendingPick.x1, pendingPick.y1, pendingPick.x2, pendingPick.y2)
      : JSON.stringify([[pendingPick.x - 0.8, pendingPick.y + 0.8], [pendingPick.x + 0.8, pendingPick.y + 0.8], [pendingPick.x + 0.8, pendingPick.y - 0.8], [pendingPick.x - 0.8, pendingPick.y - 0.8]]);
    const element: AgvSpatialElement = {
      name: `${tag}标记`, elementType: "POLYGON_ZONE", polygonJson,
      semanticTags: JSON.stringify([tag]), mapName: "", color,
    };
    saveZoneMut.mutate(element, { onSuccess: () => setPendingPick(null) });
  };

  const handleZoneClick = (zoneId: number) => {
    const z = zones.find(item => item.id === zoneId);
    setZonePopover({ id: zoneId, name: z?.name || String(zoneId) });
  };
  const handleDeleteZone = () => {
    if (!zonePopover) return;
    deleteZoneMut.mutate(zonePopover.id);
    setZonePopover(null);
  };

  const routeOverlays = useMemo(() => {
    const all = buildTopologyOverlays(routeTopology);
    if (hiddenRouteTypes.size === 0) return all;
    return all.filter(r => !hiddenRouteTypes.has(r.routeType));
  }, [routeTopology, hiddenRouteTypes]);

  // ── Zone 隔离系统：按站点前缀编号分区，防止跨楼层/跨区域重叠 ──
  // AGV-1,2 → zone1 (LM1xxx/AP1xxx/CP1xxx) | AGV-3,4 → zone2 (LM2xxx/AP2xxx/CP2xxx)
  const AGV_ZONE_MAP: Record<string, 'zone1' | 'zone2'> = {
    "172.22.159.16": "zone1", "172.22.159.18": "zone1",
    "172.22.159.20": "zone2", "172.22.159.22": "zone2",
  };

  // 判断一个 zone 属于哪个区域：站号前缀 → 坐标回退
  function getZoneGroup(polygonJson: string, stationPattern?: string): 'zone1' | 'zone2' {
    if (stationPattern) {
      const m = stationPattern.match(/^(LM|AP|CP)(\d)/);
      if (m) return m[2] === '1' ? 'zone1' : 'zone2';
    }
    try {
      const p: number[][] = JSON.parse(polygonJson);
      if (p.length > 0) return p[0][0] < -5 ? 'zone1' : 'zone2';
    } catch {}
    return 'zone2';
  }


  // Zone overlays — 双象限按区域隔离（AGV-1+2 只看 zone1，AGV-3+4 只看 zone2）
  const pairZoneOverlays = useMemo(() => {
    const allZones = zones
      .filter(z => z.polygonJson && (z.elementType === "POLYGON_ZONE" || z.elementType === "STATION_ZONE"))
      .filter(z => z.source === "BEHAVIOR" || z.source === "MANUAL" || z.source === "TOPOLOGY" || (z.source === "AUTO" && (z.hitCount ?? 0) > 0))
      .map(z => {
        let cx = 0, cy = 0;
        try { const p: number[][] = JSON.parse(z.polygonJson!); for (const v of p) { cx += v[0]; cy += v[1]; } cx /= p.length; cy /= p.length; } catch {}
        const group = getZoneGroup(z.polygonJson!, z.stationPattern);
        return { id: z.id!, polygonJson: z.polygonJson!, color: z.color || "#3b82f6", name: z.name, cx, cy, group, robotIp: z.robotIp ?? undefined, semanticTags: z.semanticTags ?? "[]" };
      });
    const pairs = [[ROBOTS[0], ROBOTS[1]], [ROBOTS[2], ROBOTS[3]]];
    return pairs.map(([a, b]) => {
      const pairGroup = AGV_ZONE_MAP[a.ip];
      // 只取标签控制目标车的 hidden set（如果属于本 pair），不再取两台车并集
      const isControlInThisPair = AGV_ZONE_MAP[tagControlIp] === pairGroup;
      const hidden = isControlInThisPair ? (hiddenTagsByIp[tagControlIp] || new Set()) : new Set();
      // 双象限模式：标签控制目标车的专属 zone（robotIp 未设置=共享区域，始终可见）
      const pairIps = new Set([a.ip, b.ip]);
      return allZones.filter(z => {
        if (z.group !== pairGroup) return false;
        // robotIp 归属过滤：有归属则仅匹配车可见，无归属=共享
        if (z.robotIp && !pairIps.has(z.robotIp)) return false;
        if (hidden.size === 0) return true;
        try { const tags: string[] = JSON.parse(z.semanticTags || "[]"); return !tags.some(t => hidden.has(t)); } catch { return true; }
      });
    });
  }, [zones, hiddenTagsByIp, tagControlIp]);

  // 全量 zone（无裁剪，供单象限基础渲染）
  const canvasZoneOverlays = useMemo(() => {
    return zones
      .filter(z => z.polygonJson && (z.elementType === "POLYGON_ZONE" || z.elementType === "STATION_ZONE"))
      .filter(z => z.source === "BEHAVIOR" || z.source === "MANUAL" || z.source === "TOPOLOGY" || (z.source === "AUTO" && (z.hitCount ?? 0) > 0))
      .map(z => ({
        id: z.id!,
        polygonJson: z.polygonJson!,
        color: z.color || "#3b82f6",
        name: z.name,
        group: getZoneGroup(z.polygonJson!, z.stationPattern),
        robotIp: z.robotIp ?? undefined,
        semanticTags: z.semanticTags ?? "[]",
      }));
  }, [zones]);

  // 单象限：每台 AGV 只看自己区域的 zone + 自己独立的标签显隐
  const robotZoneOverlays = useMemo(() => {
    const result: Record<string, typeof canvasZoneOverlays> = {};
    for (const r of ROBOTS) {
      const agvGroup = AGV_ZONE_MAP[r.ip];
      const hidden = hiddenTagsByIp[r.ip] || new Set<string>();
      result[r.ip] = canvasZoneOverlays.filter(z => {
        if (z.group !== agvGroup) return false;
        // robotIp 归属过滤：有归属则仅匹配车可见，无归属=共享区域
        if (z.robotIp && z.robotIp !== r.ip) return false;
        if (hidden.size === 0) return true;
        try { const tags: string[] = JSON.parse(z.semanticTags || "[]"); return !tags.some(t => hidden.has(t)); } catch { return true; }
      });
    }
    return result;
  }, [canvasZoneOverlays, hiddenTagsByIp]);

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
          vehicleIcon={vehicleIcon}
          pickMode={pickMode}
          pickAnchor={pickAnchor}
          onPointPick={handlePointPicked}
          onZoneClick={handleZoneClick}
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
          onStopPlayback={stopPlaybackKeepTimeline}
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
      {/* 统一可视开关胶囊 — 区域 + 路线合并，随总开关显隐 */}
      {(showZones || routeMode) && (() => {
        const showZoneBar = showZones && zones.length > 0;
        const showRouteBar = routeMode;
        if (!showZoneBar && !showRouteBar) return null;

        // 当前标签控制目标车的 zone group
        const controlGroup = AGV_ZONE_MAP[tagControlIp] ?? 'zone1';
        // 当前控制目标车的标签
        const controlLabel = ROBOTS.find(r => r.ip === tagControlIp)?.label ?? tagControlIp;

        // 区域标签 — 只收集控制目标所属 zone 的标签
        const availableTags = new Set<string>();
        if (showZoneBar) {
          for (const z of zones) {
            if (!z.polygonJson) continue;
            const zoneNum = z.stationPattern?.match(/^(?:LM|AP|CP)(\d)/)?.[1];
            if (zoneNum === '1' && controlGroup !== 'zone1') continue;
            if (zoneNum === '2' && controlGroup !== 'zone2') continue;
            if (!zoneNum) {
              try { const p: number[][] = JSON.parse(z.polygonJson); if (p.length > 0 && (p[0][0] >= -5) !== (controlGroup === 'zone2')) continue; } catch {}
            }
            if (!z.semanticTags) continue;
            try { const tags: string[] = JSON.parse(z.semanticTags); for (const t of tags) availableTags.add(t); } catch {}
          }
        }

        const ROUTE_TAGS = [
          { key: "TRANSPORT", label: "运输", color: "#3b82f6" },
          { key: "STATION_WORK", label: "作业", color: "#f59e0b" },
          { key: "REST", label: "充电", color: "#22c55e" },
          { key: "NAVIGATING", label: "支线", color: "#9ca3af" },
          { key: "REVERSE", label: "单行", color: "#f85149" },
        ];

        // 可选的控制目标车列表（全部4台车可切换）
        const controllableVehicles = ROBOTS;

        // 当前控制目标的 hidden set
        const controlHidden = hiddenTagsByIp[tagControlIp] ?? new Set<string>();
        const allTagsHidden = TAG_OPTIONS.length > 0 && TAG_OPTIONS.every(t => controlHidden.has(t));

        return (
        <div className="absolute -top-6 right-4 z-[var(--z-overlay)] flex items-center gap-1 px-2.5 py-1 rounded-full bg-[var(--app-color-surface-container)]/90 backdrop-blur border border-[var(--app-color-border-default)] shadow-md">
          {/* 车辆选择器 — 始终显示4台车 */}
          <div className="relative flex items-center">
            <select
              value={tagControlIp}
              onChange={e => setTagControlIp(e.target.value)}
              className="appearance-none bg-transparent text-[9px] font-semibold text-[var(--app-color-accent)] pr-2 cursor-pointer outline-none"
            >
              {controllableVehicles.map(r => (
                <option key={r.ip} value={r.ip}>{r.label}</option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-0 text-[7px] text-[var(--app-color-text-tertiary)]">▾</span>
          </div>

          {/* 该车标签全开/全关总开关 */}
          <button onClick={() => {
              setHiddenTagsByIp(prev => {
                const next = { ...prev };
                if (allTagsHidden) {
                  next[tagControlIp] = new Set(); // 全开
                } else {
                  next[tagControlIp] = new Set(TAG_OPTIONS); // 全关
                }
                return next;
              });
            }}
            className={`text-[10px] leading-none transition-opacity ${allTagsHidden ? "opacity-30" : "opacity-100"}`}
            title={allTagsHidden ? `显示${controlLabel}全部标签` : `隐藏${controlLabel}全部标签`}
          >{allTagsHidden ? '◯' : '●'}</button>

          {showZoneBar && availableTags.size > 0 && (
            <>
              <span className="w-px h-3 bg-[var(--app-color-border-default)]" />
              {TAG_OPTIONS.filter(t => availableTags.has(t)).map(tag => (
                <button key={tag} onClick={() => {
                    // 🔑 核心：永远只操作 tagControlIp 这一台车
                    setHiddenTagsByIp(prev => {
                      const next = { ...prev };
                      const hidden = prev[tagControlIp]?.has(tag);
                      next[tagControlIp] = new Set(
                        hidden
                          ? [...(prev[tagControlIp] ?? [])].filter(t => t !== tag)
                          : [...(prev[tagControlIp] ?? []), tag]
                      );
                      return next;
                    });
                  }}
                  className={`px-1.5 py-0.5 rounded-full text-[9px] font-medium transition-colors ${controlHidden.has(tag) ? "opacity-30 bg-[var(--app-color-border-default)]" : "text-white"}`}
                  style={!controlHidden.has(tag) ? { backgroundColor: TAG_COLORS[tag] || "#3b82f6" } : {}}
                  title={controlHidden.has(tag) ? `显示${tag}区域` : `隐藏${tag}区域`}>{tag}</button>
              ))}
            </>
          )}
          {showRouteBar && (
            <>
              {showZoneBar && availableTags.size > 0 && <span className="w-px h-3 bg-[var(--app-color-border-default)]" />}
              <span className="text-[8px] text-[var(--app-color-text-tertiary)] shrink-0">路线</span>
              {ROUTE_TAGS.map(rt => (
                <button key={rt.key} onClick={() => setHiddenRouteTypes(prev => { const next = new Set(prev); if (prev.has(rt.key)) next.delete(rt.key); else next.add(rt.key); return next; })}
                  className={`px-1.5 py-0.5 rounded-full text-[9px] font-medium transition-colors ${hiddenRouteTypes.has(rt.key) ? "opacity-30 bg-[var(--app-color-border-default)]" : "text-white"}`}
                  style={!hiddenRouteTypes.has(rt.key) ? { backgroundColor: rt.color } : {}}
                  title={hiddenRouteTypes.has(rt.key) ? `显示${rt.label}路线` : `隐藏${rt.label}路线`}>{rt.label}</button>
              ))}
            </>
          )}
        </div>
        );
        })()}

      {/* Floating pill toolbar */}
      <AgvSidebar
        serverTime={data?.server_time ?? null}
        layout={layout} onLayoutChange={setLayout}
        singleTab={singleTab} onSingleTabChange={setSingleTab}
        analysisOpen={analysisOpen} onAnalysisToggle={() => setAnalysisOpen(v => !v)}
        showZones={showZones} onToggleZones={() => setShowZones(v => !v)}
        routeMode={routeMode} onToggleRouteMode={() => setRouteMode(v => !v)}
        followMode={followMode} onToggleFollowMode={() => setFollowMode(v => !v)}
        vehicleIcon={vehicleIcon} onToggleVehicleIcon={() => setVehicleIcon(v => v==='arrow'?'forklift':'arrow')}
        topologyGenerating={generateTopologyMut.isPending}
        onGenerateTopology={() => generateTopologyMut.mutate()}
        onStartRectPick={handleStartRectPick}
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
                vehicleIcon={vehicleIcon}
                pickMode={pickMode}
                pickAnchor={pickAnchor}
                onPointPick={handlePointPicked}
                onZoneClick={handleZoneClick}
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
        onRequestRectPick={handleStartRectPick}
        pendingPick={pendingPick}
        onClearPick={() => setPendingPick(null)}
        focusZoneId={zonePopover?.id ?? null}
      />

      {/* 选框完成 → 快捷标签选择器（弹窗关闭时直接在此显示，弹窗打开时由 AgvZonePanel 内部处理） */}
      {pendingPick && !pickMode && !analysisOpen && (
        <div className="absolute top-10 left-1/2 -translate-x-1/2 z-[var(--z-overlay)] flex items-center gap-2 px-3 py-2 rounded-full bg-[var(--app-color-surface-container)] border border-[var(--app-color-border-default)] shadow-lg">
          <span className="text-[10px] text-[var(--app-color-text-secondary)] whitespace-nowrap">
            {'x1' in pendingPick ? '矩形区域 · 选择标签' : '标记点 · 选择标签'}
          </span>
          <div className="flex gap-1">
            {TAG_OPTIONS.map(tag => (
              <button key={tag} onClick={() => handleQuickSaveZone(tag)} disabled={saveZoneMut.isPending}
                className="px-2.5 py-1 rounded-full text-[10px] font-medium text-white hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: TAG_COLORS[tag] }}>
                {tag}
              </button>
            ))}
          </div>
          <button onClick={() => setPendingPick(null)} className="text-[10px] text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-text-primary)]">取消</button>
        </div>
      )}

      {/* 地图选点模式浮动提示条 — 单点 / 两点矩形 */}
      {pickMode && (
        <div
          onClick={handleCancelPick}
          className="absolute top-10 left-1/2 -translate-x-1/2 z-[var(--z-overlay)] flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--app-color-accent)] text-white text-xs font-medium shadow-lg cursor-pointer hover:opacity-90 transition-opacity select-none"
        >
          <span className="text-base">{pickTwoPoint ? "📐" : "📍"}</span>
          {pickTwoPoint ? (
            pickAnchor ? (
              <span>点击第二个角点完成矩形区域</span>
            ) : (
              <span>点击第一个角点标记矩形区域</span>
            )
          ) : (
            <span>在地图上点击标记位置</span>
          )}
          <span className="text-[10px] opacity-70">· Esc 取消</span>
        </div>
      )}

      {/* 区域标签点击弹出操作面板（底部居中，不受坐标偏移影响） */}
      {zonePopover && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[var(--z-tooltip)]" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-full bg-[var(--app-color-surface-container)] border border-[var(--app-color-border-default)] shadow-lg">
            <span className="text-[12px] font-medium text-[var(--app-color-text-primary)]">{zonePopover.name}</span>
            <button
              onClick={() => { setAnalysisOpen(true); setZonePopover(null); }}
              className="px-3 py-1 rounded-full text-[11px] bg-[var(--app-color-accent-soft)] text-[var(--app-color-accent)] hover:opacity-80"
            >编辑</button>
            <button
              onClick={handleDeleteZone}
              className="px-3 py-1 rounded-full text-[11px] bg-red-50 text-red-500 hover:bg-red-100"
            >删除</button>
            <button
              onClick={() => setZonePopover(null)}
              className="ml-1 w-5 h-5 rounded-full border border-[var(--app-color-border-default)] text-[11px] flex items-center justify-center hover:bg-[var(--app-color-surface-hover)]"
            >✕</button>
          </div>
        </div>
      )}

    </div>
  );
}
