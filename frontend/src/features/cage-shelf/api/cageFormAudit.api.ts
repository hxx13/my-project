import { authHttp } from "@/api/core/authHttp";

interface Result<T> {
  code: number;
  success: boolean;
  message?: string;
  data: T;
}

export interface CageFormAuditEntry {
  id: number;
  category: "data" | "dict" | string;
  changeType: string;
  entity?: string | null;
  entityId?: number | null;
  entityCode?: string | null;
  entityName?: string | null;
  targetType?: string | null;
  targetId?: number | null;
  targetLabel?: string | null;
  /** 笼位位置映射「校区/房间/笼架 (x,y)」，后端查不到时为 null */
  cageLabel?: string | null;
  fieldCode?: string | null;
  fieldName?: string | null;
  beforeValue?: string | null;
  afterValue?: string | null;
  beforeJson?: string | null;
  afterJson?: string | null;
  operatorId?: string;
  operatorName?: string;
  operator?: string;
  createdAt?: string;
}

export interface CageFormAuditEntitySummary {
  entity: string;
  label: string;
  count: number;
}

export interface CageFormAuditPageResult {
  items: CageFormAuditEntry[];
  total: number;
  page: number;
  pageSize: number;
  entitySummaries?: CageFormAuditEntitySummary[];
}

export interface CageFormAuditQuery {
  category?: "data" | "dict" | string;
  keyword?: string;
  changeType?: string;
  entity?: string;
  operatorId?: string;
  /** 按人员：取该人员占用过的笼位的全部留痕（后端由占用事件日志解析笼位集合） */
  personId?: number;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

export interface CageFormVersionInfo {
  formKey: string;
  versionNo: number;
  fieldCount: number;
  publishedAt?: string | null;
  publishedBy?: string | null;
  versions?: {
    versionNo: number;
    fieldCount: number;
    publishedAt?: string | null;
    publishedBy?: string | null;
  }[];
}

const emptyPage = (): CageFormAuditPageResult => ({
  items: [],
  total: 0,
  page: 1,
  pageSize: 50,
});

export async function fetchCageFormAuditLog(
  params?: CageFormAuditQuery,
): Promise<CageFormAuditPageResult> {
  const res = await authHttp.get<Result<CageFormAuditPageResult>>("/admin/cage-form/audit", { params });
  if (!res.data?.success) throw new Error(res.data?.message || "加载审计失败");
  return res.data.data ?? emptyPage();
}

export async function fetchCageFormLatestVersion(formKey = "cage_detail"): Promise<CageFormVersionInfo> {
  const res = await authHttp.get<Result<CageFormVersionInfo>>("/admin/cage-form/versions", {
    params: { formKey },
  });
  if (!res.data?.success) throw new Error(res.data?.message || "加载版本失败");
  return (
    res.data.data ?? {
      formKey,
      versionNo: 0,
      fieldCount: 0,
      publishedAt: null,
      publishedBy: null,
      versions: [],
    }
  );
}

/** @alias fetchCageFormLatestVersion */
export const fetchCageFormVersion = fetchCageFormLatestVersion;

// ── 按「操作」聚合的留痕（同笼位 + 同类型 + 同一秒 = 一次操作）──

export interface CageAuditOperationChange {
  canonical?: string | null;
  label?: string | null;
  before?: string | null;
  after?: string | null;
}

export interface CageAuditOperation {
  targetId?: number | null;
  /** 笼位位置映射「校区/房间/笼架 A-10」 */
  cageLabel?: string | null;
  changeType: string;
  createdAt?: string;
  /** 本次操作涉及的字段数（= changes.length） */
  fieldCount: number;
  operator?: string | null;
  changes: CageAuditOperationChange[];
}

export interface CageAuditOperationPage {
  items: CageAuditOperation[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CageAuditOperationQuery {
  category?: string;
  changeType?: string;
  operatorId?: string;
  /** 按人员：取该人员占用过的笼位的全部留痕 */
  personId?: number;
  /** 来源分层：不传=全部 / manual=仅人工操作 / system=仅系统同步 */
  operatorKind?: "manual" | "system";
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

export async function fetchCageAuditOperations(
  params?: CageAuditOperationQuery,
): Promise<CageAuditOperationPage> {
  const res = await authHttp.get<Result<CageAuditOperationPage>>("/admin/cage-form/audit/operations", { params });
  if (!res.data?.success) throw new Error(res.data?.message || "加载留痕失败");
  return res.data.data ?? { items: [], total: 0, page: 1, pageSize: 20 };
}
