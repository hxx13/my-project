import { authHttp } from "@/api/core/authHttp";

export interface AdminNavConfigNode {
  id: string;
  parentId: string | null;
  type: "GROUP" | "SUBGROUP" | "ITEM";
  title: string;
  itemPath?: string | null;
  itemIcon?: string | null;
  itemBadgeKey?: string | null;
  sortOrder: number;
  visible: boolean;
  children: AdminNavConfigNode[];
}

interface ApiResult<T> {
  success: boolean;
  data: T;
  message?: string;
}

export async function fetchAdminNavConfig(
  scope: "ADMIN" | "STUDENT" = "ADMIN"
): Promise<AdminNavConfigNode[]> {
  try {
    const res = await authHttp.get<ApiResult<AdminNavConfigNode[]>>(`/admin-nav/config?scope=${scope}`);
    if (res.data?.success && Array.isArray(res.data.data)) {
      return res.data.data;
    }
    return [];
  } catch {
    return [];
  }
}

export async function createNavGroup(body: {
  parentId?: string | null;
  type?: "GROUP" | "SUBGROUP";
  title: string;
  sortOrder?: number;
  scope?: "ADMIN" | "STUDENT";
}): Promise<AdminNavConfigNode | null> {
  const res = await authHttp.post<ApiResult<AdminNavConfigNode>>("/admin-nav/groups", body);
  return res.data?.success ? res.data.data : null;
}

export async function updateNavGroup(
  id: string,
  body: { title?: string; sortOrder?: number; visible?: boolean }
): Promise<AdminNavConfigNode | null> {
  const res = await authHttp.put<ApiResult<AdminNavConfigNode>>(`/admin-nav/groups/${id}`, body);
  return res.data?.success ? res.data.data : null;
}

export async function moveNavGroup(
  id: string,
  direction: "up" | "down"
): Promise<AdminNavConfigNode | null> {
  const res = await authHttp.put<ApiResult<AdminNavConfigNode>>(`/admin-nav/groups/${id}/move`, { direction });
  return res.data?.success ? res.data.data : null;
}

export async function deleteNavGroup(id: string): Promise<boolean> {
  const res = await authHttp.delete<ApiResult<null>>(`/admin-nav/groups/${id}`);
  return res.data?.success ?? false;
}

export async function moveNavItem(itemId: string, newParentId: string | null): Promise<boolean> {
  const res = await authHttp.put<ApiResult<null>>(`/admin-nav/items/${itemId}/move`, { newParentId });
  return res.data?.success ?? false;
}

export async function reorderNavItems(orders: { id: string; sortOrder: number }[]): Promise<boolean> {
  const res = await authHttp.put<ApiResult<null>>("/admin-nav/items/reorder", { orders });
  return res.data?.success ?? false;
}

export async function reorderNavNodes(
  parentId: string | null,
  orderedIds: string[],
  scope: "ADMIN" | "STUDENT" = "ADMIN"
): Promise<boolean> {
  const res = await authHttp.put<ApiResult<null>>("/admin-nav/nodes/reorder", { parentId, orderedIds, scope });
  return res.data?.success ?? false;
}

export async function resetNavConfig(scope: "ADMIN" | "STUDENT" = "ADMIN"): Promise<boolean> {
  const res = await authHttp.post<ApiResult<null>>("/admin-nav/reset", { scope });
  return res.data?.success ?? false;
}

export async function ensureNavItems(
  items: { path: string; label: string; icon: string; groupTitle: string }[],
  scope: "ADMIN" | "STUDENT" = "ADMIN"
): Promise<{ created: number; existed: number }> {
  try {
    const res = await authHttp.post<ApiResult<{ created: number; existed: number }>>("/admin-nav/ensure-items", { items, scope });
    return res.data?.success ? res.data.data ?? { created: 0, existed: 0 } : { created: 0, existed: 0 };
  } catch {
    return { created: 0, existed: 0 };
  }
}
