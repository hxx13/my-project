import { authHttp } from "@/api/core/authHttp";
import type { AnalyticsCompareCycle } from "@/features/analytics/analyticsPipelineFilter";
import { scopeFilterOnly } from "@/features/analytics/analyticsPipelineFilter";

interface Result<T> {
  code: number;
  success: boolean;
  message: string;
  data: T;
}

export type AnalyticsReportKey = "isolation_usage" | string;

export interface AnalyticsReportDescriptor {
  key: AnalyticsReportKey;
  title: string;
  description: string;
  category: string;
  available: boolean;
}

export type IsolationScopeFilter = ReturnType<typeof scopeFilterOnly>;

export type IsolationUsageSummary = {
  totalPersonTimes: number;
  uniqueGroups?: number;
  uniqueUsers: number;
  rawLogCount: number;
  truncated?: boolean;
};

export type ProjectGroupRow = {
  groupName: string;
  personTimes: number;
};

export type RegionRow = {
  regionName: string;
  personTimes: number;
};

export type IsolationUsageQueryResult = {
  summary: IsolationUsageSummary;
  byRegion: RegionRow[];
  byProjectGroup: ProjectGroupRow[];
  fromSnapshot?: boolean;
  periodKey?: string;
  periodLabel?: string;
  currentRounds?: number;
  previousRounds?: number;
  deltaRounds?: number;
  deltaPct?: number | null;
};

export type AnalyticsUserView = {
  id: number;
  reportKey: string;
  name: string;
  filter: IsolationScopeFilter;
  defaultView: boolean;
  subscribed: boolean;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
};

export type AnalyticsAuditLog = {
  id: number;
  viewId: number;
  reportKey: string;
  viewName: string;
  periodType: AnalyticsCompareCycle | string;
  periodLabel: string;
  currentRounds: number;
  previousRounds: number;
  deltaRounds: number;
  deltaPct: number | null;
  createdAt: string;
};

async function unwrap<T>(p: Promise<{ data: Result<T> }>): Promise<T> {
  const res = await p;
  const body = res.data;
  if (!body?.success) {
    throw new Error(body?.message || "请求失败");
  }
  return body.data;
}

export { scopeFilterOnly };

export async function fetchAnalyticsReports(): Promise<AnalyticsReportDescriptor[]> {
  return unwrap(authHttp.get<Result<AnalyticsReportDescriptor[]>>("/v1/analytics/reports"));
}

export async function fetchAnalyticsViews(reportKey: string): Promise<AnalyticsUserView[]> {
  return unwrap(authHttp.get<Result<AnalyticsUserView[]>>("/v1/analytics/views", { params: { reportKey } }));
}

export async function fetchAnalyticsAuditLogs(params: {
  reportKey: string;
  viewId?: number;
  limit?: number;
}): Promise<AnalyticsAuditLog[]> {
  return unwrap(
    authHttp.get<Result<AnalyticsAuditLog[]>>("/v1/analytics/audit-logs", {
      params: { reportKey: params.reportKey, viewId: params.viewId, limit: params.limit ?? 100 },
    })
  );
}

export async function fetchAuditLogDetail(id: number): Promise<IsolationUsageQueryResult & { id: number; periodType: string }> {
  return unwrap(authHttp.get<Result<IsolationUsageQueryResult & { id: number; periodType: string }>>(`/v1/analytics/audit-logs/${id}/detail`));
}

export async function saveAnalyticsView(body: {
  reportKey: string;
  name: string;
  filter: IsolationScopeFilter;
}): Promise<AnalyticsUserView> {
  return unwrap(authHttp.post<Result<AnalyticsUserView>>("/v1/analytics/views", body));
}

export async function updateAnalyticsView(
  id: number,
  body: { name: string; filter: IsolationScopeFilter }
): Promise<AnalyticsUserView> {
  return unwrap(
    authHttp.put<Result<AnalyticsUserView>>(`/v1/analytics/views/${id}`, {
      reportKey: "isolation_usage",
      ...body,
    })
  );
}

export type AnalyticsSubscriptionOptions = {
  subscribed: boolean;
  backfillHistory?: boolean;
  backfillUntil?: string;
};

export async function setAnalyticsViewSubscription(
  id: number,
  subscribed: boolean,
  backfill?: Pick<AnalyticsSubscriptionOptions, "backfillHistory" | "backfillUntil">
): Promise<AnalyticsUserView> {
  return unwrap(
    authHttp.put<Result<AnalyticsUserView>>(`/v1/analytics/views/${id}/subscription`, {
      subscribed,
      backfillHistory: backfill?.backfillHistory,
      backfillUntil: backfill?.backfillUntil,
    })
  );
}

export async function deleteAnalyticsView(id: number): Promise<void> {
  await unwrap(authHttp.delete<Result<null>>(`/v1/analytics/views/${id}`));
}

export type LlmChartSuggestion = {
  title: string;
  type?: "bar" | "line" | string;
  labels: string[];
  values: number[];
};

export type LlmTopDriver = {
  name: string;
  personTimes?: number;
  sharePct?: number | null;
  note?: string;
};

export type LlmRegionInsight = {
  region: string;
  personTimes?: number;
  note?: string;
};

export type AnalyticsLlmInsightResult = {
  auditLogId: number;
  exists: boolean;
  headline?: string;
  executiveSummary?: string[];
  periodComparison?: { narrative?: string; highlights?: string[] };
  topDrivers?: LlmTopDriver[];
  regionInsights?: LlmRegionInsight[];
  meetingTalkingPoints?: string[];
  risksOrAnomalies?: string[];
  chartSuggestions?: LlmChartSuggestion[];
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  generatedAt?: string;
};

/** 大模型解读可能需 30s～2min，勿用 authHttp 默认 20s */
export const ANALYTICS_LLM_INSIGHT_TIMEOUT_MS = 180_000;

export async function fetchAnalyticsLlmInsight(
  auditLogId: number,
  autoGenerate = false
): Promise<AnalyticsLlmInsightResult> {
  return unwrap(
    authHttp.get<Result<AnalyticsLlmInsightResult>>("/v1/analytics/llm/insights", {
      params: { auditLogId, autoGenerate },
      timeout: autoGenerate ? ANALYTICS_LLM_INSIGHT_TIMEOUT_MS : undefined,
    })
  );
}

export type AnalyticsLlmBatchResult = {
  total: number;
  success: number;
  items: Array<AnalyticsLlmInsightResult & { error?: string }>;
};

export async function generateAnalyticsLlmInsightBatch(params: {
  reportKey: string;
  viewId: number;
  limit?: number;
  forceRefresh?: boolean;
}): Promise<AnalyticsLlmBatchResult> {
  return unwrap(
    authHttp.post<Result<AnalyticsLlmBatchResult>>("/v1/analytics/llm/insights/generate-batch", null, {
      params: {
        reportKey: params.reportKey,
        viewId: params.viewId,
        limit: params.limit ?? 5,
        forceRefresh: params.forceRefresh ?? false,
      },
      timeout: ANALYTICS_LLM_INSIGHT_TIMEOUT_MS,
    })
  );
}

export type LlmInsightPromptBundle = {
  reportKey: string;
  moduleLabel: string;
  userPrompt: string;
  systemPrompt: string;
  defaultUserPrompt: string;
  defaultSystemPrompt: string;
};

export async function fetchLlmInsightPrompt(reportKey: string): Promise<LlmInsightPromptBundle> {
  return unwrap(
    authHttp.get<Result<LlmInsightPromptBundle>>("/v1/analytics/llm/insight-prompt", {
      params: { reportKey },
    })
  );
}

export async function generateAnalyticsLlmInsight(
  auditLogId: number,
  forceRefresh = false,
  userPrompt?: string
): Promise<AnalyticsLlmInsightResult> {
  const trimmed = userPrompt?.trim();
  return unwrap(
    authHttp.post<Result<AnalyticsLlmInsightResult>>("/v1/analytics/llm/insights/generate", null, {
      params: {
        auditLogId,
        forceRefresh,
        ...(trimmed ? { userPrompt: trimmed } : {}),
      },
      timeout: ANALYTICS_LLM_INSIGHT_TIMEOUT_MS,
    })
  );
}

export type AnalyticsViewShareStatus = {
  active: boolean;
  shareId?: number;
  plainCode?: string;
  expiresAt?: string;
  auditLogCount?: number;
  insightCount?: number;
  maxImports?: number;
  importsRemaining?: number;
  importCount?: number;
  viewName: string;
  regenerated?: boolean;
};

export type AnalyticsViewSharePreview = {
  reportKey: string;
  viewName: string;
  ownerDisplayName: string;
  auditLogCount: number;
  insightCount: number;
  expiresAt: string | null;
  importsRemaining: number;
  snapshotNote: string;
};

export type AnalyticsViewShareImportResult = {
  view: AnalyticsUserView;
  importedAuditLogs: number;
  importedInsights: number;
  message: string;
};

function mapViewDto(raw: Record<string, unknown>): AnalyticsUserView {
  return {
    id: Number(raw.id),
    reportKey: String(raw.reportKey ?? ""),
    name: String(raw.name ?? ""),
    filter: (raw.filter as AnalyticsUserView["filter"]) ?? {},
    defaultView: Boolean(raw.defaultView),
    subscribed: Boolean(raw.subscribed),
    sortOrder: Number(raw.sortOrder ?? 0),
    createdAt: raw.createdAt != null ? String(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt != null ? String(raw.updatedAt) : undefined,
  };
}

export async function fetchAnalyticsViewShare(viewId: number): Promise<AnalyticsViewShareStatus> {
  return unwrap(authHttp.get<Result<AnalyticsViewShareStatus>>(`/v1/analytics/views/${viewId}/share`));
}

export async function createAnalyticsViewShare(
  viewId: number,
  opts?: { expiresDays?: number; maxImports?: number }
): Promise<AnalyticsViewShareStatus> {
  return unwrap(
    authHttp.post<Result<AnalyticsViewShareStatus>>(`/v1/analytics/views/${viewId}/share`, opts ?? {})
  );
}

export async function previewAnalyticsViewShare(code: string): Promise<AnalyticsViewSharePreview> {
  return unwrap(
    authHttp.get<Result<AnalyticsViewSharePreview>>("/v1/analytics/share/preview", {
      params: { code: code.trim() },
    })
  );
}

export async function importAnalyticsViewShare(
  code: string,
  targetName?: string
): Promise<AnalyticsViewShareImportResult> {
  const data = await unwrap(
    authHttp.post<Result<Record<string, unknown>>>("/v1/analytics/share/import", {
      code: code.trim(),
      ...(targetName?.trim() ? { targetName: targetName.trim() } : {}),
    })
  );
  const viewRaw = data.view as Record<string, unknown> | undefined;
  if (!viewRaw) {
    throw new Error("导入响应缺少配置数据");
  }
  return {
    view: mapViewDto(viewRaw),
    importedAuditLogs: Number(data.importedAuditLogs ?? 0),
    importedInsights: Number(data.importedInsights ?? 0),
    message: String(data.message ?? "导入成功"),
  };
}

export async function revokeAnalyticsViewShare(shareId: number): Promise<void> {
  await unwrap(authHttp.post<Result<null>>(`/v1/analytics/share/${shareId}/revoke`));
}
