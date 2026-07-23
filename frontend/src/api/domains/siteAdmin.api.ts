import { authHttp } from "@/api/core/authHttp";
import { uploadSingleImage } from "@/api/domains/upload.api";
import type { LoginBranding } from "@/api/domains/publicSite.api";

interface Result<T> {
  code: number;
  message: string;
  success: boolean;
  data: T;
}

export async function fetchAdminLoginBranding(): Promise<LoginBranding> {
  const res = await authHttp.get<Result<LoginBranding>>("/admin/site/login-branding");
  if (!res.data?.success || !res.data?.data) throw new Error(res.data?.message || "读取失败");
  return res.data.data;
}

export async function putAdminLoginBranding(body: LoginBranding): Promise<LoginBranding> {
  const res = await authHttp.put<Result<LoginBranding>>("/admin/site/login-branding", body);
  if (!res.data?.success || !res.data?.data) throw new Error(res.data?.message || "保存失败");
  return res.data.data;
}

/** 上传单张轮播图；走统一 /api/upload，返回 /api/upload/files/...（与报修/物资附图同源） */
export async function uploadAdminLoginBrandingImage(file: File): Promise<string> {
  const result = await uploadSingleImage(file);
  return result.url;
}

/* ── Dashboard Preview config (same pattern as login branding) ── */

export interface DashboardPreviewConfig {
  sectionTexts?: string[];
}

export async function fetchDashboardPreviewConfig(): Promise<DashboardPreviewConfig> {
  const res = await authHttp.get<Result<DashboardPreviewConfig>>("/admin/site/dashboard-preview");
  if (!res.data?.success) throw new Error(res.data?.message || "读取失败");
  return res.data.data ?? {};
}

export async function putDashboardPreviewConfig(body: DashboardPreviewConfig): Promise<DashboardPreviewConfig> {
  const res = await authHttp.put<Result<DashboardPreviewConfig>>("/admin/site/dashboard-preview", body);
  if (!res.data?.success) throw new Error(res.data?.message || "保存失败");
  return res.data.data ?? {};
}


export type RegistrationInviteRow = {
  id: string;
  expiresAt: string;
  maxUses: number;
  usedCount: number;
  createdByUserId: string;
  inviteKind: string;
  note: string;
  revoked: boolean;
  createTime: string;
};

export async function listRegistrationInvites(
  limit = 50
): Promise<{ rows: RegistrationInviteRow[]; schemaHint?: string }> {
  const res = await authHttp.get<Result<RegistrationInviteRow[]>>("/admin/registration-invites", { params: { limit } });
  if (!res.data?.success || !Array.isArray(res.data?.data)) throw new Error(res.data?.message || "读取失败");
  const msg = res.data.message || "";
  const schemaHint = msg && msg !== "操作成功" ? msg : undefined;
  return { rows: res.data.data, schemaHint };
}

export async function createRegistrationInvite(payload: {
  ttlDays?: number;
  maxUses?: number;
  note?: string;
}): Promise<{ id: string; plainCode: string; expiresAt: string; maxUses: number }> {
  const res = await authHttp.post<Result<{ id: string; plainCode: string; expiresAt: string; maxUses: number }>>(
    "/admin/registration-invites",
    payload
  );
  if (!res.data?.success || !res.data?.data) throw new Error(res.data?.message || "生成失败");
  return res.data.data;
}

export async function revokeRegistrationInvite(id: string): Promise<void> {
  const res = await authHttp.post<Result<null>>("/admin/registration-invites/revoke", { id });
  if (!res.data?.success) throw new Error(res.data?.message || "作废失败");
}
