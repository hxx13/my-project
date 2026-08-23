import { authHttp } from "@/api/core/authHttp";

interface Result<T> {
  code: number;
  success: boolean;
  message: string;
  data: T;
}

export interface CageInfoField {
  id: number;
  canonical: string;
  label: string;
  dataType: string; // "number" | "text" | "boolean"
  dictKey?: string | null;
  role?: string | null;
  required?: boolean;
  showWhen?: unknown;
  syncSource?: string | null;
  config?: unknown;
  sort?: number | null;
  published?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CodelistSummary {
  id: number;
  code: string;
  name: string;
  itemCount: number;
}

export interface CageInfoFieldCreatePayload {
  canonical: string;
  label: string;
  dataType: string;
  dictKey?: string;
  required?: boolean;
  sort?: number;
}

export interface CageInfoFieldUpdatePayload {
  label?: string;
  dataType?: string;
  dictKey?: string;
  required?: boolean;
  sort?: number;
  showWhen?: unknown;
}

export async function fetchCageInfoFields(): Promise<CageInfoField[]> {
  const res = await authHttp.get<Result<CageInfoField[]>>("/admin/cage-info/fields");
  if (!res.data?.success) throw new Error(res.data?.message || "加载字段失败");
  return res.data.data ?? [];
}

export async function createCageInfoField(body: CageInfoFieldCreatePayload): Promise<CageInfoField> {
  const res = await authHttp.post<Result<CageInfoField>>("/admin/cage-info/fields", body);
  if (!res.data?.success) throw new Error(res.data?.message || "新增字段失败");
  return res.data.data!;
}

export async function updateCageInfoField(id: number, body: CageInfoFieldUpdatePayload): Promise<CageInfoField> {
  const res = await authHttp.put<Result<CageInfoField>>(`/admin/cage-info/fields/${id}`, body);
  if (!res.data?.success) throw new Error(res.data?.message || "更新字段失败");
  return res.data.data!;
}

export async function deleteCageInfoField(id: number): Promise<void> {
  const res = await authHttp.delete<Result<void>>(`/admin/cage-info/fields/${id}`);
  if (!res.data?.success) throw new Error(res.data?.message || "删除字段失败");
}

export async function publishCageInfoFields(fieldIds?: number[]): Promise<void> {
  const res = await authHttp.post<Result<void>>("/admin/cage-info/publish", {
    fieldIds: fieldIds && fieldIds.length > 0 ? fieldIds : undefined,
  });
  if (!res.data?.success) throw new Error(res.data?.message || "发布失败");
}

export async function fetchCageInfoCodelists(): Promise<CodelistSummary[]> {
  const res = await authHttp.get<Result<CodelistSummary[]>>("/admin/cage-info/codelists");
  if (!res.data?.success) throw new Error(res.data?.message || "加载码表失败");
  return res.data.data ?? [];
}
