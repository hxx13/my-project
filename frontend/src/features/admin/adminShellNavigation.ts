import type { PublicPagePermissionNode } from "@/api/domains/pagePermission.api";
import { ADMIN_NAV_REGISTRY, collectRegistryGroupItems, titleForUnknownAdminPath } from "@/features/admin/adminNavRegistry";
import { isAdminAreaPath, normalizeAdminPath, toAdminRoutePath } from "@/features/admin/buildAdminNavModel";

/**
 * 后台壳层导航（顶栏返回 / 页题）：对齐 `docs/ADMIN_UI_STYLE.md` 中引用的 Vercel 式信息密度与层次，
 * 路径判定与侧栏注册表 + 权限下发的 sidebar ENTRY 一致，避免「一级入口误出返回」。
 */

const REGISTRY_SIDEBAR_PATHS = new Set(
  ADMIN_NAV_REGISTRY.flatMap((g) => collectRegistryGroupItems(g).map((it) => normalizeAdminPath(it.path)))
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
};

/** 动态子路由的默认回退（最长前缀匹配） */
const DEFAULT_BACK_PARENT_PREFIX: { prefix: string; parent: string }[] = [
  { prefix: "/admin/report-fill/", parent: "/admin/report-fill" },
  { prefix: "/admin/report-form/", parent: "/admin/report-form" },
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

/** 当前 URL 是否对应侧栏「一级」入口（含权限动态下发的 ENTRY） */
export function isAdminPrimarySidebarPath(pathname: string, permSidebarPaths: Set<string>): boolean {
  const p = stripPathQuery(pathname);
  if (p === "/admin") return true;
  if (REGISTRY_SIDEBAR_PATHS.has(p)) return true;
  if (permSidebarPaths.has(p)) return true;
  return false;
}

/**
 * 是否在顶栏展示「返回」：非一级、且在 /admin 下；个人中心页内自带返回，壳层不再重复。
 */
export function shouldShowAdminShellBack(pathname: string, permSidebarPaths: Set<string>): boolean {
  const p = stripPathQuery(pathname);
  if (!isAdminAreaPath(p)) return false;
  if (p === "/admin") return false;
  if (p === "/admin/profile-security") return false;
  return !isAdminPrimarySidebarPath(pathname, permSidebarPaths);
}

/** 顶栏不展示标题的页面（页面自身已提供更强的视觉层级，重复标题属冗余） */
const TITLE_SUPPRESSED_PATHS = new Set(["/admin/student-violations"]);

export function adminChromeTitle(pathname: string): string {
  const p = stripPathQuery(pathname);
  if (p === "/admin") return "后台工作台";
  if (TITLE_SUPPRESSED_PATHS.has(p)) return "";
  return SECONDARY_ROUTE_TITLE[p] ?? titleForUnknownAdminPath(p);
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
