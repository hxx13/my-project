import { isDahuaSwingHubMergedPath } from "@/features/admin/dahuaSwingHubPaths";

/** 已从侧栏移除的废弃/重定向路由（配置已合并至其他页面或纯跳转） */
export const HIDDEN_ADMIN_SIDEBAR_PATHS = new Set([
  "/admin/scan-delay-config",       // 已废弃
  "/admin/schedule-manager",        // → /admin/settings/scheduler
  "/admin/external-comm-config",    // → /admin/settings/access-control
  "/admin/page-permissions",        // → /admin/settings/permissions
  "/admin/login-branding",          // → /admin/settings/appearance
  "/admin/supplies/mine",           // → /admin/supplies（纯重定向）
  "/admin/supplies/claim-export",   // → /admin/supplies（纯重定向）
  "/admin/supplies/manage",         // 物资管理（SUPER_ADMIN 子页面）
  "/admin/supplies/process",        // 物资流程（SUPER_ADMIN 子页面）
  "/admin/material/audit",          // → /admin/analytics?report=material_stats（纯重定向）
  "/admin/room-mapping",            // → /admin/aro-rooms（纯重定向）
  // Settings 子页面 — 内部路由，不应作为独立侧栏入口
  "/admin/settings/general",
  "/admin/settings/appearance",
  "/admin/settings/notifications",
  "/admin/settings/access-control",
  "/admin/settings/scheduler",
  "/admin/settings/integrations",
  "/admin/settings/permissions",
  "/admin/settings/danger-zone",
]);

export function isHiddenAdminSidebarPath(path: string): boolean {
  const norm = (path || "").replace(/[?#].*$/, "").replace(/\/+/g, "/");
  return HIDDEN_ADMIN_SIDEBAR_PATHS.has(norm);
}

/** 侧栏/工作台应忽略的废弃或已合并路由 */
export function shouldHideAdminSidebarPath(path: string): boolean {
  return isDahuaSwingHubMergedPath(path) || isHiddenAdminSidebarPath(path);
}
