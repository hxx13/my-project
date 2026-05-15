/** 自定义管道平面图布局（归一化 0–1，相对场景 sceneRef 矩形） */
/** 后续可选：SceneLayoutDocumentV3 将风管点改为 layoutPlate 局部归一化，与房间共用 plate 坐标系（图层架构里程碑）。 */

export type DuctPlanPoint = {
  id: string;
  x: number;
  y: number;
  /** 0–1：伪竖直高度，在平面投影上等距抬升 */
  h?: number;
};

export type DuctPlanPolyline = {
  id: string;
  /** 流光相位列（0–3） */
  columnIndex: number;
  points: DuctPlanPoint[];
};

export type DuctLayoutDocumentV1 = {
  version: 1;
  polylines: DuctPlanPolyline[];
};

export const DUCT_LAYOUT_STORAGE_KEY = "aro.digitalTwin.ductLayout.v1";

export function newPointId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `p-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

export function newPolylineId(): string {
  try {
    return `duct-${crypto.randomUUID().slice(0, 8)}`;
  } catch {
    return `duct-${Date.now()}`;
  }
}
