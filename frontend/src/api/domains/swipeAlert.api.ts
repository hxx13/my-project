import { adminHttp } from "@/api/core/adminHttp";

export interface SwipeAlertRuleRow {
  id: number;
  name: string;
  enabled: boolean;
  channels: string | null;
  departments: string | null;
  openTypes: string;
  titleTemplate: string;
  bodyTemplate: string;
  thresholdCount: number;
  thresholdWindowSec: number;
  bannerDurationSec: number;
  minRoleLevel: number;
  cooldownSec: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface SwipeAlertRuleUpsert {
  name: string;
  enabled: boolean;
  channels: string | null;
  departments: string | null;
  openTypes: string;
  titleTemplate: string;
  bodyTemplate: string;
  thresholdCount: number;
  thresholdWindowSec: number;
  bannerDurationSec: number;
  minRoleLevel: number;
  cooldownSec: number;
}

export async function listSwipeAlertRules(): Promise<SwipeAlertRuleRow[]> {
  const res = await adminHttp.get("/swipe-alert/rules");
  return Array.isArray(res) ? res : (res as any)?.data ?? [];
}

export async function createSwipeAlertRule(body: SwipeAlertRuleUpsert): Promise<SwipeAlertRuleRow> {
  const res = await adminHttp.post("/swipe-alert/rules", body);
  return (res as any)?.data ?? res;
}

export async function updateSwipeAlertRule(id: number, body: SwipeAlertRuleUpsert): Promise<SwipeAlertRuleRow> {
  const res = await adminHttp.put(`/swipe-alert/rules/${id}`, body);
  return (res as any)?.data ?? res;
}

export async function deleteSwipeAlertRule(id: number): Promise<void> {
  await adminHttp.delete(`/swipe-alert/rules/${id}`);
}

export async function toggleSwipeAlertRule(id: number): Promise<SwipeAlertRuleRow> {
  const res = await adminHttp.patch(`/swipe-alert/rules/${id}/toggle`);
  return (res as any)?.data ?? res;
}
