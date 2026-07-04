import { authHttp } from "@/api/core/authHttp";

export interface ExpSummary {
  totalExp: number;
  todayExp: number;
  activeUsers: number;
  todayActiveUsers: number;
  topEarners: Array<{
    userId: string;
    userName: string;
    totalExp: number;
    todayExp: number;
    level?: number;
  }>;
  anomalyCount?: Array<{ anomaly_types: string; cnt: number }>;
  pendingReviewCount?: number;
}

export interface ExpRecord {
  id: number;
  userId: string;
  userName: string;
  expAmount: number;
  sourceType: string;
  accessType: number;
  roomId: string;
  roomName: string;
  createTime: string;
  // 新增：异常标记与审核
  anomalyFlag: number;
  anomalyTypes: string | null;
  reviewStatus: number;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  // 新增：溯源字段
  feedSource: string | null;
  sessionDurationMinutes: number | null;
}

export interface ExpRecordsPage {
  list: ExpRecord[];
  total: number;
  pageNum: number;
  pageSize: number;
}

export interface ExpRecordsParams {
  pageNum?: number;
  pageSize?: number;
  userId?: string;
  sourceType?: string;
  startDate?: string;
  endDate?: string;
  anomalyFlag?: number;
  reviewStatus?: number;
  feedSource?: string;
}

export async function fetchExpSummary(): Promise<ExpSummary> {
  const res = await authHttp.get("/v1/twin/rpg/exp/summary");
  return (res.data?.data ?? { totalExp: 0, todayExp: 0, activeUsers: 0, todayActiveUsers: 0, topEarners: [] }) as ExpSummary;
}

export async function fetchExpRecords(params: ExpRecordsParams): Promise<ExpRecordsPage> {
  const res = await authHttp.get("/v1/twin/rpg/exp/records", { params });
  return (res.data?.data ?? { list: [], total: 0, pageNum: 1, pageSize: 20 }) as ExpRecordsPage;
}

// ── 审核操作 ──

export async function approveExpRecord(id: number, note?: string): Promise<void> {
  await authHttp.post(`/v1/twin/rpg/review/${id}/approve`, note ? { note } : {});
}

export async function rejectExpRecord(id: number, note?: string): Promise<void> {
  await authHttp.post(`/v1/twin/rpg/review/${id}/reject`, note ? { note } : {});
}

export async function batchApproveExpRecords(ids: number[]): Promise<void> {
  await authHttp.post("/v1/twin/rpg/review/batch-approve", { ids });
}

export async function batchRejectExpRecords(ids: number[]): Promise<void> {
  await authHttp.post("/v1/twin/rpg/review/batch-reject", { ids });
}

export interface ExpReconcileResult {
  message?: string;
  datesProcessed?: number;
  totalRecordsCreated?: number;
  usersUpdated?: number;
  lastExpDateBefore?: string | null;
  processedDates?: string[];
}

/** 增量补漏：从已有经验流水最大业务日继续对账（不清空全表） */
export async function reconcileExpCatchUp(): Promise<ExpReconcileResult> {
  const res = await authHttp.post("/v1/twin/rpg/reconcile-catch-up");
  return (res.data?.data ?? res.data ?? {}) as ExpReconcileResult;
}

/** 全量重算：清空 twin_exp_record 后逐日重建（重量级） */
export async function recalculateAllExp(): Promise<ExpReconcileResult> {
  const res = await authHttp.get("/v1/twin/rpg/recalculate-all");
  return (res.data?.data ?? res.data ?? {}) as ExpReconcileResult;
}
