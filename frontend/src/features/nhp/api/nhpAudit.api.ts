/**
 * NHP 审计留痕 API 层。
 *
 * 对接后端契约（后端未实现，前端按 06 §100 / 05 §98 先行定义）：
 * - crf_data_audit_log：数据变更审计（每笔值变更 before/after + change_reason）
 * - crf_dict_change_log：字典变更审计（entity + change_type + before/after JSON）
 * 经 authHttp（baseURL `/api`）解包 Result<T>。
 */
import { authHttp } from "@/api/core/authHttp";

interface Result<T> {
  code: number;
  success: boolean;
  message?: string;
  data: T;
}

/** 数据变更审计（crf_data_audit_log 一行） */
export interface NhpDataAuditEntry {
  id: number;
  fieldCode: string;
  /** INSERT / UPDATE / DELETE */
  changeType: string;
  beforeValue?: string | null;
  afterValue?: string | null;
  operator?: string;
  /** 变更原因（change_reason，如 录入/修正/校验触发/导入） */
  changeReason?: string;
  createdAt?: string;
}

/** 字典变更审计（crf_dict_change_log 一行） */
export interface NhpDictChangeLogEntry {
  id: number;
  /** field / codelist / form */
  entity: string;
  entityId?: number;
  /** CREATE / UPDATE / FREEZE / RETIRE */
  changeType: string;
  beforeJson?: string | null;
  afterJson?: string | null;
  operator?: string;
  createdAt?: string;
}

export async function fetchNhpDataAuditLog(): Promise<NhpDataAuditEntry[]> {
  return authHttp.get<Result<NhpDataAuditEntry[]>>("/nhp/data-audit-log").then(({ data }) => data.data);
}

export async function fetchNhpDictChangeLog(): Promise<NhpDictChangeLogEntry[]> {
  return authHttp.get<Result<NhpDictChangeLogEntry[]>>("/nhp/dict-change-log").then(({ data }) => data.data);
}
