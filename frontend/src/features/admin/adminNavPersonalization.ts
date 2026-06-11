import type { AdminCommandPaletteItem } from "@/features/admin/buildAdminNavModel";
import type { AdminSidebarNavGroup, AdminSidebarNavItem } from "@/features/admin/buildAdminNavModel";
import { buildFriendsNavSidebarItem, normalizeAdminPath } from "@/features/admin/buildAdminNavModel";

const RECENT_KEY = "aro-admin-nav-recent";
const STARS_KEY = "aro-admin-nav-stars";
const LOCK_KEY = "aro-admin-nav-lock";
const RECENT_MAX = 8;

export const ADMIN_NAV_PERSONALIZATION_EVENT = "aro-admin-nav-personalization";

function dispatchPersonalizationChanged() {
  try {
    window.dispatchEvent(new Event(ADMIN_NAV_PERSONALIZATION_EVENT));
  } catch {
    /* ignore */
  }
}

export function readAdminNavRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const j = JSON.parse(raw) as unknown;
    if (!Array.isArray(j)) return [];
    return j.filter((x): x is string => typeof x === "string" && x.length > 0).map(normalizeAdminPath);
  } catch {
    return [];
  }
}

export function readAdminNavStars(): string[] {
  try {
    const raw = localStorage.getItem(STARS_KEY);
    if (!raw) return [];
    const j = JSON.parse(raw) as unknown;
    if (!Array.isArray(j)) return [];
    return j.filter((x): x is string => typeof x === "string" && x.length > 0).map(normalizeAdminPath);
  } catch {
    return [];
  }
}

/** 记录最近访问的后台路径（仅 pathname，不含 query） */
export function appendAdminNavRecent(pathname: string): void {
  const p = normalizeAdminPath(pathname);
  if (!p.startsWith("/admin")) return;
  try {
    const prev = readAdminNavRecent().filter((x) => x !== p);
    const next = [p, ...prev].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    dispatchPersonalizationChanged();
  } catch {
    /* ignore */
  }
}

/** @returns 收藏后是否为「已收藏」 */
export function toggleAdminNavStar(pathname: string): boolean {
  const p = normalizeAdminPath(pathname);
  if (!p.startsWith("/admin")) return false;
  try {
    const set = new Set(readAdminNavStars());
    const was = set.has(p);
    if (was) set.delete(p);
    else set.add(p);
    localStorage.setItem(STARS_KEY, JSON.stringify([...set]));
    dispatchPersonalizationChanged();
    return !was;
  } catch {
    return false;
  }
}

export function isAdminNavStarred(pathname: string): boolean {
  const p = normalizeAdminPath(pathname);
  return readAdminNavStars().includes(p);
}

export function readAdminNavLock(): string | null {
  try {
    const raw = localStorage.getItem(LOCK_KEY);
    if (!raw) return null;
    const trimmed = raw.trim();
    return trimmed.length > 0 ? normalizeAdminPath(trimmed) : null;
  } catch {
    return null;
  }
}

/** 切换锁定状态；同一时间仅允许锁定一个页面。返回是否已锁定。 */
export function toggleAdminNavLock(pathname: string): boolean {
  const p = normalizeAdminPath(pathname);
  if (!p.startsWith("/admin")) return false;
  try {
    const current = readAdminNavLock();
    if (current === p) {
      localStorage.removeItem(LOCK_KEY);
      dispatchPersonalizationChanged();
      return false;
    }
    localStorage.setItem(LOCK_KEY, p);
    dispatchPersonalizationChanged();
    return true;
  } catch {
    return false;
  }
}

export function isAdminNavLocked(pathname: string): boolean {
  const p = normalizeAdminPath(pathname);
  return readAdminNavLock() === p;
}

export type PersonalizedPaletteSplit = {
  starredItems: AdminCommandPaletteItem[];
  recentItems: AdminCommandPaletteItem[];
  /** 用于按注册表分组渲染，已排除「收藏」「最近」独占展示的条目 */
  registryItems: AdminCommandPaletteItem[];
};

export function splitPersonalizedPaletteItems(
  flat: AdminCommandPaletteItem[],
  recentPaths: string[],
  starPaths: string[]
): PersonalizedPaletteSplit {
  const byPath = new Map<string, AdminCommandPaletteItem>();
  for (const it of flat) {
    byPath.set(normalizeAdminPath(it.path), it);
  }
  const starSet = new Set(starPaths.map(normalizeAdminPath));
  const recentOrder = recentPaths.map(normalizeAdminPath).filter((p) => byPath.has(p));

  const starredItems: AdminCommandPaletteItem[] = [];
  for (const p of starPaths.map(normalizeAdminPath)) {
    const item = byPath.get(p);
    if (item) starredItems.push(item);
  }

  const recentItems: AdminCommandPaletteItem[] = [];
  const seenRecent = new Set<string>();
  for (const p of recentOrder) {
    if (starSet.has(p)) continue;
    const item = byPath.get(p);
    if (item && !seenRecent.has(p)) {
      seenRecent.add(p);
      recentItems.push(item);
    }
  }

  const pinned = new Set<string>([...starSet]);
  for (const it of recentItems) {
    pinned.add(normalizeAdminPath(it.path));
  }
  const registryItems = flat.filter((it) => !pinned.has(normalizeAdminPath(it.path)));

  return { starredItems, recentItems, registryItems };
}

const RECENT_GROUP_ID = "nav-sidebar-recent";
const STARS_GROUP_ID = "nav-sidebar-stars";
/** 置顶「消息」分组（位于「常用」之上） */
const FRIENDS_GROUP_ID = "nav-sidebar-friends";

/** 将收藏入口在所属文件夹/子分组内置顶（保留原位置分组，仅调整顺序） */
function pinStarredInSidebarGroups(
  groups: AdminSidebarNavGroup[],
  starPaths: string[],
): AdminSidebarNavGroup[] {
  const normalizedStars = starPaths.map(normalizeAdminPath);
  const starSet = new Set(normalizedStars);
  if (starSet.size === 0) return groups;

  const starOrder = new Map(normalizedStars.map((p, i) => [p, i]));

  const sortItems = (items: AdminSidebarNavItem[]): AdminSidebarNavItem[] => {
    const starred: AdminSidebarNavItem[] = [];
    const rest: AdminSidebarNavItem[] = [];
    for (const it of items) {
      if (starSet.has(normalizeAdminPath(it.to))) starred.push(it);
      else rest.push(it);
    }
    starred.sort(
      (a, b) =>
        (starOrder.get(normalizeAdminPath(a.to)) ?? 999) -
        (starOrder.get(normalizeAdminPath(b.to)) ?? 999),
    );
    return [...starred, ...rest];
  };

  return groups.map((g) => ({
    ...g,
    items: sortItems(g.items),
    subgroups: g.subgroups?.map((sg) => ({
      ...sg,
      items: sortItems(sg.items),
    })),
  }));
}

/** 在侧栏「常用」之上插入「消息」；再插入常用 / 收藏（与命令面板数据源一致，仅展示仍有权限的入口） */
export function prependPersonalNavSidebarGroups(
  baseGroups: AdminSidebarNavGroup[],
  recentPaths: string[],
  starPaths: string[],
  showFriendsShortcut: boolean,
  friendsBadgeText?: string
): AdminSidebarNavGroup[] {
  const pathToItem = new Map<string, AdminSidebarNavItem>();
  const friendsBase = buildFriendsNavSidebarItem();
  const ftForMap = (friendsBadgeText || "").trim();
  const friendsWithBadge: AdminSidebarNavItem = {
    ...friendsBase,
    badgeText: ftForMap || undefined,
  };
  /** 无消息侧栏权限时不写入 map，避免「常用/最近」仍出现消息链接 — 与侧栏「消息」分组显隐一致 */
  if (showFriendsShortcut) {
    pathToItem.set(normalizeAdminPath(friendsWithBadge.to), friendsWithBadge);
  }

  for (const g of baseGroups) {
    for (const it of g.items) {
      pathToItem.set(normalizeAdminPath(it.to), it);
    }
    for (const sg of g.subgroups ?? []) {
      for (const it of sg.items) {
        pathToItem.set(normalizeAdminPath(it.to), it);
      }
    }
  }

  const starSet = new Set(starPaths.map(normalizeAdminPath));

  const recentItems: AdminSidebarNavItem[] = [];
  for (const p of recentPaths.map(normalizeAdminPath)) {
    if (starSet.has(p)) continue;
    const src = pathToItem.get(p);
    if (!src) continue;
    recentItems.push({ ...src, key: `${RECENT_GROUP_ID}::${src.key}` });
  }

  const starredItems: AdminSidebarNavItem[] = [];
  for (const p of starPaths.map(normalizeAdminPath)) {
    const src = pathToItem.get(p);
    if (!src) continue;
    starredItems.push({ ...src, key: `${STARS_GROUP_ID}::${src.key}` });
  }

  const out: AdminSidebarNavGroup[] = [];
  if (starredItems.length) {
    out.push({ id: STARS_GROUP_ID, title: "收藏", items: starredItems });
  }
  if (showFriendsShortcut) {
    const ft = (friendsBadgeText || "").trim();
    out.push({
      id: FRIENDS_GROUP_ID,
      title: "消息",
      items: [{ ...friendsWithBadge, key: `${FRIENDS_GROUP_ID}::${friendsWithBadge.key}`, badgeText: ft || undefined }],
    });
  }
  if (recentItems.length) {
    out.push({ id: RECENT_GROUP_ID, title: "常用", items: recentItems });
  }
  const groupsWithPinnedStars = pinStarredInSidebarGroups(baseGroups, starPaths);
  return [...out, ...groupsWithPinnedStars];
}

export function isFriendsSidebarGroupId(id: string): boolean {
  return id === FRIENDS_GROUP_ID;
}

export function isPersonalSidebarGroupId(id: string): boolean {
  return id === RECENT_GROUP_ID || id === STARS_GROUP_ID;
}

export { RECENT_GROUP_ID, STARS_GROUP_ID, FRIENDS_GROUP_ID };
