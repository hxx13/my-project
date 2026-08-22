/**
 * NHP 时间线工作台（采集侧三形态）读侧 API 层。
 *
 * 对接后端契约（后端未实现，前端按 22 §6.3/§6.4 先行定义）：
 * - crf_todo：今日待办（materialized，source=SCHEDULE/EVENT_RULE）
 * - 序列网格：listSeries（EAV 聚合，行=时点/列=指标）
 * 经 authHttp（baseURL `/api`）解包 Result<T>。
 */
import { authHttp } from "@/api/core/authHttp";

interface Result<T> {
  code: number;
  success: boolean;
  message?: string;
  data: T;
}

/** 待办（crf_todo 一行） */
export interface NhpTodo {
  id: number;
  subjectId?: number;
  transplantId?: number | null;
  /** 送检 / 谷浓度 / 采血 / 生命体征 / 给药 / 活检 … */
  todoType: string;
  /** SCHEDULE 调度展开 / EVENT_RULE 事件驱动 */
  source: string;
  sourceRef?: string;
  dueDate?: string;
  /** OPEN / DONE / CANCELLED（OVERDUE 查询时派生，不落库） */
  status: string;
  active?: boolean;
}

/** 序列指标列（行=时点/列=指标） */
export interface NhpSeriesIndicator {
  code: string;
  label: string;
  unit?: string;
}

/** 序列行（某时点/时间的一行测量值） */
export interface NhpSeriesRow {
  rowId: string;
  /** 时点或时间，如 TP04 / 08:00 */
  recordedAt?: string;
  recordedBy?: string;
  values: Record<string, string | number | null>;
}

/** 序列网格数据（含指标列定义 + 行） */
export interface NhpSeriesData {
  indicators: NhpSeriesIndicator[];
  rows: NhpSeriesRow[];
}

export async function fetchNhpTodoBySubject(subjectId: number): Promise<NhpTodo[]> {
  return authHttp
    .get<Result<NhpTodo[]>>("/nhp/query/listTodoBySubject", { params: { subjectId: String(subjectId) } })
    .then(({ data }) => data.data);
}

export async function fetchNhpSeries(opts: {
  subjectId: number;
  conceptCode?: string;
  from?: string;
  to?: string;
}): Promise<NhpSeriesData> {
  const params: Record<string, string> = { subjectId: String(opts.subjectId) };
  if (opts.conceptCode) params.conceptCode = opts.conceptCode;
  if (opts.from) params.from = opts.from;
  if (opts.to) params.to = opts.to;
  return authHttp.get<Result<NhpSeriesData>>("/nhp/query/listSeries", { params }).then(({ data }) => data.data);
}
