import { adminHttp } from "@/api/core/adminHttp";

interface Result<T> {
  code: number;
  success: boolean;
  message: string;
  data: T;
}

export interface DoorTempUnlockRuleRow {
  id: number;
  name: string;
  enabled: boolean;
  channelCodes: string | null;
  thresholdCount: number;
  thresholdWindowSec: number;
  unlockDurationSec: number;
  cooldownSec: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface DoorTempUnlockRuleUpsert {
  name: string;
  enabled: boolean;
  channelCodes: string | null;
  thresholdCount: number;
  thresholdWindowSec: number;
  unlockDurationSec: number;
  cooldownSec: number;
}

export async function listDoorTempUnlockRules(): Promise<DoorTempUnlockRuleRow[]> {
  const res = await adminHttp.get<Result<DoorTempUnlockRuleRow[]>>("/door-temp-unlock/rules");
  return res.data?.data ?? [];
}

export async function createDoorTempUnlockRule(body: DoorTempUnlockRuleUpsert): Promise<DoorTempUnlockRuleRow> {
  const res = await adminHttp.post<Result<DoorTempUnlockRuleRow>>("/door-temp-unlock/rules", body);
  return res.data?.data as DoorTempUnlockRuleRow;
}

export async function updateDoorTempUnlockRule(id: number, body: DoorTempUnlockRuleUpsert): Promise<DoorTempUnlockRuleRow> {
  const res = await adminHttp.put<Result<DoorTempUnlockRuleRow>>(`/door-temp-unlock/rules/${id}`, body);
  return res.data?.data as DoorTempUnlockRuleRow;
}

export async function deleteDoorTempUnlockRule(id: number): Promise<void> {
  await adminHttp.delete(`/door-temp-unlock/rules/${id}`);
}

export async function toggleDoorTempUnlockRule(id: number): Promise<DoorTempUnlockRuleRow> {
  const res = await adminHttp.patch<Result<DoorTempUnlockRuleRow>>(`/door-temp-unlock/rules/${id}/toggle`);
  return res.data?.data as DoorTempUnlockRuleRow;
}
