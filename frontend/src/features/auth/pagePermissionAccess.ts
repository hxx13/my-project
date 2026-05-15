import { getRoleLevel } from "@/features/auth/roleAccess";
import type { PublicPagePermissionNode } from "@/api/domains/pagePermission.api";

type EntrySource = "sidebar" | "tabbar" | "mine" | "home" | "route" | "other";

function normalizePath(path: string) {
  if (!path) return "";
  const withSlash = path.startsWith("/") ? path : `/${path}`;
  return withSlash.replace(/\/+/g, "/");
}

function roleAllowed(currentRole: string | undefined, minRole: string | undefined) {
  const target = minRole || "STUDENT";
  return getRoleLevel(currentRole) >= getRoleLevel(target);
}

export function canAccessWebPage(
  nodes: PublicPagePermissionNode[],
  pathname: string,
  currentRole: string | undefined,
  fallbackMinRole = "STUDENT"
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
  fallbackMinRole = "STUDENT"
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

