import { adminHttp } from "@/api/core/adminHttp";
import { authHttp } from "@/api/core/authHttp";

interface Result<T> {
  code: number;
  success: boolean;
  message: string;
  data: T;
}

export type PagePlatform = "WEB" | "MINI";
export type MinRole = "STUDENT" | "STAFF" | "SENIOR" | "ADMIN" | "SUPER_ADMIN" | "PLATFORM_OWNER";

export interface PagePermissionNode {
  nodeKey: string;
  platform: PagePlatform;
  nodeType: "PAGE" | "ENTRY" | string;
  displayName?: string;
  pathOrRoute: string;
  entrySource?: string;
  minRole: MinRole;
  defaultMinRole?: MinRole;
  enabled: number;
  parentNodeKey?: string;
  chainKey?: string;
  autoDiscovered?: number;
  manualOverride?: number;
  children?: PagePermissionNode[];
}

export interface PublicPagePermissionNode {
  nodeKey: string;
  platform: PagePlatform;
  nodeType: "PAGE" | "ENTRY" | string;
  pathOrRoute: string;
  entrySource?: string;
  minRole: MinRole;
  enabled: number;
  chainKey?: string;
  parentNodeKey?: string;
}

export async function fetchPagePermissionTree(platform: PagePlatform) {
  const res = await adminHttp.get<Result<PagePermissionNode[]>>("/page-permissions/tree", { params: { platform } });
  return res.data.data;
}

/** 按路径解析单条权限（侧栏右键快捷面板；优先侧栏 ENTRY） */
export interface PagePermissionLookupRow {
  nodeKey: string;
  platform: PagePlatform;
  nodeType: string;
  displayName?: string;
  pathOrRoute: string;
  entrySource?: string;
  minRole: MinRole;
  defaultMinRole?: MinRole;
  enabled: number;
  manualOverride?: number;
}

export async function fetchPagePermissionLookup(platform: PagePlatform, path: string) {
  const res = await adminHttp.get<Result<PagePermissionLookupRow>>("/page-permissions/lookup", {
    params: { platform, path },
  });
  if (!res.data?.success) {
    throw new Error(res.data?.message || "查询失败");
  }
  return res.data.data;
}

export async function scanPagePermissions() {
  const res = await adminHttp.post<Result<{ web: number; mini: number }>>("/page-permissions/scan");
  return res.data.data;
}

export async function updatePagePermission(nodeKey: string, payload: { minRole: MinRole; enabled: number }) {
  const res = await adminHttp.post<Result<number>>("/page-permissions/batch", {
    items: [{ nodeKey, minRole: payload.minRole, enabled: payload.enabled }],
  });
  if (!res.data?.success) {
    throw new Error(res.data?.message || "保存失败");
  }
}

export async function resetPagePermissionDefaults(platform: PagePlatform) {
  const res = await adminHttp.post<Result<number>>("/page-permissions/reset-defaults", null, { params: { platform } });
  return res.data.data;
}

export async function fetchPublicPagePermissions(platform: PagePlatform) {
  const res = await authHttp.get<Result<PublicPagePermissionNode[]>>("/public/page-permissions", { params: { platform } });
  return res.data.data;
}

/** 网页端公开权限缓存刷新：侧栏 / 工作台等监听后重新拉取 `fetchPublicPagePermissions("WEB")` */
export const WEB_PUBLIC_PAGE_PERMISSIONS_UPDATED = "aro-web-public-page-permissions-updated";

export function notifyWebPublicPagePermissionsUpdated() {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new Event(WEB_PUBLIC_PAGE_PERMISSIONS_UPDATED));
  } catch {
    /* ignore */
  }
}

