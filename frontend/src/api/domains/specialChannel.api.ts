import axios from "axios";
import type { AuthData } from "@/api/domains/auth.api";

interface Result<T> {
  code: number;
  message: string;
  success: boolean;
  data: T;
}

interface PinStatusResponse {
  hasPin: boolean;
}

/** 查询 PIN 是否已设置（公开接口，用原始 axios） */
export async function checkPinStatus(userId: string): Promise<boolean> {
  const res = await axios.get<Result<PinStatusResponse>>(
    "/api/auth/special-channel/pin-status",
    { params: { userId } }
  );
  if (!res.data?.success) {
    throw new Error(res.data?.message || "查询 PIN 状态失败");
  }
  return res.data.data.hasPin;
}

/** 首次设置 PIN（公开接口，成功返回 AuthData） */
export async function setPin(userId: string, pin: string): Promise<AuthData> {
  const res = await axios.post<Result<AuthData>>(
    "/api/auth/special-channel/set-pin",
    { userId, pin }
  );
  if (!res.data?.success || !res.data?.data?.token) {
    throw new Error(res.data?.message || "设置 PIN 失败");
  }
  return res.data.data;
}

/** PIN 登录（公开接口，成功返回 AuthData） */
export async function specialChannelLogin(userId: string, pin: string): Promise<AuthData> {
  const res = await axios.post<Result<AuthData>>(
    "/api/auth/special-channel/login",
    { userId, pin }
  );
  if (!res.data?.success || !res.data?.data?.token) {
    throw new Error(res.data?.message || "PIN 验证失败");
  }
  return res.data.data;
}

/** 人脸验证登录 — 走与 PIN 相同的 /login 接口，faceVerified=true */
export async function specialChannelLoginByFace(userId: string): Promise<AuthData> {
  const res = await axios.post<Result<AuthData>>(
    "/api/auth/special-channel/login",
    { userId, faceVerified: true }
  );
  if (!res.data?.success || !res.data?.data?.token) {
    throw new Error(res.data?.message || "人脸验证登录失败");
  }
  return res.data.data;
}

/** 管理员重置学生 PIN — 走 admin API，personnelUserId 必须为人员库学号 */
export async function resetStudentPin(personnelUserId: string): Promise<void> {
  const { resetPersonnelPin } = await import("@/api/domains/admin.api");
  await resetPersonnelPin(personnelUserId);
}
