/**
 * NHP 码表 + 字典联动 API 层。
 *
 * 对接后端 NhpCodelistController：版本列表 / 校对发布 / 引用链 + 项增改删。
 * 经 authHttp（baseURL `/api`）解包 Result<T>，`.then(({ data }) => data.data)` 取值。
 */
import { authHttp } from "@/api/core/authHttp";

interface Result<T> {
  code: number;
  success: boolean;
  message?: string;
  data: T;
}

/** 码表项（detail 里带 childLinks 供级联渲染 + 删除联动） */
export interface NhpCodelistItem {
  id: number;
  itemCode: string;
  itemLabel: string;
  sortOrder: number;
  /** 指向的子字典联动（纯配置，一对多） */
  childLinks: {
    linkId: number;
    childCodelistId?: number;
    childCodelistCode: string;
    childCodelistName?: string;
    childCodelistVersion?: number;
  }[];
}

/** 码表（某一版本行；字段绑定 id） */
export interface NhpCodelist {
  id: number;
  code: string;
  name: string;
  /** 文件夹分类（分组用，NULL=未分类） */
  folder?: string | null;
  version: number;
  status: string;
  /** 被字段引用数（列表/详情接口返回） */
  refCount?: number;
  editable?: boolean;
  versionCount?: number;
}

/** 码表详情（含项 + 每项的子字典联动） */
export interface NhpCodelistDetail extends NhpCodelist {
  items: NhpCodelistItem[];
}

/** 引用链：字段 → 字典套 → 原子 → 组合 */
export interface NhpCodelistUsageComposite {
  formId: number;
  formKey: string;
  title?: string;
  version?: number;
  status?: string;
}

export interface NhpCodelistUsageAtom {
  formId: number;
  formKey: string;
  title?: string;
  version?: number;
  status?: string;
  formType?: string;
  kind?: string;
  composites: NhpCodelistUsageComposite[];
}

export interface NhpCodelistUsageField {
  fieldId: number;
  fieldCode: string;
  nameCn?: string;
  nameEn?: string;
  status?: string;
  dictionaryId?: number;
  dictKey?: string;
  dictName?: string;
  atoms: NhpCodelistUsageAtom[];
}

export interface NhpCodelistUsageVersion extends NhpCodelist {
  fields: NhpCodelistUsageField[];
  retainReason?: string;
}

export interface NhpCodelistUsageGraph {
  code: string;
  versions: NhpCodelistUsageVersion[];
}

/** 码表列表头（每 code 最新版） */
export async function fetchNhpCodelists(): Promise<NhpCodelist[]> {
  return authHttp.get<Result<NhpCodelist[]>>("/nhp/codelists").then(({ data }) => data.data);
}

/** 新建码表（首版 v1 草稿） */
export async function createNhpCodelist(body: {
  code: string;
  name: string;
  folder?: string;
}): Promise<NhpCodelistDetail> {
  return authHttp.post<Result<NhpCodelistDetail>>("/nhp/codelists", body).then(({ data }) => data.data);
}

/** 更新码表元数据（name / folder） */
export async function updateNhpCodelistMeta(
  code: string,
  patch: { name?: string; folder?: string | null },
): Promise<NhpCodelistDetail> {
  return authHttp
    .put<Result<NhpCodelistDetail>>(`/nhp/codelists/${encodeURIComponent(code)}`, patch)
    .then(({ data }) => data.data);
}

/** 批量重命名文件夹（逐码表 PUT folder，无独立 folder 实体） */
export async function renameNhpCodelistFolder(
  codes: string[],
  newFolder: string | null,
): Promise<void> {
  for (const code of codes) {
    await updateNhpCodelistMeta(code, { folder: newFolder });
  }
}

/** 字段挂接：每 code 最新已冻结版（无冻结则草稿，供种子期） */
export async function fetchNhpCodelistPublishedOptions(): Promise<NhpCodelist[]> {
  return authHttp
    .get<Result<NhpCodelist[]>>("/nhp/codelists/published-options")
    .then(({ data }) => data.data);
}

/** 码表详情（含有序项）；可指定 version */
export async function fetchNhpCodelist(code: string, version?: number): Promise<NhpCodelistDetail> {
  const q = version != null ? `?version=${version}` : "";
  return authHttp
    .get<Result<NhpCodelistDetail>>(`/nhp/codelists/${encodeURIComponent(code)}${q}`)
    .then(({ data }) => data.data);
}

/** 按版本主键取详情（字段绑定的具体版本） */
export async function fetchNhpCodelistById(id: number): Promise<NhpCodelistDetail> {
  return authHttp.get<Result<NhpCodelistDetail>>(`/nhp/codelists/id/${id}`).then(({ data }) => data.data);
}

/** 某 code 全部版本 */
export async function fetchNhpCodelistVersions(code: string): Promise<NhpCodelist[]> {
  return authHttp
    .get<Result<NhpCodelist[]>>(`/nhp/codelists/${encodeURIComponent(code)}/versions`)
    .then(({ data }) => data.data);
}

/** 完整引用链（按版本） */
export async function fetchNhpCodelistUsage(code: string): Promise<NhpCodelistUsageGraph> {
  return authHttp
    .get<Result<NhpCodelistUsageGraph>>(`/nhp/codelists/${encodeURIComponent(code)}/usage`)
    .then(({ data }) => data.data);
}

export async function submitNhpCodelistReview(code: string): Promise<NhpCodelist> {
  return authHttp
    .post<Result<NhpCodelist>>(`/nhp/codelists/${encodeURIComponent(code)}/submit-review`)
    .then(({ data }) => data.data);
}

export async function approveNhpCodelistReview(code: string, comment?: string): Promise<NhpCodelist> {
  return authHttp
    .post<Result<NhpCodelist>>(`/nhp/codelists/${encodeURIComponent(code)}/approve`, {
      comment: comment ?? "",
    })
    .then(({ data }) => data.data);
}

export async function rejectNhpCodelistReview(code: string, comment: string): Promise<NhpCodelist> {
  return authHttp
    .post<Result<NhpCodelist>>(`/nhp/codelists/${encodeURIComponent(code)}/reject`, { comment })
    .then(({ data }) => data.data);
}

/** 解冻（FROZEN→DRAFT）；无活跃字段引用本版时可解冻 */
export async function unfreezeNhpCodelist(code: string): Promise<NhpCodelist> {
  return authHttp
    .post<Result<NhpCodelist>>(`/nhp/codelists/${encodeURIComponent(code)}/unfreeze`)
    .then(({ data }) => data.data);
}

/** 恢复已归档版本为已发布（ARCHIVED→FROZEN，不进入草稿编辑态） */
export async function restoreNhpCodelistArchived(code: string): Promise<NhpCodelist> {
  return authHttp
    .post<Result<NhpCodelist>>(`/nhp/codelists/${encodeURIComponent(code)}/restore-archived`)
    .then(({ data }) => data.data);
}

/** 批量解冻无字段引用的已冻结码表 */
export async function unfreezeUnusedNhpCodelists(): Promise<{
  unfrozenCount: number;
  skipped?: string[];
  message?: string;
}> {
  return authHttp
    .post<Result<{ unfrozenCount: number; skipped?: string[] }>>("/nhp/codelists/actions/unfreeze-unused")
    .then(({ data }) => ({
      ...data.data,
      message: data.message,
    }));
}

/** 基于最新冻结版克隆新草稿（版号按活跃最小空缺补位） */
export async function createNhpCodelistDraft(code: string): Promise<NhpCodelistDetail> {
  return authHttp
    .post<Result<NhpCodelistDetail>>(`/nhp/codelists/${encodeURIComponent(code)}/draft`)
    .then(({ data }) => data.data);
}

/** 软删单个码表版本；有字段引用时 409 */
export async function deleteNhpCodelistVersion(id: number): Promise<{
  id: number;
  code: string;
  version?: number;
  deleted?: boolean;
}> {
  return authHttp
    .delete<Result<{ id: number; code: string; version?: number; deleted?: boolean }>>(
      `/nhp/codelists/id/${id}`,
    )
    .then(({ data }) => data.data);
}

/**
 * 清理某 code 下全部活跃版本；被字段引用的跳过。
 * 返回 deletedCount / blocked（与模板清理一致）。
 */
export async function deleteNhpCodelist(code: string): Promise<{
  code: string;
  deletedCount: number;
  blocked?: string[];
  message?: string;
}> {
  return authHttp
    .delete<Result<{ code: string; deletedCount: number; blocked?: string[]; message?: string }>>(
      `/nhp/codelists/${encodeURIComponent(code)}`,
    )
    .then(({ data }) => ({
      ...data.data,
      message: data.data?.message ?? data.message,
    }));
}

/** 新增码表项 */
export async function addNhpCodelistItem(
  code: string,
  item: { itemCode: string; itemLabel: string },
): Promise<NhpCodelistItem> {
  return authHttp
    .post<Result<NhpCodelistItem>>(`/nhp/codelists/${encodeURIComponent(code)}/items`, item)
    .then(({ data }) => data.data);
}

/** 更新码表项 */
export async function updateNhpCodelistItem(
  code: string,
  itemId: number,
  patch: { itemLabel?: string; sortOrder?: number },
): Promise<void> {
  await authHttp.put<Result<void>>(`/nhp/codelists/${encodeURIComponent(code)}/items/${itemId}`, patch);
}

/** 删除码表项 */
export async function deleteNhpCodelistItem(code: string, itemId: number): Promise<void> {
  await authHttp.delete<Result<void>>(`/nhp/codelists/${encodeURIComponent(code)}/items/${itemId}`);
}

/** 建字典联动：项 → 子字典（可重复指向多个子字典） */
export async function addNhpCodelistLink(
  code: string,
  itemId: number,
  childCodelistCode: string,
): Promise<void> {
  await authHttp.post<Result<void>>(`/nhp/codelists/${encodeURIComponent(code)}/items/${itemId}/links`, {
    childCodelistCode,
  });
}

/** 删字典联动 */
export async function removeNhpCodelistLink(
  code: string,
  itemId: number,
  linkId: number,
): Promise<void> {
  await authHttp.delete<Result<void>>(
    `/nhp/codelists/${encodeURIComponent(code)}/items/${itemId}/links/${linkId}`,
  );
}
