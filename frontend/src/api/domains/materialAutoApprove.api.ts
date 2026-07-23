import { authHttp } from "@/api/core/authHttp";

type ApiResult<T> = { code?: number; message?: string; success?: boolean; data?: T };

export type MaterialTrustRule = {
  id?: number;
  subjectUserId: string;
  subjectDisplayName?: string;
  itemId: number;
  enabled?: boolean;
  triggerMode?: "ON_SUBMIT" | "SCHEDULED";
  scheduleCron?: string | null;
  note?: string | null;
  itemName?: string;
};

export type MaterialBatchRule = {
  id?: number;
  name: string;
  itemIds: number[];
  enabled?: boolean;
  scheduleCron?: string;
  maxPerRun?: number;
  onlyIfReviewerMatch?: boolean;
};

export type MaterialAutoApproveCandidate = {
  subjectUserId: string;
  subjectDisplayName?: string;
  itemId: number;
  itemName?: string;
  pendingCount?: number;
  approvedCount?: number;
  alreadyTrusted?: boolean;
};

export type MaterialAutoApproveSuggestion = {
  subjectUserId: string;
  subjectDisplayName?: string;
  itemId: number;
  itemName?: string;
  approvedCount: number;
  lastApprovedAt?: string;
  alreadyTrusted?: boolean;
};

function unwrap<T>(body: ApiResult<T> | undefined, fallbackMsg: string): T {
  if (!body?.success) throw new Error(body?.message || fallbackMsg);
  return body.data as T;
}

export async function fetchMaterialTrustRules(): Promise<MaterialTrustRule[]> {
  const res = await authHttp.get<ApiResult<Record<string, unknown>[]>>("/material/admin/auto-approve/trust-rules");
  const rows = unwrap(res.data, "加载按人规则失败") ?? [];
  return rows.map(normalizeTrustRule);
}

export async function saveMaterialTrustRule(body: Partial<MaterialTrustRule>): Promise<{ id: number }> {
  const res = await authHttp.put<ApiResult<{ id: number }>>("/material/admin/auto-approve/trust-rules", body);
  return unwrap(res.data, "保存按人规则失败");
}

export async function deleteMaterialTrustRule(id: number): Promise<void> {
  const res = await authHttp.delete<ApiResult<null>>(`/material/admin/auto-approve/trust-rules/${id}`);
  unwrap(res.data, "删除按人规则失败");
}

export async function fetchMaterialBatchRules(): Promise<MaterialBatchRule[]> {
  const res = await authHttp.get<ApiResult<Record<string, unknown>[]>>("/material/admin/auto-approve/batch-rules");
  const rows = unwrap(res.data, "加载批量规则失败") ?? [];
  return rows.map(normalizeBatchRule);
}

export async function saveMaterialBatchRule(body: Partial<MaterialBatchRule>): Promise<{ id: number }> {
  const res = await authHttp.put<ApiResult<{ id: number }>>("/material/admin/auto-approve/batch-rules", {
    ...body,
    itemIds: body.itemIds ?? [],
  });
  return unwrap(res.data, "保存批量规则失败");
}

export async function deleteMaterialBatchRule(id: number): Promise<void> {
  const res = await authHttp.delete<ApiResult<null>>(`/material/admin/auto-approve/batch-rules/${id}`);
  unwrap(res.data, "删除批量规则失败");
}

export async function fetchMaterialAutoApproveCandidates(): Promise<MaterialAutoApproveCandidate[]> {
  const res = await authHttp.get<ApiResult<MaterialAutoApproveCandidate[]>>("/material/admin/auto-approve/candidates");
  return unwrap(res.data, "加载申请人失败") ?? [];
}

export async function fetchMaterialAutoApproveSuggestions(): Promise<MaterialAutoApproveSuggestion[]> {
  const res = await authHttp.get<ApiResult<MaterialAutoApproveSuggestion[]>>("/material/admin/auto-approve/suggestions");
  return unwrap(res.data, "加载建议失败") ?? [];
}

export async function runMaterialAutoApproveNow(): Promise<{ approved?: number; skipped?: number; failed?: number }> {
  const res = await authHttp.post<ApiResult<{ approved?: number; skipped?: number; failed?: number }>>(
    "/material/admin/auto-approve/run-now",
    {}
  );
  return unwrap(res.data, "执行失败");
}

function normalizeTrustRule(row: Record<string, unknown>): MaterialTrustRule {
  return {
    id: num(row.id),
    subjectUserId: str(row.subject_user_id ?? row.subjectUserId),
    subjectDisplayName: str(row.subjectDisplayName ?? row.subject_display_name) || undefined,
    itemId: num(row.item_id ?? row.itemId),
    enabled: row.enabled === undefined ? true : Number(row.enabled) !== 0,
    triggerMode: (str(row.trigger_mode ?? row.triggerMode) || "ON_SUBMIT") as MaterialTrustRule["triggerMode"],
    scheduleCron: str(row.schedule_cron ?? row.scheduleCron) || null,
    note: str(row.note) || null,
    itemName: str(row.item_name ?? row.itemName),
  };
}

function normalizeBatchRule(row: Record<string, unknown>): MaterialBatchRule {
  return {
    id: num(row.id),
    name: str(row.name) || "批量自动审批",
    itemIds: parseJsonIds(row.item_ids ?? row.itemIds),
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
      return parseJsonIds(JSON.parse(raw));
    } catch {
      return [];
    }
  }
  return [];
}
