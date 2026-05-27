import { adminHttp } from "@/api/core/adminHttp";

export type TelemetryArchivePurgeConfig = {
  purgeEnabled: boolean;
  retentionDays: number;
  batchDeleteSize: number;
  optimizeAfterPurge: boolean;
  archiveWriteEnabled: boolean;
  lastPurgeAt?: string | null;
  lastPurgeDeletedRows?: number | null;
  lastPurgeDurationMs?: number | null;
  scheduleJobKey: string;
  scheduleJobName: string;
};

export type TelemetryArchiveStorageStats = {
  totalRows: number;
  tableSizeMb?: number | null;
  oldestSampleAt?: string | null;
  newestSampleAt?: string | null;
  rowsOlderThanRetention: number;
  effectiveRetentionDays: number;
  approximate?: boolean;
};

export type TelemetryArchivePurgeResult = {
  deletedRows: number;
  durationMs: number;
  optimized: boolean;
  cutoffBefore?: string;
  remainingRows: number;
  partial?: boolean;
  message?: string;
};

type ApiResult<T> = { success?: boolean; message?: string; data?: T };

export async function fetchTelemetryArchivePurgeConfig() {
  const res = await adminHttp.get<ApiResult<TelemetryArchivePurgeConfig>>("telemetry/archive/purge-config");
  const body = res.data;
  if (!body?.success || !body.data) throw new Error(body?.message || "加载清理配置失败");
  return body.data;
}

export async function saveTelemetryArchivePurgeConfig(cfg: TelemetryArchivePurgeConfig) {
  const res = await adminHttp.put<ApiResult<TelemetryArchivePurgeConfig>>("telemetry/archive/purge-config", cfg);
  const body = res.data;
  if (!body?.success || !body.data) throw new Error(body?.message || "保存失败");
  return body.data;
}

export async function fetchTelemetryArchiveStorageStats() {
  const res = await adminHttp.get<ApiResult<TelemetryArchiveStorageStats>>("telemetry/archive/storage-stats", {
    timeout: 120_000,
  });
  const body = res.data;
  if (!body?.success || !body.data) throw new Error(body?.message || "加载统计失败");
  return body.data;
}

export type TelemetryArchivePurgeProgress = {
  inProgress: boolean;
  status: "IDLE" | "RUNNING" | "COMPLETED" | "FAILED" | string;
  deletedThisSession: number;
  batchRounds: number;
  remainingRowsApprox: number;
  initialTargetRows: number;
  percentComplete: number;
  startedAt?: string | null;
  lastUpdatedAt?: string | null;
  message?: string | null;
  error?: string | null;
};

export type TelemetryArchivePurgeAccepted = {
  accepted: boolean;
  inProgress: boolean;
  message: string;
};

export async function fetchTelemetryArchivePurgeProgress() {
  const res = await adminHttp.get<ApiResult<TelemetryArchivePurgeProgress>>("telemetry/archive/purge-status", {
    timeout: 30_000,
  });
  const body = res.data;
  if (!body?.success || body.data == null) throw new Error(body?.message || "查询清理进度失败");
  return body.data;
}

export async function purgeTelemetryArchiveNow() {
  const res = await adminHttp.post<ApiResult<TelemetryArchivePurgeAccepted>>("telemetry/archive/purge-now", null, {
    timeout: 60_000,
  });
  const body = res.data;
  if (!body?.success || !body.data) throw new Error(body?.message || "启动清理失败");
  return body.data;
}
