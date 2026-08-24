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
