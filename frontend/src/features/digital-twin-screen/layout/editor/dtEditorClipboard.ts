import type { DuctPlanPolyline } from "@/features/digital-twin-screen/layout/ductLayoutTypes";
import { newPointId, newPolylineId } from "@/features/digital-twin-screen/layout/ductLayoutTypes";
import type { DtAcZoneDoc, DtSceneWidget, RoomLayoutEntry } from "@/features/digital-twin-screen/layout/sceneLayoutTypes";
import { newDtBindingSlotId, newDtSceneWidgetId } from "@/features/digital-twin-screen/layout/sceneLayoutTypes";
import { clamp01, clampRoomTopLeftToPlate } from "@/features/digital-twin-screen/layout/planGeometry";

/** 与系统剪贴板互操作时使用的 JSON 标记（便于调试与跨页粘贴） */
export const DT_CLIPBOARD_MIME = "application/x-aro-dt-scene";

export type DtEditorClipboardBundleV2 = {
  v: 2;
  rooms: RoomLayoutEntry[];
  widgets: DtSceneWidget[];
  ducts: DuctPlanPolyline[];
  /** 一般不在全局粘贴里改空调区，保留字段供后续扩展 */
  acZones?: DtAcZoneDoc[];
};

export function emptyClipboardBundle(): DtEditorClipboardBundleV2 {
  return { v: 2, rooms: [], widgets: [], ducts: [] };
}

export function parseClipboardBundle(raw: string): DtEditorClipboardBundleV2 | null {
  try {
    const o = JSON.parse(raw) as Partial<DtEditorClipboardBundleV2>;
    if (o?.v !== 2) return null;
    return {
      v: 2,
      rooms: Array.isArray(o.rooms) ? (o.rooms as RoomLayoutEntry[]) : [],
      widgets: Array.isArray(o.widgets) ? (o.widgets as DtSceneWidget[]) : [],
      ducts: Array.isArray(o.ducts) ? (o.ducts as DuctPlanPolyline[]) : [],
      acZones: Array.isArray(o.acZones) ? (o.acZones as DtAcZoneDoc[]) : undefined,
    };
  } catch {
    return null;
  }
}

function cloneWidgetDeep(w: DtSceneWidget): DtSceneWidget {
  return {
    ...w,
    bindings: w.bindings.map((b) => ({ ...b })),
  };
}

function cloneDuctDeep(pl: DuctPlanPolyline): DuctPlanPolyline {
  return {
    ...pl,
    points: pl.points.map((p) => ({ ...p })),
  };
}

/** 粘贴时生成新 id 并整体平移（归一化坐标） */
export function remapClipboardBundleForPaste(
  src: DtEditorClipboardBundleV2,
  dNorm: { dx: number; dy: number }
): { rooms: RoomLayoutEntry[]; widgets: DtSceneWidget[]; ducts: DuctPlanPolyline[] } {
  const rooms: RoomLayoutEntry[] = src.rooms.map((r) => {
    const rid = `room-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
    let nx = clamp01(r.nx + dNorm.dx);
    let ny = clamp01(r.ny + dNorm.dy);
    const c = clampRoomTopLeftToPlate(nx, ny, r.nw, r.nh, r.rotationDeg ?? 0);
    return { ...r, roomId: rid, nx: c.nx, ny: c.ny };
  });
  const widgets: DtSceneWidget[] = src.widgets.map((w) => {
    const id = newDtSceneWidgetId();
    let nx = clamp01(w.nx + dNorm.dx);
    let ny = clamp01(w.ny + dNorm.dy);
    const c = clampRoomTopLeftToPlate(nx, ny, w.nw, w.nh, 0);
    return {
      ...cloneWidgetDeep(w),
      id,
      nx: c.nx,
      ny: c.ny,
      bindings: w.bindings.map((b) => ({ ...b, id: newDtBindingSlotId() })),
    };
  });
  const ducts: DuctPlanPolyline[] = src.ducts.map((pl) => {
    const id = newPolylineId();
    return {
      ...cloneDuctDeep(pl),
      id,
      points: pl.points.map((p) => ({
        ...p,
        id: newPointId(),
        x: clamp01(p.x + dNorm.dx),
        y: clamp01(p.y + dNorm.dy),
      })),
    };
  });
  return { rooms, widgets, ducts };
}
