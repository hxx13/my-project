import { useEffect, useMemo, useRef } from "react";
import type { AgvRobotStatus } from "@/api/domains/agv.api";
import { fetchAgvTrajectory } from "@/api/domains/agv.api";
import { computeSpeed, smoothSpeed, currentSpeed, detectDwellSegments, smartSampleTrail, type TrailPoint } from "@/features/agv-tracker/agvAnalytics";
import { AGV_ROBOTS } from "@/features/agv-tracker/agvRobotConfig";

const ROBOTS = AGV_ROBOTS;

function smartSample(points: { x: number; y: number; angle: number; ts: number }[]): typeof points {
  return smartSampleTrail(points);
}

export function useAgvDataRefresh(
  recentData: any,
  dataUpdatedAt: number,
  data: any,
  append: (ip: string, point: TrailPoint) => void,
  seed: (ip: string, points: TrailPoint[]) => void,
  getTrail: (ip: string) => TrailPoint[],
  clearAll: () => void,
) {
  // ── 实时轨迹追加 ──
  useEffect(() => {
    if (!recentData) return;
    for (const r of ROBOTS) {
      const points = recentData[r.ip];
      if (points?.length) {
        for (const p of points) {
          if (p.x != null && p.y != null) {
            append(r.ip, {
              x: p.x,
              y: p.y,
              angle: p.angle ?? 0,
              ts: new Date(p.recorded_at).getTime(),
            });
          }
        }
      }
    }
  }, [dataUpdatedAt]);

  // ── 定期补种：每5分钟拉一次历史数据混入实时轨迹 ──
  useEffect(() => {
    const reseed = () => {
      const now = new Date().toISOString();
      const ago = new Date(Date.now() - 2 * 3600_000).toISOString();
      ROBOTS.forEach((r) => {
        fetchAgvTrajectory(r.ip, ago, now, 10000)
          .then((rows) => {
            const pts = rows
              .filter((row) => row.x != null && row.y != null)
              .sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime())
              .map((row) => ({ x: row.x, y: row.y, angle: row.angle ?? 0, ts: new Date(row.recorded_at).getTime() }));
            const filtered = smartSample(pts);
            if (filtered.length > 0) seed(r.ip, filtered);
          })
          .catch(() => {});
      });
    };
    const timer = setInterval(reseed, 5 * 60_000);
    return () => clearInterval(timer);
  }, [seed]);

  // ── 卸载清理 ──
  useEffect(() => () => clearAll(), [clearAll]);

  // ── 状态读取 ──
  const getStatus = (ip: string): AgvRobotStatus | null => data?.robots?.[ip]?.status ?? null;
  const getLastPolled = (ip: string): string | null => data?.robots?.[ip]?.last_polled_at ?? null;

  // ── 速度：轻量 O(1)，每 500ms 实时算 ──
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

  // ── 热力图：重量 O(n) (detectDwellSegments)，2秒缓存避免阻塞渲染 ──
  const dwellCache = useRef<{ data: Record<string, { x: number; y: number; durationSec: number }[]>; ts: number }>(
    { data: {}, ts: 0 },
  );

  if (Date.now() - dwellCache.current.ts > 2000) {
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
        if (c) c.count++;
        else cellMap.set(k, { x: cx, y: cy, count: 1 });
      }
      const density: { x: number; y: number; durationSec: number }[] = [];
      for (const [, v] of cellMap) {
        if (v.count >= 3) density.push({ x: v.x, y: v.y, durationSec: Math.min(v.count, 300) });
      }
      map[r.ip] = [...spots.map((s) => ({ x: s.x, y: s.y, durationSec: s.durationSec })), ...density];
    }
    dwellCache.current = { data: map, ts: Date.now() };
  }
  const dwellByIp = dwellCache.current.data;

  return { robotAnalytics, dwellByIp, getStatus, getLastPolled };
}
