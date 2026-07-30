import {
  Activity, AlertTriangle, Archive, ArrowLeftRight, BarChart3, Bell, BookOpen,
  CalendarClock, CircleCheck, ClipboardCheck, ClipboardList, Clock, CreditCard,
  Database, DoorOpen, Download, FileText, Filter, GitBranch, GitMerge, Images,
  KeyRound, Layers, LayoutGrid, Link2, LockKeyhole, MapPin, Megaphone,
  MessagesSquare, Monitor, Package, PieChart, Server, Settings, ShieldAlert,
  ShoppingCart, SlidersHorizontal, Table2, TableProperties, Terminal,
  Thermometer, Ticket, Users, Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { fetchAdminNavConfig, type AdminNavConfigNode } from "@/api/domains/adminNavConfig.api";
import type { PendingBadges } from "@/api/domains/me.api";
import type { MinRole, PublicPagePermissionNode } from "@/api/domains/pagePermission.api";
import { hasMinRole } from "@/features/auth/roleAccess";
import { canShowWebEntry } from "@/features/auth/pagePermissionAccess";
import {
  ADMIN_NAV_REGISTRY,
  collectRegistryGroupItems,
  inferHomeSectionTitleForUnknownPath,
  titleForUnknownAdminPath,
  type AdminNavContext,
  type AdminNavRegistryItem,
} from "@/features/admin/adminNavRegistry";
import { shouldHideAdminSidebarPath } from "@/features/admin/hiddenAdminNavPaths";

export type AdminSidebarNavItem = {
  key: string;
  to: string;
  end?: boolean;
  label: string;
  icon: LucideIcon;
  badgeText?: string;
  telemetry?: boolean;
  telemetryReturnStorageKey?: string;
  iconWrapClass?: string;
};

export type AdminSidebarNavSubgroup = {
  id: string;
  title: string;
  items: AdminSidebarNavItem[];
  badgeText?: string;
};

export type AdminSidebarNavGroup = {
  id: string;
  title: string;
  items: AdminSidebarNavItem[];
  subgroups?: AdminSidebarNavSubgroup[];
  badgeText?: string;
};

export type AdminHomeEntry = {
  title: string;
  path: string;
  minRole: MinRole;
  icon: LucideIcon;
  tone: string;
  enabled: boolean;
  badgeText?: string;
};

export type AdminHomeSection = {
  title: string;
  entries: AdminHomeEntry[];
};

export type AdminCommandPaletteItem = {
  id: string;
  path: string;
  label: string;
  groupTitle: string;
  icon?: LucideIcon;
  alias?: string[];
  telemetry?: boolean;
  telemetryReturnStorageKey?: string;
};

/** Look up the homeTone gradient from the registry for a given path */
function lookupRegistryTone(path: string): string {
  const norm = normalizeAdminPath(path);
  for (const g of ADMIN_NAV_REGISTRY) {
    for (const it of collectRegistryGroupItems(g)) {
      if (normalizeAdminPath(it.path) === norm) return it.homeTone;
    }
  }
  return "from-sky-400 to-blue-500"; // fallback
}

function lookupRegistryBadgeKey(path: string): keyof PendingBadges | undefined {
  const norm = normalizeAdminPath(path);
  for (const g of ADMIN_NAV_REGISTRY) {
    for (const it of collectRegistryGroupItems(g)) {
      if (normalizeAdminPath(it.path) === norm) return it.badgeTextKey;
    }
  }
  return undefined;
}

function resolveHomeEntryBadgeText(
  path: string,
  itemBadgeKey: string | null | undefined,
  pendingBadges: PendingBadges | null,
): string | undefined {
  return resolveNavEntryBadgeText(path, itemBadgeKey, pendingBadges);
}

/** 教职工 Twin 命名空间；Admin 壳实际挂载在 /console/admin 下 */
export const STAFF_CONSOLE_NS = "/console";

/** Twin 全屏入口（注册表 canonical 路径，不含 /console 前缀） */
export const TWIN_FULLSCREEN_ENTRY_PATHS = new Set([
  "/animal-room-telemetry",
  "/animal-room-cockpit",
  "/digital-twin-screen",
]);

/**
 * 规范化为注册表用的 canonical 路径（/admin/...）。
 * 兼容 location.pathname（/console/admin/...）与旧 /admin/... 链接。
 */
export function normalizeAdminPath(path: string): string {
  if (!path) return "";
  let withSlash = path.startsWith("/") ? path : `/${path}`;
  withSlash = withSlash.replace(/\/+/g, "/");
  if (withSlash === `${STAFF_CONSOLE_NS}/admin`) return "/admin";
  if (withSlash.startsWith(`${STAFF_CONSOLE_NS}/admin/`)) {
    return withSlash.slice(STAFF_CONSOLE_NS.length);
  }
  if (withSlash.startsWith(`${STAFF_CONSOLE_NS}/`)) {
    const withoutConsole = withSlash.slice(STAFF_CONSOLE_NS.length);
    if (TWIN_FULLSCREEN_ENTRY_PATHS.has(withoutConsole)) return withoutConsole;
  }
  return withSlash;
}

/** canonical /admin/... → 可 navigate 的 /console/admin/... */
export function toAdminRoutePath(path: string): string {
  const canonical = normalizeAdminPath(path);
  if (!canonical || canonical === "/admin") return `${STAFF_CONSOLE_NS}/admin`;
  if (canonical.startsWith("/admin/")) return `${STAFF_CONSOLE_NS}${canonical}`;
  if (TWIN_FULLSCREEN_ENTRY_PATHS.has(canonical)) return `${STAFF_CONSOLE_NS}${canonical}`;
  return path;
}

export function isAdminAreaPath(path: string): boolean {
  const p = normalizeAdminPath(path);
  return p === "/admin" || p.startsWith("/admin/");
}

export function isTwinFullscreenEntryPath(path: string): boolean {
  return TWIN_FULLSCREEN_ENTRY_PATHS.has(normalizeAdminPath(path));
}

/** Twin 主大屏首页（含 /console 命名空间下的 index 与 dashboard 路由） */
export function isTwinDashboardHomePath(pathname: string): boolean {
  let p = normalizeAdminPath(pathname);
  if (p === STAFF_CONSOLE_NS || p.startsWith(`${STAFF_CONSOLE_NS}/`)) {
    p = p.slice(STAFF_CONSOLE_NS.length) || "/";
  }
  return p === "/" || p === "/dashboard" || p === "/dashboard-preview";
}

export function isStaffNavPersonalizationPath(path: string): boolean {
  return isAdminAreaPath(path) || isTwinFullscreenEntryPath(path);
}

export function createAdminNavContext(role: string, permNodes: PublicPagePermissionNode[]): AdminNavContext {
  return {
    role,
    permNodes,
    flags: {
      canManagePersonnel: hasMinRole(role, "SUPER_ADMIN"),
      canRepairRequest: hasMinRole(role, "STAFF"),
      canRepairProcess: hasMinRole(role, "SUPER_ADMIN"),
      canPurchaseRequest: hasMinRole(role, "STAFF"),
      canPurchaseProcess: hasMinRole(role, "SUPER_ADMIN"),
      canViewNotifications: hasMinRole(role, "STAFF"),
      canViewSettings: hasMinRole(role, "ADMIN"),
      canViewMetaStorage: hasMinRole(role, "ADMIN"),
      canSuppliesMall: hasMinRole(role, "ADMIN"),
      canSuppliesAdmin: hasMinRole(role, "SUPER_ADMIN"),
      canSuppliesProcess: hasMinRole(role, "SUPER_ADMIN"),
      canAssetOps: hasMinRole(role, "STAFF"),
    },
  };
}

export function resolveEntryMinRole(nodes: PublicPagePermissionNode[], path: string, fallback: MinRole): MinRole {
  const matched = nodes.find(
    (n) =>
      n.platform === "WEB" &&
      n.nodeType === "ENTRY" &&
      (n.entrySource || "other") === "sidebar" &&
      normalizeAdminPath(n.pathOrRoute) === normalizeAdminPath(path)
  );
  return (matched?.minRole as MinRole) || fallback;
}

function badgeTextFromKey(pending: PendingBadges | null, key?: keyof PendingBadges): string | undefined {
  if (!pending || !key) return undefined;
  const v = pending[key];
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t || undefined;
}

/** 从 badgeText 字符串提取数字（"5"→5, "99+"→99, "3条"→3, ""→0） */
function parseBadgeNumber(text?: string): number {
  if (!text) return 0;
  const m = text.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

/** 计算文件夹内所有项目的角标数字总和 */
function computeGroupBadge(items: AdminSidebarNavItem[]): string | undefined {
  let total = 0;
  for (const it of items) {
    total += parseBadgeNumber(it.badgeText);
  }
  return total > 0 ? formatBadgeCount(total) : undefined;
}

function formatBadgeCount(n: number): string {
  if (n <= 0) return "";
  return n > 99 ? "99+" : String(n);
}

/** 为所有分组/子分组注入聚合角标 */
export function injectGroupBadges(groups: AdminSidebarNavGroup[]): AdminSidebarNavGroup[] {
  return groups.map((g) => {
    const subgroups: AdminSidebarNavSubgroup[] | undefined = g.subgroups?.map((sg) => ({
      ...sg,
      badgeText: computeGroupBadge(sg.items),
    }));
    const allItems = [...g.items, ...(subgroups?.flatMap((sg) => sg.items) ?? [])];
    return { ...g, subgroups, badgeText: computeGroupBadge(allItems) };
  });
}

/** 学生审核入口角标：物资待审 + 延迟免冻结待审 + 培训审批待处理 */
export function formatStudentReviewBadgeCount(material: number, scanDelay: number, training?: number): string | undefined {
  const total = Math.max(0, material) + Math.max(0, scanDelay) + Math.max(0, training ?? 0);
  const text = formatBadgeCount(total);
  return text || undefined;
}

/** 侧栏/收藏/常用中的「学生审核」入口统一覆盖角标（以 live 待审列表为准） */
export function patchStudentReviewNavBadges(
  groups: AdminSidebarNavGroup[],
  badgeText: string | undefined,
): AdminSidebarNavGroup[] {
  const target = normalizeAdminPath("/admin/material/review");
  const patch = (it: AdminSidebarNavItem): AdminSidebarNavItem =>
    normalizeAdminPath(it.to) === target ? { ...it, badgeText: badgeText || undefined } : it;
  return groups.map((g) => ({
    ...g,
    items: g.items.map(patch),
    subgroups: g.subgroups?.map((sg) => ({ ...sg, items: sg.items.map(patch) })),
  }));
}

/** 学生审核入口：物资待审 + 延迟免冻结待审 + 培训审批（侧栏显示总数，页面内各 tab 标题独立计数） */
function studentReviewBadgeText(pending: PendingBadges | null, trainingOverride?: number): string | undefined {
  if (!pending) return undefined;
  return formatStudentReviewBadgeCount(pending.processMaterial ?? 0, pending.processScanDelay ?? 0, trainingOverride);
}

function isMaterialReviewNavPath(path: string): boolean {
  return normalizeAdminPath(path) === normalizeAdminPath("/admin/material/review");
}

function resolveNavEntryBadgeText(
  path: string,
  itemBadgeKey: string | null | undefined,
  pendingBadges: PendingBadges | null,
): string | undefined {
  if (isMaterialReviewNavPath(path)) {
    return studentReviewBadgeText(pendingBadges);
  }
  return badgeTextFromKey(
    pendingBadges,
    (itemBadgeKey as keyof PendingBadges | undefined) ?? lookupRegistryBadgeKey(path),
  );
}

/** 收集侧栏/工作台已占用的 canonical 路径（防 registry 回填补重复） */
function collectKnownNavPaths(
  sidebarGroups: AdminSidebarNavGroup[],
  homeSections?: AdminHomeSection[],
  serverNodes?: AdminNavConfigNode[],
): Set<string> {
  const known = new Set<string>();
  const add = (path: string | null | undefined) => {
    const norm = normalizeAdminPath(path || "");
    if (norm) known.add(norm);
  };
  for (const g of sidebarGroups) {
    for (const it of g.items) add(it.to);
    for (const sg of g.subgroups ?? []) {
      for (const it of sg.items) add(it.to);
    }
  }
  for (const s of homeSections ?? []) {
    for (const e of s.entries) add(e.path);
  }
  if (serverNodes) {
    const walk = (nodes: AdminNavConfigNode[]) => {
      for (const n of nodes) {
        if (n.type === "ITEM") add(n.itemPath);
        if (n.children?.length) walk(n.children);
      }
    };
    walk(serverNodes);
  }
  return known;
}

/** 侧栏全局按路径去重（保留首次出现；避免 server config + registry 回补双份） */
function dedupeSidebarNavGroups(groups: AdminSidebarNavGroup[]): AdminSidebarNavGroup[] {
  const seenGlobal = new Set<string>();
  return groups
    .map((g) => {
      const seenLocal = new Set<string>();
      const dedupe = (items: AdminSidebarNavItem[]) =>
        items.filter((it) => {
          const p = normalizeAdminPath(it.to);
          if (!p || seenGlobal.has(p) || seenLocal.has(p)) return false;
          seenGlobal.add(p);
          seenLocal.add(p);
          return true;
        });
      const items = dedupe(g.items);
      const subgroups = g.subgroups
        ?.map((sg) => ({ ...sg, items: dedupe(sg.items) }))
        .filter((sg) => sg.items.length > 0);
      return { ...g, items, subgroups: subgroups?.length ? subgroups : undefined };
    })
    .filter((g) => g.items.length > 0 || (g.subgroups?.length ?? 0) > 0);
}

/** 工作台分组内按路径去重（修复 React key `${title}:${path}` 冲突） */
function dedupeHomeSections(sections: AdminHomeSection[]): AdminHomeSection[] {
  const seenGlobal = new Set<string>();
  return sections
    .map((s) => {
      const seenLocal = new Set<string>();
      const entries = s.entries.filter((e) => {
        const p = normalizeAdminPath(e.path);
        if (!p || seenGlobal.has(p) || seenLocal.has(p)) return false;
        seenGlobal.add(p);
        seenLocal.add(p);
        return true;
      });
      return { ...s, entries };
    })
    .filter((s) => s.entries.length > 0);
}

function registryItemToHomeEntry(
  it: AdminNavRegistryItem,
  ctx: AdminNavContext,
  pendingBadges: PendingBadges | null,
): AdminHomeEntry {
  const effectiveMinRole = resolveEntryMinRole(ctx.permNodes, it.path, it.fallbackMinRole);
  const roleOk = hasMinRole(ctx.role, effectiveMinRole);
  const permOk = canShowWebEntry(ctx.permNodes, it.path, "sidebar", ctx.role, effectiveMinRole);
  return {
    title: it.label,
    path: it.path,
    minRole: effectiveMinRole,
    icon: it.icon,
    tone: it.homeTone,
    enabled: roleOk && permOk,
    badgeText: resolveHomeEntryBadgeText(it.path, it.badgeTextKey, pendingBadges),
  };
}

const SIDEBAR_ICON_WRAP_PALETTE = [
  "bg-sky-500/25 text-sky-100 ring-sky-400/35",
  "bg-violet-500/25 text-violet-100 ring-violet-400/35",
  "bg-emerald-500/25 text-emerald-100 ring-emerald-400/35",
  "bg-amber-500/25 text-amber-100 ring-amber-400/35",
  "bg-rose-500/25 text-rose-100 ring-rose-400/35",
  "bg-cyan-500/25 text-cyan-100 ring-cyan-400/35",
  "bg-fuchsia-500/25 text-fuchsia-100 ring-fuchsia-400/35",
  "bg-orange-500/25 text-orange-100 ring-orange-400/35",
  "bg-teal-500/25 text-teal-100 ring-teal-400/35",
  "bg-indigo-500/25 text-indigo-100 ring-indigo-400/35",
  "bg-lime-500/20 text-lime-100 ring-lime-400/30",
  "bg-blue-500/25 text-blue-100 ring-blue-400/35",
] as const;

export function sidebarIconWrapForNavId(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return SIDEBAR_ICON_WRAP_PALETTE[Math.abs(h) % SIDEBAR_ICON_WRAP_PALETTE.length];
}

export function buildFriendsNavSidebarItem(): AdminSidebarNavItem {
  return {
    key: "staff-messages",
    to: toAdminRoutePath("/admin/staff-messages"),
    label: "消息",
    icon: MessagesSquare,
    iconWrapClass: sidebarIconWrapForNavId("staff-messages"),
  };
}

function registryItemToSidebar(it: AdminNavRegistryItem, pendingBadges: PendingBadges | null): AdminSidebarNavItem {
  const badgeText = resolveNavEntryBadgeText(it.path, it.badgeTextKey, pendingBadges);
  return {
    key: it.id,
    to: toAdminRoutePath(it.path),
    end: it.navEnd,
    label: it.label,
    icon: it.icon,
    telemetry: it.telemetry,
    telemetryReturnStorageKey: it.telemetryReturnStorageKey,
    badgeText,
    iconWrapClass: sidebarIconWrapForNavId(it.id),
  };
}

function buildLegacyAdminNavModel(ctx: AdminNavContext, pendingBadges: PendingBadges | null) {
  const sidebarGroups: AdminSidebarNavGroup[] = [];
  for (const g of ADMIN_NAV_REGISTRY) {
    const items: AdminSidebarNavItem[] = [];
    for (const it of g.items ?? []) {
      if (!it.sidebarVisible(ctx)) continue;
      const nav = registryItemToSidebar(it, pendingBadges);
      if (nav) items.push(nav);
    }
    const subgroups: AdminSidebarNavSubgroup[] = [];
    for (const sg of g.subgroups ?? []) {
      const sgItems: AdminSidebarNavItem[] = [];
      for (const it of sg.items) {
        if (!it.sidebarVisible(ctx)) continue;
        const nav = registryItemToSidebar(it, pendingBadges);
        if (nav) sgItems.push(nav);
      }
      if (sgItems.length) subgroups.push({ id: sg.id, title: sg.title, items: sgItems });
    }
    if (items.length || subgroups.length) {
      sidebarGroups.push({ id: g.id, title: g.title, items, subgroups: subgroups.length ? subgroups : undefined });
    }
  }

  const knownPaths = new Set(
    ADMIN_NAV_REGISTRY.flatMap((g) => collectRegistryGroupItems(g).map((it) => normalizeAdminPath(it.path)))
  );

  const homeSections: AdminHomeSection[] = ADMIN_NAV_REGISTRY.map((g) => ({
    title: g.title,
    entries: collectRegistryGroupItems(g).map((it) => {
      const effectiveMinRole = resolveEntryMinRole(ctx.permNodes, it.path, it.fallbackMinRole);
      const roleOk = hasMinRole(ctx.role, effectiveMinRole);
      const permOk = canShowWebEntry(ctx.permNodes, it.path, "sidebar", ctx.role, effectiveMinRole);
      return {
        title: it.label,
        path: it.path,
        minRole: effectiveMinRole,
        icon: it.icon,
        tone: it.homeTone,
        enabled: roleOk && permOk,
        badgeText: resolveHomeEntryBadgeText(it.path, it.badgeTextKey, pendingBadges),
      };
    }),
  }));

  const seenAutoPath = new Set<string>();
  const autoEntries: Array<AdminHomeEntry & { groupTitle: string }> = [];
  for (const n of ctx.permNodes) {
    if (!n || n.platform !== "WEB" || n.nodeType !== "ENTRY" || n.entrySource !== "sidebar") continue;
    const p = normalizeAdminPath(n.pathOrRoute);
    if (!p || knownPaths.has(p) || seenAutoPath.has(p) || shouldHideAdminSidebarPath(p)) continue;
    seenAutoPath.add(p);
    const minRole = (n.minRole as MinRole) || "MEMBER";
    const roleOk = hasMinRole(ctx.role, minRole);
    const permOk = canShowWebEntry(ctx.permNodes, n.pathOrRoute, "sidebar", ctx.role, minRole);
    autoEntries.push({
      title: titleForUnknownAdminPath(n.pathOrRoute),
      path: n.pathOrRoute,
      minRole,
      icon: Layers,
      tone: lookupRegistryTone(n.pathOrRoute),
      enabled: roleOk && permOk,
      groupTitle: inferHomeSectionTitleForUnknownPath(p),
    });
  }

  let mergedHome = homeSections.map((s) => ({ ...s, entries: [...s.entries] }));
  const unknown: AdminHomeEntry[] = [];
  for (const entry of autoEntries) {
    if (entry.groupTitle === "自动发现") {
      unknown.push(entry);
      continue;
    }
    const target = mergedHome.find((s) => s.title === entry.groupTitle);
    if (target) {
      const { groupTitle: _g, ...rest } = entry;
      target.entries.push(rest);
    } else {
      unknown.push(entry);
    }
  }
  // Auto-discover disabled — only registry entries appear

  const dedupedSidebarGroups = dedupeSidebarNavGroups(sidebarGroups);
  const dedupedHomeSections = dedupeHomeSections(mergedHome);

  const registryLookup = new Map(ADMIN_NAV_REGISTRY.flatMap(g =>
    collectRegistryGroupItems(g).map(it => [it.id, it])
  ));
  const flatNavigableItems: AdminCommandPaletteItem[] = dedupedSidebarGroups.flatMap((g) => {
    const top = g.items.map((it) => {
      const reg = registryLookup.get(it.key);
      return {
        id: it.key, path: it.to, label: it.label, groupTitle: g.title,
        icon: it.icon ?? reg?.icon,
        alias: reg?.alias,
        telemetry: it.telemetry,
        telemetryReturnStorageKey: it.telemetryReturnStorageKey,
      };
    });
    const nested = (g.subgroups ?? []).flatMap((sg) =>
      sg.items.map((it) => {
        const reg = registryLookup.get(it.key);
        return {
          id: it.key, path: it.to, label: it.label, groupTitle: `${g.title} · ${sg.title}`,
          icon: it.icon ?? reg?.icon,
          alias: reg?.alias,
          telemetry: it.telemetry,
          telemetryReturnStorageKey: it.telemetryReturnStorageKey,
        };
      })
    );
    return [...top, ...nested];
  });

  return {
    sidebarGroups: dedupedSidebarGroups,
    homeSections: dedupedHomeSections,
    flatNavigableItems,
  };
}

const ICON_MAP: Record<string, LucideIcon> = {
  Activity, AlertTriangle, Archive, ArrowLeftRight, BarChart3, Bell, BookOpen,
  CalendarClock, CircleCheck, ClipboardCheck, ClipboardList, Clock, CreditCard,
  Database, DoorOpen, Download, FileText, Filter, GitBranch, GitMerge, Images,
  KeyRound, Layers, LayoutGrid, Link2, LockKeyhole, MapPin, Megaphone,
  MessagesSquare, Monitor, Package, PieChart, Server, Settings, ShieldAlert,
  ShoppingCart, SlidersHorizontal, Table2, TableProperties, Terminal,
  Thermometer, Ticket, Users, Wrench,
};

function resolveIconByName(name: string | null | undefined): LucideIcon {
  if (!name) return FileText;
  return ICON_MAP[name] ?? FileText;
}

/** Registry 路径 → AdminNavRegistryItem 查找表，供 server config 模型校验侧栏可见性 */
function buildRegistryItemByPath(): Map<string, AdminNavRegistryItem> {
  const map = new Map<string, AdminNavRegistryItem>();
  for (const g of ADMIN_NAV_REGISTRY) {
    for (const it of collectRegistryGroupItems(g)) {
      map.set(normalizeAdminPath(it.path), it);
    }
  }
  return map;
}

function nodeToSidebarItem(
  node: AdminNavConfigNode,
  pendingBadges: PendingBadges | null,
  ctx: AdminNavContext,
  registryByPath: Map<string, AdminNavRegistryItem>,
): AdminSidebarNavItem | null {
  if (node.type !== "ITEM" || !node.itemPath) return null;
  if (shouldHideAdminSidebarPath(node.itemPath)) return null;
  // 若 Registry 有对应条目，以 Registry 的 sidebarVisible 为准（防止 DB config 绕过）
  const regItem = registryByPath.get(normalizeAdminPath(node.itemPath));
  if (regItem && !regItem.sidebarVisible(ctx)) return null;
  const effectiveMinRole = resolveEntryMinRole(ctx.permNodes, node.itemPath, "STAFF");
  const roleOk = hasMinRole(ctx.role, effectiveMinRole);
  const permOk = canShowWebEntry(ctx.permNodes, node.itemPath, "sidebar", ctx.role, effectiveMinRole);
  if (!roleOk || !permOk) return null;
  return {
    key: node.id,
    to: toAdminRoutePath(node.itemPath),
    label: node.title,
    icon: resolveIconByName(node.itemIcon),
    badgeText: resolveNavEntryBadgeText(node.itemPath, node.itemBadgeKey, pendingBadges),
    iconWrapClass: sidebarIconWrapForNavId(node.id),
  };
}

function convertServerConfigToModel(
  nodes: AdminNavConfigNode[],
  pendingBadges: PendingBadges | null,
  ctx: AdminNavContext,
): {
  sidebarGroups: AdminSidebarNavGroup[];
  homeSections: AdminHomeSection[];
} {
  const sidebarGroups: AdminSidebarNavGroup[] = [];
  const homeSections: AdminHomeSection[] = [];
  const registryByPath = buildRegistryItemByPath();

  for (const node of nodes) {
    if (node.type !== "GROUP" || !node.visible) continue;

    // Build sidebar group
    const items: AdminSidebarNavItem[] = [];
    const subgroups: AdminSidebarNavSubgroup[] = [];

    for (const child of node.children ?? []) {
      if (child.type === "ITEM" && child.visible) {
        const si = nodeToSidebarItem(child, pendingBadges, ctx, registryByPath);
        if (si) items.push(si);
      } else if (child.type === "SUBGROUP" && child.visible) {
        const sgItems: AdminSidebarNavItem[] = [];
        for (const sgChild of child.children ?? []) {
          if (sgChild.type === "ITEM" && sgChild.visible) {
            const si = nodeToSidebarItem(sgChild, pendingBadges, ctx, registryByPath);
            if (si) sgItems.push(si);
          }
        }
        if (sgItems.length) {
          subgroups.push({ id: child.id, title: child.title, items: sgItems });
        }
      }
    }

    if (items.length || subgroups.length) {
      sidebarGroups.push({
        id: node.id,
        title: node.title,
        items,
        subgroups: subgroups.length ? subgroups : undefined,
      });
    }

    // Build home section（含子分组内入口，与侧栏可见范围一致）
    const entries: AdminHomeEntry[] = [];
    const pushHomeEntry = (itemNode: AdminNavConfigNode) => {
      if (itemNode.type !== "ITEM" || !itemNode.visible) return;
      const path = itemNode.itemPath || "";
      if (!path || shouldHideAdminSidebarPath(path)) return;
      const effectiveMinRole = resolveEntryMinRole(ctx.permNodes, path, "STAFF");
      const roleOk = hasMinRole(ctx.role, effectiveMinRole);
      const permOk = canShowWebEntry(ctx.permNodes, path, "sidebar", ctx.role, effectiveMinRole);
      entries.push({
        title: itemNode.title,
        path,
        minRole: effectiveMinRole,
        icon: resolveIconByName(itemNode.itemIcon),
        tone: lookupRegistryTone(path),
        enabled: roleOk && permOk,
        badgeText: resolveHomeEntryBadgeText(path, itemNode.itemBadgeKey, pendingBadges),
      });
    };
    for (const child of node.children ?? []) {
      if (child.type === "ITEM") {
        pushHomeEntry(child);
      } else if (child.type === "SUBGROUP" && child.visible) {
        for (const sgChild of child.children ?? []) {
          pushHomeEntry(sgChild);
        }
      }
    }
    if (entries.length) {
      homeSections.push({ title: node.title, entries });
    }
  }

  return { sidebarGroups: injectGroupBadges(sidebarGroups), homeSections };
}

export async function buildAdminNavModel(ctx: AdminNavContext, pendingBadges: PendingBadges | null) {
  // 1. Try server config
  const serverConfig = await fetchAdminNavConfig();

  let sidebarGroups: AdminSidebarNavGroup[];
  let homeSections: AdminHomeSection[];

  if (serverConfig.length > 0) {
    const model = convertServerConfigToModel(serverConfig, pendingBadges, ctx);
    // 过滤掉 registry 中已不存在的条目（如被删除的 push-log）
    const registryPathSet = new Set(
      ADMIN_NAV_REGISTRY.flatMap(g => collectRegistryGroupItems(g).map(it => normalizeAdminPath(it.path)))
    );
    const filterStale = (items: AdminSidebarNavItem[]) =>
      items.filter(it => registryPathSet.has(normalizeAdminPath(it.to)));
    sidebarGroups = model.sidebarGroups.map(g => ({
      ...g,
      items: filterStale(g.items),
      subgroups: g.subgroups?.map(sg => ({ ...sg, items: filterStale(sg.items) })).filter(sg => sg.items.length > 0),
    })).filter(g => g.items.length > 0 || (g.subgroups?.length ?? 0) > 0);
    homeSections = model.homeSections;
  } else {
    // Fallback to hardcoded registry
    const legacy = buildLegacyAdminNavModel(ctx, pendingBadges);
    sidebarGroups = legacy.sidebarGroups;
    homeSections = legacy.homeSections;
  }

  // Build flat navigable items (same logic as before, works with either source)
  let knownPaths = collectKnownNavPaths(sidebarGroups, homeSections, serverConfig.length > 0 ? serverConfig : undefined);

  // 将硬编码 registry 中、服务器 config 中缺失的条目补回侧栏。
  // 这样新增的代码定义入口即使服务器 config 中不存在也可见。
  const syncQueue: { path: string; label: string; icon: string; groupTitle: string }[] = [];
  for (const rg of ADMIN_NAV_REGISTRY) {
    const missing: AdminNavRegistryItem[] = [];
    for (const ri of collectRegistryGroupItems(rg)) {
      if (knownPaths.has(normalizeAdminPath(ri.path))) continue;
      if (!ri.sidebarVisible(ctx)) continue;
      missing.push(ri);
    }
    if (!missing.length) continue;

    // 尝试匹配服务器 config 中同标题的分组
    let targetGroup = sidebarGroups.find((g) => g.title === rg.title);
    if (!targetGroup) {
      targetGroup = { id: `fallback-${rg.id}`, title: rg.title, items: [] };
      sidebarGroups.push(targetGroup);
    }
    let targetHome = homeSections.find((s) => s.title === rg.title);
    if (!targetHome) {
      targetHome = { title: rg.title, entries: [] };
      homeSections.push(targetHome);
    }

    for (const ri of missing) {
      const norm = normalizeAdminPath(ri.path);
      if (knownPaths.has(norm)) continue;
      targetGroup.items.push(registryItemToSidebar(ri, pendingBadges));
      targetHome.entries.push(registryItemToHomeEntry(ri, ctx, pendingBadges));
      knownPaths.add(norm);
      // 异步同步到后端 DB，使 AdminNavManager 可见
      if (serverConfig.length > 0) {
        syncQueue.push({
          path: ri.path,
          label: ri.label,
          icon: (ri.icon as any)?.displayName || 'Layers',
          groupTitle: rg.title,
        });
      }
    }
  }

  // 后台异步：将注册表缺失条目写入 admin_nav_config，使其在 AdminNavManager 中可见
  if (syncQueue.length > 0) {
    import("@/api/domains/adminNavConfig.api").then(({ ensureNavItems }) => {
      ensureNavItems(syncQueue).catch(() => {});
    });
  }

  // Auto-discovered entries from page permissions (keep existing logic for unknown paths)
  const seenAutoPath = new Set<string>();
  const autoEntries: Array<AdminHomeEntry & { groupTitle: string }> = [];
  for (const n of ctx.permNodes) {
    if (!n || n.platform !== "WEB" || n.nodeType !== "ENTRY" || n.entrySource !== "sidebar") continue;
    const p = normalizeAdminPath(n.pathOrRoute);
    if (!p || knownPaths.has(p) || seenAutoPath.has(p) || shouldHideAdminSidebarPath(p)) continue;
    seenAutoPath.add(p);
    const minRole = (n.minRole as MinRole) || "MEMBER";
    const roleOk = hasMinRole(ctx.role, minRole);
    const permOk = canShowWebEntry(ctx.permNodes, n.pathOrRoute, "sidebar", ctx.role, minRole);
    autoEntries.push({
      title: titleForUnknownAdminPath(n.pathOrRoute),
      path: n.pathOrRoute,
      minRole,
      icon: Layers,
      tone: lookupRegistryTone(n.pathOrRoute),
      enabled: roleOk && permOk,
      groupTitle: inferHomeSectionTitleForUnknownPath(p),
    });
  }

  let mergedHome = homeSections.map((s) => ({ ...s, entries: [...s.entries] }));
  const unknown: AdminHomeEntry[] = [];
  for (const entry of autoEntries) {
    if (entry.groupTitle === "自动发现") {
      unknown.push(entry);
      continue;
    }
    const target = mergedHome.find((s) => s.title === entry.groupTitle);
    if (target) {
      const { groupTitle: _g, ...rest } = entry;
      target.entries.push(rest);
    } else {
      unknown.push(entry);
    }
  }
  // Auto-discover disabled — only registry entries appear

  sidebarGroups = dedupeSidebarNavGroups(sidebarGroups);
  mergedHome = dedupeHomeSections(mergedHome);

  const registryLookup = new Map(ADMIN_NAV_REGISTRY.flatMap(g =>
    collectRegistryGroupItems(g).map(it => [it.id, it])
  ));
  const flatNavigableItems: AdminCommandPaletteItem[] = sidebarGroups.flatMap((g) => {
    const top = g.items.map((it) => {
      const reg = registryLookup.get(it.key);
      return {
        id: it.key, path: it.to, label: it.label, groupTitle: g.title,
        icon: it.icon ?? reg?.icon,
        alias: reg?.alias,
        telemetry: it.telemetry,
        telemetryReturnStorageKey: it.telemetryReturnStorageKey,
      };
    });
    const nested = (g.subgroups ?? []).flatMap((sg) =>
      sg.items.map((it) => {
        const reg = registryLookup.get(it.key);
        return {
          id: it.key, path: it.to, label: it.label, groupTitle: `${g.title} · ${sg.title}`,
          icon: it.icon ?? reg?.icon,
          alias: reg?.alias,
          telemetry: it.telemetry,
          telemetryReturnStorageKey: it.telemetryReturnStorageKey,
        };
      })
    );
    return [...top, ...nested];
  });

  return { sidebarGroups: injectGroupBadges(sidebarGroups), homeSections: mergedHome, flatNavigableItems };
}
