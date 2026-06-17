import { isDahuaSwingHubMergedPath } from "@/features/admin/dahuaSwingHubPaths";

/** 已从侧栏移除的废弃路由（配置已合并至其他页面） */
export const HIDDEN_ADMIN_SIDEBAR_PATHS = new Set([
  "/admin/scan-delay-config",
]);

export function isHiddenAdminSidebarPath(path: string): boolean {
  const norm = (path || "").replace(/[?#].*$/, "").replace(/\/+/g, "/");
  return HIDDEN_ADMIN_SIDEBAR_PATHS.has(norm);
}

/** 侧栏/工作台应忽略的废弃或已合并路由 */
export function shouldHideAdminSidebarPath(path: string): boolean {
  return isDahuaSwingHubMergedPath(path) || isHiddenAdminSidebarPath(path);
}
