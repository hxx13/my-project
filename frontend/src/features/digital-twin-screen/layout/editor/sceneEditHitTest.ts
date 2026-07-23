import type { DuctPlanPoint, DuctPlanPolyline } from "@/features/digital-twin-screen/layout/ductLayoutTypes";
import type { RoomLayoutEntry } from "@/features/digital-twin-screen/layout/sceneLayoutTypes";
import { clamp01, distToSegment, projectOnSegment } from "@/features/digital-twin-screen/layout/planGeometry";

export type ResizeHandle = "nw" | "ne" | "sw" | "se" | "n" | "e" | "s" | "w";

export function clientToPlateNorm(clientX: number, clientY: number, plate: DOMRectReadOnly): { x: number; y: number } {
  return {
    x: clamp01((clientX - plate.left) / Math.max(1, plate.width)),
    y: clamp01((clientY - plate.top) / Math.max(1, plate.height)),
  };
}

/** 与风管 SVG 同一包围盒（flex-1 画布）下的 scene 归一化坐标 */
export function clientToDuctNorm(clientX: number, clientY: number, ductArea: DOMRectReadOnly): { x: number; y: number } {
  return {
    x: clamp01((clientX - ductArea.left) / Math.max(1, ductArea.width)),
    y: clamp01((clientY - ductArea.top) / Math.max(1, ductArea.height)),
  };
}

export function pointInRotatedRoom(px: number, py: number, entry: RoomLayoutEntry): boolean {
  const rot = ((entry.rotationDeg ?? 0) * Math.PI) / 180;
  const cx = entry.nx + entry.nw / 2;
  const cy = entry.ny + entry.nh / 2;
  const dx = px - cx;
  const dy = py - cy;
  const c = Math.cos(-rot);
  const s = Math.sin(-rot);
  const lx = dx * c - dy * s;
  const ly = dx * s + dy * c;
  return Math.abs(lx) <= entry.nw / 2 && Math.abs(ly) <= entry.nh / 2;
}

/** 屏幕像素下检测旋转房间角点手柄（仅选中房间） */
export function hitRoomResizeHandle(
  clientX: number,
  clientY: number,
  plate: DOMRectReadOnly,
  entry: RoomLayoutEntry,
  thrPx: number
): ResizeHandle | null {
  const roomLeft = plate.left + entry.nx * plate.width;
  const roomTop = plate.top + entry.ny * plate.height;
  const roomW = entry.nw * plate.width;
  const roomH = entry.nh * plate.height;
  const cx = roomLeft + roomW / 2;
  const cy = roomTop + roomH / 2;
  const rad = (-(entry.rotationDeg ?? 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = clientX - cx;
  const dy = clientY - cy;
  const lx = dx * cos - dy * sin;
  const ly = dx * sin + dy * cos;
  const hw = roomW / 2;
  const hh = roomH / 2;
  const corners: { h: ResizeHandle; sx: number; sy: number }[] = [
    { h: "nw", sx: -hw, sy: -hh },
    { h: "ne", sx: hw, sy: -hh },
    { h: "sw", sx: -hw, sy: hh },
    { h: "se", sx: hw, sy: hh },
  ];
  for (const { h, sx, sy } of corners) {
    const d = Math.hypot(lx - sx, ly - sy);
    if (d <= thrPx) return h;
  }
  return null;
}

export function pointToDuctPixel(p: DuctPlanPoint, w: number, h: number, liftPx: number): { x: number; y: number } {
  const px = p.x * w;
  const py = p.y * h;
  const lift = (p.h ?? 0) * liftPx;
  return { x: px - lift * 0.5, y: py - lift * 0.42 };
}

/** 在归一化坐标系（与 entry.nx 同一空间）下检测旋转矩形角点手柄；thr 为归一化距离阈值 */
export function hitRoomResizeHandleNorm(
  px: number,
  py: number,
  entry: RoomLayoutEntry,
  thrNorm: number
): ResizeHandle | null {
  const cx = entry.nx + entry.nw / 2;
  const cy = entry.ny + entry.nh / 2;
  const rad = (-(entry.rotationDeg ?? 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = px - cx;
  const dy = py - cy;
  const lx = dx * cos - dy * sin;
  const ly = dx * sin + dy * cos;
  const hw = entry.nw / 2;
  const hh = entry.nh / 2;
  const corners: { h: ResizeHandle; sx: number; sy: number }[] = [
    { h: "nw", sx: -hw, sy: -hh },
    { h: "ne", sx: hw, sy: -hh },
    { h: "sw", sx: -hw, sy: hh },
    { h: "se", sx: hw, sy: hh },
  ];
  for (const { h, sx, sy } of corners) {
    if (Math.hypot(lx - sx, ly - sy) <= thrNorm) return h;
  }
  const edges: { h: ResizeHandle; sx: number; sy: number }[] = [
    { h: "n", sx: 0, sy: -hh },
    { h: "s", sx: 0, sy: hh },
    { h: "e", sx: hw, sy: 0 },
    { h: "w", sx: -hw, sy: 0 },
  ];
  for (const { h, sx, sy } of edges) {
    if (Math.hypot(lx - sx, ly - sy) <= thrNorm) return h;
  }
  return null;
}

export function hitDuctVertex(
  pixX: number,
  pixY: number,
  ducts: DuctPlanPolyline[],
  width: number,
  height: number,
  heightLiftPx: number,
  thrPx: number
): { polyId: string; index: number } | null {
  for (const pl of ducts) {
    for (let i = 0; i < pl.points.length; i++) {
      const p = pl.points[i]!;
      const P = pointToDuctPixel(p, width, height, heightLiftPx);
      if (Math.hypot(P.x - pixX, P.y - pixY) <= thrPx) return { polyId: pl.id, index: i };
    }
  }
  return null;
}

export type DuctSegmentHit = { polyId: string; seg: number; dist: number; proj: { x: number; y: number } };

export function bestDuctSegmentHit(nx: number, ny: number, ducts: DuctPlanPolyline[]): DuctSegmentHit | null {
  let best: DuctSegmentHit | null = null;
  for (const pl of ducts) {
    for (let i = 0; i < pl.points.length - 1; i++) {
      const a = pl.points[i]!;
      const b = pl.points[i + 1]!;
      const d = distToSegment(nx, ny, a.x, a.y, b.x, b.y);
      if (best === null || d < best.dist) {
        const proj = projectOnSegment(nx, ny, a.x, a.y, b.x, b.y);
        best = { polyId: pl.id, seg: i, dist: d, proj: { x: proj.x, y: proj.y } };
      }
    }
  }
  return best;
}
