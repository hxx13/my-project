import { useRef, useCallback } from "react";

export interface TrailPoint { x: number; y: number; angle: number; ts: number; }
const MAX_POINTS = 5000;

const globalTrails = new Map<string, TrailPoint[]>();

/** 向后扫描找到"进场起点"：离当前位置超过阈值的最远点，保留完整的进场路径 */
function findApproachStart(arr: TrailPoint[]): number {
  if (arr.length < 100) return 0;
  const cur = arr[arr.length - 1];
  const APPROACH_DIST_M = 3.0; // 距当前位置超过 3m = 确定不是同一个位置
  const MIN_KEEP = 300;        // 最少保留最近 300 个点

  // 从后往前扫，找第一个离当前位置 > 3m 的点
  for (let i = arr.length - MIN_KEEP; i >= 0; i--) {
    const dx = arr[i].x - cur.x;
    const dy = arr[i].y - cur.y;
    if (Math.sqrt(dx * dx + dy * dy) > APPROACH_DIST_M) {
      // 再往前多留 200 个点作为上下文（进场前的移动段）
      return Math.max(0, i - 200);
    }
  }
  return 0; // 全程都在小范围 → 保留全部
}

export function useAgvTrailRef() {
  const trailsRef = useRef<Map<string, TrailPoint[]>>(globalTrails);

  const append = useCallback((ip: string, point: TrailPoint) => {
    const map = trailsRef.current;
    if (!map.has(ip)) map.set(ip, []);
    const arr = map.get(ip)!;
    if (arr.length > 0) {
      const last = arr[arr.length - 1];
      // 静止去重：5s 内位置/角度几乎不变则跳过
      if (Math.abs(last.x - point.x) < 0.005 && Math.abs(last.y - point.y) < 0.005
        && Math.abs(last.angle - point.angle) < 0.017 && (point.ts - last.ts) / 1000 < 5) return;
    }
    arr.push(point);

    if (arr.length > MAX_POINTS) {
      const cutIdx = findApproachStart(arr);
      if (cutIdx > 0) {
        // 有明确的进场起点 → 裁剪该点之前的数据
        arr.splice(0, cutIdx);
      } else {
        // 全场小范围移动 → 保留最近的 MAX_POINTS
        arr.splice(0, arr.length - MAX_POINTS);
      }
    }
  }, []);

  const seed = useCallback((ip: string, points: TrailPoint[]) => {
    if (points.length === 0) return;

    // 对历史数据做去重：同位置(<0.01m)→120s，微动(<0.05m)→30s
    const filtered: TrailPoint[] = [points[0]];
    for (let i = 1; i < points.length; i++) {
      const p = points[i];
      const lastKept = filtered[filtered.length - 1];
      const dx = Math.abs(p.x - lastKept.x), dy = Math.abs(p.y - lastKept.y);
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maxGap = dist < 0.01 ? 120_000 : 30_000;
      if (dist > 0.05 || (p.ts - lastKept.ts) > maxGap) {
        filtered.push(p);
      }
    }
    if (filtered.length < 2 && points.length >= 2) filtered.push(points[points.length - 1]);

    const existing = trailsRef.current.get(ip) ?? [];
    // 只插入比现有数据更老的历史点，保留实时轨迹不被覆盖
    const oldestExisting = existing.length > 0 ? existing[0].ts : Infinity;
    const historicalOnly = filtered.filter(p => p.ts < oldestExisting);

    const merged = [...historicalOnly, ...existing].sort((a, b) => a.ts - b.ts);

    // 合并后也做智能裁剪
    if (merged.length > MAX_POINTS) {
      const cutIdx = findApproachStart(merged);
      if (cutIdx > 0) {
        merged.splice(0, cutIdx);
      } else {
        merged.splice(0, merged.length - MAX_POINTS);
      }
    }
    trailsRef.current.set(ip, merged);
  }, []);

  const getTrail = useCallback((ip: string): TrailPoint[] => trailsRef.current.get(ip) ?? [], []);
  const clearAll = useCallback(() => trailsRef.current.clear(), []);

  return { trailsRef, append, seed, getTrail, clearAll };
}
