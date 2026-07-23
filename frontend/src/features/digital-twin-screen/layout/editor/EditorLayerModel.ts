import type { EditorLayerId } from "@/features/digital-twin-screen/layout/editor/EditorLayerId";
import { ALL_EDITOR_LAYER_IDS } from "@/features/digital-twin-screen/layout/editor/EditorLayerId";

/**
 * 编辑画布「结构类」叠放顺序（房间 / 风管 / 图元 / 空调区）的命中与显隐；与场景文档里的「图形子图层」widgetStackLayers 正交。
 */
export type EditorLayerRow = {
  id: EditorLayerId;
  visible: boolean;
  locked: boolean;
};

/**
 * 统一命中顺序（与画布 DOM 自下而上叠放一致：图元块最先测，其次风管编辑层、房间、空调区）。
 * widgets 在 SceneEditSurface 内单独优先处理；此处顺序仅影响非图元栈。
 */
export const DEFAULT_EDITOR_LAYER_ROWS: EditorLayerRow[] = [
  { id: "widgets", visible: true, locked: false },
  { id: "ducts", visible: true, locked: false },
  { id: "rooms", visible: true, locked: false },
  { id: "ac", visible: true, locked: false },
];

function rowById(rows: EditorLayerRow[], id: EditorLayerId): EditorLayerRow | undefined {
  return rows.find((r) => r.id === id);
}

/** 归一化持久化数据：补全缺层、去重、顺序取 input 首次出现 + 默认尾补 */
export function normalizeEditorLayerRows(input: unknown): EditorLayerRow[] {
  if (!Array.isArray(input)) return [...DEFAULT_EDITOR_LAYER_ROWS];
  const byId = new Map<EditorLayerId, EditorLayerRow>();
  const order: EditorLayerId[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const id = o.id;
    if (id !== "rooms" && id !== "ducts" && id !== "widgets" && id !== "ac") continue;
    const row: EditorLayerRow = {
      id,
      visible: typeof o.visible === "boolean" ? o.visible : true,
      locked: typeof o.locked === "boolean" ? o.locked : false,
    };
    byId.set(id, row);
    if (!order.includes(id)) order.push(id);
  }
  for (const id of ALL_EDITOR_LAYER_IDS) {
    if (!order.includes(id)) order.push(id);
    if (!byId.has(id)) {
      const d = DEFAULT_EDITOR_LAYER_ROWS.find((r) => r.id === id)!;
      byId.set(id, { ...d });
    }
  }
  return order.map((id) => byId.get(id)!);
}

export function reorderEditorLayerRows(rows: EditorLayerRow[], fromIndex: number, toIndex: number): EditorLayerRow[] {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return rows;
  if (fromIndex >= rows.length || toIndex >= rows.length) return rows;
  const next = rows.slice();
  const [moved] = next.splice(fromIndex, 1);
  if (!moved) return rows;
  next.splice(toIndex, 0, moved);
  return next;
}

export function setLayerRow(rows: EditorLayerRow[], id: EditorLayerId, patch: Partial<Pick<EditorLayerRow, "visible" | "locked">>): EditorLayerRow[] {
  return rows.map((r) => (r.id === id ? { ...r, ...patch } : r));
}

export function isLayerVisible(rows: EditorLayerRow[], id: EditorLayerId): boolean {
  return rowById(rows, id)?.visible ?? true;
}

export function isLayerLocked(rows: EditorLayerRow[], id: EditorLayerId): boolean {
  return rowById(rows, id)?.locked ?? false;
}
