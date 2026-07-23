import { adminHttp } from "@/api/core/adminHttp";
import type { ApiResponse } from "@/api/types/common";

export type AccessAuditSourceConfig = {
  id?: number;
  name: string;
  enabled?: number;
  swingTaskId?: number | null;
  channelCode?: string;
  personCode?: string;
  personName?: string;
  openType?: number | null;
  requireMapping?: number;
  openSuccessOnly?: number;
  autoSyncEnabled?: number;
  lastSyncAt?: string;
  lastSyncCount?: number;
  lastPreviewSwingCount?: number;
  lastPreviewRawCount?: number;
};

export type AccessSwingRecordViewRow = {
  id?: number;
  taskId?: number;
  pullTaskType?: string;
  recordId?: string;
  cardNumber?: string;
  channelCode?: string;
  channelName?: string;
  personCode?: string;
  personName?: string;
  departmentId?: string;
  departmentName?: string;
  openType?: number;
  openTypeLabel?: string;
  openResult?: number;
  openResultLabel?: string;
  mappingHitLabel?: string;
  enterOrExit?: number;
  enterOrExitLabel?: string;
  audienceType?: string;
  audienceLabel?: string;
  swingTime?: string;
  mappingUserId?: string;
  mappingHit?: number;
  tags?: string[];
};

export type AccessAuditRawRow = {
  id: number;
  source?: string;
  recordId?: string;
  swingTaskId?: number;
  swingTime?: string;
  channelCode?: string;
  channelName?: string;
  personName?: string;
  mappingUserId?: string;
  openResult?: number;
};

export type AuditFilterQuery = {
  configId?: number;
  taskId?: number;
  channelCode?: string;
  channelName?: string;
  personCode?: string;
  personName?: string;
  cardNumber?: string;
  departmentName?: string;
  openType?: number;
  /** 1=进入 2=离开 */
  enterOrExit?: number;
  /** 1=成功 0=失败 */
  openResult?: number;
  audienceType?: string;
  /** 1=已映射 0=未映射 */
  mappingHit?: number;
  startTime?: string;
  endTime?: string;
  requireMapping?: boolean;
  openSuccessOnly?: boolean;
  page?: number;
  pageSize?: number;
};

async function unwrap<T>(res: { data: ApiResponse<T> }): Promise<T> {
  const body = res.data;
  if (!body?.success) {
    throw new Error(body?.message || "请求失败");
  }
  return body.data as T;
}

export async function listAccessAuditConfigs(): Promise<AccessAuditSourceConfig[]> {
  const res = await adminHttp.get<ApiResponse<AccessAuditSourceConfig[]>>("/twin/access-audit/configs");
  return unwrap(res);
}

export async function saveAccessAuditConfig(body: AccessAuditSourceConfig): Promise<{ id: number }> {
  const res = await adminHttp.post<ApiResponse<{ id: number }>>("/twin/access-audit/configs", body);
  return unwrap(res);
}

export async function deleteAccessAuditConfig(id: number): Promise<void> {
  const res = await adminHttp.delete<ApiResponse<null>>(`/twin/access-audit/configs/${id}`);
  await unwrap(res);
}

export async function previewSwingForAudit(
  params: AuditFilterQuery
): Promise<{ data: AccessSwingRecordViewRow[]; total: number }> {
  const res = await adminHttp.get<ApiResponse<{ data: AccessSwingRecordViewRow[]; total: number }>>(
    "/twin/access-audit/preview/swing",
    { params }
  );
  return unwrap(res);
}

export async function enrichSwingRecords(
  params: Omit<AuditFilterQuery, "page" | "pageSize">
): Promise<{ scanned: number; updated: number; batches: number; truncated: boolean }> {
  const res = await adminHttp.post<
    ApiResponse<{ scanned: number; updated: number; batches: number; truncated: boolean }>
  >("/twin/access-audit/records/enrich", null, { params });
  return unwrap(res);
}

export async function recalculateSwingRecordAudience(
  params: Omit<AuditFilterQuery, "page" | "pageSize">
): Promise<{
  scanned: number;
  updated: number;
  studentCount: number;
  staffCount: number;
  batches: number;
  truncated: boolean;
  rule?: string;
}> {
  const res = await adminHttp.post<
    ApiResponse<{
      scanned: number;
      updated: number;
      studentCount: number;
      staffCount: number;
      batches: number;
      truncated: boolean;
      rule?: string;
    }>
  >("/twin/access-audit/records/recalculate-audience", null, { params, timeout: 120_000 });
  return unwrap(res);
}

export async function fetchSwingRecordQualitySummary(
  params: Omit<AuditFilterQuery, "page" | "pageSize" | "enterOrExit">
): Promise<{ total: number; missingEnterExit: number }> {
  const res = await adminHttp.get<ApiResponse<{ total: number; missingEnterExit: number }>>(
    "/twin/access-audit/quality-summary",
    { params }
  );
  return unwrap(res);
}

export async function previewRawForAudit(params: AuditFilterQuery): Promise<{
  data: AccessAuditRawRow[];
  total: number;
  stats?: { total?: number; mapped?: number; unmapped?: number };
}> {
  const res = await adminHttp.get<
    ApiResponse<{
      data: AccessAuditRawRow[];
      total: number;
      stats?: { total?: number; mapped?: number; unmapped?: number };
    }>
  >("/twin/access-audit/preview/raw", { params });
  return unwrap(res);
}

export async function syncAuditRawLibrary(
  configId: number,
  startTime: string,
  endTime: string
): Promise<{ ingested: number; scanned: number; swingTotalInWindow: number; rawTotalInWindow: number }> {
  const res = await adminHttp.post<
    ApiResponse<{ ingested: number; scanned: number; swingTotalInWindow: number; rawTotalInWindow: number }>
  >(`/twin/access-audit/configs/${configId}/sync`, null, { params: { startTime, endTime } });
  return unwrap(res);
}
