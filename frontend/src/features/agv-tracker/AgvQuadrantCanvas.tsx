import { useRef, useLayoutEffect, useCallback } from "react";
import type { TrailPoint } from "./useAgvTrailRef";
import { ACTIVITY_COLORS } from "@/api/domains/agv-analysis.api";

interface ActivitySegment {
  startTime: string; endTime: string; activityType: string;
}

interface ZoneOverlay {
  id: number; polygonJson: string; color: string; name: string;
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
  /** Activity segments for trail coloring */
  activitySegments?: ActivitySegment[];
  /** Zone polygons to overlay */
  zoneOverlays?: ZoneOverlay[];
  /** Transition markers: where activity changes */
  transitionMarkers?: TransitionMarker[];
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

export default function AgvQuadrantCanvas({ ip, trail, currentX, currentY, currentAngle, online, color, dwellSpots, coordRotationDeg, activitySegments, zoneOverlays, transitionMarkers }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const prevDegRef = useRef(coordRotationDeg ?? 0);
  const prevLenRef = useRef(0);

  const rotDeg = coordRotationDeg ?? 0;
  if (rotDeg !== prevDegRef.current) { delete rawBounds[ip]; prevDegRef.current = rotDeg; prevLenRef.current = 0; }

  const hasData = currentX != null && currentY != null;

  // 轨迹长度变化 → 全量重建边界（收缩+扩张），不再只扩张
  if (trail.length !== prevLenRef.current || !rawBounds[ip]) {
    prevLenRef.current = trail.length;
    let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
    if (hasData) {
      const cx = currentX!, cy = currentY!;
      if (cx < xMin) xMin = cx; if (cx > xMax) xMax = cx;
      if (cy < yMin) yMin = cy; if (cy > yMax) yMax = cy;
    }
    for (const p of trail) {
      if (p.x < xMin) xMin = p.x; if (p.x > xMax) xMax = p.x;
      if (p.y < yMin) yMin = p.y; if (p.y > yMax) yMax = p.y;
    }
    if (dwellSpots) for (const d of dwellSpots) {
      if (d.x < xMin) xMin = d.x; if (d.x > xMax) xMax = d.x;
      if (d.y < yMin) yMin = d.y; if (d.y > yMax) yMax = d.y;
    }
    if (isFinite(xMin)) {
      const mx = Math.max((xMax - xMin) * 0.1, 1), my = Math.max((yMax - yMin) * 0.1, 1);
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
    if (!rb) { ctx.fillStyle = textC; ctx.font = "12px sans-serif"; ctx.textAlign = "center"; ctx.fillText("等待数据...", w / 2, h / 2); return; }

    // 旋转后的包围盒用于自动适配
    const rad = (rotDeg * Math.PI) / 180;
    const b = rad !== 0 ? rotatedBounds(rb, rad) : rb;
    const pad = 0.08;
    const xRange = (b.xMax - b.xMin) || 1, yRange = (b.yMax - b.yMin) || 1;
    const scale = Math.min((w * (1 - 2 * pad)) / xRange, (h * (1 - 2 * pad)) / yRange);
    const xMid = (b.xMin + b.xMax) / 2, yMid = (b.yMin + b.yMax) / 2;
    const toPx = (vx: number, vy: number) => {
      const r = rotPt(vx, vy, rad);
      return (r.x - xMid) * scale + w / 2;
    };
    const toPy = (vx: number, vy: number) => {
      const r = rotPt(vx, vy, rad);
      return -(r.y - yMid) * scale + h / 2;
    };

    // Heatmap
    if (dwellSpots && dwellSpots.length) {
      const maxD = Math.max(...dwellSpots.map(d => d.durationSec), 1);
      for (const s of dwellSpots) {
        const t = Math.min(s.durationSec, maxD) / maxD;
        ctx.fillStyle = `rgba(${Math.round(255*t)},${Math.round(100*(1-t))},30,${(0.1+0.5*t).toFixed(2)})`;
        ctx.beginPath(); ctx.arc(toPx(s.x, s.y), toPy(s.x, s.y), 3 + 8 * t, 0, Math.PI * 2); ctx.fill();
      }
    }

    // Grid — fixed to raw bounds, not rotated (底图参考系)
    const rawXRange = (rb.xMax - rb.xMin) || 1, rawYRange = (rb.yMax - rb.yMin) || 1;
    const rawScale = Math.min((w * (1 - 2 * pad)) / rawXRange, (h * (1 - 2 * pad)) / rawYRange);
    const rawXMid = (rb.xMin + rb.xMax) / 2, rawYMid = (rb.yMin + rb.yMax) / 2;
    const step = niceStep(Math.max(rawXRange, rawYRange), GRID_LINES);
    ctx.strokeStyle = gridC; ctx.lineWidth = 0.5;
    for (let gx = Math.floor(rb.xMin / step) * step; gx <= rb.xMax; gx += step) {
      const px = (gx - rawXMid) * rawScale + w / 2;
      ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, h); ctx.stroke();
    }
    for (let gy = Math.floor(rb.yMin / step) * step; gy <= rb.yMax; gy += step) {
      const py = -(gy - rawYMid) * rawScale + h / 2;
      ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(w, py); ctx.stroke();
    }

    // ── Zone overlays ── (rendered after grid, before trail)
    if (zoneOverlays && zoneOverlays.length > 0) {
      for (const zone of zoneOverlays) {
        let poly: [number, number][] = [];
        try { poly = JSON.parse(zone.polygonJson); } catch { continue; }
        if (poly.length < 3) continue;

        ctx.fillStyle = zone.color + "18"; // ~10% opacity
        ctx.strokeStyle = zone.color + "66"; // ~40% opacity
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(toPx(poly[0][0], poly[0][1]), toPy(poly[0][0], poly[0][1]));
        for (let i = 1; i < poly.length; i++) {
          ctx.lineTo(toPx(poly[i][0], poly[i][1]), toPy(poly[i][0], poly[i][1]));
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Label at centroid
        let cx = 0, cy = 0;
        for (const p of poly) { cx += p[0]; cy += p[1]; }
        cx /= poly.length; cy /= poly.length;
        ctx.fillStyle = zone.color;
        ctx.font = "9px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(zone.name, toPx(cx, cy), toPy(cx, cy) - 2);
      }
    }

    // ── Trail with activity coloring ──
    if (trail.length > 1) {
      if (activitySegments && activitySegments.length > 0) {
        // Build a lookup: timestamp → activity color
        const segLookup: { ts: number; color: string }[] = [];
        for (const seg of activitySegments) {
          segLookup.push({
            ts: new Date(seg.startTime).getTime(),
            color: ACTIVITY_COLORS[seg.activityType] || color,
          });
        }
        segLookup.sort((a, b) => a.ts - b.ts);

        ctx.lineWidth = 1.5; ctx.lineCap = "round"; ctx.lineJoin = "round";
        for (let i = 1; i < trail.length; i++) {
          const t = trail[i].ts;
          // Find which segment this point belongs to
          let segColor = color; // default fallback
          for (let j = segLookup.length - 1; j >= 0; j--) {
            if (t >= segLookup[j].ts) { segColor = segLookup[j].color; break; }
          }
          const alpha = 0.15 + 0.7 * (i / trail.length);
          ctx.strokeStyle = segColor + Math.floor(alpha * 255).toString(16).padStart(2, "0");
          ctx.beginPath();
          ctx.moveTo(toPx(trail[i - 1].x, trail[i - 1].y), toPy(trail[i - 1].x, trail[i - 1].y));
          ctx.lineTo(toPx(trail[i].x, trail[i].y), toPy(trail[i].x, trail[i].y));
          ctx.stroke();
        }
      } else {
        // Fallback: existing single-color trail rendering
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

    // Current position arrow (offset angle by coordinate rotation)
    if (hasData) {
      const px = toPx(currentX!, currentY!), py = toPy(currentX!, currentY!);
      if (currentAngle != null) {
        ctx.save(); ctx.translate(px, py); ctx.rotate(-(currentAngle + rad));
        ctx.shadowColor = "rgba(0,0,0,0.25)"; ctx.shadowBlur = 3; ctx.shadowOffsetY = 1;
        ctx.fillStyle = online ? color : "#9ca3af";
        ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-4, -8); ctx.lineTo(2, 0); ctx.lineTo(-4, 8); ctx.closePath(); ctx.fill();
        ctx.shadowColor = "transparent"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
      } else {
        ctx.fillStyle = online ? color : "#9ca3af"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
    }

    if (!online) { ctx.fillStyle = "rgba(239,68,68,0.06)"; ctx.fillRect(0, 0, w, h); }

    const d = decimals(step);
    ctx.fillStyle = textC; ctx.font = "10px sans-serif"; ctx.textAlign = "center";
    ctx.fillText(`X: ${rb.xMin.toFixed(d)} — ${rb.xMax.toFixed(d)}`, w / 2, h - 6);
    ctx.save(); ctx.translate(10, h / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillText(`Y: ${rb.yMin.toFixed(d)} — ${rb.yMax.toFixed(d)}`, 0, 0); ctx.restore();
  }, [ip, trail, currentX, currentY, currentAngle, online, color, hasData, dwellSpots, rotDeg, activitySegments, zoneOverlays, transitionMarkers]);

  useLayoutEffect(() => {
    let running = true;
    const loop = () => { if (!running) return; draw(); animRef.current = requestAnimationFrame(loop); };
    loop();
    const c = containerRef.current; if (!c) return;
    const ro = new ResizeObserver(() => draw()); ro.observe(c);
    return () => { running = false; cancelAnimationFrame(animRef.current); ro.disconnect(); };
  }, [draw]);

  return <div ref={containerRef} className="relative w-full h-full min-h-0"><canvas ref={canvasRef} className="absolute inset-0" /></div>;
}
