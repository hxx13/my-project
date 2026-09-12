import type { PublicPagePermissionNode } from "@/api/domains/pagePermission.api";
import { ADMIN_NAV_REGISTRY, collectRegistryGroupItems, titleForUnknownAdminPath, type AdminNavContext } from "@/features/admin/adminNavRegistry";
import { isAdminAreaPath, normalizeAdminPath, toAdminRoutePath } from "@/features/admin/buildAdminNavModel";
import { shouldHideAdminSidebarPath } from "@/features/admin/hiddenAdminNavPaths";

/**
 * 后台壳层导航（顶栏返回 / 页题）：对齐 `docs/ADMIN_UI_STYLE.md` 中引用的 Vercel 式信息密度与层次，
 * 路径判定与侧栏注册表 + 权限下发的 sidebar ENTRY 一致，避免「一级入口误出返回」。
 */

/** path → 注册项：一级入口判定要看该项在当前身份下是否真的可见，不能只看路径在不在注册表里 */
const REGISTRY_ITEMS_BY_PATH = new Map(
  ADMIN_NAV_REGISTRY.flatMap((g) => collectRegistryGroupItems(g)).map((it) => [normalizeAdminPath(it.path), it] as const)
);

/** 注册表未列名、但路由存在的子页：用于页题；壳层「返回」仍由 shouldShowAdminShellBack 控制 */
const SECONDARY_ROUTE_TITLE: Record<string, string> = {
  "/admin/supplies/manage": "物资管理",
  "/admin/supplies/process": "领用出库处理",
  "/admin/material/review": "学生审核",
  "/admin/material/manage": "物品管理",
  "/admin/material/audit": "物资申领统计",
  "/admin/material/audit-export": "申领审计导出",
};

/** 无 location.state.returnTo 时的默认回退路径 */
const DEFAULT_BACK_PARENT: Record<string, string> = {
  "/admin/supplies/manage": "/admin/supplies",
  "/admin/supplies/process": "/admin/supplies/audit-export",
  "/admin/material/review": "/admin",
  "/admin/material/manage": "/admin/material/review",
  "/admin/material/audit": "/admin/analytics?report=material_stats",
  "/admin/material/audit-export": "/admin/material/review",
  "/admin/cage-shelves/forms": "/admin/cage-shelves",
  "/admin/cage-shelves/forms/audit": "/admin/cage-shelves/forms",
  "/admin/cage-shelves/forms/manage": "/admin/cage-shelves/forms",
  "/admin/cage-shelves/forms/codelists": "/admin/cage-shelves/forms/manage",
  "/admin/cage-shelves/forms/fields": "/admin/cage-shelves/forms/manage",
};

/** 动态子路由的默认回退（最长前缀匹配） */
const DEFAULT_BACK_PARENT_PREFIX: { prefix: string; parent: string }[] = [
  { prefix: "/admin/report-fill/", parent: "/admin/report-fill" },
  { prefix: "/admin/report-form/", parent: "/admin/report-form" },
  { prefix: "/admin/cage-shelves/forms/edit/", parent: "/admin/cage-shelves/forms" },
  { prefix: "/admin/cage-shelves/forms/fields/", parent: "/admin/cage-shelves/forms/manage" },
];

export function collectSidebarEntryPathsFromPerm(permNodes: PublicPagePermissionNode[]): Set<string> {
  const s = new Set<string>();
  for (const n of permNodes) {
    if (!n || n.platform !== "WEB" || n.nodeType !== "ENTRY" || n.entrySource !== "sidebar") continue;
    s.add(normalizeAdminPath(n.pathOrRoute));
  }
  return s;
}

function stripPathQuery(pathname: string): string {
  const noQuery = pathname.split("?")[0] || "/";
  const trimmed = noQuery.replace(/\/+$/, "") || "/";
  return normalizeAdminPath(trimmed);
}

/** 当前 URL 是否对应侧栏「一级」入口（含权限动态下发的 ENTRY）
 *  —— 已从侧栏移除的路由（HIDDEN_ADMIN_SIDEBAR_PATHS / 已合并路由）不算一级，否则子页永远出不来返回；
 *  —— 注册表项还要按当前身份过一遍 sidebarVisible，否则「注册表里有、但这个人的侧栏里没有」的页面同样会被误判。 */
export function isAdminPrimarySidebarPath(pathname: string, permSidebarPaths: Set<string>, navCtx?: AdminNavContext): boolean {
  const p = stripPathQuery(pathname);
  if (p === "/admin") return true;
  if (shouldHideAdminSidebarPath(p)) return false;
  const reg = REGISTRY_ITEMS_BY_PATH.get(p);
  if (reg) return navCtx ? reg.sidebarVisible(navCtx) : true;
  return permSidebarPaths.has(p);
}

/**
 * 是否在顶栏展示「返回」：非一级、且在 /admin 下；个人中心页内自带返回，壳层不再重复。
 */
export function shouldShowAdminShellBack(pathname: string, permSidebarPaths: Set<string>, navCtx?: AdminNavContext): boolean {
  const p = stripPathQuery(pathname);
  if (!isAdminAreaPath(p)) return false;
  if (p === "/admin") return false;
  if (p === "/admin/profile-security") return false;
  return !isAdminPrimarySidebarPath(pathname, permSidebarPaths, navCtx);
}

/** 顶栏不展示标题的页面（页面自身已提供更强的视觉层级，重复标题属冗余） */
const TITLE_SUPPRESSED_PATHS = new Set([
  "/admin/student-violations",
  "/admin/logging-console",
  "/admin/cage-shelves/forms",
  "/admin/cage-shelves/forms/audit",
  "/admin/cage-shelves/forms/manage",
  "/admin/cage-shelves/forms/codelists",
  "/admin/cage-shelves/forms/fields",
]);

const TITLE_SUPPRESSED_PREFIXES = [
  "/admin/cage-shelves/forms/edit/",
  "/admin/cage-shelves/forms/fields/",
];

/** 动态子路由页题（含 :id 等段），注册表列不了 */
const SECONDARY_ROUTE_TITLE_PREFIX: { prefix: string; suffix?: string; title: string }[] = [
  { prefix: "/admin/report-form/", suffix: "/design", title: "报表设计" },
  { prefix: "/admin/report-form/", suffix: "/submissions", title: "填报记录" },
  { prefix: "/admin/report-fill/", title: "报表填报" },
];

export function adminChromeTitle(pathname: string): string {
  const p = stripPathQuery(pathname);
  if (p === "/admin") return "后台工作台";
  if (TITLE_SUPPRESSED_PATHS.has(p)) return "";
  if (TITLE_SUPPRESSED_PREFIXES.some((prefix) => p.startsWith(prefix) && p.length > prefix.length)) return "";
  const exact = SECONDARY_ROUTE_TITLE[p];
  if (exact) return exact;
  for (const { prefix, suffix, title } of SECONDARY_ROUTE_TITLE_PREFIX) {
    if (p.startsWith(prefix) && p.length > prefix.length && (!suffix || p.endsWith(suffix))) return title;
  }
  return titleForUnknownAdminPath(p);
}

export function resolveAdminShellBackTo(pathname: string, returnToState: unknown): string {
  const raw = returnToState as { returnTo?: unknown } | null | undefined;
  const rt = raw?.returnTo;
  if (typeof rt === "string") {
    const t = rt.trim();
    if (t.startsWith("/") && !t.startsWith("//")) {
      const qIdx = t.indexOf("?");
      const pathOnly = qIdx >= 0 ? t.slice(0, qIdx) : t;
      const query = qIdx >= 0 ? t.slice(qIdx) : "";
      return toAdminRoutePath(normalizeAdminPath(pathOnly)) + query;
    }
  }
  const p = stripPathQuery(pathname);
  const exact = DEFAULT_BACK_PARENT[p];
  if (exact) return toAdminRoutePath(exact);
  for (const { prefix, parent } of DEFAULT_BACK_PARENT_PREFIX) {
    if (p.startsWith(prefix) && p.length > prefix.length) return toAdminRoutePath(parent);
  }
  return toAdminRoutePath("/admin");
}
