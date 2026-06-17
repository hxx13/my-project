import { authHttp } from "@/api/core/authHttp";

type ApiResult<T> = { code?: number; message?: string; success?: boolean; data?: T };

/** 延迟选项库条目（与房间无关） */
export type ScanDelayOption = {
  id: number;
  optionLabel: string;
  displayStart?: string | null;
  displayEnd?: string | null;
  requireApproval: boolean;
  reviewerUserIds: string[];
  exemptMode: string;
  durationMinutes?: number | null;
  maxCount?: number | null;
  exemptRoomIds?: string[];
  enabled: boolean;
  sortOrder: number;
  /** 运行时按房间分组时附带 */
  roomId?: string;
};

export type ScanDelayRoomBinding = {
  roomId: string;
  optionIds: number[];
};

export type ScanDelayRequestResult = {
  status: string;
  requestId?: number;
  message?: string;
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
  roomId: string;
  roomName?: string;
  optionId: number;
  optionLabel?: string;
  status: string;
  createdAt?: string;
};

export async function fetchPendingScanDelayRequests(): Promise<ScanDelayPendingRequest[]> {
  const res = await authHttp.get<ApiResult<ScanDelayPendingRequest[]>>("/v1/twin/scan-delay/request/pending");
  if (!res.data?.success) throw new Error(res.data?.message || "加载待审核失败");
  return res.data.data ?? [];
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

export async function saveScanDelayRoomBinding(roomId: string, optionIds: number[]): Promise<ScanDelayRoomBinding> {
  const res = await authHttp.put<ApiResult<ScanDelayRoomBinding>>(
    `/v1/twin/scan-delay/room-bindings/${encodeURIComponent(roomId)}`,
    { optionIds }
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
