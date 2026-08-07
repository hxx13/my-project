import { useRef, useEffect, useCallback } from "react";
import type { TrailPoint } from "./useAgvTrailRef";
import { ACTIVITY_COLORS } from "@/api/domains/agv-analysis.api";

interface ZoneOverlay {
  id: number; polygonJson: string; color: string; name: string;
  robotIp?: string;
  source?: string;
  stationPattern?: string;
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
  /** 独立坐标系偏移 (米) */
  coordOffsetX?: number;
  coordOffsetY?: number;
  coordRotationDeg?: number;
  /** 坐标系缩放 (1.0=默认) */
  coordScale?: number;
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
  /** Vehicle icon style */
  vehicleIcon?: 'arrow'|'forklift';
  hiddenAgvs?: Set<string>;
  /** 地图选点模式：cursor 变十字，点击回传世界坐标 */
  pickMode?: boolean;
  /** 两点矩形模式（拖拽绘制矩形区域） */
  pickTwoPoint?: boolean;
  /** 两点矩形模式下的第一个角点锚点（canvas 渲染锚点标记） */
  pickAnchor?: { x: number; y: number } | null;
  onPointPick?: (x: number, y: number) => void;
  /** 拖拽绘制矩形完成：直接回传两个对角点的世界坐标 */
  onRectDrawn?: (x1: number, y1: number, x2: number, y2: number) => void;
  onZoneClick?: (zoneId: number, name: string, stationPattern?: string) => void;
  /** 坐标系编辑模式：打开后显示参考框+可拖拽 */
  coordEditMode?: boolean;
  /** 标签编辑模式：打开后可拖拽调整 zone */
  zoneEditMode?: boolean;
  /** 编辑模式：当前选中的 zone ID（显示角手柄，可拖拽调整大小/移动） */
  selectedZoneId?: number | null;
  /** 编辑模式：点击 zone 选中 */
  onZoneSelect?: (id: number | null) => void;
  /** 编辑模式：拖拽角手柄或移动 zone 后提交新坐标 */
  onZoneReshape?: (id: number, polygonJson: string) => void;
  /** 编辑模式：拖拽参考系包围盒后提交新偏移 */
  onCoordFrameMove?: (ip: string, offsetX: number, offsetY: number) => void;
  /** 编辑模式：拖拽角手柄缩放后提交新 scale + 偏移 */
  onCoordFrameScale?: (ip: string, scale: number, offsetX: number, offsetY: number) => void;
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
  // 强制按时间戳排序
  const sorted = [...trail].sort((a, b) => a.ts - b.ts);

  // 去重同坐标静止帧：位置变化 < 0.05m 时放宽到 120s 间隔
  const deduped: TrailPoint[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i];
    if (deduped.length === 0) { deduped.push(p); continue; }
    const last = deduped[deduped.length - 1];
    const dx = Math.abs(p.x - last.x), dy = Math.abs(p.y - last.y);
    const dist = Math.sqrt(dx * dx + dy * dy);
    const maxGap = dist < 0.01 ? 120_000 : 30_000; // 同位置放宽到 120s
    if (dist < 0.05 && (p.ts - last.ts) < maxGap) continue;
    deduped.push(p);
  }


  // White outline
  ctx.lineWidth = 5;
  ctx.strokeStyle = "rgba(255,255,255,0.45)";
  ctx.beginPath();
  ctx.moveTo(toPx(deduped[0].x, deduped[0].y), toPy(deduped[0].x, deduped[0].y));
  for (let i = 1; i < deduped.length; i++) {
    ctx.lineTo(toPx(deduped[i].x, deduped[i].y), toPy(deduped[i].x, deduped[i].y));
  }
  ctx.stroke();

  // Colored core
  ctx.lineWidth = 3;
  for (let i = 1; i < deduped.length; i++) {
    const a = 0.15 + 0.7 * (i / deduped.length);
    ctx.strokeStyle = color + Math.floor(a * 255).toString(16).padStart(2, "0");
    ctx.beginPath();
    ctx.moveTo(toPx(deduped[i - 1].x, deduped[i - 1].y), toPy(deduped[i - 1].x, deduped[i - 1].y));
    ctx.lineTo(toPx(deduped[i].x, deduped[i].y), toPy(deduped[i].x, deduped[i].y));
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

// ── Heavy forklift draw ──
function drawForkliftDual(ctx: CanvasRenderingContext2D, clr: string) {
  ctx.save(); ctx.scale(1.3, 1.3);
  drawForkliftDualInner(ctx, clr);
  ctx.restore(); }
function drawForkliftDualInner(ctx: CanvasRenderingContext2D, clr: string) {
  ctx.shadowColor = "rgba(0,0,0,0.3)"; ctx.shadowBlur = 3; ctx.shadowOffsetY = 1;
  ctx.fillStyle = "#000"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 0.9;
  ctx.beginPath(); ctx.roundRect(-9, -8.5, 18, 3, 1); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.roundRect(-9, 5.5, 18, 3, 1); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.07)"; ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = clr; ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = clr; ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.3;
  ctx.beginPath(); ctx.roundRect(-13, -7, 26, 14, 6); ctx.fill(); ctx.stroke();
  ctx.fillStyle = clr + "cc";
  ctx.beginPath(); ctx.moveTo(11, -4); ctx.lineTo(11, 4); ctx.lineTo(14, 3); ctx.lineTo(14, -3); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "#fff"; ctx.lineWidth = 1; ctx.stroke();
  ctx.strokeStyle = "#d1d5db"; ctx.lineWidth = 4; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(-13, -6); ctx.lineTo(-13 - 11, -6); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-13, 6); ctx.lineTo(-13 - 11, 6); ctx.stroke();
  ctx.shadowColor = "transparent";
}

// ── 屏幕坐标逆变换 → 世界坐标 ──
function screenToWorldDual(sx: number, sy: number, t: { scale: number; xMid: number; yMid: number; panX: number; panY: number; rad: number; w: number; h: number; followMode: boolean }): { wx: number; wy: number } {
  if (t.followMode) return { wx: 0, wy: 0 };
  const rx = (sx - t.w / 2 - t.panX) / t.scale + t.xMid;
  const ry = -((sy - t.h / 2 - t.panY) / t.scale) + t.yMid;
  const cosR = Math.cos(-t.rad), sinR = Math.sin(-t.rad);
  return { wx: rx * cosR - ry * sinR, wy: rx * sinR + ry * cosR };
}

// ── 点是否在屏幕空间多边形内（射线法） ──
function pointInPolygonScrDual(px: number, py: number, poly: {x:number;y:number}[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// ── Component ──
export default function AgvDualQuadrantCanvas({ agvA, agvB, coordRotationDeg, zoneOverlays, routeOverlaysA, routeOverlaysB, routeMode, followMode, followTarget, vehicleIcon, hiddenAgvs, pickMode, pickTwoPoint, pickAnchor, onPointPick, onRectDrawn, onZoneClick, selectedZoneId, onZoneSelect, onZoneReshape, onCoordFrameMove, onCoordFrameScale, coordEditMode, zoneEditMode }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const boundsRef = useRef<{ xMin: number; xMax: number; yMin: number; yMax: number } | null>(null);
  const prevLenRef = useRef({ a: 0, b: 0, z: 0 });
  const prevDegRef = useRef(coordRotationDeg ?? 0);
  const panRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const dragRef = useRef({ on: false, lx: 0, ly: 0 });
  const prevForkARef = useRef(0);
  const prevForkBRef = useRef(0);
  const zoneHitRef = useRef<{ id: number; name: string; stationPattern?: string; sx: number; sy: number; w: number; h: number; polyScr: {x:number;y:number}[] }[]>([]);
  const dragStartRef = useRef({ x: 0, y: 0 });
  // 保持 event handler 闭包同步
  const pickModeRef = useRef(pickMode);
  pickModeRef.current = pickMode;
  const pickTwoPointRef = useRef(pickTwoPoint);
  pickTwoPointRef.current = pickTwoPoint;
  const onPointPickRef = useRef(onPointPick);
  onPointPickRef.current = onPointPick;
  const onRectDrawnRef = useRef(onRectDrawn);
  onRectDrawnRef.current = onRectDrawn;
  const onZoneSelectRef = useRef(onZoneSelect);
  onZoneSelectRef.current = onZoneSelect;
  const onZoneReshapeRef = useRef(onZoneReshape);
  onZoneReshapeRef.current = onZoneReshape;
  const coordEditModeRef = useRef(coordEditMode);
  coordEditModeRef.current = coordEditMode;
  const zoneEditModeRef = useRef(zoneEditMode);
  zoneEditModeRef.current = zoneEditMode;
  const onCoordFrameMoveRef = useRef(onCoordFrameMove);
  onCoordFrameMoveRef.current = onCoordFrameMove;
  const onCoordFrameScaleRef = useRef(onCoordFrameScale);
  onCoordFrameScaleRef.current = onCoordFrameScale;
  // 跟踪双 AGV 是否在移动中（用于自动回正决策：静止时不回正）
  const isMovingRef = useRef(false);
  // 存储当前帧的坐标变换参数，供 click handler 做逆变换
  const transformRef = useRef<{ scale: number; xMid: number; yMid: number; panX: number; panY: number; rad: number; w: number; h: number; followMode: boolean } | null>(null);
  // ── 拖拽绘制矩形 ──
  const drawingRef = useRef<{ active: boolean; startSx: number; startSy: number; curSx: number; curSy: number } | null>(null);
  // ── 编辑模式：角手柄拖拽 ──
  const handleDragRef = useRef<{ zoneId: number; vertIdx: number; origPoly: number[][] } | null>(null);
  // ── 编辑模式：zone 整体移动 ──
  const moveDragRef = useRef<{ zoneId: number; origPoly: number[][]; startSx: number; startSy: number; moved: boolean } | null>(null);
  // ── 参考系拖拽 ──
  const refFrameHitRef = useRef<{ ip: string; left: number; top: number; right: number; bottom: number }[]>([]);
  const refFrameDragRef = useRef<{ ip: string; startSx: number; startSy: number; origOffsetX: number; origOffsetY: number; combinedRad: number } | null>(null);
  const refFrameScaleRef = useRef<{ ip: string; startSx: number; startSy: number; origScale: number; anchorSx: number; anchorSy: number; anchorLocalX: number; anchorLocalY: number; oldOffsetX: number; oldOffsetY: number; origDist: number } | null>(null);
  const refFrameHandleHitRef = useRef<{ ip: string; sx: number; sy: number; w: number; h: number }[]>([]);
  // 存储每车包围盒的局部坐标边界，供缩放计算用
  const refFrameLocalBoundsRef = useRef<Record<string, { bxMin: number; byMin: number; bxMax: number; byMax: number }>>({});

  const rotDeg = coordRotationDeg ?? 0;
  if (rotDeg !== prevDegRef.current) { boundsRef.current = null; prevDegRef.current = rotDeg; prevLenRef.current = { a: 0, b: 0, z: 0 }; }

  // Rebuild bounds from trail data + zone/route overlays (确保远距离区域可见)
  const lenA = agvA.trail.length, lenB = agvB.trail.length;
  const zonesLen = (zoneOverlays ?? []).length + (routeOverlaysA ?? []).length + (routeOverlaysB ?? []).length;
  if (lenA !== prevLenRef.current.a || lenB !== prevLenRef.current.b || zonesLen !== prevLenRef.current.z || !boundsRef.current) {
    prevLenRef.current = { a: lenA, b: lenB, z: zonesLen };
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
    // Always include zone polygons in viewport so distant manual/behavior zones are visible
    if (zoneOverlays) for (const z of zoneOverlays) {
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

    // ── 每台 AGV 独立坐标系的变换工厂 ──
    const makeAgvTr = (agv: AgvCanvasData) => {
      const ox = agv.coordOffsetX ?? 0;
      const oy = agv.coordOffsetY ?? 0;
      const agvRad = ((agv.coordRotationDeg ?? 0) * Math.PI) / 180;
      const combinedRad = totalRad + agvRad;
      const agvScale = agv.coordScale ?? 1.0;
      return {
        toPx: (vx: number, vy: number) => {
          const r = rotPt((vx + ox) * agvScale, (vy + oy) * agvScale, combinedRad);
          return (r.x - xMid) * scale + w / 2 + panX;
        },
        toPy: (vx: number, vy: number) => {
          const r = rotPt((vx + ox) * agvScale, (vy + oy) * agvScale, combinedRad);
          return -(r.y - yMid) * scale + h / 2 + panY;
        },
      };
    };
    const trA = makeAgvTr(agvA);
    const trB = makeAgvTr(agvB);
    const getTr = (ip?: string) => ip === agvA.ip ? trA : ip === agvB.ip ? trB : null;

    // World 变换（无偏移，用于网格/全局元素）
    const toPx = (vx: number, vy: number) => { const r = rotPt(vx, vy, totalRad); return (r.x - xMid) * scale + w / 2 + panX; };
    const toPy = (vx: number, vy: number) => { const r = rotPt(vx, vy, totalRad); return -(r.y - yMid) * scale + h / 2 + panY; };

    // 存储变换参数供 click handler 逆变换
    transformRef.current = { scale, xMid, yMid, panX, panY, rad: totalRad, w, h, followMode: !!(followMode && followTarget) };

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

    // ── Zone overlays: polygon fill+stroke + compact label box at centroid ──
    const hits: { id: number; name: string; stationPattern?: string; sx: number; sy: number; w: number; h: number; polyScr: {x:number;y:number}[] }[] = [];
    if (zoneOverlays && zoneOverlays.length > 0) {
      for (const zone of zoneOverlays) {
        if (zone.robotIp && hiddenAgvs?.has(zone.robotIp)) continue;
        let cx = 0, cy = 0;
        let poly: number[][] = [];
        try {
          poly = JSON.parse(zone.polygonJson);
          if (poly.length < 3) continue;
          for (const p of poly) { cx += p[0]; cy += p[1]; }
          cx /= poly.length; cy /= poly.length;
        } catch { continue; }

        const isSelected = selectedZoneId === zone.id;
        const zTr2 = getTr(zone.robotIp);
        const polyScr = poly.map(p => ({ x: zTr2 ? zTr2.toPx(p[0], p[1]) : toPx(p[0], p[1]), y: zTr2 ? zTr2.toPy(p[0], p[1]) : toPy(p[0], p[1]) }));

        // ── 手动绘制区域 (MANUAL_RECT)：绘制多边形填充 + 描边 ──
        if (zone.source === "MANUAL_RECT") {
          ctx.beginPath();
          ctx.moveTo(polyScr[0].x, polyScr[0].y);
          for (let i = 1; i < polyScr.length; i++) {
            ctx.lineTo(polyScr[i].x, polyScr[i].y);
          }
          ctx.closePath();
          ctx.fillStyle = zone.color + (isSelected ? "1c" : "0d");
          ctx.fill();
          ctx.strokeStyle = zone.color + (isSelected ? "cc" : "55");
          ctx.lineWidth = isSelected ? Math.max(2, 2.5 / zoom) : Math.max(1, 1.2 / zoom);
          if (isSelected) { ctx.setLineDash([5, 3]); }
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // ── 质心标签框（圆角矩形包围盒） ──
        const zTr = getTr(zone.robotIp);
        const csx = zTr ? zTr.toPx(cx, cy) : toPx(cx, cy);
        const csy = zTr ? zTr.toPy(cx, cy) : toPy(cx, cy);
        const nameLine = zone.name;
        const coordLine = "(" + cx.toFixed(1) + "," + cy.toFixed(1) + ")";

        ctx.font = "bold 8px sans-serif";
        const tw1 = ctx.measureText(nameLine).width;
        ctx.font = "7px sans-serif";
        const tw2 = ctx.measureText(coordLine).width;
        const boxW = Math.max(Math.max(tw1, tw2) + 6, 28), boxH = 20;

        ctx.fillStyle = zone.color + "20";
        ctx.strokeStyle = zone.color + "aa";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(csx - boxW / 2, csy - boxH / 2, boxW, boxH, 3);
        ctx.fill(); ctx.stroke();

        ctx.fillStyle = zone.color + "ee";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.font = "bold 8px sans-serif";
        ctx.fillText(nameLine, csx, csy - 3);
        ctx.font = "7px sans-serif";
        ctx.fillStyle = zone.color + "99";
        ctx.fillText(coordLine, csx, csy + 6);
        ctx.textBaseline = "alphabetic";
        hits.push({ id: zone.id, name: zone.name, stationPattern: zone.stationPattern, sx: csx - boxW / 2, sy: csy - boxH / 2, w: boxW, h: boxH, polyScr });
      }
      zoneHitRef.current = hits;
    }

    // ── 选中 Zone 角手柄渲染（仅 editMode 开启时） ──
    if (selectedZoneId != null && !pickMode && zoneEditMode) {
      const selHit = hits.find(h => h.id === selectedZoneId);
      if (selHit && selHit.polyScr.length >= 3) {
        for (let i = 0; i < selHit.polyScr.length; i++) {
          const v = selHit.polyScr[i];
          const hs = 7;
          ctx.fillStyle = "#fff";
          ctx.strokeStyle = "#f59e0b";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.roundRect(v.x - hs, v.y - hs, hs * 2, hs * 2, 2);
          ctx.fill(); ctx.stroke();
          ctx.fillStyle = "#f59e0b";
          ctx.font = "bold 8px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(i + 1), v.x, v.y);
        }
      }
    }

    // ── 拖拽绘制矩形预览 ──
    if (drawingRef.current?.active) {
      const { startSx, startSy, curSx, curSy } = drawingRef.current;
      const rx = Math.min(startSx, curSx), ry = Math.min(startSy, curSy);
      const rw = Math.abs(curSx - startSx), rh = Math.abs(curSy - startSy);
      ctx.fillStyle = "rgba(245,158,11,0.13)";
      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.setLineDash([]);
      const t = transformRef.current;
      if (t && !t.followMode) {
        const wWStart = screenToWorldDual(startSx, startSy, t);
        const wWEnd = screenToWorldDual(curSx, curSy, t);
        const ww = Math.abs(wWEnd.wx - wWStart.wx), wh = Math.abs(wWEnd.wy - wWStart.wy);
        ctx.fillStyle = "#f59e0b";
        ctx.font = "bold 9px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`${ww.toFixed(2)} × ${wh.toFixed(2)} m`, (startSx + curSx) / 2, ry - 8);
      }
    }

    // ── Pick anchor marker (两点矩形第一角点) ──
    if (pickMode && pickAnchor) {
      const ax = toPx(pickAnchor.x, pickAnchor.y), ay = toPy(pickAnchor.x, pickAnchor.y);
      const pulse = 0.7 + 0.3 * Math.sin(Date.now() / 300);
      ctx.fillStyle = "#f59e0b";
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.globalAlpha = pulse;
      ctx.beginPath(); ctx.arc(ax, ay, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(ax - 10, ay); ctx.lineTo(ax + 10, ay); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ax, ay - 10); ctx.lineTo(ax, ay + 10); ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.font = "bold 9px sans-serif"; ctx.textAlign = "center";
      ctx.fillText(`(${pickAnchor.x.toFixed(2)},${pickAnchor.y.toFixed(2)})`, ax, ay - 16);
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
      }
    }

    // ── Render each AGV: heatmap → trail → position arrow ──
    refFrameHitRef.current = [];
    refFrameHandleHitRef.current = [];
    const visibleAgvs = [agvA, agvB].filter(a => !hiddenAgvs?.has(a.ip));
    for (const agv of visibleAgvs) {
      const tr = agv.ip === agvA.ip ? trA : trB;
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
          ctx.beginPath(); ctx.arc(tr.toPx(s.x, s.y), tr.toPy(s.x, s.y), 3 + 8 * t, 0, Math.PI * 2); ctx.fill();
        }
      }

      // Trail
      drawTrail(ctx, displayTrail, agv.color, tr.toPx, tr.toPy);

      // Current position arrow — 实时坐标优先，无数据回退到轨迹最后点
      let pos = interpolatePosition(displayTrail, agv.currentX, agv.currentY, agv.currentAngle);
      if ((pos.x == null || pos.y == null) && displayTrail.length > 0) {
        const last = displayTrail[displayTrail.length - 1];
        pos = { x: last.x, y: last.y, angle: last.angle ?? 0 };
      }
      if (pos.x != null && pos.y != null) {
        const px = tr.toPx(pos.x, pos.y), py = tr.toPy(pos.x, pos.y);
        const agvRotDeg = agv.coordRotationDeg ?? 0;
        const agvRotRad = (agvRotDeg * Math.PI) / 180;
        if (pos.angle != null) {
          ctx.save(); ctx.translate(px, py); ctx.rotate(-((pos.angle ?? 0) + rad + agvRotRad));
          if (vehicleIcon === 'forklift') {
            drawForkliftDual(ctx, agv.online ? agv.color : "#9ca3af");
          } else {
            ctx.shadowColor = "rgba(0,0,0,0.25)"; ctx.shadowBlur = 3; ctx.shadowOffsetY = 1;
            ctx.fillStyle = agv.online ? agv.color : "#9ca3af";
            ctx.beginPath(); ctx.moveTo(28, 0); ctx.lineTo(-8, -16); ctx.lineTo(4, 0); ctx.lineTo(-8, 16); ctx.closePath(); ctx.fill();
            ctx.shadowColor = "transparent"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.stroke();
          }
          ctx.restore();
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

      // ── 参考系包围盒（编辑模式下始终显示，含轨迹+zones+当前位置兜底） ──
      if (coordEditMode) {
        let bxMin = Infinity, bxMax = -Infinity, byMin = Infinity, byMax = -Infinity;
        for (const p of displayTrail) {
          if (p.x < bxMin) bxMin = p.x; if (p.x > bxMax) bxMax = p.x;
          if (p.y < byMin) byMin = p.y; if (p.y > byMax) byMax = p.y;
        }
        // 纳入属于该 AGV 的 zone 多边形
        if (zoneOverlays) for (const z of zoneOverlays) {
          if (z.robotIp !== agv.ip) continue;
          try { const poly: [number,number][] = JSON.parse(z.polygonJson);
            for (const p of poly) {
              if (p[0] < bxMin) bxMin = p[0]; if (p[0] > bxMax) bxMax = p[0];
              if (p[1] < byMin) byMin = p[1]; if (p[1] > byMax) byMax = p[1];
            }
          } catch {}
        }
        // 兜底：以 AGV 当前位置为中心
        if (!isFinite(bxMin)) {
          const cx = agv.currentX ?? 0, cy = agv.currentY ?? 0;
          bxMin = cx - 2; bxMax = cx + 2; byMin = cy - 2; byMax = cy + 2;
        }
        const padBox = Math.max((bxMax - bxMin) * 0.08, 0.5);
        bxMin -= padBox; bxMax += padBox; byMin -= padBox; byMax += padBox;
        const corners = [
          tr.toPx(bxMin, byMin), tr.toPy(bxMin, byMin),
          tr.toPx(bxMax, byMin), tr.toPy(bxMax, byMin),
          tr.toPx(bxMax, byMax), tr.toPy(bxMax, byMax),
          tr.toPx(bxMin, byMax), tr.toPy(bxMin, byMax),
        ];
        // 虚线包围盒
        ctx.strokeStyle = agv.color + "88";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(corners[0], corners[1]);
        ctx.lineTo(corners[2], corners[3]);
        ctx.lineTo(corners[4], corners[5]);
        ctx.lineTo(corners[6], corners[7]);
        ctx.closePath();
        ctx.stroke();
        ctx.setLineDash([]);
        // AGV 名称标签（顶部居中）
        const cxBox = (corners[0] + corners[4]) / 2;
        const agvName = agv.ip.endsWith(".16") ? "AGV-1" : agv.ip.endsWith(".18") ? "AGV-2" : agv.ip.endsWith(".20") ? "AGV-3" : "AGV-4";
        ctx.fillStyle = agv.color;
        ctx.font = "bold 9px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(agvName, cxBox, corners[1] - 8);
        // ── 缩放手柄（顶部左角橙色方块） ──
        const hx = corners[6], hy = corners[7];
        const hs = 8;
        ctx.fillStyle = "#f59e0b";
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(hx - hs, hy - hs, hs * 2, hs * 2, 3);
        ctx.fill(); ctx.stroke();
        // 十字箭头
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(hx - 4, hy); ctx.lineTo(hx + 4, hy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(hx, hy - 4); ctx.lineTo(hx, hy + 4); ctx.stroke();
        // 记录整个包围盒命中区（移动） + 角手柄命中区（缩放）
        const boxLeft = Math.min(corners[0], corners[2], corners[4], corners[6]);
        const boxRight = Math.max(corners[0], corners[2], corners[4], corners[6]);
        const boxTop = Math.min(corners[1], corners[3], corners[5], corners[7]);
        const boxBottom = Math.max(corners[1], corners[3], corners[5], corners[7]);
        refFrameHitRef.current.push({ ip: agv.ip, left: boxLeft, top: boxTop, right: boxRight, bottom: boxBottom });
        // 角手柄命中区（比视觉稍大）
        refFrameHandleHitRef.current.push({ ip: agv.ip, sx: hx - hs - 2, sy: hy - hs - 2, w: (hs + 2) * 2, h: (hs + 2) * 2 });
        // 存储局部坐标边界供缩放锚点计算
        refFrameLocalBoundsRef.current[agv.ip] = { bxMin, byMin, bxMax, byMax };
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

    // 检测任一 AGV 是否在移动（用于自动回正决策：静止时不回正）
    let moving = false;
    for (const agv of [agvA, agvB]) {
      if (agv.trail.length >= 2) {
        const a = agv.trail[agv.trail.length - 2], b = agv.trail[agv.trail.length - 1];
        const dt = (b.ts - a.ts) / 1000;
        if (dt > 0 && dt < 5) {
          const dx = b.x - a.x, dy = b.y - a.y;
          if (Math.sqrt(dx * dx + dy * dy) / dt > 0.02) { moving = true; break; }
        }
      }
    }
    isMovingRef.current = moving;
  }, [agvA, agvB, rotDeg, zoneOverlays, routeOverlaysA, routeOverlaysB, routeMode, followMode, followTarget, vehicleIcon, hiddenAgvs, coordEditMode, zoneEditMode, selectedZoneId, pickTwoPoint, pickMode, pickAnchor]);

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

  // ── Pan (drag) + Zoom (wheel) with auto-reset after 30s idle (only when AGV moving) ──
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelReset = () => { if (resetTimerRef.current) { clearTimeout(resetTimerRef.current); resetTimerRef.current = null; } };
  const scheduleReset = () => {
    cancelReset();
    resetTimerRef.current = setTimeout(() => {
      if (isMovingRef.current) {
        panRef.current = { x: 0, y: 0 };
        zoomRef.current = 1;
      }
    }, 30000);
  };

  useEffect(() => {
    const c = containerRef.current; if (!c) return;

    const HANDLE_HIT_R = 10;
    const DRAG_THRESHOLD = 4;

    const findZoneAt = (sx: number, sy: number): number | null => {
      const hits = zoneHitRef.current;
      for (const h of hits) {
        if (h.polyScr && h.polyScr.length >= 3 && pointInPolygonScrDual(sx, sy, h.polyScr)) return h.id;
      }
      for (const h of hits) {
        if (sx >= h.sx && sx <= h.sx + h.w && sy >= h.sy && sy <= h.sy + h.h) return h.id;
      }
      return null;
    };

    const findHandleAt = (sx: number, sy: number): { zoneId: number; vertIdx: number } | null => {
      if (selectedZoneId == null) return null;
      const hit = zoneHitRef.current.find(h => h.id === selectedZoneId);
      if (!hit || !hit.polyScr) return null;
      for (let i = 0; i < hit.polyScr.length; i++) {
        const v = hit.polyScr[i];
        if (Math.abs(sx - v.x) < HANDLE_HIT_R && Math.abs(sy - v.y) < HANDLE_HIT_R) {
          return { zoneId: selectedZoneId, vertIdx: i };
        }
      }
      return null;
    };

    const onDown = (e: PointerEvent) => {
      cancelReset();
      const rect = c.getBoundingClientRect();
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
      const pm = pickModeRef.current;
      const ptp = pickTwoPointRef.current;

      // ① 拖拽绘制矩形
      if (pm && ptp) {
        drawingRef.current = { active: true, startSx: sx, startSy: sy, curSx: sx, curSy: sy };
        dragStartRef.current = { x: e.clientX, y: e.clientY };
        dragRef.current = { on: true, lx: e.clientX, ly: e.clientY };
        c.setPointerCapture(e.pointerId);
        return;
      }

      // ② 角手柄拖拽（需 editMode 开启）
      const handleHit = findHandleAt(sx, sy);
      if (handleHit && !pm && zoneEditModeRef.current) {
        const zo = zoneOverlays?.find(z => z.id === handleHit.zoneId);
        if (zo) {
          try {
            const origPoly: number[][] = JSON.parse(zo.polygonJson);
            handleDragRef.current = { zoneId: handleHit.zoneId, vertIdx: handleHit.vertIdx, origPoly };
            dragStartRef.current = { x: e.clientX, y: e.clientY };
            c.setPointerCapture(e.pointerId);
            return;
          } catch {}
        }
      }

      // ②.5 参考系：角手柄→缩放，包围盒→移动
      const refHandleHit = refFrameHandleHitRef.current.find(h => sx >= h.sx && sx <= h.sx + h.w && sy >= h.sy && sy <= h.sy + h.h);
      if (refHandleHit && !pm && coordEditModeRef.current) {
        const agv = refHandleHit.ip === agvA.ip ? agvA : agvB;
        const box = refFrameHitRef.current.find(f => f.ip === refHandleHit.ip);
        const localBounds = refFrameLocalBoundsRef.current[refHandleHit.ip];
        if (box && localBounds) {
          const agvScale = agv.coordScale ?? 1.0;
          // 用局部坐标 + 当前 scale 实时计算 origDist，杜绝新旧帧不匹配
          const localDx = localBounds.bxMax - localBounds.bxMin;
          const localDy = localBounds.byMax - localBounds.byMin;
          const localDiag = Math.sqrt(localDx * localDx + localDy * localDy);
          const viewScale = transformRef.current?.scale ?? 1;
          const origDist = Math.max(localDiag * agvScale * viewScale, 1);
          refFrameScaleRef.current = {
            ip: refHandleHit.ip,
            startSx: e.clientX, startSy: e.clientY,
            origScale: agvScale,
            anchorSx: box.right, anchorSy: box.bottom,
            anchorLocalX: localBounds.bxMax, anchorLocalY: localBounds.byMax,
            oldOffsetX: agv.coordOffsetX ?? 0,
            oldOffsetY: agv.coordOffsetY ?? 0,
            origDist,
          };
        }
        dragStartRef.current = { x: e.clientX, y: e.clientY };
        c.setPointerCapture(e.pointerId);
        return;
      }
      const refFrame = refFrameHitRef.current.find(f => sx >= f.left && sx <= f.right && sy >= f.top && sy <= f.bottom);
      if (refFrame && !pm && coordEditModeRef.current) {
        const agv = refFrame.ip === agvA.ip ? agvA : agvB;
        const agvRad = ((agv.coordRotationDeg ?? 0) * Math.PI) / 180;
        refFrameDragRef.current = {
          ip: refFrame.ip,
          startSx: e.clientX, startSy: e.clientY,
          origOffsetX: agv.coordOffsetX ?? 0,
          origOffsetY: agv.coordOffsetY ?? 0,
          combinedRad: (transformRef.current?.rad ?? 0) + agvRad,
        };
        dragStartRef.current = { x: e.clientX, y: e.clientY };
        c.setPointerCapture(e.pointerId);
        return;
      }

      // ③ zone 体内点击 → 拖拽移动（需 editMode 开启）
      const zoneHit = findZoneAt(sx, sy);
      if (zoneHit != null && !pm && zoneEditModeRef.current) {
        const zo = zoneOverlays?.find(z => z.id === zoneHit);
        if (zo) {
          try {
            const origPoly: number[][] = JSON.parse(zo.polygonJson);
            moveDragRef.current = { zoneId: zoneHit, origPoly, startSx: sx, startSy: sy, moved: false };
            dragStartRef.current = { x: e.clientX, y: e.clientY };
            c.setPointerCapture(e.pointerId);
            return;
          } catch {}
        }
      }

      // ④ 普通平移
      dragRef.current = { on: true, lx: e.clientX, ly: e.clientY };
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      c.setPointerCapture(e.pointerId);
    };

    const onMove = (e: PointerEvent) => {
      if (drawingRef.current?.active) {
        cancelReset();
        const rect = c.getBoundingClientRect();
        drawingRef.current.curSx = e.clientX - rect.left;
        drawingRef.current.curSy = e.clientY - rect.top;
        return;
      }
      if (handleDragRef.current) {
        cancelReset();
        const rect = c.getBoundingClientRect();
        const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
        const t = transformRef.current;
        if (!t) return;
        const w = screenToWorldDual(sx, sy, t);
        const { zoneId, vertIdx } = handleDragRef.current;
        const zo = zoneOverlays?.find(z => z.id === zoneId);
        if (zo) {
          try {
            const poly: number[][] = JSON.parse(zo.polygonJson);
            if (vertIdx < poly.length) {
              poly[vertIdx] = [w.wx, w.wy];
              handleDragRef.current = { zoneId, vertIdx, origPoly: poly };
            }
          } catch {}
        }
        return;
      }
      if (refFrameScaleRef.current) {
        cancelReset();
        const rect = c.getBoundingClientRect();
        const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
        const { anchorSx, anchorSy, origScale, origDist, ip, anchorLocalX, anchorLocalY, oldOffsetX, oldOffsetY } = refFrameScaleRef.current;
        const newDist = Math.sqrt((sx - anchorSx) ** 2 + (sy - anchorSy) ** 2);
        const newScale = Math.max(0.1, Math.min(10, origScale * (newDist / origDist)));
        // 对角固定：保持锚点世界坐标不变
        const anchorWorldX = (anchorLocalX + oldOffsetX) * origScale;
        const anchorWorldY = (anchorLocalY + oldOffsetY) * origScale;
        const newOffsetX = anchorWorldX / newScale - anchorLocalX;
        const newOffsetY = anchorWorldY / newScale - anchorLocalY;
        const cfs = onCoordFrameScaleRef.current;
        if (cfs) cfs(ip, newScale, newOffsetX, newOffsetY);
        return;
      }
      if (refFrameDragRef.current) {
        cancelReset();
        const dx = e.clientX - refFrameDragRef.current.startSx;
        const dy = e.clientY - refFrameDragRef.current.startSy;
        if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
          const scale = transformRef.current?.scale ?? 1;
          // 屏幕增量 → 世界增量 → 逆向旋转抵消坐标系旋转
          const worldDx = dx / scale, worldDy = -dy / scale;
          const invRad = -refFrameDragRef.current.combinedRad;
          const rotDx = worldDx * Math.cos(invRad) - worldDy * Math.sin(invRad);
          const rotDy = worldDx * Math.sin(invRad) + worldDy * Math.cos(invRad);
          const newOx = refFrameDragRef.current.origOffsetX + rotDx;
          const newOy = refFrameDragRef.current.origOffsetY + rotDy;
          const cfm = onCoordFrameMoveRef.current;
          if (cfm) cfm(refFrameDragRef.current.ip, newOx, newOy);
        }
        return;
      }
      if (moveDragRef.current) {
        cancelReset();
        const rect = c.getBoundingClientRect();
        const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
        if (Math.abs(sx - moveDragRef.current.startSx) > DRAG_THRESHOLD ||
            Math.abs(sy - moveDragRef.current.startSy) > DRAG_THRESHOLD) {
          moveDragRef.current.moved = true;
          const t = transformRef.current;
          if (!t) return;
          const wCur = screenToWorldDual(sx, sy, t);
          const wStart = screenToWorldDual(moveDragRef.current.startSx, moveDragRef.current.startSy, t);
          const wDx = wCur.wx - wStart.wx, wDy = wCur.wy - wStart.wy;
          moveDragRef.current.startSx = sx;
          moveDragRef.current.startSy = sy;
          const movedPoly = moveDragRef.current.origPoly.map(([vx, vy]) => [vx + wDx, vy + wDy]);
          moveDragRef.current.origPoly = movedPoly;
        }
        return;
      }
      if (!dragRef.current.on) return;
      cancelReset();
      panRef.current = { x: panRef.current.x + e.clientX - dragRef.current.lx, y: panRef.current.y + e.clientY - dragRef.current.ly };
      dragRef.current = { on: true, lx: e.clientX, ly: e.clientY };
    };

    const onUp = (e: PointerEvent) => {
      const wasDragging = dragRef.current.on;
      dragRef.current.on = false;
      const ddx = e.clientX - dragStartRef.current.x;
      const ddy = e.clientY - dragStartRef.current.y;

      // ① 拖拽绘制完成
      if (drawingRef.current?.active) {
        drawingRef.current.active = false;
        if (Math.abs(ddx) > DRAG_THRESHOLD || Math.abs(ddy) > DRAG_THRESHOLD) {
          const t = transformRef.current;
          const rd = onRectDrawnRef.current;
          if (t && rd) {
            const w1 = screenToWorldDual(drawingRef.current.startSx, drawingRef.current.startSy, t);
            const w2 = screenToWorldDual(drawingRef.current.curSx, drawingRef.current.curSy, t);
            rd(w1.wx, w1.wy, w2.wx, w2.wy);
          }
        } else {
          const pp = onPointPickRef.current;
          if (pp) {
            const rect = c.getBoundingClientRect();
            const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
            const t = transformRef.current;
            if (t && !t.followMode) {
              const w = screenToWorldDual(sx, sy, t);
              pp(w.wx, w.wy);
            }
          }
        }
        drawingRef.current = null;
        scheduleReset();
        return;
      }

      // ② 角手柄拖拽完成
      if (handleDragRef.current) {
        const { zoneId, origPoly } = handleDragRef.current;
        handleDragRef.current = null;
        const or = onZoneReshapeRef.current;
        if (or) or(zoneId, JSON.stringify(origPoly));
        scheduleReset();
        return;
      }

      // ②.5 参考系缩放完成
      if (refFrameScaleRef.current) {
        refFrameScaleRef.current = null;
        scheduleReset();
        return;
      }
      // 参考系拖拽完成
      if (refFrameDragRef.current) {
        refFrameDragRef.current = null;
        scheduleReset();
        return;
      }

      // ③ zone 移动完成
      if (moveDragRef.current) {
        const { zoneId, origPoly, moved } = moveDragRef.current;
        moveDragRef.current = null;
        if (moved) {
          const or = onZoneReshapeRef.current;
          if (or) or(zoneId, JSON.stringify(origPoly));
        } else {
          const zs = onZoneSelectRef.current;
          if (zs) zs(zoneId);
        }
        scheduleReset();
        return;
      }

      // ④ 普通点击 → 选点 或 zone点击
      const pm = pickModeRef.current;
      if (pm && wasDragging && Math.abs(ddx) < DRAG_THRESHOLD && Math.abs(ddy) < DRAG_THRESHOLD) {
        const pp = onPointPickRef.current;
        if (pp) {
          const rect = c.getBoundingClientRect();
          const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
          const t = transformRef.current;
          if (t && !t.followMode) {
            const w = screenToWorldDual(sx, sy, t);
            pp(w.wx, w.wy);
            scheduleReset();
            return;
          }
        }
      }

      if (!pm && wasDragging && Math.abs(ddx) < DRAG_THRESHOLD && Math.abs(ddy) < DRAG_THRESHOLD) {
        const rect = c.getBoundingClientRect();
        const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
        for (const h of zoneHitRef.current) {
          if (sx >= h.sx && sx <= h.sx + h.w && sy >= h.sy && sy <= h.sy + h.h) {
            if (onZoneClick) onZoneClick(h.id, h.name, h.stationPattern);
            const zs = onZoneSelectRef.current;
            if (zs) zs(h.id);
            return;
          }
        }
        const bodyId = findZoneAt(sx, sy);
        if (bodyId != null) {
          const zs = onZoneSelectRef.current;
          if (zs) zs(bodyId);
          return;
        }
        const zs2 = onZoneSelectRef.current;
        if (zs2) zs2(null);
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
  }, [zoneOverlays, selectedZoneId]);

  return (
    <div ref={containerRef} className={`relative w-full h-full min-h-0 ${pickMode ? "cursor-crosshair" : selectedZoneId != null ? "cursor-default" : "cursor-grab"}`} style={{ touchAction: "none" }}>
      <canvas ref={canvasRef} className="absolute inset-0" />
    </div>
  );
}
