import { authHttp } from "@/api/core/authHttp";

type ApiResult<T> = { code?: number; message?: string; success?: boolean; data?: T };

export type ScanDelayTrustRule = {
  id?: number;
  ownerUserId?: string;
  subjectUserId: string;
  subjectDisplayName?: string;
  optionId: number;
  roomId?: string | null;
  enabled?: boolean;
  triggerMode?: "ON_SUBMIT" | "SCHEDULED";
  scheduleCron?: string | null;
  note?: string | null;
  optionLabel?: string;
  optionRoomName?: string;
};

export type ScanDelayBatchRule = {
  id?: number;
  ownerUserId?: string;
  name: string;
  optionIds: number[];
  roomIds?: string[];
  enabled?: boolean;
  scheduleCron?: string;
  maxPerRun?: number;
  onlyIfReviewerMatch?: boolean;
};

export type ScanDelayAutoApproveCandidate = {
  subjectUserId: string;
  subjectDisplayName?: string;
  optionId: number;
  optionLabel?: string;
  roomId?: string | null;
  roomName?: string;
  pendingCount?: number;
  approvedCount?: number;
  alreadyTrusted?: boolean;
};

export type ScanDelayAutoApproveSuggestion = {
  subjectUserId: string;
  subjectDisplayName?: string;
  optionId: number;
  optionLabel?: string;
  roomId?: string;
  roomName?: string;
  approvedCount: number;
  rejectedCount?: number;
  lastApprovedAt?: string;
  alreadyTrusted?: boolean;
};

function unwrap<T>(body: ApiResult<T> | undefined, fallbackMsg: string): T {
  if (!body?.success) throw new Error(body?.message || fallbackMsg);
  return body.data as T;
}

export async function fetchScanDelayTrustRules(): Promise<ScanDelayTrustRule[]> {
  const res = await authHttp.get<ApiResult<Record<string, unknown>[]>>("/v1/twin/scan-delay/auto-approve/trust-rules");
  const rows = unwrap(res.data, "加载按人规则失败") ?? [];
  return rows.map(normalizeTrustRule);
}

export async function fetchScanDelayAutoApproveCandidates(): Promise<ScanDelayAutoApproveCandidate[]> {
  const res = await authHttp.get<ApiResult<ScanDelayAutoApproveCandidate[]>>(
    "/v1/twin/scan-delay/auto-approve/candidates"
  );
  return unwrap(res.data, "加载申请人失败") ?? [];
}

export async function saveScanDelayTrustRule(body: Partial<ScanDelayTrustRule>): Promise<{ id: number }> {
  const res = await authHttp.put<ApiResult<{ id: number }>>("/v1/twin/scan-delay/auto-approve/trust-rules", body);
  return unwrap(res.data, "保存按人规则失败");
}

export async function deleteScanDelayTrustRule(id: number): Promise<void> {
  const res = await authHttp.delete<ApiResult<null>>(`/v1/twin/scan-delay/auto-approve/trust-rules/${id}`);
  unwrap(res.data, "删除按人规则失败");
}

export async function fetchScanDelayBatchRules(): Promise<ScanDelayBatchRule[]> {
  const res = await authHttp.get<ApiResult<Record<string, unknown>[]>>("/v1/twin/scan-delay/auto-approve/batch-rules");
  const rows = unwrap(res.data, "加载批量规则失败") ?? [];
  return rows.map(normalizeBatchRule);
}

export async function saveScanDelayBatchRule(body: Partial<ScanDelayBatchRule>): Promise<{ id: number }> {
  const res = await authHttp.put<ApiResult<{ id: number }>>("/v1/twin/scan-delay/auto-approve/batch-rules", {
    ...body,
    optionIds: body.optionIds ?? [],
    roomIds: body.roomIds ?? [],
  });
  return unwrap(res.data, "保存批量规则失败");
}

export async function deleteScanDelayBatchRule(id: number): Promise<void> {
  const res = await authHttp.delete<ApiResult<null>>(`/v1/twin/scan-delay/auto-approve/batch-rules/${id}`);
  unwrap(res.data, "删除批量规则失败");
}

export async function fetchScanDelayAutoApproveSuggestions(): Promise<ScanDelayAutoApproveSuggestion[]> {
  const res = await authHttp.get<ApiResult<ScanDelayAutoApproveSuggestion[]>>(
    "/v1/twin/scan-delay/auto-approve/suggestions"
  );
  return unwrap(res.data, "加载建议失败") ?? [];
}

export async function runScanDelayAutoApproveNow(): Promise<{ approved?: number; skipped?: number; failed?: number }> {
  const res = await authHttp.post<ApiResult<{ approved?: number; skipped?: number; failed?: number }>>(
    "/v1/twin/scan-delay/auto-approve/run-now",
    {}
  );
  return unwrap(res.data, "执行失败");
}

function normalizeTrustRule(row: Record<string, unknown>): ScanDelayTrustRule {
  return {
    id: num(row.id),
    ownerUserId: str(row.owner_user_id ?? row.ownerUserId),
    subjectUserId: str(row.subject_user_id ?? row.subjectUserId),
    subjectDisplayName: str(row.subjectDisplayName ?? row.subject_display_name) || undefined,
    optionId: num(row.option_id ?? row.optionId),
    roomId: str(row.room_id ?? row.roomId) || null,
    enabled: row.enabled === undefined ? true : Number(row.enabled) !== 0,
    triggerMode: (str(row.trigger_mode ?? row.triggerMode) || "ON_SUBMIT") as ScanDelayTrustRule["triggerMode"],
    scheduleCron: str(row.schedule_cron ?? row.scheduleCron) || null,
    note: str(row.note) || null,
    optionLabel: str(row.option_label ?? row.optionLabel),
    optionRoomName: str(row.option_room_name ?? row.optionRoomName),
  };
}

function normalizeBatchRule(row: Record<string, unknown>): ScanDelayBatchRule {
  return {
    id: num(row.id),
    ownerUserId: str(row.owner_user_id ?? row.ownerUserId),
    name: str(row.name) || "批量自动审批",
    optionIds: parseJsonIds(row.option_ids ?? row.optionIds),
    roomIds: parseJsonStrings(row.room_ids ?? row.roomIds),
    enabled: row.enabled === undefined ? true : Number(row.enabled) !== 0,
    scheduleCron: str(row.schedule_cron ?? row.scheduleCron) || "0 0 9 * * *",
    maxPerRun: num(row.max_per_run ?? row.maxPerRun) || 20,
    onlyIfReviewerMatch: row.only_if_reviewer_match === undefined
      ? row.onlyIfReviewerMatch !== false
      : Number(row.only_if_reviewer_match) !== 0,
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

function parseJsonIds(raw: unknown): number[] {
  if (Array.isArray(raw)) return raw.map((x) => num(x)).filter((x) => x > 0);
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      return parseJsonIds(parsed);
    } catch {
      return [];
    }
  }
  return [];
}

function parseJsonStrings(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((x) => str(x)).filter(Boolean);
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      return parseJsonStrings(parsed);
    } catch {
      return [];
    }
  }
  return [];
}
