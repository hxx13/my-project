import type { AdminNavConfigNode } from "@/api/domains/adminNavConfig.api";

function sortBySiblingOrder(a: AdminNavConfigNode, b: AdminNavConfigNode): number {
  return a.sortOrder - b.sortOrder || a.id.localeCompare(b.id);
}

function isNavFolder(node: AdminNavConfigNode): boolean {
  return node.type === "GROUP" || node.type === "SUBGROUP";
}

/** 同级文件夹兄弟（排序仅在文件夹之间调整，不含入口项） */
export function getNavFolderSiblings(
  tree: AdminNavConfigNode[],
  node: AdminNavConfigNode,
): AdminNavConfigNode[] {
  const all = getNavNodeSiblings(tree, node);
  return all.filter(isNavFolder);
}

/** 查找节点在树中的同级兄弟（与侧栏/树展示顺序一致） */
export function getNavNodeSiblings(
  tree: AdminNavConfigNode[],
  node: AdminNavConfigNode,
): AdminNavConfigNode[] {
  if (!node.parentId) {
    return [...tree].sort(sortBySiblingOrder);
  }
  const parent = findNavNodeById(tree, node.parentId);
  return [...(parent?.children ?? [])].sort(sortBySiblingOrder);
}

export function getNavNodeSiblingIndex(siblings: AdminNavConfigNode[], nodeId: string): number {
  return siblings.findIndex((s) => s.id === nodeId);
}

/** 递归查找节点（深度优先） */
export function findNavNodeById(tree: AdminNavConfigNode[], id: string): AdminNavConfigNode | undefined {
  for (const node of tree) {
    if (node.id === id) return node;
    if (node.children?.length) {
      const found = findNavNodeById(node.children, id);
      if (found) return found;
    }
  }
  return undefined;
}

/** 顶层容器标识（区别于文件夹节点 id） */
export const ROOT_CONTAINER = "__root__";

/** 构建 nodeId → 所属容器 id（父节点 id 或 ROOT_CONTAINER） */
export function buildNavParentMap(tree: AdminNavConfigNode[]): Map<string, string> {
  const map = new Map<string, string>();
  const walk = (nodes: AdminNavConfigNode[], containerId: string) => {
    for (const n of nodes) {
      map.set(n.id, containerId);
      if (n.children?.length) walk(n.children, n.id);
    }
  };
  walk(tree, ROOT_CONTAINER);
  return map;
}

/** 取某容器（ROOT 或文件夹 id）下的直接子节点（有序） */
export function getNavContainerChildren(tree: AdminNavConfigNode[], containerId: string): AdminNavConfigNode[] {
  if (containerId === ROOT_CONTAINER) return tree;
  return findNavNodeById(tree, containerId)?.children ?? [];
}

/** 递归 map（fn 返回 null 表示不替换该节点，但仍会递归其子节点） */
function mapTree(
  nodes: AdminNavConfigNode[],
  fn: (n: AdminNavConfigNode) => AdminNavConfigNode | null,
): AdminNavConfigNode[] {
  return nodes.map((n) => {
    const base = fn(n) ?? n;
    if (base.children?.length) return { ...base, children: mapTree(base.children, fn) };
    return base;
  });
}

/** 将某容器的直接子节点重排为给定 id 顺序（用于同级拖拽排序） */
export function reorderNavContainerChildren(
  tree: AdminNavConfigNode[],
  containerId: string,
  orderedIds: string[],
): AdminNavConfigNode[] {
  const rank = new Map<string, number>();
  orderedIds.forEach((id, i) => rank.set(id, i));
  const sortList = (list: AdminNavConfigNode[]) =>
    [...list].sort((a, b) => (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER));
  if (containerId === ROOT_CONTAINER) return sortList(tree);
  return mapTree(tree, (n) => (n.id === containerId ? { ...n, children: sortList(n.children ?? []) } : null));
}

/** 将节点移动到目标容器（ROOT 或文件夹 id）的指定下标（用于跨文件夹拖拽） */
export function moveNavNodeToContainer(
  tree: AdminNavConfigNode[],
  nodeId: string,
  toContainerId: string,
  toIndex: number,
): AdminNavConfigNode[] {
  let removed: AdminNavConfigNode | null = null;
  const remove = (nodes: AdminNavConfigNode[]): AdminNavConfigNode[] => {
    const result: AdminNavConfigNode[] = [];
    for (const n of nodes) {
      if (n.id === nodeId) {
        removed = n;
        continue;
      }
      result.push(n.children?.length ? { ...n, children: remove(n.children) } : n);
    }
    return result;
  };
  const stripped = remove(tree);
  if (!removed) return tree;

  const insert = (nodes: AdminNavConfigNode[]): AdminNavConfigNode[] => {
    if (toContainerId === ROOT_CONTAINER) {
      const list = [...nodes];
      list.splice(Math.min(toIndex, list.length), 0, removed!);
      return list;
    }
    return mapTree(nodes, (n) => {
      if (n.id !== toContainerId) return null;
      const kids = [...(n.children ?? [])];
      kids.splice(Math.min(toIndex, kids.length), 0, removed!);
      return { ...n, children: kids };
    });
  };
  return insert(stripped);
}
