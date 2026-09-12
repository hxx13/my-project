/**
 * 树搜索裁枝 —— 两棵树共用的一份实现。
 *
 * 命中节点保留其祖先链，未命中的子孙裁掉；空 keyword 原样返回同一个引用
 * （调用方可以据此免掉一次 memo 失效）。
 */

/** 能做搜索裁枝的最小结构：有名字、有子节点。资产地点与物品空间都满足 */
export type TreeLike<T> = { name?: string | null; children?: T[] | null };

export function filterTree<T extends TreeLike<T>>(nodes: T[], keyword: string): T[] {
  const kw = keyword.trim().toLowerCase();
  if (!kw) return nodes;
  const out: T[] = [];
  for (const node of nodes) {
    const children = filterTree(node.children ?? [], keyword);
    if ((node.name ?? "").toLowerCase().includes(kw) || children.length > 0) {
      out.push({ ...node, children });
    }
  }
  return out;
}
