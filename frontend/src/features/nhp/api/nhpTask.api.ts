/**
 * NHP 审核中心 / 通知中心 API 层。
 *
 * 对接后端契约（后端未实现，前端按 24 §2 / 27 §7 先行定义）：
 * - 审核中心：GET /nhp/query/listMyTasks（按 role/dag 过滤的待我处理队列）
 * - 通知中心：GET /nhp/notifications（crf_notification，28 §七 建议 V39）
 * 经 authHttp（baseURL `/api`）解包 Result<T>。
 */
import { authHttp } from "@/api/core/authHttp";

interface Result<T> {
  code: number;
  success: boolean;
  message?: string;
  data: T;
}

/** 审核中心任务（待我处理队列） */
export interface NhpMyTask {
  id: number;
  /** FIELD_REVIEW 字段校对 / RECORD_REVIEW 记录复核 / SIGN 签署 / QUESTION 待确认 */
  tab: string;
  /** 字段码 / 记录 # / 域码 */
  code: string;
  title: string;
  sub?: string;
  /** 校对 / 复核 / 签署 / 处理 */
  action: string;
}

/** 通知（消息流，按类型分组） */
export interface NhpNotification {
  id: number;
  /** REVIEW 审核 / QUALITY 质控 / TODO 待办 / VERSION 版本 */
  group: string;
  text: string;
  time?: string;
  read: boolean;
}

export const TASK_TAB_OPTIONS = [
  { value: "FIELD_REVIEW", label: "字段校对" },
  { value: "RECORD_REVIEW", label: "记录复核" },
  { value: "SIGN", label: "签署" },
  { value: "QUESTION", label: "待确认" },
] as const;

export async function fetchNhpMyTasks(): Promise<NhpMyTask[]> {
  return authHttp.get<Result<NhpMyTask[]>>("/nhp/query/listMyTasks").then(({ data }) => data.data);
}

export async function fetchNhpNotifications(): Promise<NhpNotification[]> {
  return authHttp.get<Result<NhpNotification[]>>("/nhp/notifications").then(({ data }) => data.data);
}
