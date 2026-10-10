import { useEffect, useState } from "react";
import { fetchAgvTrajectory } from "@/api/domains/agv.api";
import { smartSampleTrail, type TrailPoint } from "@/features/agv-tracker/agvAnalytics";
import { AGV_ROBOTS } from "@/features/agv-tracker/agvRobotConfig";

const ROBOTS = AGV_ROBOTS;

function smartSample(points: { x: number; y: number; angle: number; ts: number }[]): typeof points {
  return smartSampleTrail(points);
}

/**
 * 进页面时补齐历史轨迹：先取近 24 小时，离线车再用 7 天窗口逐段往回找。
 *
 * 为什么要它：实时窗口只有 2 秒（配合 1 秒轮询），采集一断，轨迹就是空的 ——
 * 画布上只会剩拓扑路线（那片灰色），看不到各车本色走过的路径。
 * 小车台与驾驶舱共用这一份，保证两处画出来的线一样。
 */
export function useTrailSeed(
  seed: (ip: string, points: TrailPoint[]) => void,
  getTrail: (ip: string) => TrailPoint[],
) {
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
      for (const r of ROBOTS) {
        if (getTrail(r.ip).length > 0) continue;
        const doFallback = (endTime: string, depth: number) => {
          if (depth > 5) return;
          fetchAgvTrajectory(r.ip, ago7d, endTime, 2000).then((rows) => {
            if (cancelled || !rows.length) return;
            const pts = rows.filter(row => row.x != null && row.y != null)
              .sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime())
              .map(row => ({ x: row.x!, y: row.y!, angle: row.angle ?? 0, ts: new Date(row.recorded_at).getTime() }));
            if (pts.length === 0) return;
            const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
            if (Math.max(...xs) - Math.min(...xs) < 0.1 && Math.max(...ys) - Math.min(...ys) < 0.1) {
              seed(r.ip, pts);
              doFallback(new Date(pts[0].ts - 1000).toISOString(), depth + 1);
              return;
            }
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
