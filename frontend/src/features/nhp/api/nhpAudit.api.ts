/**
 * NHP 审计 API 层。
 *
 * 对接后端契约（06 §100 / 05 §98）：
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
  fieldName?: string | null;
  fieldId?: number;
  /** INSERT / UPDATE / DELETE */
  changeType: string;
  beforeValue?: string | null;
  afterValue?: string | null;
  operatorId?: string;
  /** 操作人展示名（UserDisplayNameService） */
  operatorName?: string;
  /** 展示名（后端已解析；兼容旧契约） */
  operator?: string;
  /** 变更原因（change_reason，如 录入/修正/校验触发/导入） */
  changeReason?: string;
  createdAt?: string;
  recordId?: number;
  formId?: number;
  formKey?: string;
  formTitle?: string;
  formType?: string;
  subjectId?: number;
  subjectCode?: string;
  subjectName?: string;
  subjectType?: string;
}

/** 字典变更审计（crf_dict_change_log 一行） */
export interface NhpDictChangeLogEntry {
  id: number;
  /** field / codelist / form */
  entity: string;
  entityId?: number;
  entityCode?: string;
  entityName?: string;
  /** CREATE / UPDATE / FREEZE / RETIRE */
  changeType: string;
  beforeJson?: string | null;
  afterJson?: string | null;
  operatorId?: string;
  /** 操作人展示名（UserDisplayNameService） */
  operatorName?: string;
  /** 展示名（后端已解析；兼容旧契约） */
  operator?: string;
  createdAt?: string;
}

export interface NhpAuditFormSummary {
  formId?: number;
  formKey?: string;
  formTitle?: string;
  count: number;
}

export interface NhpAuditEntitySummary {
  entity: string;
  label: string;
  count: number;
}

export interface NhpAuditPageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  formSummaries?: NhpAuditFormSummary[];
  entitySummaries?: NhpAuditEntitySummary[];
}

export interface NhpDataAuditQuery {
  formId?: number;
  formKey?: string;
  keyword?: string;
  changeType?: string;
  operatorId?: string;
  subjectType?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

export interface NhpDictAuditQuery {
  entityType?: string;
  keyword?: string;
  changeType?: string;
  operatorId?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

const emptyPage = <T>(): NhpAuditPageResult<T> => ({
  items: [],
  total: 0,
  page: 1,
  pageSize: 50,
});

export async function fetchNhpDataAuditLog(
  params?: NhpDataAuditQuery,
): Promise<NhpAuditPageResult<NhpDataAuditEntry>> {
  return authHttp
    .get<Result<NhpAuditPageResult<NhpDataAuditEntry>>>("/nhp/data-audit-log", { params })
    .then(({ data }) => data.data ?? emptyPage());
}

export async function fetchNhpDictChangeLog(
  params?: NhpDictAuditQuery,
): Promise<NhpAuditPageResult<NhpDictChangeLogEntry>> {
  return authHttp
    .get<Result<NhpAuditPageResult<NhpDictChangeLogEntry>>>("/nhp/dict-change-log", { params })
    .then(({ data }) => data.data ?? emptyPage());
}
