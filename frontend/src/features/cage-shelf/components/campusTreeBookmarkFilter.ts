import type { TreeNode } from "../constants";

/**
 * 左侧笼架树的**收藏**过滤逻辑（纯函数，单测主入口）。
 *
 * 口径（2026-09-19）：收藏可以落在**房间**上，也可以落在**笼架**上；「收藏」视图由它们自然生成：
 *   - 收藏了房间 → 这个房间整间照常展示（还能继续展开看它所有笼架）；
 *   - 只收藏了笼架 → 房间只露那一架（别把整间铺开），点它直接进网格；
 *   - 非房间层（校区/区域/楼层）整支都没有收藏项时**不画**，否则收藏页剩一堆空分支。
 *
 * 单独一个模块是为了能直接单测：CampusTree.tsx 会牵连 React / 同步锁 context，在 node 测试环境跑不动。
 */
export interface RoomBookmarkOpts {
  /** 已收藏的房间 id */
  bookmarkedRooms?: Set<string>;
  /** 已收藏的笼架 id（shelveId） */
  bookmarkedShelves?: Set<string>;
  /** 点房间名后面那枚 ☆ */
  onToggleBookmarkRoom?: (roomId: string) => void;
  /** 点笼架名后面那枚 ☆（要 roomId 才能调老接口） */
  onToggleBookmarkShelf?: (roomId: string, shelveId: string) => void;
  /** 只画收藏过的房间/笼架（「收藏」视图用） */
  onlyBookmarked?: boolean;
}

/** 房间节点的 roomId（buildTree 生成 key 就是 `r:<roomId>`，raw 里也带一份）。 */
export function roomIdOf(n: TreeNode): string {
  const raw = (n as unknown as { raw?: { roomId?: unknown } }).raw;
  return String(raw?.roomId ?? n.key.replace(/^r:/, ""));
}

/** 笼架节点的 shelveId（key 就是 `s:<shelveId>`，raw 里也带一份）。 */
export function shelveIdOf(n: TreeNode): string {
  const raw = (n as unknown as { raw?: { shelveId?: unknown } }).raw;
  return String(raw?.shelveId ?? n.key.replace(/^s:/, ""));
}

/** 该分支（含自身）里有没有收藏项（房间或笼架）—— 收藏视图靠它剪掉空分支。 */
export function subtreeHasBookmarked(n: TreeNode, bookmarkedRooms: Set<string>, bookmarkedShelves: Set<string>): boolean {
  if (bookmarkedRooms.size === 0 && bookmarkedShelves.size === 0) return false;
  if (n.type === "room") return bookmarkedRooms.has(roomIdOf(n)) || (n.children || []).some((c) => subtreeHasBookmarked(c, bookmarkedRooms, bookmarkedShelves));
  if (n.type === "shelf") return bookmarkedShelves.has(shelveIdOf(n));
  return (n.children || []).some((c) => subtreeHasBookmarked(c, bookmarkedRooms, bookmarkedShelves));
}

/**
 * 房间下面该显示哪些笼架：房间自己收藏了 → 全显示；没收藏但下面有收藏的笼架 → 只显示那几架。
 * （「只收藏了一架」却把整间铺开，收藏视图就失去意义了。）
 */
export function visibleShelfChildren(n: TreeNode, bookmarkedRooms: Set<string>, bookmarkedShelves: Set<string>): TreeNode[] {
  const kids = n.children || [];
  if (bookmarkedRooms.has(roomIdOf(n))) return kids;
  return kids.filter((c) => c.type !== "shelf" || bookmarkedShelves.has(shelveIdOf(c)));
}
