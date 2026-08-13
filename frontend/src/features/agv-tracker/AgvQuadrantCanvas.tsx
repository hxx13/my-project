import { useRef, useEffect, useLayoutEffect, useCallback, useMemo } from "react";
import type { TrailPoint } from "./useAgvTrailRef";
import type { AgvTrajectoryRow, HistoryPlaybackResponse } from "@/api/domains/agv.api";
import { ACTIVITY_COLORS } from "@/api/domains/agv-analysis.api";
import { getAgvLabel } from "@/features/agv-tracker/agvRobotConfig";

interface ActivitySegment {
  startTime: string; endTime: string; activityType: string;
}

interface ZoneOverlay {
  id: number; polygonJson: string; color: string; name: string;
  source?: string;
  stationPattern?: string;
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
  coordOffsetX?: number;
  coordOffsetY?: number;
  coordScale?: number;
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
  /** 两点矩形模式（拖拽绘制矩形区域） */
  pickTwoPoint?: boolean;
  /** 两点矩形模式下的第一个角点锚点（canvas 渲染锚点标记） */
  pickAnchor?: { x: number; y: number } | null;
  onPointPick?: (x: number, y: number) => void;
  /** 拖拽绘制矩形完成：直接回传两个对角点的世界坐标 */
  onRectDrawn?: (x1: number, y1: number, x2: number, y2: number) => void;
  onZoneClick?: (zoneId: number, name: string, stationPattern?: string) => void;
  /** Vehicle icon style */
  vehicleIcon?: 'arrow'|'forklift';
  /** Current activity for state rendering */
  currentActivity?: string;
  charging?: boolean | null;
  speed?: number | null;
  /** 历史回放模式 */
  playbackActive?: boolean;
  playbackData?: HistoryPlaybackResponse | null;
  playbackTrail?: AgvTrajectoryRow[] | null;
  playbackProgress?: number; // 0..1
  /** 编辑模式开关：打开后才能拖拽调整 zone */
  coordEditMode?: boolean;
  zoneEditMode?: boolean;
  /** 编辑模式：当前选中的 zone ID（显示角手柄，可拖拽调整大小/移动） */
  selectedZoneId?: number | null;
  /** 编辑模式：点击 zone 选中 */
  onZoneSelect?: (id: number | null) => void;
  /** 编辑模式：拖拽角手柄或移动 zone 后提交新坐标 */
  onZoneReshape?: (id: number, polygonJson: string) => void;
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

// ── 屏幕坐标逆变换 → 世界坐标（用于拖拽绘制 + 编辑手柄） ──
function screenToWorld(sx: number, sy: number, t: { scale: number; xMid: number; yMid: number; panX: number; panY: number; rad: number; w: number; h: number; followMode: boolean }): { wx: number; wy: number } {
  if (t.followMode) return { wx: 0, wy: 0 };
  const rx = (sx - t.w / 2 - t.panX) / t.scale + t.xMid;
  const ry = -((sy - t.h / 2 - t.panY) / t.scale) + t.yMid;
  const cosR = Math.cos(-t.rad), sinR = Math.sin(-t.rad);
  return { wx: rx * cosR - ry * sinR, wy: rx * sinR + ry * cosR };
}

// ── 点是否在屏幕空间多边形内（射线法） ──
function pointInPolygonScr(px: number, py: number, poly: {x:number;y:number}[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
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


// ═══ Heavy forklift — copied from preview dC, state mapped ═══
function drawForklift(ctx: CanvasRenderingContext2D, color: string, online: boolean,
    act?: string, ch?: boolean | null, spd?: number | null,
    pbActive?: boolean, pbData?: any, pbProgress?: number,
    trail?: any[], forkH?: number | null) {
  (window as any).__forkCalled = ((window as any).__forkCalled || 0) + 1;
  let effectiveAct = act;
  if (pbActive && pbData?.segments && pbProgress != null) {
    const totalMs = new Date(pbData.to).getTime() - new Date(pbData.from).getTime();
    const nowTs = new Date(pbData.from).getTime() + totalMs * pbProgress;
    for (const seg of pbData.segments) {
      if (nowTs >= new Date(seg.startTime).getTime() && nowTs <= new Date(seg.endTime).getTime()) {
        effectiveAct = seg.activityType; break; } } }
  const clr = online ? color : "#9ca3af";
  // Movement detection: use playback trail if active, otherwise live trail
  let isMoving: boolean;
  let forkUp: boolean;
  if (pbActive && pbData?.trail) {
    // Playback: check position change near current progress
    const pbTrail = pbData.trail.filter((r: any) => r.x != null && r.y != null)
      .sort((a: any, b: any) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime());
    const totalMs = new Date(pbData.to).getTime() - new Date(pbData.from).getTime();
    const nowTs = new Date(pbData.from).getTime() + totalMs * (pbProgress ?? 1);
    // Find closest index
    let idx = 0;
    for (let i = 0; i < pbTrail.length; i++) {
      if (new Date(pbTrail[i].recorded_at).getTime() >= nowTs) { idx = Math.max(0, i - 1); break; }
    }
    // Look at 3 seconds of trail before current position
    const cutoff = nowTs - 3000;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = Math.max(0, idx - 60); i <= idx; i++) {
      if (new Date(pbTrail[i].recorded_at).getTime() >= cutoff) {
        minX = Math.min(minX, pbTrail[i].x); maxX = Math.max(maxX, pbTrail[i].x);
        minY = Math.min(minY, pbTrail[i].y); maxY = Math.max(maxY, pbTrail[i].y);
      }
    }
    isMoving = isFinite(minX) && (maxX - minX > 0.02 || maxY - minY > 0.02);
    // Fork height from playback position
    const curPt = pbTrail[idx];
    forkUp = curPt?.fork_height != null && curPt.fork_height > 0.01;
  } else {
    // Live mode
    const now2 = Date.now();
    const recentTrail = (trail || []).filter((p: any) => now2 - p.ts < 3000);
    let moved = false;
    if (recentTrail.length >= 2) {
      const f = recentTrail[0], l = recentTrail[recentTrail.length - 1];
      moved = Math.sqrt((l.x-f.x)*(l.x-f.x) + (l.y-f.y)*(l.y-f.y)) > 0.02;
    }
    isMoving = moved || (spd != null && spd > 0.02);
    forkUp = forkH != null && forkH > 0.01;
  }
  let s: string;
  if (ch) s = 'charging';
  else if (forkUp && isMoving) s = 'moving';
  else if (forkUp && !isMoving) s = 'loaded';
  else if (isMoving) s = 'default';
  else s = 'resting';

  // Debug
  (window as any).__forkSt = s;
  (window as any).__forkMoved = isMoving;
  (window as any).__forkForkUp = forkUp;
  (window as any).__forkCh = ch;
  (window as any).__forkSpd = spd;

  ctx.save(); ctx.scale(1.28, 1.28);
  // Debug
  const now3 = Date.now();
  if (!(window as any).__lastLog || now3 - (window as any).__lastLog > 1000) {
    (window as any).__lastLog = now3;
    console.log(`[forklift] ch=${ch} forkUp=${forkUp} isMoving=${isMoving} pb=${!!pbActive} → ${s}`);}
  // Body color per state
  const bodyClr = s==='charging'?'#22c55e':s==='moving'||s==='loaded'?'#f59e0b':clr;
  // ═══ All coordinates 180° flipped: (x,y)→(-x,-y) ═══
  ctx.fillStyle='rgba(255,255,255,0.07)';ctx.beginPath();ctx.arc(0,0,14,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=bodyClr;ctx.strokeStyle='#fff';ctx.lineWidth=1.2;ctx.beginPath();ctx.arc(0,0,6,0,Math.PI*2);ctx.fill();ctx.stroke();
  ctx.fillStyle='#000';ctx.strokeStyle='#fff';ctx.lineWidth=.9;
  ctx.beginPath();ctx.roundRect(-9,5.5,18,3,1);ctx.fill();ctx.stroke();
  ctx.beginPath();ctx.roundRect(-9,-8.5,18,3,1);ctx.fill();ctx.stroke();
  ctx.fillStyle=bodyClr;ctx.strokeStyle='#fff';ctx.lineWidth=1.3;ctx.beginPath();ctx.roundRect(-13,-7,26,14,6);ctx.fill();ctx.stroke();
  ctx.fillStyle=bodyClr+'cc';ctx.beginPath();ctx.moveTo(-11,4);ctx.lineTo(-11,-4);ctx.lineTo(-14,-3);ctx.lineTo(-14,3);ctx.closePath();ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=1;ctx.stroke();
  let b=-12,l=18,g=6,f=s==='moving'?l:l*.7;
  ctx.strokeStyle='#d1d5db';ctx.lineWidth=4;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(b,g);ctx.lineTo(b-f,g);ctx.stroke();ctx.beginPath();ctx.moveTo(b,-g);ctx.lineTo(b-f,-g);ctx.stroke();
  if(s==='loaded'||s==='moving'){let bx=b-4-f,bw=16,bh=14;
    ctx.fillStyle='#d4a574';ctx.strokeStyle='#a0724a';ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(bx,-bh/2,bw,bh,2);ctx.fill();ctx.stroke();
    ctx.fillStyle='#f59e0b';ctx.strokeStyle='#d97706';ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(bx+3,-bh/2+3,bw-6,bh-6,2);ctx.fill();ctx.stroke();
    ctx.strokeStyle='rgba(255,255,255,0.53)';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(bx+5,-bh/2+4);ctx.lineTo(bx+bw-5,bh/2-4);ctx.stroke();ctx.beginPath();ctx.moveTo(bx+bw-5,-bh/2+4);ctx.lineTo(bx+5,bh/2-4);ctx.stroke();}
  if(s==='moving'){ctx.strokeStyle='rgba(255,255,255,0.33)';ctx.lineWidth=1.5;
    for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(22+i*10,8-i*8);ctx.lineTo(30+i*10,8-i*8);ctx.stroke();}}
  if(s==='charging'){ctx.strokeStyle='rgba(34,197,238,0.25)';ctx.lineWidth=4;ctx.beginPath();ctx.arc(0,0,28,0,Math.PI*2);ctx.stroke();
    ctx.fillStyle='#22c55e';ctx.strokeStyle='#fff';ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(21,-8,8,16,3);ctx.fill();ctx.stroke();
    ctx.fillStyle='#166534';ctx.beginPath();ctx.roundRect(23,-5,4,10,1);ctx.fill();
    ctx.strokeStyle='#22c55e';ctx.lineWidth=1.5;ctx.setLineDash([2,2]);ctx.beginPath();ctx.moveTo(21,0);ctx.lineTo(13,0);ctx.stroke();ctx.setLineDash([]);}
  if(s==='resting'){ctx.fillStyle='rgba(0,0,0,0.27)';ctx.beginPath();ctx.roundRect(-13,-7,26,14,6);ctx.fill();
    ctx.fillStyle='rgba(255,255,255,0.47)';ctx.font='12px system-ui';ctx.fillText('Z',22,14);ctx.fillText('z',26,6);ctx.fillText('z',28,-2);}
  if(s==='default'&&isMoving){ctx.strokeStyle='rgba(255,255,255,0.33)';ctx.lineWidth=1.5;
    for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(22+i*10,8-i*8);ctx.lineTo(30+i*10,8-i*8);ctx.stroke();}}
  ctx.restore();
}

export default function AgvQuadrantCanvas({ ip, trail, currentX, currentY, currentAngle, online, color, dwellSpots, coordRotationDeg, activitySegments, zoneOverlays, routeOverlays, routeMode, followMode, transitionMarkers, forkHeight, jackState, jackIsFull, vehicleIcon, currentActivity, charging, speed, pickMode, pickTwoPoint, pickAnchor, onPointPick, onRectDrawn, onZoneClick, coordEditMode, zoneEditMode, selectedZoneId, coordOffsetX, coordOffsetY, coordScale, onZoneSelect, onZoneReshape, playbackActive, playbackData, playbackTrail, playbackProgress }: Props) {
  (window as any).__vicon = vehicleIcon;
const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const prevDegRef = useRef(coordRotationDeg ?? 0);
  const prevLenRef = useRef(0);
  const prevOverlayLenRef = useRef(0);
  const panRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const dragRef = useRef({ on: false, lx: 0, ly: 0 });
  const dragStartRef = useRef({ x: 0, y: 0 });
  const zoneHitRef = useRef<{ id: number; name: string; stationPattern?: string; sx: number; sy: number; w: number; h: number; polyScr: {x:number;y:number}[] }[]>([]);
  const prevForkRef = useRef(forkHeight ?? 0);
  // ── 拖拽绘制矩形 ──
  const drawingRef = useRef<{ active: boolean; startSx: number; startSy: number; curSx: number; curSy: number } | null>(null);
  // ── 编辑模式：角手柄拖拽 ──
  const handleDragRef = useRef<{ zoneId: number; vertIdx: number; origPoly: number[][] } | null>(null);
  // ── 编辑模式：zone 整体移动 ──
  const moveDragRef = useRef<{ zoneId: number; origPoly: number[][]; startSx: number; startSy: number; moved: boolean } | null>(null);

  // ── Playback refs for draw-loop access (bypasses React render pipeline) ──
  const pbSortedRef = useRef<{ x: number; y: number; angle: number; ts: number; forkHeight: number | null; jackState: number | null; jackIsFull: boolean }[] | null>(null);
  const pbProgressRef = useRef(playbackProgress ?? 1);
  const pbDataRef = useRef(playbackData ?? null);
  pbProgressRef.current = playbackProgress ?? 1;
  pbDataRef.current = playbackData ?? null;
  // 保持 event handler 闭包中的 pickMode/onPointPick 同步
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
  const zoneEditModeRef = useRef(zoneEditMode);
  zoneEditModeRef.current = zoneEditMode;
  // 跟踪 AGV 是否在移动中（用于自动回正决策：静止时不回正）
  const isMovingRef = useRef(false);
  // 存储当前帧的坐标变换参数，供 click handler 做逆变换
  const transformRef = useRef<{ scale: number; xMid: number; yMid: number; panX: number; panY: number; rad: number; w: number; h: number; followMode: boolean } | null>(null);

  const rotDeg = coordRotationDeg ?? 0;
  if (rotDeg !== prevDegRef.current) { delete rawBounds[ip]; prevDegRef.current = rotDeg; prevLenRef.current = 0; prevOverlayLenRef.current = 0; }

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

  // 优先用实时坐标，无数据时回退到轨迹最后一个点（AGV 离线也能显示最后位置）
  const lastTrailPt = effectiveTrail.length > 0 ? effectiveTrail[effectiveTrail.length - 1] : null;
  const hasData = playbackActive
    ? (pbSortedRef.current != null && pbSortedRef.current.length > 0)
    : (currentX != null && currentY != null) || lastTrailPt != null;

  // 轨迹长度变化 或 zone/route 数量变化 → 全量重建边界
  const trailForBounds = playbackActive ? (pbSortedRef.current ?? []) : effectiveTrail;
  const overlayLen = (zoneOverlays ?? []).length + (routeOverlays ?? []).length;
  if (trailForBounds.length !== prevLenRef.current || overlayLen !== prevOverlayLenRef.current || !rawBounds[ip]) {
    prevLenRef.current = trailForBounds.length;
    prevOverlayLenRef.current = overlayLen;
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
    // Always include zone polygons in viewport so distant manual/behavior zones are visible
    if (zoneOverlays) for (const z of zoneOverlays) {
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
    // ── 每车独立坐标系（偏移+缩放） ──
    const ox = coordOffsetX ?? 0, oy = coordOffsetY ?? 0, cs = coordScale ?? 1.0;

    let toPx: (vx: number, vy: number) => number;
    let toPy: (vx: number, vy: number) => number;
    let xMid = 0, yMid = 0, scale = 1;

    if (effectiveFollow && hasData) {
      const cx = playbackActive && playbackPos ? playbackPos.x : currentX!;
      const cy = playbackActive && playbackPos ? playbackPos.y : currentY!;
      const wcx = (cx + ox) * cs, wcy = (cy + oy) * cs;
      const rawHeading = playbackActive && playbackPos ? playbackPos.angle : (currentAngle != null ? currentAngle : 0);
      // 车头永远向上：world 方向 rawHeading 旋转 followRad 后应指向 screen 上方 (-π/2)
      // rawHeading + followRad = -π/2  →  followRad = -π/2 - rawHeading
      const followRad = -Math.PI / 2 - rawHeading;
      const fs = FOLLOW_SCALE * zoom;
      toPx = (vx: number, vy: number) => {
        const wx = (vx + ox) * cs, wy = (vy + oy) * cs;
        const dx = wx - wcx, dy = wy - wcy;
        return (dx * Math.cos(followRad) - dy * Math.sin(followRad)) * fs + w / 2 + panX;
      };
      toPy = (vx: number, vy: number) => {
        const wx = (vx + ox) * cs, wy = (vy + oy) * cs;
        const dx = wx - wcx, dy = wy - wcy;
        return (dx * Math.sin(followRad) + dy * Math.cos(followRad)) * fs + h / 2 + panY;
      };
    } else {
      // ── Normal mode: auto-scaled to fit bounds ──
      const b = rad !== 0 ? rotatedBounds(rb!, rad) : rb!;
      const xRange = (b.xMax - b.xMin) || 1, yRange = (b.yMax - b.yMin) || 1;
      scale = Math.min((w * (1 - 2 * pad)) / xRange, (h * (1 - 2 * pad)) / yRange) * zoom;
      xMid = (b.xMin + b.xMax) / 2; yMid = (b.yMin + b.yMax) / 2;
      toPx = (vx: number, vy: number) => {
        const r = rotPt((vx + ox) * cs, (vy + oy) * cs, rad);
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

    // ── Zone overlays: polygon fill+stroke + compact label box at centroid ──
    const hits: { id: number; name: string; stationPattern?: string; sx: number; sy: number; w: number; h: number; polyScr: {x:number;y:number}[] }[] = [];
    if (zoneOverlays && zoneOverlays.length > 0) {
      for (const zone of zoneOverlays) {
        let cx = 0, cy = 0;
        let poly: number[][] = [];
        try {
          poly = JSON.parse(zone.polygonJson);
          if (poly.length < 3) continue;
          for (const p of poly) { cx += p[0]; cy += p[1]; }
          cx /= poly.length; cy /= poly.length;
        } catch { continue; }

        const isSelected = selectedZoneId === zone.id;
        const polyScr = poly.map(p => ({ x: toPx(p[0], p[1]), y: toPy(p[0], p[1]) }));

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
        hits.push({ id: zone.id, name: zone.name, stationPattern: zone.stationPattern, sx: csx - boxW / 2, sy: csy - boxH / 2, w: boxW, h: boxH, polyScr });
      }
    }
    // 更新 zone 命中区域供点击检测
    zoneHitRef.current = hits;

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
          // 顶点编号
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
      // 半透明填充
      ctx.fillStyle = "rgba(245,158,11,0.13)";
      ctx.fillRect(rx, ry, rw, rh);
      // 虚线描边
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.setLineDash([]);
      // 尺寸标签
      const t = transformRef.current;
      if (t && !t.followMode) {
        const wWStart = screenToWorld(startSx, startSy, t);
        const wWEnd = screenToWorld(curSx, curSy, t);
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
      // 十字准心
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(ax - 10, ay); ctx.lineTo(ax + 10, ay); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ax, ay - 10); ctx.lineTo(ax, ay + 10); ctx.stroke();
      // 坐标标签
      ctx.fillStyle = "#fff"; ctx.font = "bold 9px sans-serif"; ctx.textAlign = "center";
      ctx.fillText(`(${pickAnchor.x.toFixed(2)},${pickAnchor.y.toFixed(2)})`, ax, ay - 16);
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
    // 强制按时间戳排序，确保连线严格按时间顺序（不打乱 seed+append 的拼接）
    if (displayTrail.length > 1) {
      displayTrail = [...displayTrail].sort((a, b) => a.ts - b.ts);
    }
    // 去重同坐标静止帧：位置变化 < 0.05m 且时间间隔 < 30s → 跳过
    if (displayTrail.length > 2) {
      const deduped = [displayTrail[0]];
      for (let i = 1; i < displayTrail.length; i++) {
        const p = displayTrail[i];
        const last = deduped[deduped.length - 1];
        const dx = Math.abs(p.x - last.x), dy = Math.abs(p.y - last.y);
        if (Math.sqrt(dx * dx + dy * dy) < 0.05 && (p.ts - last.ts) < 30_000) continue;
        deduped.push(p);
      }
      displayTrail = deduped;
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

        // 白色外描边 → 任何背景下都可见
        ctx.lineWidth = 5; ctx.lineCap = "round"; ctx.lineJoin = "round";
        ctx.strokeStyle = "rgba(255,255,255,0.45)";
        ctx.beginPath();
        ctx.moveTo(toPx(displayTrail[0].x, displayTrail[0].y), toPy(displayTrail[0].x, displayTrail[0].y));
        for (let i = 1; i < displayTrail.length; i++) {
          ctx.lineTo(toPx(displayTrail[i].x, displayTrail[i].y), toPy(displayTrail[i].x, displayTrail[i].y));
        }
        ctx.stroke();

        // 彩色内芯
        ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.lineJoin = "round";
        for (let i = 1; i < displayTrail.length; i++) {
          const t = displayTrail[i].ts;
          let segColor = color;
          for (let j = segLookup.length - 1; j >= 0; j--) {
            if (t >= segLookup[j].ts) { segColor = segLookup[j].color; break; }
          }
          const alpha = 0.15 + 0.8 * (i / displayTrail.length);
          ctx.strokeStyle = segColor + Math.floor(alpha * 255).toString(16).padStart(2, "0");
          ctx.beginPath();
          ctx.moveTo(toPx(displayTrail[i - 1].x, displayTrail[i - 1].y), toPy(displayTrail[i - 1].x, displayTrail[i - 1].y));
          ctx.lineTo(toPx(displayTrail[i].x, displayTrail[i].y), toPy(displayTrail[i].x, displayTrail[i].y));
          ctx.stroke();
        }
      } else {
        // 白色外描边
        ctx.lineWidth = 5; ctx.lineCap = "round"; ctx.lineJoin = "round";
        ctx.strokeStyle = "rgba(255,255,255,0.45)";
        ctx.beginPath();
        ctx.moveTo(toPx(displayTrail[0].x, displayTrail[0].y), toPy(displayTrail[0].x, displayTrail[0].y));
        for (let i = 1; i < displayTrail.length; i++) {
          ctx.lineTo(toPx(displayTrail[i].x, displayTrail[i].y), toPy(displayTrail[i].x, displayTrail[i].y));
        }
        ctx.stroke();

        // 彩色内芯
        ctx.lineWidth = 3;
        for (let i = 1; i < displayTrail.length; i++) {
          const a = 0.15 + 0.8 * (i / displayTrail.length);
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

    // ── 参考系包围盒（单象限 coordEditMode，与双象限一致） ──
    if (coordEditMode && effectiveTrail.length > 0) {
      let bxMin = Infinity, bxMax = -Infinity, byMin = Infinity, byMax = -Infinity;
      for (const p of effectiveTrail) {
        if (p.x < bxMin) bxMin = p.x; if (p.x > bxMax) bxMax = p.x;
        if (p.y < byMin) byMin = p.y; if (p.y > byMax) byMax = p.y;
      }
      if (zoneOverlays) for (const z of zoneOverlays) {
        try { const poly: number[][] = JSON.parse(z.polygonJson);
          for (const p of poly) {
            if (p[0] < bxMin) bxMin = p[0]; if (p[0] > bxMax) bxMax = p[0];
            if (p[1] < byMin) byMin = p[1]; if (p[1] > byMax) byMax = p[1];
          }
        } catch {}
      }
      if (!isFinite(bxMin)) { bxMin = -2; bxMax = 2; byMin = -2; byMax = 2; }
      const padBox = Math.max((bxMax - bxMin) * 0.08, 0.5);
      bxMin -= padBox; bxMax += padBox; byMin -= padBox; byMax += padBox;
      const corners = [
        toPx(bxMin, byMin), toPy(bxMin, byMin),
        toPx(bxMax, byMin), toPy(bxMax, byMin),
        toPx(bxMax, byMax), toPy(bxMax, byMax),
        toPx(bxMin, byMax), toPy(bxMin, byMax),
      ];
      ctx.strokeStyle = color + "88";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(corners[0], corners[1]); ctx.lineTo(corners[2], corners[3]);
      ctx.lineTo(corners[4], corners[5]); ctx.lineTo(corners[6], corners[7]);
      ctx.closePath(); ctx.stroke();
      ctx.setLineDash([]);
      // 标签
      const cxBox = (corners[0] + corners[4]) / 2;
      ctx.fillStyle = color;
      ctx.font = "bold 9px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(getAgvLabel(ip), cxBox, corners[1] - 8);
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
      // 无实时坐标时回退到轨迹最后一个点，保证 AGV 离线仍显示最后位置
      if ((pos.x == null || pos.y == null) && lastTrailPt) {
        pos = { x: lastTrailPt.x, y: lastTrailPt.y, angle: lastTrailPt.angle ?? 0 };
      }
      if (pos.x == null || pos.y == null) return; // 没救了
      const px = toPx(pos.x!, pos.y!), py = toPy(pos.x!, pos.y!);
      const effectiveAngle = playbackActive ? (pos.angle ?? currentAngle) : currentAngle;
      if (vehicleIcon === 'forklift') (window as any).__willCall = true;
      if (effectiveAngle != null) {
        ctx.save(); ctx.translate(px, py);
        if (effectiveFollow) {
          // 跟随模式：图标转-π/2，让车头（右侧）对上屏上方
          ctx.rotate(-Math.PI / 2);
          if (vehicleIcon === 'forklift') {
            drawForklift(ctx, color, online, currentActivity, charging, speed, playbackActive, playbackData, playbackProgress, trail, forkHeight);
          } else {
            ctx.shadowColor = "rgba(0,0,0,0.25)"; ctx.shadowBlur = 3; ctx.shadowOffsetY = 1;
            ctx.fillStyle = online ? color : "#9ca3af";
            ctx.beginPath(); ctx.moveTo(28, 0); ctx.lineTo(-8, -16); ctx.lineTo(4, 0); ctx.lineTo(-8, 16); ctx.closePath(); ctx.fill();
            ctx.shadowColor = "transparent"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.stroke();
          }
        } else {
          ctx.rotate(-(effectiveAngle + rad));
          if (vehicleIcon === 'forklift') {
            drawForklift(ctx, color, online, currentActivity, charging, speed, playbackActive, playbackData, playbackProgress, trail, forkHeight);
          } else {
            ctx.shadowColor = "rgba(0,0,0,0.25)"; ctx.shadowBlur = 3; ctx.shadowOffsetY = 1;
            ctx.fillStyle = online ? color : "#9ca3af";
            ctx.beginPath(); ctx.moveTo(28, 0); ctx.lineTo(-8, -16); ctx.lineTo(4, 0); ctx.lineTo(-8, 16); ctx.closePath(); ctx.fill();
            ctx.shadowColor = "transparent"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.stroke();
          }
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

    // 检测 AGV 是否在移动（用于自动回正决策：静止时不回正）
    if (trail.length >= 2) {
      const a = trail[trail.length - 2], b = trail[trail.length - 1];
      const dt = (b.ts - a.ts) / 1000;
      if (dt > 0 && dt < 5) {
        const dx = b.x - a.x, dy = b.y - a.y;
        isMovingRef.current = Math.sqrt(dx * dx + dy * dy) / dt > 0.02;
      }
    }
  }, [ip, trail, currentX, currentY, currentAngle, online, color, hasData, dwellSpots, rotDeg, activitySegments, zoneOverlays, routeOverlays, routeMode, followMode, transitionMarkers, forkHeight, jackState, jackIsFull, vehicleIcon, coordEditMode, zoneEditMode, selectedZoneId, coordOffsetX, coordOffsetY, coordScale, pickTwoPoint, pickMode, pickAnchor]);

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

    const HANDLE_HIT_R = 10; // 角手柄命中半径 (px)
    const DRAG_THRESHOLD = 4; // 拖拽判定的最小位移 (px)

    // 在 zoneHitRef 中查找屏幕坐标命中的 zone（按多边形优先，其次标签框）
    const findZoneAt = (sx: number, sy: number): number | null => {
      const hits = zoneHitRef.current;
      // 先匹配多边形体内（编辑模式拖拽移动用）
      for (const h of hits) {
        if (h.polyScr && h.polyScr.length >= 3 && pointInPolygonScr(sx, sy, h.polyScr)) {
          return h.id;
        }
      }
      // 回退到标签框命中
      for (const h of hits) {
        if (sx >= h.sx && sx <= h.sx + h.w && sy >= h.sy && sy <= h.sy + h.h) {
          return h.id;
        }
      }
      return null;
    };

    // 查找命中的角手柄（返回 vertex index）
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

      // ① 拖拽绘制矩形模式
      if (pm && ptp) {
        drawingRef.current = { active: true, startSx: sx, startSy: sy, curSx: sx, curSy: sy };
        dragStartRef.current = { x: e.clientX, y: e.clientY };
        dragRef.current = { on: true, lx: e.clientX, ly: e.clientY };
        c.setPointerCapture(e.pointerId);
        return;
      }

      // ② 编辑模式：角手柄拖拽（需 editMode 开启）
      const handleHit = findHandleAt(sx, sy);
      if (handleHit && !pm && zoneEditModeRef.current) {
        const hit = zoneHitRef.current.find(h => h.id === handleHit.zoneId);
        if (hit) {
          // 从当前 zoneOverlays 获取原始 polygonJson
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
      }

      // ③ 编辑模式：zone 体内点击 → 准备拖拽移动（需 editMode 开启）
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
      // 拖拽绘制中
      if (drawingRef.current?.active) {
        cancelReset();
        const rect = c.getBoundingClientRect();
        drawingRef.current.curSx = e.clientX - rect.left;
        drawingRef.current.curSy = e.clientY - rect.top;
        return;
      }
      // 角手柄拖拽中
      if (handleDragRef.current) {
        cancelReset();
        const rect = c.getBoundingClientRect();
        const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
        const t = transformRef.current;
        if (!t) return;
        const w = screenToWorld(sx, sy, t);
        const { zoneId, vertIdx } = handleDragRef.current;
        // 找到当前 zone 数据并更新顶点
        const zo = zoneOverlays?.find(z => z.id === zoneId);
        if (zo) {
          try {
            const poly: number[][] = JSON.parse(zo.polygonJson);
            if (vertIdx < poly.length) {
              poly[vertIdx] = [w.wx, w.wy];
              // 直接更新 zoneOverlays 引用（只读，但这里通过 onZoneReshape 触发保存）
              // 临时存储到 ref 供 mouseup 提交
              handleDragRef.current = { ...handleDragRef.current, zoneId, vertIdx, origPoly: poly };
            }
          } catch {}
        }
        return;
      }
      // zone 移动中
      if (moveDragRef.current) {
        cancelReset();
        const rect = c.getBoundingClientRect();
        const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
        if (Math.abs(sx - moveDragRef.current.startSx) > DRAG_THRESHOLD ||
            Math.abs(sy - moveDragRef.current.startSy) > DRAG_THRESHOLD) {
          moveDragRef.current.moved = true;
          const t = transformRef.current;
          if (!t) return;
          const wCur = screenToWorld(sx, sy, t);
          const wStart = screenToWorld(moveDragRef.current.startSx, moveDragRef.current.startSy, t);
          const wDx = wCur.wx - wStart.wx, wDy = wCur.wy - wStart.wy;
          moveDragRef.current.startSx = sx;
          moveDragRef.current.startSy = sy;
          // 平移所有顶点
          const movedPoly = moveDragRef.current.origPoly.map(([vx, vy]) => [vx + wDx, vy + wDy]);
          moveDragRef.current.origPoly = movedPoly;
        }
        return;
      }
      // 普通平移
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
            const w1 = screenToWorld(drawingRef.current.startSx, drawingRef.current.startSy, t);
            const w2 = screenToWorld(drawingRef.current.curSx, drawingRef.current.curSy, t);
            rd(w1.wx, w1.wy, w2.wx, w2.wy);
          }
        } else {
          // 点击（非拖拽）→ 回退到单击选点模式
          const pp = onPointPickRef.current;
          if (pp) {
            const rect = c.getBoundingClientRect();
            const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
            const t = transformRef.current;
            if (t && !t.followMode) {
              const w = screenToWorld(sx, sy, t);
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
        if (or) {
          or(zoneId, JSON.stringify(origPoly));
        }
        scheduleReset();
        return;
      }

      // ③ zone 移动完成
      if (moveDragRef.current) {
        const { zoneId, origPoly, moved } = moveDragRef.current;
        moveDragRef.current = null;
        if (moved) {
          const or = onZoneReshapeRef.current;
          if (or) {
            or(zoneId, JSON.stringify(origPoly));
          }
        } else {
          // 未移动=单击 → 选中该 zone
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
            const w = screenToWorld(sx, sy, t);
            pp(w.wx, w.wy);
            scheduleReset();
            return;
          }
        }
      }

      // 非选点模式 + 单击 → 检测 zone 点击
      if (!pm && wasDragging && Math.abs(ddx) < DRAG_THRESHOLD && Math.abs(ddy) < DRAG_THRESHOLD) {
        const rect = c.getBoundingClientRect();
        const sx = e.clientX - rect.left, sy = e.clientY - rect.top;

        // 先检测标签框点击
        for (const h of zoneHitRef.current) {
          if (sx >= h.sx && sx <= h.sx + h.w && sy >= h.sy && sy <= h.sy + h.h) {
            // 点击标签框 = 打开编辑弹窗
            if (onZoneClick) {
              onZoneClick(h.id, h.name, h.stationPattern);
            }
            // 同时也选中（显示角手柄）
            const zs = onZoneSelectRef.current;
            if (zs) zs(h.id);
            return;
          }
        }
        // 再检测多边形体内点击 → 选中
        const bodyId = findZoneAt(sx, sy);
        if (bodyId != null) {
          const zs = onZoneSelectRef.current;
          if (zs) zs(bodyId);
          return;
        }
        // 点击空白处 → 取消选中
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

  return <div ref={containerRef} className={`relative w-full h-full min-h-0 ${pickMode ? "cursor-crosshair" : selectedZoneId != null ? "cursor-default" : "cursor-grab"}`} style={{ touchAction: "none" }}><canvas ref={canvasRef} className="absolute inset-0" /></div>;
}
