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
