import { adminHttp } from "@/api/core/adminHttp";
import type { ApiResponse } from "@/api/types/common";

export type StudentViolationStatus = "ACTIVE" | "CLEARED" | "EXPIRED" | "SUPERSEDED" | "PROCESSED";

export interface StudentViolationRow {
  id: number;
  targetUserId: string;
  /** 展示用姓名：人员库优先，与后端 UserDisplayNameService 一致 */
  targetUserDisplayName?: string;
  violationText?: string;
  /** JSON 字符串或已解析数组（列表接口为 JSON 字符串） */
  imageUrls?: string | string[];
  forbidEnter?: number;
  maxEnterSuccess?: number | null;
  enterSuccessCount?: number;
  showNoticeEveryScan?: number;
  expireAt?: string | null;
  status?: StudentViolationStatus;
  createdByUserId?: string;
  createdAt?: string;
  updatedAt?: string;
  clearedAt?: string | null;
  clearedByUserId?: string | null;
}

export interface CreateStudentViolationPayload {
  targetUserId: string;
  violationText: string;
  imageUrls: string[];
  forbidEnter: boolean;
  maxEnterSuccess: number | null;
  showNoticeEveryScan: boolean;
  expireAfterDays: number | null;
}

export async function listStudentViolations(params: { targetUserId?: string; limit?: number }) {
  const sp = new URLSearchParams();
  sp.set("limit", String(params.limit ?? 50));
  if (params.targetUserId) sp.set("targetUserId", params.targetUserId);
  const res = await adminHttp.get<ApiResponse<StudentViolationRow[]>>(`/twin/student-violations?${sp.toString()}`);
  return res.data?.data || [];
}

export async function createStudentViolation(body: CreateStudentViolationPayload) {
  const res = await adminHttp.post<ApiResponse<StudentViolationRow>>("/twin/student-violations", body);
  return res.data?.data;
}

export interface UpdateStudentViolationPayload {
  violationText: string;
  imageUrls: string[];
  forbidEnter: boolean;
  maxEnterSuccess: number | null;
  showNoticeEveryScan: boolean;
  /** KEEP | CLEAR | RELATIVE */
  expireMode: "KEEP" | "CLEAR" | "RELATIVE";
  expireAfterDays: number | null;
}

export async function updateStudentViolation(id: number, body: UpdateStudentViolationPayload) {
  const res = await adminHttp.put<ApiResponse<StudentViolationRow>>(`/twin/student-violations/${id}`, body);
  return res.data?.data;
}

export async function deleteStudentViolation(id: number) {
  await adminHttp.delete<ApiResponse<unknown>>(`/twin/student-violations/${id}`);
}

export async function clearStudentViolation(id: number) {
  await adminHttp.post<ApiResponse<unknown>>(`/twin/student-violations/${id}/clear`);
}

/** 标记已处理：后端置为 PROCESSED，扫码弹窗不再展示 */
export async function markStudentViolationProcessed(id: number) {
  await adminHttp.post<ApiResponse<unknown>>(`/twin/student-violations/${id}/mark-processed`);
}

/** 与后端 RoleEnum.code 一致 */
export type UnboundApplyRoleCode = "STUDENT" | "STAFF" | "SENIOR" | "ADMIN" | "SUPER_ADMIN" | "PLATFORM_OWNER";

export const UNBOUND_APPLY_ROLE_OPTIONS: { code: UnboundApplyRoleCode; label: string }[] = [
  { code: "STUDENT", label: "学生" },
  { code: "STAFF", label: "普通员工" },
  { code: "SENIOR", label: "高级员工" },
  { code: "ADMIN", label: "管理员" },
  { code: "SUPER_ADMIN", label: "超级管理员" },
  { code: "PLATFORM_OWNER", label: "平台所有者" },
];

export interface UnboundCardNoticeSettings {
  enabled: boolean;
  showNoticeEveryScan: boolean;
  forbidEnter?: boolean;
  applyRoleCodes?: UnboundApplyRoleCode[];
  violationText?: string;
  imageUrls?: string[];
}

export function normalizeApplyRoleCodes(raw: unknown): UnboundApplyRoleCode[] {
  const valid = new Set(UNBOUND_APPLY_ROLE_OPTIONS.map((o) => o.code));
  if (!Array.isArray(raw) || !raw.length) return ["STUDENT"];
  const out = raw.filter((x): x is UnboundApplyRoleCode => typeof x === "string" && valid.has(x as UnboundApplyRoleCode));
  return out.length ? out : ["STUDENT"];
}

export async function getUnboundCardNoticeSettings(): Promise<UnboundCardNoticeSettings> {
  const res = await adminHttp.get<ApiResponse<UnboundCardNoticeSettings>>(
    "/twin/student-violations/unbound-notice-settings"
  );
  const data = res.data?.data;
  return {
    enabled: data?.enabled !== false,
    showNoticeEveryScan: data?.showNoticeEveryScan !== false,
    forbidEnter: Boolean(data?.forbidEnter),
    applyRoleCodes: normalizeApplyRoleCodes(data?.applyRoleCodes),
    violationText: data?.violationText ?? "",
    imageUrls: Array.isArray(data?.imageUrls) ? data.imageUrls : [],
  };
}

export async function saveUnboundCardNoticeSettings(body: UnboundCardNoticeSettings): Promise<UnboundCardNoticeSettings> {
  const res = await adminHttp.put<ApiResponse<UnboundCardNoticeSettings>>(
    "/twin/student-violations/unbound-notice-settings",
    body
  );
  const data = res.data?.data;
  return {
    enabled: data?.enabled !== false,
    showNoticeEveryScan: data?.showNoticeEveryScan !== false,
    forbidEnter: Boolean(data?.forbidEnter),
    applyRoleCodes: normalizeApplyRoleCodes(data?.applyRoleCodes),
    violationText: data?.violationText ?? "",
    imageUrls: Array.isArray(data?.imageUrls) ? data.imageUrls : [],
  };
}
