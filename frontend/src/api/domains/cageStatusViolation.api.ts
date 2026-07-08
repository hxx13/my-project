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

export async function manualTriggerRule(ruleId: number): Promise<void> {
  await adminHttp.post(`/twin/cage-status-violations/trigger/${ruleId}`);
}
