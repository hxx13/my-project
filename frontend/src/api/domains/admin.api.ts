import { adminHttp } from "@/api/core/adminHttp";
import { authHttp } from "@/api/core/authHttp";

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
  contactEmail?: string;
  sendKey?: string;
  wxPusherUid?: string;
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
  contactEmail?: string | null;
  sendKey?: string | null;
  wxPusherUid?: string | null;
}

/** 统一人员表记录（以姓名为中心，staff_id + aro_user_id 双 id + 工号=学号） */
export interface UnifiedPersonnelRecord {
  id: number;
  name: string;
  staffId: string | null;
  aroUserId: string | null;
  jobNumber: string | null;
  departmentName: string | null;
  projectGroupName: string | null;
  institutionId: number | null;
  userTypeNames: string | null;
  head: string | null;
  gender: number | null;
  mobilePhone: string | null;
  email: string | null;
  isSchool: number | null;
  allowedRoomsDisplayZh: string | null;
  hasOfficialRoomPermission: number | null;
  role: string | null;
  status: number | null;
  staffUsername: string | null;
  studentUsername: string | null;
  staffOpenId: string | null;
  staffAccountSource: string | null;
  staffDisplayNickname: string | null;
  staffCreateTime: string | null;
  contactEmail: string | null;
  sendKey: string | null;
  wxPusherUid: string | null;
}

/** 统一人员筛选条件（服务端生效） */
export interface UnifiedPersonnelFilter {
  keyword?: string;
  accountType?: "all" | "sys" | "nosys";
  groupId?: number;
  departmentId?: number;
  role?: string;
  status?: number;
  isSchool?: number;
  roomName?: string;
  identityTagId?: number;
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
  const params: Record<string, unknown> = { page, size };
  const kw = keyword?.trim();
  if (kw) params.keyword = kw;
  const res = await adminHttp.get<Result<PagedResult<PersonnelAuthRecord>>>("/personnel", { params });
  return res.data.data;
}

export async function fetchSystemOnlyUsers(page = 1, size = 20, keyword = "") {
  const params: Record<string, unknown> = { page, size };
  const kw = keyword?.trim();
  if (kw) params.keyword = kw;
  const res = await adminHttp.get<Result<PagedResult<SystemUserRecord>>>("/system-users", { params });
  return res.data.data;
}

export async function fetchUnifiedPersonnel(
  page = 1,
  size = 20,
  filter: UnifiedPersonnelFilter = {}
) {
  // 注意：后端契约是 pageSize（原代码发 size 会被忽略，每页恒为默认 20 —— 此处顺带修复）
  const params: Record<string, unknown> = { page, pageSize: size };
  if (filter.keyword?.trim()) params.keyword = filter.keyword.trim();
  if (filter.accountType && filter.accountType !== "all") params.accountType = filter.accountType;
  if (filter.groupId != null) params.groupId = filter.groupId;
  if (filter.departmentId != null) params.departmentId = filter.departmentId;
  if (filter.role) params.role = filter.role;
  if (filter.status != null) params.status = filter.status;
  if (filter.isSchool != null) params.isSchool = filter.isSchool;
  if (filter.roomName) params.roomName = filter.roomName;
  if (filter.identityTagId != null) params.identityTagId = filter.identityTagId;
  const res = await authHttp.get<Result<{ list: UnifiedPersonnelRecord[]; total: number }>>("/personnel", { params });
  return res.data.data ?? { list: [], total: 0 };
}

export async function fetchPersonnelRooms(): Promise<string[]> {
  const res = await authHttp.get<Result<string[]>>("/personnel/rooms");
  return res.data.data ?? [];
}

export async function syncUnifiedPersonnel() {
  const res = await authHttp.post<Result<{ students: number; staff: number; unified: number; bindings: number; departments: number; groups: number }>>("/personnel/sync");
  return res.data.data;
}

// ── 人员字典（部门/课题组）──

export interface DepartmentDict {
  id: number;
  name: string;
  isSchool: number | null;
  active: number;
  sortOrder: number;
}

export interface ProjectGroupDict {
  id: number;
  name: string;
  departmentId: number | null;
  departmentName: string | null;
  active: number;
}

export async function fetchDepartments() {
  const res = await authHttp.get<Result<DepartmentDict[]>>("/personnel-dict/departments");
  return res.data.data ?? [];
}

export async function updateDepartment(id: number, body: { isSchool?: number; active?: number }) {
  await authHttp.put(`/personnel-dict/departments/${id}`, body);
}

export async function fetchProjectGroups() {
  const res = await authHttp.get<Result<ProjectGroupDict[]>>("/personnel-dict/project-groups");
  return res.data.data ?? [];
}

export async function updateProjectGroup(id: number, body: { departmentId?: number; active?: number }) {
  await authHttp.put(`/personnel-dict/project-groups/${id}`, body);
}

export async function updatePersonnelField(id: number, field: string, value: string) {
  await authHttp.put(`/personnel/${id}/field`, { field, value });
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

/** 重置人员库学号的扫码 PIN（须 SUPER_ADMIN；personnelUserId = aro_personnel.user_id，非系统账号 STAFF_*） */
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
  aroTokenOrAccount: string,
  password?: string
): Promise<{ casAccount: string; bound: boolean }> {
  const body: Record<string, string> = {};
  if (password) {
    body.aroAccount = aroTokenOrAccount;
    body.aroPassword = password;
  } else {
    body.aroToken = aroTokenOrAccount;
  }
  const res = await adminHttp.post<Result<{ casAccount: string; bound: boolean }>>("/account/binding/cas-bind", body);
  if (!res.data?.success) throw new Error(res.data?.message || "绑定失败");
  return res.data.data;
}

export async function unbindCasAccount(): Promise<void> {
  const res = await adminHttp.delete<Result<null>>(
    "/account/binding/cas-unbind"
  );
  if (!res.data?.success)
    throw new Error(res.data?.message || "解绑失败");
}
