import type { TrailPoint } from "../useAgvTrailRef";

// ── CSS variable helper ──

export function readCssVar(el: Element, n: string, fb: string): string {
  return getComputedStyle(el).getPropertyValue(n).trim() || fb;
}

// ── Grid constants ──

export const GRID_LINES = 7;

export function niceStep(range: number, lines: number): number {
  const raw = range / lines;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  if (norm <= 1.5) return mag;
  if (norm <= 3.5) return 2 * mag;
  if (norm <= 7.5) return 5 * mag;
  return 10 * mag;
}

export function decimals(range: number): number {
  if (range <= 0.5) return 3;
  if (range <= 5) return 2;
  if (range <= 50) return 1;
  return 0;
}

// ── Rotation helpers ──

export const rotPt = (x: number, y: number, rad: number) => ({
  x: x * Math.cos(rad) - y * Math.sin(rad),
  y: x * Math.sin(rad) + y * Math.cos(rad),
});

export function rotatedBounds(
  b: { xMin: number; xMax: number; yMin: number; yMax: number },
  rad: number,
) {
  const corners = [
    rotPt(b.xMin, b.yMin, rad),
    rotPt(b.xMax, b.yMin, rad),
    rotPt(b.xMin, b.yMax, rad),
    rotPt(b.xMax, b.yMax, rad),
  ];
  let rxMin = Infinity, rxMax = -Infinity, ryMin = Infinity, ryMax = -Infinity;
  for (const c of corners) {
    if (c.x < rxMin) rxMin = c.x;
    if (c.x > rxMax) rxMax = c.x;
    if (c.y < ryMin) ryMin = c.y;
    if (c.y > ryMax) ryMax = c.y;
  }
  return { xMin: rxMin, xMax: rxMax, yMin: ryMin, yMax: ryMax };
}

// ── Angle helpers ──

export function normAngle(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

export function angleDiff(a: number, b: number): number {
  return normAngle(a - b);
}

export function lerpAngle(a: number, b: number, t: number): number {
  return a + angleDiff(b, a) * t;
}

// ── Interpolate current position for smooth movement ──

export function interpolatePosition(
  trail: TrailPoint[],
  currentX: number | null,
  currentY: number | null,
  currentAngle: number | null,
): { x: number | null; y: number | null; angle: number | null } {
  if (currentX == null || currentY == null)
    return { x: null, y: null, angle: null };
  if (trail.length < 2)
    return { x: currentX, y: currentY, angle: currentAngle };
  const now = Date.now();
  const last = trail[trail.length - 1];
  let after = -1;
  for (let i = 0; i < trail.length; i++) {
    if (trail[i].ts >= now) { after = i; break; }
  }
  if (after >= 0 && after > 0) {
    const a = trail[after - 1], b = trail[after];
    const t = (now - a.ts) / Math.max(b.ts - a.ts, 1);
    const ct = Math.min(Math.max(t, 0), 1);
    return {
      x: a.x + (b.x - a.x) * ct,
      y: a.y + (b.y - a.y) * ct,
      angle: lerpAngle(a.angle ?? 0, b.angle ?? 0, ct),
    };
  }
  const n = Math.min(trail.length, 4);
  let vx = 0, vy = 0, dt0 = 0, totalDA = 0;
  for (let i = trail.length - n + 1; i < trail.length; i++) {
    vx += trail[i].x - trail[i - 1].x;
    vy += trail[i].y - trail[i - 1].y;
    dt0 += trail[i].ts - trail[i - 1].ts;
    totalDA += Math.abs(angleDiff(trail[i].angle ?? 0, trail[i - 1].angle ?? 0));
  }
  const isTurning = totalDA > 0.17;
  const lastDx = trail[trail.length - 1].x - trail[trail.length - 2].x;
  const lastDy = trail[trail.length - 1].y - trail[trail.length - 2].y;
  const isStopping = Math.sqrt(lastDx * lastDx + lastDy * lastDy) < 0.01;
  const speed = dt0 > 0 ? Math.sqrt(vx * vx + vy * vy) / dt0 : 0;
  let dx = last.x, dy = last.y;
  if (speed > 1e-5 && !isTurning && !isStopping) {
    const elapsed = Math.min(now - last.ts, 300);
    dx = last.x + (vx / dt0) * elapsed;
    dy = last.y + (vy / dt0) * elapsed;
  }
  return { x: dx, y: dy, angle: normAngle(last.angle) };
}

// ── Screen-to-world coordinate transform ──

export function screenToWorld(
  sx: number,
  sy: number,
  t: {
    scale: number;
    xMid: number;
    yMid: number;
    panX: number;
    panY: number;
    rad: number;
    w: number;
    h: number;
    followMode: boolean;
  },
): { wx: number; wy: number } {
  if (t.followMode) return { wx: 0, wy: 0 };
  const rx = (sx - t.w / 2 - t.panX) / t.scale + t.xMid;
  const ry = -((sy - t.h / 2 - t.panY) / t.scale) + t.yMid;
  const cosR = Math.cos(-t.rad), sinR = Math.sin(-t.rad);
  return { wx: rx * cosR - ry * sinR, wy: rx * sinR + ry * cosR };
}

// ── Point-in-polygon (screen-space, ray casting) ──

export function pointInPolygonScr(
  px: number,
  py: number,
  poly: { x: number; y: number }[],
): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    if (
      (yi > py) !== (yj > py) &&
      px < ((xj - xi) * (py - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }
  return inside;
}
