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
  /** STRING/TEXT/INTEGER/DECIMAL/DATE/DATETIME/BOOLEAN/ENUM/ENUM_MULTI/CALC/FILE */
  dataType: string;
  /** 题型（对齐 NHP typeRegistry：text/select/number/date/checkbox 等） */
  fieldType?: string | null;
  /** 码表键，无则 null */
  dictKey?: string | null;
  /** 文件夹分类路径，无则 null（未分类） */
  folder?: string | null;
  /** 域编码 Dn */
  domainCode?: string | null;
  /** 子模块编码 Dn.mm */
  submoduleCode?: string | null;
  /** 字段角色，默认 VALUE */
  role?: string | null;
  /** YES / NO */
  required?: string | null;
  /** 排序值 */
  sort?: number | null;
  /** 是否发布 */
  published?: boolean;
  /** DRAFT/PENDING_REVIEW/FROZEN/RETIRED */
  status?: string | null;
  /** ARO 同步来源路径（非空 = 系统同步字段，不可删除） */
  syncSource?: string | null;
}

/** 笼位域码表摘要（cage_info_codelist，与 NHP 隔离） */
export interface CageCodelistSummary {
  id: number;
  code: string;
  name: string;
  folder?: string | null;
  version?: number | null;
  status?: string | null;
  itemCount: number;
  refCount?: number;
}

export interface CageCodelistChildLink {
  linkId: number;
  childCodelistId?: number | null;
  childCodelistCode?: string | null;
  childCodelistName?: string | null;
}

export interface CageCodelistItem {
  id: number;
  itemCode: string;
  itemLabel: string;
  sortOrder: number;
  childLinks?: CageCodelistChildLink[];
}

export interface CageCodelistDetail extends CageCodelistSummary {
  items: CageCodelistItem[];
}

/** @deprecated 使用 CageCodelistSummary */
export type CodelistSummary = CageCodelistSummary;

export interface CageInfoFieldPayload {
  canonical?: string;
  label?: string;
  dataType?: string;
  fieldType?: string | null;
  dictKey?: string | null;
  folder?: string | null;
  domainCode?: string | null;
  submoduleCode?: string | null;
  /** 字段角色：VALUE=可填写/选择，DERIVED=自动获取只读 */
  role?: string | null;
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

export async function fetchCageInfoCodelists(): Promise<CageCodelistSummary[]> {
  const res = await authHttp.get<Result<CageCodelistSummary[]>>("/admin/cage-info/codelists");
  if (!res.data?.success) throw new Error(res.data?.message || "加载码表失败");
  return res.data.data ?? [];
}

export async function fetchCageInfoCodelist(code: string): Promise<CageCodelistDetail> {
  const res = await authHttp.get<Result<CageCodelistDetail>>(`/admin/cage-info/codelists/${encodeURIComponent(code)}`);
  if (!res.data?.success) throw new Error(res.data?.message || "加载码表详情失败");
  return res.data.data!;
}

export async function createCageInfoCodelist(body: {
  code: string;
  name: string;
  folder?: string;
}): Promise<CageCodelistDetail> {
  const res = await authHttp.post<Result<CageCodelistDetail>>("/admin/cage-info/codelists", body);
  if (!res.data?.success) throw new Error(res.data?.message || "新建码表失败");
  return res.data.data!;
}

export async function updateCageInfoCodelistMeta(
  code: string,
  patch: { name?: string; folder?: string | null },
): Promise<CageCodelistDetail> {
  const res = await authHttp.put<Result<CageCodelistDetail>>(
    `/admin/cage-info/codelists/${encodeURIComponent(code)}`,
    patch,
  );
  if (!res.data?.success) throw new Error(res.data?.message || "更新码表失败");
  return res.data.data!;
}

export async function deleteCageInfoCodelist(code: string): Promise<void> {
  const res = await authHttp.delete<Result<null>>(`/admin/cage-info/codelists/${encodeURIComponent(code)}`);
  if (!res.data?.success) throw new Error(res.data?.message || "删除码表失败");
}

export async function addCageInfoCodelistItem(
  code: string,
  item: { itemCode: string; itemLabel: string },
): Promise<CageCodelistItem> {
  const res = await authHttp.post<Result<CageCodelistItem>>(
    `/admin/cage-info/codelists/${encodeURIComponent(code)}/items`,
    item,
  );
  if (!res.data?.success) throw new Error(res.data?.message || "新增码表项失败");
  return res.data.data!;
}

export async function updateCageInfoCodelistItem(
  code: string,
  itemId: number,
  patch: { itemLabel?: string; sortOrder?: number },
): Promise<void> {
  const res = await authHttp.put<Result<null>>(
    `/admin/cage-info/codelists/${encodeURIComponent(code)}/items/${itemId}`,
    patch,
  );
  if (!res.data?.success) throw new Error(res.data?.message || "更新码表项失败");
}

export async function deleteCageInfoCodelistItem(code: string, itemId: number): Promise<void> {
  const res = await authHttp.delete<Result<null>>(
    `/admin/cage-info/codelists/${encodeURIComponent(code)}/items/${itemId}`,
  );
  if (!res.data?.success) throw new Error(res.data?.message || "删除码表项失败");
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
export async function fetchCageClaimInfo(claimId: number | string): Promise<CageClaimInfoRow[]> {
  const res = await authHttp.get<Result<CageClaimInfoRow[]>>(`/admin/cage-claims/${claimId}/info`);
  if (!res.data?.success) throw new Error(res.data?.message || "加载认领信息失败");
  return res.data.data ?? [];
}

/** 保存认领信息（管理端） */
export async function updateCageClaimInfo(
  claimId: number | string,
  values: CageClaimInfoValue[],
): Promise<CageClaimInfoRow[]> {
  const res = await authHttp.put<Result<CageClaimInfoRow[]>>(`/admin/cage-claims/${claimId}/info`, { values });
  if (!res.data?.success) throw new Error(res.data?.message || "保存认领信息失败");
  return res.data.data ?? [];
}

// ═══════════════════════════════════════════
// 笼位级表单值（关键信息）—— 挂笼位，与认领无关
// ═══════════════════════════════════════════

export interface CageInfoValueRow {
  fieldId: number;
  canonical: string;
  label: string;
  dataType: string;
  fieldType?: string | null;
  role?: string | null;
  required?: string | null;
  sort?: number | null;
  value: string | number | boolean | null;
  fillSource?: string | null;
}

export async function fetchCageInfoValues(animalCageId: number | string): Promise<CageInfoValueRow[]> {
  const res = await authHttp.get<Result<CageInfoValueRow[]>>(
    `/admin/cage-info/values/${encodeURIComponent(String(animalCageId))}`,
  );
  if (!res.data?.success) throw new Error(res.data?.message || "加载表单值失败");
  return res.data.data ?? [];
}

export async function updateCageInfoValues(
  animalCageId: number | string,
  values: CageClaimInfoValue[],
): Promise<CageInfoValueRow[]> {
  const res = await authHttp.put<Result<CageInfoValueRow[]>>(
    `/admin/cage-info/values/${encodeURIComponent(String(animalCageId))}`,
    { values },
  );
  if (!res.data?.success) throw new Error(res.data?.message || "保存表单值失败");
  return res.data.data ?? [];
}

// ═══════════════════════════════════════════
// 字段字典套 + 域/子模块结构（新建文件夹）
// ═══════════════════════════════════════════

export interface CageFieldDictionary {
  id: number;
  dictKey: string;
  name: string;
  species?: string | null;
  description?: string | null;
  version?: number | null;
  status?: string | null;
  fieldCount?: number | null;
}

export interface CageStructureSubmodule {
  code: string;
  name: string;
  sortOrder?: number | null;
}

export interface CageStructureDomain {
  code: string;
  name: string;
  sortOrder?: number | null;
  submodules: CageStructureSubmodule[];
}

export interface CageStructure {
  domains: CageStructureDomain[];
}

export async function fetchCageDictionaries(): Promise<CageFieldDictionary[]> {
  const res = await authHttp.get<Result<CageFieldDictionary[]>>("/admin/cage-info/dictionaries");
  if (!res.data?.success) throw new Error(res.data?.message || "加载字典套失败");
  return res.data.data ?? [];
}

export async function fetchCageStructure(dictKey: string): Promise<CageStructure> {
  const res = await authHttp.get<Result<CageStructure>>(
    `/admin/cage-info/dictionaries/${encodeURIComponent(dictKey)}/structure`,
  );
  if (!res.data?.success) throw new Error(res.data?.message || "加载结构失败");
  return res.data.data ?? { domains: [] };
}

export async function addCageDomain(dictKey: string, body: { code: string; name: string }): Promise<CageStructure> {
  const res = await authHttp.post<Result<CageStructure>>(
    `/admin/cage-info/dictionaries/${encodeURIComponent(dictKey)}/structure/domains`,
    body,
  );
  if (!res.data?.success) throw new Error(res.data?.message || "新建数据域失败");
  return res.data.data!;
}

export async function addCageSubmodule(
  dictKey: string,
  body: { domainCode: string; code: string; name: string },
): Promise<CageStructure> {
  const res = await authHttp.post<Result<CageStructure>>(
    `/admin/cage-info/dictionaries/${encodeURIComponent(dictKey)}/structure/submodules`,
    body,
  );
  if (!res.data?.success) throw new Error(res.data?.message || "新建子模块失败");
  return res.data.data!;
}

export async function renameCageDomain(
  dictKey: string,
  domainCode: string,
  body: { name: string },
): Promise<CageStructure> {
  const res = await authHttp.patch<Result<CageStructure>>(
    `/admin/cage-info/dictionaries/${encodeURIComponent(dictKey)}/structure/domains/${encodeURIComponent(domainCode)}`,
    body,
  );
  if (!res.data?.success) throw new Error(res.data?.message || "重命名数据域失败");
  return res.data.data!;
}

export async function renameCageSubmodule(
  dictKey: string,
  submoduleCode: string,
  body: { name: string },
): Promise<CageStructure> {
  const res = await authHttp.patch<Result<CageStructure>>(
    `/admin/cage-info/dictionaries/${encodeURIComponent(dictKey)}/structure/submodules/${encodeURIComponent(submoduleCode)}`,
    body,
  );
  if (!res.data?.success) throw new Error(res.data?.message || "重命名子模块失败");
  return res.data.data!;
}

export async function deleteCageDomain(
  dictKey: string,
  domainCode: string,
  cascade: boolean,
): Promise<CageStructure> {
  const res = await authHttp.delete<Result<CageStructure>>(
    `/admin/cage-info/dictionaries/${encodeURIComponent(dictKey)}/structure/domains/${encodeURIComponent(domainCode)}?cascade=${cascade}`,
  );
  if (!res.data?.success) throw new Error(res.data?.message || "删除数据域失败");
  return res.data.data!;
}

export async function deleteCageSubmodule(
  dictKey: string,
  submoduleCode: string,
  cascade: boolean,
): Promise<CageStructure> {
  const res = await authHttp.delete<Result<CageStructure>>(
    `/admin/cage-info/dictionaries/${encodeURIComponent(dictKey)}/structure/submodules/${encodeURIComponent(submoduleCode)}?cascade=${cascade}`,
  );
  if (!res.data?.success) throw new Error(res.data?.message || "删除子模块失败");
  return res.data.data!;
}

// ═══════════════════════════════════════════
// 表单模板（原子 + 组合）
// ═══════════════════════════════════════════

export interface CageTemplateAtom {
  atomCode: string;
  atomFormKey: string;
  atomTitle: string;
  atomStatus?: string | null;
  sortOrder?: number | null;
}

export interface CageTemplateField {
  fieldId: number;
  canonical: string;
  label: string;
  dataType: string;
  fieldType?: string | null;
  dictKey?: string | null;
  /** 字段角色快照：VALUE=可填写/选择，DERIVED=自动获取只读 */
  role?: string | null;
  required?: string | null;
  sortOrder?: number | null;
}

export interface CageTemplateSubsection {
  code: string;
  label: string;
  sortOrder?: number | null;
  fields: CageTemplateField[];
}

export interface CageTemplateSection {
  code: string;
  label: string;
  sortOrder?: number | null;
  subsections: CageTemplateSubsection[];
  fields: CageTemplateField[];
}

export interface CageTemplateSummary {
  id: number;
  formKey: string;
  title: string;
  kind: string;
  dictKey?: string | null;
  hostType?: string | null;
  status?: string | null;
  version?: number | null;
  atomCount?: number | null;
  updatedAt?: string | null;
}

export interface CageTemplateDetail extends CageTemplateSummary {
  sections: CageTemplateSection[];
  atoms?: CageTemplateAtom[];
}

export async function fetchCageTemplates(): Promise<CageTemplateSummary[]> {
  const res = await authHttp.get<Result<CageTemplateSummary[]>>("/admin/cage-info/templates");
  if (!res.data?.success) throw new Error(res.data?.message || "加载模板失败");
  return res.data.data ?? [];
}

export async function fetchCageTemplate(formKey: string): Promise<CageTemplateDetail> {
  const res = await authHttp.get<Result<CageTemplateDetail>>(
    `/admin/cage-info/templates/${encodeURIComponent(formKey)}`,
  );
  if (!res.data?.success) throw new Error(res.data?.message || "加载模板详情失败");
  return res.data.data!;
}

export async function regenerateCageTemplates(): Promise<{ atomCount: number; compositeFormKey: string }> {
  const res = await authHttp.post<Result<{ atomCount: number; compositeFormKey: string }>>(
    "/admin/cage-info/templates/regenerate",
  );
  if (!res.data?.success) throw new Error(res.data?.message || "重建模板失败");
  return res.data.data ?? { atomCount: 0, compositeFormKey: "" };
}

export async function composeCageTemplates(body: {
  formKey: string;
  title?: string;
  atoms: string[];
}): Promise<CageTemplateDetail> {
  const res = await authHttp.post<Result<CageTemplateDetail>>("/admin/cage-info/templates/compose", body);
  if (!res.data?.success) throw new Error(res.data?.message || "组合失败");
  return res.data.data!;
}

export async function publishCageTemplate(formKey: string): Promise<CageTemplateDetail> {
  const res = await authHttp.post<Result<CageTemplateDetail>>(
    `/admin/cage-info/templates/${encodeURIComponent(formKey)}/publish`,
  );
  if (!res.data?.success) throw new Error(res.data?.message || "发布模板失败");
  return res.data.data!;
}

export async function unfreezeCageTemplate(formKey: string): Promise<CageTemplateDetail> {
  const res = await authHttp.post<Result<CageTemplateDetail>>(
    `/admin/cage-info/templates/${encodeURIComponent(formKey)}/unfreeze`,
  );
  if (!res.data?.success) throw new Error(res.data?.message || "解冻模板失败");
  return res.data.data!;
}

export async function deleteCageTemplate(formKey: string): Promise<void> {
  const res = await authHttp.delete<Result<null>>(`/admin/cage-info/templates/${encodeURIComponent(formKey)}`);
  if (!res.data?.success) throw new Error(res.data?.message || "删除模板失败");
}

// ═══════════════════════════════════════════
// 字段状态机
// ═══════════════════════════════════════════

export async function submitCageFieldReview(id: number): Promise<void> {
  await authHttp.post<Result<null>>(`/admin/cage-info/fields/${id}/submit-review`);
}
export async function approveCageField(id: number): Promise<void> {
  await authHttp.post<Result<null>>(`/admin/cage-info/fields/${id}/approve`);
}
export async function rejectCageField(id: number): Promise<void> {
  await authHttp.post<Result<null>>(`/admin/cage-info/fields/${id}/reject`);
}
export async function unfreezeCageField(id: number): Promise<void> {
  await authHttp.post<Result<null>>(`/admin/cage-info/fields/${id}/unfreeze`);
}
export async function batchUnfreezeCageFields(ids: number[]): Promise<{ unfrozenCount: number }> {
  const res = await authHttp.post<Result<{ unfrozenCount: number }>>(
    "/admin/cage-info/fields/actions/batch-unfreeze",
    { fieldIds: ids },
  );
  if (!res.data?.success) throw new Error(res.data?.message || "批量解冻失败");
  return res.data.data ?? { unfrozenCount: 0 };
}

// ═══════════════════════════════════════════
// 码表状态机 / 引用链 / 子字典联动
// ═══════════════════════════════════════════

export async function submitCageCodelistReview(code: string): Promise<CageCodelistDetail> {
  const res = await authHttp.post<Result<CageCodelistDetail>>(
    `/admin/cage-info/codelists/${encodeURIComponent(code)}/submit-review`,
  );
  if (!res.data?.success) throw new Error(res.data?.message || "提交校对失败");
  return res.data.data!;
}
export async function approveCageCodelist(code: string): Promise<CageCodelistDetail> {
  const res = await authHttp.post<Result<CageCodelistDetail>>(
    `/admin/cage-info/codelists/${encodeURIComponent(code)}/approve`,
  );
  if (!res.data?.success) throw new Error(res.data?.message || "通过失败");
  return res.data.data!;
}
export async function rejectCageCodelist(code: string): Promise<CageCodelistDetail> {
  const res = await authHttp.post<Result<CageCodelistDetail>>(
    `/admin/cage-info/codelists/${encodeURIComponent(code)}/reject`,
  );
  if (!res.data?.success) throw new Error(res.data?.message || "驳回失败");
  return res.data.data!;
}
export async function unfreezeCageCodelist(code: string): Promise<CageCodelistDetail> {
  const res = await authHttp.post<Result<CageCodelistDetail>>(
    `/admin/cage-info/codelists/${encodeURIComponent(code)}/unfreeze`,
  );
  if (!res.data?.success) throw new Error(res.data?.message || "解冻失败");
  return res.data.data!;
}
export async function unfreezeUnusedCageCodelists(): Promise<{ unfrozenCount: number }> {
  const res = await authHttp.post<Result<{ unfrozenCount: number }>>(
    "/admin/cage-info/codelists/actions/unfreeze-unused",
  );
  if (!res.data?.success) throw new Error(res.data?.message || "批量解冻失败");
  return res.data.data ?? { unfrozenCount: 0 };
}

export interface CageCodelistUsageFieldAtom {
  templateId: number;
  formKey: string;
  title: string;
  status?: string | null;
  version?: number | null;
  composites: Array<{
    templateId: number;
    formKey: string;
    title: string;
    status?: string | null;
    version?: number | null;
  }>;
}

export interface CageCodelistUsageField {
  fieldId: number;
  canonical: string;
  label: string;
  domainCode?: string | null;
  submoduleCode?: string | null;
  status?: string | null;
  atoms: CageCodelistUsageFieldAtom[];
}

export interface CageCodelistUsage {
  code: string;
  name: string;
  refCount: number;
  fields: CageCodelistUsageField[];
}

export async function fetchCageCodelistUsage(code: string): Promise<CageCodelistUsage> {
  const res = await authHttp.get<Result<CageCodelistUsage>>(
    `/admin/cage-info/codelists/${encodeURIComponent(code)}/usage`,
  );
  if (!res.data?.success) throw new Error(res.data?.message || "加载引用链失败");
  return res.data.data!;
}

export async function addCageCodelistLink(
  code: string,
  itemId: number,
  childCodelistCode: string,
): Promise<CageCodelistChildLink> {
  const res = await authHttp.post<Result<CageCodelistChildLink>>(
    `/admin/cage-info/codelists/${encodeURIComponent(code)}/items/${itemId}/links`,
    { childCodelistCode },
  );
  if (!res.data?.success) throw new Error(res.data?.message || "新增联动失败");
  return res.data.data!;
}

export async function removeCageCodelistLink(code: string, itemId: number, linkId: number): Promise<void> {
  const res = await authHttp.delete<Result<null>>(
    `/admin/cage-info/codelists/${encodeURIComponent(code)}/items/${itemId}/links/${linkId}`,
  );
  if (!res.data?.success) throw new Error(res.data?.message || "移除联动失败");
}
