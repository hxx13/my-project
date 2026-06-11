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
  const parent = findNodeInTree(tree, node.parentId);
  return [...(parent?.children ?? [])].sort(sortBySiblingOrder);
}

export function getNavNodeSiblingIndex(siblings: AdminNavConfigNode[], nodeId: string): number {
  return siblings.findIndex((s) => s.id === nodeId);
}

function findNodeInTree(tree: AdminNavConfigNode[], id: string): AdminNavConfigNode | undefined {
  for (const n of tree) {
    if (n.id === id) return n;
    if (n.children?.length) {
      const found = findNodeInTree(n.children, id);
      if (found) return found;
    }
  }
  return undefined;
}
