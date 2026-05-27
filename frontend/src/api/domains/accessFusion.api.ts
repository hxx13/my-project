import { adminHttp } from "@/api/core/adminHttp";
import type { ApiResponse } from "@/api/types/common";

async function unwrap<T>(p: Promise<{ data: ApiResponse<T> }>): Promise<T> {
  const res = await p;
  const body = res.data;
  if (!body?.success) {
    throw new Error(body?.message || "请求失败");
  }
  return body.data as T;
}

export type AccessDoorMode =
  | "ENTRY_ONLY"
  | "EXIT_ONLY"
  | "BIDIRECTIONAL_TOGGLE"
  | "DAHUA_ENTER_EXIT";

export type SwingDirectionFilterCode = "ALL" | "ENTER" | "EXIT";

export type AccessDoorRule = {
  id?: number;
  ruleSetId?: number;
  statsTaskId?: number;
  channelCode: string;
  channelName?: string;
  doorMode: AccessDoorMode;
  pairedEntryChannel?: string;
  pairedExitChannel?: string;
  zoneId?: string;
  campus?: string;
  floor?: string;
  debounceSeconds?: number;
  maxSwipesPerMinute?: number;
  enabled?: number;
};

export type AccessCleanBatch = {
  id: number;
  batchType: string;
  windowStart?: string;
  windowEnd?: string;
  status: string;
  rawIn?: number;
  cleanedOut?: number;
  visitOut?: number;
  reviewCount?: number;
  errorMessage?: string;
  startedAt?: string;
  finishedAt?: string;
};

export type AccessCleanedEventRow = {
  id: number;
  batchId?: number;
  userId?: string;
  personName?: string;
  channelCode?: string;
  roomName?: string;
  areaName?: string;
  direction?: string;
  accessType?: number;
  inferenceMethod?: string;
  confidence?: number;
  flagsJson?: string;
  eventTime?: string;
  needsReview?: number;
  aiSuggestedDirection?: string;
};

export type DoorRuleListResult = {
  data: AccessDoorRule[];
  total: number;
  page: number;
  pageSize: number;
};

export type ReviewQueueResult = {
  data: AccessCleanedEventRow[];
  total: number;
  page: number;
  pageSize: number;
};

export type CleanPreviewRow = {
  swingRowId?: number;
  recordId: string;
  swingTime?: string;
  channelCode?: string;
  channelName?: string;
  personCode?: string;
  personName?: string;
  mappingUserId?: string;
  mappingHit?: number;
  departmentId?: string;
  departmentName?: string;
  audienceType?: "STUDENT" | "STAFF";
  openType?: number;
  openResult?: number;
  disposition: "INCLUDED" | "EXCLUDED";
  autoReason?: string;
  manualOverride?: string | null;
  manualVerdict?: string | null;
  direction?: string;
  directionOverride?: string | null;
  needsReview?: boolean;
  enterOrExit?: number;
  enterOrExitLabel?: string;
};

export type CleanScopeMode = "SELECTED_TASK" | "ALL_LINKED";

export type CleanWorkspacePreview = {
  rows: CleanPreviewRow[];
  total: number;
  includedCount: number;
  excludedCount: number;
  reviewCount: number;
  truncated?: boolean;
  /** 试算单次最多返回条数（与后端 PREVIEW_CAP 一致） */
  previewCap?: number;
  channelCode: string;
  sourceTaskCount?: number;
  statsTaskId?: number;
  scopeMode?: CleanScopeMode;
  dataWindowStart?: string;
  dataWindowEnd?: string;
  queryEffectiveStart?: string;
  queryEffectiveEnd?: string;
  pullTaskType?: string;
  swingDirectionFilter?: SwingDirectionFilterCode;
  swingDirectionFilterLabel?: string;
  previewOnly?: boolean;
  missingEnterOrExitCount?: number;
  hint?: string;
  incrementalOnly?: boolean;
  incrementalAfterTime?: string;
};

export type GlobalEnabledChannel = {
  channelCode: string;
  channelName?: string;
  taskCount?: number;
};

export type AccessChannelScopeRow = {
  id?: number;
  statsTaskId: number;
  channelCode: string;
  channelName?: string;
  enabled?: number;
};

export type ChannelScopeSuggestion = {
  channelCode: string;
  channelName?: string;
  recordCount?: number;
};

export type AccessCleanPackageRow = {
  id: number;
  statsTaskId?: number;
  channelCode?: string;
  packageName: string;
  windowStart?: string;
  windowEnd?: string;
  status: string;
  totalScanned?: number;
  includedCount?: number;
  excludedCount?: number;
  reviewCount?: number;
  publishedAt?: string;
  lastMergedSwingTime?: string;
};

export type GlobalLibrarySummary = {
  totalScanned: number;
  includedCount: number;
  excludedCount: number;
  channelCount: number;
};

export async function getGlobalCleanLibrarySummary() {
  return unwrap(
    adminHttp.get<ApiResponse<GlobalLibrarySummary>>("/twin/access-fusion/workspace/library-global-summary")
  );
}

export async function listGlobalEnabledCleanChannels() {
  return unwrap(
    adminHttp.get<ApiResponse<GlobalEnabledChannel[]>>("/twin/access-fusion/workspace/enabled-channels")
  );
}

export type ManualCleanItem = {
  recordId: string;
  manualOverride?: "FORCE_INCLUDE" | "FORCE_EXCLUDE" | null;
  manualVerdict?: "CONFIRMED" | "REJECTED" | null;
  directionOverride?: "ENTER" | "EXIT" | null;
};

export async function listAccessDoorRules(params?: {
  page?: number;
  pageSize?: number;
  keyword?: string;
  statsTaskId?: number;
}) {
  return unwrap(
    adminHttp.get<ApiResponse<DoorRuleListResult>>("/twin/access-fusion/door-rules", { params })
  );
}

export type CleanWorkspaceRequestBody = {
  /** 审计拉取任务 ID（手动试算/入库必选） */
  statsTaskId: number;
  /** 默认 SELECTED_TASK：仅当前任务；ALL_LINKED 为通道下全部关联任务（定时任务用） */
  scopeMode?: CleanScopeMode;
  channelCode: string;
  startTime?: string;
  endTime?: string;
  requireMapping?: boolean;
  openSuccessOnly?: boolean;
  /** 默认 true：有游标时叠加游标下界，不丢弃数据窗开始时间 */
  incrementalOnly?: boolean;
  swingDirectionFilter?: SwingDirectionFilterCode | "";
  manualByRecordId?: Record<string, ManualCleanItem>;
};

export async function previewAccessCleanWorkspace(body: CleanWorkspaceRequestBody) {
  return unwrap(
    adminHttp.post<ApiResponse<CleanWorkspacePreview>>("/twin/access-fusion/workspace/preview", body, {
      timeout: 120_000,
    })
  );
}

export type AccessSwingCleanRunRow = {
  id: number;
  channelCode: string;
  packageId?: number;
  triggerType: "MANUAL" | "SCHEDULED" | "RERUN" | string;
  statsTaskIdsJson?: string;
  configSnapshotJson?: string;
  incrementalAfterTime?: string;
  windowStart?: string;
  windowEnd?: string;
  status: string;
  totalScanned?: number;
  includedCount?: number;
  excludedCount?: number;
  reviewCount?: number;
  supersededByRunId?: number;
  startedAt?: string;
  finishedAt?: string;
};

export type CleanMergeResult = {
  package: AccessCleanPackageRow;
  run: AccessSwingCleanRunRow;
};

export async function saveAccessCleanPackage(
  body: CleanWorkspaceRequestBody & {
    publish?: boolean;
    manualItems?: ManualCleanItem[];
  }
) {
  return unwrap(
    adminHttp.post<ApiResponse<CleanMergeResult>>("/twin/access-fusion/workspace/packages", body, {
      timeout: 180_000,
    })
  );
}

export async function listAccessSwingCleanRuns(channelCode: string, limit = 30) {
  return unwrap(
    adminHttp.get<ApiResponse<AccessSwingCleanRunRow[]>>("/twin/access-fusion/workspace/clean-runs", {
      params: { channelCode, limit },
    })
  );
}

export type CleanConfigSummary = {
  statsTaskId?: number;
  scopeMode?: string;
  requireMapping?: boolean;
  requireMappingLabel: string;
  openSuccessOnly?: boolean;
  openSuccessOnlyLabel: string;
  incrementalOnly?: boolean;
  incrementalOnlyLabel: string;
  dataWindowStart?: string;
  dataWindowEnd?: string;
  queryEffectiveStart?: string;
  queryEffectiveEnd?: string;
  startTime?: string;
  endTime?: string;
  incrementalAfterTime?: string;
  debounceSeconds?: number;
  debounceLabel?: string;
  swingDirectionFilter?: SwingDirectionFilterCode;
  swingDirectionFilterLabel?: string;
};

export type CleanItemCounts = {
  totalScanned: number;
  includedCount: number;
  excludedCount: number;
};

export type CleanItemPageView = {
  items: CleanPreviewRow[];
  total: number;
  page: number;
  pageSize: number;
  counts: CleanItemCounts;
};

export type CleanRunView = CleanItemPageView & {
  run: AccessSwingCleanRunRow;
  configSummary: CleanConfigSummary;
};

export type CleanLibraryView = CleanItemPageView & {
  package: AccessCleanPackageRow | null;
  channelCode: string;
};

export async function getCleanRunView(
  runId: number,
  params?: { disposition?: "" | "INCLUDED" | "EXCLUDED"; page?: number; pageSize?: number }
) {
  return unwrap(
    adminHttp.get<ApiResponse<CleanRunView>>(`/twin/access-fusion/workspace/clean-runs/${runId}`, {
      params: {
        disposition: params?.disposition || undefined,
        page: params?.page ?? 1,
        pageSize: params?.pageSize ?? 100,
      },
    })
  );
}

export async function listCleanLibraryItems(
  channelCode: string,
  params?: { disposition?: "" | "INCLUDED" | "EXCLUDED"; page?: number; pageSize?: number }
) {
  return unwrap(
    adminHttp.get<ApiResponse<CleanLibraryView>>("/twin/access-fusion/workspace/library/items", {
      params: {
        channelCode,
        disposition: params?.disposition || undefined,
        page: params?.page ?? 1,
        pageSize: params?.pageSize ?? 100,
      },
    })
  );
}

export async function rerunAccessSwingCleanRun(
  runId: number,
  body: {
    publish?: boolean;
    requireMapping?: boolean;
    openSuccessOnly?: boolean;
    incrementalOnly?: boolean;
    manualItems?: ManualCleanItem[];
  }
) {
  return unwrap(
    adminHttp.post<ApiResponse<CleanMergeResult>>(
      `/twin/access-fusion/workspace/clean-runs/${runId}/rerun`,
      body,
      { timeout: 180_000 }
    )
  );
}

export async function deleteAccessSwingCleanRun(runId: number): Promise<void> {
  await unwrap(adminHttp.delete<ApiResponse<null>>(`/twin/access-fusion/workspace/clean-runs/${runId}`));
}

export async function listAccessCleanPackages(channelCode: string) {
  return unwrap(
    adminHttp.get<ApiResponse<AccessCleanPackageRow[]>>("/twin/access-fusion/workspace/packages", {
      params: { channelCode },
    })
  );
}

export type LivingAccessCleanPackage = {
  package: AccessCleanPackageRow | null;
  manualItems: ManualCleanItem[];
  pendingIncrementalCount?: number;
  incrementalAfterTime?: string;
};

export async function getLivingAccessCleanPackage(channelCode: string, statsTaskId?: number) {
  return unwrap(
    adminHttp.get<ApiResponse<LivingAccessCleanPackage>>("/twin/access-fusion/workspace/packages/living", {
      params: { channelCode, statsTaskId: statsTaskId && statsTaskId > 0 ? statsTaskId : undefined },
    })
  );
}

export async function listAccessChannelScope(statsTaskId: number) {
  return unwrap(
    adminHttp.get<ApiResponse<AccessChannelScopeRow[]>>("/twin/access-fusion/workspace/channel-scope", {
      params: { statsTaskId },
    })
  );
}

export async function suggestAccessChannelScope(statsTaskId: number, limit = 80) {
  return unwrap(
    adminHttp.get<ApiResponse<ChannelScopeSuggestion[]>>(
      "/twin/access-fusion/workspace/channel-scope/suggestions",
      { params: { statsTaskId, limit } }
    )
  );
}

export type AccessCleanTaskSettings = {
  statsTaskId: number;
  debounceSeconds: number;
  /** 1=定时任务自动增量清洗并打包落库 */
  autoCleanPackage?: number;
  swingDirectionFilter?: SwingDirectionFilterCode;
};

export async function getAccessCleanTaskSettings(statsTaskId: number) {
  return unwrap(
    adminHttp.get<ApiResponse<AccessCleanTaskSettings>>("/twin/access-fusion/workspace/task-settings", {
      params: { statsTaskId },
    })
  );
}

export async function saveAccessCleanTaskSettings(
  statsTaskId: number,
  debounceSeconds: number,
  autoCleanPackage?: number,
  swingDirectionFilter?: SwingDirectionFilterCode
) {
  return unwrap(
    adminHttp.put<ApiResponse<AccessCleanTaskSettings>>("/twin/access-fusion/workspace/task-settings", {
      statsTaskId,
      debounceSeconds,
      autoCleanPackage: autoCleanPackage ?? undefined,
      swingDirectionFilter: swingDirectionFilter ?? undefined,
    })
  );
}

export async function replaceAccessChannelScope(
  statsTaskId: number,
  channels: { channelCode: string; channelName?: string }[]
) {
  return unwrap(
    adminHttp.put<ApiResponse<AccessChannelScopeRow[]>>("/twin/access-fusion/workspace/channel-scope", {
      statsTaskId,
      channels,
    })
  );
}

export async function createAccessDoorRule(body: AccessDoorRule) {
  return unwrap(adminHttp.post<ApiResponse<{ id: number }>>("/twin/access-fusion/door-rules", body));
}

export async function updateAccessDoorRule(id: number, body: AccessDoorRule) {
  return unwrap(adminHttp.put<ApiResponse<{ id: number }>>(`/twin/access-fusion/door-rules/${id}`, body));
}

export async function deleteAccessDoorRule(id: number) {
  await unwrap(adminHttp.delete<ApiResponse<null>>(`/twin/access-fusion/door-rules/${id}`));
}

export async function backfillAccessRaw(startTime?: string, endTime?: string) {
  return unwrap(
    adminHttp.post<ApiResponse<{ ingested: number }>>("/twin/access-fusion/raw/backfill", null, {
      params: { startTime, endTime },
    })
  );
}

export async function runAccessClean(windowStart: string, windowEnd: string) {
  return unwrap(
    adminHttp.post<ApiResponse<AccessCleanBatch>>("/twin/access-fusion/clean/run", null, {
      params: { windowStart, windowEnd },
    })
  );
}

export async function listAccessCleanBatches() {
  return unwrap(adminHttp.get<ApiResponse<AccessCleanBatch[]>>("/twin/access-fusion/clean/batches"));
}

export async function listAccessBatchEvents(batchId: number, page = 1, pageSize = 100) {
  return unwrap(
    adminHttp.get<ApiResponse<AccessCleanedEventRow[]>>(`/twin/access-fusion/clean/batches/${batchId}/events`, {
      params: { page, pageSize },
    })
  );
}

export async function listAccessReviewQueue(page = 1, pageSize = 50) {
  return unwrap(
    adminHttp.get<ApiResponse<ReviewQueueResult>>("/twin/access-fusion/review-queue", { params: { page, pageSize } })
  );
}

export async function confirmAccessReview(id: number, direction: "ENTER" | "EXIT") {
  await unwrap(
    adminHttp.post<ApiResponse<null>>(`/twin/access-fusion/review/${id}/confirm`, null, {
      params: { direction },
    })
  );
}

export async function suggestAccessReviewAi(id: number) {
  return unwrap(
    adminHttp.post<ApiResponse<{ suggestedDirection?: string; explanation?: string }>>(
      `/twin/access-fusion/review/${id}/ai-suggest`,
      null
    )
  );
}

export type AccessCleanRuleProfile = {
  id?: number;
  name: string;
  description?: string;
  debounceSeconds?: number;
  swingDirectionFilter?: string;
  autoCleanPackage?: number;
  requireMapping?: number;
  openSuccessOnly?: number;
  defaultDoorMode?: string;
};

export type AccessCleanExecutionLog = {
  id?: number;
  statsPullTaskId?: number;
  cleanRuleProfileId?: number;
  executionDate?: string;
  coverageDay?: string;
  channelCode?: string;
  windowStart?: string;
  windowEnd?: string;
  channelCodesJson?: string;
  status?: string;
  totalScanned?: number;
  includedCount?: number;
  excludedCount?: number;
  reviewCount?: number;
  noteText?: string;
  logType?: string;
  ruleProfileName?: string;
  ruleSummary?: string;
  ledgerEntryCount?: number;
  dailyLedger?: DailyCleanLedgerEntry[];
  createdAt?: string;
};

export type DailyCleanLedgerEntry = {
  coverageDay?: string;
  channelCode?: string;
  windowStart?: string;
  windowEnd?: string;
  totalScanned?: number;
  includedCount?: number;
  excludedCount?: number;
  truncated?: boolean;
  executionLogId?: number;
  status?: string;
  error?: string;
};

export type AccessCleanPackageItemRow = {
  id?: number;
  packageId?: number;
  lastRunId?: number;
  recordId?: string;
  swingTime?: string;
  channelCode?: string;
  channelName?: string;
  personName?: string;
  audienceType?: string;
  disposition?: string;
  direction?: string;
  directionOverride?: string;
};

export async function listAccessCleanRuleProfiles() {
  return unwrap(adminHttp.get<ApiResponse<AccessCleanRuleProfile[]>>("/twin/access-fusion/rule-profiles"));
}

export async function createAccessCleanRuleProfile(body: AccessCleanRuleProfile) {
  return unwrap(adminHttp.post<ApiResponse<AccessCleanRuleProfile>>("/twin/access-fusion/rule-profiles", body));
}

export async function updateAccessCleanRuleProfile(id: number, body: AccessCleanRuleProfile) {
  return unwrap(
    adminHttp.put<ApiResponse<AccessCleanRuleProfile>>(`/twin/access-fusion/rule-profiles/${id}`, body)
  );
}

export async function deleteAccessCleanRuleProfile(id: number) {
  await unwrap(adminHttp.delete<ApiResponse<null>>(`/twin/access-fusion/rule-profiles/${id}`));
}

export async function purgeAccessCleanLibrary(body: {
  confirmToken: string;
  channelCodes?: string[];
  deleteExecutionLogs?: boolean;
}) {
  return unwrap(
    adminHttp.post<ApiResponse<{ itemsBefore: number; itemsDeleted: number; executionLogsDeleted: number }>>(
      "/twin/access-fusion/library/purge",
      body
    )
  );
}

export async function updateAccessExecutionLogMeta(
  id: number,
  body: { noteText?: string; status?: string }
) {
  return unwrap(
    adminHttp.put<ApiResponse<AccessCleanExecutionLog>>(`/twin/access-fusion/execution-logs/${id}`, body)
  );
}

export async function deleteAccessExecutionLog(id: number) {
  await unwrap(adminHttp.delete<ApiResponse<null>>(`/twin/access-fusion/execution-logs/${id}`));
}

export async function queryAccessCleanLibrary(params: {
  channelCodes?: string[];
  startTime?: string;
  endTime?: string;
  disposition?: string;
  audienceType?: string;
  actionType?: number;
  personName?: string;
  lastRunId?: number;
  statsPullTaskId?: number;
  page?: number;
  pageSize?: number;
}) {
  return unwrap(
    adminHttp.get<ApiResponse<{ total: number; items: AccessCleanPackageItemRow[] }>>(
      "/twin/access-fusion/library/query",
      { params }
    )
  );
}

export async function patchAccessCleanLibraryItem(
  id: number,
  body: Partial<Pick<AccessCleanPackageItemRow, "disposition" | "directionOverride" | "audienceType">> & {
    manualVerdict?: string;
  }
) {
  return unwrap(
    adminHttp.patch<ApiResponse<AccessCleanPackageItemRow>>(`/twin/access-fusion/library/items/${id}`, body)
  );
}

export async function fetchAccessExecutionLogDetail(id: number) {
  return unwrap(
    adminHttp.get<ApiResponse<AccessCleanExecutionLog & { configSnapshot?: Record<string, unknown> }>>(
      `/twin/access-fusion/execution-logs/${id}/detail`
    )
  );
}

export async function listAccessExecutionLogs(params?: {
  statsPullTaskId?: number;
  cleanRuleProfileId?: number;
  executionDate?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}) {
  return unwrap(
    adminHttp.get<ApiResponse<{ total: number; items: AccessCleanExecutionLog[]; page: number; pageSize: number }>>(
      "/twin/access-fusion/execution-logs",
      { params }
    )
  );
}

export async function executeAccessClean(body: {
  statsTaskId?: number;
  scopeMode?: CleanScopeMode;
  channelCode?: string;
  startTime?: string;
  endTime?: string;
  cleanRuleProfileId?: number;
  requireMapping?: boolean;
  openSuccessOnly?: boolean;
  swingDirectionFilter?: string;
  /** 默认 true：按自然日×通道分段入库并写逐日日志 */
  splitByDay?: boolean;
}) {
  return unwrap(
    adminHttp.post<ApiResponse<CleanMergeResult & { executionLog?: AccessCleanExecutionLog }>>(
      "/twin/access-fusion/workspace/execute-clean",
      body,
      { timeout: 120_000 }
    )
  );
}

export async function compareIsolation7d(params?: {
  campuses?: string[];
  floors?: string[];
  roomName?: string;
  excludeBlacklist?: boolean;
}) {
  return unwrap(
    adminHttp.post<ApiResponse<Record<string, unknown>>>("/twin/access-fusion/compare/isolation-7d", null, {
      params,
    })
  );
}
