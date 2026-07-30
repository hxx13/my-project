/**
 * AGV 全量分析算法：速度/效率/能耗/利用率/站点/站间/分布/加速度/热点/车队
 */
export interface TrailPoint { x: number; y: number; angle: number; ts: number; }
export interface SpeedSample { ts: number; speedMps: number; }
export interface DwellSegment { station: string; x: number; y: number; arriveAt: number; departAt: number; durationSec: number; }

// ── helpers ──
function dist(a: TrailPoint, b: TrailPoint) { return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2); }

// 1. 速度
export function computeSpeed(points: TrailPoint[]): SpeedSample[] {
  if (points.length < 2) return points.map(p => ({ ts: p.ts, speedMps: 0 }));
  const r: SpeedSample[] = [{ ts: points[0].ts, speedMps: 0 }];
  for (let i = 1; i < points.length; i++) {
    const dt = (points[i].ts - points[i - 1].ts) / 1000;
    r.push({ ts: points[i].ts, speedMps: dt > 0.01 ? dist(points[i - 1], points[i]) / dt : 0 });
  }
  return r;
}
export function smoothSpeed(s: SpeedSample[], w = 5): SpeedSample[] {
  if (s.length < w) return s; const h = w >> 1; const r = s.slice(0, h);
  for (let i = h; i < s.length - h; i++) { let sum = 0; for (let j = i - h; j <= i + h; j++) sum += s[j].speedMps; r.push({ ts: s[i].ts, speedMps: sum / w }); }
  r.push(...s.slice(s.length - h)); return r;
}
/** 瞬时速度：取最近 3 个点的平均速度 */
export function currentSpeed(p: TrailPoint[]) {
  if (p.length < 2) return null;
  const w = Math.min(p.length, 4);
  let totalDist = 0, totalTime = 0;
  for (let i = p.length - w + 1; i < p.length; i++) {
    const a = p[i - 1], b = p[i];
    const dt = (b.ts - a.ts) / 1000;
    if (dt > 0.01 && dt < 2.0) {
      totalDist += dist(a, b);
      totalTime += dt;
    }
  }
  // fallback: 最后两个点直接算
  if (totalTime < 0.01 && p.length >= 2) {
    const a = p[p.length - 2], b = p[p.length - 1];
    const dt = (b.ts - a.ts) / 1000;
    return dt > 0.01 ? dist(a, b) / dt : null;
  }
  return totalTime > 0.01 ? totalDist / totalTime : null;
}
export function totalDistance(p: TrailPoint[]) { let d = 0; for (let i = 1; i < p.length; i++) d += dist(p[i - 1], p[i]); return d; }

// 2. 效率 = 直线距离 / 实际里程
export function pathEfficiency(points: TrailPoint[]) {
  if (points.length < 2) return null;
  const straight = dist(points[0], points[points.length - 1]);
  const actual = totalDistance(points);
  return actual > 0 ? straight / actual : 1;
}

// 3. 能耗 (假设有 battery 数据和 odo 数据)
export interface BatterySample { ts: number; battery: number; } // battery 0-1
export function energyRate(batteryHistory: BatterySample[], odoHistory: { ts: number; odo: number }[]) {
  if (batteryHistory.length < 2 || odoHistory.length < 2) return { pctPerKm: null, pctPerHr: null };
  const dB = batteryHistory[0].battery - batteryHistory[batteryHistory.length - 1].battery;
  const dOdo = odoHistory[odoHistory.length - 1].odo - odoHistory[0].odo; // km
  const dHr = (batteryHistory[batteryHistory.length - 1].ts - batteryHistory[0].ts) / 3600_000;
  return {
    pctPerKm: dOdo > 0.001 ? dB / dOdo * 100 : null, // %/km
    pctPerHr: dHr > 0.01 ? dB / dHr : null,           // %/h
  };
}

// 4. 利用率 = 移动时间 / 总时间
export function utilization(points: TrailPoint[], speeds: SpeedSample[]) {
  if (speeds.length < 2) return null;
  let movingSec = 0;
  for (const s of speeds) if (s.speedMps > 0.05) movingSec += 1; // 粗略：每采样=1s
  const totalSec = (points[points.length - 1].ts - points[0].ts) / 1000;
  return totalSec > 0 ? movingSec / totalSec : 0;
}

// 5. 站点停留排行
export interface StationSummary { station: string; count: number; totalSec: number; avgSec: number; }
export function stationRanking(dwells: DwellSegment[]): StationSummary[] {
  const map = new Map<string, { count: number; totalSec: number }>();
  for (const d of dwells) {
    const e = map.get(d.station) || { count: 0, totalSec: 0 };
    e.count++; e.totalSec += d.durationSec;
    map.set(d.station, e);
  }
  return [...map.entries()].map(([station, v]) => ({ station, count: v.count, totalSec: v.totalSec, avgSec: Math.round(v.totalSec / v.count) }))
    .sort((a, b) => b.totalSec - a.totalSec).slice(0, 10);
}

// 6. 站间耗时
export interface StationHop { from: string; to: string; durationSec: number; distance: number; }
export function stationHops(dwells: DwellSegment[]): StationHop[] {
  const hops: StationHop[] = [];
  for (let i = 1; i < dwells.length; i++) {
    const d = dist(
      { x: dwells[i - 1].x, y: dwells[i - 1].y, angle: 0, ts: 0 },
      { x: dwells[i].x, y: dwells[i].y, angle: 0, ts: 0 },
    );
    hops.push({
      from: dwells[i - 1].station,
      to: dwells[i].station,
      durationSec: Math.round((dwells[i].arriveAt - dwells[i - 1].departAt) / 1000),
      distance: Math.round(d * 100) / 100,
    });
  }
  return hops;
}

// 7. 速度分布直方图
export interface SpeedBin { label: string; min: number; max: number; count: number; }
export function speedHistogram(speeds: SpeedSample[]): SpeedBin[] {
  const bins: SpeedBin[] = [
    { label: "0-0.1", min: 0, max: 0.1, count: 0 },
    { label: "0.1-0.3", min: 0.1, max: 0.3, count: 0 },
    { label: "0.3-0.5", min: 0.3, max: 0.5, count: 0 },
    { label: "0.5-0.8", min: 0.5, max: 0.8, count: 0 },
    { label: "0.8-1.2", min: 0.8, max: 1.2, count: 0 },
    { label: "1.2-1.8", min: 1.2, max: 1.8, count: 0 },
    { label: "1.8+", min: 1.8, max: 99, count: 0 },
  ];
  for (const s of speeds) {
    for (const b of bins) { if (s.speedMps >= b.min && s.speedMps < b.max) { b.count++; break; } }
  }
  return bins;
}

// 8. 加速度事件 (急加速/急减速)
export interface AccelEvent { ts: number; mps2: number; type: "急加速" | "急减速"; }
export function accelEvents(speeds: SpeedSample[], threshold = 0.5): AccelEvent[] {
  const events: AccelEvent[] = [];
  for (let i = 1; i < speeds.length; i++) {
    const dt = (speeds[i].ts - speeds[i - 1].ts) / 1000;
    if (dt < 0.01) continue;
    const acc = (speeds[i].speedMps - speeds[i - 1].speedMps) / dt;
    if (acc > threshold) events.push({ ts: speeds[i].ts, mps2: Math.round(acc * 100) / 100, type: "急加速" });
    if (acc < -threshold) events.push({ ts: speeds[i].ts, mps2: Math.round(acc * 100) / 100, type: "急减速" });
  }
  return events;
}

// 9. 车队热力 (跨车合并)
export interface FleetHeatCell { x: number; y: number; weight: number; }
export function fleetHeatmap(allTrails: Map<string, TrailPoint[]>): FleetHeatCell[] {
  const grid = new Map<string, { x: number; y: number; count: number }>();
  for (const [, trail] of allTrails) {
    for (const p of trail) {
      const kx = Math.round(p.x * 5) / 5;
      const ky = Math.round(p.y * 5) / 5;
      const k = `${kx},${ky}`;
      const c = grid.get(k);
      if (c) c.count++; else grid.set(k, { x: kx, y: ky, count: 1 });
    }
  }
  const maxC = Math.max(...[...grid.values()].map(v => v.count), 1);
  return [...grid.values()].filter(v => v.count >= 3).map(v => ({ x: v.x, y: v.y, weight: v.count / maxC }));
}

// 10. 停留段检测
export function detectDwellSegments(points: TrailPoint[], stations: Map<number, string>, minSec = 3, radius = 0.5): DwellSegment[] {
  if (points.length < 2) return [];
  const segs: DwellSegment[] = [];
  let start = 0; let curSt = stations.get(0) ?? "";
  for (let i = 1; i < points.length; i++) {
    const st = stations.get(i) ?? "";
    const sameSt = st === curSt && curSt !== "";
    const close = dist(points[start], points[i]) < radius && (points[i].ts - points[start].ts) < 120_000;
    if (sameSt && close) continue;
    const dur = (points[i - 1].ts - points[start].ts) / 1000;
    if (dur >= minSec && curSt !== "") {
      let sx = 0, sy = 0; for (let j = start; j < i; j++) { sx += points[j].x; sy += points[j].y; }
      segs.push({ station: curSt, x: sx / (i - start), y: sy / (i - start), arriveAt: points[start].ts, departAt: points[i - 1].ts, durationSec: Math.round(dur) });
    }
    start = i; curSt = st;
  }
  const last = points.length - 1;
  const dur = (points[last].ts - points[start].ts) / 1000;
  if (dur >= minSec && curSt !== "") {
    let sx = 0, sy = 0; for (let j = start; j <= last; j++) { sx += points[j].x; sy += points[j].y; }
    segs.push({ station: curSt, x: sx / (last - start + 1), y: sy / (last - start + 1), arriveAt: points[start].ts, departAt: points[last].ts, durationSec: Math.round(dur) });
  }
  return segs;
}
