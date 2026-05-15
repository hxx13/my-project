import { adminHttp } from "@/api/core/adminHttp";
import type { ApiResponse } from "@/api/types/common";

export interface DahuaSwingTask {
  id?: number;
  name: string;
  enabled: number;
  pollIntervalSeconds?: number;
  queryJson: string;
  activationRulesJson?: string;
  lastCursorTime?: string;
  lastStatus?: string;
  lastError?: string;
  lastRunAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface DahuaSwingRuleConfig {
  mode?: "EXIT_ONLY" | "TOGGLE_IN_OUT";
  exitChannelCodes: string[];
  toggleChannelCodes: string[];
  activatedReswipeExitChannelCodes: string[];
  /** 自动签退后是否继续：大华 revoke + 卡片冻结。false 时仅 ARO 离开+小穿甲。仅此键控制，与扫码人工离开无关。 */
  autoRiskActionEnabled: boolean;
  autoExitDelaySeconds: number;
  enterDebounceSeconds: number;
  activationExpireSeconds: number;
  requireOtherRoomSuccess: boolean;
  otherRoomWithinSeconds: number;
}

export interface DahuaSwingRecord {
  id: number;
  taskId: number;
  recordId: string;
  cardNumber?: string;
  cardStatus?: number;
  channelCode?: string;
  channelName?: string;
  openType?: number;
  personCode?: string;
  personId?: number;
  personName?: string;
  swingTime?: string;
  createTime?: string;
  openResult?: number;
  enterOrExit?: number;
  mappingUserId?: string;
  mappingCardNo?: string;
  mappingHit?: number;
  freezeExemptFlag?: number;
  ingestedAt?: string;
}

export async function listDahuaSwingTasks() {
  const res = await adminHttp.get<ApiResponse<DahuaSwingTask[]>>("/twin/dahua/tasks");
  return res.data?.data || [];
}

export async function createDahuaSwingTask(body: DahuaSwingTask) {
  const res = await adminHttp.post<ApiResponse<DahuaSwingTask>>("/twin/dahua/tasks", body);
  return res.data?.data;
}

export async function updateDahuaSwingTask(id: number, body: DahuaSwingTask) {
  await adminHttp.put(`/twin/dahua/tasks/${id}`, body);
}

export async function deleteDahuaSwingTask(id: number) {
  await adminHttp.delete(`/twin/dahua/tasks/${id}`);
}

export async function executeDahuaSwingTask(id: number) {
  const res = await adminHttp.post<ApiResponse<{
    saved: number;
    lastCursorTime: string;
    lastRunAt?: string;
    pulledStartTime?: string;
    pulledEndTime?: string;
    queryWindowMinutes?: number;
  }>>(`/twin/dahua/tasks/${id}/execute`);
  return res.data?.data;
}

export async function executeAllDahuaSwingTask() {
  const res = await adminHttp.post<ApiResponse<{
    ok: number;
    fail: number;
    failDetails?: Array<{ taskId?: number; taskName?: string; reason?: string }>;
  }>>("/twin/dahua/tasks/execute-all");
  return res.data?.data;
}

export async function listDahuaSwingRecords(params: {
  taskId?: number;
  channelCode?: string;
  personCode?: string;
  personName?: string;
  openType?: number;
  startTime?: string;
  endTime?: string;
  page?: number;
  size?: number;
}) {
  const res = await adminHttp.get<ApiResponse<{ data: DahuaSwingRecord[]; total: number }>>("/twin/dahua/records", { params });
  return res.data?.data || { data: [], total: 0 };
}

export async function getDahuaSwingRuleConfig() {
  const res = await adminHttp.get<ApiResponse<DahuaSwingRuleConfig>>("/twin/dahua/rules/config");
  return res.data?.data;
}

export async function saveDahuaSwingRuleConfig(body: DahuaSwingRuleConfig) {
  await adminHttp.put("/twin/dahua/rules/config", body);
}
