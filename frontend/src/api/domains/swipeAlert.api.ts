import { adminHttp } from "@/api/core/adminHttp";

interface Result<T> {
  code: number;
  success: boolean;
  message: string;
  data: T;
}

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
  notifySite: boolean;
  notifyPush: boolean;
  notifyUserIds: string | null;
  notifyCardholder: boolean;
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
  notifySite: boolean;
  notifyPush: boolean;
  notifyUserIds: string | null;
  notifyCardholder: boolean;
}

export async function listSwipeAlertRules(): Promise<SwipeAlertRuleRow[]> {
  const res = await adminHttp.get<Result<SwipeAlertRuleRow[]>>("/swipe-alert/rules");
  return res.data?.data ?? [];
}

export async function createSwipeAlertRule(body: SwipeAlertRuleUpsert): Promise<SwipeAlertRuleRow> {
  const res = await adminHttp.post<Result<SwipeAlertRuleRow>>("/swipe-alert/rules", body);
  return res.data?.data as SwipeAlertRuleRow;
}

export async function updateSwipeAlertRule(id: number, body: SwipeAlertRuleUpsert): Promise<SwipeAlertRuleRow> {
  const res = await adminHttp.put<Result<SwipeAlertRuleRow>>(`/swipe-alert/rules/${id}`, body);
  return res.data?.data as SwipeAlertRuleRow;
}

export async function deleteSwipeAlertRule(id: number): Promise<void> {
  await adminHttp.delete(`/swipe-alert/rules/${id}`);
}

export async function toggleSwipeAlertRule(id: number): Promise<SwipeAlertRuleRow> {
  const res = await adminHttp.patch<Result<SwipeAlertRuleRow>>(`/swipe-alert/rules/${id}/toggle`);
  return res.data?.data as SwipeAlertRuleRow;
}
