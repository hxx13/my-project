import { getRoleLevel } from "@/features/auth/roleAccess";
import type { PublicPagePermissionNode } from "@/api/domains/pagePermission.api";

type EntrySource = "sidebar" | "tabbar" | "mine" | "home" | "route" | "other";

/**
 * 兼容 location.pathname（/console/admin/...）与权限表 canonical（/admin/...）。
 * 逻辑与 buildAdminNavModel.normalizeAdminPath 对齐；此处内联以避免循环依赖。
 */
function normalizePath(path: string) {
  if (!path) return "";
  let withSlash = path.startsWith("/") ? path : `/${path}`;
  withSlash = withSlash.replace(/\/+/g, "/");
  const consoleNs = "/console";
  if (withSlash === `${consoleNs}/admin`) return "/admin";
  if (withSlash.startsWith(`${consoleNs}/admin/`)) {
    return withSlash.slice(consoleNs.length);
  }
  return withSlash;
}

function roleAllowed(currentRole: string | undefined, minRole: string | undefined) {
  const target = minRole || "MEMBER";
  return getRoleLevel(currentRole) >= getRoleLevel(target);
}

export function canAccessWebPage(
  nodes: PublicPagePermissionNode[],
  pathname: string,
  currentRole: string | undefined,
  fallbackMinRole = "MEMBER"
) {
  const path = normalizePath(pathname);
  const matched = nodes.find((x) => x.platform === "WEB" && x.nodeType === "PAGE" && normalizePath(x.pathOrRoute) === path);
  if (!matched) return roleAllowed(currentRole, fallbackMinRole);
  if (matched.enabled !== 1) return false;
  return roleAllowed(currentRole, matched.minRole);
}

export function canShowWebEntry(
  nodes: PublicPagePermissionNode[],
  pathOrRoute: string,
  entrySource: EntrySource,
  currentRole: string | undefined,
  fallbackMinRole = "MEMBER"
) {
  const path = normalizePath(pathOrRoute);
  const matched = nodes.find(
    (x) =>
      x.platform === "WEB" &&
      x.nodeType === "ENTRY" &&
      normalizePath(x.pathOrRoute) === path &&
      (x.entrySource || "other") === entrySource
  );
  if (!matched) return roleAllowed(currentRole, fallbackMinRole);
  if (matched.enabled !== 1) return false;
  return roleAllowed(currentRole, matched.minRole);
}
