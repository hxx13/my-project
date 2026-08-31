/**
 * NHP CRF 表单模板前端 API 层。
 *
 * 两层模型（发布双通路）：
 * - 原子模板（ATOM / DOMAIN|MODULE）：数据域模块；可独立发布为可填表单，也可被组合钉住
 * - 组合模板（COMPOSITE / TEMPLATE）：可选——钉住多原子版本并快照后发布
 * 填写实例可挂已发布原子或组合。列表头可能是草稿，请用 publishedFormId 开填。
 */
import { authHttp } from "@/api/core/authHttp";
import { reimportPigDictionary } from "./nhpFieldDictionary.api";
import { seedNhpAtoms } from "./nhpOps.api";
import type { FormTemplate } from "../schema/formTemplate";

interface Result<T> {
  code: number;
  success: boolean;
  message?: string;
  data: T;
}

export type NhpTemplateKind = "ATOM" | "COMPOSITE";

export interface NhpAtomRef {
  atomCode: string;
  atomFormId: number;
  sortOrder?: number;
  atomTitle?: string;
  atomVersion?: number;
  atomStatus?: string;
}

/** 原子版本被哪些组合引用 */
export interface NhpAtomReferencedBy {
  compositeFormId: number;
  formKey: string;
  title: string;
  version?: number;
  status?: string;
  origin?: NhpTemplateOrigin;
  dictKey?: string;
}

/** SEED=系统种子；AUTO_COMPOSE=重组已发布组合时自动升版；USER=手建/新建版本 */
export type NhpTemplateOrigin = "SEED" | "AUTO_COMPOSE" | "USER";

export interface NhpTemplateListItem {
  formId: number;
  formKey: string;
  title: string;
  updatedAt: string;
  status: string;
  version?: number;
  formType?: string;
  kind?: NhpTemplateKind;
  description?: string;
  origin?: NhpTemplateOrigin;
  /** 原子所属数据域套（裸 D1 视为 pig） */
  dictKey?: string;
  /** 套内域码，如 D1 */
  domainCode?: string;
  atoms?: NhpAtomRef[];
  atomCount?: number;
  referencedBy?: NhpAtomReferencedBy[];
  locked?: boolean;
  /** 同 formKey 是否存在已发布版（列表头可能是更新后的草稿） */
  hasPublished?: boolean;
  publishedFormId?: number;
  publishedVersion?: number;
  publishedStatus?: string;
  /** schedule 列：事件锚点（发布后决定何时可填） */
  eventAnchor?: string | null;
  /** schedule 列：频次（ONCE=里程碑 / 其他=可重复） */
  frequency?: string | null;
  captureForm?: string | null;
  /** 宿主：DONOR 供体域 / RECIPIENT 受体域（表单划分） */
  hostType?: "DONOR" | "RECIPIENT" | null;
  /** 归属文件夹 FK→aup_folder.id（owner_type=NHP_FORM）；null=未分类 */
  folderId?: number | null;
}

/** 是否可用于开填（头版本已发布，或同 key 另有已发布版） */
export function isFillablePublished(t: NhpTemplateListItem): boolean {
  if (t.hasPublished && t.publishedFormId != null) return true;
  const s = (t.status || "").toUpperCase();
  return s === "PUBLISHED" || s === "FROZEN";
}

/** 开填应使用的 formId（优先已发布版，避免误用更新草稿） */
export function fillableFormId(t: NhpTemplateListItem): number | undefined {
  if (t.hasPublished && t.publishedFormId != null) return t.publishedFormId;
  const s = (t.status || "").toUpperCase();
  if (s === "PUBLISHED" || s === "FROZEN") return t.formId;
  return undefined;
}

/** 事件指派 / 采集侧应使用的 formId（与 visit_plan.atom_id 对齐） */
export function assignableFormId(t: NhpTemplateListItem): number {
  return fillableFormId(t) ?? t.formId;
}

export function isCompositeTemplate(t: NhpTemplateListItem): boolean {
  const ft = (t.formType || "").toUpperCase();
  const kd = (t.kind || "").toUpperCase();
  return ft === "TEMPLATE" || ft === "COMPOSITE" || kd === "COMPOSITE";
}

/** 已发布可指派模板（原子 + 组合；与表单发布页「已发布」口径一致） */
export async function fetchAssignableNhpTemplates(): Promise<NhpTemplateListItem[]> {
  const all = await fetchNhpTemplates("ALL");
  return all.filter(isFillablePublished);
}

/** visit_plan.atom_id 可能落草稿头或已发布版 id，建双向索引 */
export function indexTemplatesByFormId(templates: NhpTemplateListItem[]): Map<number, NhpTemplateListItem> {
  const m = new Map<number, NhpTemplateListItem>();
  for (const t of templates) {
    m.set(t.formId, t);
    const fid = assignableFormId(t);
    if (fid !== t.formId) m.set(fid, t);
    if (t.publishedFormId != null) m.set(t.publishedFormId, t);
  }
  return m;
}

export interface NhpFormTemplate extends FormTemplate {
  formId?: number;
  status?: string;
  version?: number;
  formType?: string;
  kind?: NhpTemplateKind;
  description?: string;
  origin?: NhpTemplateOrigin;
  dictKey?: string;
  domainCode?: string;
  hostType?: "DONOR" | "RECIPIENT" | null;
  atoms?: NhpAtomRef[];
  referencedBy?: NhpAtomReferencedBy[];
  locked?: boolean;
}

export function versionOriginLabel(origin?: NhpTemplateOrigin | string | null): string {
  switch ((origin || "").toUpperCase()) {
    case "SEED":
      return "系统种子";
    case "AUTO_COMPOSE":
      return "重组升版";
    default:
      return "";
  }
}

/** 列表：kind=COMPOSITE|ATOM|ALL；原子可按 dictKey 过滤。开填请用 isFillablePublished / fillableFormId。 */
export async function fetchNhpTemplates(
  kind: "COMPOSITE" | "ATOM" | "ALL" = "COMPOSITE",
  opts?: { dictKey?: string },
): Promise<NhpTemplateListItem[]> {
  const params: Record<string, string> = { kind };
  if (opts?.dictKey) params.dictKey = opts.dictKey;
  return authHttp
    .get<Result<NhpTemplateListItem[]>>("/nhp/templates", { params })
    .then(({ data }) => data.data);
}

export async function fetchNhpAtoms(dictKey?: string): Promise<NhpTemplateListItem[]> {
  return fetchNhpTemplates("ATOM", dictKey ? { dictKey } : undefined);
}

/** 归类表单到文件夹（folderId 为空即移出到未分类；按 formKey 整组落库） */
export async function setNhpTemplateFolder(formKey: string, folderId: number | null): Promise<NhpTemplateListItem> {
  return authHttp
    .put<Result<NhpTemplateListItem>>(`/nhp/templates/${encodeURIComponent(formKey)}/folder`, { folderId })
    .then(({ data }) => data.data);
}

export async function fetchNhpTemplate(formKey: string): Promise<NhpFormTemplate> {
  return authHttp.get<Result<NhpFormTemplate>>(`/nhp/templates/${formKey}`).then(({ data }) => data.data);
}

/** 按 formId 取结构（续填钉住历史版本 / 组合预览原子版本） */
export async function fetchNhpTemplateById(formId: number): Promise<NhpFormTemplate> {
  return authHttp
    .get<Result<NhpFormTemplate>>(`/nhp/templates/by-id/${formId}`)
    .then(({ data }) => data.data);
}

export async function fetchNhpTemplateVersions(formKey: string): Promise<NhpTemplateListItem[]> {
  return authHttp
    .get<Result<NhpTemplateListItem[]>>(`/nhp/templates/${formKey}/versions`)
    .then(({ data }) => data.data);
}

export async function saveNhpTemplate(
  formKey: string,
  template: FormTemplate & { atoms?: NhpAtomRef[]; formId?: number },
): Promise<NhpFormTemplate> {
  return authHttp
    .post<Result<NhpFormTemplate>>(`/nhp/templates/${formKey}`, template)
    .then(({ data }) => data.data);
}

/** 新建原子模板（数据域模块）；非猪套会落成 dictKey__Dn */
export async function createNhpAtom(body: {
  formKey: string;
  title: string;
  formType?: "DOMAIN" | "MODULE";
  dictKey?: string;
  hostType?: "DONOR" | "RECIPIENT";
}): Promise<NhpFormTemplate> {
  return authHttp.post<Result<NhpFormTemplate>>("/nhp/templates/atom", body).then(({ data }) => data.data);
}

/** 组合：按数据域钉原子版本并快照章节 */
export async function composeNhpTemplate(body: {
  formKey: string;
  title: string;
  atoms: { atomCode: string; atomFormId?: number }[];
}): Promise<NhpFormTemplate> {
  return authHttp.post<Result<NhpFormTemplate>>("/nhp/templates/compose", body).then(({ data }) => data.data);
}

export async function generateFromDict(
  formKey: string,
  title: string,
  dictKey?: string,
): Promise<NhpFormTemplate> {
  return authHttp
    .post<Result<NhpFormTemplate>>("/nhp/templates/generate", {
      formKey,
      title,
      ...(dictKey ? { dictKey } : {}),
    })
    .then(({ data }) => data.data);
}

export async function publishNhpTemplate(
  formKey: string,
  hostType?: "DONOR" | "RECIPIENT",
): Promise<NhpTemplateListItem | void> {
  return authHttp
    .post<Result<NhpTemplateListItem>>(`/nhp/templates/${formKey}/publish`, hostType ? { hostType } : {})
    .then(({ data }) => data.data);
}

/** 解冻（FROZEN→DRAFT）；无活跃填写实例且原子无组合钉住时可解冻 */
export async function unfreezeNhpTemplate(formKey: string): Promise<NhpTemplateListItem> {
  return authHttp
    .post<Result<NhpTemplateListItem>>(`/nhp/templates/${encodeURIComponent(formKey)}/unfreeze`)
    .then(({ data }) => data.data);
}

/** 恢复已归档版本为已发布（ARCHIVED→FROZEN，不进入草稿编辑态） */
export async function restoreNhpTemplateArchived(formKey: string): Promise<NhpTemplateListItem> {
  return authHttp
    .post<Result<NhpTemplateListItem>>(`/nhp/templates/${encodeURIComponent(formKey)}/restore-archived`)
    .then(({ data }) => data.data);
}

export async function createNhpTemplateDraft(formKey: string): Promise<NhpFormTemplate> {
  return authHttp
    .post<Result<NhpFormTemplate>>(`/nhp/templates/${formKey}/draft`)
    .then(({ data }) => data.data);
}

/** 复制模板到团队名下（body.teamId 空则复制为 _COPY） */
export async function copyNhpTemplate(formKey: string, teamId?: number | null): Promise<NhpFormTemplate> {
  return authHttp
    .post<Result<NhpFormTemplate>>(`/nhp/templates/${encodeURIComponent(formKey)}/copy`, teamId ? { teamId } : {})
    .then(({ data }) => data.data);
}

/** 新建空白组合模板草稿（v1 DRAFT，首存即落库） */
export async function createNhpCompositeDraft(title = "新建组合模板"): Promise<NhpFormTemplate> {
  const formKey = `nhp-crftpl-${Date.now().toString(36)}`;
  return saveNhpTemplate(formKey, { formKey, title, sections: [] });
}

/** 一键导入内置种子：猪字典字段 + 45 域原子（DRAFT MODULE + 题目模板）；不生成组合模板 */
export interface NhpBuiltinSeedImportResult {
  dictionary: Awaited<ReturnType<typeof reimportPigDictionary>>;
  atoms: Awaited<ReturnType<typeof seedNhpAtoms>>;
}

export async function importNhpBuiltinSeedTemplates(): Promise<NhpBuiltinSeedImportResult> {
  const dictionary = await reimportPigDictionary();
  const atoms = await seedNhpAtoms();
  return { dictionary, atoms };
}

/** 表单发布页导入成功摘要 */
export function formatBuiltinSeedImportToast(r: NhpBuiltinSeedImportResult): string {
  const d = r.dictionary;
  const inserted = d.fieldsInserted ?? 0;
  const updated = d.fieldsUpdated ?? 0;
  const frozen = d.fieldsFrozen ?? 0;
  const revived = d.fieldsRevived ?? 0;
  const atomSeed = r.atoms.atoms ?? 0;
  const regenerated = d.atomsRegenerated ?? [];
  const fieldPart =
    `猪字典字段：新增 ${inserted}、复活 ${revived}、更新 ${updated}、冻结 ${frozen}` +
    (d.structureRebuilt ? "；大纲已重建" : "");
  const atomPart =
    atomSeed > 0
      ? `内置原子模板 ${atomSeed} 个（DRAFT，含题目）`
      : regenerated.length > 0
        ? `补生成域原子 ${regenerated.join("、")}`
        : "原子模板已就绪（幂等，无新增）";
  return (
    `【导入完成】${fieldPart}。${atomPart}。` +
    "请在「含草稿」中查看各原子模板，编辑后逐一手动发布。需要组合表单时点「＋ 去发布」创建空白组合草稿。"
  );
}

/** 软删单个模板版本（原子或组合）；填写实例引用或原子被组合钉住时 409 */
export async function deleteNhpTemplateVersion(formId: number): Promise<{
  formId: number;
  formKey: string;
  version?: number;
  kind?: string;
  deleted?: boolean;
}> {
  return authHttp
    .delete<Result<{ formId: number; formKey: string; version?: number; kind?: string; deleted?: boolean }>>(
      `/nhp/templates/by-id/${formId}`,
    )
    .then(({ data }) => data.data);
}

/** 软删某 formKey 下全部活跃版本；被引用的跳过并在 message/blocked 中说明 */
export async function deleteNhpTemplateAllVersions(formKey: string): Promise<{
  formKey: string;
  deletedCount: number;
  blocked?: string[];
}> {
  return authHttp
    .delete<Result<{ formKey: string; deletedCount: number; blocked?: string[] }>>(
      `/nhp/templates/${encodeURIComponent(formKey)}`,
    )
    .then(({ data }) => data.data);
}

/** 批量软删模板（按 formKey 删全部活跃版本）；被引用版本跳过并汇总 */
export async function batchDeleteNhpTemplates(formKeys: string[]): Promise<{
  deletedCount: number;
  deletedKeys?: string[];
  blocked?: string[];
}> {
  return authHttp
    .post<Result<{ deletedCount: number; deletedKeys?: string[]; blocked?: string[] }>>(
      "/nhp/templates/actions/batch-delete",
      { formKeys },
    )
    .then(({ data }) => data.data);
}

/** 强制软删无填写实例的系统种子/重组升版组合，解除原子钉住 */
export async function cleanupNhpSeedComposites(): Promise<{
  deletedCount: number;
  skipped?: string[];
  message?: string;
}> {
  return authHttp
    .post<Result<{ deletedCount: number; skipped?: string[] }>>(
      "/nhp/templates/actions/cleanup-seed-composites",
    )
    .then(({ data }) => ({
      ...data.data,
      message: data.message,
    }));
}

/** 检测套内有 FROZEN 字段却无活跃原子的域；默认一键从字典补生成 */
export async function ensureMissingAtomsFromDict(
  dictKey = "pig",
  generate = true,
): Promise<{
  dictKey?: string;
  missingAtomDomains?: string[];
  missingCount?: number;
  atomsRegenerated?: string[];
  atomsFailed?: { domain?: string; message?: string }[];
  generated?: boolean;
}> {
  const q = new URLSearchParams({
    dictKey,
    generate: String(generate),
  });
  return authHttp
    .post<
      Result<{
        dictKey?: string;
        missingAtomDomains?: string[];
        missingCount?: number;
        atomsRegenerated?: string[];
        atomsFailed?: { domain?: string; message?: string }[];
        generated?: boolean;
      }>
    >(`/nhp/templates/actions/ensure-missing-atoms?${q.toString()}`)
    .then(({ data }) => data.data ?? {});
}
