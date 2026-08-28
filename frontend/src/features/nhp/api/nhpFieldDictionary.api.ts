/**
 * NHP 字段字典套 API（猪 / 猴 等隔离目录）。
 */
import { authHttp } from "@/api/core/authHttp";

interface Result<T> {
  code: number;
  success: boolean;
  message?: string;
  data: T;
}

export interface NhpFieldDictionary {
  id: number;
  dictKey: string;
  name: string;
  species?: string;
  description?: string;
  structureJson?: string;
  version?: number;
  status?: string;
  fieldCount?: number;
  updatedAt?: string;
}

export interface NhpDictSubmodule {
  code: string;
  name: string;
  /** 展示序（独立于编码；编码是表码） */
  sortOrder?: number;
}

export interface NhpDictDomain {
  code: string;
  name: string;
  /** 展示序（独立于编码；编码是表码） */
  sortOrder?: number;
  submodules: NhpDictSubmodule[];
}

export interface NhpDictStructure {
  domains: NhpDictDomain[];
}

export async function fetchNhpFieldDictionaries(): Promise<NhpFieldDictionary[]> {
  return authHttp
    .get<Result<NhpFieldDictionary[]>>("/nhp/field-dictionaries")
    .then(({ data }) => data.data ?? []);
}

export async function fetchNhpFieldDictionary(dictKey: string): Promise<NhpFieldDictionary> {
  return authHttp
    .get<Result<NhpFieldDictionary>>(`/nhp/field-dictionaries/${encodeURIComponent(dictKey)}`)
    .then(({ data }) => data.data);
}

export async function fetchNhpDictStructure(dictKey: string): Promise<NhpDictStructure> {
  return authHttp
    .get<Result<NhpDictStructure>>(`/nhp/field-dictionaries/${encodeURIComponent(dictKey)}/structure`)
    .then(({ data }) => data.data ?? { domains: [] });
}

export async function addNhpDictDomain(
  dictKey: string,
  body: { code: string; name?: string; sortOrder?: number },
): Promise<NhpDictStructure> {
  return authHttp
    .post<Result<NhpDictStructure>>(
      `/nhp/field-dictionaries/${encodeURIComponent(dictKey)}/structure/domains`,
      body,
    )
    .then(({ data }) => data.data);
}

export async function addNhpDictSubmodule(
  dictKey: string,
  body: { domainCode: string; code: string; name?: string; sortOrder?: number },
): Promise<NhpDictStructure> {
  return authHttp
    .post<Result<NhpDictStructure>>(
      `/nhp/field-dictionaries/${encodeURIComponent(dictKey)}/structure/submodules`,
      body,
    )
    .then(({ data }) => data.data);
}

/** 更新套内数据域显示名；默认 syncAtoms 同步到原子/组合章节 label */
export async function renameNhpDictDomain(
  dictKey: string,
  domainCode: string,
  name: string,
  syncAtoms = true,
): Promise<NhpDictStructure & { sectionsUpdated?: number; formsTouched?: number }> {
  const q = syncAtoms ? "" : "?syncAtoms=false";
  return authHttp
    .patch<Result<NhpDictStructure & { sectionsUpdated?: number; formsTouched?: number }>>(
      `/nhp/field-dictionaries/${encodeURIComponent(dictKey)}/structure/domains/${encodeURIComponent(domainCode)}${q}`,
      { name },
    )
    .then(({ data }) => data.data);
}

/** 更新子模块显示名；默认同步到原子/组合章节 label */
export async function renameNhpDictSubmodule(
  dictKey: string,
  submoduleCode: string,
  name: string,
  syncAtoms = true,
): Promise<NhpDictStructure & { sectionsUpdated?: number; formsTouched?: number }> {
  const q = syncAtoms ? "" : "?syncAtoms=false";
  return authHttp
    .patch<Result<NhpDictStructure & { sectionsUpdated?: number; formsTouched?: number }>>(
      `/nhp/field-dictionaries/${encodeURIComponent(dictKey)}/structure/submodules/${encodeURIComponent(submoduleCode)}${q}`,
      { name },
    )
    .then(({ data }) => data.data);
}

/** 将大纲中文名同步到本套原子/组合模板章节 label */
export async function syncNhpDictAtomLabels(dictKey: string): Promise<{
  dictKey?: string;
  formsTouched?: number;
  sectionsUpdated?: number;
}> {
  return authHttp
    .post<Result<{ dictKey?: string; formsTouched?: number; sectionsUpdated?: number }>>(
      `/nhp/field-dictionaries/${encodeURIComponent(dictKey)}/structure/sync-atom-labels`,
    )
    .then(({ data }) => data.data ?? {});
}

/** 删除套内数据域。有字段时须 cascade=true（软删字段）；含 FROZEN 则后端拒绝。 */
export async function deleteNhpDictDomain(
  dictKey: string,
  domainCode: string,
  cascade = false,
): Promise<NhpDictStructure & { softDeletedFields?: number }> {
  const q = cascade ? "?cascade=true" : "";
  return authHttp
    .delete<Result<NhpDictStructure & { softDeletedFields?: number }>>(
      `/nhp/field-dictionaries/${encodeURIComponent(dictKey)}/structure/domains/${encodeURIComponent(domainCode)}${q}`,
    )
    .then(({ data }) => data.data);
}

/** 删除子模块。规则同 deleteNhpDictDomain。 */
export async function deleteNhpDictSubmodule(
  dictKey: string,
  submoduleCode: string,
  cascade = false,
): Promise<NhpDictStructure & { softDeletedFields?: number }> {
  const q = cascade ? "?cascade=true" : "";
  return authHttp
    .delete<Result<NhpDictStructure & { softDeletedFields?: number }>>(
      `/nhp/field-dictionaries/${encodeURIComponent(dictKey)}/structure/submodules/${encodeURIComponent(submoduleCode)}${q}`,
    )
    .then(({ data }) => data.data);
}

/** 显式从另一数据域套克隆域/子模块大纲（不复制字段） */
export async function cloneNhpDictStructureFrom(
  dictKey: string,
  sourceDictKey: string,
): Promise<NhpDictStructure & { clonedFrom?: string; addedNodes?: number }> {
  return authHttp
    .post<Result<NhpDictStructure & { clonedFrom?: string; addedNodes?: number }>>(
      `/nhp/field-dictionaries/${encodeURIComponent(dictKey)}/structure/clone-from/${encodeURIComponent(sourceDictKey)}`,
    )
    .then(({ data }) => data.data);
}

/** 复制数据域（含子模块大纲 + 字段） */
export async function copyNhpDictDomain(
  dictKey: string,
  body: { sourceCode: string; targetCode: string },
): Promise<NhpDictStructure & { copiedFields?: number }> {
  return authHttp
    .post<Result<NhpDictStructure & { copiedFields?: number }>>(
      `/nhp/field-dictionaries/${encodeURIComponent(dictKey)}/structure/domains/copy`,
      body,
    )
    .then(({ data }) => data.data);
}

/** 复制子模块（含字段） */
export async function copyNhpDictSubmodule(
  dictKey: string,
  body: { sourceCode: string; targetCode: string },
): Promise<NhpDictStructure & { copiedFields?: number }> {
  return authHttp
    .post<Result<NhpDictStructure & { copiedFields?: number }>>(
      `/nhp/field-dictionaries/${encodeURIComponent(dictKey)}/structure/submodules/copy`,
      body,
    )
    .then(({ data }) => data.data);
}

export async function createNhpFieldDictionary(body: {
  dictKey: string;
  name: string;
  species?: string;
  description?: string;
}): Promise<NhpFieldDictionary> {
  return authHttp
    .post<Result<NhpFieldDictionary>>("/nhp/field-dictionaries", body)
    .then(({ data }) => data.data);
}

/** 复制数据域套（字段文件夹：含大纲 + 字段；字段落 DRAFT v1） */
export async function copyNhpFieldDictionary(body: {
  sourceDictKey: string;
  targetDictKey: string;
  name?: string;
}): Promise<NhpFieldDictionary> {
  return authHttp
    .post<Result<NhpFieldDictionary>>("/nhp/field-dictionaries/copy", body)
    .then(({ data }) => data.data);
}

export async function updateNhpFieldDictionary(
  dictKey: string,
  body: Partial<Pick<NhpFieldDictionary, "name" | "species" | "description" | "status">>,
): Promise<NhpFieldDictionary> {
  return authHttp
    .put<Result<NhpFieldDictionary>>(`/nhp/field-dictionaries/${encodeURIComponent(dictKey)}`, body)
    .then(({ data }) => data.data);
}

/** 软删数据域套。有字段/原子时须 cascade=true；含 FROZEN 字段则后端拒绝。不硬删猪种子行。 */
export async function deleteNhpFieldDictionary(
  dictKey: string,
  cascade = false,
): Promise<{
  dictKey?: string;
  softDeleted?: boolean;
  softDeletedFields?: number;
  softDeletedAtoms?: number;
  seedHint?: string | null;
}> {
  const q = cascade ? "?cascade=true" : "";
  return authHttp
    .delete<
      Result<{
        dictKey?: string;
        softDeleted?: boolean;
        softDeletedFields?: number;
        softDeletedAtoms?: number;
        seedHint?: string | null;
      }>
    >(`/nhp/field-dictionaries/${encodeURIComponent(dictKey)}${q}`)
    .then(({ data }) => data.data ?? {});
}

/**
 * 重导入内置猪字段字典：把内置种子字段同步进猪套并冻结（已有则计为「更新/冻结」，不是失败）。
 * 重建大纲；清理历史误种的 DD* 空原子；检测并补生成缺失原子。不改猴套。
 */
export async function reimportPigDictionary(): Promise<{
  pigDictionaryId?: number;
  fieldsInserted?: number;
  fieldsRevived?: number;
  fieldsUpdated?: number;
  fieldsFrozen?: number;
  fieldsSkipped?: number;
  structureRebuilt?: boolean;
  bogusDoubleDAtomsRemoved?: number;
  missingAtomDomains?: string[];
  atomsRegenerated?: string[];
  atomsFailed?: { domain?: string; message?: string }[];
  atomsMissingDetected?: number;
  atomsRegeneratedCount?: number;
}> {
  return authHttp
    .post<
      Result<{
        pigDictionaryId?: number;
        fieldsInserted?: number;
        fieldsRevived?: number;
        fieldsUpdated?: number;
        fieldsFrozen?: number;
        fieldsSkipped?: number;
        structureRebuilt?: boolean;
        bogusDoubleDAtomsRemoved?: number;
        missingAtomDomains?: string[];
        atomsRegenerated?: string[];
        atomsFailed?: { domain?: string; message?: string }[];
        atomsMissingDetected?: number;
        atomsRegeneratedCount?: number;
      }>
    >("/nhp/seed/pig-dictionary")
    .then(({ data }) => data.data ?? {});
}

/** 格式化重导入结果：区分字段同步 vs 原子缺失检测/补生成 */
export function formatPigReimportToast(d: Awaited<ReturnType<typeof reimportPigDictionary>>): string {
  const inserted = d.fieldsInserted ?? 0;
  const updated = d.fieldsUpdated ?? 0;
  const frozen = d.fieldsFrozen ?? 0;
  const skipped = d.fieldsSkipped ?? 0;
  const revived = d.fieldsRevived ?? 0;
  const bogus = d.bogusDoubleDAtomsRemoved ?? 0;
  const missing = d.missingAtomDomains ?? [];
  const regenerated = d.atomsRegenerated ?? [];
  const failed = d.atomsFailed ?? [];
  const syncHint =
    inserted === 0 && updated > 0
      ? "（字段已在库中：本次为同步更新并冻结，不是导入失败）"
      : "";
  const fieldPart =
    `【字段重导入】新增 ${inserted}，复活 ${revived}，更新 ${updated}，冻结字段 ${frozen}，跳过 ${skipped}` +
    (d.structureRebuilt ? "；大纲已按字段重建为 D1–D10" : "") +
    (bogus > 0 ? `；已清理误种 DD* 原子 ${bogus}` : "") +
    syncHint +
    "（仅冻结猪套字段，不改码表；码表已发布基线请用「新建版本」改项）";
  let atomPart = "";
  if (missing.length === 0 && regenerated.length === 0) {
    atomPart = "【原子】有冻结字段的域均已有活跃原子";
  } else {
    atomPart =
      `【原子缺失检测】缺失域 ${missing.length ? missing.join("、") : "无"}` +
      (regenerated.length ? `；已补生成 ${regenerated.join("、")}` : "") +
      (failed.length
        ? `；失败 ${failed.map((f) => `${f.domain || "?"}:${f.message || "未知"}`).join("；")}`
        : "");
  }
  return `${fieldPart}。${atomPart}。码表若仍全部冻结：种子基线如此，与「模板列表是否看到已发布」无关；无字段占用时可在码表页「解冻本版 / 批量解冻无引用」，或「新建版本」改项。`;
}
