import type { BoardPresentationId } from "@/features/digital-twin-screen/layout/sceneLayoutTypes";

/** 视口 pan + 均匀缩放（与 WorldStack transform 一致） */
export type TwinViewportPanScale = {
  scale: number;
  panX: number;
  panY: number;
};

export type TwinBoardPlaneParams = {
  presentation: BoardPresentationId;
  /** planTilt 时绕 X 轴倾角（度），默认 12 */
  tiltRotateXDeg: number;
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/**
 * 将屏幕坐标逆变换到「逻辑板」上的归一化坐标 (0–1)，与 ductScene / 房间布局一致。
 * 顺序：视口 rect → 减去 pan → 除以 scale →（可选）小倾角 rotateX 的近似逆映射 → 除以 logicalW/H。
 * 见仓库计划「视口架构与3D板」：集中坐标变换，避免散落公式。
 */
export function clientToSceneNorm(
  clientX: number,
  clientY: number,
  viewportRect: DOMRectReadOnly,
  vp: TwinViewportPanScale,
  logicalW: number,
  logicalH: number,
  board: TwinBoardPlaneParams
): { x: number; y: number } {
  const s = vp.scale > 1e-6 ? vp.scale : 1;
  let u = (clientX - viewportRect.left - vp.panX) / s;
  let v = (clientY - viewportRect.top - vp.panY) / s;

  if (board.presentation === "planTilt") {
    const deg = Number.isFinite(board.tiltRotateXDeg) ? board.tiltRotateXDeg : 12;
    const rad = (deg * Math.PI) / 180;
    const cx = logicalW / 2;
    const cy = logicalH / 2;
    const du = u - cx;
    const dv = v - cy;
    const cos = Math.cos(rad);
    const invCos = Math.abs(cos) > 0.12 ? 1 / cos : 1;
    u = cx + du;
    v = cy + dv * invCos;
  }

  return {
    x: clamp01(logicalW > 1e-6 ? u / logicalW : 0),
    y: clamp01(logicalH > 1e-6 ? v / logicalH : 0),
  };
}

/**
 * 与图元 % 定位同一坐标系：逻辑板 DOM（已与 pan+scale 合成最终屏幕矩形）轴对齐时，直接用其 getBoundingClientRect
 * 反算 scene 0–1，避免「viewport 矩形 + pan/s」与板子实际屏幕位置（中间 flex/3D 链）不一致导致命中/选框与图形偏移。
 */
export function clientToSceneNormFromAxisAlignedBoard(
  clientX: number,
  clientY: number,
  boardScreenRect: DOMRectReadOnly,
  logicalW: number,
  logicalH: number
): { x: number; y: number } {
  const bw = boardScreenRect.width > 1e-6 ? boardScreenRect.width : 1;
  const bh = boardScreenRect.height > 1e-6 ? boardScreenRect.height : 1;
  return {
    x: clamp01((clientX - boardScreenRect.left) / bw),
    y: clamp01((clientY - boardScreenRect.top) / bh),
  };
}

export function clientToPlateNormFromAxisAlignedBoard(
  clientX: number,
  clientY: number,
  boardScreenRect: DOMRectReadOnly,
  logicalW: number,
  logicalH: number,
  grid: { x: number; y: number; w: number; h: number }
): { x: number; y: number } {
  const sn = clientToSceneNormFromAxisAlignedBoard(clientX, clientY, boardScreenRect, logicalW, logicalH);
  const lw = logicalW > 1e-6 ? logicalW : 1;
  const lh = logicalH > 1e-6 ? logicalH : 1;
  const gridNorm = {
    x: grid.x / lw,
    y: grid.y / lh,
    w: grid.w / lw,
    h: grid.h / lh,
  };
  return sceneNormToPlateNorm(sn.x, sn.y, gridNorm);
}

/** 由场景归一化坐标换算到 plate（房间区）归一化坐标；grid 须与 nx/ny 同空间（均为 0–1 全场景归一化下的子矩形）。 */
export function sceneNormToPlateNorm(
  nx: number,
  ny: number,
  grid: { x: number; y: number; w: number; h: number }
): { x: number; y: number } {
  const gw = grid.w > 1e-6 ? grid.w : 1;
  const gh = grid.h > 1e-6 ? grid.h : 1;
  return {
    x: clamp01((nx - grid.x) / gw),
    y: clamp01((ny - grid.y) / gh),
  };
}

/**
 * 屏幕 → plate 归一化 (0–1)。`grid` 与 `DuctSceneLayout.grid` 一致：为 **scene 像素空间**下房间区相对全板的矩形；
 * `clientToSceneNorm` 的 sn 为 **全板宽/高归一化**的 0–1，故此处先将 grid 除以 logicalW/H 再代入 sceneNormToPlateNorm。
 * （此前编辑态 grid.w=logicalW 像素时误作除数，会把 plate 坐标压到近 0，导致图元点不中。）
 */
export function clientToPlateNorm(
  clientX: number,
  clientY: number,
  viewportRect: DOMRectReadOnly,
  vp: TwinViewportPanScale,
  logicalW: number,
  logicalH: number,
  board: TwinBoardPlaneParams,
  grid: { x: number; y: number; w: number; h: number }
): { x: number; y: number } {
  const sn = clientToSceneNorm(clientX, clientY, viewportRect, vp, logicalW, logicalH, board);
  const lw = logicalW > 1e-6 ? logicalW : 1;
  const lh = logicalH > 1e-6 ? logicalH : 1;
  const gridNorm = {
    x: grid.x / lw,
    y: grid.y / lh,
    w: grid.w / lw,
    h: grid.h / lh,
  };
  return sceneNormToPlateNorm(sn.x, sn.y, gridNorm);
}

/** ductScene.grid 为 scene 像素空间下房间区矩形；图元 nx/ny 为 plate 0–1，须映射到铺满 scene 画布时的 left/top/width/height 百分比（与 clientToPlateNorm 一致） */
export function plateNormRectToScenePercentStyle(
  nx: number,
  ny: number,
  nw: number,
  nh: number,
  grid: { x: number; y: number; w: number; h: number },
  logicalW: number,
  logicalH: number
): { left: string; top: string; width: string; height: string } {
  const lw = logicalW > 1e-6 ? logicalW : 1;
  const lh = logicalH > 1e-6 ? logicalH : 1;
  const sl = (grid.x + nx * grid.w) / lw;
  const st = (grid.y + ny * grid.h) / lh;
  const sw = (nw * grid.w) / lw;
  const sh = (nh * grid.h) / lh;
  return {
    left: `${sl * 100}%`,
    top: `${st * 100}%`,
    width: `${sw * 100}%`,
    height: `${sh * 100}%`,
  };
}
