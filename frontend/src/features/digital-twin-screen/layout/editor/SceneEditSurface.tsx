/**
 * 数字孪生场景编辑：单一 pointer 命中面（SceneEditSurface）。
 * 风管仍为 scene 归一化、房间为 plate 归一化；两套映射在本组件内完成。
 * 可选后续：风管数据迁到 plate 归一化（SceneLayoutDocumentV3）以统一坐标系 — 见 plan 里程碑。
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MutableRefObject } from "react";
import { createPortal } from "react-dom";
import type { DuctPlanPoint, DuctPlanPolyline } from "@/features/digital-twin-screen/layout/ductLayoutTypes";
import { newPointId } from "@/features/digital-twin-screen/layout/ductLayoutTypes";
import type {
  DtAcZoneDoc,
  DtSceneWidget,
  DtWidgetStackLayerRow,
  DtWidgetStackLayerUi,
  RoomLayoutEntry,
} from "@/features/digital-twin-screen/layout/sceneLayoutTypes";
import { effectiveWidgetStackLayerId } from "@/features/digital-twin-screen/layout/sceneLayoutTypes";
import { normalizedStackLayers, widgetsEditablePaintOrder } from "@/features/digital-twin-screen/layout/dtWidgetStackOrder";
import { clamp01, clampRoomTopLeftToPlate, snapAngle45, snapGrid } from "@/features/digital-twin-screen/layout/planGeometry";
import type { EditorLayerRow } from "@/features/digital-twin-screen/layout/editor/EditorLayerModel";
import {
  bestDuctSegmentHit,
  hitDuctVertex,
  hitRoomResizeHandleNorm,
  pointInRotatedRoom,
  type ResizeHandle,
} from "@/features/digital-twin-screen/layout/editor/sceneEditHitTest";
import {
  buildScenePickStack,
  isPlateNormInsideAnyWidget,
  pickStackIndexOfCurrent,
  type PickSelectionSnapshot,
  type ScenePickTarget,
} from "@/features/digital-twin-screen/layout/editor/sceneEditPickStack";
import {
  clientToPlateNorm,
  clientToPlateNormFromAxisAlignedBoard,
  clientToSceneNorm,
  clientToSceneNormFromAxisAlignedBoard,
  plateNormRectToScenePercentStyle,
  type TwinBoardPlaneParams,
  type TwinViewportPanScale,
} from "@/features/digital-twin-screen/layout/viewportPlaneTransform";
import { EDITOR_SHAPE_CATALOG } from "@/features/digital-twin-screen/layout/dtEditorShapeCatalog";
import { DT_WIDGET_PLATE_MIN } from "@/features/digital-twin-screen/layout/dtWidgetPlateLimits";

const ROOM_RESIZE_MIN = 0.04;

/** 图元调试：localStorage `aro.dt.debugWidgetMove`=`"1"` 开启。含 ①`[Dt][widgetPick]` 按下时 plate/几何/DOM/理论像素盒偏差 ②`[Dt][widgetDrag]` 拖拽节流日志 */
export const DT_DEBUG_WIDGET_MOVE_LS_KEY = "aro.dt.debugWidgetMove";

function isDtDebugWidgetMoveOn(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(DT_DEBUG_WIDGET_MOVE_LS_KEY) === "1";
  } catch {
    return false;
  }
}

/** 按下开始拖拽时：指针 plate vs 几何盒、与按 plateNormRect 换算的屏幕盒、与 DOM 根节点 getBoundingClientRect 的像素偏差（单行） */
function dtLogWidgetPickVsGeometry(
  clientX: number,
  clientY: number,
  plate: { x: number; y: number },
  w: DtSceneWidget,
  board: HTMLElement | null,
  duct: { w: number; h: number },
  grid: { x: number; y: number; w: number; h: number }
): void {
  const fx = (n: number, p: number) => (Number.isFinite(n) ? n.toFixed(p) : String(n));
  const lw = duct.w > 1e-6 ? duct.w : 1;
  const lh = duct.h > 1e-6 ? duct.h : 1;
  const inGeom =
    plate.x + 1e-9 >= w.nx && plate.x <= w.nx + w.nw + 1e-9 && plate.y + 1e-9 >= w.ny && plate.y <= w.ny + w.nh + 1e-9 ? "1" : "0";
  const sl = (grid.x + w.nx * grid.w) / lw;
  const st = (grid.y + w.ny * grid.h) / lh;
  const sw = (w.nw * grid.w) / lw;
  const sh = (w.nh * grid.h) / lh;
  const br = board?.getBoundingClientRect();
  let mathPart = "mathPx=n/a";
  let inMathPx = "?";
  let distMathPx = "?";
  if (br && br.width > 1e-6 && br.height > 1e-6) {
    const boxL = br.left + sl * br.width;
    const boxT = br.top + st * br.height;
    const boxW = sw * br.width;
    const boxH = sh * br.height;
    const boxR = boxL + boxW;
    const boxB = boxT + boxH;
    const inside = clientX >= boxL && clientX <= boxR && clientY >= boxT && clientY <= boxB;
    const dx = inside ? 0 : clientX < boxL ? boxL - clientX : clientX - boxR;
    const dy = inside ? 0 : clientY < boxT ? boxT - clientY : clientY - boxB;
    const dist = inside ? 0 : Math.hypot(dx, dy);
    mathPart = `mathPx(${fx(boxL, 1)},${fx(boxT, 1)},${fx(boxW, 2)}×${fx(boxH, 2)})`;
    inMathPx = inside ? "1" : "0";
    distMathPx = fx(dist, 2);
  }
  const esc =
    typeof document !== "undefined" && typeof CSS !== "undefined" && typeof CSS.escape === "function"
      ? CSS.escape(w.id)
      : w.id.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const el =
    typeof document !== "undefined" ? (document.querySelector(`[data-dt-widget-id="${esc}"]`) as HTMLElement | null) : null;
  let domPart = "dom=MISSING";
  let inDom = "?";
  let distDomPx = "?";
  if (el) {
    const r = el.getBoundingClientRect();
    const inside = clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
    const dx = inside ? 0 : clientX < r.left ? r.left - clientX : clientX - r.right;
    const dy = inside ? 0 : clientY < r.top ? r.top - clientY : clientY - r.bottom;
    const dist = inside ? 0 : Math.hypot(dx, dy);
    domPart = `dom(${fx(r.left, 1)},${fx(r.top, 1)},${fx(r.width, 2)}×${fx(r.height, 2)})`;
    inDom = inside ? "1" : "0";
    distDomPx = fx(dist, 2);
  }
  let mathDomD = "n/a";
  if (el && br && br.width > 1e-6) {
    const r = el.getBoundingClientRect();
    const boxL = br.left + sl * br.width;
    const boxT = br.top + st * br.height;
    mathDomD = `dL=${fx(r.left - boxL, 2)} dT=${fx(r.top - boxT, 2)} dW=${fx(r.width - sw * br.width, 2)} dH=${fx(r.height - sh * br.height, 2)}`;
  }
  console.log(
    `[Dt][widgetPick] id=${w.id} client(${fx(clientX, 1)},${fx(clientY, 1)}) plate(${fx(plate.x, 5)},${fx(plate.y, 5)}) ` +
      `geom(${fx(w.nx, 5)},${fx(w.ny, 5)},${fx(w.nw, 5)},${fx(w.nh, 5)}) inGeom=${inGeom} ` +
      `${mathPart} inMathPx=${inMathPx} distOutMathPx=${distMathPx} ` +
      `${domPart} inDom=${inDom} distOutDomPx=${distDomPx} mathVsDom(${mathDomD})`
  );
}

type ActiveDrag =
  | { kind: "none" }
  | {
      kind: "move";
      roomId: string;
      startPointerNorm: { x: number; y: number };
      startRect: RoomLayoutEntry;
      snapshotRooms: RoomLayoutEntry[];
    }
  | {
      kind: "resize";
      roomId: string;
      handle: ResizeHandle;
      startPointerNorm: { x: number; y: number };
      startRect: RoomLayoutEntry;
      snapshotRooms: RoomLayoutEntry[];
    }
  | { kind: "duct_vertex"; polyId: string; index: number }
  | {
      kind: "widget_move";
      widgetId: string;
      startPointerNorm: { x: number; y: number };
      start: DtSceneWidget;
      snapshotWidgets: DtSceneWidget[];
    }
  | {
      kind: "widget_resize";
      widgetId: string;
      handle: ResizeHandle;
      startPointerNorm: { x: number; y: number };
      start: DtSceneWidget;
      snapshotWidgets: DtSceneWidget[];
    }
  | {
      kind: "ac_move";
      zoneId: string;
      startPointerNorm: { x: number; y: number };
      start: DtAcZoneDoc;
      snapshotAc: DtAcZoneDoc[];
    }
  | {
      kind: "ac_resize";
      zoneId: string;
      handle: ResizeHandle;
      startPointerNorm: { x: number; y: number };
      start: DtAcZoneDoc;
      snapshotAc: DtAcZoneDoc[];
    }
  | {
      kind: "marquee";
      startPointerNorm: { x: number; y: number };
      endPointerNorm: { x: number; y: number };
      additive: boolean;
    };

function cloneRooms(rooms: RoomLayoutEntry[]): RoomLayoutEntry[] {
  return rooms.map((r) => ({ ...r }));
}

function cloneDucts(ducts: DuctPlanPolyline[]): DuctPlanPolyline[] {
  return ducts.map((pl) => ({
    ...pl,
    points: pl.points.map((p) => ({ ...p })),
  }));
}

function cloneWidgets(widgets: DtSceneWidget[]): DtSceneWidget[] {
  return widgets.map((w) => ({
    ...w,
    bindings: w.bindings.map((b) => ({ ...b })),
  }));
}

function cloneAcZones(zones: DtAcZoneDoc[]): DtAcZoneDoc[] {
  return zones.map((z) => ({ ...z }));
}

function acZoneAsRoomEntry(z: DtAcZoneDoc): RoomLayoutEntry {
  return { roomId: z.id, nx: z.nx, ny: z.ny, nw: z.nw, nh: z.nh, rotationDeg: 0 };
}

function clampAcZoneDoc(z: DtAcZoneDoc): DtAcZoneDoc {
  let { nx, ny, nw, nh } = z;
  nw = Math.max(0.04, Math.min(1, nw));
  nh = Math.max(0.04, Math.min(1, nh));
  nx = clamp01(nx);
  ny = clamp01(ny);
  if (nx + nw > 1) nx = 1 - nw;
  if (ny + nh > 1) ny = 1 - nh;
  return { ...z, nx, ny, nw, nh };
}

function widgetGeom(w: DtSceneWidget): RoomLayoutEntry {
  return { roomId: w.id, nx: w.nx, ny: w.ny, nw: w.nw, nh: w.nh, rotationDeg: 0 };
}

function normRectFromCorners(a: { x: number; y: number }, b: { x: number; y: number }): { nx: number; ny: number; nw: number; nh: number } {
  const x1 = Math.min(a.x, b.x);
  const x2 = Math.max(a.x, b.x);
  const y1 = Math.min(a.y, b.y);
  const y2 = Math.max(a.y, b.y);
  return { nx: x1, ny: y1, nw: Math.max(0, x2 - x1), nh: Math.max(0, y2 - y1) };
}

function axisRectsOverlap(entry: RoomLayoutEntry, box: { nx: number; ny: number; nw: number; nh: number }): boolean {
  return !(entry.nx + entry.nw <= box.nx || box.nx + box.nw <= entry.nx || entry.ny + entry.nh <= box.ny || box.ny + box.nh <= entry.ny);
}

function widgetIdsInMarqueeOverlap(
  widgets: readonly DtSceneWidget[],
  box: { nx: number; ny: number; nw: number; nh: number },
  stackLayers: readonly DtWidgetStackLayerRow[] | undefined,
  layerUi: Readonly<Record<string, DtWidgetStackLayerUi>> | undefined
): string[] {
  const list =
    stackLayers && stackLayers.length > 0 ? widgetsEditablePaintOrder(widgets, stackLayers, layerUi) : [...widgets];
  const ids: string[] = [];
  for (const w of list) {
    if (axisRectsOverlap(widgetGeom(w), box)) ids.push(w.id);
  }
  return ids;
}

/** Shift+缩放：保持拖拽起始时的宽高比（与 widget / room / ac 缩放共用） */
function applyResizeProportional(
  handle: ResizeHandle,
  start: RoomLayoutEntry,
  dx: number,
  dy: number,
  minSide: number = ROOM_RESIZE_MIN
): RoomLayoutEntry {
  const sx = start.nx;
  const sy = start.ny;
  const w0 = start.nw;
  const h0 = start.nh;
  const r = w0 / Math.max(h0, 1e-12);
  const R = minSide;
  let nx = sx;
  let ny = sy;
  let nw = w0;
  let nh = h0;

  switch (handle) {
    case "se":
      nw = w0 + dx;
      nh = nw / r;
      break;
    case "sw":
      nw = w0 - dx;
      nh = nw / r;
      nx = sx + w0 - nw;
      break;
    case "ne":
      nw = w0 + dx;
      nh = nw / r;
      ny = sy + h0 - nh;
      break;
    case "nw":
      nw = w0 - dx;
      nh = nw / r;
      nx = sx + w0 - nw;
      ny = sy + h0 - nh;
      break;
    case "e":
      nw = w0 + dx;
      nh = nw / r;
      ny = sy + (h0 - nh) / 2;
      break;
    case "w":
      nw = w0 - dx;
      nh = nw / r;
      nx = sx + w0 - nw;
      ny = sy + (h0 - nh) / 2;
      break;
    case "s":
      nh = h0 + dy;
      nw = nh * r;
      nx = sx + (w0 - nw) / 2;
      break;
    case "n":
      nh = h0 - dy;
      nw = nh * r;
      nx = sx + (w0 - nw) / 2;
      ny = sy + h0 - nh;
      break;
    default:
      return applyResize(handle, start, dx, dy, minSide);
  }

  nw = Math.max(R, nw);
  nh = Math.max(R, nw / r);
  if (nh < R) {
    nh = R;
    nw = Math.max(R, nh * r);
  }
  nh = nw / r;
  nw = Math.max(R, nw);
  nh = Math.max(R, nh);

  // 角点拖拽：最小尺寸时保持对角锚点不动（与 applyResize 一致）
  switch (handle) {
    case "se":
      nx = sx;
      ny = sy;
      break;
    case "sw":
      nx = sx + w0 - nw;
      ny = sy;
      break;
    case "ne":
      nx = sx;
      ny = sy + h0 - nh;
      break;
    case "nw":
      nx = sx + w0 - nw;
      ny = sy + h0 - nh;
      break;
    case "e":
      ny = sy + (h0 - nh) / 2;
      break;
    case "w":
      nx = sx + w0 - nw;
      ny = sy + (h0 - nh) / 2;
      break;
    case "s":
      nx = sx + (w0 - nw) / 2;
      break;
    case "n":
      nx = sx + (w0 - nw) / 2;
      ny = sy + h0 - nh;
      break;
    default:
      break;
  }

  const clamped = clampRoomTopLeftToPlate(nx, ny, nw, nh, start.rotationDeg);
  return { ...start, nx: clamped.nx, ny: clamped.ny, nw, nh };
}

/** 缩放手柄：角点固定对角顶点；边手柄固定对边（达最小时不「推移」锚点） */
function applyResize(
  handle: ResizeHandle,
  start: RoomLayoutEntry,
  dx: number,
  dy: number,
  minSide: number = ROOM_RESIZE_MIN
): RoomLayoutEntry {
  const sx = start.nx;
  const sy = start.ny;
  const w0 = start.nw;
  const h0 = start.nh;
  const R = minSide;
  let nx = sx;
  let ny = sy;
  let nw = w0;
  let nh = h0;

  switch (handle) {
    case "se": {
      nw = Math.max(R, w0 + dx);
      nh = Math.max(R, h0 + dy);
      nx = sx;
      ny = sy;
      break;
    }
    case "sw": {
      nw = Math.max(R, w0 - dx);
      nh = Math.max(R, h0 + dy);
      nx = sx + w0 - nw;
      ny = sy;
      break;
    }
    case "ne": {
      nw = Math.max(R, w0 + dx);
      nh = Math.max(R, h0 - dy);
      nx = sx;
      ny = sy + h0 - nh;
      break;
    }
    case "nw": {
      nw = Math.max(R, w0 - dx);
      nh = Math.max(R, h0 - dy);
      nx = sx + w0 - nw;
      ny = sy + h0 - nh;
      break;
    }
    case "n": {
      nh = Math.max(R, h0 - dy);
      nx = sx;
      ny = sy + h0 - nh;
      break;
    }
    case "s": {
      nh = Math.max(R, h0 + dy);
      nx = sx;
      ny = sy;
      break;
    }
    case "e": {
      nw = Math.max(R, w0 + dx);
      nx = sx;
      ny = sy;
      break;
    }
    case "w": {
      nw = Math.max(R, w0 - dx);
      nx = sx + w0 - nw;
      ny = sy;
      break;
    }
    default:
      break;
  }

  const clamped = clampRoomTopLeftToPlate(nx, ny, nw, nh, start.rotationDeg);
  return { ...start, nx: clamped.nx, ny: clamped.ny, nw, nh };
}

function applyPointToDucts(
  ducts: DuctPlanPolyline[],
  polyId: string,
  index: number,
  nx: number,
  ny: number,
  snapGridStep: number,
  snap45: boolean
): DuctPlanPolyline[] | null {
  const next = cloneDucts(ducts);
  const pl = next.find((p) => p.id === polyId);
  if (!pl || !pl.points[index]) return null;
  let x = nx;
  let y = ny;
  if (snapGridStep > 0) {
    const s = snapGrid(x, y, snapGridStep);
    x = s.x;
    y = s.y;
  }
  if (snap45 && index > 0) {
    const prev = pl.points[index - 1]!;
    const snapped = snapAngle45({ x: prev.x, y: prev.y }, { x, y });
    x = snapped.x;
    y = snapped.y;
    if (snapGridStep > 0) {
      const s2 = snapGrid(x, y, snapGridStep);
      x = s2.x;
      y = s2.y;
    }
  }
  pl.points[index] = { ...pl.points[index]!, x, y };
  return next;
}

type CtxKind =
  | { kind: "room"; roomId: string; clientX: number; clientY: number }
  | { kind: "duct_vertex"; polyId: string; index: number; clientX: number; clientY: number }
  | { kind: "duct_poly"; polyId: string; clientX: number; clientY: number }
  | { kind: "widget"; widgetId: string; clientX: number; clientY: number }
  | { kind: "ac_zone"; zoneId: string; clientX: number; clientY: number }
  | { kind: "canvas"; clientX: number; clientY: number };

/** 供父级实现复制/剪切/删除（与右键菜单一致） */
export type SceneEditContextMenuHit = CtxKind;

function pickTargetToCtxMenuHit(t: ScenePickTarget, clientX: number, clientY: number): SceneEditContextMenuHit {
  switch (t.kind) {
    case "widget":
      return { kind: "widget", widgetId: t.widgetId, clientX, clientY };
    case "room":
      return { kind: "room", roomId: t.roomId, clientX, clientY };
    case "ac_zone":
      return { kind: "ac_zone", zoneId: t.zoneId, clientX, clientY };
    case "duct_vertex":
      return { kind: "duct_vertex", polyId: t.polyId, index: t.index, clientX, clientY };
    case "duct_poly":
      return { kind: "duct_poly", polyId: t.polyId, clientX, clientY };
  }
}

export function SceneEditSurface({
  canvasRef,
  /** 与 ductScene 同尺寸的编辑板列（图元/% 定位的包含块）；命中与 viewport+pan 解耦，避免链式 flex/3D 导致错位 */
  sceneBoardRef,
  roomsLayout,
  ducts,
  widgets,
  widgetStackLayers,
  widgetStackLayerUi,
  ductPixelWidth,
  ductPixelHeight,
  heightLiftPx,
  layerRows,
  selectedRoomId,
  selectedWidgetId,
  selectedDuctPolyId,
  selectedDuctPointIndex,
  onSelectRoom,
  onSelectWidget,
  onDuctSelectionChange,
  onRoomsChange,
  onDuctsChange,
  onWidgetsChange,
  roomSnapGrid,
  widgetSnapGrid,
  snapGridStep,
  snap45,
  onLayoutGestureStart,
  onLayoutGestureEnd,
  onDuctDiscreteUndoAnchor,
  onRoomRotateRequest,
  onClearRoomSelection,
  onDuctDeleteVertex,
  onDeleteWidget,
  onDeleteRoomById,
  onDuplicateRoomById,
  onDeleteDuctPolylineById,
  onDuplicateDuctPolylineById,
  onDuplicateWidgetById,
  acZones,
  onAcZonesChange,
  selectedAcZoneId,
  onSelectAcZone,
  shapeLibraryEnabled,
  onAddShapeFromCatalog,
  onRequestCopySelection,
  onRequestCutSelection,
  onRequestPaste,
  onRequestDeleteSelection,
  onRequestCopyHit,
  onRequestCutHit,
  onRequestDeleteHit,
  onWidgetMarqueeSelect,
  spacePanBlocksSurfaceRef,
  viewportPanScale,
  boardPlaneParams,
  sceneGrid,
}: {
  canvasRef: React.RefObject<HTMLElement | null>;
  sceneBoardRef: React.RefObject<HTMLElement | null>;
  /** 视口 pan+scale，与 DigitalTwinScreenPage WorldStack 一致；命中逆变换见 viewportPlaneTransform */
  viewportPanScale: TwinViewportPanScale;
  boardPlaneParams: TwinBoardPlaneParams;
  /** ductScene.grid，scene 像素空间下的房间区矩形 */
  sceneGrid: { x: number; y: number; w: number; h: number };
  roomsLayout: RoomLayoutEntry[];
  ducts: DuctPlanPolyline[];
  widgets: DtSceneWidget[];
  /** 图形子图层（自下而上）；与场景文档 widgetStackLayers 一致 */
  widgetStackLayers: readonly DtWidgetStackLayerRow[];
  widgetStackLayerUi?: Readonly<Record<string, DtWidgetStackLayerUi>>;
  ductPixelWidth: number;
  ductPixelHeight: number;
  heightLiftPx: number;
  layerRows: EditorLayerRow[];
  selectedRoomId: string | null;
  selectedWidgetId: string | null;
  selectedDuctPolyId: string | null;
  selectedDuctPointIndex: number | null;
  onSelectRoom: (id: string | null, opts?: { additive?: boolean }) => void;
  onSelectWidget: (id: string | null, opts?: { additive?: boolean }) => void;
  onDuctSelectionChange: (polyId: string | null, pointIndex: number | null, opts?: { additive?: boolean }) => void;
  onRoomsChange: (next: RoomLayoutEntry[]) => void;
  onDuctsChange: (next: DuctPlanPolyline[]) => void;
  onWidgetsChange: (next: DtSceneWidget[]) => void;
  roomSnapGrid: number;
  /** 图元 plate 吸附步长（0=不吸附）；与 roomSnapGrid 分离，避免横拖时 ny 被房间格点独立吸偏 */
  widgetSnapGrid: number;
  snapGridStep: number;
  snap45: boolean;
  onLayoutGestureStart?: () => void;
  onLayoutGestureEnd?: () => void;
  onDuctDiscreteUndoAnchor?: () => void;
  onRoomRotateRequest?: (roomId: string) => void;
  onClearRoomSelection?: () => void;
  onDuctDeleteVertex?: (polyId: string, index: number) => void;
  onDeleteWidget?: (widgetId: string) => void;
  onDeleteRoomById?: (roomId: string) => void;
  onDuplicateRoomById?: (roomId: string) => void;
  onDeleteDuctPolylineById?: (polyId: string) => void;
  onDuplicateDuctPolylineById?: (polyId: string) => void;
  onDuplicateWidgetById?: (widgetId: string) => void;
  acZones: DtAcZoneDoc[];
  onAcZonesChange: (next: DtAcZoneDoc[]) => void;
  selectedAcZoneId: string | null;
  onSelectAcZone: (id: string | null, opts?: { additive?: boolean }) => void;
  /** 编辑态：空白处右键显示内置图库 */
  shapeLibraryEnabled?: boolean;
  onAddShapeFromCatalog?: (itemId: string) => void;
  onRequestCopySelection?: () => void;
  onRequestCutSelection?: () => void;
  onRequestPaste?: () => void;
  onRequestDeleteSelection?: () => void;
  onRequestCopyHit?: (hit: SceneEditContextMenuHit) => void;
  onRequestCutHit?: (hit: SceneEditContextMenuHit) => void;
  onRequestDeleteHit?: (hit: SceneEditContextMenuHit) => void;
  /** 框选松手：仅合并选中态，禁止整表 load — post-save-no-full-refresh.mdc */
  onWidgetMarqueeSelect?: (widgetIds: string[], opts: { additive: boolean }) => void;
  /** 空格拖画布时跳过本层命中与框选，由外层 viewport 接管 */
  spacePanBlocksSurfaceRef?: MutableRefObject<boolean>;
}) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<ActiveDrag>({ kind: "none" });
  const roomsRef = useRef(roomsLayout);
  const ductsRef = useRef(ducts);
  const onRoomsChangeRef = useRef(onRoomsChange);
  const onDuctsChangeRef = useRef(onDuctsChange);
  const roomSnapGridRef = useRef(roomSnapGrid);
  const widgetSnapGridRef = useRef(widgetSnapGrid);
  const snapRef = useRef({ snapGridStep, snap45 });
  const onLayoutGestureStartRef = useRef(onLayoutGestureStart);
  const onLayoutGestureEndRef = useRef(onLayoutGestureEnd);
  const onDuctDiscreteUndoAnchorRef = useRef(onDuctDiscreteUndoAnchor);
  const onSelectRoomRef = useRef(onSelectRoom);
  const onDuctSelectionChangeRef = useRef(onDuctSelectionChange);
  const selectedRoomIdRef = useRef(selectedRoomId);
  const selectedWidgetIdRef = useRef(selectedWidgetId);
  const selectedDuctPolyIdRef = useRef(selectedDuctPolyId);
  const selectedDuctPointIndexRef = useRef(selectedDuctPointIndex);
  const widgetsRef = useRef(widgets);
  const widgetStackLayersRef = useRef(widgetStackLayers);
  const widgetStackLayerUiRef = useRef(widgetStackLayerUi);
  const onWidgetsChangeRef = useRef(onWidgetsChange);
  const onSelectWidgetRef = useRef(onSelectWidget);
  const pendingRoomsRef = useRef<RoomLayoutEntry[] | null>(null);
  const pendingWidgetsRef = useRef<DtSceneWidget[] | null>(null);
  const acZonesRef = useRef(acZones);
  const onAcZonesChangeRef = useRef(onAcZonesChange);
  const onSelectAcZoneRef = useRef(onSelectAcZone);
  const selectedAcZoneIdRef = useRef(selectedAcZoneId);
  const shapeLibraryEnabledRef = useRef(!!shapeLibraryEnabled);
  const onAddShapeFromCatalogRef = useRef(onAddShapeFromCatalog);
  const onRequestCopySelectionRef = useRef(onRequestCopySelection);
  const onRequestCutSelectionRef = useRef(onRequestCutSelection);
  const onRequestPasteRef = useRef(onRequestPaste);
  const onRequestDeleteSelectionRef = useRef(onRequestDeleteSelection);
  const onRequestCopyHitRef = useRef(onRequestCopyHit);
  const onRequestCutHitRef = useRef(onRequestCutHit);
  const onRequestDeleteHitRef = useRef(onRequestDeleteHit);
  const pendingAcRef = useRef<DtAcZoneDoc[] | null>(null);
  const rafIdRef = useRef(0);
  const rafWidgetRef = useRef(0);
  const rafAcRef = useRef(0);
  const lastSegClickRef = useRef<{ key: string; t: number } | null>(null);
  /** 风管线段「已消费」选中栈：与 dragRef=none 区分，避免误开框选 — 见 widget_edit 计划 */
  const ductSegmentConsumedRef = useRef(false);
  /** 与 isDtDebugWidgetMoveOn 配合：拖拽时 console 节流，避免刷屏 */
  const widgetMoveDebugLogAtRef = useRef(0);
  const onWidgetMarqueeSelectRef = useRef(onWidgetMarqueeSelect);
  const [marqueeRect, setMarqueeRect] = useState<{ nx: number; ny: number; nw: number; nh: number } | null>(null);
  const [ctxMenu, setCtxMenu] = useState<CtxKind | null>(null);
  const ctxMenuPortalRef = useRef<HTMLDivElement | null>(null);

  const viewportPanScaleRef = useRef(viewportPanScale);
  const boardPlaneParamsRef = useRef(boardPlaneParams);
  const sceneGridRef = useRef(sceneGrid);
  const ductSizeRef = useRef({ w: ductPixelWidth, h: ductPixelHeight });
  useLayoutEffect(() => {
    viewportPanScaleRef.current = viewportPanScale;
  }, [viewportPanScale]);
  useLayoutEffect(() => {
    boardPlaneParamsRef.current = boardPlaneParams;
  }, [boardPlaneParams]);
  useLayoutEffect(() => {
    sceneGridRef.current = sceneGrid;
  }, [sceneGrid]);
  useLayoutEffect(() => {
    ductSizeRef.current = { w: ductPixelWidth, h: ductPixelHeight };
  }, [ductPixelWidth, ductPixelHeight]);
  useLayoutEffect(() => {
    shapeLibraryEnabledRef.current = !!shapeLibraryEnabled;
  }, [shapeLibraryEnabled]);
  useLayoutEffect(() => {
    onAddShapeFromCatalogRef.current = onAddShapeFromCatalog;
  }, [onAddShapeFromCatalog]);
  useLayoutEffect(() => {
    onRequestCopySelectionRef.current = onRequestCopySelection;
  }, [onRequestCopySelection]);
  useLayoutEffect(() => {
    onRequestCutSelectionRef.current = onRequestCutSelection;
  }, [onRequestCutSelection]);
  useLayoutEffect(() => {
    onRequestPasteRef.current = onRequestPaste;
  }, [onRequestPaste]);
  useLayoutEffect(() => {
    onRequestDeleteSelectionRef.current = onRequestDeleteSelection;
  }, [onRequestDeleteSelection]);
  useLayoutEffect(() => {
    onRequestCopyHitRef.current = onRequestCopyHit;
  }, [onRequestCopyHit]);
  useLayoutEffect(() => {
    onRequestCutHitRef.current = onRequestCutHit;
  }, [onRequestCutHit]);
  useLayoutEffect(() => {
    onRequestDeleteHitRef.current = onRequestDeleteHit;
  }, [onRequestDeleteHit]);
  useLayoutEffect(() => {
    onWidgetMarqueeSelectRef.current = onWidgetMarqueeSelect;
  }, [onWidgetMarqueeSelect]);

  const pointerToSceneNorm = useCallback((clientX: number, clientY: number): { x: number; y: number } => {
    const { w, h } = ductSizeRef.current;
    const board = sceneBoardRef.current;
    const br = board?.getBoundingClientRect();
    if (
      br &&
      br.width >= 8 &&
      br.height >= 8 &&
      boardPlaneParamsRef.current.presentation !== "planTilt"
    ) {
      return clientToSceneNormFromAxisAlignedBoard(clientX, clientY, br, w, h);
    }
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const r = canvas.getBoundingClientRect();
    return clientToSceneNorm(clientX, clientY, r, viewportPanScaleRef.current, w, h, boardPlaneParamsRef.current);
  }, [canvasRef, sceneBoardRef]);

  const pointerToPlateNorm = useCallback((clientX: number, clientY: number): { x: number; y: number } => {
    const { w, h } = ductSizeRef.current;
    const board = sceneBoardRef.current;
    const br = board?.getBoundingClientRect();
    if (
      br &&
      br.width >= 8 &&
      br.height >= 8 &&
      boardPlaneParamsRef.current.presentation !== "planTilt"
    ) {
      return clientToPlateNormFromAxisAlignedBoard(clientX, clientY, br, w, h, sceneGridRef.current);
    }
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const r = canvas.getBoundingClientRect();
    return clientToPlateNorm(
      clientX,
      clientY,
      r,
      viewportPanScaleRef.current,
      w,
      h,
      boardPlaneParamsRef.current,
      sceneGridRef.current
    );
  }, [canvasRef, sceneBoardRef]);

  useLayoutEffect(() => {
    roomsRef.current = roomsLayout;
  }, [roomsLayout]);
  useLayoutEffect(() => {
    ductsRef.current = ducts;
  }, [ducts]);
  useLayoutEffect(() => {
    onRoomsChangeRef.current = onRoomsChange;
  }, [onRoomsChange]);
  useLayoutEffect(() => {
    onDuctsChangeRef.current = onDuctsChange;
  }, [onDuctsChange]);
  useLayoutEffect(() => {
    roomSnapGridRef.current = roomSnapGrid;
  }, [roomSnapGrid]);
  useLayoutEffect(() => {
    widgetSnapGridRef.current = widgetSnapGrid;
  }, [widgetSnapGrid]);
  useLayoutEffect(() => {
    snapRef.current = { snapGridStep, snap45 };
  }, [snapGridStep, snap45]);
  useLayoutEffect(() => {
    onLayoutGestureStartRef.current = onLayoutGestureStart;
  }, [onLayoutGestureStart]);
  useLayoutEffect(() => {
    onLayoutGestureEndRef.current = onLayoutGestureEnd;
  }, [onLayoutGestureEnd]);
  useLayoutEffect(() => {
    onDuctDiscreteUndoAnchorRef.current = onDuctDiscreteUndoAnchor;
  }, [onDuctDiscreteUndoAnchor]);
  useLayoutEffect(() => {
    onSelectRoomRef.current = onSelectRoom;
  }, [onSelectRoom]);
  useLayoutEffect(() => {
    onDuctSelectionChangeRef.current = onDuctSelectionChange;
  }, [onDuctSelectionChange]);
  useLayoutEffect(() => {
    selectedRoomIdRef.current = selectedRoomId;
  }, [selectedRoomId]);
  useLayoutEffect(() => {
    selectedWidgetIdRef.current = selectedWidgetId;
  }, [selectedWidgetId]);
  useLayoutEffect(() => {
    selectedDuctPolyIdRef.current = selectedDuctPolyId;
  }, [selectedDuctPolyId]);
  useLayoutEffect(() => {
    selectedDuctPointIndexRef.current = selectedDuctPointIndex;
  }, [selectedDuctPointIndex]);
  useLayoutEffect(() => {
    widgetsRef.current = widgets;
  }, [widgets]);
  useLayoutEffect(() => {
    widgetStackLayersRef.current = widgetStackLayers;
  }, [widgetStackLayers]);
  useLayoutEffect(() => {
    widgetStackLayerUiRef.current = widgetStackLayerUi;
  }, [widgetStackLayerUi]);
  useLayoutEffect(() => {
    onWidgetsChangeRef.current = onWidgetsChange;
  }, [onWidgetsChange]);
  useLayoutEffect(() => {
    onSelectWidgetRef.current = onSelectWidget;
  }, [onSelectWidget]);
  useLayoutEffect(() => {
    acZonesRef.current = acZones;
  }, [acZones]);
  useLayoutEffect(() => {
    onAcZonesChangeRef.current = onAcZonesChange;
  }, [onAcZonesChange]);
  useLayoutEffect(() => {
    onSelectAcZoneRef.current = onSelectAcZone;
  }, [onSelectAcZone]);
  useLayoutEffect(() => {
    selectedAcZoneIdRef.current = selectedAcZoneId;
  }, [selectedAcZoneId]);

  const flushPendingRooms = useCallback(() => {
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = 0;
    }
    const v = pendingRoomsRef.current;
    pendingRoomsRef.current = null;
    if (v) {
      // 保存后仅合并 rooms，禁止整表 load — post-save-no-full-refresh.mdc
      onRoomsChangeRef.current(v);
    }
  }, []);

  const scheduleRoomsCommit = useCallback((next: RoomLayoutEntry[]) => {
    pendingRoomsRef.current = next;
    if (rafIdRef.current) return;
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = 0;
      const v = pendingRoomsRef.current;
      pendingRoomsRef.current = null;
      if (v) onRoomsChangeRef.current(v);
    });
  }, []);

  const flushPendingWidgets = useCallback(() => {
    if (rafWidgetRef.current) {
      cancelAnimationFrame(rafWidgetRef.current);
      rafWidgetRef.current = 0;
    }
    const v = pendingWidgetsRef.current;
    pendingWidgetsRef.current = null;
    if (v) {
      // 保存后仅合并 widgets，禁止整表 load — post-save-no-full-refresh.mdc
      onWidgetsChangeRef.current(v);
    }
  }, []);

  const scheduleWidgetsCommit = useCallback((next: DtSceneWidget[]) => {
    pendingWidgetsRef.current = next;
    if (rafWidgetRef.current) return;
    rafWidgetRef.current = requestAnimationFrame(() => {
      rafWidgetRef.current = 0;
      const v = pendingWidgetsRef.current;
      pendingWidgetsRef.current = null;
      if (v) onWidgetsChangeRef.current(v);
    });
  }, []);

  const flushPendingAc = useCallback(() => {
    if (rafAcRef.current) {
      cancelAnimationFrame(rafAcRef.current);
      rafAcRef.current = 0;
    }
    const v = pendingAcRef.current;
    pendingAcRef.current = null;
    if (v) {
      // 保存后仅合并 acZones，禁止整表 load — post-save-no-full-refresh.mdc
      onAcZonesChangeRef.current(v);
    }
  }, []);

  const scheduleAcCommit = useCallback((next: DtAcZoneDoc[]) => {
    pendingAcRef.current = next;
    if (rafAcRef.current) return;
    rafAcRef.current = requestAnimationFrame(() => {
      rafAcRef.current = 0;
      const v = pendingAcRef.current;
      pendingAcRef.current = null;
      if (v) onAcZonesChangeRef.current(v);
    });
  }, []);

  const applyAcMoveOrResize = useCallback(
    (e: PointerEvent) => {
      const d = dragRef.current;
      const canvas = canvasRef.current;
      if (!canvas || (d.kind !== "ac_move" && d.kind !== "ac_resize")) return;
      const cur = pointerToSceneNorm(e.clientX, e.clientY);
      let dx = cur.x - d.startPointerNorm.x;
      let dy = cur.y - d.startPointerNorm.y;
      if (e.shiftKey && d.kind === "ac_move") {
        if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      const next = cloneAcZones(d.snapshotAc);
      const idx = next.findIndex((z) => z.id === d.zoneId);
      if (idx < 0) return;
      const curZ = next[idx]!;
      if (d.kind === "ac_move") {
        const nx = clamp01(d.start.nx + dx);
        const ny = clamp01(d.start.ny + dy);
        next[idx] = clampAcZoneDoc({ ...curZ, nx, ny, nw: d.start.nw, nh: d.start.nh });
      } else {
        // 缩放：Shift 等比；非 Shift 自由变形
        const geom = e.shiftKey
          ? applyResizeProportional(d.handle, acZoneAsRoomEntry(d.start), dx, dy)
          : applyResize(d.handle, acZoneAsRoomEntry(d.start), dx, dy);
        next[idx] = clampAcZoneDoc({
          ...curZ,
          nx: geom.nx,
          ny: geom.ny,
          nw: geom.nw,
          nh: geom.nh,
        });
      }
      scheduleAcCommit(next);
    },
    [canvasRef, pointerToSceneNorm, scheduleAcCommit]
  );

  const applyWidgetMoveOrResize = useCallback(
    (e: PointerEvent) => {
      const d = dragRef.current;
      const board = sceneBoardRef.current;
      if (!board || (d.kind !== "widget_move" && d.kind !== "widget_resize")) return;
      const cur = pointerToPlateNorm(e.clientX, e.clientY);
      let dx = cur.x - d.startPointerNorm.x;
      let dy = cur.y - d.startPointerNorm.y;
      if (e.shiftKey && d.kind === "widget_move") {
        if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      const snap = widgetSnapGridRef.current;
      const next = cloneWidgets(d.snapshotWidgets);
      const idx = next.findIndex((w) => w.id === d.widgetId);
      if (idx < 0) return;
      const curW = next[idx]!;
      /** 调试用：图元移动 raw→snap→clamp（snap 来自 widgetSnapGrid，与房间 roomSnapGrid 独立） */
      let widgetMoveDebugSnap: {
        rawNx: number;
        rawNy: number;
        snapNx: number;
        snapNy: number;
        snapStep: number;
      } | null = null;
      if (d.kind === "widget_move") {
        let nx = d.start.nx + dx;
        let ny = d.start.ny + dy;
        const rawNx = nx;
        const rawNy = ny;
        if (snap > 0) {
          const s = snapGrid(nx, ny, snap);
          nx = s.x;
          ny = s.y;
        }
        const snapNx = nx;
        const snapNy = ny;
        widgetMoveDebugSnap = { rawNx, rawNy, snapNx, snapNy, snapStep: snap };
        const c = clampRoomTopLeftToPlate(nx, ny, d.start.nw, d.start.nh, 0);
        next[idx] = { ...curW, nx: c.nx, ny: c.ny };
      } else {
        // 图元缩放：Shift 等比锁定宽高比（与房间 resize 一致）
        const geom = e.shiftKey
          ? applyResizeProportional(d.handle, widgetGeom(d.start), dx, dy, DT_WIDGET_PLATE_MIN)
          : applyResize(d.handle, widgetGeom(d.start), dx, dy, DT_WIDGET_PLATE_MIN);
        next[idx] = { ...curW, nx: geom.nx, ny: geom.ny, nw: geom.nw, nh: geom.nh };
      }
      if (isDtDebugWidgetMoveOn()) {
        const now = performance.now();
        if (now - widgetMoveDebugLogAtRef.current >= 64) {
          widgetMoveDebugLogAtRef.current = now;
          const br = board.getBoundingClientRect();
          const applied = next[idx]!;
          const g = sceneGridRef.current;
          const dq = ductSizeRef.current;
          const sc = viewportPanScaleRef.current.scale > 1e-6 ? viewportPanScaleRef.current.scale : 1;
          const expBrW = dq.w * sc;
          const expBrH = dq.h * sc;
          const fx = (n: number, p: number) => (Number.isFinite(n) ? n.toFixed(p) : String(n));
          const ddx = cur.x - d.startPointerNorm.x;
          const ddy = cur.y - d.startPointerNorm.y;
          const snapPart =
            d.kind === "widget_move" && widgetMoveDebugSnap
              ? ` raw(${fx(widgetMoveDebugSnap.rawNx, 5)},${fx(widgetMoveDebugSnap.rawNy, 5)})→snap(${fx(widgetMoveDebugSnap.snapNx, 5)},${fx(widgetMoveDebugSnap.snapNy, 5)}) step=${fx(widgetMoveDebugSnap.snapStep, 5)}`
              : "";
          /** 单行打印数值，避免 DevTools 把嵌套对象收成 {…} 不便扫一眼 */
          console.log(
            `[Dt][widgetDrag] ${d.kind} ${d.widgetId} ` +
              `client(${fx(e.clientX, 1)},${fx(e.clientY, 1)}) ` +
              `plate(${fx(cur.x, 5)},${fx(cur.y, 5)}) dNorm(${fx(ddx, 5)},${fx(ddy, 5)}) ` +
              `start(${fx(d.start.nx, 5)},${fx(d.start.ny, 5)},${fx(d.start.nw, 5)},${fx(d.start.nh, 5)}) ` +
              `applied(${fx(applied.nx, 5)},${fx(applied.ny, 5)},${fx(applied.nw, 5)},${fx(applied.nh, 5)})${snapPart} ` +
              `boardCss(${fx(br.left, 1)},${fx(br.top, 1)},${fx(br.width, 1)}×${fx(br.height, 1)}) ` +
              `grid(${fx(g.x, 1)},${fx(g.y, 1)},${fx(g.w, 1)}×${fx(g.h, 1)}) ductPx=${fx(dq.w, 1)}×${fx(dq.h, 1)} ` +
              `scale=${fx(sc, 4)} d(br−duct×s)=(${fx(br.width - expBrW, 3)},${fx(br.height - expBrH, 3)})`
          );
        }
      }
      scheduleWidgetsCommit(next);
    },
    [pointerToPlateNorm, scheduleWidgetsCommit, sceneBoardRef]
  );

  const applyMoveOrResize = useCallback((e: PointerEvent) => {
    const d = dragRef.current;
    const canvas = canvasRef.current;
    if (!canvas || (d.kind !== "move" && d.kind !== "resize")) return;
    const cur = pointerToPlateNorm(e.clientX, e.clientY);
    let dx = cur.x - d.startPointerNorm.x;
    let dy = cur.y - d.startPointerNorm.y;
    if (e.shiftKey && d.kind === "move") {
      if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
      else dx = 0;
    }
    const snap = roomSnapGridRef.current;
    const next = cloneRooms(d.snapshotRooms);
    const idx = next.findIndex((r) => r.roomId === d.roomId);
    if (idx < 0) return;

    if (d.kind === "move") {
      let nx = d.startRect.nx + dx;
      let ny = d.startRect.ny + dy;
      if (snap > 0) {
        const s = snapGrid(nx, ny, snap);
        nx = s.x;
        ny = s.y;
      }
      const c = clampRoomTopLeftToPlate(nx, ny, d.startRect.nw, d.startRect.nh, d.startRect.rotationDeg);
      next[idx] = { ...d.startRect, nx: c.nx, ny: c.ny };
    } else {
      next[idx] = e.shiftKey
        ? applyResizeProportional(d.handle, d.startRect, dx, dy)
        : applyResize(d.handle, d.startRect, dx, dy);
    }
    scheduleRoomsCommit(next);
  }, [canvasRef, pointerToPlateNorm, scheduleRoomsCommit]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (d.kind === "marquee") {
        const cur = pointerToPlateNorm(e.clientX, e.clientY);
        d.endPointerNorm = cur;
        setMarqueeRect(normRectFromCorners(d.startPointerNorm, d.endPointerNorm));
        return;
      }
      if (d.kind === "duct_vertex") {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const { x, y } = pointerToSceneNorm(e.clientX, e.clientY);
        const prev = ductsRef.current;
        const { snapGridStep: sg, snap45: s45 } = snapRef.current;
        const next = applyPointToDucts(prev, d.polyId, d.index, x, y, sg, s45);
        if (!next) return;
        onDuctsChangeRef.current(next);
        return;
      }
      if (d.kind === "ac_move" || d.kind === "ac_resize") {
        applyAcMoveOrResize(e);
        return;
      }
      if (d.kind === "widget_move" || d.kind === "widget_resize") {
        applyWidgetMoveOrResize(e);
        return;
      }
      applyMoveOrResize(e);
    };
    const onUp = () => {
      const d0 = dragRef.current;
      if (d0.kind === "marquee") {
        const box = normRectFromCorners(d0.startPointerNorm, d0.endPointerNorm);
        const MIN = 0.004;
        const isClick = box.nw < MIN && box.nh < MIN;
        if (isClick && !d0.additive) {
          // 空白点击取消选中：仅清选中态，禁止整表 load — post-save-no-full-refresh.mdc
          onSelectWidgetRef.current(null);
          onSelectRoomRef.current(null);
          onSelectAcZoneRef.current(null);
          onDuctSelectionChangeRef.current(null, null);
        } else if (box.nw >= MIN && box.nh >= MIN) {
          const ids = widgetIdsInMarqueeOverlap(
            widgetsRef.current,
            box,
            widgetStackLayersRef.current,
            widgetStackLayerUiRef.current
          );
          // 框选松手：仅合并选中态，禁止整表 load — post-save-no-full-refresh.mdc
          if (ids.length > 0) onWidgetMarqueeSelectRef.current?.(ids, { additive: d0.additive });
          else if (!d0.additive) {
            onSelectWidgetRef.current(null);
            onSelectRoomRef.current(null);
            onSelectAcZoneRef.current(null);
            onDuctSelectionChangeRef.current(null, null);
          }
        }
        setMarqueeRect(null);
        dragRef.current = { kind: "none" };
        return;
      }
      const kind = dragRef.current.kind;
      if (kind === "move" || kind === "resize") {
        flushPendingRooms();
      }
      if (kind === "widget_move" || kind === "widget_resize") {
        flushPendingWidgets();
      }
      if (kind === "ac_move" || kind === "ac_resize") {
        flushPendingAc();
      }
      const had = kind !== "none";
      dragRef.current = { kind: "none" };
      if (had) window.setTimeout(() => onLayoutGestureEndRef.current?.(), 0);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [
    applyAcMoveOrResize,
    applyMoveOrResize,
    applyWidgetMoveOrResize,
    flushPendingAc,
    flushPendingRooms,
    flushPendingWidgets,
    pointerToPlateNorm,
    pointerToSceneNorm,
  ]);

  const tryHitRooms = useCallback(
    (clientX: number, clientY: number, multiSelectShift: boolean | undefined, layerLocked: boolean): ActiveDrag | null => {
      const p = pointerToPlateNorm(clientX, clientY);
      const g = sceneGridRef.current;
      const thrPlate = 14 / Math.max(g.w, g.h, 1e-6);
      const selId = selectedRoomIdRef.current;
      if (selId) {
        const entry = roomsRef.current.find((r) => r.roomId === selId);
        if (entry) {
          const h = hitRoomResizeHandleNorm(p.x, p.y, entry, thrPlate);
          if (h) {
            onSelectAcZoneRef.current(null);
            onSelectWidgetRef.current(null);
            onDuctSelectionChangeRef.current(null, null);
            onSelectRoomRef.current(selId);
            if (layerLocked) return null;
            onLayoutGestureStartRef.current?.();
            return {
              kind: "resize",
              roomId: selId,
              handle: h,
              startPointerNorm: p,
              startRect: { ...entry },
              snapshotRooms: cloneRooms(roomsRef.current),
            };
          }
        }
      }
      for (let i = roomsRef.current.length - 1; i >= 0; i--) {
        const layout = roomsRef.current[i]!;
        if (!pointInRotatedRoom(p.x, p.y, layout)) continue;
        if (!multiSelectShift) {
          onSelectAcZoneRef.current(null);
          onSelectWidgetRef.current(null);
          onDuctSelectionChangeRef.current(null, null);
        }
        onSelectRoomRef.current(layout.roomId, multiSelectShift ? { additive: true } : undefined);
        if (layerLocked) return null;
        onLayoutGestureStartRef.current?.();
        return {
          kind: "move",
          roomId: layout.roomId,
          startPointerNorm: p,
          startRect: { ...layout },
          snapshotRooms: cloneRooms(roomsRef.current),
        };
      }
      return null;
    },
    [pointerToPlateNorm]
  );

  type DuctHitOutcome =
    | { outcome: "vertex_drag"; polyId: string; index: number }
    | { outcome: "consumed" }
    | null;

  const tryHitDucts = useCallback(
    (clientX: number, clientY: number, multiSelectShift: boolean | undefined, layerLocked: boolean): DuctHitOutcome => {
      const n = pointerToSceneNorm(clientX, clientY);
      const { x, y } = n;
      const pixX = n.x * ductPixelWidth;
      const pixY = n.y * ductPixelHeight;
      const w = ductPixelWidth;
      const h = ductPixelHeight;
      const plateP = pointerToPlateNorm(clientX, clientY);
      const hitV = hitDuctVertex(pixX, pixY, ductsRef.current, w, h, heightLiftPx, 12);
      if (hitV) {
        if (
          isPlateNormInsideAnyWidget(
            plateP,
            widgetsRef.current,
            widgetStackLayersRef.current,
            widgetStackLayerUiRef.current
          )
        ) {
          lastSegClickRef.current = null;
          onDuctSelectionChangeRef.current(null, null);
          return null;
        }
        onSelectAcZoneRef.current(null);
        onSelectWidgetRef.current(null);
        onSelectRoomRef.current(null);
        onDuctSelectionChangeRef.current(hitV.polyId, hitV.index);
        if (layerLocked) {
          ductSegmentConsumedRef.current = true;
          return { outcome: "consumed" };
        }
        onLayoutGestureStartRef.current?.();
        return { outcome: "vertex_drag", polyId: hitV.polyId, index: hitV.index };
      }
      const best = bestDuctSegmentHit(x, y, ductsRef.current);
      const segThr = 0.022;
      if (
        best &&
        best.dist < segThr &&
        !isPlateNormInsideAnyWidget(
          plateP,
          widgetsRef.current,
          widgetStackLayersRef.current,
          widgetStackLayerUiRef.current
        )
      ) {
        const key = `${best.polyId}:${best.seg}`;
        const now = Date.now();
        const prev = lastSegClickRef.current;
        if (prev && prev.key === key && now - prev.t < 420) {
          if (layerLocked) {
            lastSegClickRef.current = null;
            ductSegmentConsumedRef.current = true;
            return { outcome: "consumed" };
          }
          onSelectAcZoneRef.current(null);
          onSelectWidgetRef.current(null);
          onSelectRoomRef.current(null);
          onDuctDiscreteUndoAnchorRef.current?.();
          const next = cloneDucts(ductsRef.current);
          const pl = next.find((p) => p.id === best.polyId);
          if (pl && pl.points.length < 64) {
            let ins = snapGrid(best.proj.x, best.proj.y, snapGridStep);
            if (snap45 && best.seg >= 0) {
              const prevPt = pl.points[best.seg]!;
              ins = snapAngle45({ x: prevPt.x, y: prevPt.y }, ins);
              if (snapGridStep > 0) ins = snapGrid(ins.x, ins.y, snapGridStep);
            }
            const np: DuctPlanPoint = { id: newPointId(), x: ins.x, y: ins.y, h: 0 };
            pl.points.splice(best.seg + 1, 0, np);
            onDuctsChangeRef.current(next);
            onDuctSelectionChangeRef.current(best.polyId, best.seg + 1);
          }
          lastSegClickRef.current = null;
        } else {
          lastSegClickRef.current = { key, t: now };
          if (!multiSelectShift) {
            onSelectAcZoneRef.current(null);
            onSelectWidgetRef.current(null);
            onSelectRoomRef.current(null);
          }
          onDuctSelectionChangeRef.current(
            best.polyId,
            null,
            multiSelectShift ? { additive: true } : undefined
          );
        }
        ductSegmentConsumedRef.current = true;
        return { outcome: "consumed" };
      }
      lastSegClickRef.current = null;
      onDuctSelectionChangeRef.current(null, null);
      return null;
    },
    [ductPixelHeight, ductPixelWidth, heightLiftPx, pointerToPlateNorm, pointerToSceneNorm, snap45, snapGridStep]
  );

  const tryHitWidgetsSubList = useCallback(
    (
      clientX: number,
      clientY: number,
      multiSelectShift: boolean | undefined,
      slabLocked: boolean,
      subset: DtSceneWidget[]
    ): ActiveDrag | null => {
      const p = pointerToPlateNorm(clientX, clientY);
      const g = sceneGridRef.current;
      const dim = Math.max(g.w, g.h, 1e-6);
      /** 略放大角/边手柄命中区（plate 归一化），减轻与视觉手柄的「对不齐」感 */
      const thrW = Math.max(26 / dim, 0.014);
      const fullList = widgetsRef.current;
      const selWid = selectedWidgetIdRef.current;
      if (selWid) {
        const w = fullList.find((x) => x.id === selWid);
        if (w) {
          const lid = effectiveWidgetStackLayerId(w, normalizedStackLayers(widgetStackLayersRef.current));
          if (!widgetStackLayerUiRef.current?.[lid]?.locked) {
            const h = hitRoomResizeHandleNorm(p.x, p.y, widgetGeom(w), thrW);
            if (h) {
              onSelectAcZoneRef.current(null);
              onSelectRoomRef.current(null);
              onDuctSelectionChangeRef.current(null, null);
              onSelectWidgetRef.current(selWid);
              if (slabLocked) return null;
              onLayoutGestureStartRef.current?.();
              if (isDtDebugWidgetMoveOn()) {
                dtLogWidgetPickVsGeometry(
                  clientX,
                  clientY,
                  p,
                  w,
                  sceneBoardRef.current,
                  ductSizeRef.current,
                  sceneGridRef.current
                );
              }
              return {
                kind: "widget_resize",
                widgetId: w.id,
                handle: h,
                startPointerNorm: p,
                start: { ...w },
                snapshotWidgets: cloneWidgets(fullList),
              };
            }
          }
        }
      }
      for (let i = subset.length - 1; i >= 0; i--) {
        const w = subset[i]!;
        const geom = widgetGeom(w);
        if (!pointInRotatedRoom(p.x, p.y, geom)) continue;
        if (!multiSelectShift) {
          onSelectAcZoneRef.current(null);
          onSelectRoomRef.current(null);
          onDuctSelectionChangeRef.current(null, null);
        }
        onSelectWidgetRef.current(w.id, multiSelectShift ? { additive: true } : undefined);
        if (slabLocked) return null;
        onLayoutGestureStartRef.current?.();
        if (isDtDebugWidgetMoveOn()) {
          dtLogWidgetPickVsGeometry(clientX, clientY, p, w, sceneBoardRef.current, ductSizeRef.current, sceneGridRef.current);
        }
        return {
          kind: "widget_move",
          widgetId: w.id,
          startPointerNorm: p,
          start: { ...w },
          snapshotWidgets: cloneWidgets(fullList),
        };
      }
      return null;
    },
    [pointerToPlateNorm, sceneBoardRef]
  );

  const tryHitAcZones = useCallback(
    (clientX: number, clientY: number, multiSelectShift: boolean | undefined, layerLocked: boolean): ActiveDrag | null => {
      const p = pointerToSceneNorm(clientX, clientY);
      const thrScene = 14 / Math.max(ductPixelWidth, ductPixelHeight, 1e-6);
      const list = acZonesRef.current;
      const selId = selectedAcZoneIdRef.current;
      if (selId) {
        const z = list.find((x) => x.id === selId);
        if (z) {
          const h = hitRoomResizeHandleNorm(p.x, p.y, acZoneAsRoomEntry(z), thrScene);
          if (h) {
            onSelectRoomRef.current(null);
            onSelectWidgetRef.current(null);
            onDuctSelectionChangeRef.current(null, null);
            onSelectAcZoneRef.current(selId);
            if (layerLocked) return null;
            onLayoutGestureStartRef.current?.();
            return {
              kind: "ac_resize",
              zoneId: selId,
              handle: h,
              startPointerNorm: p,
              start: { ...z },
              snapshotAc: cloneAcZones(list),
            };
          }
        }
      }
      for (let i = list.length - 1; i >= 0; i--) {
        const z = list[i]!;
        if (!pointInRotatedRoom(p.x, p.y, acZoneAsRoomEntry(z))) continue;
        if (!multiSelectShift) {
          onSelectRoomRef.current(null);
          onSelectWidgetRef.current(null);
          onDuctSelectionChangeRef.current(null, null);
        }
        onSelectAcZoneRef.current(z.id, multiSelectShift ? { additive: true } : undefined);
        if (layerLocked) return null;
        onLayoutGestureStartRef.current?.();
        return {
          kind: "ac_move",
          zoneId: z.id,
          startPointerNorm: p,
          start: { ...z },
          snapshotAc: cloneAcZones(list),
        };
      }
      return null;
    },
    [ductPixelHeight, ductPixelWidth, pointerToSceneNorm]
  );

  const runHitStack = useCallback(
    (clientX: number, clientY: number, multiSelectShift?: boolean): void => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      {
        const subset = widgetsEditablePaintOrder(
          widgetsRef.current,
          widgetStackLayersRef.current,
          widgetStackLayerUiRef.current
        );
        const w = tryHitWidgetsSubList(clientX, clientY, multiSelectShift, false, subset);
        if (w) {
          dragRef.current = w;
          return;
        }
      }
      for (const row of layerRows) {
        if (row.id === "widgets") continue;
        const locked = false;
        if (row.id === "rooms") {
          const r = tryHitRooms(clientX, clientY, multiSelectShift, locked);
          if (r) {
            dragRef.current = r;
            return;
          }
        } else if (row.id === "ducts") {
          const d = tryHitDucts(clientX, clientY, multiSelectShift, locked);
          if (d?.outcome === "vertex_drag") {
            dragRef.current = { kind: "duct_vertex", polyId: d.polyId, index: d.index };
            return;
          }
          if (d?.outcome === "consumed") return;
        } else if (row.id === "ac") {
          const a = tryHitAcZones(clientX, clientY, multiSelectShift, locked);
          if (a) {
            dragRef.current = a;
            return;
          }
        }
      }
    },
    [layerRows, tryHitAcZones, tryHitDucts, tryHitRooms, tryHitWidgetsSubList]
  );

  /** Alt+穿透：仅切换选中目标，不发起拖拽（与单图层堆叠命中一致，见 sceneEditPickStack） */
  const applyPickTarget = useCallback((t: ScenePickTarget) => {
    switch (t.kind) {
      case "widget":
        onSelectWidgetRef.current(t.widgetId);
        break;
      case "room":
        onSelectRoomRef.current(t.roomId);
        break;
      case "ac_zone":
        onSelectAcZoneRef.current(t.zoneId);
        break;
      case "duct_vertex":
        onDuctSelectionChangeRef.current(t.polyId, t.index);
        break;
      case "duct_poly":
        onDuctSelectionChangeRef.current(t.polyId, null);
        break;
    }
  }, []);

  const tryAltPickCycle = useCallback(
    (clientX: number, clientY: number): boolean => {
      const stack = buildScenePickStack({
        plateNorm: pointerToPlateNorm(clientX, clientY),
        sceneNorm: pointerToSceneNorm(clientX, clientY),
        ductPixelWidth: ductSizeRef.current.w,
        ductPixelHeight: ductSizeRef.current.h,
        heightLiftPx,
        rooms: roomsRef.current,
        widgets: widgetsRef.current,
        widgetStackLayers: widgetStackLayersRef.current,
        widgetStackLayerUi: widgetStackLayerUiRef.current,
        acZones: acZonesRef.current,
        ducts: ductsRef.current,
      });
      if (stack.length === 0) return false;
      const sel: PickSelectionSnapshot = {
        selectedWidgetId: selectedWidgetIdRef.current,
        selectedRoomId: selectedRoomIdRef.current,
        selectedAcZoneId: selectedAcZoneIdRef.current,
        selectedDuctPolyId: selectedDuctPolyIdRef.current,
        selectedDuctPointIndex: selectedDuctPointIndexRef.current,
      };
      const idx = pickStackIndexOfCurrent(stack, sel);
      const next = stack[(idx + 1) % stack.length]!;
      applyPickTarget(next);
      return true;
    },
    [applyPickTarget, heightLiftPx, pointerToPlateNorm, pointerToSceneNorm]
  );

  /** 右键命中：与 buildScenePickStack 顶元素一致 */
  const hitForContextMenu = useCallback(
    (clientX: number, clientY: number): CtxKind | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const stack = buildScenePickStack({
        plateNorm: pointerToPlateNorm(clientX, clientY),
        sceneNorm: pointerToSceneNorm(clientX, clientY),
        ductPixelWidth: ductSizeRef.current.w,
        ductPixelHeight: ductSizeRef.current.h,
        heightLiftPx,
        rooms: roomsRef.current,
        widgets: widgetsRef.current,
        widgetStackLayers: widgetStackLayersRef.current,
        widgetStackLayerUi: widgetStackLayerUiRef.current,
        acZones: acZonesRef.current,
        ducts: ductsRef.current,
      });
      const top = stack[0];
      if (top) return pickTargetToCtxMenuHit(top, clientX, clientY);
      if (shapeLibraryEnabledRef.current) {
        return { kind: "canvas", clientX, clientY };
      }
      return null;
    },
    [heightLiftPx, pointerToPlateNorm, pointerToSceneNorm]
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      setCtxMenu(null);
      if (e.button !== 0) return;
      if (spacePanBlocksSurfaceRef?.current) return;
      const el = surfaceRef.current;
      if (!el) return;
      e.preventDefault();
      if (e.altKey && !e.shiftKey && tryAltPickCycle(e.clientX, e.clientY)) {
        return;
      }
      el.setPointerCapture(e.pointerId);
      ductSegmentConsumedRef.current = false;
      dragRef.current = { kind: "none" };
      runHitStack(e.clientX, e.clientY, e.shiftKey);
      if (dragRef.current.kind === "none" && !ductSegmentConsumedRef.current) {
        const p = pointerToPlateNorm(e.clientX, e.clientY);
        dragRef.current = { kind: "marquee", startPointerNorm: p, endPointerNorm: p, additive: e.shiftKey };
        setMarqueeRect(normRectFromCorners(p, p));
      }
    },
    [pointerToPlateNorm, runHitStack, spacePanBlocksSurfaceRef, tryAltPickCycle]
  );

  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const hit = hitForContextMenu(e.clientX, e.clientY);
      if (hit) setCtxMenu(hit);
      else setCtxMenu(null);
    },
    [hitForContextMenu]
  );

  useEffect(() => {
    const onScrollClose = (ev: Event) => {
      const t = ev.target;
      if (t instanceof Node && ctxMenuPortalRef.current?.contains(t)) return;
      setCtxMenu(null);
    };
    const onBlurClose = () => setCtxMenu(null);
    window.addEventListener("scroll", onScrollClose, true);
    window.addEventListener("blur", onBlurClose);
    return () => {
      window.removeEventListener("scroll", onScrollClose, true);
      window.removeEventListener("blur", onBlurClose);
    };
  }, []);

  useLayoutEffect(() => {
    if (!ctxMenu) return;
    const el = ctxMenuPortalRef.current;
    if (!el) return;
    const pad = 8;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let left = ctxMenu.clientX;
    let top = ctxMenu.clientY;
    if (w > 0 && h > 0) {
      if (left + w + pad > window.innerWidth) left = window.innerWidth - w - pad;
      if (top + h + pad > window.innerHeight) top = window.innerHeight - h - pad;
      left = Math.max(pad, left);
      top = Math.max(pad, top);
    }
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }, [ctxMenu]);

  useEffect(() => {
    if (!ctxMenu) return;
    const onDown = (ev: PointerEvent) => {
      const t = ev.target as Node | null;
      if (t && ctxMenuPortalRef.current?.contains(t)) return;
      setCtxMenu(null);
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [ctxMenu]);

  const menuShellClass =
    "dt-ctx-menu-scroll pointer-events-auto max-h-[min(78vh,560px)] min-w-[11rem] max-w-[16rem] overflow-y-auto overscroll-contain rounded-md border border-slate-600/70 bg-slate-950/98 py-1 text-[11px] text-slate-100 shadow-xl backdrop-blur-sm";

  return (
    <>
      {marqueeRect ? (
        <div
          className="pointer-events-none absolute z-[8] border border-cyan-400/70 bg-cyan-400/10"
          style={plateNormRectToScenePercentStyle(
            marqueeRect.nx,
            marqueeRect.ny,
            marqueeRect.nw,
            marqueeRect.nh,
            sceneGrid,
            ductPixelWidth,
            ductPixelHeight
          )}
        />
      ) : null}
      <div
        ref={surfaceRef}
        role="application"
        aria-label="场景编辑命中层"
        className="absolute inset-0 z-[10] touch-none"
        style={{ pointerEvents: "auto" }}
        onPointerDown={onPointerDown}
        onContextMenu={onContextMenu}
      />
      {ctxMenu && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={ctxMenuPortalRef}
              role="menu"
              className={menuShellClass}
              style={{
                position: "fixed",
                left: ctxMenu.clientX,
                top: ctxMenu.clientY,
                zIndex: 100000,
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onWheel={(e) => {
                e.stopPropagation();
              }}
            >
              {ctxMenu.kind === "room" ? (
                <>
                  <button
                    type="button"
                    className="block w-full px-3 py-1 text-left hover:bg-slate-800/90"
                    onClick={() => {
                      onRequestCopyHitRef.current?.(ctxMenu);
                      setCtxMenu(null);
                    }}
                  >
                    复制 (Ctrl / ⌘ + C)
                  </button>
                  <button
                    type="button"
                    className="block w-full px-3 py-1 text-left hover:bg-slate-800/90"
                    onClick={() => {
                      onRequestCutHitRef.current?.(ctxMenu);
                      setCtxMenu(null);
                    }}
                  >
                    剪切 (Ctrl / ⌘ + X)
                  </button>
                  <button
                    type="button"
                    className="block w-full px-3 py-1 text-left hover:bg-slate-800/90 text-rose-200"
                    onClick={() => {
                      onRequestDeleteHitRef.current?.(ctxMenu);
                      setCtxMenu(null);
                    }}
                  >
                    删除 (Delete)
                  </button>
                  <div className="my-0.5 border-t border-slate-600/50" />
                  <button
                    type="button"
                    className="block w-full px-3 py-1.5 text-left hover:bg-slate-800/90"
                    onClick={() => {
                      onSelectRoom(ctxMenu.roomId);
                      onRoomRotateRequest?.(ctxMenu.roomId);
                      setCtxMenu(null);
                    }}
                  >
                    旋转此房间
                  </button>
                  <button
                    type="button"
                    className="block w-full px-3 py-1.5 text-left hover:bg-slate-800/90"
                    onClick={() => {
                      onDuplicateRoomById?.(ctxMenu.roomId);
                      setCtxMenu(null);
                    }}
                  >
                    复制实例（带偏移）
                  </button>
                  <button
                    type="button"
                    className="block w-full px-3 py-1.5 text-left hover:bg-slate-800/90"
                    onClick={() => {
                      onClearRoomSelection?.();
                      setCtxMenu(null);
                    }}
                  >
                    取消房间选择
                  </button>
                </>
              ) : ctxMenu.kind === "duct_vertex" ? (
                <>
                  <button
                    type="button"
                    className="block w-full px-3 py-1 text-left hover:bg-slate-800/90"
                    onClick={() => {
                      onRequestCopyHitRef.current?.(ctxMenu);
                      setCtxMenu(null);
                    }}
                  >
                    复制整条风管 (Ctrl / ⌘ + C)
                  </button>
                  <button
                    type="button"
                    className="block w-full px-3 py-1 text-left hover:bg-slate-800/90"
                    onClick={() => {
                      onRequestCutHitRef.current?.(ctxMenu);
                      setCtxMenu(null);
                    }}
                  >
                    剪切拐点 (Ctrl / ⌘ + X)
                  </button>
                  <button
                    type="button"
                    className="block w-full px-3 py-1 text-left hover:bg-slate-800/90 text-rose-200 disabled:opacity-40"
                    disabled={(ducts.find((p) => p.id === ctxMenu.polyId)?.points.length ?? 0) <= 2}
                    onClick={() => {
                      onRequestDeleteHitRef.current?.(ctxMenu);
                      setCtxMenu(null);
                    }}
                  >
                    删除此拐点 (Delete)
                  </button>
                </>
              ) : ctxMenu.kind === "duct_poly" ? (
                <>
                  <button
                    type="button"
                    className="block w-full px-3 py-1 text-left hover:bg-slate-800/90"
                    onClick={() => {
                      onRequestCopyHitRef.current?.(ctxMenu);
                      setCtxMenu(null);
                    }}
                  >
                    复制 (Ctrl / ⌘ + C)
                  </button>
                  <button
                    type="button"
                    className="block w-full px-3 py-1 text-left hover:bg-slate-800/90"
                    onClick={() => {
                      onRequestCutHitRef.current?.(ctxMenu);
                      setCtxMenu(null);
                    }}
                  >
                    剪切 (Ctrl / ⌘ + X)
                  </button>
                  <button
                    type="button"
                    className="block w-full px-3 py-1 text-left hover:bg-slate-800/90 text-rose-200"
                    onClick={() => {
                      onRequestDeleteHitRef.current?.(ctxMenu);
                      setCtxMenu(null);
                    }}
                  >
                    删除 (Delete)
                  </button>
                  <div className="my-0.5 border-t border-slate-600/50" />
                  <button
                    type="button"
                    className="block w-full px-3 py-1.5 text-left hover:bg-slate-800/90"
                    onClick={() => {
                      onDuplicateDuctPolylineById?.(ctxMenu.polyId);
                      setCtxMenu(null);
                    }}
                  >
                    复制实例（带偏移）
                  </button>
                </>
              ) : ctxMenu.kind === "ac_zone" ? (
                <>
                  <button
                    type="button"
                    className="block w-full px-3 py-1 text-left opacity-40"
                    disabled
                    title="空调区为机组结构，暂不支持剪贴板复制/剪切"
                  >
                    复制 / 剪切（不可用）
                  </button>
                  <button
                    type="button"
                    className="block w-full px-3 py-1.5 text-left hover:bg-slate-800/90"
                    onClick={() => {
                      onSelectAcZone(ctxMenu.zoneId);
                      setCtxMenu(null);
                    }}
                  >
                    选中此空调区
                  </button>
                </>
              ) : ctxMenu.kind === "widget" ? (
                <>
                  <button
                    type="button"
                    className="block w-full px-3 py-1 text-left hover:bg-slate-800/90"
                    onClick={() => {
                      onRequestCopyHitRef.current?.(ctxMenu);
                      setCtxMenu(null);
                    }}
                  >
                    复制 (Ctrl / ⌘ + C)
                  </button>
                  <button
                    type="button"
                    className="block w-full px-3 py-1 text-left hover:bg-slate-800/90"
                    onClick={() => {
                      onRequestCutHitRef.current?.(ctxMenu);
                      setCtxMenu(null);
                    }}
                  >
                    剪切 (Ctrl / ⌘ + X)
                  </button>
                  <button
                    type="button"
                    className="block w-full px-3 py-1 text-left hover:bg-slate-800/90 text-rose-200"
                    onClick={() => {
                      onRequestDeleteHitRef.current?.(ctxMenu);
                      setCtxMenu(null);
                    }}
                  >
                    删除 (Delete)
                  </button>
                  <div className="my-0.5 border-t border-slate-600/50" />
                  <button
                    type="button"
                    className="block w-full px-3 py-1.5 text-left hover:bg-slate-800/90"
                    onClick={() => {
                      onSelectWidget(ctxMenu.widgetId);
                      setCtxMenu(null);
                    }}
                  >
                    选中此显示框
                  </button>
                  <button
                    type="button"
                    className="block w-full px-3 py-1.5 text-left hover:bg-slate-800/90"
                    onClick={() => {
                      onDuplicateWidgetById?.(ctxMenu.widgetId);
                      setCtxMenu(null);
                    }}
                  >
                    复制实例（带偏移）
                  </button>
                </>
              ) : ctxMenu.kind === "canvas" ? (
                <div className="w-56 py-0.5">
                  <button
                    type="button"
                    className="block w-full px-3 py-1.5 text-left hover:bg-slate-800/90"
                    onClick={() => {
                      onRequestPasteRef.current?.();
                      setCtxMenu(null);
                    }}
                  >
                    粘贴 (Ctrl / ⌘ + V)
                  </button>
                  <div className="my-0.5 border-t border-slate-600/50" />
                  <div className="px-2 py-1 text-[10px] font-semibold text-slate-400">添加内置图形</div>
                  {EDITOR_SHAPE_CATALOG.map((folder) => (
                    <details key={folder.id} className="border-b border-slate-800/80 px-1" open>
                      <summary className="cursor-pointer select-none px-1 py-1 text-slate-300">{folder.label}</summary>
                      <div className="pb-1 pl-2">
                        {folder.items.map((it) => (
                          <button
                            key={it.id}
                            type="button"
                            className="block w-full truncate rounded px-1 py-0.5 text-left hover:bg-slate-800/90"
                            onClick={() => {
                              onAddShapeFromCatalogRef.current?.(it.id);
                              setCtxMenu(null);
                            }}
                          >
                            {it.label}
                          </button>
                        ))}
                      </div>
                    </details>
                  ))}
                </div>
              ) : null}
            </div>,
            document.body
          )
        : null}
    </>
  );
}
