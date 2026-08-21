/**
 * NHP 字段字典 API 层。
 *
 * 对接后端 NhpFieldController：字段列表（按域）/新建/更新/提交校对/删除。
 * 经 authHttp（baseURL `/api`）解包 Result<T>。
 */
import { authHttp } from "@/api/core/authHttp";

interface Result<T> {
  code: number;
  success: boolean;
  message?: string;
  data: T;
}

/** 字段定义（对齐 crf_field） */
export interface NhpField {
  id: number;
  dictionaryId?: number;
  fieldCode: string;
  nameEn: string;
  nameCn: string;
  dataType: string;
  unit?: string;
  required: string;
  codelistId?: number;
  description?: string;
  cdiscDomain?: string;
  cdiscVariable?: string;
  cdiscTestCode?: string;
  status: string;
  version: number;
}

export interface NhpFieldPublishedUsage {
  formId: number;
  formKey: string;
  title: string;
  status: string;
}

/** 字段列表（可按字典套 dictKey、域 domain=D1，或按码表反查 codelistId） */
export async function fetchNhpFields(
  domain?: string,
  opts?: { codelistId?: number; dictKey?: string; dictionaryId?: number; status?: string },
): Promise<NhpField[]> {
  const params = new URLSearchParams();
  if (domain) params.set("domain", domain);
  if (opts?.codelistId != null) params.set("codelistId", String(opts.codelistId));
  if (opts?.dictKey) params.set("dictKey", opts.dictKey);
  if (opts?.dictionaryId != null) params.set("dictionaryId", String(opts.dictionaryId));
  if (opts?.status) params.set("status", opts.status);
  const q = params.toString() ? `?${params.toString()}` : "";
  return authHttp.get<Result<NhpField[]>>(`/nhp/fields${q}`).then(({ data }) => data.data);
}

/** 新建字段 */
export async function createNhpField(field: Partial<NhpField>): Promise<NhpField> {
  return authHttp.post<Result<NhpField>>("/nhp/fields", field).then(({ data }) => data.data);
}

/** 更新字段 */
export async function updateNhpField(fieldId: number, patch: Partial<NhpField>): Promise<void> {
  await authHttp.put<Result<void>>(`/nhp/fields/${fieldId}`, patch);
}

/** 提交字段校对（DRAFT→PENDING_REVIEW） */
export async function submitNhpFieldReview(fieldId: number): Promise<void> {
  await authHttp.post<Result<void>>(`/nhp/fields/${fieldId}/submit-review`);
}

/** 字段在已发布/冻结模板中的使用 */
export async function fetchNhpFieldPublishedUsage(fieldId: number): Promise<NhpFieldPublishedUsage[]> {
  return authHttp
    .get<Result<NhpFieldPublishedUsage[]>>(`/nhp/fields/${fieldId}/published-usage`)
    .then(({ data }) => data.data ?? []);
}

/** 删除字段（软删）。force=true 时即使已发布模板中使用也删除。 */
export async function deleteNhpField(fieldId: number, force = false): Promise<void> {
  const q = force ? "?force=true" : "";
  await authHttp.delete<Result<void>>(`/nhp/fields/${fieldId}${q}`);
}

/** 待校对队列 */
export async function fetchNhpPendingReviewFields(opts?: {
  dictKey?: string;
  dictionaryId?: number;
}): Promise<NhpField[]> {
  const params = new URLSearchParams();
  if (opts?.dictKey) params.set("dictKey", opts.dictKey);
  if (opts?.dictionaryId != null) params.set("dictionaryId", String(opts.dictionaryId));
  const q = params.toString() ? `?${params.toString()}` : "";
  return authHttp
    .get<Result<NhpField[]>>(`/nhp/fields/pending-review${q}`)
    .then(({ data }) => data.data ?? []);
}

/** 校对通过并冻结（PENDING_REVIEW→FROZEN），需 ADMIN+ */
export async function approveNhpFieldReview(fieldId: number, comment?: string): Promise<void> {
  await authHttp.post<Result<void>>(`/nhp/fields/${fieldId}/approve`, { comment: comment ?? "" });
}

/** 校对驳回（PENDING_REVIEW→DRAFT），需 ADMIN+ 且必须填意见 */
export async function rejectNhpFieldReview(fieldId: number, comment: string): Promise<void> {
  await authHttp.post<Result<void>>(`/nhp/fields/${fieldId}/reject`, { comment });
}

/** 解冻（FROZEN→DRAFT）；无发布模板引用且无活跃填写取值时可解冻 */
export async function unfreezeNhpField(fieldId: number): Promise<NhpField> {
  return authHttp
    .post<Result<NhpField>>(`/nhp/fields/${fieldId}/unfreeze`)
    .then(({ data }) => data.data);
}
