/**
 * NHP 采集侧对象列表（病例墙）API 层。
 *
 * 对接后端契约（后端未实现，前端按 22 §6.5③ 先行定义）：
 * - crf_subject 加 lifecycle_stage + arm_code；卡片聚合当前时点/待办/预警
 * 经 authHttp（baseURL `/api`）解包 Result<T>。
 */
import { authHttp } from "@/api/core/authHttp";

interface Result<T> {
  code: number;
  success: boolean;
  message?: string;
  data: T;
}

/** 对象生命周期（22 §6.5③） */
export const LIFECYCLE_STAGE_OPTIONS = [
  { value: "SCREENING", label: "预筛中" },
  { value: "MATCHING", label: "配型中" },
  { value: "POST_TX", label: "移植后" },
  { value: "ENDPOINT", label: "终点" },
] as const;

/** 研究对象卡片（病例墙，聚合查询结果） */
export interface NhpSubjectCard {
  id: number;
  subjectCode: string;
  /** DONOR / RECIPIENT */
  subjectType: string;
  species?: string;
  sex?: string;
  /** SCREENING / MATCHING / POST_TX / ENDPOINT */
  lifecycleStage?: string;
  /** HEART / LIVER（27 §7 建议补，后端待定） */
  armCode?: string;
  status?: string;
  /** day0 锚点（tx_date） */
  txDate?: string;
  /** 当前时点，如 TP04 */
  currentTp?: string;
  /** 待办数 / 超时数 */
  todoCount?: number;
  overdueCount?: number;
}

export function lifecycleStageLabel(v?: string): string {
  return LIFECYCLE_STAGE_OPTIONS.find((o) => o.value === v)?.label ?? v ?? "—";
}

export async function fetchNhpSubjectBoard(armCode?: string): Promise<NhpSubjectCard[]> {
  const params: Record<string, string> = {};
  if (armCode) params.armCode = armCode;
  return authHttp.get<Result<NhpSubjectCard[]>>("/nhp/subjects/board", { params }).then(({ data }) => data.data);
}
