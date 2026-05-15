import axios from "axios";
import { authHttp } from "@/api/core/authHttp";

/** 与后端 AuthUserInfo 对齐 */
export interface AuthUserInfo {
  id: string;
  username: string;
  openId: string;
  role: string;
  displayName?: string;
  displayNickname?: string | null;
  miniBindType?: string | null;
  canEditDisplayNickname?: boolean;
  /** WECHAT_ARO | WEB_PASSWORD */
  authProfile?: string | null;
  /** 小程序首页默认分栏：news | announcements */
  miniHomeDefaultTab?: string | null;
}

export interface AuthData {
  token: string;
  role: string;
  roleDesc: string;
  roleLevel: number;
  userInfo: AuthUserInfo;
}

interface Result<T> {
  code: number;
  message: string;
  success: boolean;
  data: T;
}

export async function loginWeb(username: string, password: string): Promise<AuthData> {
  const response = await axios.post<Result<AuthData>>("/api/auth/login/web", {
    username,
    password,
  });

  if (!response.data?.success || !response.data?.data?.token) {
    throw new Error(response.data?.message || "登录失败");
  }

  return response.data.data;
}

export async function registerStaff(username: string, password: string, inviteCode: string): Promise<AuthData> {
  const response = await axios.post<Result<AuthData>>("/api/auth/register/staff", {
    username,
    password,
    inviteCode,
  });

  if (!response.data?.success || !response.data?.data?.token) {
    throw new Error(response.data?.message || "注册失败");
  }

  return response.data.data;
}

export interface PasswordChangeStatus {
  requiredReset: boolean;
  canChange: boolean;
}

export async function fetchPasswordChangeStatus(): Promise<PasswordChangeStatus> {
  const response = await authHttp.post<Result<PasswordChangeStatus>>("/auth/password/status");
  if (!response.data?.success) {
    throw new Error(response.data?.message || "获取改密状态失败");
  }
  return response.data.data;
}

export async function changePasswordAfterReset(oldPassword: string, newPassword: string): Promise<void> {
  const response = await authHttp.post<Result<null>>("/auth/password/change", {
    oldPassword,
    newPassword,
  });
  if (!response.data?.success) {
    throw new Error(response.data?.message || "修改密码失败");
  }
}

/** 教职工自助修改展示昵称（与 PATCH /api/auth/profile/display-nickname 一致，成功返回新登录态） */
export async function updateProfileDisplayNickname(displayNickname: string): Promise<AuthData> {
  const response = await authHttp.patch<Result<AuthData>>("/auth/profile/display-nickname", { displayNickname });
  if (!response.data?.success || !response.data?.data?.token) {
    throw new Error(response.data?.message || "保存失败");
  }
  return response.data.data;
}

/** 用当前 Token 从库重载会话（含 displayName=工单同源解析名） */
export async function refreshAuthSession(): Promise<AuthData> {
  const response = await authHttp.post<Result<AuthData>>("/auth/session/refresh");
  if (!response.data?.success || !response.data?.data?.token) {
    throw new Error(response.data?.message || "刷新会话失败");
  }
  return response.data.data;
}

export async function createPersonalRegistrationInvite(): Promise<{ id: string; plainCode: string; expiresAt: string }> {
  const response = await authHttp.post<Result<{ id: string; plainCode: string; expiresAt: string }>>(
    "/auth/registration-invites/personal"
  );
  if (!response.data?.success || !response.data?.data) {
    throw new Error(response.data?.message || "生成失败");
  }
  return response.data.data;
}
