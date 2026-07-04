import { adminHttp } from "@/api/core/adminHttp";
import { authHttp } from "@/api/core/authHttp";
import type { TelemetryArchiveSeries, TelemetryArchiveSeriesPoint } from "@/api/telemetryApi";
import {
  isTelemetryInsightsDebug,
  telemetryInsightsDebugHeaders,
  tiDebug,
} from "@/features/telemetry-insights/telemetryInsightsDebug";

type ApiResult<T> = { success?: boolean; message?: string; data?: T };

export type TelemetryDisplayProfile = {
  code: string;
  label: string;
  configJson: string;
  updateTime?: string | null;
};

export type TelemetryChartGroupVariableMeta = {
  variableName: string;
  displayLabel?: string | null;
  floorCode?: string | null;
  metricKindCode?: string | null;
  bundleCode?: string | null;
  roomCanonical?: string | null;
};

export type TelemetryChartGroup = {
  id?: number;
  name: string;
  description?: string | null;
  variableNames: string[];
  variableMetadata?: TelemetryChartGroupVariableMeta[];
  layoutMode: "small_multiples" | "normalized_deviation" | string;
  source: "auto_suite" | "manual" | string;
  sortOrder?: number;
  createTime?: string | null;
  updateTime?: string | null;
};

export type TelemetryFleetMatrixCell = {
  roomCanonical: string;
  metricKindCode: string;
  variableName?: string | null;
  displayLabel?: string | null;
  floorCode?: string | null;
  bundleCode?: string | null;
  latestValue?: number | null;
  minValue?: number | null;
  maxValue?: number | null;
  avgValue?: number | null;
  sampleCount?: number | null;
  complianceRate?: number | null;
  complianceStatus?: "HIGH" | "LOW" | "OK" | "UNKNOWN" | string;
  maxDeviation?: number | null;
};

export type TelemetryFleetMatrix = {
  queriedFrom: string;
  queriedTo: string;
  metricKindCode?: string | null;
  floorFilter?: string | null;
  cells: TelemetryFleetMatrixCell[];
};

export type TelemetryPartitionSummary = {
  partitionKey: string;
  partitionLabel: string;
  metricKindCode?: string | null;
  medianPoints: TelemetryArchiveSeriesPoint[];
  p90Points: TelemetryArchiveSeriesPoint[];
  queriedFrom: string;
  queriedTo: string;
};

export type TelemetryArchiveSeriesBatch = {
  displayProfile: string;
  queriedFrom: string;
  queriedTo: string;
  series: TelemetryArchiveSeries[];
};

export type TelemetryViewSnapshot = {
  id: number;
  capturedAt: string;
  profileCode: string;
  timeRangeJson: string;
  chartGroupId?: number | null;
  payloadJson: string;
  createTime?: string | null;
};

export type TelemetryViewSnapshotPage = {
  total: number;
  page: number;
  size: number;
  items: TelemetryViewSnapshot[];
};

export type DisplayProfileMode = "STANDARD" | "PRESENTATION";

export async function fetchTelemetryFleetMatrix(params: {
  from: string;
  to: string;
  metricKindCode?: string;
  floorFilter?: string;
}): Promise<TelemetryFleetMatrix> {
  const debugHeaders = telemetryInsightsDebugHeaders();
  const res = await authHttp.get<ApiResult<TelemetryFleetMatrix>>("/v1/telemetry/archive/fleet-matrix", {
    params: {
      ...params,
      ...(isTelemetryInsightsDebug() ? { debug: "1" } : {}),
    },
    ...(debugHeaders ? { headers: debugHeaders } : {}),
  });
  const body = res.data;
  if (!body?.success || !body.data) throw new Error(body?.message || "加载热力矩阵失败");
  tiDebug("fleet-matrix response", { cells: body.data.cells?.length, metric: params.metricKindCode });
  return body.data;
}

export async function fetchTelemetryPartitionSummary(params: {
  from: string;
  to: string;
  metricKindCode?: string;
  floorFilter?: string;
  displayProfile?: DisplayProfileMode;
}): Promise<TelemetryPartitionSummary[]> {
  const res = await authHttp.get<ApiResult<TelemetryPartitionSummary[]>>(
    "/v1/telemetry/archive/partition-summary",
    { params }
  );
  const body = res.data;
  if (!body?.success || !body.data) throw new Error(body?.message || "加载分区汇总失败");
  tiDebug("partition-summary response", { partitions: body.data.length, profile: params.displayProfile });
  return body.data;
}

export async function fetchTelemetryArchiveSeriesBatch(params: {
  variableNames: string[];
  from?: string;
  to?: string;
  seriesScope?: "ROLLING" | "RANGE";
  windowHours?: number;
  maxPoints?: number;
  displayProfile?: DisplayProfileMode;
  fromRollup?: boolean;
}): Promise<TelemetryArchiveSeriesBatch> {
  const res = await authHttp.get<ApiResult<TelemetryArchiveSeriesBatch>>("/v1/telemetry/archive/series/batch", {
    params: {
      variableNames: params.variableNames.join(","),
      ...(params.from ? { from: params.from } : {}),
      ...(params.to ? { to: params.to } : {}),
      ...(params.seriesScope ? { seriesScope: params.seriesScope } : {}),
      ...(params.windowHours != null ? { windowHours: params.windowHours } : {}),
      ...(params.maxPoints != null ? { maxPoints: params.maxPoints } : {}),
      displayProfile: params.displayProfile ?? "STANDARD",
      ...(params.fromRollup != null ? { fromRollup: params.fromRollup } : {}),
    },
  });
  const body = res.data;
  if (!body?.success || !body.data) throw new Error(body?.message || "加载对比序列失败");
  return body.data;
}

export async function fetchTelemetryDisplayProfiles(): Promise<TelemetryDisplayProfile[]> {
  const res = await adminHttp.get<ApiResult<TelemetryDisplayProfile[]>>("telemetry/display-profiles");
  const body = res.data;
  if (!body?.success || !body.data) throw new Error(body?.message || "加载展示档失败");
  return body.data;
}

export async function saveTelemetryDisplayProfile(profile: TelemetryDisplayProfile): Promise<TelemetryDisplayProfile> {
  const res = await adminHttp.put<ApiResult<TelemetryDisplayProfile>>("telemetry/display-profiles", profile);
  const body = res.data;
  if (!body?.success || !body.data) throw new Error(body?.message || "保存展示档失败");
  return body.data;
}

export async function fetchTelemetryChartGroups(): Promise<TelemetryChartGroup[]> {
  const debugHeaders = telemetryInsightsDebugHeaders();
  const res = await adminHttp.get<ApiResult<TelemetryChartGroup[]>>("telemetry/chart-groups", {
    params: isTelemetryInsightsDebug() ? { debug: "1" } : undefined,
    ...(debugHeaders ? { headers: debugHeaders } : {}),
  });
  const body = res.data;
  if (!body?.success || !body.data) throw new Error(body?.message || "加载对比组失败");
  tiDebug("chart-groups response", { count: body.data.length });
  return body.data;
}

export async function createTelemetryChartGroup(group: TelemetryChartGroup): Promise<TelemetryChartGroup> {
  const res = await adminHttp.post<ApiResult<TelemetryChartGroup>>("telemetry/chart-groups", group);
  const body = res.data;
  if (!body?.success || !body.data) throw new Error(body?.message || "创建对比组失败");
  return body.data;
}

export async function updateTelemetryChartGroup(id: number, group: TelemetryChartGroup): Promise<TelemetryChartGroup> {
  const res = await adminHttp.put<ApiResult<TelemetryChartGroup>>(`telemetry/chart-groups/${id}`, group);
  const body = res.data;
  if (!body?.success || !body.data) throw new Error(body?.message || "更新对比组失败");
  return body.data;
}

export async function deleteTelemetryChartGroup(id: number): Promise<void> {
  const res = await adminHttp.delete<ApiResult<null>>(`telemetry/chart-groups/${id}`);
  const body = res.data;
  if (!body?.success) throw new Error(body?.message || "删除对比组失败");
}

export async function fetchTelemetryViewSnapshots(params: {
  page?: number;
  size?: number;
  from?: string;
  to?: string;
  profileCode?: string;
}): Promise<TelemetryViewSnapshotPage> {
  const res = await adminHttp.get<ApiResult<TelemetryViewSnapshotPage>>("telemetry/snapshots", { params });
  const body = res.data;
  if (!body?.success || !body.data) throw new Error(body?.message || "加载快照失败");
  return body.data;
}

export async function captureTelemetryViewSnapshot(params?: {
  profileCode?: string;
  from?: string;
  to?: string;
  chartGroupId?: number;
}): Promise<{ snapshotId?: number; capturedAt?: string }> {
  const res = await adminHttp.post<ApiResult<{ snapshotId?: number; capturedAt?: string }>>(
    "telemetry/snapshots/capture",
    null,
    { params: params ?? {} }
  );
  const body = res.data;
  if (!body?.success || !body.data) throw new Error(body?.message || "捕获快照失败");
  return body.data;
}
