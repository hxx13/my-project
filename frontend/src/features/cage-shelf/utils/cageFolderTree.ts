import type { FolderTreeGroup } from "@/features/form-shared/FolderTreeManager";

export const UNGROUPED = "未分类";
export const FOLDER_PATH_SEP = "/";
export const MAX_FOLDER_PATH_LEN = 64;

export function folderPathSegments(path: string): string[] {
  return path.split(FOLDER_PATH_SEP).filter((s) => s.length > 0);
}

export function joinFolderPath(parent: string, childName: string): string {
  const child = childName.trim();
  if (!child) return parent;
  return parent ? `${parent}${FOLDER_PATH_SEP}${child}` : child;
}

export function isUnderFolderPath(path: string, ancestor: string): boolean {
  return path === ancestor || path.startsWith(`${ancestor}${FOLDER_PATH_SEP}`);
}

export function replaceFolderPathPrefix(path: string, oldPrefix: string, newPrefix: string): string {
  if (path === oldPrefix) return newPrefix;
  if (path.startsWith(`${oldPrefix}${FOLDER_PATH_SEP}`)) {
    return newPrefix + path.slice(oldPrefix.length);
  }
  return path;
}

export function validateFolderSegmentName(name: string): string | null {
  if (!name.trim()) return "名称不能为空";
  if (name === UNGROUPED) return `「${UNGROUPED}」为系统保留名`;
  if (name.includes(FOLDER_PATH_SEP)) return `文件夹名不能包含「${FOLDER_PATH_SEP}」`;
  return null;
}

export function validateFolderPath(path: string): string | null {
  if (path.length > MAX_FOLDER_PATH_LEN) {
    return `文件夹路径不能超过 ${MAX_FOLDER_PATH_LEN} 个字符`;
  }
  return null;
}

export function folderKeyFromValue(folder?: string | null): string {
  return (folder ?? "").trim() || UNGROUPED;
}

export function folderFieldValue(folderKey: string): string {
  return folderKey === UNGROUPED ? "" : folderKey;
}

export function folderHasSubfolders(folderKey: string, knownKeys: Set<string>): boolean {
  for (const k of knownKeys) {
    if (k !== folderKey && k.startsWith(`${folderKey}${FOLDER_PATH_SEP}`)) return true;
  }
  return false;
}

export function countTreeFolderNodes(groups: FolderTreeGroup[]): number {
  let n = 0;
  for (const g of groups) {
    if (g.key !== UNGROUPED) n += 1;
    n += countTreeFolderNodes(g.children ?? []);
  }
  return n;
}

export function expandFolderPathKeys(prev: Set<string>, folderKey: string): Set<string> {
  const next = new Set(prev);
  let path = "";
  for (const seg of folderPathSegments(folderKey)) {
    path = path ? `${path}${FOLDER_PATH_SEP}${seg}` : seg;
    next.delete(path);
  }
  return next;
}

export function buildNestedFolderTree<TItem, TTreeItem extends { id: string }>(
  grouped: Array<[string, TItem[]]>,
  toTreeItem: (item: TItem) => TTreeItem,
  opts?: { emptyHint?: string; emptyActionLabel?: string },
): FolderTreeGroup<TTreeItem>[] {
  type Node = {
    key: string;
    label: string;
    items: TTreeItem[];
    children: Map<string, Node>;
  };

  const roots = new Map<string, Node>();

  const getOrCreateNode = (fullKey: string): Node => {
    const segments = folderPathSegments(fullKey);
    let pathSoFar = "";
    let parentMap = roots;
    let node!: Node;

    for (const seg of segments) {
      pathSoFar = pathSoFar ? `${pathSoFar}${FOLDER_PATH_SEP}${seg}` : seg;
      let existing = parentMap.get(pathSoFar);
      if (!existing) {
        existing = { key: pathSoFar, label: seg, items: [], children: new Map() };
        parentMap.set(pathSoFar, existing);
      }
      node = existing;
      parentMap = existing.children;
    }
    return node;
  };

  const toGroup = (node: Node, depth = 0): FolderTreeGroup<TTreeItem> => ({
    key: node.key,
    label: node.label,
    mutable: true,
    items: node.items,
    headerStyle:
      depth > 0
        ? { paddingLeft: 28, fontSize: 12, color: "var(--slate)", fontWeight: 600 }
        : undefined,
    emptyHint: opts?.emptyHint ?? "空文件夹",
    emptyActionLabel: opts?.emptyActionLabel,
    children: [...node.children.values()]
      .sort((a, b) => a.label.localeCompare(b.label, "zh-CN"))
      .map((child) => toGroup(child, depth + 1)),
  });

  let ungrouped: FolderTreeGroup<TTreeItem> | null = null;

  for (const [folderKey, list] of grouped) {
    if (folderKey === UNGROUPED) {
      ungrouped = {
        key: UNGROUPED,
        label: UNGROUPED,
        mutable: false,
        items: list.map(toTreeItem),
      };
      continue;
    }
    const node = getOrCreateNode(folderKey);
    node.items = list.map(toTreeItem);
  }

  const topFolders = [...roots.values()]
    .sort((a, b) => a.label.localeCompare(b.label, "zh-CN"))
    .map((node) => toGroup(node, 0));

  if (ungrouped) topFolders.push(ungrouped);
  return topFolders;
}
