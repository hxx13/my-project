import type { AssetLocationNode } from "@/api/domains/assetLocation.api";

/**
 * 按名称不区分大小写模糊过滤，命中节点保留其祖先链；空 keyword 原样返回。
 * ponytail: 命中节点的未命中子孙会被裁掉（只留祖先链），需要「命中即展开整棵子树」时再改。
 */
export function filterTree(nodes: AssetLocationNode[], keyword: string): AssetLocationNode[] {
  const kw = keyword.trim().toLowerCase();
  if (!kw) return nodes;
  const out: AssetLocationNode[] = [];
  for (const node of nodes) {
    const children = filterTree(node.children ?? [], keyword);
    if ((node.name ?? "").toLowerCase().includes(kw) || children.length > 0) {
      out.push({ ...node, children });
    }
  }
  return out;
}

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
