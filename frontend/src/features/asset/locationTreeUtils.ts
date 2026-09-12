import type { AssetLocationNode } from "@/api/domains/assetLocation.api";

/** 从根到目标节点的路径；找不到返回空数组，根节点返回长度 1 */
export function findPath(nodes: AssetLocationNode[], id: number): AssetLocationNode[] {
  for (const node of nodes) {
    if (node.id === id) return [node];
    const sub = findPath(node.children ?? [], id);
    if (sub.length > 0) return [node, ...sub];
  }
  return [];
}

/** 含自身的所有后代 id（深度优先） */
export function collectDescendantIds(node: AssetLocationNode): number[] {
  const out: number[] = [];
  const walk = (n: AssetLocationNode) => {
    out.push(n.id);
    for (const child of n.children ?? []) walk(child);
  };
  walk(node);
  return out;
}
