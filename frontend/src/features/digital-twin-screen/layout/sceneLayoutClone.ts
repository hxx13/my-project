import type { SceneLayoutDocumentV4 } from "@/features/digital-twin-screen/layout/sceneLayoutTypes";

export function cloneSceneLayoutDocument(doc: SceneLayoutDocumentV4): SceneLayoutDocumentV4 {
  return {
    version: 4,
    ducts: doc.ducts.map((pl) => ({
      ...pl,
      points: pl.points.map((p) => ({ ...p })),
    })),
    rooms: doc.rooms.map((r) => ({ ...r })),
    widgets: doc.widgets.map((w) => ({
      ...w,
      bindings: w.bindings.map((b) => ({ ...b })),
    })),
    widgetStackLayers: doc.widgetStackLayers.map((l) => ({ ...l })),
    widgetStackLayerUi: doc.widgetStackLayerUi ? { ...doc.widgetStackLayerUi } : undefined,
    acZones: doc.acZones.map((z) => ({ ...z })),
    roomVisualPreset: doc.roomVisualPreset,
    roomGapPx: doc.roomGapPx,
    boardPresentation: doc.boardPresentation,
    boardTiltRotateXDeg: doc.boardTiltRotateXDeg,
    suppressBuiltInDuctSvg: doc.suppressBuiltInDuctSvg,
  };
}

export function sceneLayoutDocsEqual(a: SceneLayoutDocumentV4, b: SceneLayoutDocumentV4): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
