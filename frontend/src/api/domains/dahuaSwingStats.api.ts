import { adminHttp } from "@/api/core/adminHttp";
import type { ApiResponse } from "@/api/types/common";

export type DahuaSwingStatsPullTask = {
  id?: number;
  name: string;
  enabled?: number;
  periodMode?: "PREVIOUS_DAY" | "PREVIOUS_WEEK" | "HISTORICAL_RANGE" | "SINCE_LAST";
  periodDays?: number;
  queryJson: string;
  lastPulledStart?: string;
  lastPulledEnd?: string;
  lastStatus?: string;
  lastError?: string;
  lastRunAt?: string;
  lastSavedCount?: number;
  /** 回溯任务 queryJson 累计入库（各段合计） */
  backfillTotalSaved?: number;
  /** 记录库中该任务 STATS 条数 */
  libraryRecordCount?: number;
  /** 绑定的清洗规则方案 */
  cleanRuleProfileId?: number;
};

async function unwrap<T>(res: { data: ApiResponse<T> }): Promise<T> {
  return res.data.data as T;
}

export async function listDahuaSwingStatsTasks(): Promise<DahuaSwingStatsPullTask[]> {
  const res = await adminHttp.get<ApiResponse<DahuaSwingStatsPullTask[]>>("/twin/dahua/stats-tasks");
  return unwrap(res);
}

export async function createDahuaSwingStatsTask(body: DahuaSwingStatsPullTask) {
  const res = await adminHttp.post<ApiResponse<DahuaSwingStatsPullTask>>("/twin/dahua/stats-tasks", body);
  return unwrap(res);
}

export async function updateDahuaSwingStatsTask(id: number, body: DahuaSwingStatsPullTask) {
  await adminHttp.put(`/twin/dahua/stats-tasks/${id}`, body);
}

export async function deleteDahuaSwingStatsTask(id: number) {
  await adminHttp.delete(`/twin/dahua/stats-tasks/${id}`);
}

export type StatsTaskExecuteResult = {
  saved: number;
  pulledStartTime: string;
  pulledEndTime: string;
  periodMode?: string;
  effectivePeriodMode?: string;
  usedManualOverride?: boolean;
  manualOverrideNote?: string;
  forceOverwrite?: boolean;
  forceNote?: string;
  forceSegments?: number;
  forceSegmentsNoData?: number;
  backfillComplete?: boolean;
  backfillCursor?: string;
  backfillHint?: string;
  apiStartSwingTime?: string;
  apiEndSwingTime?: string;
  dahuaFirstPageRows?: number;
  backfillTotalSaved?: number;
  rawReconciled?: number;
  autoCleanTriggered?: boolean;
  autoCleanSkippedReason?: string;
  autoCleanError?: string;
  cleanIncludedTotal?: number;
  cleanChannelCount?: number;
  cleanScannedTotal?: number;
  cleanDayCount?: number;
};

export async function executeDahuaSwingStatsTask(
  id: number,
  params?: { startTime?: string; endTime?: string; forceOverwrite?: boolean }
) {
  const res = await adminHttp.post<ApiResponse<StatsTaskExecuteResult>>(
    `/twin/dahua/stats-tasks/${id}/execute`,
    null,
    {
      params,
      timeout: params?.forceOverwrite ? 600_000 : 180_000,
    }
  );
  return unwrap(res);
}

export async function executeAllDahuaSwingStatsInPlan() {
  const res = await adminHttp.post<ApiResponse<{ ok: number; fail: number }>>(
    "/twin/dahua/stats-tasks/execute-all-in-plan",
    null
  );
  return unwrap(res);
}

export async function retryStatsTask(id: number) {
  return unwrap(adminHttp.post<ApiResponse<Record<string, unknown>>>(`/twin/dahua/stats-tasks/${id}/retry`));
}

export async function retryAllFailedStatsTasks() {
  return unwrap(adminHttp.post<ApiResponse<Record<string, unknown>>>(`/twin/dahua/stats-tasks/retry-all-failed`));
}

export async function fetchStatsTasksHealth() {
  return unwrap(adminHttp.get<ApiResponse<{
    total: number; ok: number; failed: number; neverRun: number; running: number;
    recentFailures: Array<{ id: number; name: string; lastError: string; lastRunAt: string }>;
  }>>(`/twin/dahua/stats-tasks/health`));
}
