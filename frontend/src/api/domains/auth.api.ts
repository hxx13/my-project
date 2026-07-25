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
  /** 账号来源库：STUDENT（学生库）/ STAFF（教职工库） */
  accountSource?: string | null;
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

export async function loginWeb(username: string, password: string, turnstileToken?: string): Promise<AuthData> {
  const response = await axios.post<Result<AuthData>>("/api/auth/login/web", {
    username,
    password,
    turnstileToken: turnstileToken || "",
  });

  if (!response.data?.success || !response.data?.data?.token) {
    throw new Error(response.data?.message || "登录失败");
  }

  return response.data.data;
}

export async function loginCas(ticket: string, serviceUrl: string): Promise<AuthData> {
  const response = await axios.post<Result<AuthData>>("/api/auth/login/cas", { ticket, serviceUrl });
  if (!response.data?.success || !response.data?.data?.token) {
    throw new Error(response.data?.message || "CAS登录失败");
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

export interface ForgotPasswordDecodeQrResult {
  userId: string;
  name: string;
}

/** 上传 QR 码图片给后端 ZXing 解码 */
export async function forgotPasswordDecodeQr(
  file: File
): Promise<ForgotPasswordDecodeQrResult> {
  const form = new FormData();
  form.append("file", file);
  const response = await axios.post<Result<ForgotPasswordDecodeQrResult>>(
    "/api/auth/forgot-password/decode-qr",
    form,
    { headers: { "Content-Type": "multipart/form-data" } }
  );
  if (!response.data?.success || !response.data?.data) {
    throw new Error(response.data?.message || "二维码识别失败");
  }
  return response.data.data;
}

export interface ForgotPasswordVerifyResult {
  verified: boolean;
  username: string;
  name: string;
  message: string;
}

export async function forgotPasswordVerify(
  userId: string,
  phoneNumber: string
): Promise<ForgotPasswordVerifyResult> {
  const response = await axios.post<Result<ForgotPasswordVerifyResult>>(
    "/api/auth/forgot-password/verify",
    { userId, phoneNumber }
  );
  if (!response.data?.success || !response.data?.data) {
    throw new Error(response.data?.message || "验证失败");
  }
  return response.data.data;
}

export async function forgotPasswordReset(
  userId: string,
  newPassword: string,
  newUsername?: string
): Promise<{ message: string }> {
  const response = await axios.post<Result<{ message: string }>>(
    "/api/auth/forgot-password/reset",
    { userId, newPassword, newUsername }
  );
  if (!response.data?.success) {
    throw new Error(response.data?.message || "重置失败");
  }
  return response.data.data;
}

// ──────────── Email Verification ────────────

export interface SendVerificationCodeResult {
  message: string;
  cooldownSeconds: number;
}

/** Send email verification code. Uses authHttp for both scenes (FORGOT_PASSWORD doesn't require login server-side) */
export async function sendVerificationCode(
  email: string,
  scene: "BIND_EMAIL" | "FORGOT_PASSWORD"
): Promise<SendVerificationCodeResult> {
  const response = await authHttp.post<Result<SendVerificationCodeResult>>(
    "/auth/send-verification-code",
    { email, scene }
  );
  if (!response.data?.success || !response.data?.data) {
    throw new Error(response.data?.message || "发送失败");
  }
  return response.data.data;
}

export interface ForgotPasswordByEmailVerifyResult {
  resetToken: string;
}

export async function forgotPasswordByEmailVerify(
  email: string,
  code: string
): Promise<ForgotPasswordByEmailVerifyResult> {
  const response = await axios.post<Result<ForgotPasswordByEmailVerifyResult>>(
    "/api/auth/forgot-password/by-email/verify",
    { email, code }
  );
  if (!response.data?.success || !response.data?.data) {
    throw new Error(response.data?.message || "验证失败");
  }
  return response.data.data;
}

export async function forgotPasswordByEmailReset(
  resetToken: string,
  newPassword: string,
  newUsername?: string
): Promise<{ message: string }> {
  const response = await axios.post<Result<{ message: string }>>(
    "/api/auth/forgot-password/by-email/reset",
    { resetToken, newPassword, newUsername }
  );
  if (!response.data?.success) {
    throw new Error(response.data?.message || "重置失败");
  }
  return response.data.data;
}

export async function bindEmailWithCode(
  email: string,
  code: string
): Promise<{ message: string }> {
  const response = await authHttp.post<Result<{ message: string }>>(
    "/auth/bind/email",
    { email, code }
  );
  if (!response.data?.success) {
    throw new Error(response.data?.message || "绑定失败");
  }
  return response.data.data;
}
