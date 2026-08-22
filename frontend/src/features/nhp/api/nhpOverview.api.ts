/**
 * NHP 研究总览驾驶舱 API 层。
 *
 * 对接后端契约（后端未实现，前端按 24 §2 / 27 §7 先行定义）：
 * - GET /nhp/overview：单屏聚合（KPI + 审核进度 + 通知 + 待办 + 病例 + 版本 + 动态）
 * 经 authHttp（baseURL `/api`）解包 Result<T>。
 */
import { authHttp } from "@/api/core/authHttp";
import type { NhpTodo } from "./nhpWorkbench.api";
import type { NhpSubjectCard } from "./nhpSubjectBoard.api";
import type { NhpQualityEvent } from "./nhpQuality.api";

interface Result<T> {
  code: number;
  success: boolean;
  message?: string;
  data: T;
}

export interface NhpOverviewKpi {
  caseCount: number;
  followUpCount: number;
  todoCount: number;
  qualityEventCount: number;
  /** 字段校对进度 0-100 */
  fieldReviewProgress: number;
  pendingSignCount: number;
  pendingReviewCount: number;
  dictVersion: string;
}

export interface NhpOverview {
  kpi: NhpOverviewKpi;
  /** 各域校对进度条 */
  reviewProgress: { name: string; done: number; total: number }[];
  /** 审核通知 */
  notifications: { id: number; text: string; sub?: string; action: string }[];
  qualityEvents: NhpQualityEvent[];
  todos: NhpTodo[];
  cases: NhpSubjectCard[];
  versions: { name: string; version: string; status: string; date?: string }[];
  activities: { time: string; text: string }[];
}

export async function fetchNhpOverview(): Promise<NhpOverview> {
  return authHttp.get<Result<NhpOverview>>("/nhp/overview").then(({ data }) => data.data);
}
