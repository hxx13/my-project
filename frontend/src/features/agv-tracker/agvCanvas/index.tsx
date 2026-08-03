import { useRef, useEffect, useCallback, useMemo } from "react";
import type { AgvTrajectoryRow, HistoryPlaybackResponse } from "@/api/domains/agv.api";
import { ACTIVITY_COLORS } from "@/api/domains/agv-analysis.api";
import type { TrailPoint } from "../useAgvTrailRef";
import type { AgvLayer, ZoneOverlay, RouteOverlay, AgvCanvasProps as Props } from "./types";
import * as M from "./math";
import { drawTrail } from "./trail";
import { drawForklift } from "./forklift";

// ═══ Component ═══

export default function AgvCanvas({
  layers,
  zoneOverlays,
  routeOverlays,
  routeMode,
  followMode,
  followTargetIp,
  vehicleIcon,
  hiddenAgvs,
  pickMode,
  pickTwoPoint,
  pickAnchor,
  onPointPick,
  onRectDrawn,
  onZoneClick,
  coordEditMode,
  zoneEditMode,
  selectedZoneId,
  onZoneSelect,
  onZoneReshape,
  onCoordFrameMove,
  onCoordFrameScale,
  onCoordFrameRotate,
  playbackActive,
  playbackProgressRef,
  playbackData,
  playbackTrail,
  playbackProgress,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  const boundsRef = useRef<{
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
  } | null>(null);
  const prevLenRef = useRef<Record<string, number>>({});
  const prevZonesLenRef = useRef(0);
  const prevCoordRef = useRef<Record<string, string>>({});
  const prevRouteFpRef = useRef("");
  const panRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const dragRef = useRef({ on: false, lx: 0, ly: 0 });
  const dragStartRef = useRef({ x: 0, y: 0 });
  const prevForkRef = useRef<Record<string, number>>({});
  const zoneHitRef = useRef<
    {
      id: number;
      name: string;
      stationPattern?: string;
      sx: number;
      sy: number;
      w: number;
      h: number;
      polyScr: { x: number; y: number }[];
    }[]
  >([]);

  // Edit-mode drag refs
  const drawingRef = useRef<{
    active: boolean;
    startSx: number;
    startSy: number;
    curSx: number;
    curSy: number;
  } | null>(null);
  const handleDragRef = useRef<{
    zoneId: number;
    vertIdx: number;
    origPoly: number[][];
  } | null>(null);
  const moveDragRef = useRef<{
    zoneId: number;
    origPoly: number[][];
    startSx: number;
    startSy: number;
    moved: boolean;
  } | null>(null);

  // Reference frame drag/scale refs
  const refFrameHitRef = useRef<
    { ip: string; left: number; top: number; right: number; bottom: number }[]
  >([]);
  const refFrameDragRef = useRef<{
    ip: string;
    startSx: number;
    startSy: number;
    origOffsetX: number;
    origOffsetY: number;
    combinedRad: number;
    startViewScale: number;
  } | null>(null);
  const refFrameScaleRef = useRef<{
    ip: string;
    startSx: number;
    startSy: number;
    origScale: number;
    anchorSx: number;
    anchorSy: number;
    anchorLocalX: number;
    anchorLocalY: number;
    oldOffsetX: number;
    oldOffsetY: number;
    origDist: number;
  } | null>(null);
  const refFrameHandleHitRef = useRef<
    { ip: string; sx: number; sy: number; w: number; h: number }[]
  >([]);
  const refFrameRotateHitRef = useRef<
    { ip: string; cx: number; cy: number; r: number; centerX: number; centerY: number }[]
  >([]);
  const refFrameLocalBoundsRef = useRef<
    Record<
      string,
      { bxMin: number; byMin: number; bxMax: number; byMax: number }
    >
  >({});

  // Playback refs
  const pbSortedRef = useRef<
    | {
        x: number;
        y: number;
        angle: number;
        ts: number;
        forkHeight: number | null;
        jackState: number | null;
        jackIsFull: boolean;
      }[]
    | null
  >(null);
  const pbProgressRef = playbackProgressRef ?? useRef(playbackProgress ?? 1);
  const pbDataRef = useRef(playbackData ?? null);
  if (!playbackProgressRef) pbProgressRef.current = playbackProgress ?? 1;
  pbDataRef.current = playbackData ?? null;

  // Sync refs for event handlers
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
  const onCoordFrameRotateRef = useRef(onCoordFrameRotate);
  onCoordFrameRotateRef.current = onCoordFrameRotate;
  const isMovingRef = useRef(false);
  const transformRef = useRef<{
    scale: number;
    xMid: number;
    yMid: number;
    panX: number;
    panY: number;
    rad: number;
    w: number;
    h: number;
    followMode: boolean;
  } | null>(null);

  // ── JSON caches (pre-parse ONCE, not every frame) ──

  const parsedZones = useMemo(() => {
    if (!zoneOverlays) return [];
    return zoneOverlays.map((z) => {
      let poly: number[][] = [];
      try {
        poly = JSON.parse(z.polygonJson);
      } catch {}
      let cx = 0, cy = 0;
      if (poly.length > 0) {
        for (const p of poly) { cx += p[0]; cy += p[1]; }
        cx /= poly.length;
        cy /= poly.length;
      }
      return { ...z, _poly: poly, _cx: cx, _cy: cy };
    });
  }, [zoneOverlays]);

  const parsedRoutes = useMemo(() => {
    if (!routeOverlays || !routeMode) return [];
    return routeOverlays.map((r) => {
      let path: [number, number][] = [];
      try {
        path = JSON.parse(r.pathJson);
      } catch {}
      return { ...r, _path: path };
    });
  }, [routeOverlays, routeMode]);

  // Playback: sort once, sync to ref
  const playbackSorted = useMemo(() => {
    if (!playbackActive || !playbackTrail || !playbackTrail.length) return null;
    const pts = playbackTrail
      .filter((r) => r.x != null && r.y != null)
      .sort(
        (a, b) =>
          new Date(a.recorded_at).getTime() -
          new Date(b.recorded_at).getTime(),
      )
      .map((r) => ({
        x: r.x!,
        y: r.y!,
        angle: r.angle ?? 0,
        ts: new Date(r.recorded_at).getTime(),
        forkHeight: r.fork_height ?? null,
        jackState: r.jack_state ?? null,
        jackIsFull: r.jack_isFull === 1,
      }));
    pbSortedRef.current = pts;
    return pts;
  }, [playbackActive, playbackTrail]);

  // ── Bounds from all visible layers + zones + routes ──

  const zonesLen =
    (zoneOverlays ?? []).length + (routeOverlays ?? []).length;

  let trailChanged = false;
  for (const layer of layers) {
    const prev = prevLenRef.current[layer.ip] ?? 0;
    if (layer.trail.length !== prev) {
      trailChanged = true;
      prevLenRef.current[layer.ip] = layer.trail.length;
    }
    const coordFp = `${layer.coordScale ?? 1}_${layer.coordOffsetX ?? 0}_${layer.coordOffsetY ?? 0}_${layer.coordRotationDeg ?? 0}`;
    if (coordFp !== (prevCoordRef.current[layer.ip] ?? "")) {
      trailChanged = true;
      prevCoordRef.current[layer.ip] = coordFp;
    }
  }
  if (zonesLen !== prevZonesLenRef.current) {
    trailChanged = true;
    prevZonesLenRef.current = zonesLen;
  }
  const routeFp = routeOverlays ? routeOverlays.map((r) => r.id).join(",") : "";
  if (routeFp !== prevRouteFpRef.current) {
    trailChanged = true;
    prevRouteFpRef.current = routeFp;
  }

  if (trailChanged || !boundsRef.current) {
    let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
    for (const layer of layers) {
      if (!layer.visible || hiddenAgvs?.has(layer.ip)) continue;
      const cs = layer.coordScale ?? 1;
      const ox = layer.coordOffsetX ?? 0;
      const oy = layer.coordOffsetY ?? 0;
      const toWorld = (vx: number, vy: number) => ({ wx: (vx + ox) * cs, wy: (vy + oy) * cs });

      if (layer.currentX != null && layer.currentY != null) {
        const w = toWorld(layer.currentX, layer.currentY);
        if (w.wx < xMin) xMin = w.wx; if (w.wx > xMax) xMax = w.wx;
        if (w.wy < yMin) yMin = w.wy; if (w.wy > yMax) yMax = w.wy;
      }
      for (const p of layer.trail) {
        const w = toWorld(p.x, p.y);
        if (w.wx < xMin) xMin = w.wx; if (w.wx > xMax) xMax = w.wx;
        if (w.wy < yMin) yMin = w.wy; if (w.wy > yMax) yMax = w.wy;
      }
      if (layer.dwellSpots)
        for (const d of layer.dwellSpots) {
          const w = toWorld(d.x, d.y);
          if (w.wx < xMin) xMin = w.wx; if (w.wx > xMax) xMax = w.wx;
          if (w.wy < yMin) yMin = w.wy; if (w.wy > yMax) yMax = w.wy;
        }
    }
    if (parsedZones)
      for (const z of parsedZones) {
        const poly = z._poly;
        if (!poly) continue;
        const zLayer = z.robotIp ? layers.find((l) => l.ip === z.robotIp) : null;
        const zcs = zLayer?.coordScale ?? 1;
        const zox = zLayer?.coordOffsetX ?? 0;
        const zoy = zLayer?.coordOffsetY ?? 0;
        for (const p of poly) {
          const wx = (p[0] + zox) * zcs;
          const wy = (p[1] + zoy) * zcs;
          if (wx < xMin) xMin = wx; if (wx > xMax) xMax = wx;
          if (wy < yMin) yMin = wy; if (wy > yMax) yMax = wy;
        }
      }
    if (parsedRoutes)
      for (const ro of parsedRoutes) {
        const path = ro._path;
        if (!path) continue;
        const rLayer = ro.robotIp ? layers.find((l) => l.ip === ro.robotIp) : null;
        const rcs = rLayer?.coordScale ?? 1;
        const rox = rLayer?.coordOffsetX ?? 0;
        const roy = rLayer?.coordOffsetY ?? 0;
        for (const p of path) {
          const wx = (p[0] + rox) * rcs;
          const wy = (p[1] + roy) * rcs;
          if (wx < xMin) xMin = wx; if (wx > xMax) xMax = wx;
          if (wy < yMin) yMin = wy; if (wy > yMax) yMax = wy;
        }
      }
    if (isFinite(xMin)) {
      const mx = Math.max((xMax - xMin) * 0.02, 0.5);
      const my = Math.max((yMax - yMin) * 0.02, 0.5);
      boundsRef.current = {
        xMin: xMin - mx,
        xMax: xMax + mx,
        yMin: yMin - my,
        yMax: yMax + my,
      };
    }
  }

  // ── Per-layer transform factory ──

  const makeAgvTr = useCallback(
    (
      layer: AgvLayer,
      totalRad: number,
      xMid: number,
      yMid: number,
      scale: number,
      w: number,
      h: number,
      panX: number,
      panY: number,
    ) => {
      const ox = layer.coordOffsetX ?? 0;
      const oy = layer.coordOffsetY ?? 0;
      const agvRad = ((layer.coordRotationDeg ?? 0) * Math.PI) / 180;
      const combinedRad = totalRad + agvRad;
      const agvScale = layer.coordScale ?? 1.0;
      return {
        toPx: (vx: number, vy: number) => {
          const r = M.rotPt((vx + ox) * agvScale, (vy + oy) * agvScale, combinedRad);
          return (r.x - xMid) * scale + w / 2 + panX;
        },
        toPy: (vx: number, vy: number) => {
          const r = M.rotPt((vx + ox) * agvScale, (vy + oy) * agvScale, combinedRad);
          return -(r.y - yMid) * scale + h / 2 + panY;
        },
      };
    },
    [],
  );

  // ── Main draw loop (ALL drawing directly to ctx — no offscreen canvases) ──

  const draw = useCallback(() => {
    const canvas = canvasRef.current, container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = container.clientWidth, h = container.clientHeight,
      dpr = window.devicePixelRatio || 1;
    if (w <= 0 || h <= 0) return;
    if (
      canvas.width !== Math.floor(w * dpr) ||
      canvas.height !== Math.floor(h * dpr)
    ) {
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    const scope = container;
    const bgColor = M.readCssVar(scope, "--app-color-surface-container", "#fff");
    const gridC = M.readCssVar(scope, "--app-color-border-default", "#e5e7eb");
    const textC = M.readCssVar(scope, "--app-color-text-secondary", "#6b7280");

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);

    const rb = boundsRef.current;
    if (!rb) {
      ctx.fillStyle = textC;
      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("等待数据...", w / 2, h / 2);
      return;
    }

    // Global rotation fixed at 0 — per-layer rotation handled by makeAgvTr
    const rad = 0;
    const b = rad !== 0 ? M.rotatedBounds(rb, rad) : rb;
    const pad = 0.10;
    const zoom = zoomRef.current;
    let panX = panRef.current.x, panY = panRef.current.y;

    // ── Follow mode ──
    let followRad = 0;
    const fullFollowMode = !!(followMode && followTargetIp);
    if (fullFollowMode) {
      const target = layers.find((l) => l.ip === followTargetIp);
      if (target && target.currentX != null && target.currentY != null) {
        const baseScale = Math.min(
          (w * (1 - 2 * pad)) / ((b.xMax - b.xMin) || 1),
          (h * (1 - 2 * pad)) / ((b.yMax - b.yMin) || 1),
        );
        const s = baseScale * zoom;
        const rt = M.rotPt(target.currentX, target.currentY, rad);
        panX = -(rt.x - (b.xMin + b.xMax) / 2) * s;
        panY = (rt.y - (b.yMin + b.yMax) / 2) * s;
        const heading = target.currentAngle ?? 0;
        followRad = -(heading + Math.PI / 2);
      }
    }
    const totalRad = rad + followRad;

    const xRange = (b.xMax - b.xMin) || 1, yRange = (b.yMax - b.yMin) || 1;
    const scale =
      Math.min(
        (w * (1 - 2 * pad)) / xRange,
        (h * (1 - 2 * pad)) / yRange,
      ) * zoom;
    const xMid = (b.xMin + b.xMax) / 2, yMid = (b.yMin + b.yMax) / 2;

    // ── Per-layer transforms ──
    const layerTransforms = new Map<
      string,
      { toPx: (x: number, y: number) => number; toPy: (x: number, y: number) => number }
    >();
    for (const layer of layers) {
      layerTransforms.set(
        layer.ip,
        makeAgvTr(layer, totalRad, xMid, yMid, scale, w, h, panX, panY),
      );
    }

    const getTr = (ip?: string) => {
      if (!ip) return null;
      return layerTransforms.get(ip) ?? null;
    };

    // World transform (no offset/scale, for grid/global elements)
    const toPx = (vx: number, vy: number) => {
      const r = M.rotPt(vx, vy, totalRad);
      return (r.x - xMid) * scale + w / 2 + panX;
    };
    const toPy = (vx: number, vy: number) => {
      const r = M.rotPt(vx, vy, totalRad);
      return -(r.y - yMid) * scale + h / 2 + panY;
    };

    transformRef.current = {
      scale,
      xMid,
      yMid,
      panX,
      panY,
      rad: totalRad,
      w,
      h,
      followMode: fullFollowMode,
    };

    // ═══════════════════════════════════════════════
    // GRID
    // ═══════════════════════════════════════════════
    const rawXRange = (rb.xMax - rb.xMin) || 1,
      rawYRange = (rb.yMax - rb.yMin) || 1;
    const rawScale =
      Math.min(
        (w * (1 - 2 * pad)) / rawXRange,
        (h * (1 - 2 * pad)) / rawYRange,
      ) * zoom;
    const rawXMid = (rb.xMin + rb.xMax) / 2,
      rawYMid = (rb.yMin + rb.yMax) / 2;
    const step = M.niceStep(Math.max(rawXRange, rawYRange), M.GRID_LINES);

    ctx.strokeStyle = gridC;
    ctx.lineWidth = 0.5;
    for (
      let gx = Math.floor(rb.xMin / step) * step;
      gx <= rb.xMax;
      gx += step
    ) {
      const px = (gx - rawXMid) * rawScale + w / 2 + panX;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, h);
      ctx.stroke();
    }
    for (
      let gy = Math.floor(rb.yMin / step) * step;
      gy <= rb.yMax;
      gy += step
    ) {
      const py = -(gy - rawYMid) * rawScale + h / 2 + panY;
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(w, py);
      ctx.stroke();
    }

    // ═══════════════════════════════════════════════
    // ZONE OVERLAYS
    // ═══════════════════════════════════════════════
    const hits: {
      id: number;
      name: string;
      stationPattern?: string;
      sx: number;
      sy: number;
      w: number;
      h: number;
      polyScr: { x: number; y: number }[];
    }[] = [];
    if (parsedZones && parsedZones.length > 0) {
      for (const zone of parsedZones) {
        if (zone.robotIp && hiddenAgvs?.has(zone.robotIp)) continue;
        const poly = zone._poly;
        if (!poly || poly.length < 3) continue;
        const cx = zone._cx;
        const cy = zone._cy;

        const isSelected = selectedZoneId === zone.id;
        const zTr = getTr(zone.robotIp);
        const polyScr = poly.map((p) => ({
          x: zTr ? zTr.toPx(p[0], p[1]) : toPx(p[0], p[1]),
          y: zTr ? zTr.toPy(p[0], p[1]) : toPy(p[0], p[1]),
        }));

        // MANUAL_RECT: draw polygon fill + stroke
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
          ctx.lineWidth = isSelected
            ? Math.max(2, 2.5 / zoom)
            : Math.max(1, 1.2 / zoom);
          if (isSelected) {
            ctx.setLineDash([5, 3]);
          }
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Centroid label box
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
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = zone.color + "ee";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = "bold 8px sans-serif";
        ctx.fillText(nameLine, csx, csy - 3);
        ctx.font = "7px sans-serif";
        ctx.fillStyle = zone.color + "99";
        ctx.fillText(coordLine, csx, csy + 6);
        ctx.textBaseline = "alphabetic";
        hits.push({
          id: zone.id,
          name: zone.name,
          stationPattern: zone.stationPattern,
          sx: csx - boxW / 2,
          sy: csy - boxH / 2,
          w: boxW,
          h: boxH,
          polyScr,
        });
      }
      zoneHitRef.current = hits;
    }

    // ═══════════════════════════════════════════════
    // SELECTED ZONE CORNER HANDLES
    // ═══════════════════════════════════════════════
    if (selectedZoneId != null && !pickMode && zoneEditMode) {
      const selHit = hits.find((h) => h.id === selectedZoneId);
      if (selHit && selHit.polyScr.length >= 3) {
        for (let i = 0; i < selHit.polyScr.length; i++) {
          const v = selHit.polyScr[i];
          const hs = 7;
          ctx.fillStyle = "#fff";
          ctx.strokeStyle = "#f59e0b";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.roundRect(v.x - hs, v.y - hs, hs * 2, hs * 2, 2);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = "#f59e0b";
          ctx.font = "bold 8px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(i + 1), v.x, v.y);
        }
      }
    }

    // ═══════════════════════════════════════════════
    // RECTANGLE DRAWING PREVIEW
    // ═══════════════════════════════════════════════
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
        const wWStart = M.screenToWorld(startSx, startSy, t);
        const wWEnd = M.screenToWorld(curSx, curSy, t);
        const ww = Math.abs(wWEnd.wx - wWStart.wx),
          wh = Math.abs(wWEnd.wy - wWStart.wy);
        ctx.fillStyle = "#f59e0b";
        ctx.font = "bold 9px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(
          `${ww.toFixed(2)} × ${wh.toFixed(2)} m`,
          (startSx + curSx) / 2,
          ry - 8,
        );
      }
    }

    // ═══════════════════════════════════════════════
    // PICK ANCHOR MARKER
    // ═══════════════════════════════════════════════
    if (pickMode && pickAnchor) {
      const ax = toPx(pickAnchor.x, pickAnchor.y),
        ay = toPy(pickAnchor.x, pickAnchor.y);
      const pulse = 0.7 + 0.3 * Math.sin(Date.now() / 300);
      ctx.fillStyle = "#f59e0b";
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.globalAlpha = pulse;
      ctx.beginPath();
      ctx.arc(ax, ay, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(ax - 10, ay);
      ctx.lineTo(ax + 10, ay);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ax, ay - 10);
      ctx.lineTo(ax, ay + 10);
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 9px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        `(${pickAnchor.x.toFixed(2)},${pickAnchor.y.toFixed(2)})`,
        ax,
        ay - 16,
      );
    }

    // ═══════════════════════════════════════════════
    // ROUTE OVERLAYS (per-route transform)
    // ═══════════════════════════════════════════════
    if (routeMode && parsedRoutes && parsedRoutes.length > 0) {
      const seen = new Set<string>();
      const uniqueRoutes = parsedRoutes.filter((r) => {
        const key = r.name || r.pathJson;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      for (const route of uniqueRoutes) {
        const path = route._path;
        if (!path || path.length < 2) continue;
        const rTr = getTr(route.robotIp);
        const rToPx = rTr ? rTr.toPx : toPx;
        const rToPy = rTr ? rTr.toPy : toPy;

        ctx.strokeStyle = route.color + "aa";
        ctx.lineWidth = Math.max(2, 4 / zoom);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(rToPx(path[0][0], path[0][1]), rToPy(path[0][0], path[0][1]));
        for (let i = 1; i < path.length; i++) {
          ctx.lineTo(rToPx(path[i][0], path[i][1]), rToPy(path[i][0], path[i][1]));
        }
        ctx.stroke();

        // Direction arrows
        const ARROW_STEP = Math.max(8, Math.floor(path.length / 6));
        for (let i = ARROW_STEP; i < path.length - 1; i += ARROW_STEP) {
          const ax = rToPx(path[i][0], path[i][1]),
            ay = rToPy(path[i][0], path[i][1]);
          const bx = rToPx(path[i + 1][0], path[i + 1][1]),
            by = rToPy(path[i + 1][0], path[i + 1][1]);
          const adx = bx - ax, ady = by - ay;
          const alen = Math.sqrt(adx * adx + ady * ady) || 1;
          const ux = adx / alen, uy = ady / alen;
          ctx.fillStyle = route.color + "cc";
          ctx.beginPath();
          ctx.moveTo(ax + ux * 5, ay + uy * 5);
          ctx.lineTo(ax - ux * 3 + uy * 3, ay - uy * 3 - ux * 3);
          ctx.lineTo(ax - ux * 3 - uy * 3, ay - uy * 3 + ux * 3);
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    // ═══════════════════════════════════════════════
    // PER-LAYER: DWELL HEATMAP + TRAIL + POSITION + COORD FRAME
    // ═══════════════════════════════════════════════
    refFrameHitRef.current = [];
    refFrameHandleHitRef.current = [];
    refFrameRotateHitRef.current = [];

    const visibleLayers = layers.filter(
      (l) => l.visible && !hiddenAgvs?.has(l.ip),
    );

    for (const layer of visibleLayers) {
      const tr = layerTransforms.get(layer.ip);
      if (!tr) continue;

      // Display trail (playback or live)
      let displayTrail: TrailPoint[];
      if (playbackActive) {
        const s = pbSortedRef.current;
        const p = pbProgressRef.current;
        if (s && s.length >= 2) {
          const totalMs = s[s.length - 1].ts - s[0].ts;
          const cutoffTs = s[0].ts + totalMs * p;
          let lo = 0, hi = s.length;
          while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (s[mid].ts <= cutoffTs) lo = mid + 1;
            else hi = mid;
          }
          displayTrail = s.slice(0, lo) as TrailPoint[];
        } else {
          displayTrail = (s ?? []) as TrailPoint[];
        }
      } else {
        displayTrail = routeMode
          ? layer.trail.filter((p) => Date.now() - p.ts < 30_000)
          : layer.trail;
      }

      // Dwell heatmap
      if (layer.dwellSpots && layer.dwellSpots.length) {
        const maxD = Math.max(...layer.dwellSpots.map((d) => d.durationSec), 1);
        for (const s of layer.dwellSpots) {
          const tVal = Math.min(s.durationSec, maxD) / maxD;
          ctx.fillStyle =
            layer.color +
            Math.floor((0.1 + 0.5 * tVal) * 255)
              .toString(16)
              .padStart(2, "0");
          ctx.beginPath();
          ctx.arc(
            tr.toPx(s.x, s.y),
            tr.toPy(s.x, s.y),
            3 + 8 * tVal,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        }
      }

      // Trail
      drawTrail(ctx, displayTrail, layer.color, tr.toPx, tr.toPy);

      // Current position
      let pos: { x: number | null; y: number | null; angle: number | null };
      if (playbackActive) {
        const s = pbSortedRef.current;
        const data = pbDataRef.current;
        const p = pbProgressRef.current;
        if (s && data && s.length > 0) {
          const totalMs =
            new Date(data.to).getTime() - new Date(data.from).getTime();
          const nowTs = new Date(data.from).getTime() + totalMs * p;
          if (s.length === 1) {
            pos = { x: s[0].x, y: s[0].y, angle: s[0].angle };
          } else {
            let lo = 0, hi = s.length;
            while (lo < hi) {
              const mid = (lo + hi) >> 1;
              if (s[mid].ts <= nowTs) lo = mid + 1;
              else hi = mid;
            }
            const after = Math.min(Math.max(lo, 1), s.length - 1);
            const a = s[after - 1], b = s[after];
            const ti = Math.min(
              1,
              Math.max(0, (nowTs - a.ts) / (b.ts - a.ts || 1)),
            );
            pos = {
              x: a.x + (b.x - a.x) * ti,
              y: a.y + (b.y - a.y) * ti,
              angle: M.lerpAngle(a.angle, b.angle, ti),
            };
          }
        } else {
          pos = { x: null, y: null, angle: null };
        }
      } else {
        pos = M.interpolatePosition(
          layer.trail,
          layer.currentX,
          layer.currentY,
          layer.currentAngle,
        );
      }
      const lastTrailPt =
        displayTrail.length > 0
          ? displayTrail[displayTrail.length - 1]
          : null;
      if ((pos.x == null || pos.y == null) && lastTrailPt) {
        pos = {
          x: lastTrailPt.x,
          y: lastTrailPt.y,
          angle: lastTrailPt.angle ?? 0,
        };
      }
      if (pos.x != null && pos.y != null) {
        const px = tr.toPx(pos.x, pos.y), py = tr.toPy(pos.x, pos.y);
        const layerRotDeg = layer.coordRotationDeg ?? 0;
        const layerRotRad = (layerRotDeg * Math.PI) / 180;
        if (pos.angle != null) {
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(-((pos.angle ?? 0) + totalRad + layerRotRad));
          if (vehicleIcon === "forklift") {
            drawForklift(
              ctx,
              layer.color,
              layer.online,
              layer.currentActivity,
              layer.charging,
              layer.speed,
              playbackActive,
              playbackData,
              pbProgressRef.current,
              layer.trail,
              layer.forkHeight,
            );
          } else {
            ctx.shadowColor = "rgba(0,0,0,0.25)";
            ctx.shadowBlur = 3;
            ctx.shadowOffsetY = 1;
            ctx.fillStyle = layer.online ? layer.color : "#9ca3af";
            ctx.beginPath();
            ctx.moveTo(28, 0);
            ctx.lineTo(-8, -16);
            ctx.lineTo(4, 0);
            ctx.lineTo(-8, 16);
            ctx.closePath();
            ctx.fill();
            ctx.shadowColor = "transparent";
            ctx.strokeStyle = "#fff";
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
          ctx.restore();
        } else {
          ctx.fillStyle = layer.online ? layer.color : "#9ca3af";
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(px, py, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }

        // Fork height bar
        let effForkH = layer.forkHeight,
          effJackSt = layer.jackState,
          effJackFull = layer.jackIsFull;
        if (playbackActive) {
          const s = pbSortedRef.current;
          const data = pbDataRef.current;
          const p = pbProgressRef.current;
          if (s && data && s.length > 0) {
            const totalMs =
              new Date(data.to).getTime() - new Date(data.from).getTime();
            const nowTs = new Date(data.from).getTime() + totalMs * p;
            let lo = 0, hi = s.length;
            while (lo < hi) {
              const mid = (lo + hi) >> 1;
              if (s[mid].ts <= nowTs) lo = mid + 1;
              else hi = mid;
            }
            const idx = Math.min(Math.max(lo - 1, 0), s.length - 1);
            effForkH = s[idx].forkHeight;
            effJackSt = s[idx].jackState;
            effJackFull = s[idx].jackIsFull;
          }
        }
        if (effForkH != null) {
          const fh = effForkH;
          const prevFh = prevForkRef.current[layer.ip] ?? 0;
          const changed = playbackActive || Math.abs(fh - prevFh) > 0.0005;
          prevForkRef.current[layer.ip] = fh;
          if (changed) {
            const barH = 18, barW = 3;
            const barX = px + 20, barY = py - barH / 2;
            const forkPct = Math.min(1, fh / 0.1);
            ctx.fillStyle = "rgba(128,128,128,0.4)";
            ctx.fillRect(barX - barW / 2, barY, barW, barH);
            const fillH = barH * forkPct;
            ctx.fillStyle = "#f59e0b";
            ctx.fillRect(barX - barW / 2, barY + barH - fillH, barW, fillH);
          }
        }
        // Cargo icon
        if (effJackSt === 1 || (effForkH != null && effForkH > 0.005)) {
          const cargoX = px, cargoY = py - 18;
          const full = effJackFull ?? false;
          ctx.fillStyle = full ? "#22c55e" : "#f59e0b";
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.roundRect(cargoX - 6, cargoY - 6, 12, 12, 2);
          ctx.fill();
          ctx.stroke();
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(cargoX - 4, cargoY - 6);
          ctx.lineTo(cargoX - 4, cargoY + 6);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(cargoX - 6, cargoY - 4);
          ctx.lineTo(cargoX + 6, cargoY - 4);
          ctx.stroke();
        }
      }

      // ── Coord edit mode: reference frame bounding box ──
      if (coordEditMode) {
        let bxMin = Infinity, bxMax = -Infinity, byMin = Infinity, byMax = -Infinity;
        for (const p of displayTrail) {
          if (p.x < bxMin) bxMin = p.x;
          if (p.x > bxMax) bxMax = p.x;
          if (p.y < byMin) byMin = p.y;
          if (p.y > byMax) byMax = p.y;
        }
        if (parsedZones)
          for (const z of parsedZones) {
            if (z.robotIp !== layer.ip) continue;
            const poly = z._poly;
            if (poly) {
              for (const p of poly) {
                if (p[0] < bxMin) bxMin = p[0];
                if (p[0] > bxMax) bxMax = p[0];
                if (p[1] < byMin) byMin = p[1];
                if (p[1] > byMax) byMax = p[1];
              }
            }
          }
        if (!isFinite(bxMin)) {
          const cxFallback = layer.currentX ?? 0, cyFallback = layer.currentY ?? 0;
          bxMin = cxFallback - 2; bxMax = cxFallback + 2; byMin = cyFallback - 2; byMax = cyFallback + 2;
        }
        const padBox = Math.max((bxMax - bxMin) * 0.08, 0.5);
        bxMin -= padBox; bxMax += padBox; byMin -= padBox; byMax += padBox;
        const corners = [
          tr.toPx(bxMin, byMin), tr.toPy(bxMin, byMin),
          tr.toPx(bxMax, byMin), tr.toPy(bxMax, byMin),
          tr.toPx(bxMax, byMax), tr.toPy(bxMax, byMax),
          tr.toPx(bxMin, byMax), tr.toPy(bxMin, byMax),
        ];
        // Dashed bounding box
        ctx.strokeStyle = layer.color + "88";
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

        // Layer label at top center
        const cxBox = (corners[0] + corners[4]) / 2;
        const label = layer.label || layer.ip;
        ctx.fillStyle = layer.color;
        ctx.font = "bold 9px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(label, cxBox, corners[1] - 8);

        // Scale handle (top-left orange square)
        const hx = corners[6], hy = corners[7];
        const hs = 8;
        ctx.fillStyle = "#f59e0b";
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(hx - hs, hy - hs, hs * 2, hs * 2, 3);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(hx - 4, hy);
        ctx.lineTo(hx + 4, hy);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(hx, hy - 4);
        ctx.lineTo(hx, hy + 4);
        ctx.stroke();

        // Rotate handle — circular icon right of label
        const rotateR = 8;
        const rotateCx = cxBox + ctx.measureText(label).width / 2 + rotateR + 6;
        const rotateCy = corners[1] - 8;
        ctx.beginPath();
        ctx.arc(rotateCx, rotateCy, rotateR, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.fill();
        ctx.strokeStyle = layer.color + "aa";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // Rotate arrow glyph
        ctx.fillStyle = layer.color;
        ctx.font = "bold 10px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("↻", rotateCx, rotateCy);
        ctx.textBaseline = "alphabetic";
        refFrameRotateHitRef.current.push({
          ip: layer.ip,
          cx: rotateCx, cy: rotateCy, r: rotateR + 3,
          centerX: (bxMin + bxMax) / 2,
          centerY: (byMin + byMax) / 2,
        });

        // Record hit areas for event handling
        const boxLeft = Math.min(corners[0], corners[2], corners[4], corners[6]);
        const boxRight = Math.max(corners[0], corners[2], corners[4], corners[6]);
        const boxTop = Math.min(corners[1], corners[3], corners[5], corners[7]);
        const boxBottom = Math.max(corners[1], corners[3], corners[5], corners[7]);
        refFrameHitRef.current.push({
          ip: layer.ip,
          left: boxLeft,
          top: boxTop,
          right: boxRight,
          bottom: boxBottom,
        });
        refFrameHandleHitRef.current.push({
          ip: layer.ip,
          sx: hx - hs - 2,
          sy: hy - hs - 2,
          w: (hs + 2) * 2,
          h: (hs + 2) * 2,
        });
        refFrameLocalBoundsRef.current[layer.ip] = {
          bxMin,
          byMin,
          bxMax,
          byMax,
        };
      }
    }

    // ═══════════════════════════════════════════════
    // OFFLINE OVERLAY
    // ═══════════════════════════════════════════════
    const anyOffline = !playbackActive && layers.some((l) => !l.online && l.visible);
    if (anyOffline) {
      ctx.fillStyle = "rgba(239,68,68,0.04)";
      ctx.fillRect(0, 0, w, h);
    }

    // ═══════════════════════════════════════════════
    // AXIS LABELS
    // ═══════════════════════════════════════════════
    const d = M.decimals(step);
    ctx.fillStyle = textC;
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(
      `X: ${rb.xMin.toFixed(d)} — ${rb.xMax.toFixed(d)}`,
      w / 2,
      h - 6,
    );
    ctx.save();
    ctx.translate(10, h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(
      `Y: ${rb.yMin.toFixed(d)} — ${rb.yMax.toFixed(d)}`,
      0,
      0,
    );
    ctx.restore();

    // ═══════════════════════════════════════════════
    // MOVEMENT DETECTION
    // ═══════════════════════════════════════════════
    let moving = false;
    for (const layer of layers) {
      if (layer.trail.length >= 2) {
        const a = layer.trail[layer.trail.length - 2],
          b = layer.trail[layer.trail.length - 1];
        const dt = (b.ts - a.ts) / 1000;
        if (dt > 0 && dt < 5) {
          const dx = b.x - a.x, dy = b.y - a.y;
          if (Math.sqrt(dx * dx + dy * dy) / dt > 0.02) {
            moving = true;
            break;
          }
        }
      }
    }
    isMovingRef.current = moving;
  }, [
    layers,
    parsedZones,
    parsedRoutes,
    routeMode,
    followMode,
    followTargetIp,
    vehicleIcon,
    hiddenAgvs,
    coordEditMode,
    zoneEditMode,
    selectedZoneId,
    pickTwoPoint,
    pickMode,
    pickAnchor,
    playbackActive,
    playbackData,
    makeAgvTr,
  ]);

  const drawRef = useRef(draw);
  drawRef.current = draw;

  // ── Animation loop + resize observer ──
  useEffect(() => {
    let running = true;
    const c = containerRef.current;
    if (!c) return;
    const ro = new ResizeObserver(() => drawRef.current());
    ro.observe(c);
    const startLoop = () => {
      if (!running) return;
      drawRef.current();
      animRef.current = requestAnimationFrame(startLoop);
    };
    animRef.current = requestAnimationFrame(startLoop);
    return () => {
      running = false;
      cancelAnimationFrame(animRef.current);
      ro.disconnect();
    };
  }, []);

  // ── Pan/Zoom auto-reset after 30s idle (only when AGV moving) ──
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelReset = () => {
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
  };
  const scheduleReset = () => {
    cancelReset();
    resetTimerRef.current = setTimeout(() => {
      if (isMovingRef.current) {
        panRef.current = { x: 0, y: 0 };
        zoomRef.current = 1;
      }
    }, 30000);
  };

  // ── Event handling (pan, zoom, pick, edit) ──
  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;

    const HANDLE_HIT_R = 10;
    const DRAG_THRESHOLD = 4;

    const findZoneAt = (sx: number, sy: number): number | null => {
      const hits = zoneHitRef.current;
      for (const h of hits) {
        if (
          h.polyScr &&
          h.polyScr.length >= 3 &&
          M.pointInPolygonScr(sx, sy, h.polyScr)
        )
          return h.id;
      }
      for (const h of hits) {
        if (
          sx >= h.sx &&
          sx <= h.sx + h.w &&
          sy >= h.sy &&
          sy <= h.sy + h.h
        )
          return h.id;
      }
      return null;
    };

    const findHandleAt = (
      sx: number,
      sy: number,
    ): { zoneId: number; vertIdx: number } | null => {
      if (selectedZoneId == null) return null;
      const hit = zoneHitRef.current.find((h) => h.id === selectedZoneId);
      if (!hit || !hit.polyScr) return null;
      for (let i = 0; i < hit.polyScr.length; i++) {
        const v = hit.polyScr[i];
        if (
          Math.abs(sx - v.x) < HANDLE_HIT_R &&
          Math.abs(sy - v.y) < HANDLE_HIT_R
        ) {
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

      // 1. Rectangle draw
      if (pm && ptp) {
        drawingRef.current = {
          active: true,
          startSx: sx,
          startSy: sy,
          curSx: sx,
          curSy: sy,
        };
        dragStartRef.current = { x: e.clientX, y: e.clientY };
        dragRef.current = { on: true, lx: e.clientX, ly: e.clientY };
        c.setPointerCapture(e.pointerId);
        return;
      }

      // 2. Corner handle drag
      const handleHit = findHandleAt(sx, sy);
      if (handleHit && !pm && zoneEditModeRef.current) {
        const zo = zoneOverlays?.find((z) => z.id === handleHit.zoneId);
        if (zo) {
          try {
            const origPoly: number[][] = JSON.parse(zo.polygonJson);
            handleDragRef.current = {
              zoneId: handleHit.zoneId,
              vertIdx: handleHit.vertIdx,
              origPoly,
            };
            dragStartRef.current = { x: e.clientX, y: e.clientY };
            c.setPointerCapture(e.pointerId);
            return;
          } catch {}
        }
      }

      // 2.25 Ref frame: rotate handle (before scale/move)
      const refRotateHit = refFrameRotateHitRef.current.find(
        (h) => Math.hypot(sx - h.cx, sy - h.cy) <= h.r,
      );
      if (refRotateHit && !pm && coordEditModeRef.current) {
        const agv = layers.find((l) => l.ip === refRotateHit.ip);
        if (agv) {
          const curDeg = agv.coordRotationDeg ?? 0;
          const nextDeg = ((curDeg + 90) % 360 + 360) % 360;
          const cfr = onCoordFrameRotateRef.current;
          if (cfr) cfr(refRotateHit.ip, nextDeg, refRotateHit.centerX, refRotateHit.centerY);
        }
        return;
      }

      // 2.5 Ref frame: scale handle or move
      const refHandleHit = refFrameHandleHitRef.current.find(
        (h) =>
          sx >= h.sx &&
          sx <= h.sx + h.w &&
          sy >= h.sy &&
          sy <= h.sy + h.h,
      );
      if (refHandleHit && !pm && coordEditModeRef.current) {
        const agv = layers.find((l) => l.ip === refHandleHit.ip);
        const box = refFrameHitRef.current.find(
          (f) => f.ip === refHandleHit.ip,
        );
        const localBounds =
          refFrameLocalBoundsRef.current[refHandleHit.ip];
        if (agv && box && localBounds) {
          const agvScale = agv.coordScale ?? 1.0;
          const localDx = localBounds.bxMax - localBounds.bxMin;
          const localDy = localBounds.byMax - localBounds.byMin;
          const localDiag = Math.sqrt(
            localDx * localDx + localDy * localDy,
          );
          const viewScale = transformRef.current?.scale ?? 1;
          const origDist = Math.max(
            localDiag * agvScale * viewScale,
            1,
          );
          refFrameScaleRef.current = {
            ip: refHandleHit.ip,
            startSx: e.clientX,
            startSy: e.clientY,
            origScale: agvScale,
            anchorSx: box.right,
            anchorSy: box.bottom,
            anchorLocalX: localBounds.bxMax,
            anchorLocalY: localBounds.byMax,
            oldOffsetX: agv.coordOffsetX ?? 0,
            oldOffsetY: agv.coordOffsetY ?? 0,
            origDist,
          };
        }
        dragStartRef.current = { x: e.clientX, y: e.clientY };
        c.setPointerCapture(e.pointerId);
        return;
      }

      const refFrame = refFrameHitRef.current.find(
        (f) =>
          sx >= f.left &&
          sx <= f.right &&
          sy >= f.top &&
          sy <= f.bottom,
      );
      if (refFrame && !pm && coordEditModeRef.current) {
        const agv = layers.find((l) => l.ip === refFrame.ip);
        if (agv) {
          const agvRad =
            ((agv.coordRotationDeg ?? 0) * Math.PI) / 180;
          refFrameDragRef.current = {
            ip: refFrame.ip,
            startSx: e.clientX,
            startSy: e.clientY,
            origOffsetX: agv.coordOffsetX ?? 0,
            origOffsetY: agv.coordOffsetY ?? 0,
            combinedRad: (transformRef.current?.rad ?? 0) + agvRad,
            startViewScale: transformRef.current?.scale ?? 1,
          };
          dragStartRef.current = { x: e.clientX, y: e.clientY };
          c.setPointerCapture(e.pointerId);
          return;
        }
      }

      // 3. Zone body click -> move drag
      const zoneHit = findZoneAt(sx, sy);
      if (zoneHit != null && !pm && zoneEditModeRef.current) {
        const zo = zoneOverlays?.find((z) => z.id === zoneHit);
        if (zo) {
          try {
            const origPoly: number[][] = JSON.parse(zo.polygonJson);
            moveDragRef.current = {
              zoneId: zoneHit,
              origPoly,
              startSx: sx,
              startSy: sy,
              moved: false,
            };
            dragStartRef.current = { x: e.clientX, y: e.clientY };
            c.setPointerCapture(e.pointerId);
            return;
          } catch {}
        }
      }

      // 4. Normal pan
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
        const w = M.screenToWorld(sx, sy, t);
        const { zoneId, vertIdx } = handleDragRef.current;
        const zo = zoneOverlays?.find((z) => z.id === zoneId);
        if (zo) {
          try {
            const poly: number[][] = JSON.parse(zo.polygonJson);
            if (vertIdx < poly.length) {
              poly[vertIdx] = [w.wx, w.wy];
              handleDragRef.current = {
                zoneId,
                vertIdx,
                origPoly: poly,
              };
            }
          } catch {}
        }
        return;
      }
      if (refFrameScaleRef.current) {
        cancelReset();
        const rect = c.getBoundingClientRect();
        const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
        const {
          anchorSx,
          anchorSy,
          origScale,
          origDist,
          ip,
          anchorLocalX,
          anchorLocalY,
          oldOffsetX,
          oldOffsetY,
        } = refFrameScaleRef.current;
        const newDist = Math.sqrt(
          (sx - anchorSx) ** 2 + (sy - anchorSy) ** 2,
        );
        const newScale = Math.max(
          0.1,
          Math.min(10, origScale * (newDist / origDist)),
        );
        const anchorWorldX =
          (anchorLocalX + oldOffsetX) * origScale;
        const anchorWorldY =
          (anchorLocalY + oldOffsetY) * origScale;
        const newOffsetX =
          anchorWorldX / newScale - anchorLocalX;
        const newOffsetY =
          anchorWorldY / newScale - anchorLocalY;
        const cfs = onCoordFrameScaleRef.current;
        if (cfs) cfs(ip, newScale, newOffsetX, newOffsetY);
        return;
      }
      if (refFrameDragRef.current) {
        cancelReset();
        const dx =
          e.clientX - refFrameDragRef.current.startSx;
        const dy =
          e.clientY - refFrameDragRef.current.startSy;
        if (
          Math.abs(dx) > DRAG_THRESHOLD ||
          Math.abs(dy) > DRAG_THRESHOLD
        ) {
          const tScale = refFrameDragRef.current.startViewScale;
          const worldDx = dx / tScale, worldDy = -dy / tScale;
          const invRad = -refFrameDragRef.current.combinedRad;
          const rotDx =
            worldDx * Math.cos(invRad) -
            worldDy * Math.sin(invRad);
          const rotDy =
            worldDx * Math.sin(invRad) +
            worldDy * Math.cos(invRad);
          const newOx =
            refFrameDragRef.current.origOffsetX + rotDx;
          const newOy =
            refFrameDragRef.current.origOffsetY + rotDy;
          const cfm = onCoordFrameMoveRef.current;
          if (cfm)
            cfm(refFrameDragRef.current.ip, newOx, newOy);
        }
        return;
      }
      if (moveDragRef.current) {
        cancelReset();
        const rect = c.getBoundingClientRect();
        const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
        if (
          Math.abs(sx - moveDragRef.current.startSx) >
            DRAG_THRESHOLD ||
          Math.abs(sy - moveDragRef.current.startSy) >
            DRAG_THRESHOLD
        ) {
          moveDragRef.current.moved = true;
          const t = transformRef.current;
          if (!t) return;
          const wCur = M.screenToWorld(sx, sy, t);
          const wStart = M.screenToWorld(
            moveDragRef.current.startSx,
            moveDragRef.current.startSy,
            t,
          );
          const wDx = wCur.wx - wStart.wx,
            wDy = wCur.wy - wStart.wy;
          moveDragRef.current.startSx = sx;
          moveDragRef.current.startSy = sy;
          const movedPoly = moveDragRef.current.origPoly.map(
            ([vx, vy]) => [vx + wDx, vy + wDy],
          );
          moveDragRef.current.origPoly = movedPoly;
        }
        return;
      }
      if (!dragRef.current.on) return;
      cancelReset();
      panRef.current = {
        x: panRef.current.x + e.clientX - dragRef.current.lx,
        y: panRef.current.y + e.clientY - dragRef.current.ly,
      };
      dragRef.current = { on: true, lx: e.clientX, ly: e.clientY };
    };

    const onUp = (e: PointerEvent) => {
      const wasDragging = dragRef.current.on;
      dragRef.current.on = false;
      const ddx = e.clientX - dragStartRef.current.x;
      const ddy = e.clientY - dragStartRef.current.y;

      // 1. Rectangle draw complete
      if (drawingRef.current?.active) {
        drawingRef.current.active = false;
        if (
          Math.abs(ddx) > DRAG_THRESHOLD ||
          Math.abs(ddy) > DRAG_THRESHOLD
        ) {
          const t = transformRef.current;
          const rd = onRectDrawnRef.current;
          if (t && rd) {
            const w1 = M.screenToWorld(
              drawingRef.current.startSx,
              drawingRef.current.startSy,
              t,
            );
            const w2 = M.screenToWorld(
              drawingRef.current.curSx,
              drawingRef.current.curSy,
              t,
            );
            rd(w1.wx, w1.wy, w2.wx, w2.wy);
          }
        } else {
          const pp = onPointPickRef.current;
          if (pp) {
            const rect = c.getBoundingClientRect();
            const sx = e.clientX - rect.left,
              sy = e.clientY - rect.top;
            const t = transformRef.current;
            if (t && !t.followMode) {
              const w = M.screenToWorld(sx, sy, t);
              pp(w.wx, w.wy);
            }
          }
        }
        drawingRef.current = null;
        scheduleReset();
        return;
      }

      // 2. Corner handle drag complete
      if (handleDragRef.current) {
        const { zoneId, origPoly } = handleDragRef.current;
        handleDragRef.current = null;
        const or = onZoneReshapeRef.current;
        if (or) or(zoneId, JSON.stringify(origPoly));
        scheduleReset();
        return;
      }

      // 2.5 Ref frame scale complete
      if (refFrameScaleRef.current) {
        refFrameScaleRef.current = null;
        scheduleReset();
        return;
      }
      // Ref frame drag complete
      if (refFrameDragRef.current) {
        refFrameDragRef.current = null;
        scheduleReset();
        return;
      }

      // 3. Zone move complete
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

      // 4. Click -> point pick or zone click
      const pm = pickModeRef.current;
      if (
        pm &&
        wasDragging &&
        Math.abs(ddx) < DRAG_THRESHOLD &&
        Math.abs(ddy) < DRAG_THRESHOLD
      ) {
        const pp = onPointPickRef.current;
        if (pp) {
          const rect = c.getBoundingClientRect();
          const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
          const t = transformRef.current;
          if (t && !t.followMode) {
            const w = M.screenToWorld(sx, sy, t);
            pp(w.wx, w.wy);
            scheduleReset();
            return;
          }
        }
      }

      if (
        !pm &&
        wasDragging &&
        Math.abs(ddx) < DRAG_THRESHOLD &&
        Math.abs(ddy) < DRAG_THRESHOLD
      ) {
        const rect = c.getBoundingClientRect();
        const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
        for (const h of zoneHitRef.current) {
          if (
            sx >= h.sx &&
            sx <= h.sx + h.w &&
            sy >= h.sy &&
            sy <= h.sy + h.h
          ) {
            if (onZoneClick)
              onZoneClick(h.id, h.name, h.stationPattern);
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

    const onDbl = () => {
      panRef.current = { x: 0, y: 0 };
      zoomRef.current = 1;
    };

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
  }, [zoneOverlays, selectedZoneId, layers]);

  const cursorClass = pickMode
    ? "cursor-crosshair"
    : selectedZoneId != null
      ? "cursor-default"
      : "cursor-grab";

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full min-h-0 ${cursorClass}`}
      style={{ touchAction: "none" }}
    >
      <canvas ref={canvasRef} className="absolute inset-0" />
    </div>
  );
}
