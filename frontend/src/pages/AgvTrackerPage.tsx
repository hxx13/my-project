import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAgvCurrent, fetchAgvRecent, fetchAgvTrajectory, fetchCoordConfigs, updateCoordConfig, fetchHistoryPlayback, type AgvRobotStatus, type HistoryPlaybackResponse } from "@/api/domains/agv.api";
import { useSpatialElements, useRouteTopology, buildTopologyOverlays, useGenerateRouteTopology, useDeleteSpatialElement, useSaveSpatialElement, type AgvSpatialElement } from "@/api/domains/agv-analysis.api";
import { useAgvTrailRef } from "@/features/agv-tracker/useAgvTrailRef";
import { computeSpeed, smoothSpeed, currentSpeed, detectDwellSegments, smartSampleTrail, type TrailPoint } from "@/features/agv-tracker/agvAnalytics";
import { classifyActivity } from "@/features/agv-tracker/agvActivityClassifier";
import { AGV_ZONE_MAP, resolveZoneGroup, type ZoneGroup } from "@/features/agv-tracker/zoneGrouping";
import AgvQuadrant from "@/features/agv-tracker/AgvQuadrant";
import AgvDualQuadrant from "@/features/agv-tracker/AgvDualQuadrant";
import AgvSidebar from "@/features/agv-tracker/AgvSidebar";
import AgvAnalysisModal from "@/features/agv-tracker/AgvAnalysisModal";
import { makeRectPolygon } from "@/features/agv-tracker/AgvZonePanel";

const ROBOTS = [
  { ip: "172.22.159.16", label: "AGV-1", color: "#3b82f6" },
  { ip: "172.22.159.18", label: "AGV-2", color: "#22c55e" },
  { ip: "172.22.159.20", label: "AGV-3", color: "#f59e0b" },
  { ip: "172.22.159.22", label: "AGV-4", color: "#8b5cf6" },
];

import { BUILTIN_TAG_OPTIONS, BUILTIN_TAG_COLORS, loadCustomTags, saveCustomTags, getAllTagOptions, getAllTagColors, getVisibleTags, createCustomTag, type CustomTag } from "@/features/agv-tracker/tagConfig";

/** Derive activity type from raw telemetry — delegated to configurable rule engine */
function deriveActivity(s: AgvRobotStatus | null): string | undefined {
  if (!s) return undefined;
  return classifyActivity({
    task_status: s.task_status ?? null,
    charging: s.charging ?? null,
    fork_height: s.fork_height ?? null,
  });
}

type LayoutMode = "quad" | "single";

function useTrailSeed(seed: (ip: string, points: TrailPoint[]) => void, getTrail: (ip: string) => TrailPoint[]) {
  const [, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const now = new Date().toISOString();
    const ago24h = new Date(Date.now() - 24 * 3600_000).toISOString();
    const ago7d = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();

    Promise.all(ROBOTS.map((r) =>
      fetchAgvTrajectory(r.ip, ago24h, now, 10000).then((rows) => {
        if (cancelled || !rows.length) return;
        const sorted = rows
          .filter((row) => row.x != null && row.y != null)
          .sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime())
          .map((row) => ({ x: row.x, y: row.y, angle: row.angle ?? 0, ts: new Date(row.recorded_at).getTime() }));
        const filtered = smartSample(sorted);
        if (filtered.length > 0) seed(r.ip, filtered);
      }).catch(() => {}),
    )).finally(() => {
      if (cancelled) return;
      // 兜底：离线 AGV 无 24h 数据 → 扩大到 7 天，全静止则缩小 to 窗口往前翻找移动段
      for (const r of ROBOTS) {
        const trail = getTrail(r.ip);
        if (trail.length > 0) continue;

        const doFallback = (endTime: string, depth: number) => {
          if (depth > 5) return; // 最多翻 5 次
          fetchAgvTrajectory(r.ip, ago7d, endTime, 2000).then((rows) => {
            if (cancelled || !rows.length) return;
            const pts = rows
              .filter(row => row.x != null && row.y != null)
              .sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime())
              .map(row => ({ x: row.x!, y: row.y!, angle: row.angle ?? 0, ts: new Date(row.recorded_at).getTime() }));
            if (pts.length === 0) return;

            // 检查是否全同位置（范围 < 0.1m）
            const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
            const rangeX = Math.max(...xs) - Math.min(...xs);
            const rangeY = Math.max(...ys) - Math.min(...ys);
            if (rangeX < 0.1 && rangeY < 0.1) {
              seed(r.ip, pts); // 先存下（图标定位用）
              // 用最早点的时间戳作新的 to，向前翻
              const oldestTs = pts[0].ts;
              const newTo = new Date(oldestTs - 1000).toISOString();
              console.log(`[fallback] ${r.ip} stationary at depth=${depth}, digging before ${new Date(oldestTs).toLocaleString("zh-CN")}`);
              doFallback(newTo, depth + 1);
              return;
            }
            console.log(`[fallback] ${r.ip} found movement depth=${depth}, ${pts.length}pts span=(${rangeX.toFixed(2)},${rangeY.toFixed(2)})`);
            seed(r.ip, pts);
          }).catch(() => {});
        };
        doFallback(now, 0);
      }
      setTick((t) => t + 1);
    });
    return () => { cancelled = true; };
  }, [seed, getTrail]);
}

function smartSample(points: { x: number; y: number; angle: number; ts: number }[]): typeof points {
  return smartSampleTrail(points);
}

export default function AgvTrackerPage() {
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [showZones, setShowZones] = useState(true);
  // 每台 AGV 独立标签显隐：{ "172.22.159.16": Set<"充电","作业",...>, ... }
  // 从 localStorage 恢复标签显隐
  const loadHiddenTags = (): Record<string, Set<string>> => {
    try {
      const raw = localStorage.getItem('agvHiddenTags');
      if (raw) {
        const parsed = JSON.parse(raw);
        const result: Record<string, Set<string>> = {};
        for (const r of ROBOTS) result[r.ip] = new Set(parsed[r.ip] || []);
        return result;
      }
    } catch {}
    const init: Record<string, Set<string>> = {};
    for (const r of ROBOTS) init[r.ip] = new Set<string>();
    return init;
  };
  const [hiddenTagsByIp, setHiddenTagsByIp] = useState<Record<string, Set<string>>>(loadHiddenTags);
  // 自动缓存到 localStorage
  useEffect(() => {
    const obj: Record<string, string[]> = {};
    for (const ip of Object.keys(hiddenTagsByIp)) obj[ip] = [...hiddenTagsByIp[ip]];
    localStorage.setItem('agvHiddenTags', JSON.stringify(obj));
  }, [hiddenTagsByIp]);
  const [hiddenRouteTypes, setHiddenRouteTypes] = useState<Set<string>>(new Set());
  const [hiddenAgvs, setHiddenAgvs] = useState<Set<string>>(new Set());

  const toggleHiddenTag = (ip: string, tag: string) => {
    setHiddenTagsByIp(prev => {
      const next = { ...prev };
      const cur = new Set(prev[ip] ?? []);
      if (cur.has(tag)) cur.delete(tag); else cur.add(tag);
      next[ip] = cur;
      return next;
    });
  };
  const [vehicleIcon, setVehicleIcon] = useState<'arrow'|'forklift'>(
    () => (localStorage.getItem('agvVehicleIcon') as 'arrow'|'forklift') || 'forklift'
  );
  useEffect(() => { localStorage.setItem('agvVehicleIcon', vehicleIcon); }, [vehicleIcon]);
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
  const [zonePopover, setZonePopover] = useState<{ id: number; name: string; stationPattern?: string; color?: string } | null>(null);
  // 编辑模式：当前选中的 zone（画布上显示角手柄，可拖拽调整）
  const [selectedZoneId, setSelectedZoneId] = useState<number | null>(null);
  // 编辑模式开关：分离为坐标系编辑 + 标签编辑
  const [coordEditMode, setCoordEditMode] = useState(false);
  const [zoneEditMode, setZoneEditMode] = useState(false);
  // ── 坐标系预设（localStorage） ──
  const COORD_PRESET_KEY = "agvCoordPreset";
  const [coordPresetSaved, setCoordPresetSaved] = useState(!!localStorage.getItem(COORD_PRESET_KEY));
  const handleSaveCoordPreset = () => {
    if (!coordConfigs) return;
    localStorage.setItem(COORD_PRESET_KEY, JSON.stringify(coordConfigs));
    setCoordPresetSaved(true);
  };
  const handleRestoreCoordPreset = async () => {
    const raw = localStorage.getItem(COORD_PRESET_KEY);
    if (!raw) return;
    try {
      const preset: Record<string, any> = JSON.parse(raw);
      for (const r of ROBOTS) {
        const p = preset[r.ip];
        if (p) {
          await updateCoordConfig(r.ip, p.rotationDeg, p.offsetX, p.offsetY);
        }
      }
      qc.invalidateQueries({ queryKey: ["agvCoordConfigs"] });
    } catch {}
  };
  const handleResetCoordZero = async () => {
    for (const r of ROBOTS) {
      await updateCoordConfig(r.ip, 0, 0, 0);
    }
    qc.invalidateQueries({ queryKey: ["agvCoordConfigs"] });
  };
  // ── 撤回历史 ──
  const undoStackRef = useRef<{ label: string; undo: () => void }[]>([]);
  const [undoLabel, setUndoLabel] = useState<string | null>(null);
  const pushUndo = (label: string, undo: () => void) => {
    undoStackRef.current.push({ label, undo });
    if (undoStackRef.current.length > 30) undoStackRef.current.shift();
    setUndoLabel(label);
  };
  const handleUndoRef = useRef(() => {});
  handleUndoRef.current = () => {
    const entry = undoStackRef.current.pop();
    if (entry) {
      entry.undo();
      setUndoLabel(undoStackRef.current.length > 0 ? undoStackRef.current[undoStackRef.current.length - 1].label : null);
    }
  };
  const handleUndo = () => handleUndoRef.current();
  // Ctrl+Z 监听
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey && undoStackRef.current.length > 0) {
        e.preventDefault();
        handleUndoRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  // 自定义标签
  const [customTags, setCustomTags] = useState<CustomTag[]>(loadCustomTags);
  const allTagOptions = useMemo(() => getAllTagOptions(customTags), [customTags]);
  const allTagColors = useMemo(() => getAllTagColors(customTags), [customTags]);
  const handleAddCustomTag = (name: string, color: string, scope: "world" | "agv", agvIp?: string) => {
    const tag = createCustomTag(name, color, scope, agvIp);
    const next = [...customTags, tag];
    setCustomTags(next);
    saveCustomTags(next);
  };
  const handleDeleteCustomTag = (id: string) => {
    const next = customTags.filter(t => t.id !== id);
    setCustomTags(next);
    saveCustomTags(next);
  };
  // 创建 zone 时可选的标签（可见的标签，按当前 tagControlIp 过滤作用域）
  const creatableTags = useMemo(
    () => getVisibleTags(tagControlIp, customTags),
    [tagControlIp, customTags],
  );
  const { append, seed, getTrail, clearAll } = useAgvTrailRef();

  useTrailSeed(seed, getTrail);

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
  // 拖拽绘制矩形完成 → 直接进入标签选择
  const handleRectDrawn = (x1: number, y1: number, x2: number, y2: number) => {
    setPendingPick({ x1, y1, x2, y2 });
    setPickAnchor(null);
    setPickMode(false);
    setPickTwoPoint(false);
  };
  // 编辑模式：zone 大小/位置已更改 → 乐观更新 + 保存
  const handleZoneReshape = (id: number, polygonJson: string) => {
    const oldJson = zones.find(z => z.id === id)?.polygonJson;
    if (oldJson && oldJson !== polygonJson) {
      pushUndo("移动/调整区域", () => {
        qc.setQueryData<AgvSpatialElement[]>(["agvSpatialElements"], (old) =>
          old?.map(z => z.id === id ? { ...z, polygonJson: oldJson } : z)
        );
        saveZoneMut.mutate({ id, polygonJson: oldJson } as AgvSpatialElement);
      });
    }
    qc.setQueryData<AgvSpatialElement[]>(["agvSpatialElements"], (old) =>
      old?.map(z => z.id === id ? { ...z, polygonJson } : z)
    );
    saveZoneMut.mutate({ id, polygonJson } as AgvSpatialElement);
  };
  // 编辑模式：拖拽参考系包围盒 → 更新该 AGV 的 offset
  const lastCoordOffsetRef = useRef<Record<string, { ox: number; oy: number }>>({});
  // ── Scale 持久化（localStorage） ──
  const SCALE_KEY = "agvCoordScales";
  const getStoredScales = (): Record<string, number> => { try { return JSON.parse(localStorage.getItem(SCALE_KEY) || "{}"); } catch { return {}; } };
  const saveStoredScales = (s: Record<string, number>) => localStorage.setItem(SCALE_KEY, JSON.stringify(s));
  const handleCoordFrameScale = async (ip: string, scale: number, offsetX: number, offsetY: number) => {
    const scales = getStoredScales();
    scales[ip] = scale;
    saveStoredScales(scales);
    // 更新 query cache
    qc.setQueryData(["agvCoordConfigs"], (old: any) => ({ ...old, [ip]: { ...old?.[ip], offsetX, offsetY, scale } }));
    // 同时保存 offset 到后端
    const frame = coordConfigs?.[ip];
    await updateCoordConfig(ip, frame?.rotationDeg, offsetX, offsetY);
  };
  const handleCoordFrameMove = async (ip: string, offsetX: number, offsetY: number) => {
    const frame = coordConfigs?.[ip];
    const prev = lastCoordOffsetRef.current[ip];
    if (!prev || Math.abs(prev.ox - offsetX) > 0.001 || Math.abs(prev.oy - offsetY) > 0.001) {
      const oldOx = frame?.offsetX ?? 0, oldOy = frame?.offsetY ?? 0;
      pushUndo(`${ip.endsWith(".16") ? "AGV-1" : ip.endsWith(".18") ? "AGV-2" : ip.endsWith(".20") ? "AGV-3" : "AGV-4"} 参考系移动`, async () => {
        qc.setQueryData(["agvCoordConfigs"], (old: any) => ({ ...old, [ip]: { ...old?.[ip], offsetX: oldOx, offsetY: oldOy } }));
        await updateCoordConfig(ip, frame?.rotationDeg, oldOx, oldOy);
      });
    }
    lastCoordOffsetRef.current[ip] = { ox: offsetX, oy: offsetY };
    qc.setQueryData(["agvCoordConfigs"], (old: any) => {
      if (!old) return old;
      return { ...old, [ip]: { ...old[ip], offsetX, offsetY } };
    });
    await updateCoordConfig(ip, frame?.rotationDeg, offsetX, offsetY);
  };
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
        fetchAgvTrajectory(r.ip, ago, now, 10000).then(rows => {
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
  const qc = useQueryClient();

  const handleQuickSaveZone = (tag: string) => {
    if (!pendingPick) return;
    const isRect = 'x1' in pendingPick;
    const color = allTagColors[tag] || "#3b82f6";
    const polygonJson = isRect
      ? makeRectPolygon(pendingPick.x1, pendingPick.y1, pendingPick.x2, pendingPick.y2)
      : JSON.stringify([[pendingPick.x - 0.8, pendingPick.y + 0.8], [pendingPick.x + 0.8, pendingPick.y + 0.8], [pendingPick.x + 0.8, pendingPick.y - 0.8], [pendingPick.x - 0.8, pendingPick.y - 0.8]]);
    const element: AgvSpatialElement = {
      name: `${tag}标记`, elementType: "POLYGON_ZONE", polygonJson,
      semanticTags: JSON.stringify([tag]), mapName: "", color,
      source: isRect ? "MANUAL_RECT" : "MANUAL",
    };
    saveZoneMut.mutate(element, { onSuccess: () => setPendingPick(null) });
  };

  const handleZoneClick = (zoneId: number, labelName: string, stationPattern?: string) => {
    const displayName = stationPattern ? `${stationPattern} · ${labelName}` : labelName;
    const zoneColor = zones.find(z => z.id === zoneId)?.color;
    setZonePopover({ id: zoneId, name: displayName, stationPattern, color: zoneColor });
    setSelectedZoneId(zoneId);
  };
  const handleDeleteZone = () => {
    if (!zonePopover) return;
    const deletedZone = zones.find(z => z.id === zonePopover.id);
    if (deletedZone) {
      pushUndo(`删除「${deletedZone.name}」`, () => {
        saveZoneMut.mutate(deletedZone as AgvSpatialElement);
      });
    }
    deleteZoneMut.mutate(zonePopover.id);
    setZonePopover(null);
    setSelectedZoneId(null);
  };
  const handleZoneColorChange = (color: string) => {
    if (!zonePopover) return;
    const oldColor = zonePopover.color;
    if (oldColor && oldColor !== color) {
      pushUndo("更改颜色", () => {
        qc.setQueryData<AgvSpatialElement[]>(["agvSpatialElements"], (old) =>
          old?.map(z => z.id === zonePopover.id ? { ...z, color: oldColor } : z)
        );
        saveZoneMut.mutate({ id: zonePopover.id, color: oldColor } as AgvSpatialElement);
      });
    }
    qc.setQueryData<AgvSpatialElement[]>(["agvSpatialElements"], (old) =>
      old?.map(z => z.id === zonePopover.id ? { ...z, color } : z)
    );
    saveZoneMut.mutate({ id: zonePopover.id, color } as AgvSpatialElement);
    setZonePopover(prev => prev ? { ...prev, color } : null);
  };

  const routeOverlays = useMemo(() => {
    const all = buildTopologyOverlays(routeTopology);
    if (hiddenRouteTypes.size === 0) return all;
    return all.filter(r => !hiddenRouteTypes.has(r.routeType));
  }, [routeTopology, hiddenRouteTypes]);

  // ── Zone 隔离系统：按站点前缀编号分区，防止跨楼层/跨区域重叠 ──
  // 逻辑已提取到 zoneGrouping.ts：
  //   AGV_ZONE_MAP   — AGV-1,2→zone1 | AGV-3,4→zone2
  //   resolveZoneGroup — 站号前缀+坐标回退判定区域
  //
  // 后续扩展：如需 zone3/zone4 或按地图名隔离，只需在 zoneGrouping.ts 添加规则

  // Zone overlays — 双象限按区域隔离（AGV-1+2 只看 zone1，AGV-3+4 只看 zone2）
  const pairZoneOverlays = useMemo(() => {
    const allZones = zones
      .filter(z => z.polygonJson && (z.elementType === "POLYGON_ZONE" || z.elementType === "STATION_ZONE"))
      .filter(z => z.source === "BEHAVIOR" || z.source === "MANUAL" || z.source === "MANUAL_RECT" || z.source === "TOPOLOGY" || (z.source === "AUTO" && (z.hitCount ?? 0) > 0))
      .map(z => {
        let cx = 0, cy = 0;
        try { const p: number[][] = JSON.parse(z.polygonJson!); for (const v of p) { cx += v[0]; cy += v[1]; } cx /= p.length; cy /= p.length; } catch {}
        const group = resolveZoneGroup(z.polygonJson!, z.stationPattern);
        return { id: z.id!, polygonJson: z.polygonJson!, color: z.color || "#3b82f6", name: z.name, stationPattern: z.stationPattern ?? undefined, cx, cy, group, robotIp: z.robotIp ?? undefined, semanticTags: z.semanticTags ?? "[]", source: z.source ?? "AUTO" };
      });
    const pairs = [[ROBOTS[0], ROBOTS[1]], [ROBOTS[2], ROBOTS[3]]];
    return pairs.map(([a, b]) => {
      const pairGroup = AGV_ZONE_MAP[a.ip];
      const isControlInThisPair = AGV_ZONE_MAP[tagControlIp] === pairGroup;
      const hidden = isControlInThisPair ? (hiddenTagsByIp[tagControlIp] || new Set()) : new Set();
      const pairIps = new Set([a.ip, b.ip]);
      return allZones.filter(z => {
        if (z.group !== pairGroup) return false;
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
      .filter(z => z.source === "BEHAVIOR" || z.source === "MANUAL" || z.source === "MANUAL_RECT" || z.source === "TOPOLOGY" || (z.source === "AUTO" && (z.hitCount ?? 0) > 0))
      .map(z => ({
        id: z.id!,
        polygonJson: z.polygonJson!,
        color: z.color || "#3b82f6",
        name: z.name,
        stationPattern: z.stationPattern ?? undefined,
        group: resolveZoneGroup(z.polygonJson!, z.stationPattern),
        robotIp: z.robotIp ?? undefined,
        semanticTags: z.semanticTags ?? "[]",
        source: z.source ?? "AUTO",
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

  // 离线兜底缓存：AGV 掉线后仍显示最后一次有效值
  const lastKnownRef = useRef<Record<string, Record<string, unknown>>>({});

  // Shared AGV info extractor — used by both single (AgvQuadrant) and merged (AgvDualQuadrant) views
  const buildAgvInfo = (r: typeof ROBOTS[number]) => {
    const s = getStatus(r.ip);
    const lp = getLastPolled(r.ip);
    const online = lp != null && Date.now() - new Date(lp).getTime() < 10_000;
    const a = robotAnalytics[r.ip];
    const last = (lastKnownRef.current[r.ip] ?? {}) as Record<string, any>;
    const trail = getTrail(r.ip);
    const lastTrail = trail.length > 0 ? trail[trail.length - 1] : null;

    // 构建兜底值：实时数据优先，离线用缓存，再不行用轨迹最后点
    const battery = s?.battery_level ?? last.battery ?? null;
    const angle = s?.angle ?? lastTrail?.angle ?? last.angle ?? 0;
    const station = s?.current_station ?? last.station ?? "—";
    const mapName = s?.current_map ?? last.mapName ?? "—";
    const speed = a.speed ?? 0;
    const odo = s?.odo ?? last.odo ?? 0;
    const rssi = s?.rssi ?? last.rssi ?? null;
    const forkHeight = s?.fork_height ?? last.forkHeight ?? 0;
    const taskStatus = s?.task_status ?? last.taskStatus ?? null;
    const charging = s?.charging ?? last.charging ?? false;
    const coordFrame = coordConfigs?.[r.ip];
    const coordRotationDeg = coordFrame?.rotationDeg ?? last.coordRotationDeg ?? 0;
    const coordOffsetX = coordFrame?.offsetX ?? last.coordOffsetX ?? 0;
    const coordOffsetY = coordFrame?.offsetY ?? last.coordOffsetY ?? 0;
    const storedScales = getStoredScales();
    const coordScale = (coordFrame as any)?.scale ?? storedScales[r.ip] ?? last.coordScale ?? 1;

    const info = {
      ip: r.ip, label: r.label, online, color: r.color, trail,
      x: s?.x ?? null, y: s?.y ?? null, angle,
      speed, avgSpeed: a.avgSpeed ?? 0, maxSpeed: a.maxSpeed ?? 0,
      dwellSpots: dwellByIp[r.ip],
      battery, charging,
      taskStatus, blocked: s?.blocked ?? false, emergency: s?.emergency ?? false,
      station, mapName,
      confidence: s?.confidence ?? last.confidence ?? null,
      relocStatus: s?.reloc_status ?? last.relocStatus ?? null,
      loadmapStatus: s?.loadmap_status ?? last.loadmapStatus ?? null,
      odo, rssi, driverEmc: s?.driver_emc ?? last.driverEmc ?? null,
      forkHeight, forkInPlace: s?.fork_height_in_place ?? null,
      jackEnable: s?.jack_enable ?? last.jackEnable ?? null,
      jackState: s?.jack_state ?? last.jackState ?? null,
      jackIsFull: s?.jack_isFull ?? last.jackIsFull ?? null,
      jackMode: s?.jack_mode ?? last.jackMode ?? null,
      jackErrorCode: s?.jack_error_code ?? last.jackErrorCode ?? null,
      errors: s?.errors ?? null, warnings: s?.warnings ?? null,
      diChannels: s?.DI ?? last.diChannels ?? null,
      coordRotationDeg,
      coordOffsetX,
      coordOffsetY,
      coordScale,
      currentActivity: deriveActivity(s),
    };

    // 只缓存有效值，不覆盖已有缓存为 null
    const cache = lastKnownRef.current;
    const prev = cache[r.ip] ?? {};
    for (const [k, v] of Object.entries(info)) {
      if (v != null) (prev as any)[k] = v;
    }
    cache[r.ip] = prev;
    return info;
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
          coordOffsetX={info.coordOffsetX} coordOffsetY={info.coordOffsetY} coordScale={info.coordScale}
          zoneOverlays={showZones ? robotZoneOverlays[r.ip] : []}
          routeOverlays={routeMode ? routeOverlays.filter(ro => ro.robotIp === r.ip) : []}
          routeMode={routeMode}
          followMode={followMode}
          currentActivity={info.currentActivity}
          vehicleIcon={vehicleIcon}
          pickMode={pickMode}
          pickTwoPoint={pickTwoPoint}
          pickAnchor={pickAnchor}
          onPointPick={handlePointPicked}
          onRectDrawn={handleRectDrawn}
          onZoneClick={handleZoneClick}
          coordEditMode={coordEditMode} zoneEditMode={zoneEditMode}
          selectedZoneId={selectedZoneId}
          onZoneSelect={setSelectedZoneId}
          onZoneReshape={handleZoneReshape}
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
          { key: "STATION_WORK", label: "载货", color: "#f59e0b" },
          { key: "REST", label: "充电", color: "#22c55e" },
          { key: "NAVIGATING", label: "寻路", color: "#6b7280" },
        ];

        // 可选的控制目标车列表（全部4台车可切换）
        const controllableVehicles = ROBOTS;

        // 当前控制目标的 hidden set
        const controlHidden = hiddenTagsByIp[tagControlIp] ?? new Set<string>();
        const allTagsHidden = allTagOptions.length > 0 && allTagOptions.every(t => controlHidden.has(t));

        return (
        <div className="absolute -top-6 right-4 z-[var(--z-overlay)] flex items-center gap-1 px-2.5 py-1 rounded-full bg-[var(--app-color-surface-container)]/90 backdrop-blur border border-[var(--app-color-border-default)] shadow-md">
          {/* 路线开关 */}
          {showRouteBar && (
            <>
              <span className="text-[8px] text-[var(--app-color-text-tertiary)] shrink-0">路线</span>
              {ROUTE_TAGS.map(rt => (
                <button key={rt.key} onClick={() => setHiddenRouteTypes(prev => { const next = new Set(prev); if (prev.has(rt.key)) next.delete(rt.key); else next.add(rt.key); return next; })}
                  className={`px-1.5 py-0.5 rounded-full text-[9px] font-medium transition-colors ${hiddenRouteTypes.has(rt.key) ? "opacity-30 bg-[var(--app-color-border-default)]" : "text-white"}`}
                  style={!hiddenRouteTypes.has(rt.key) ? { backgroundColor: rt.color } : {}}
                  title={hiddenRouteTypes.has(rt.key) ? `显示${rt.label}路线` : `隐藏${rt.label}路线`}>{rt.label}</button>
              ))}
              <span className="w-px h-3 bg-[var(--app-color-border-default)]" />
            </>
          )}
          {/* AGV 快速显隐开关 */}
          {controllableVehicles.map(r => {
            const hidden = hiddenAgvs.has(r.ip);
            return (
              <button key={`vis-${r.ip}`} onClick={() => setHiddenAgvs(prev => {
                const next = new Set(prev);
                hidden ? next.delete(r.ip) : next.add(r.ip);
                return next;
              })}
                className={`text-[9px] font-medium transition-opacity ${hidden ? "opacity-25" : "opacity-100"}`}
                style={{ color: r.color }}
                title={hidden ? `显示${r.label}` : `隐藏${r.label}`}>
                {hidden ? "○" : "●"} {r.label}
              </button>
            );
          })}
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
        coordEditMode={coordEditMode} onToggleCoordEditMode={() => setCoordEditMode(v => !v)}
        zoneEditMode={zoneEditMode} onToggleZoneEditMode={() => setZoneEditMode(v => !v)}
        vehicleIcon={vehicleIcon} onToggleVehicleIcon={() => setVehicleIcon(v => v==='arrow'?'forklift':'arrow')}
        topologyGenerating={generateTopologyMut.isPending}
        onGenerateTopology={() => generateTopologyMut.mutate()}
        onStartRectPick={handleStartRectPick}
        hiddenTagsByIp={hiddenTagsByIp}
        onToggleHiddenTag={toggleHiddenTag}
        customTags={customTags}
        onAddCustomTag={handleAddCustomTag}
        onDeleteCustomTag={handleDeleteCustomTag}
        allTagColors={allTagColors}
        creatableTags={creatableTags}
        undoLabel={undoLabel}
        onUndo={handleUndo}
        onSaveCoordPreset={handleSaveCoordPreset}
        onRestoreCoordPreset={handleRestoreCoordPreset}
        onResetCoordZero={handleResetCoordZero}
        coordPresetSaved={coordPresetSaved}
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
                hiddenAgvs={hiddenAgvs}
                pickMode={pickMode}
                pickTwoPoint={pickTwoPoint}
                pickAnchor={pickAnchor}
                onPointPick={handlePointPicked}
                onRectDrawn={handleRectDrawn}
                onZoneClick={handleZoneClick}
                coordEditMode={coordEditMode} zoneEditMode={zoneEditMode}
                selectedZoneId={selectedZoneId}
                onZoneSelect={setSelectedZoneId}
                onZoneReshape={handleZoneReshape}
                onCoordFrameMove={handleCoordFrameMove}
                onCoordFrameScale={handleCoordFrameScale}
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
        creatableTags={creatableTags}
        allTagColors={allTagColors}
      />

      {/* 选框完成 → 快捷标签选择器（弹窗关闭时直接在此显示，弹窗打开时由 AgvZonePanel 内部处理） */}
      {pendingPick && !pickMode && !analysisOpen && (
        <div className="absolute top-10 left-1/2 -translate-x-1/2 z-[var(--z-overlay)] flex items-center gap-2 px-3 py-2 rounded-full bg-[var(--app-color-surface-container)] border border-[var(--app-color-border-default)] shadow-lg">
          <span className="text-[10px] text-[var(--app-color-text-secondary)] whitespace-nowrap">
            {'x1' in pendingPick ? '矩形区域 · 选择标签' : '标记点 · 选择标签'}
          </span>
          <div className="flex gap-1">
            {creatableTags.map(tag => (
              <button key={tag} onClick={() => handleQuickSaveZone(tag)} disabled={saveZoneMut.isPending}
                className="px-2.5 py-1 rounded-full text-[10px] font-medium text-white hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: allTagColors[tag] || "#6b7280" }}>
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

      {/* 区域标签点击弹出操作面板（底部居中） */}
      {zonePopover && !zoneEditMode && !coordEditMode && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[var(--z-tooltip)]" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-[var(--app-color-surface-container)] border border-[var(--app-color-border-default)] shadow-lg">
            <span className="text-[12px] font-medium text-[var(--app-color-text-primary)]">{zonePopover.name}</span>
            <input type="color" value={zonePopover.color || "#3b82f6"}
              onChange={e => handleZoneColorChange(e.target.value)}
              className="w-5 h-5 rounded-full border border-[var(--app-color-border-default)] cursor-pointer p-0 overflow-hidden"
              title="更改颜色"
            />
            <button
              onClick={() => { setAnalysisOpen(true); setZonePopover(null); }}
              className="px-3 py-1 rounded-full text-[11px] bg-[var(--app-color-accent-soft)] text-[var(--app-color-accent)] hover:opacity-80"
            >编辑</button>
            <button
              onClick={handleDeleteZone}
              className="px-3 py-1 rounded-full text-[11px] bg-red-50 text-red-500 hover:bg-red-100"
            >删除</button>
            <button
              onClick={() => { setZonePopover(null); setSelectedZoneId(null); }}
              className="ml-1 w-5 h-5 rounded-full border border-[var(--app-color-border-default)] text-[11px] flex items-center justify-center hover:bg-[var(--app-color-surface-hover)]"
            >✕</button>
          </div>
        </div>
      )}

      {/* 编辑模式详情面板：选中 zone 时底部展示完整信息 */}
      {zoneEditMode && zonePopover && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[var(--z-tooltip)]" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-full bg-[var(--app-color-surface-container)] border border-[var(--app-color-border-default)] shadow-lg">
            {/* 颜色指示 */}
            <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: zonePopover.color || "#3b82f6" }} />
            {/* 名称 */}
            <span className="text-[12px] font-semibold text-[var(--app-color-text-primary)] whitespace-nowrap">{zonePopover.name}</span>
            {/* 颜色选择 */}
            <input type="color" value={zonePopover.color || "#3b82f6"}
              onChange={e => handleZoneColorChange(e.target.value)}
              className="w-6 h-6 rounded-full border border-[var(--app-color-border-default)] cursor-pointer p-0 overflow-hidden"
              title="更改颜色"
            />
            {/* 快捷标签 */}
            <div className="flex gap-1">
              {creatableTags.map(tag => {
                const zoneTags: string[] = (() => { try { return JSON.parse(zones.find(z => z.id === zonePopover.id)?.semanticTags || "[]"); } catch { return []; } })();
                const active = zoneTags.includes(tag);
                return (
                  <button key={tag} onClick={() => {
                    const z = zones.find(zz => zz.id === zonePopover.id);
                    if (!z) return;
                    const tags: string[] = (() => { try { return JSON.parse(z.semanticTags || "[]"); } catch { return []; } })();
                    const next = active ? tags.filter(t => t !== tag) : [...tags, tag];
                    qc.setQueryData<AgvSpatialElement[]>(["agvSpatialElements"], (old) =>
                      old?.map(zz => zz.id === zonePopover.id ? { ...zz, semanticTags: JSON.stringify(next) } : zz)
                    );
                    saveZoneMut.mutate({ id: zonePopover.id, semanticTags: JSON.stringify(next) } as AgvSpatialElement);
                  }}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${active ? "text-white" : "bg-[var(--app-color-surface-page)] text-[var(--app-color-text-tertiary)]"}`}
                    style={active ? { backgroundColor: allTagColors[tag] || "#6b7280" } : {}}
                  >{tag}</button>
                );
              })}
            </div>
            <span className="w-px h-4 bg-[var(--app-color-border-default)]" />
            {/* 操作 */}
            <button
              onClick={handleDeleteZone}
              className="px-3 py-1 rounded-full text-[11px] bg-red-50 text-red-500 hover:bg-red-100 whitespace-nowrap"
            >删除</button>
            <button
              onClick={() => { setZonePopover(null); setSelectedZoneId(null); }}
              className="w-5 h-5 rounded-full border border-[var(--app-color-border-default)] text-[11px] flex items-center justify-center hover:bg-[var(--app-color-surface-hover)]"
            >✕</button>
          </div>
        </div>
      )}

      {/* 编辑模式提示 */}
      {(coordEditMode || zoneEditMode) && !zonePopover && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[var(--z-tooltip)] pointer-events-none">
          <span className="text-[10px] text-[var(--app-color-text-tertiary)] bg-[var(--app-color-surface-container)]/80 backdrop-blur px-3 py-1 rounded-full border border-[var(--app-color-border-default)]">
            编辑模式已开启 · 点击区域选中后可拖拽调整
          </span>
        </div>
      )}

    </div>
  );
}
