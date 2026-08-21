import { authHttp } from "@/api/core/authHttp";

type ApiResult<T> = { code?: number; message?: string; success?: boolean; data?: T };

/** 载体按钮（从菜单项库勾选分配二级菜单） */
export type ScanDelayCarrier = {
  id: number;
  buttonLabel: string;
  enabled: boolean;
  sortOrder: number;
  optionCount?: number;
  optionIds?: number[];
};

/** 延迟菜单项（独立配置，通过载体分配使用） */
export type ScanDelayOption = {
  id: number;
  /** 运行时扫码分组用，管理端保存无需填写 */
  carrierId?: number;
  optionLabel: string;
  /** 运行时/展示用，与所属载体同步 */
  buttonLabel?: string;
  displayStart?: string | null;
  displayEnd?: string | null;
  requireApproval: boolean;
  reviewerUserIds: string[];
  exemptMode: string;
  durationMinutes?: number | null;
  extendUntilTime?: string | null;
  maxCount?: number | null;
  exemptRoomIds?: string[];
  enabled: boolean;
  sortOrder: number;
  /** 运行时按房间分组时附带 */
  roomId?: string;
};

export type ScanDelayRoomBinding = {
  roomId: string;
  carrierIds: number[];
};

export type ScanDelayRequestResult = {
  status: string;
  requestId?: number;
  message?: string;
  optionLabel?: string;
  freezeExemptFlag?: number;
  freezeExemptExpireAt?: string | null;
};

export async function fetchScanDelayStatus(): Promise<{ enabled: boolean; buttonLabel: string }> {
  const res = await authHttp.get<ApiResult<{ enabled: boolean; buttonLabel?: string }>>("/v1/twin/scan-delay/status");
  if (!res.data?.success) throw new Error(res.data?.message || "加载状态失败");
  const data = res.data.data ?? { enabled: false };
  return { enabled: Boolean(data.enabled), buttonLabel: data.buttonLabel?.trim() || "延迟" };
}

export async function setScanDelayMasterSettings(payload: { enabled: boolean; buttonLabel?: string }): Promise<void> {
  const res = await authHttp.put<ApiResult<{ enabled: boolean; buttonLabel?: string }>>(
    "/v1/twin/scan-delay/master-enabled",
    payload
  );
  if (!res.data?.success) throw new Error(res.data?.message || "保存开关失败");
}

export type ScanDelayPendingRequest = {
  id: number;
  subjectUserId: string;
  subjectDisplayName?: string;
  subjectGroupName?: string;
  approvedCount?: number;
  referenceSeq?: number;
  roomId: string;
  roomName?: string;
  optionId: number;
  optionLabel?: string;
  status: string;
  createdAt?: string;
};

function normalizePendingRequest(row: Record<string, unknown>): ScanDelayPendingRequest {
  return {
    id: num(row.id),
    subjectUserId: str(row.subjectUserId ?? row.subject_user_id),
    subjectDisplayName: str(row.subjectDisplayName ?? row.subject_display_name) || undefined,
    subjectGroupName: str(row.subjectGroupName ?? row.subject_group_name) || undefined,
    approvedCount: num(row.approvedCount ?? row.approved_count),
    referenceSeq: num(row.referenceSeq ?? row.reference_seq),
    roomId: str(row.roomId ?? row.room_id),
    roomName: str(row.roomName ?? row.room_name) || undefined,
    optionId: num(row.optionId ?? row.option_id),
    optionLabel: str(row.optionLabel ?? row.option_label) || undefined,
    status: str(row.status) || "PENDING",
    createdAt: str(row.createdAt ?? row.created_at) || undefined,
  };
}

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function num(v: unknown): number {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function fetchPendingScanDelayRequests(): Promise<ScanDelayPendingRequest[]> {
  const res = await authHttp.get<ApiResult<Record<string, unknown>[]>>("/v1/twin/scan-delay/request/pending");
  if (!res.data?.success) throw new Error(res.data?.message || "加载待审核失败");
  return (res.data.data ?? []).map(normalizePendingRequest);
}

export type ScanDelayHistoryRequest = ScanDelayPendingRequest & {
  reviewedAt?: string;
  reviewedBy?: string;
  /** 处理人展示名（UserDisplayNameService） */
  reviewedByName?: string;
  rejectReason?: string;
};

export async function fetchScanDelayHistory(limit = 100): Promise<ScanDelayHistoryRequest[]> {
  const res = await authHttp.get<ApiResult<Record<string, unknown>[]>>("/v1/twin/scan-delay/request/history", {
    params: { limit },
  });
  if (!res.data?.success) throw new Error(res.data?.message || "加载历史记录失败");
  return (res.data.data ?? []).map((row) => ({
    ...normalizePendingRequest(row),
    reviewedAt: str(row.reviewedAt ?? row.reviewed_at) || undefined,
    reviewedBy: str(row.reviewedBy ?? row.reviewed_by) || undefined,
    reviewedByName: str(row.reviewedByName ?? row.reviewed_by_name) || undefined,
    rejectReason: str(row.rejectReason ?? row.reject_reason) || undefined,
  }));
}

export type MyActiveRequest = {
  id: number;
  status: string;
  optionId: number;
  optionLabel?: string;
  requireApproval?: boolean;
  createdAt?: string;
  expireAt?: string;
};

export async function fetchMyActiveDelayRequests(roomId: string, subjectUserId?: string): Promise<{
  requests: MyActiveRequest[];
  hasPending: boolean;
  hasApproved: boolean;
  rejectedOptionIds: number[];
}> {
  const params: Record<string, string> = { roomId };
  if (subjectUserId) params.subjectUserId = subjectUserId;
  const res = await authHttp.get<ApiResult<{
    requests: Record<string, unknown>[];
    hasPending: boolean;
    hasApproved: boolean;
    rejectedOptionIds: number[];
  }>>("/v1/twin/scan-delay/request/my-active", { params });
  if (!res.data?.success) throw new Error(res.data?.message || "查询状态失败");
  const data = res.data.data;
  return {
    requests: (data?.requests ?? []).map((r: Record<string, unknown>) => ({
      id: Number(r.id),
      status: String(r.status ?? ""),
      optionId: Number(r.optionId ?? 0),
      optionLabel: String(r.optionLabel ?? ""),
      requireApproval: Boolean(r.requireApproval),
      createdAt: String(r.createdAt ?? ""),
      expireAt: String(r.expireAt ?? ""),
    })),
    hasPending: Boolean(data?.hasPending),
    hasApproved: Boolean(data?.hasApproved),
    rejectedOptionIds: Array.isArray(data?.rejectedOptionIds) ? data.rejectedOptionIds.map(Number) : [],
  };
}

export async function fetchScanDelayCarriers(): Promise<ScanDelayCarrier[]> {
  const res = await authHttp.get<ApiResult<ScanDelayCarrier[]>>("/v1/twin/scan-delay/carriers");
  if (!res.data?.success) throw new Error(res.data?.message || "加载载体按钮失败");
  return res.data.data ?? [];
}

export async function saveScanDelayCarrier(body: Partial<ScanDelayCarrier>): Promise<ScanDelayCarrier> {
  const res = await authHttp.post<ApiResult<ScanDelayCarrier>>("/v1/twin/scan-delay/carriers", body);
  if (!res.data?.success || !res.data.data) throw new Error(res.data?.message || "保存载体按钮失败");
  return res.data.data;
}

export async function deleteScanDelayCarrier(id: number): Promise<void> {
  const res = await authHttp.delete<ApiResult<null>>(`/v1/twin/scan-delay/carriers/${id}`);
  if (!res.data?.success) throw new Error(res.data?.message || "删除载体按钮失败");
}

export async function fetchScanDelayOptions(): Promise<ScanDelayOption[]> {
  const res = await authHttp.get<ApiResult<ScanDelayOption[]>>("/v1/twin/scan-delay/options");
  if (!res.data?.success) throw new Error(res.data?.message || "加载延迟选项失败");
  return res.data.data ?? [];
}

export async function saveScanDelayOption(body: Partial<ScanDelayOption>): Promise<ScanDelayOption> {
  const res = await authHttp.post<ApiResult<ScanDelayOption>>("/v1/twin/scan-delay/options", body);
  if (!res.data?.success || !res.data.data) throw new Error(res.data?.message || "保存失败");
  return res.data.data;
}

export async function deleteScanDelayOption(id: number): Promise<void> {
  const res = await authHttp.delete<ApiResult<null>>(`/v1/twin/scan-delay/options/${id}`);
  if (!res.data?.success) throw new Error(res.data?.message || "删除失败");
}

export async function fetchScanDelayRoomBindings(): Promise<ScanDelayRoomBinding[]> {
  const res = await authHttp.get<ApiResult<ScanDelayRoomBinding[]>>("/v1/twin/scan-delay/room-bindings");
  if (!res.data?.success) throw new Error(res.data?.message || "加载房间搭配失败");
  return res.data.data ?? [];
}

export async function saveScanDelayRoomBinding(roomId: string, carrierIds: number[]): Promise<ScanDelayRoomBinding> {
  const res = await authHttp.put<ApiResult<ScanDelayRoomBinding>>(
    `/v1/twin/scan-delay/room-bindings/${encodeURIComponent(roomId)}`,
    { carrierIds }
  );
  if (!res.data?.success || !res.data.data) throw new Error(res.data?.message || "保存房间搭配失败");
  return res.data.data;
}

export async function submitScanDelayRequest(payload: {
  subjectUserId: string;
  roomId: string;
  optionId: number;
  reviewerUserId?: string;
}): Promise<ScanDelayRequestResult> {
  const res = await authHttp.post<ApiResult<ScanDelayRequestResult>>("/v1/twin/scan-delay/request", payload);
  if (!res.data?.success || !res.data.data) throw new Error(res.data?.message || "提交失败");
  return res.data.data;
}

export async function reviewScanDelayRequest(
  requestId: number,
  approve: boolean,
  rejectReason?: string
): Promise<ScanDelayRequestResult> {
  const res = await authHttp.post<ApiResult<ScanDelayRequestResult>>(
    `/v1/twin/scan-delay/request/${requestId}/review`,
    { approve, rejectReason }
  );
  if (!res.data?.success || !res.data.data) throw new Error(res.data?.message || "审核失败");
  return res.data.data;
}

export async function deleteScanDelayRequest(requestId: number): Promise<void> {
  const res = await authHttp.delete<ApiResult<null>>(`/v1/twin/scan-delay/request/${requestId}`);
  if (!res.data?.success) throw new Error(res.data?.message || "删除失败");
}
