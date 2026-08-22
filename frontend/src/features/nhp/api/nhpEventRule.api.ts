/**
 * NHP 事件规则 API 层。
 *
 * 对接后端契约（后端未实现，前端按 22 §6.3 先行定义）：
 * - crf_event_rule：源事件类型 + 触发时机 → 下游动作
 * 经 authHttp（baseURL `/api`）解包 Result<T>。
 */
import { authHttp } from "@/api/core/authHttp";

interface Result<T> {
  code: number;
  success: boolean;
  message?: string;
  data: T;
}

/** 触发时机（22 §6.3） */
export const TRIGGER_ON_OPTIONS = [
  { value: "CREATED", label: "入库（CREATED）" },
  { value: "STATUS_CHANGED", label: "状态变更（STATUS_CHANGED）" },
] as const;

/** 动作四类（22 §6.3） */
export const ACTION_OPTIONS = [
  { value: "EXPAND_SCHEDULE", label: "展开 schedule" },
  { value: "GENERATE_TODO", label: "生成待办" },
  { value: "CREATE_EVENT", label: "创建事件" },
  { value: "ADVANCE_STATE", label: "推进状态机" },
] as const;

/** 事件规则（crf_event_rule 一行） */
export interface NhpEventRule {
  id: number;
  /** 源事件类型 = 原子 code，如 SMP/MED/TX/AE/XM */
  sourceAtom: string;
  /** CREATED 入库 / STATUS_CHANGED 状态变更 */
  triggerOn: string;
  /** STATUS_CHANGED 的目标状态，如 pairing_decision=APPROVED */
  triggerCond?: string | null;
  /** EXPAND_SCHEDULE / GENERATE_TODO / CREATE_EVENT / ADVANCE_STATE */
  action: string;
  /** JSON 参数（schedule_anchor / todo_type / event_atom / target_state） */
  actionSpec?: string | null;
  sortOrder?: number;
  active?: boolean;
}

export async function fetchNhpEventRules(): Promise<NhpEventRule[]> {
  return authHttp.get<Result<NhpEventRule[]>>("/nhp/event-rules").then(({ data }) => data.data);
}

export async function updateNhpEventRule(id: number, patch: Partial<NhpEventRule>): Promise<NhpEventRule> {
  return authHttp.put<Result<NhpEventRule>>(`/nhp/event-rules/${id}`, patch).then(({ data }) => data.data);
}
