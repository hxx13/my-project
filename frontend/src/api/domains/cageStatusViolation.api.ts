import { adminHttp } from "@/api/core/adminHttp";
import type { ApiResponse } from "@/api/types/common";

export interface CageStatusViolationRow {
  id: number;
  ruleId: number;
  ruleName?: string;
  scanBatchId?: string;
  statusCode: string;
  cageShelveId: number;
  positionX: number;
  positionY: number;
  positionLabel: string;
  cageBoxQrCode?: string;
  projectPiName?: string;
  projectGroupName?: string;
  departmentName?: string;
  roomName?: string;
  campusName?: string;
  triggeredAt: string;
  status: 'ACTIVE' | 'CLEARED' | 'EXPIRED';
  members?: MemberViolationRow[];
}

export interface MemberViolationRow {
  violationId: number;
  userId: string;
  displayName?: string;
  departmentName?: string;
  status: string;
  createdAt: string;
}

export async function listCageStatusViolations(): Promise<CageStatusViolationRow[]> {
  const res = await adminHttp.get<ApiResponse<CageStatusViolationRow[]>>("/twin/cage-status-violations");
  return res.data?.data || [];
}

export async function getCageStatusViolation(id: number): Promise<CageStatusViolationRow> {
  const res = await adminHttp.get<ApiResponse<CageStatusViolationRow>>(`/twin/cage-status-violations/${id}`);
  return res.data?.data!;
}

export async function clearCageStatusViolation(id: number): Promise<void> {
  await adminHttp.post(`/twin/cage-status-violations/${id}/clear`);
}

export async function deleteCageStatusViolation(id: number): Promise<void> {
  await adminHttp.delete(`/twin/cage-status-violations/${id}`);
}

export async function addCageViolationMember(id: number, userId: string): Promise<void> {
  await adminHttp.post(`/twin/cage-status-violations/${id}/members`, { userId });
}

export async function removeCageViolationMember(id: number, userId: string): Promise<void> {
  await adminHttp.delete(`/twin/cage-status-violations/${id}/members/${userId}`);
}

export interface CreateCageStatusViolationPayload {
  ruleId?: number | null;
  statusCode: string;
  positionLabel?: string;
  projectGroupName?: string;
  projectPiName?: string;
  campusName?: string;
  roomName?: string;
  cageShelveId?: number | null;
  positionX?: number | null;
  positionY?: number | null;
}

export async function createCageStatusViolation(body: CreateCageStatusViolationPayload): Promise<CageStatusViolationRow> {
  const res = await adminHttp.post<ApiResponse<CageStatusViolationRow>>("/twin/cage-status-violations", body);
  return res.data?.data!;
}

export async function manualTriggerRule(ruleId: number): Promise<void> {
  await adminHttp.post(`/twin/cage-status-violations/trigger/${ruleId}`);
}

export async function batchClearCageViolationMembers(parentId: number, violationIds: number[]): Promise<{ cleared: number }> {
  const res = await adminHttp.post<ApiResponse<{ cleared: number }>>(`/twin/cage-status-violations/${parentId}/members/batch-clear`, { violationIds });
  return res.data?.data!;
}

export async function batchDeleteCageViolationMembers(parentId: number, violationIds: number[]): Promise<{ deleted: number }> {
  const res = await adminHttp.post<ApiResponse<{ deleted: number }>>(`/twin/cage-status-violations/${parentId}/members/batch-delete`, { violationIds });
  return res.data?.data!;
}
