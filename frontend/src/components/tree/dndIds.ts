/**
 * dnd-kit 的 id 约定：`${kind}:${id}`。
 *
 * 一个 DndContext 里同时有树行、画布卡片、物品格、资产卡四种可拖/可落的东西，
 * 而且「空间的树行」和「空间的画布卡片」指向同一个空间 —— 所以 id 必须带类型前缀
 * 才不撞车。拼和解析都只在这一个文件里，免得两边各写一套慢慢跑偏。
 */

export const DND_KINDS = ["tree-node", "canvas-node", "item-chip", "asset-chip"] as const;

export type DndKind = (typeof DND_KINDS)[number];

export function dndId(kind: DndKind, id: number | string): string {
  return `${kind}:${id}`;
}

/** 解析不出来返回 null（不是我们发出去的 id） */
export function parseDndId(raw: string | number): { kind: DndKind; id: string } | null {
  const s = String(raw);
  const i = s.indexOf(":");
  if (i < 0) return null;
  const kind = s.slice(0, i) as DndKind;
  if (!DND_KINDS.includes(kind)) return null;
  return { kind, id: s.slice(i + 1) };
}
