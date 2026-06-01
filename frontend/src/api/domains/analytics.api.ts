import { authHttp } from "@/api/core/authHttp";
import type { AnalyticsCompareCycle } from "@/features/analytics/analyticsPipelineFilter";
import { scopeFilterOnly } from "@/features/analytics/analyticsPipelineFilter";
import { cageScopeFilterOnly } from "@/features/analytics/cageAnalyticsFilter";

interface Result<T> {
  code: number;
  success: boolean;
  message: string;
  data: T;
}

export type AnalyticsReportKey = "isolation_usage" | "cage_occupancy" | string;

export interface AnalyticsReportDescriptor {
  key: AnalyticsReportKey;
  title: string;
  description: string;
  category: string;
  available: boolean;
}

export type IsolationScopeFilter = ReturnType<typeof scopeFilterOnly>;
export type CageScopeFilter = ReturnType<typeof cageScopeFilterOnly>;
export type AnalyticsViewFilter = IsolationScopeFilter | CageScopeFilter | Record<string, unknown>;

export type IsolationUsageSummary = {
  totalPersonTimes: number;
  totalEvents?: number;
  studentEvents?: number;
  staffEvents?: number;
  totalSets?: number;
  studentSets?: number;
  staffSets?: number;
  directionScope?: string;
  totalOccupiedSlots?: number;
  uniqueGroups?: number;
  uniqueUsers?: number;
  /** ARO 流水 userId 去重（学生部门）；快照可含此字段，本期规模卡片不展示 */
  uniqueStudentUsers?: number;
  aroFlowLogCount?: number;
  uniquePis?: number;
  uniqueRooms?: number;
  rawLogCount?: number;
  truncated?: boolean;
  /** access_package | cleaned | aro */
  dataSource?: string;
  metricNote?: string;
  channelScope?: string;
  reviewPendingCount?: number;
  filterSnapshot?: Record<string, unknown>;
  queryTrace?: Record<string, unknown>;
};

export type FlowAuxiliarySnapshot = {
  dataSource?: string;
  note?: string;
  flowScope?: string;
  byProjectGroup?: ProjectGroupRow[];
  byRoom?: CageRoomRow[];
  rawLogCount?: number;
  uniqueGroups?: number;
  uniqueStudentUsers?: number;
};

export type ProjectGroupRow = {
  groupName: string;
  personTimes: number;
  occupiedSlots?: number;
};

export type CagePiRow = {
  piName: string;
  personTimes: number;
  occupiedSlots?: number;
};

export type CageRoomRow = {
  roomName: string;
  location?: string;
  personTimes: number;
  occupiedSlots?: number;
};

export type RegionRow = {
  regionName: string;
  personTimes: number;
};

export type IsolationUsageQueryResult = {
  summary: IsolationUsageSummary;
  byRegion: RegionRow[];
  byProjectGroup: ProjectGroupRow[];
  byPi?: CagePiRow[];
  byRoom?: CageRoomRow[];
  auxiliaryFlow?: FlowAuxiliarySnapshot;
  userLevel?: { userId: string; userName: string; personTimes: number }[];
  fromSnapshot?: boolean;
  periodKey?: string;
  periodLabel?: string;
  currentRounds?: number;
  previousRounds?: number;
  deltaRounds?: number;
  deltaPct?: number | null;
  currentStart?: string;
  currentEnd?: string;
  filterSnapshot?: Record<string, unknown>;
  queryProvenance?: {
    startTime?: string;
    endTime?: string;
    totalMs?: number;
    steps?: Array<Record<string, unknown>>;
  };
};

export type AnalyticsUserView = {
  id: number;
  reportKey: string;
  name: string;
  filter: AnalyticsViewFilter;
  defaultView: boolean;
  subscribed: boolean;
  sortOrder: number;
  isPublic?: boolean;
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
  studentRounds?: number;
  staffRounds?: number;
  currentUsers?: number;
  previousUsers?: number;
  currentGroups?: number;
  currentStudentUsers?: number;
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
  const rows = await unwrap(
    authHttp.get<Result<AnalyticsUserView[]>>("/v1/analytics/views", { params: { reportKey } })
  );
  return (rows ?? []).map((row) =>
    row && typeof row === "object" ? mapViewDto(row as unknown as Record<string, unknown>) : row
  );
}

export type CageAuditProgress = {
  status: "idle" | "running" | "done" | "failed";
  viewId: number;
  message?: string;
  periodType?: string;
  periodLabel?: string;
  cycleIndex?: number;
  cycleTotal?: number;
  totalShelves?: number;
  processedShelves?: number;
  batchIndex?: number;
  batchCount?: number;
  percent?: number;
  updatedAtMs?: number;
};

export async function fetchCageAuditProgress(viewId: number): Promise<CageAuditProgress> {
  return unwrap(
    authHttp.get<Result<CageAuditProgress>>(`/v1/analytics/views/${viewId}/cage-audit-progress`)
  );
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

/** 按当前配置试算隔离服统计（与快照同 Facade 口径，不写库） */
export async function previewIsolationUsage(
  filter: AnalyticsViewFilter,
  startTime: string,
  endTime: string
): Promise<IsolationUsageQueryResult> {
  return unwrap(
    authHttp.post<Result<IsolationUsageQueryResult>>("/v1/analytics/isolation-usage/preview", filter, {
      params: { startTime, endTime },
    })
  );
}

export async function saveAnalyticsView(body: {
  reportKey: string;
  name: string;
  filter: AnalyticsViewFilter;
}): Promise<AnalyticsUserView> {
  return unwrap(authHttp.post<Result<AnalyticsUserView>>("/v1/analytics/views", body));
}

export async function updateAnalyticsView(
  id: number,
  body: {
    name: string;
    filter: AnalyticsViewFilter;
    reportKey?: string;
    /** 为 true 时强制重算全部已有快照（配置未改也会重算） */
    forceRecalcSnapshots?: boolean;
  }
): Promise<AnalyticsUserView> {
  return unwrap(
    authHttp.put<Result<AnalyticsUserView>>(`/v1/analytics/views/${id}`, {
      reportKey: body.reportKey ?? "isolation_usage",
      name: body.name,
      filter: body.filter,
      forceRecalcSnapshots: body.forceRecalcSnapshots === true,
    })
  );
}

export async function forceRecalcAnalyticsSnapshots(viewId: number): Promise<void> {
  await unwrap(authHttp.post<Result<null>>(`/v1/analytics/views/${viewId}/force-recalc-snapshots`));
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

export type AnalyticsInsightDataPackage = {
  auditLogId: number;
  reportKey: string;
  moduleLabel: string;
  metricUnit: string;
  periodLabel?: string;
  periodType?: string;
  viewId?: number;
  viewName?: string;
  summaryPreview?: string;
  snapshotJson?: string;
};

/** 封箱当前清算快照（不调用大模型），供 AI 解读弹窗投喂 */
export async function fetchInsightDataPackage(auditLogId: number): Promise<AnalyticsInsightDataPackage> {
  return unwrap(
    authHttp.get<Result<AnalyticsInsightDataPackage>>("/v1/analytics/llm/insight-data-package", {
      params: { auditLogId },
    })
  );
}

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
  reportKey?: string;
  viewCount?: number;
  viewNames?: string[];
  viewName?: string;
  regenerated?: boolean;
};

export type AnalyticsViewSharePreview = {
  reportKey: string;
  viewName: string;
  viewCount?: number;
  viewNames?: string[];
  ownerDisplayName: string;
  auditLogCount: number;
  insightCount: number;
  expiresAt: string | null;
  importsRemaining: number;
  snapshotNote: string;
};

// ---- 学生活跃度统计 ----

export type StudentActivityGroup = {
  name: string;
};

export type StudentActivitySummary = {
  memberCount: number;
  totalEntries: number;
  totalDurationMinutes: number;
  avgDailyFreq: number;
  activeRate: number;
};

export type StudentActivityMember = {
  userId: string;
  userName: string;
  entryCount: number;
  totalDurationMinutes: number;
  dailyAvgFreq: number;
  lastActiveDate: string | null;
  daysSinceLastActive: number;
};

export type StudentActivityResult = {
  summary: StudentActivitySummary;
  members: StudentActivityMember[];
  total: number;
};

export type HeatmapCell = {
  dayOfWeek: number;
  hour: number;
  count: number;
};

export type DailyTrendPoint = {
  date: string;
  entryCount: number;
  exitCount: number;
};

export type AnalyticsViewShareImportResult = {
  views: AnalyticsUserView[];
  view?: AnalyticsUserView;
  viewCount: number;
  importedAuditLogs: number;
  importedInsights: number;
  message: string;
};

function normalizeImportedViews(viewsRaw: unknown, singleView: unknown): AnalyticsUserView[] {
  if (Array.isArray(viewsRaw)) {
    const mapped = viewsRaw
      .map((v) => (v && typeof v === "object" ? mapViewDto(v as Record<string, unknown>) : null))
      .filter((v): v is AnalyticsUserView => v != null && Number.isFinite(v.id) && v.id > 0);
    if (mapped.length > 0) return mapped;
  }
  if (singleView && typeof singleView === "object") {
    const one = mapViewDto(singleView as Record<string, unknown>);
    if (one.id > 0) return [one];
  }
  return [];
}

function parseViewFilter(filterRaw: unknown): AnalyticsUserView["filter"] {
  if (typeof filterRaw === "string" && filterRaw.trim()) {
    try {
      const parsed = JSON.parse(filterRaw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as AnalyticsUserView["filter"];
      }
    } catch {
      /* ignore */
    }
    return {};
  }
  if (filterRaw && typeof filterRaw === "object" && !Array.isArray(filterRaw)) {
    return filterRaw as AnalyticsUserView["filter"];
  }
  return {};
}

function mapViewDto(raw: Record<string, unknown>): AnalyticsUserView {
  const filter = parseViewFilter(raw.filter ?? raw.filterJson);
  return {
    id: Number(raw.id),
    reportKey: String(raw.reportKey ?? ""),
    name: String(raw.name ?? ""),
    filter,
    defaultView: Boolean(raw.defaultView),
    subscribed: Boolean(raw.subscribed),
    sortOrder: Number(raw.sortOrder ?? 0),
    isPublic: (filter as Record<string, unknown>)?.isPublic === true,
    createdAt: raw.createdAt != null ? String(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt != null ? String(raw.updatedAt) : undefined,
  };
}

export async function fetchAnalyticsReportShare(reportKey: string): Promise<AnalyticsViewShareStatus> {
  return unwrap(
    authHttp.get<Result<AnalyticsViewShareStatus>>(`/v1/analytics/reports/${encodeURIComponent(reportKey)}/share`)
  );
}

export async function createAnalyticsReportShare(
  reportKey: string,
  opts?: { expiresDays?: number; maxImports?: number }
): Promise<AnalyticsViewShareStatus> {
  return unwrap(
    authHttp.post<Result<AnalyticsViewShareStatus>>(
      `/v1/analytics/reports/${encodeURIComponent(reportKey)}/share`,
      opts ?? {}
    )
  );
}

/** @deprecated 使用 createAnalyticsReportShare */
export async function fetchAnalyticsViewShare(viewId: number): Promise<AnalyticsViewShareStatus> {
  return unwrap(authHttp.get<Result<AnalyticsViewShareStatus>>(`/v1/analytics/views/${viewId}/share`));
}

/** @deprecated 使用 createAnalyticsReportShare */
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
  nameSuffix?: string
): Promise<AnalyticsViewShareImportResult> {
  const suffix = nameSuffix?.trim();
  const data = await unwrap(
    authHttp.post<Result<Record<string, unknown>>>("/v1/analytics/share/import", {
      code: code.trim(),
      ...(suffix ? { targetName: suffix, nameSuffix: suffix } : {}),
    })
  );
  const viewsRaw = data.views as unknown;
  const views = normalizeImportedViews(viewsRaw, data.view);
  if (views.length === 0) {
    throw new Error("导入响应缺少配置数据");
  }
  return {
    views,
    view: views[0],
    viewCount: Number(data.viewCount ?? views.length),
    importedAuditLogs: Number(data.importedAuditLogs ?? 0),
    importedInsights: Number(data.importedInsights ?? 0),
    message: String(data.message ?? "导入成功"),
  };
}

export async function revokeAnalyticsViewShare(shareId: number): Promise<void> {
  await unwrap(authHttp.post<Result<null>>(`/v1/analytics/share/${shareId}/revoke`));
}

export async function fetchStudentActivityGroups(keyword?: string): Promise<StudentActivityGroup[]> {
  const data = await unwrap(
    authHttp.get<Result<{ groups: StudentActivityGroup[] }>>("/v1/analytics/student-activity/groups", {
      params: keyword ? { keyword } : {},
    })
  );
  return data.groups ?? [];
}

export async function fetchStudentActivityMembers(params: {
  groupName: string;
  startTime: string;
  endTime: string;
  sortBy?: string;
  order?: string;
  page?: number;
  size?: number;
}): Promise<StudentActivityResult> {
  return unwrap(
    authHttp.get<Result<StudentActivityResult>>("/v1/analytics/student-activity/members", { params })
  );
}

export async function fetchStudentActivityHeatmap(params: {
  groupName: string;
  startTime: string;
  endTime: string;
}): Promise<HeatmapCell[]> {
  return unwrap(
    authHttp.get<Result<HeatmapCell[]>>("/v1/analytics/student-activity/heatmap", { params })
  );
}

export async function fetchStudentActivityDailyTrend(params: {
  groupName: string;
  startTime: string;
  endTime: string;
}): Promise<DailyTrendPoint[]> {
  return unwrap(
    authHttp.get<Result<DailyTrendPoint[]>>("/v1/analytics/student-activity/daily-trend", { params })
  );
}
