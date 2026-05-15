import { adminHttp } from "@/api/core/adminHttp";

export interface PersonnelAuthRecord {
  id: string;
  name: string;
  jobNumber?: string;
  departmentName?: string;
  projectGroupName?: string;
  username?: string;
  password?: string;
  role?: string;
  openId?: string;
  status?: number;
}

export interface SystemUserRecord {
  id: string;
  username?: string;
  password?: string;
  role?: string;
  openId?: string;
  status?: number;
  createTime?: string;
  /** 与小程序自助修改同一字段 */
  displayNickname?: string | null;
  miniBindType?: string | null;
}

interface Result<T> {
  code: number;
  success: boolean;
  message: string;
  data: T;
}

interface PagedResult<T> {
  data: T[];
  total: number;
}

export async function fetchAdminPersonnel(page = 1, size = 20, keyword = "") {
  const res = await adminHttp.get<Result<PagedResult<PersonnelAuthRecord>>>("/personnel", {
    params: { page, size, keyword },
  });
  return res.data.data;
}

export async function fetchSystemOnlyUsers(page = 1, size = 20, keyword = "") {
  const res = await adminHttp.get<Result<PagedResult<SystemUserRecord>>>("/system-users", {
    params: { page, size, keyword },
  });
  return res.data.data;
}

export async function updateUserRole(id: string, role: string) {
  await adminHttp.patch(`/users/${id}/role`, { role });
}

export async function updateUserStatus(id: string, enabled: boolean) {
  await adminHttp.patch(`/users/${id}/status`, { enabled });
}

export async function resetUserPassword(id: string) {
  const res = await adminHttp.post<Result<{ defaultPassword: string }>>(`/users/${id}/reset-password`);
  return res.data.data;
}

export async function resetUserOpenId(id: string) {
  await adminHttp.post(`/users/${id}/reset-openid`);
}

export async function updateUserDisplayNickname(id: string, displayNickname: string) {
  await adminHttp.patch(`/users/${id}/display-nickname`, { displayNickname });
}

export async function createSystemStaffUser(body: {
  username: string;
  password: string;
  role?: string;
  displayNickname?: string;
}): Promise<{ id: string; username: string; displayNickname: string; role: string }> {
  const res = await adminHttp.post<Result<{ id: string; username: string; displayNickname: string; role: string }>>(
    "/system-users",
    body
  );
  if (!res.data?.success || !res.data?.data) {
    throw new Error((res.data as Result<unknown> | undefined)?.message || "创建失败");
  }
  return res.data.data;
}

export async function deleteSystemUser(id: string): Promise<void> {
  const res = await adminHttp.delete<Result<null>>(`/users/${encodeURIComponent(id)}`);
  if (!res.data?.success) {
    throw new Error((res.data as Result<null> | undefined)?.message || "删除失败");
  }
}
