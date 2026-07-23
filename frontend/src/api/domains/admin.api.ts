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
  personalPin?: string | null;
  pinUpdatedAt?: string | null;
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

/** 重置人员库学号的扫码 PIN（须 SUPER_ADMIN；personnelUserId = aro_personnel.user_id，非系统账号 USR_*） */
export async function resetPersonnelPin(personnelUserId: string) {
  const uid = personnelUserId.trim();
  if (!uid) throw new Error("人员学号不能为空");
  await adminHttp.post(`/personnel/${encodeURIComponent(uid)}/reset-pin`);
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

export async function viewUserPassword(id: string): Promise<{ password?: string | null; message?: string }> {
  const res = await adminHttp.get<Result<{ password?: string | null; message?: string }>>(
    `/users/${encodeURIComponent(id)}/view-password`
  );
  if (!res.data?.success) {
    throw new Error(res.data?.message || "查看密码失败");
  }
  return res.data.data;
}

export async function resetPersonnelAccount(
  personnelUserId: string,
  newUsername: string
): Promise<{ newUsername: string }> {
  const res = await adminHttp.post<Result<{ newUsername: string }>>(
    `/personnel/${encodeURIComponent(personnelUserId)}/reset-account`,
    { newUsername }
  );
  if (!res.data?.success) {
    throw new Error(res.data?.message || "重置账号失败");
  }
  return res.data.data;
}

export async function resetPersonnelPassword(
  personnelUserId: string
): Promise<{ defaultPassword: string }> {
  const res = await adminHttp.post<Result<{ defaultPassword: string }>>(
    `/personnel/${encodeURIComponent(personnelUserId)}/reset-password`
  );
  if (!res.data?.success) {
    throw new Error(res.data?.message || "重置密码失败");
  }
  return res.data.data;
}

// ========== CAS 个人 Token 绑定 ==========

export interface CasBindingStatus {
  bound: boolean;
  casAccount?: string;
  expiresAt?: number;
  remainingSeconds?: number;
}

export async function fetchCasBindingStatus(): Promise<CasBindingStatus> {
  const res = await adminHttp.get<Result<CasBindingStatus>>(
    "/account/binding/cas-status"
  );
  if (!res.data?.success)
    throw new Error(res.data?.message || "获取状态失败");
  return res.data.data;
}

export async function bindCasAccount(
  ticket: string
): Promise<{ casAccount: string; bound: boolean }> {
  const res = await adminHttp.post<
    Result<{ casAccount: string; bound: boolean }>
  >("/account/binding/cas-bind", { ticket });
  if (!res.data?.success)
    throw new Error(res.data?.message || "绑定失败");
  return res.data.data;
}

export async function unbindCasAccount(): Promise<void> {
  const res = await adminHttp.delete<Result<null>>(
    "/account/binding/cas-unbind"
  );
  if (!res.data?.success)
    throw new Error(res.data?.message || "解绑失败");
}
