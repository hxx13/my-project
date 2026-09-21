import { authHttp } from "@/api/core/authHttp";
import { publicHttp } from "@/api/core/publicHttp";

interface Result<T> {
  code: number;
  success: boolean;
  message: string;
  data: T;
}

export interface MySignature {
  hasSignature: boolean;
  /** PNG dataUrl（白底 800x300）。直接给 <img src> 用，也可右键另存贴进文档。 */
  imageData?: string;
  source?: string;
  createdAt?: string;
}

/** 我的签名（任意登录账号都可查；不区分学生/教职工视角）。 */
export async function fetchMySignature(): Promise<MySignature> {
  const res = await authHttp.get<Result<MySignature>>("/student/signature");
  return res.data.data ?? { hasSignature: false };
}

/** 提交我的签名（PNG dataUrl）。已提交时后端会拒绝——签名不可更改。 */
export async function submitMySignature(imageData: string): Promise<{ ok: boolean }> {
  const res = await authHttp.post<Result<{ ok: boolean }>>("/student/signature", { imageData });
  return res.data.data;
}

/** 生成限时一次性链接（用手机扫码画自己的签名）。 */
export async function createSignatureLink(ttlMinutes?: number): Promise<{ token: string; expiresInMinutes: number }> {
  const res = await authHttp.post<Result<{ token: string; expiresInMinutes: number }>>(
    "/student/signature/link", ttlMinutes ? { ttlMinutes } : {},
  );
  return res.data.data;
}

/** 管理员：查看某人的签名。 */
export async function fetchPersonnelSignature(personnelId: number): Promise<MySignature> {
  const res = await authHttp.get<Result<MySignature>>(`/personnel/${personnelId}/signature`);
  return res.data.data ?? { hasSignature: false };
}

/** 管理员：重置某人的签名（清空后本人可重签）。 */
export async function resetPersonnelSignature(personnelId: number): Promise<{ ok: boolean; removed: number }> {
  const res = await authHttp.delete<Result<{ ok: boolean; removed: number }>>(`/personnel/${personnelId}/signature`);
  return res.data.data;
}

// ── 公开端点（手机扫码打开的签名页用，无登录态，走 publicHttp）──

export interface SignatureLinkInfo {
  personnelId: number;
  name: string;
  expiresAt: string;
}

export async function fetchSignatureLinkInfo(token: string): Promise<SignatureLinkInfo> {
  const res = await publicHttp.get<Result<SignatureLinkInfo>>(`/public/sign/${token}`);
  return res.data.data;
}

export async function submitSignatureByLink(token: string, imageData: string): Promise<{ ok: boolean; name: string }> {
  const res = await publicHttp.post<Result<{ ok: boolean; name: string }>>(`/public/sign/${token}`, { imageData });
  return res.data.data;
}
