import type { SopDocument, SopNode } from "@/api/domains/sop.api";

export type SopTreeNode = SopNode & { children: SopTreeNode[] };

/**
 * 扁平节点 → 树。
 *
 * 认不出的 parentId（父节点已被删/数据脏）当**顶层**处理，不让它整棵消失：
 * 挂在已不存在的父节点下，从根遍历根本走不到，用户在界面上再也看不到这些文档。
 */
export function buildSopTree(nodes: SopNode[]): SopTreeNode[] {
  const byId = new Map<number, SopTreeNode>();
  for (const n of nodes) byId.set(n.id, { ...n, children: [] });

  const roots: SopTreeNode[] = [];
  for (const n of nodes) {
    const self = byId.get(n.id)!;
    const parent = n.parentId != null ? byId.get(n.parentId) : undefined;
    if (parent && parent.id !== self.id) parent.children.push(self);
    else roots.push(self);
  }
  return roots;
}

/** 节点 id → 「分类A / 子分类B」全路径；找不到返回 null */
export function sopNodePath(nodes: SopNode[], id: number | null): string | null {
  if (id == null) return null;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const parts: string[] = [];
  let cur = byId.get(id);
  // 上限防脏数据成环时死循环
  for (let i = 0; cur && i < 64; i++) {
    parts.unshift(cur.name);
    cur = cur.parentId != null ? byId.get(cur.parentId) : undefined;
  }
  return parts.length > 0 ? parts.join(" / ") : null;
}

/** 按树的遍历顺序铺平，带缩进层级 —— 给原生 <select> 当选项用 */
export function flattenForPicker(
  nodes: SopNode[],
  rootLabel = "（顶层 / 未分类）",
): { id: number | null; label: string }[] {
  const out: { id: number | null; label: string }[] = [{ id: null, label: rootLabel }];
  const walk = (list: SopTreeNode[], depth: number) => {
    for (const n of list) {
      out.push({ id: n.id, label: `${"  ".repeat(depth)}${depth > 0 ? "└ " : ""}${n.name}` });
      walk(n.children, depth + 1);
    }
  };
  walk(buildSopTree(nodes), 0);
  return out;
}

/** 某分类直接挂着的文档（不含子分类的） */
export function documentsOfNode(documents: SopDocument[], nodeId: number | null): SopDocument[] {
  return documents.filter((d) => d.nodeId === nodeId);
}

/** 节点自己 + 整棵子树 —— 移动选择器要排除掉，否则能把分类挪进自己的子孙里（后端也会拒，前端先挡一道） */
export function collectSopSubtreeIds(nodes: SopNode[], rootId: number): Set<number> {
  const childrenOf = new Map<number | null, number[]>();
  for (const n of nodes) {
    const key = n.parentId;
    const arr = childrenOf.get(key);
    if (arr) arr.push(n.id);
    else childrenOf.set(key, [n.id]);
  }
  const out = new Set<number>();
  const stack = [rootId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (out.has(id)) continue; // 脏数据成环时兜底，别死循环
    out.add(id);
    stack.push(...(childrenOf.get(id) ?? []));
  }
  return out;
}

/** 人类可读的文件大小；后端给的是字节 */
export function formatBytes(n?: number | null): string {
  if (n == null || n <= 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
