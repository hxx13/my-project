import type { DuctPlanPolyline } from "@/features/digital-twin-screen/layout/ductLayoutTypes";
import type { DtAcZoneDoc, DtSceneWidget, DtWidgetStackLayerRow, DtWidgetStackLayerUi, RoomLayoutEntry } from "@/features/digital-twin-screen/layout/sceneLayoutTypes";
import { distToSegment } from "@/features/digital-twin-screen/layout/planGeometry";
import { widgetsAltPickProbeOrder, widgetsPaintOrder } from "@/features/digital-twin-screen/layout/dtWidgetStackOrder";
import { bestDuctSegmentHit, pointInRotatedRoom, pointToDuctPixel } from "@/features/digital-twin-screen/layout/editor/sceneEditHitTest";

/** 与 SceneEditSurface 命中栈一致：自顶向下（先绘制的后测） */
export type ScenePickTarget =
  | { kind: "widget"; widgetId: string }
  | { kind: "duct_vertex"; polyId: string; index: number }
  | { kind: "duct_poly"; polyId: string }
  | { kind: "room"; roomId: string }
  | { kind: "ac_zone"; zoneId: string };

export type ScenePickStackInput = {
  plateNorm: { x: number; y: number };
  sceneNorm: { x: number; y: number };
  ductPixelWidth: number;
  ductPixelHeight: number;
  heightLiftPx: number;
  rooms: readonly RoomLayoutEntry[];
  widgets: readonly DtSceneWidget[];
  /** 与场景文档一致；缺省则仅按全局 zIndex 退化（兼容旧调用） */
  widgetStackLayers?: readonly DtWidgetStackLayerRow[];
  widgetStackLayerUi?: Readonly<Record<string, DtWidgetStackLayerUi>>;
  acZones: readonly DtAcZoneDoc[];
  ducts: readonly DuctPlanPolyline[];
};

function widgetAsRoomEntry(w: DtSceneWidget): RoomLayoutEntry {
  return { roomId: w.id, nx: w.nx, ny: w.ny, nw: w.nw, nh: w.nh, rotationDeg: 0 };
}

/**
 * 风管宽带命中退让：指针落在任一**可见**图元 plate 轴对齐框内时不应抢线段。
 * 传入 stackLayers 时与 DOM 绘制顺序一致（含锁定层上的可见图元，仍遮挡风管）。
 */
export function isPlateNormInsideAnyWidget(
  plateP: { x: number; y: number },
  widgets: readonly DtSceneWidget[],
  widgetStackLayers?: readonly DtWidgetStackLayerRow[],
  widgetStackLayerUi?: Readonly<Record<string, DtWidgetStackLayerUi>>
): boolean {
  const ordered =
    widgetStackLayers && widgetStackLayers.length > 0
      ? widgetsPaintOrder(widgets, widgetStackLayers, widgetStackLayerUi)
      : widgets;
  for (const w of ordered) {
    if (pointInRotatedRoom(plateP.x, plateP.y, widgetAsRoomEntry(w))) return true;
  }
  return false;
}

function acAsRoomEntry(z: DtAcZoneDoc): RoomLayoutEntry {
  return { roomId: z.id, nx: z.nx, ny: z.ny, nw: z.nw, nh: z.nh, rotationDeg: 0 };
}

const DUCT_SEG_HIT_NORM = 0.022;
const DUCT_VERTEX_THR_PX = 12;

/**
 * 构造指针下「自顶向下」的候选列表，用于 Alt+点击穿透循环选中。
 * 顺序与画布 DOM 叠放一致：图元 → 风管（拐点优先于线段所属折线）→ 房间 → 空调区。
 */
export function buildScenePickStack(input: ScenePickStackInput): ScenePickTarget[] {
  const out: ScenePickTarget[] = [];
  const { plateNorm: p, sceneNorm: sn } = input;
  const wPx = input.ductPixelWidth;
  const hPx = input.ductPixelHeight;

  const probe = widgetsAltPickProbeOrder(input.widgets, input.widgetStackLayers, input.widgetStackLayerUi, {
    skipLockedLayers: true,
  });
  for (const w of probe) {
    if (pointInRotatedRoom(p.x, p.y, widgetAsRoomEntry(w))) {
      out.push({ kind: "widget", widgetId: w.id });
    }
  }

  const pixX = sn.x * wPx;
  const pixY = sn.y * hPx;
  type VHit = { polyId: string; index: number; d: number };
  const vertHits: VHit[] = [];
  for (const pl of input.ducts) {
    for (let i = 0; i < pl.points.length; i++) {
      const pt = pl.points[i]!;
      const P = pointToDuctPixel(pt, wPx, hPx, input.heightLiftPx);
      const d = Math.hypot(P.x - pixX, P.y - pixY);
      if (d <= DUCT_VERTEX_THR_PX) vertHits.push({ polyId: pl.id, index: i, d });
    }
  }
  vertHits.sort((a, b) => a.d - b.d);
  for (const v of vertHits) {
    out.push({ kind: "duct_vertex", polyId: v.polyId, index: v.index });
  }

  const polyMinDist = new Map<string, number>();
  for (const pl of input.ducts) {
    for (let i = 0; i < pl.points.length - 1; i++) {
      const a = pl.points[i]!;
      const b = pl.points[i + 1]!;
      const d = distToSegment(sn.x, sn.y, a.x, a.y, b.x, b.y);
      if (d < DUCT_SEG_HIT_NORM) {
        const prev = polyMinDist.get(pl.id);
        if (prev === undefined || d < prev) polyMinDist.set(pl.id, d);
      }
    }
  }
  const polyIdsByDist = Array.from(polyMinDist.entries()).sort((a, b) => a[1] - b[1]);
  for (const [polyId] of polyIdsByDist) {
    out.push({ kind: "duct_poly", polyId });
  }

  for (let i = input.rooms.length - 1; i >= 0; i--) {
    const layout = input.rooms[i]!;
    if (pointInRotatedRoom(p.x, p.y, layout)) {
      out.push({ kind: "room", roomId: layout.roomId });
    }
  }

  for (let i = input.acZones.length - 1; i >= 0; i--) {
    const z = input.acZones[i]!;
    if (pointInRotatedRoom(sn.x, sn.y, acAsRoomEntry(z))) {
      out.push({ kind: "ac_zone", zoneId: z.id });
    }
  }

  return out;
}

export type PickSelectionSnapshot = {
  selectedWidgetId: string | null;
  selectedRoomId: string | null;
  selectedAcZoneId: string | null;
  selectedDuctPolyId: string | null;
  selectedDuctPointIndex: number | null;
};

export function pickStackIndexOfCurrent(stack: readonly ScenePickTarget[], sel: PickSelectionSnapshot): number {
  return stack.findIndex((t) => {
    switch (t.kind) {
      case "widget":
        return t.widgetId === sel.selectedWidgetId;
      case "room":
        return t.roomId === sel.selectedRoomId;
      case "ac_zone":
        return t.zoneId === sel.selectedAcZoneId;
      case "duct_vertex":
        return t.polyId === sel.selectedDuctPolyId && t.index === sel.selectedDuctPointIndex;
      case "duct_poly":
        return t.polyId === sel.selectedDuctPolyId && sel.selectedDuctPointIndex === null;
    }
  });
}
