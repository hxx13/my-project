import { useRef, useEffect, useLayoutEffect, useCallback, useMemo } from "react";
import type { TrailPoint } from "./useAgvTrailRef";
import type { AgvTrajectoryRow, HistoryPlaybackResponse } from "@/api/domains/agv.api";
import { ACTIVITY_COLORS } from "@/api/domains/agv-analysis.api";

interface ActivitySegment {
  startTime: string; endTime: string; activityType: string;
}

interface ZoneOverlay {
  id: number; polygonJson: string; color: string; name: string;
}

interface RouteOverlay {
  id: number; pathJson: string; color: string; name: string;
  routeType: string;
}

interface TransitionMarker {
  x: number; y: number; label: string;
}

interface Props {
  ip: string; trail: TrailPoint[];
  currentX?: number | null; currentY?: number | null; currentAngle?: number | null;
  online: boolean; color: string;
  dwellSpots?: { x: number; y: number; durationSec: number }[];
  coordRotationDeg?: number;
  activitySegments?: ActivitySegment[];
  zoneOverlays?: ZoneOverlay[];
  routeOverlays?: RouteOverlay[];
  routeMode?: boolean;
  followMode?: boolean;
  transitionMarkers?: TransitionMarker[];
  forkHeight?: number | null;
  jackState?: number | null;
  jackIsFull?: boolean | null;
  /** 地图选点模式：cursor 变十字，点击回传世界坐标 */
  pickMode?: boolean;
  onPointPick?: (x: number, y: number) => void;
  /** 历史回放模式 */
  playbackActive?: boolean;
  playbackData?: HistoryPlaybackResponse | null;
  playbackTrail?: AgvTrajectoryRow[] | null;
  playbackProgress?: number; // 0..1
}

function readCssVar(el: Element, n: string, fb: string): string {
  return getComputedStyle(el).getPropertyValue(n).trim() || fb;
}

const rawBounds: Record<string, { xMin: number; xMax: number; yMin: number; yMax: number }> = {};
const GRID_LINES = 7;

function ensureBounds(ip: string, x: number, y: number) {
  if (!rawBounds[ip]) { rawBounds[ip] = { xMin: x - 2, xMax: x + 2, yMin: y - 2, yMax: y + 2 }; return; }
  const b = rawBounds[ip];
  if (x < b.xMin) b.xMin = x; if (x > b.xMax) b.xMax = x;
  if (y < b.yMin) b.yMin = y; if (y > b.yMax) b.yMax = y;
}
function niceStep(range: number, lines: number): number {
  const raw = range / lines, mag = Math.pow(10, Math.floor(Math.log10(raw))), norm = raw / mag;
  if (norm <= 1.5) return mag; if (norm <= 3.5) return 2 * mag; if (norm <= 7.5) return 5 * mag; return 10 * mag;
}
function decimals(range: number): number { if (range <= 0.5) return 3; if (range <= 5) return 2; if (range <= 50) return 1; return 0; }

/** 旋转点 (绕原点) */
const rotPt = (x: number, y: number, rad: number) => ({
  x: x * Math.cos(rad) - y * Math.sin(rad),
  y: x * Math.sin(rad) + y * Math.cos(rad),
});

/** 旋转后包围盒 */
function rotatedBounds(b: { xMin: number; xMax: number; yMin: number; yMax: number }, rad: number) {
  const corners = [
    rotPt(b.xMin, b.yMin, rad), rotPt(b.xMax, b.yMin, rad),
    rotPt(b.xMin, b.yMax, rad), rotPt(b.xMax, b.yMax, rad),
  ];
  let rxMin = Infinity, rxMax = -Infinity, ryMin = Infinity, ryMax = -Infinity;
  for (const c of corners) {
    if (c.x < rxMin) rxMin = c.x; if (c.x > rxMax) rxMax = c.x;
    if (c.y < ryMin) ryMin = c.y; if (c.y > ryMax) ryMax = c.y;
  }
  return { xMin: rxMin, xMax: rxMax, yMin: ryMin, yMax: ryMax };
}

// ── Angle helpers: normalize to [-π, π] ──
function normAngle(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}
function angleDiff(a: number, b: number): number {
  return normAngle(a - b);
}
function lerpAngle(a: number, b: number, t: number): number {
  return a + angleDiff(b, a) * t;
}

// ── Interpolate current position for smooth movement ──
function interpolatePosition(
  trail: TrailPoint[],
  currentX: number | null, currentY: number | null, currentAngle: number | null,
): { x: number | null; y: number | null; angle: number | null } {
  if (currentX == null || currentY == null) return { x: null, y: null, angle: null };
  if (trail.length < 2) return { x: currentX, y: currentY, angle: currentAngle };
  const now = Date.now();
  const last = trail[trail.length - 1];
  let after = -1;
  for (let i = 0; i < trail.length; i++) { if (trail[i].ts >= now) { after = i; break; } }
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
  // Skip extrapolation if turning (>0.17 rad ≈ 10°) or braking/stopped (last step < 1cm)
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

export default function AgvQuadrantCanvas({ ip, trail, currentX, currentY, currentAngle, online, color, dwellSpots, coordRotationDeg, activitySegments, zoneOverlays, routeOverlays, routeMode, followMode, transitionMarkers, forkHeight, jackState, jackIsFull, pickMode, onPointPick, playbackActive, playbackData, playbackTrail, playbackProgress }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const prevDegRef = useRef(coordRotationDeg ?? 0);
  const prevLenRef = useRef(0);
  const panRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const dragRef = useRef({ on: false, lx: 0, ly: 0 });
  const dragStartRef = useRef({ x: 0, y: 0 });
  const prevForkRef = useRef(forkHeight ?? 0);

  // ── Playback refs for draw-loop access (bypasses React render pipeline) ──
  const pbSortedRef = useRef<{ x: number; y: number; angle: number; ts: number; forkHeight: number | null; jackState: number | null; jackIsFull: boolean }[] | null>(null);
  const pbProgressRef = useRef(playbackProgress ?? 1);
  const pbDataRef = useRef(playbackData ?? null);
  pbProgressRef.current = playbackProgress ?? 1;
  pbDataRef.current = playbackData ?? null;
  // 保持 event handler 闭包中的 pickMode/onPointPick 同步
  const pickModeRef = useRef(pickMode);
  pickModeRef.current = pickMode;
  const onPointPickRef = useRef(onPointPick);
  onPointPickRef.current = onPointPick;
  // 存储当前帧的坐标变换参数，供 click handler 做逆变换
  const transformRef = useRef<{ scale: number; xMid: number; yMid: number; panX: number; panY: number; rad: number; w: number; h: number; followMode: boolean } | null>(null);

  const rotDeg = coordRotationDeg ?? 0;
  if (rotDeg !== prevDegRef.current) { delete rawBounds[ip]; prevDegRef.current = rotDeg; prevLenRef.current = 0; }

  // ── Playback: sort ONCE, sync to ref for draw-loop access ──
  const playbackSorted = useMemo(() => {
    if (!playbackActive || !playbackTrail || !playbackTrail.length) return null;
    const pts = playbackTrail
      .filter(r => r.x != null && r.y != null)
      .sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime())
      .map(r => ({ x: r.x!, y: r.y!, angle: r.angle ?? 0, ts: new Date(r.recorded_at).getTime(), forkHeight: r.fork_height ?? null, jackState: r.jack_state ?? null, jackIsFull: r.jack_isFull === 1 }));
    pbSortedRef.current = pts;
    return pts;
  }, [playbackActive, playbackTrail]);

  // For React-driven UI (progress bar, etc) — keep lightweight
  // Canvas draw loop reads refs directly

  const effectiveTrail = playbackActive
    ? (() => {
        const s = pbSortedRef.current;
        if (!s || s.length < 2) return s ?? [];
        const totalMs = s[s.length - 1].ts - s[0].ts;
        if (totalMs <= 0) return s;
        const cutoffTs = s[0].ts + totalMs * (playbackProgress ?? 1);
        let lo = 0, hi = s.length;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (s[mid].ts <= cutoffTs) lo = mid + 1; else hi = mid; }
        return s.slice(0, lo);
      })()
    : trail;

  const playbackPos = useMemo(() => {
    if (!playbackActive) return null;
    const s = pbSortedRef.current;
    const data = pbDataRef.current;
    if (!s || !s.length || !data) return null;
    const totalMs = new Date(data.to).getTime() - new Date(data.from).getTime();
    const nowTs = new Date(data.from).getTime() + totalMs * (playbackProgress ?? 1);
    if (s.length === 1) return { x: s[0].x, y: s[0].y, angle: s[0].angle, forkHeight: s[0].forkHeight, jackState: s[0].jackState, jackIsFull: s[0].jackIsFull };
    let lo = 0, hi = s.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (s[mid].ts <= nowTs) lo = mid + 1; else hi = mid; }
    const after = Math.min(Math.max(lo, 1), s.length - 1);
    const a = s[after - 1], b = s[after];
    const t = Math.min(1, Math.max(0, (nowTs - a.ts) / (b.ts - a.ts || 1)));
    return {
      x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t,
      angle: lerpAngle(a.angle, b.angle, t),
      forkHeight: a.forkHeight, jackState: a.jackState, jackIsFull: a.jackIsFull,
    };
  }, [playbackActive, playbackProgress]);

  const hasData = playbackActive
    ? (pbSortedRef.current != null && pbSortedRef.current.length > 0)
    : (currentX != null && currentY != null);

  // 轨迹长度变化 → 全量重建边界
  const trailForBounds = playbackActive ? (pbSortedRef.current ?? []) : effectiveTrail;
  if (trailForBounds.length !== prevLenRef.current || !rawBounds[ip]) {
    prevLenRef.current = trailForBounds.length;
    let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
    if (hasData) {
      const s = pbSortedRef.current;
      const cx = playbackActive && s && s.length > 0 ? s[s.length - 1].x : currentX!;
      const cy = playbackActive && s && s.length > 0 ? s[s.length - 1].y : currentY!;
      if (cx < xMin) xMin = cx; if (cx > xMax) xMax = cx;
      if (cy < yMin) yMin = cy; if (cy > yMax) yMax = cy;
    }
    for (const p of trailForBounds) {
      if (p.x < xMin) xMin = p.x; if (p.x > xMax) xMax = p.x;
      if (p.y < yMin) yMin = p.y; if (p.y > yMax) yMax = p.y;
    }
    if (dwellSpots) for (const d of dwellSpots) {
      if (d.x < xMin) xMin = d.x; if (d.x > xMax) xMax = d.x;
      if (d.y < yMin) yMin = d.y; if (d.y > yMax) yMax = d.y;
    }
    // Fallback: if no trail data, use zone polygons so viewport doesn't collapse
    if (!isFinite(xMin) && zoneOverlays) for (const z of zoneOverlays) {
      try { const poly: [number,number][] = JSON.parse(z.polygonJson);
        for (const p of poly) {
          if (p[0] < xMin) xMin = p[0]; if (p[0] > xMax) xMax = p[0];
          if (p[1] < yMin) yMin = p[1]; if (p[1] > yMax) yMax = p[1];
        }
      } catch {}
    }
    if (isFinite(xMin)) {
      const mx = Math.max((xMax - xMin) * 0.08, 1.0), my = Math.max((yMax - yMin) * 0.08, 1.0);
      rawBounds[ip] = { xMin: xMin - mx, xMax: xMax + mx, yMin: yMin - my, yMax: yMax + my };
    }
  }

  const draw = useCallback(() => {
    const canvas = canvasRef.current, container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const w = container.clientWidth, h = container.clientHeight, dpr = window.devicePixelRatio || 1;
    if (w <= 0 || h <= 0) return;
    if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
      canvas.width = Math.floor(w * dpr); canvas.height = Math.floor(h * dpr);
      canvas.style.width = w + "px"; canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    const scope = container;
    const bg = readCssVar(scope, "--app-color-surface-container", "#fff");
    const gridC = readCssVar(scope, "--app-color-border-default", "#e5e7eb");
    const textC = readCssVar(scope, "--app-color-text-secondary", "#6b7280");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);

    const rb = rawBounds[ip];

    // Follow mode: enabled during playback too, targets playback position
    const effectiveFollow = followMode;

    if (!rb && !effectiveFollow && !playbackActive) { ctx.fillStyle = textC; ctx.font = "12px sans-serif"; ctx.textAlign = "center"; ctx.fillText("等待数据...", w / 2, h / 2); return; }
    if (effectiveFollow && !hasData) { ctx.fillStyle = textC; ctx.font = "12px sans-serif"; ctx.textAlign = "center"; ctx.fillText("等待位置数据...", w / 2, h / 2); return; }
    if (playbackActive && !rb) { ctx.fillStyle = textC; ctx.font = "12px sans-serif"; ctx.textAlign = "center"; ctx.fillText("加载回放数据中...", w / 2, h / 2); return; }

    const rad = (rotDeg * Math.PI) / 180;
    const zoom = zoomRef.current;
    const panX = panRef.current.x, panY = panRef.current.y;

    // ── Follow mode: camera locks to vehicle position, heading = up ──
    const FOLLOW_SCALE = 40; // pixels per meter
    const pad = 0.10;
    let toPx: (vx: number, vy: number) => number;
    let toPy: (vx: number, vy: number) => number;
    let xMid = 0, yMid = 0, scale = 1;

    if (effectiveFollow && hasData) {
      const cx = playbackActive && playbackPos ? playbackPos.x : currentX!;
      const cy = playbackActive && playbackPos ? playbackPos.y : currentY!;
      const headingRad = playbackActive && playbackPos ? playbackPos.angle : (currentAngle != null ? currentAngle : 0);
      // Rotate world so vehicle heading points UP on screen
      const followRad = -Math.PI / 2 - headingRad;
      const fs = FOLLOW_SCALE * zoom;
      toPx = (vx: number, vy: number) => {
        const dx = vx - cx, dy = vy - cy;
        return (dx * Math.cos(followRad) - dy * Math.sin(followRad)) * fs + w / 2 + panX;
      };
      toPy = (vx: number, vy: number) => {
        const dx = vx - cx, dy = vy - cy;
        return (dx * Math.sin(followRad) + dy * Math.cos(followRad)) * fs + h / 2 + panY;
      };
    } else {
      // ── Normal mode: auto-scaled to fit bounds ──
      const b = rad !== 0 ? rotatedBounds(rb!, rad) : rb!;
      const xRange = (b.xMax - b.xMin) || 1, yRange = (b.yMax - b.yMin) || 1;
      scale = Math.min((w * (1 - 2 * pad)) / xRange, (h * (1 - 2 * pad)) / yRange) * zoom;
      xMid = (b.xMin + b.xMax) / 2; yMid = (b.yMin + b.yMax) / 2;
      toPx = (vx: number, vy: number) => {
        const r = rotPt(vx, vy, rad);
        return (r.x - xMid) * scale + w / 2 + panX;
      };
      toPy = (vx: number, vy: number) => {
        const r = rotPt(vx, vy, rad);
        return -(r.y - yMid) * scale + h / 2 + panY;
      };
    }

    // 存储变换参数供 click handler 逆变换
    transformRef.current = { scale, xMid, yMid, panX, panY, rad, w, h, followMode: !!(effectiveFollow && hasData) };

    // Heatmap
    if (dwellSpots && dwellSpots.length) {
      const maxD = Math.max(...dwellSpots.map(d => d.durationSec), 1);
      for (const s of dwellSpots) {
        const t = Math.min(s.durationSec, maxD) / maxD;
        ctx.fillStyle = `rgba(${Math.round(255*t)},${Math.round(100*(1-t))},30,${(0.1+0.5*t).toFixed(2)})`;
        ctx.beginPath(); ctx.arc(toPx(s.x, s.y), toPy(s.x, s.y), 3 + 8 * t, 0, Math.PI * 2); ctx.fill();
      }
    }

    // Grid — skip in follow mode (vehicle-centric view doesn't need reference grid)
    if (!followMode && rb) {
      const rawXRange = (rb.xMax - rb.xMin) || 1, rawYRange = (rb.yMax - rb.yMin) || 1;
      const rawScale = Math.min((w * (1 - 2 * pad)) / rawXRange, (h * (1 - 2 * pad)) / rawYRange) * zoom;
      const rawXMid = (rb.xMin + rb.xMax) / 2, rawYMid = (rb.yMin + rb.yMax) / 2;
      const step = niceStep(Math.max(rawXRange, rawYRange), GRID_LINES);
      ctx.strokeStyle = gridC; ctx.lineWidth = 0.5;
      for (let gx = Math.floor(rb.xMin / step) * step; gx <= rb.xMax; gx += step) {
        const px = (gx - rawXMid) * rawScale + w / 2 + panX;
        ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, h); ctx.stroke();
      }
      for (let gy = Math.floor(rb.yMin / step) * step; gy <= rb.yMax; gy += step) {
        const py = -(gy - rawYMid) * rawScale + h / 2 + panY;
        ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(w, py); ctx.stroke();
      }
    }

    // ── Zone overlays: compact label+coord box at centroid ──
    if (zoneOverlays && zoneOverlays.length > 0) {
      for (const zone of zoneOverlays) {
        let cx = 0, cy = 0;
        try {
          const poly: number[][] = JSON.parse(zone.polygonJson);
          if (poly.length < 3) continue;
          for (const p of poly) { cx += p[0]; cy += p[1]; }
          cx /= poly.length; cy /= poly.length;
        } catch { continue; }

        const csx = toPx(cx, cy), csy = toPy(cx, cy);
        const nameLine = zone.name;
        const coordLine = "(" + cx.toFixed(1) + "," + cy.toFixed(1) + ")";

        ctx.font = "bold 8px sans-serif"; const tw1 = ctx.measureText(nameLine).width;
        ctx.font = "7px sans-serif"; const tw2 = ctx.measureText(coordLine).width;
        const boxW = Math.max(Math.max(tw1, tw2) + 6, 28), boxH = 20;

        ctx.fillStyle = zone.color + "20";
        ctx.strokeStyle = zone.color + "aa";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(csx - boxW / 2, csy - boxH / 2, boxW, boxH, 3);
        ctx.fill(); ctx.stroke();

        ctx.fillStyle = zone.color + "ee";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.font = "bold 8px sans-serif"; ctx.fillText(nameLine, csx, csy - 3);
        ctx.font = "7px sans-serif"; ctx.fillStyle = zone.color + "99";
        ctx.fillText(coordLine, csx, csy + 6);
        ctx.textBaseline = "alphabetic";
      }
    }

    // ── Route overlays ──
    if (routeMode && routeOverlays && routeOverlays.length > 0) {
      for (const route of routeOverlays) {
        let path: [number, number][] = [];
        try { path = JSON.parse(route.pathJson); } catch { continue; }
        if (path.length < 2) continue;
        ctx.strokeStyle = route.color + "aa";
        ctx.lineWidth = Math.max(2, 4 / zoom);
        ctx.lineCap = "round"; ctx.lineJoin = "round";
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(toPx(path[0][0], path[0][1]), toPy(path[0][0], path[0][1]));
        for (let i = 1; i < path.length; i++) {
          ctx.lineTo(toPx(path[i][0], path[i][1]), toPy(path[i][0], path[i][1]));
        }
        ctx.stroke();
        // Direction arrows every ~8 points
        const ARROW_STEP = Math.max(8, Math.floor(path.length / 6));
        for (let i = ARROW_STEP; i < path.length - 1; i += ARROW_STEP) {
          const ax = toPx(path[i][0], path[i][1]), ay = toPy(path[i][0], path[i][1]);
          const bx = toPx(path[i + 1][0], path[i + 1][1]), by = toPy(path[i + 1][0], path[i + 1][1]);
          const adx = bx - ax, ady = by - ay;
          const alen = Math.sqrt(adx*adx + ady*ady) || 1;
          const ux = adx / alen, uy = ady / alen;
          ctx.fillStyle = route.color + "cc";
          ctx.beginPath();
          ctx.moveTo(ax + ux * 5, ay + uy * 5);
          ctx.lineTo(ax - ux * 3 + uy * 3, ay - uy * 3 - ux * 3);
          ctx.lineTo(ax - ux * 3 - uy * 3, ay - uy * 3 + ux * 3);
          ctx.closePath(); ctx.fill();
        }
        // 只给有名称的路线绘制标签（路线拓扑中仅高频路段有名称，避免标签堆叠）
        if (path.length >= 2 && route.name) {
          const mid = Math.floor(path.length / 2);
          const a = path[Math.max(0, mid - 1)], b = path[Math.min(path.length - 1, mid + 1)];
          const dx = toPx(b[0], b[1]) - toPx(a[0], a[1]), dy = toPy(b[0], b[1]) - toPy(a[0], a[1]);
          const len = Math.sqrt(dx*dx + dy*dy) || 1;
          const ox = -dy / len, oy = dx / len;
          const lx = toPx(path[mid][0], path[mid][1]) + ox * 18, ly = toPy(path[mid][0], path[mid][1]) + oy * 18;
          const ROUTE_TYPE_LABELS: Record<string, string> = {
            TRANSPORT: "运输", REVERSE: "单行", REST: "充电", NAVIGATING: "支线", STATION_WORK: "作业",
          };
          let typeLine = ROUTE_TYPE_LABELS[route.routeType] || route.routeType;
          let coordLine = route.name;
          for (const p of Object.values(ROUTE_TYPE_LABELS)) {
            if (route.name.startsWith(p + "-")) { typeLine = p; coordLine = route.name.slice(p.length + 1); break; }
          }
          ctx.font = "bold 8px sans-serif"; const tw1 = ctx.measureText(typeLine).width;
          ctx.font = "7px sans-serif"; const tw2 = ctx.measureText(coordLine).width;
          const bw = Math.max(tw1, tw2) + 8, bh = 24;
          ctx.fillStyle = route.color + "dd";
          ctx.beginPath(); ctx.roundRect(lx - bw/2, ly - bh/2, bw, bh, 3); ctx.fill();
          ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.font = "bold 8px sans-serif"; ctx.fillText(typeLine, lx, ly - 4);
          ctx.font = "7px sans-serif"; ctx.fillText(coordLine, lx, ly + 6);
          ctx.textBaseline = "alphabetic";
        }
      }
    }

    // ── Trail: playback uses refs (no React lag), live uses state ──
    let displayTrail: TrailPoint[];
    if (playbackActive) {
      const s = pbSortedRef.current;
      const p = pbProgressRef.current;
      if (s && s.length >= 2) {
        const totalMs = s[s.length - 1].ts - s[0].ts;
        const cutoffTs = s[0].ts + totalMs * p;
        let lo = 0, hi = s.length;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (s[mid].ts <= cutoffTs) lo = mid + 1; else hi = mid; }
        displayTrail = s.slice(0, lo) as TrailPoint[];
      } else {
        displayTrail = (s ?? []) as TrailPoint[];
      }
    } else {
      displayTrail = routeMode ? effectiveTrail.filter(p => Date.now() - p.ts < 30_000) : effectiveTrail;
    }
    if (displayTrail.length > 1) {
      if (activitySegments && activitySegments.length > 0) {
        const segLookup: { ts: number; color: string }[] = [];
        for (const seg of activitySegments) {
          segLookup.push({
            ts: new Date(seg.startTime).getTime(),
            color: ACTIVITY_COLORS[seg.activityType] || color,
          });
        }
        segLookup.sort((a, b) => a.ts - b.ts);

        ctx.lineWidth = 1.5; ctx.lineCap = "round"; ctx.lineJoin = "round";
        for (let i = 1; i < displayTrail.length; i++) {
          const t = displayTrail[i].ts;
          let segColor = color;
          for (let j = segLookup.length - 1; j >= 0; j--) {
            if (t >= segLookup[j].ts) { segColor = segLookup[j].color; break; }
          }
          const alpha = 0.1 + 0.8 * (i / displayTrail.length);
          ctx.strokeStyle = segColor + Math.floor(alpha * 255).toString(16).padStart(2, "0");
          ctx.beginPath();
          ctx.moveTo(toPx(displayTrail[i - 1].x, displayTrail[i - 1].y), toPy(displayTrail[i - 1].x, displayTrail[i - 1].y));
          ctx.lineTo(toPx(displayTrail[i].x, displayTrail[i].y), toPy(displayTrail[i].x, displayTrail[i].y));
          ctx.stroke();
        }
      } else {
        ctx.lineWidth = 1.5; ctx.lineCap = "round"; ctx.lineJoin = "round";
        for (let i = 1; i < displayTrail.length; i++) {
          const a = 0.1 + 0.8 * (i / displayTrail.length);
          ctx.strokeStyle = color + Math.floor(a * 255).toString(16).padStart(2, "0");
          ctx.beginPath();
          ctx.moveTo(toPx(displayTrail[i - 1].x, displayTrail[i - 1].y), toPy(displayTrail[i - 1].x, displayTrail[i - 1].y));
          ctx.lineTo(toPx(displayTrail[i].x, displayTrail[i].y), toPy(displayTrail[i].x, displayTrail[i].y));
          ctx.stroke();
        }
      }
    }

    // ── Transition markers ── (rendered after trail, before arrow)
    if (transitionMarkers && transitionMarkers.length > 0) {
      for (const marker of transitionMarkers) {
        const mx = toPx(marker.x, marker.y), my = toPy(marker.x, marker.y);
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(mx, my, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    // Current position arrow (interpolated for smooth movement, or playback position)
    if (hasData) {
      // Playback pos from refs (no React lag), live pos from interpolate
      let pos: { x: number; y: number; angle: number } | { x: number | null; y: number | null; angle: number | null };
      if (playbackActive) {
        const s = pbSortedRef.current;
        const data = pbDataRef.current;
        const p = pbProgressRef.current;
        if (s && data && s.length > 0) {
          const totalMs = new Date(data.to).getTime() - new Date(data.from).getTime();
          const nowTs = new Date(data.from).getTime() + totalMs * p;
          if (s.length === 1) { pos = { x: s[0].x, y: s[0].y, angle: s[0].angle }; }
          else {
            let lo = 0, hi = s.length;
            while (lo < hi) { const mid = (lo + hi) >> 1; if (s[mid].ts <= nowTs) lo = mid + 1; else hi = mid; }
            const after = Math.min(Math.max(lo, 1), s.length - 1);
            const a = s[after - 1], b = s[after];
            const t = Math.min(1, Math.max(0, (nowTs - a.ts) / (b.ts - a.ts || 1)));
            pos = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, angle: lerpAngle(a.angle, b.angle, t) };
          }
        } else {
          pos = { x: null, y: null, angle: null };
        }
      } else {
        pos = interpolatePosition(trail, currentX ?? null, currentY ?? null, currentAngle ?? null);
      }
      const px = toPx(pos.x!, pos.y!), py = toPy(pos.x!, pos.y!);
      const effectiveAngle = playbackActive ? (pos.angle ?? currentAngle) : currentAngle;
      if (effectiveAngle != null) {
        ctx.save(); ctx.translate(px, py);
        if (effectiveFollow) {
          // Follow mode: world rotates, arrow always points UP
          ctx.shadowColor = "rgba(0,0,0,0.25)"; ctx.shadowBlur = 3; ctx.shadowOffsetY = 1;
          ctx.fillStyle = online ? color : "#9ca3af";
          ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(-8, 4); ctx.lineTo(0, -2); ctx.lineTo(8, 4); ctx.closePath(); ctx.fill();
          ctx.shadowColor = "transparent"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.stroke();
        } else {
          ctx.rotate(-(effectiveAngle + rad));
          ctx.shadowColor = "rgba(0,0,0,0.25)"; ctx.shadowBlur = 3; ctx.shadowOffsetY = 1;
          ctx.fillStyle = online ? color : "#9ca3af";
          ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-4, -8); ctx.lineTo(2, 0); ctx.lineTo(-4, 8); ctx.closePath(); ctx.fill();
          ctx.shadowColor = "transparent"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.stroke();
        }
        ctx.restore();
      } else {
        ctx.fillStyle = online ? color : "#9ca3af"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }

      // ── Fork height mini bar ──
      // Playback: fork/jack from refs (lerped frame). Live: from props
      let effForkH = forkHeight, effJackSt = jackState, effJackFull = jackIsFull;
      if (playbackActive) {
        const s = pbSortedRef.current;
        const data = pbDataRef.current;
        const p = pbProgressRef.current;
        if (s && data && s.length > 0) {
          const totalMs = new Date(data.to).getTime() - new Date(data.from).getTime();
          const nowTs = new Date(data.from).getTime() + totalMs * p;
          let lo = 0, hi = s.length;
          while (lo < hi) { const mid = (lo + hi) >> 1; if (s[mid].ts <= nowTs) lo = mid + 1; else hi = mid; }
          const idx = Math.min(Math.max(lo - 1, 0), s.length - 1);
          effForkH = s[idx].forkHeight; effJackSt = s[idx].jackState; effJackFull = s[idx].jackIsFull;
        }
      }
      if (effForkH != null) {
        const fh = effForkH;
        const prevFh = prevForkRef.current;
        const changed = playbackActive || Math.abs(fh - prevFh) > 0.0005;
        prevForkRef.current = fh;
        if (changed) {
          const barH = 18, barW = 3;
          const barX = px + 20, barY = py - barH / 2;
          const forkPct = Math.min(1, fh / 0.1);
          ctx.fillStyle = "rgba(128,128,128,0.4)";
          ctx.fillRect(barX - barW/2, barY, barW, barH);
          const fillH = barH * forkPct;
          ctx.fillStyle = "#f59e0b";
          ctx.fillRect(barX - barW/2, barY + barH - fillH, barW, fillH);
        }
      }
      // ── Cargo icon: only when fork is up ──
      if (effJackSt === 1 || (effForkH != null && effForkH > 0.005)) {
        const cx = px, cy = py - 18;
        const full = effJackFull ?? false;
        ctx.fillStyle = full ? "#22c55e" : "#f59e0b";
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.roundRect(cx - 6, cy - 6, 12, 12, 2); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(cx - 4, cy - 6); ctx.lineTo(cx - 4, cy + 6); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx - 6, cy - 4); ctx.lineTo(cx + 6, cy - 4); ctx.stroke();
      }
    }

    if (!online && !playbackActive) { ctx.fillStyle = "rgba(239,68,68,0.06)"; ctx.fillRect(0, 0, w, h); }

    if (!followMode && rb) {
      const d = decimals((rb.xMax - rb.xMin) / GRID_LINES);
      ctx.fillStyle = textC; ctx.font = "10px sans-serif"; ctx.textAlign = "center";
      ctx.fillText(`X: ${rb.xMin.toFixed(d)} — ${rb.xMax.toFixed(d)}`, w / 2, h - 6);
      ctx.save(); ctx.translate(10, h / 2); ctx.rotate(-Math.PI / 2);
      ctx.fillText(`Y: ${rb.yMin.toFixed(d)} — ${rb.yMax.toFixed(d)}`, 0, 0); ctx.restore();
    }
  }, [ip, trail, currentX, currentY, currentAngle, online, color, hasData, dwellSpots, rotDeg, activitySegments, zoneOverlays, routeOverlays, routeMode, followMode, transitionMarkers, forkHeight, jackState, jackIsFull]);

  const drawRef = useRef(draw);
  drawRef.current = draw;

  useEffect(() => {
    let running = true;
    const c = containerRef.current; if (!c) return;
    const ro = new ResizeObserver(() => drawRef.current());
    ro.observe(c);
    const startLoop = () => {
      if (!running) return;
      drawRef.current();
      animRef.current = requestAnimationFrame(startLoop);
    };
    // Delay first frame to ensure layout is complete
    animRef.current = requestAnimationFrame(startLoop);
    return () => { running = false; cancelAnimationFrame(animRef.current); ro.disconnect(); };
  }, []);

  // ── Pan (drag) + Zoom (wheel) with auto-reset after 3s idle ──
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelReset = () => { if (resetTimerRef.current) { clearTimeout(resetTimerRef.current); resetTimerRef.current = null; } };
  const scheduleReset = () => { cancelReset(); resetTimerRef.current = setTimeout(() => { panRef.current = { x: 0, y: 0 }; zoomRef.current = 1; }, 10000); };

  useEffect(() => {
    const c = containerRef.current; if (!c) return;
    const onDown = (e: PointerEvent) => { cancelReset(); dragRef.current = { on: true, lx: e.clientX, ly: e.clientY }; dragStartRef.current = { x: e.clientX, y: e.clientY }; c.setPointerCapture(e.pointerId); };
    const onMove = (e: PointerEvent) => {
      if (!dragRef.current.on) return;
      cancelReset();
      panRef.current = { x: panRef.current.x + e.clientX - dragRef.current.lx, y: panRef.current.y + e.clientY - dragRef.current.ly };
      dragRef.current = { on: true, lx: e.clientX, ly: e.clientY };
    };
    const onUp = (e: PointerEvent) => {
      const wasDragging = dragRef.current.on;
      dragRef.current.on = false;
      // 选点模式：非拖拽的点击 → 逆变换为世界坐标
      const pm = pickModeRef.current;
      const pp = onPointPickRef.current;
      if (pm && pp && wasDragging) {
        const dx = e.clientX - dragStartRef.current.x;
        const dy = e.clientY - dragStartRef.current.y;
        if (Math.abs(dx) < 4 && Math.abs(dy) < 4) {
          const rect = c.getBoundingClientRect();
          const sx = e.clientX - rect.left;
          const sy = e.clientY - rect.top;
          const t = transformRef.current;
          if (t) {
            // 逆变换屏幕坐标 → 世界坐标
            let wx: number, wy: number;
            if (t.followMode) {
              // Follow mode: scale is FOLLOW_SCALE * zoom — skip for now
              return;
            } else {
              // Normal mode inverse:
              const rx = (sx - t.w / 2 - t.panX) / t.scale + t.xMid;
              const ry = -((sy - t.h / 2 - t.panY) / t.scale) + t.yMid;
              const cosR = Math.cos(-t.rad), sinR = Math.sin(-t.rad);
              wx = rx * cosR - ry * sinR;
              wy = rx * sinR + ry * cosR;
            }
            pp(wx, wy);
            scheduleReset();
            return;
          }
        }
      }
      scheduleReset();
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = c.getBoundingClientRect();
      const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
      const cw = rect.width, ch = rect.height;
      const oldZoom = zoomRef.current;
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const newZoom = Math.min(10, Math.max(0.2, oldZoom * factor));
      const zr = newZoom / oldZoom;
      panRef.current = {
        x: cx - (cx - cw / 2 - panRef.current.x) * zr - cw / 2,
        y: cy - (cy - ch / 2 - panRef.current.y) * zr - ch / 2,
      };
      zoomRef.current = newZoom;
      scheduleReset();
    };
    const onDbl = () => { panRef.current = { x: 0, y: 0 }; zoomRef.current = 1; };
    c.addEventListener("pointerdown", onDown);
    c.addEventListener("pointermove", onMove);
    c.addEventListener("pointerup", onUp);
    c.addEventListener("pointerleave", onUp);
    c.addEventListener("wheel", onWheel, { passive: false });
    c.addEventListener("dblclick", onDbl);
    return () => {
      c.removeEventListener("pointerdown", onDown);
      c.removeEventListener("pointermove", onMove);
      c.removeEventListener("pointerup", onUp);
      c.removeEventListener("pointerleave", onUp);
      c.removeEventListener("wheel", onWheel);
      c.removeEventListener("dblclick", onDbl);
    };
  }, []);

  return <div ref={containerRef} className={`relative w-full h-full min-h-0 ${pickMode ? "cursor-crosshair" : "cursor-grab"}`} style={{ touchAction: "none" }}><canvas ref={canvasRef} className="absolute inset-0" /></div>;
}
