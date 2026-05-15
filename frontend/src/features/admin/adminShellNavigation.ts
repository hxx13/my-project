import type { PublicPagePermissionNode } from "@/api/domains/pagePermission.api";
import { ADMIN_NAV_REGISTRY, titleForUnknownAdminPath } from "@/features/admin/adminNavRegistry";
import { normalizeAdminPath } from "@/features/admin/buildAdminNavModel";

/**
 * 后台壳层导航（顶栏返回 / 页题）：对齐 `docs/ADMIN_UI_STYLE.md` 中引用的 Vercel 式信息密度与层次，
 * 路径判定与侧栏注册表 + 权限下发的 sidebar ENTRY 一致，避免「一级入口误出返回」。
 */

const REGISTRY_SIDEBAR_PATHS = new Set(
  ADMIN_NAV_REGISTRY.flatMap((g) => g.items.map((it) => normalizeAdminPath(it.path)))
);

/** 注册表未列名、但路由存在的子页：用于页题；壳层「返回」仍由 shouldShowAdminShellBack 控制 */
const SECONDARY_ROUTE_TITLE: Record<string, string> = {
  "/admin/supplies/mine": "我的领用记录",
  "/admin/supplies/claim-export": "领用单导出",
  "/admin/supplies/manage": "物资管理",
  "/admin/supplies/process": "领用出库处理",
};

/** 无 location.state.returnTo 时的默认回退路径 */
const DEFAULT_BACK_PARENT: Record<string, string> = {
  "/admin/supplies/mine": "/admin/supplies",
  "/admin/supplies/claim-export": "/admin/supplies/mine",
  "/admin/supplies/manage": "/admin/supplies",
  "/admin/supplies/process": "/admin/supplies/audit-export",
};

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
  if (!p.startsWith("/admin")) return false;
  if (p === "/admin") return false;
  if (p === "/admin/profile-security") return false;
  return !isAdminPrimarySidebarPath(pathname, permSidebarPaths);
}

export function adminChromeTitle(pathname: string): string {
  const p = stripPathQuery(pathname);
  if (p === "/admin") return "后台工作台";
  return SECONDARY_ROUTE_TITLE[p] ?? titleForUnknownAdminPath(p);
}

export function resolveAdminShellBackTo(pathname: string, returnToState: unknown): string {
  const raw = returnToState as { returnTo?: unknown } | null | undefined;
  const rt = raw?.returnTo;
  if (typeof rt === "string") {
    const t = rt.trim();
    if (t.startsWith("/") && !t.startsWith("//")) return normalizeAdminPath(t.split("?")[0]);
  }
  const p = stripPathQuery(pathname);
  return DEFAULT_BACK_PARENT[p] ?? "/admin";
}
