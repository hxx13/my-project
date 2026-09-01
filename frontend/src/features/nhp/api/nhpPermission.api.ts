import { authHttp } from "@/api/core/authHttp";

interface Result<T> {
  code: number;
  success: boolean;
  message?: string;
  data: T;
}

export interface NhpCapability {
  id: number;
  code: string;
  label: string;
  scope?: string | null;
  active?: number;
}

export interface NhpPermissionRow {
  id: number;
  subjectType: string;
  subjectCode: string;
  resourceType: string;
  resourceId?: number | null;
  capabilityCode: string;
  teamId?: number | null;
  capabilityLabel?: string | null;
  teamName?: string | null;
}

export async function fetchNhpCapabilities(): Promise<NhpCapability[]> {
  const res = await authHttp.get<Result<NhpCapability[]>>("/nhp/permissions/capabilities");
  return res.data.data ?? [];
}

export async function createNhpCapability(body: { code: string; label: string; scope?: string }): Promise<void> {
  await authHttp.post("/nhp/permissions/capabilities", body);
}

export async function updateNhpCapability(id: number, body: { label?: string; scope?: string; active?: boolean }): Promise<void> {
  await authHttp.put(`/nhp/permissions/capabilities/${id}`, body);
}

export async function deleteNhpCapability(id: number): Promise<void> {
  await authHttp.delete(`/nhp/permissions/capabilities/${id}`);
}

export async function fetchNhpPermissions(): Promise<NhpPermissionRow[]> {
  const res = await authHttp.get<Result<NhpPermissionRow[]>>("/nhp/permissions");
  return res.data.data ?? [];
}

/** 当前用户可配置权限的团队列表（OWNER 或持有 config:manage 能力），含我在该团队的角色。 */
export async function fetchNhpConfigTeams(): Promise<{ id: number; name: string; myRole?: string | null }[]> {
  const res = await authHttp.get<Result<{ id: number; name: string; myRole?: string | null }[]>>("/nhp/permissions/config-teams");
  return res.data.data ?? [];
}

export async function createNhpPermission(body: {
  subjectType: string;
  subjectCode: string;
  resourceType: string;
  resourceId?: number | null;
  capabilityCode: string;
  teamId?: number | null;
}): Promise<void> {
  await authHttp.post("/nhp/permissions", body);
}

export async function deleteNhpPermission(id: number): Promise<void> {
  await authHttp.delete(`/nhp/permissions/${id}`);
}
