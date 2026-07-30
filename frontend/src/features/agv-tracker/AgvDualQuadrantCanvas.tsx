import { useRef, useEffect, useCallback } from "react";
import type { TrailPoint } from "./useAgvTrailRef";
import { ACTIVITY_COLORS } from "@/api/domains/agv-analysis.api";

interface ZoneOverlay {
  id: number; polygonJson: string; color: string; name: string;
}

export interface AgvCanvasData {
  ip: string;
  trail: TrailPoint[];
  currentX: number | null;
  currentY: number | null;
  currentAngle: number | null;
  online: boolean;
  color: string;
  dwellSpots?: { x: number; y: number; durationSec: number }[];
  forkHeight?: number | null;
  jackState?: number | null;
  jackIsFull?: boolean | null;
}

interface RouteOverlay {
  id: number; pathJson: string; color: string; name: string; routeType: string;
}

interface Props {
  agvA: AgvCanvasData;
  agvB: AgvCanvasData;
  coordRotationDeg?: number;
  zoneOverlays?: ZoneOverlay[];
  routeOverlaysA?: RouteOverlay[];
  routeOverlaysB?: RouteOverlay[];
  routeMode?: boolean;
  followMode?: boolean;
  followTarget?: "A" | "B" | null;
  /** 地图选点模式：cursor 变十字，点击回传世界坐标 */
  pickMode?: boolean;
  onPointPick?: (x: number, y: number) => void;
}

// ── helpers (same as AgvQuadrantCanvas) ──
function readCssVar(el: Element, n: string, fb: string): string {
  return getComputedStyle(el).getPropertyValue(n).trim() || fb;
}

const GRID_LINES = 7;

function niceStep(range: number, lines: number): number {
  const raw = range / lines, mag = Math.pow(10, Math.floor(Math.log10(raw))), norm = raw / mag;
  if (norm <= 1.5) return mag; if (norm <= 3.5) return 2 * mag; if (norm <= 7.5) return 5 * mag; return 10 * mag;
}
function decimals(range: number): number { if (range <= 0.5) return 3; if (range <= 5) return 2; if (range <= 50) return 1; return 0; }

const rotPt = (x: number, y: number, rad: number) => ({
  x: x * Math.cos(rad) - y * Math.sin(rad),
  y: x * Math.sin(rad) + y * Math.cos(rad),
});

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

// ── Trail rendering helper ──
function drawTrail(
  ctx: CanvasRenderingContext2D,
  trail: TrailPoint[],
  color: string,
  toPx: (x: number, y: number) => number,
  toPy: (x: number, y: number) => number,
) {
  if (trail.length < 2) return;
  ctx.lineWidth = 1.5; ctx.lineCap = "round"; ctx.lineJoin = "round";
  for (let i = 1; i < trail.length; i++) {
    const a = 0.15 + 0.7 * (i / trail.length);
    ctx.strokeStyle = color + Math.floor(a * 255).toString(16).padStart(2, "0");
    ctx.beginPath();
    ctx.moveTo(toPx(trail[i - 1].x, trail[i - 1].y), toPy(trail[i - 1].x, trail[i - 1].y));
    ctx.lineTo(toPx(trail[i].x, trail[i].y), toPy(trail[i].x, trail[i].y));
    ctx.stroke();
  }
}

// ── Angle helpers ──
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

// ── Interpolate current position ──
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

// ── Component ──
export default function AgvDualQuadrantCanvas({ agvA, agvB, coordRotationDeg, zoneOverlays, routeOverlaysA, routeOverlaysB, routeMode, followMode, followTarget, pickMode, onPointPick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const boundsRef = useRef<{ xMin: number; xMax: number; yMin: number; yMax: number } | null>(null);
  const prevLenRef = useRef({ a: 0, b: 0 });
  const prevDegRef = useRef(coordRotationDeg ?? 0);
  const panRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const dragRef = useRef({ on: false, lx: 0, ly: 0 });
  const prevForkARef = useRef(0);
  const prevForkBRef = useRef(0);
  const zoneHitRef = useRef<{ id: number; name: string; sx: number; sy: number; w: number; h: number }[]>([]);
  const dragStartRef = useRef({ x: 0, y: 0 });
  // 保持 event handler 闭包中的 pickMode/onPointPick 同步
  const pickModeRef = useRef(pickMode);
  pickModeRef.current = pickMode;
  const onPointPickRef = useRef(onPointPick);
  onPointPickRef.current = onPointPick;
  // 存储当前帧的坐标变换参数，供 click handler 做逆变换
  const transformRef = useRef<{ scale: number; xMid: number; yMid: number; panX: number; panY: number; totalRad: number; w: number; h: number } | null>(null);

  const rotDeg = coordRotationDeg ?? 0;
  if (rotDeg !== prevDegRef.current) { boundsRef.current = null; prevDegRef.current = rotDeg; prevLenRef.current = { a: 0, b: 0 }; }

  // Rebuild bounds from trail data (zones rendered but don't affect viewport = world coord isolation)
  const lenA = agvA.trail.length, lenB = agvB.trail.length;
  if (lenA !== prevLenRef.current.a || lenB !== prevLenRef.current.b || !boundsRef.current) {
    prevLenRef.current = { a: lenA, b: lenB };
    let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
    for (const agv of [agvA, agvB]) {
      if (agv.currentX != null && agv.currentY != null) {
        if (agv.currentX < xMin) xMin = agv.currentX; if (agv.currentX > xMax) xMax = agv.currentX;
        if (agv.currentY < yMin) yMin = agv.currentY; if (agv.currentY > yMax) yMax = agv.currentY;
      }
      for (const p of agv.trail) {
        if (p.x < xMin) xMin = p.x; if (p.x > xMax) xMax = p.x;
        if (p.y < yMin) yMin = p.y; if (p.y > yMax) yMax = p.y;
      }
      if (agv.dwellSpots) for (const d of agv.dwellSpots) {
        if (d.x < xMin) xMin = d.x; if (d.x > xMax) xMax = d.x;
        if (d.y < yMin) yMin = d.y; if (d.y > yMax) yMax = d.y;
      }
    }
    // Fallback: if no trail data, use zone polygons so viewport doesn't collapse
    if (!isFinite(xMin) && zoneOverlays) for (const z of zoneOverlays) {
      try { const poly: [number,number][] = JSON.parse(z.polygonJson);
        for (const p of poly) { if (p[0] < xMin) xMin = p[0]; if (p[0] > xMax) xMax = p[0]; if (p[1] < yMin) yMin = p[1]; if (p[1] > yMax) yMax = p[1]; }
      } catch {}
    }
    if (isFinite(xMin)) {
      const mx = Math.max((xMax - xMin) * 0.02, 0.5), my = Math.max((yMax - yMin) * 0.02, 0.5);
      boundsRef.current = { xMin: xMin - mx, xMax: xMax + mx, yMin: yMin - my, yMax: yMax + my };
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

    const rb = boundsRef.current;
    if (!rb) { ctx.fillStyle = textC; ctx.font = "12px sans-serif"; ctx.textAlign = "center"; ctx.fillText("等待数据...", w / 2, h / 2); return; }

    const rad = (rotDeg * Math.PI) / 180;
    const b = rad !== 0 ? rotatedBounds(rb, rad) : rb;
    const pad = 0.10;
    const zoom = zoomRef.current;
    let panX = panRef.current.x, panY = panRef.current.y;

    // ── Follow mode: center on target AGV, rotate heading-up ──
    let followRad = 0;
    if (followMode && followTarget) {
      const target = followTarget === "A" ? agvA : agvB;
      if (target.currentX != null && target.currentY != null) {
        const baseScale = Math.min((w * (1 - 2 * pad)) / ((b.xMax - b.xMin) || 1), (h * (1 - 2 * pad)) / ((b.yMax - b.yMin) || 1));
        const s = baseScale * zoom;
        const rt = rotPt(target.currentX, target.currentY, rad);
        panX = -(rt.x - (b.xMin + b.xMax) / 2) * s;
        panY = (rt.y - (b.yMin + b.yMax) / 2) * s;
        const heading = target.currentAngle ?? 0;
        followRad = -(heading + Math.PI / 2);
      }
    }
    const totalRad = rad + followRad;

    const xRange = (b.xMax - b.xMin) || 1, yRange = (b.yMax - b.yMin) || 1;
    const scale = Math.min((w * (1 - 2 * pad)) / xRange, (h * (1 - 2 * pad)) / yRange) * zoom;
    const xMid = (b.xMin + b.xMax) / 2, yMid = (b.yMin + b.yMax) / 2;
    const toPx = (vx: number, vy: number) => { const r = rotPt(vx, vy, totalRad); return (r.x - xMid) * scale + w / 2 + panX; };
    const toPy = (vx: number, vy: number) => { const r = rotPt(vx, vy, totalRad); return -(r.y - yMid) * scale + h / 2 + panY; };

    // 存储变换参数供 click handler 逆变换
    transformRef.current = { scale, xMid, yMid, panX, panY, totalRad, w, h };

    // ── Grid (fixed to raw bounds, not rotated) ──
    const rawXRange = (rb.xMax - rb.xMin) || 1, rawYRange = (rb.yMax - rb.yMin) || 1;
    const rawScale = Math.min((w * (1 - 2 * pad)) / rawXRange, (h * (1 - 2 * pad)) / rawYRange) * zoom;
    const rawXMid = (rb.xMin + rb.xMax) / 2, rawYMid = (rb.yMin + rb.yMax) / 2;
    const gpX = panX, gpY = panY; // captured pan for grid
    const step = niceStep(Math.max(rawXRange, rawYRange), GRID_LINES);
    ctx.strokeStyle = gridC; ctx.lineWidth = 0.5;
    for (let gx = Math.floor(rb.xMin / step) * step; gx <= rb.xMax; gx += step) {
      const px = (gx - rawXMid) * rawScale + w / 2 + gpX;
      ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, h); ctx.stroke();
    }
    for (let gy = Math.floor(rb.yMin / step) * step; gy <= rb.yMax; gy += step) {
      const py = -(gy - rawYMid) * rawScale + h / 2 + gpY;
      ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(w, py); ctx.stroke();
    }

    // ── Zone overlays: box contains label + coordinates; fixed pixel size ──
    const hits: { id: number; name: string; sx: number; sy: number; w: number; h: number }[] = [];
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

        // Measure to size box
        ctx.font = "bold 8px sans-serif";
        const tw1 = ctx.measureText(nameLine).width;
        ctx.font = "7px sans-serif";
        const tw2 = ctx.measureText(coordLine).width;
        const boxW = Math.max(Math.max(tw1, tw2) + 6, 28), boxH = 20;

        // Box at centroid
        ctx.fillStyle = zone.color + "20";
        ctx.strokeStyle = zone.color + "aa";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(csx - boxW / 2, csy - boxH / 2, boxW, boxH, 3);
        ctx.fill(); ctx.stroke();

        // Label: name (bold) + coords (small)
        ctx.fillStyle = zone.color + "ee";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.font = "bold 8px sans-serif";
        ctx.fillText(nameLine, csx, csy - 3);
        ctx.font = "7px sans-serif";
        ctx.fillStyle = zone.color + "99";
        ctx.fillText(coordLine, csx, csy + 6);
        ctx.textBaseline = "alphabetic";

        // Record hit area for click-to-edit
        hits.push({ id: zone.id, name: zone.name, sx: csx - boxW / 2, sy: csy - boxH / 2, w: boxW, h: boxH });
      }
      zoneHitRef.current = hits;
    }

    // ── Route overlays ──
    if (routeMode) {
      const allRoutes = [...(routeOverlaysA ?? []), ...(routeOverlaysB ?? [])];
      // 同一 zone 的两台 AGV 共享同一套路线 → 按 name 去重，避免每条边画两次
      const seen = new Set<string>();
      const uniqueRoutes = allRoutes.filter(r => {
        const key = r.name || r.pathJson;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      for (const route of uniqueRoutes) {
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
          const mx = toPx(path[mid][0], path[mid][1]), my = toPy(path[mid][0], path[mid][1]);
          const a = path[Math.max(0, mid - 1)], b = path[Math.min(path.length - 1, mid + 1)];
          const dx = toPx(b[0], b[1]) - toPx(a[0], a[1]);
          const dy = toPy(b[0], b[1]) - toPy(a[0], a[1]);
          const len = Math.sqrt(dx*dx + dy*dy) || 1;
          const ox = -dy / len, oy = dx / len;
          const lx = mx + ox * 18, ly = my + oy * 18;
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

    // ── Render each AGV: heatmap → trail → position arrow ──
    for (const agv of [agvA, agvB]) {
      // Route mode: only show last 30s of trail
      const displayTrail = routeMode
        ? agv.trail.filter(p => Date.now() - p.ts < 30_000)
        : agv.trail;
      // Dwell heatmap
      if (agv.dwellSpots && agv.dwellSpots.length) {
        const maxD = Math.max(...agv.dwellSpots.map(d => d.durationSec), 1);
        for (const s of agv.dwellSpots) {
          const t = Math.min(s.durationSec, maxD) / maxD;
          ctx.fillStyle = agv.color + Math.floor((0.1 + 0.5 * t) * 255).toString(16).padStart(2, "0");
          ctx.beginPath(); ctx.arc(toPx(s.x, s.y), toPy(s.x, s.y), 3 + 8 * t, 0, Math.PI * 2); ctx.fill();
        }
      }

      // Trail
      drawTrail(ctx, displayTrail, agv.color, toPx, toPy);

      // Current position arrow
      const pos = interpolatePosition(displayTrail, agv.currentX, agv.currentY, agv.currentAngle);
      if (agv.currentX != null && agv.currentY != null && pos.x != null && pos.y != null) {
        const px = toPx(pos.x, pos.y), py = toPy(pos.x, pos.y);
        if (pos.angle != null) {
          ctx.save(); ctx.translate(px, py); ctx.rotate(-((pos.angle ?? 0) + rad));
          ctx.shadowColor = "rgba(0,0,0,0.25)"; ctx.shadowBlur = 3; ctx.shadowOffsetY = 1;
          ctx.fillStyle = agv.online ? agv.color : "#9ca3af";
          ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-4, -8); ctx.lineTo(2, 0); ctx.lineTo(-4, 8); ctx.closePath(); ctx.fill();
          ctx.shadowColor = "transparent"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
        } else {
          ctx.fillStyle = agv.online ? agv.color : "#9ca3af"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }

        // Fork height mini bar
        const fh = agv.forkHeight;
        if (fh != null) {
          const prevFh = (prevForkARef.current ?? 0);
          const changed = Math.abs(fh - prevFh) > 0.0005;
          if (agv === agvA) prevForkARef.current = fh; else prevForkBRef.current = fh;
          if (changed) {
            const barH = 18, barW = 3;
            const barX = px + 20, barY = py - barH / 2;
            const forkPct = Math.min(1, fh / 0.1);
            ctx.fillStyle = "rgba(128,128,128,0.4)";
            ctx.fillRect(barX - barW/2, barY, barW, barH);
            ctx.fillStyle = "#f59e0b";
            ctx.fillRect(barX - barW/2, barY + barH - barH * forkPct, barW, barH * forkPct);
          }
        }
        // Cargo icon
        if (agv.jackState === 1 || (fh != null && fh > 0.005)) {
          const cx = px, cy = py - 18;
          const full = agv.jackIsFull ?? false;
          ctx.fillStyle = full ? "#22c55e" : "#f59e0b";
          ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.roundRect(cx - 6, cy - 6, 12, 12, 2); ctx.fill(); ctx.stroke();
          ctx.strokeStyle = "#fff"; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(cx - 4, cy - 6); ctx.lineTo(cx - 4, cy + 6); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(cx - 6, cy - 4); ctx.lineTo(cx + 6, cy - 4); ctx.stroke();
        }
      }
    }

    // Offline overlay (subtle when either AGV is offline)
    if (!agvA.online || !agvB.online) { ctx.fillStyle = "rgba(239,68,68,0.04)"; ctx.fillRect(0, 0, w, h); }

    // Axis labels
    const d = decimals(step);
    ctx.fillStyle = textC; ctx.font = "10px sans-serif"; ctx.textAlign = "center";
    ctx.fillText(`X: ${rb.xMin.toFixed(d)} — ${rb.xMax.toFixed(d)}`, w / 2, h - 6);
    ctx.save(); ctx.translate(10, h / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillText(`Y: ${rb.yMin.toFixed(d)} — ${rb.yMax.toFixed(d)}`, 0, 0); ctx.restore();
  }, [agvA, agvB, rotDeg, zoneOverlays, routeOverlaysA, routeOverlaysB, routeMode, followMode, followTarget]);

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
    animRef.current = requestAnimationFrame(startLoop);
    return () => { running = false; cancelAnimationFrame(animRef.current); ro.disconnect(); };
  }, []);

  // ── Pan (drag) + Zoom (wheel) with auto-reset after 3s idle (only when not interacting) ──
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelReset = () => { if (resetTimerRef.current) { clearTimeout(resetTimerRef.current); resetTimerRef.current = null; } };
  const scheduleReset = () => {
    cancelReset();
    resetTimerRef.current = setTimeout(() => {
      panRef.current = { x: 0, y: 0 };
      zoomRef.current = 1;
    }, 10000);
  };

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
            const rx = (sx - t.w / 2 - t.panX) / t.scale + t.xMid;
            const ry = -((sy - t.h / 2 - t.panY) / t.scale) + t.yMid;
            const cosR = Math.cos(-t.totalRad), sinR = Math.sin(-t.totalRad);
            const wx = rx * cosR - ry * sinR;
            const wy = rx * sinR + ry * cosR;
            pp(wx, wy);
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
    // 点击标签编辑已禁用 — 保留空 handler 避免其他 click 行为
    const onClick = () => {};
    c.addEventListener("pointerdown", onDown);
    c.addEventListener("pointermove", onMove);
    c.addEventListener("pointerup", onUp);
    c.addEventListener("pointerleave", onUp);
    c.addEventListener("wheel", onWheel, { passive: false });
    c.addEventListener("dblclick", onDbl);
    c.addEventListener("click", onClick);
    return () => {
      c.removeEventListener("pointerdown", onDown);
      c.removeEventListener("pointermove", onMove);
      c.removeEventListener("pointerup", onUp);
      c.removeEventListener("pointerleave", onUp);
      c.removeEventListener("wheel", onWheel);
      c.removeEventListener("dblclick", onDbl);
      c.removeEventListener("click", onClick);
    };
  }, []);

  return (
    <div ref={containerRef} className={`relative w-full h-full min-h-0 ${pickMode ? "cursor-crosshair" : "cursor-grab"}`} style={{ touchAction: "none" }}>
      <canvas ref={canvasRef} className="absolute inset-0" />
    </div>
  );
}
