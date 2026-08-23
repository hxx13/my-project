import { authHttp } from "@/api/core/authHttp";

interface Result<T> {
  code: number;
  success: boolean;
  message: string;
  data: T;
}

/** cage_info_field 字段条目（后端 CageInfoFieldController） */
export interface CageInfoField {
  id: number;
  /** 本地规范字段名（唯一键） */
  canonical: string;
  /** 中文显示名 */
  label: string;
  /** number / text / boolean */
  dataType: string;
  /** 码表键，无则 null */
  dictKey?: string | null;
  /** 字段角色，默认 VALUE */
  role?: string | null;
  /** YES / NO */
  required?: string | null;
  /** 排序值 */
  sort?: number | null;
  /** 是否发布 */
  published?: boolean;
  /** ARO 同步来源路径（非空 = 系统同步字段，不可删除） */
  syncSource?: string | null;
}

/** 笼位域码表摘要（与 NHP crf_codelist 隔离；当前可为空） */
export interface CodelistSummary {
  id: number;
  code: string;
  name: string;
  itemCount: number;
}

export interface CageInfoFieldPayload {
  canonical?: string;
  label?: string;
  dataType?: string;
  dictKey?: string | null;
  required?: string;
  sort?: number | null;
}

export async function fetchCageInfoFields(): Promise<CageInfoField[]> {
  const res = await authHttp.get<Result<CageInfoField[]>>("/admin/cage-info/fields");
  if (!res.data?.success) throw new Error(res.data?.message || "加载字段失败");
  return res.data.data ?? [];
}

export async function createCageInfoField(body: CageInfoFieldPayload): Promise<CageInfoField> {
  const res = await authHttp.post<Result<CageInfoField>>("/admin/cage-info/fields", body);
  if (!res.data?.success) throw new Error(res.data?.message || "新建字段失败");
  return res.data.data!;
}

export async function updateCageInfoField(id: number, body: CageInfoFieldPayload): Promise<CageInfoField> {
  const res = await authHttp.put<Result<CageInfoField>>(`/admin/cage-info/fields/${id}`, body);
  if (!res.data?.success) throw new Error(res.data?.message || "更新字段失败");
  return res.data.data!;
}

export async function deleteCageInfoField(id: number): Promise<void> {
  const res = await authHttp.delete<Result<null>>(`/admin/cage-info/fields/${id}`);
  if (!res.data?.success) throw new Error(res.data?.message || "删除字段失败");
}

/** 发布字段：fieldIds 缺席/空则发布全部 */
export async function publishCageInfoFields(fieldIds?: number[]): Promise<{ affected: number }> {
  const body = fieldIds && fieldIds.length > 0 ? { fieldIds } : {};
  const res = await authHttp.post<Result<{ affected: number }>>("/admin/cage-info/publish", body);
  if (!res.data?.success) throw new Error(res.data?.message || "发布失败");
  return res.data.data ?? { affected: 0 };
}

export async function fetchCageInfoCodelists(): Promise<CodelistSummary[]> {
  const res = await authHttp.get<Result<CodelistSummary[]>>("/admin/cage-info/codelists");
  if (!res.data?.success) throw new Error(res.data?.message || "加载码表失败");
  return res.data.data ?? [];
}

// ═══════════════════════════════════════════
// 认领信息读写（管理端，无归属校验）
// ═══════════════════════════════════════════

/** 认领信息行：字段字典 + 该认领的实例值（CageClaimInfoService.getInfo 返回形状） */
export interface CageClaimInfoRow {
  fieldId: number;
  canonical: string;
  label: string;
  dataType: string;
  required?: string | null;
  sort?: number | null;
  value: string | number | boolean | null;
  fillSource?: string | null;
}

/** 认领信息保存项 */
export interface CageClaimInfoValue {
  fieldId: number;
  value: string | number | boolean | null;
}

/** 查看认领信息（管理端） */
export async function fetchCageClaimInfo(claimId: number): Promise<CageClaimInfoRow[]> {
  const res = await authHttp.get<Result<CageClaimInfoRow[]>>(`/admin/cage-claims/${claimId}/info`);
  if (!res.data?.success) throw new Error(res.data?.message || "加载认领信息失败");
  return res.data.data ?? [];
}

/** 保存认领信息（管理端） */
export async function updateCageClaimInfo(
  claimId: number,
  values: CageClaimInfoValue[],
): Promise<CageClaimInfoRow[]> {
  const res = await authHttp.put<Result<CageClaimInfoRow[]>>(`/admin/cage-claims/${claimId}/info`, { values });
  if (!res.data?.success) throw new Error(res.data?.message || "保存认领信息失败");
  return res.data.data ?? [];
}
