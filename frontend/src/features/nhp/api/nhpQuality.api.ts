/**
 * NHP 数据质量中心 API 层。
 *
 * 对接后端契约（后端未实现，前端按 22 §6.5 先行定义）：
 * - crf_quality_event：四类质量事件收口队列（异常值/时点偏差/TAT超时/CoC断裂）
 * 经 authHttp（baseURL `/api`）解包 Result<T>。
 */
import { authHttp } from "@/api/core/authHttp";

interface Result<T> {
  code: number;
  success: boolean;
  message?: string;
  data: T;
}

/** 四类质量事件（22 §6.5） */
export const QUALITY_EVENT_TYPE_OPTIONS = [
  { value: "OUTLIER", label: "异常值" },
  { value: "DEVIATION", label: "时点偏差" },
  { value: "TAT_OVERDUE", label: "TAT 超时" },
  { value: "COC_BROKEN", label: "CoC 断裂" },
] as const;

/** 事件状态（22 §6.5：OPEN/REVIEWED/CLOSED） */
export const QUALITY_EVENT_STATUS_OPTIONS = [
  { value: "OPEN", label: "待核查" },
  { value: "REVIEWED", label: "已复核" },
  { value: "CLOSED", label: "已闭环" },
] as const;

/** 质量事件（crf_quality_event 一行） */
export interface NhpQualityEvent {
  id: number;
  /** OUTLIER / DEVIATION / TAT_OVERDUE / COC_BROKEN */
  eventType: string;
  subjectId?: number | null;
  /** record / sample / test_order / coc */
  refType: string;
  refId: number;
  triggerRule: string;
  /** OPEN / REVIEWED / CLOSED */
  status: string;
  reviewer?: string | null;
  /** 复核人展示名（UserDisplayNameService） */
  reviewerName?: string | null;
  createdAt?: string;
}

/** 质控月报五 KPI（NhpQualityService.monthlyReport 聚合） */
export interface NhpQualityReport {
  /** 双人复核完成率 */
  doubleEntryRate?: number;
  /** 异常值复测闭环 */
  outlierClosedRate?: number;
  /** TAT 达标率 */
  tatOnTimeRate?: number;
  /** 时点偏差率 */
  deviationRate?: number;
  /** CoC 未闭环数 */
  cocOpenCount?: number;
}

export function qualityEventTypeLabel(v: string): string {
  return QUALITY_EVENT_TYPE_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

export function qualityEventStatusLabel(v: string): string {
  return QUALITY_EVENT_STATUS_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

export async function fetchNhpQualityEvents(): Promise<NhpQualityEvent[]> {
  return authHttp.get<Result<NhpQualityEvent[]>>("/nhp/quality/events").then(({ data }) => data.data);
}

export async function fetchNhpQualityReport(): Promise<NhpQualityReport> {
  return authHttp.get<Result<NhpQualityReport>>("/nhp/quality/monthly-report").then(({ data }) => data.data);
}
