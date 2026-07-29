import { useRef, useCallback } from "react";

export interface TrailPoint { x: number; y: number; angle: number; ts: number; }
const MAX_POINTS = 2000;

const globalTrails = new Map<string, TrailPoint[]>();

export function useAgvTrailRef() {
  const trailsRef = useRef<Map<string, TrailPoint[]>>(globalTrails);

  const append = useCallback((ip: string, point: TrailPoint) => {
    const map = trailsRef.current;
    if (!map.has(ip)) map.set(ip, []);
    const arr = map.get(ip)!;
    if (arr.length > 0) {
      const last = arr[arr.length - 1];
      if (Math.abs(last.x - point.x) < 0.03 && Math.abs(last.y - point.y) < 0.03
        && Math.abs(last.angle - point.angle) < 0.087 && (point.ts - last.ts) / 1000 < 5) return;
    }
    arr.push(point);
    if (arr.length > MAX_POINTS) arr.splice(0, arr.length - MAX_POINTS);
  }, []);

  const seed = useCallback((ip: string, points: TrailPoint[]) => {
    if (points.length === 0) return;
    const filtered: TrailPoint[] = [points[0]];
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1], lastKept = filtered[filtered.length - 1];
      if (Math.abs(prev.x - points[i].x) > 0.03 || Math.abs(prev.y - points[i].y) > 0.03
        || Math.abs(prev.angle - points[i].angle) > 0.087
        || (points[i].ts - lastKept.ts) / 1000 > 5) {
        filtered.push(points[i]);
      }
    }
    if (filtered.length < 2 && points.length >= 2) filtered.push(points[points.length - 1]);
    const existing = trailsRef.current.get(ip) ?? [];
    trailsRef.current.set(ip, [...filtered.slice(-MAX_POINTS), ...existing].slice(-MAX_POINTS));
  }, []);

  const getTrail = useCallback((ip: string): TrailPoint[] => trailsRef.current.get(ip) ?? [], []);
  const clearAll = useCallback(() => trailsRef.current.clear(), []);

  return { trailsRef, append, seed, getTrail, clearAll };
}
