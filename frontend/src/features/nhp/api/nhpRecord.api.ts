/**
 * NHP 数据采集 API 层。
 *
 * 对接后端 NhpRecordController：动物/表单实例/EAV 值/状态/快照。
 * 经 authHttp（baseURL `/api`）解包 Result<T>。
 */
import { authHttp } from "@/api/core/authHttp";

interface Result<T> {
  code: number;
  success: boolean;
  message?: string;
  data: T;
}

/** 动物研究对象（供体 DONOR / 受体 RECIPIENT） */
export interface NhpSubject {
  id: number;
  studyId: number;
  subjectType: string;
  subjectCode: string;
  centerId?: number;
  dagId?: number;
  basicJson?: string;
  /** 身份标识 */
  sex?: string;
  birthDate?: string;
  species?: string;
  breed?: string;
  weightKg?: number;
  ageYears?: number;
  externalId?: string;
  microchipId?: string;
  farmCode?: string;
  originNote?: string;
  biocontainmentLevel?: string;
  pedigree?: string;
  status: string;
}

export type NhpSubjectIdentityInput = {
  sex?: string;
  birthDate?: string;
  species?: string;
  breed?: string;
  weightKg?: number | string;
  ageYears?: number | string;
  externalId?: string;
  microchipId?: string;
  farmCode?: string;
  originNote?: string;
  biocontainmentLevel?: string;
  pedigree?: string;
  centerId?: number;
  dagId?: number;
  basicJson?: unknown;
};

/** 表单实例 */
export interface NhpRecord {
  id: number;
  subjectId: number;
  formId: number;
  formVersionId?: number;
  visitInstanceId?: number;
  transplantId?: number;
  status: string;
  dagId?: number;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** 审计日志条目 */
export interface NhpAuditEntry {
  id: number;
  recordId: number;
  fieldId?: number;
  fieldCode?: string;
  fieldName?: string;
  changeType: string;
  beforeValue?: string;
  afterValue?: string;
  operatorId?: string;
  /** 操作人展示名（UserDisplayNameService） */
  operatorName?: string;
  changeReason?: string;
  createdAt?: string;
}

/** 快照元数据（轻量列表不含 dataJson） */
export interface NhpSnapshotMeta {
  id: number;
  recordId: number;
  versionNo: number;
  stage: string;
  bizStage?: string;
  formId?: number;
  note?: string;
  createdBy?: string;
  /** 创建人展示名（UserDisplayNameService） */
  createdByName?: string;
  createdAt?: string;
  dataJson?: string;
}

/**
 * 登记动物（供体 DONOR / 受体 RECIPIENT）。
 * subjectCode 为用户自定义展示编号（必填）；服务端不再静默取号。
 */
export async function createNhpSubject(body: {
  subjectType: string;
  subjectCode: string;
  centerCode?: string;
  studyId?: number;
  studyCode?: string;
  centerId?: number;
} & NhpSubjectIdentityInput): Promise<NhpSubject> {
  return authHttp.post<Result<NhpSubject>>("/nhp/subjects", body).then(({ data }) => data.data);
}

/** 表单化登记第一步：创建占位研究对象（subjectCode=PEND- 临时号） */
export async function createPlaceholderNhpSubject(subjectType: string): Promise<NhpSubject> {
  return authHttp
    .post<Result<NhpSubject>>("/nhp/subjects/placeholder", { subjectType })
    .then(({ data }) => data.data);
}

/** 表单化登记第二步：D1/D2 保存后回填真实编号与身份字段 */
export async function finalizeNhpSubject(
  subjectId: number,
  body: NhpSubjectIdentityInput & { subjectCode: string; centerCode?: string },
): Promise<NhpSubject> {
  return authHttp
    .post<Result<NhpSubject>>(`/nhp/subjects/${subjectId}/finalize`, body)
    .then(({ data }) => data.data);
}

/** 登记项目：仅建项目（crf_transplant），对象在保存 D1/D2 表单时才创建 */
export async function createNhpProject(opts?: { createdBy?: string }): Promise<{
  project: { id: number; txCode?: string | null; status?: string; donorSubjectId?: number | null; recipientSubjectId?: number | null; lifecycleStage?: string | null; createdBy?: string | null; createdAt?: string | null };
}> {
  return authHttp
    .post<
      Result<{
        project: { id: number; txCode?: string | null; status?: string; donorSubjectId?: number | null; recipientSubjectId?: number | null; lifecycleStage?: string | null; createdBy?: string | null; createdAt?: string | null };
      }>
    >("/nhp/projects", opts ?? {})
    .then(({ data }) => data.data);
}

/** 项目化建实例：为宿主表单建一条未绑定对象的记录（保存时才建研究对象） */
export async function createNhpRecordForProject(projectId: number, formId: number): Promise<NhpRecord> {
  return authHttp
    .post<Result<NhpRecord>>(`/nhp/projects/${projectId}/records`, { formId })
    .then(({ data }) => data.data);
}

/** 按需创建研究对象：记录尚无对象时据 hostType 建供体/受体对象并回链 */
export async function ensureSubjectForRecord(recordId: number): Promise<NhpSubject> {
  return authHttp
    .post<Result<NhpSubject>>(`/nhp/records/${recordId}/ensure-subject`)
    .then(({ data }) => data.data);
}

/** 项目（crf_transplant，含供体/受体对象） */
export interface NhpProject {
  id: number;
  txCode?: string | null;
  status?: string;
  lifecycleStage?: string | null;
  txDate?: string | null;
  createdBy?: string | null;
  createdAt?: string | null;
  donor?: NhpSubject | null;
  recipient?: NhpSubject | null;
}

/** 项目管理：列出全部项目（含供体/受体） */
export async function fetchNhpProjects(): Promise<NhpProject[]> {
  return authHttp.get<Result<NhpProject[]>>("/nhp/projects").then(({ data }) => data.data ?? []);
}

/** 更新动物（含身份标识；需 ADMIN+） */
export async function updateNhpSubject(
  subjectId: number,
  body: NhpSubjectIdentityInput,
): Promise<NhpSubject> {
  return authHttp
    .put<Result<NhpSubject>>(`/nhp/subjects/${subjectId}`, body)
    .then(({ data }) => data.data);
}

/** 推进动物生命周期阶段（SCREENING→MATCHING→POST_TX→ENDPOINT） */
export async function advanceNhpStage(subjectId: number, targetStage: string): Promise<NhpSubject> {
  return authHttp
    .post<Result<NhpSubject>>(`/nhp/subjects/${subjectId}/advance-stage`, { targetStage })
    .then(({ data }) => data.data);
}

/** 软删除动物（RETIRED）；有实例时传 cascade */
export async function deleteNhpSubject(subjectId: number, cascade = false): Promise<void> {
  await authHttp.delete<Result<void>>(`/nhp/subjects/${subjectId}`, {
    params: { cascade },
  });
}

/** 软删除表单实例（DELETED） */
export async function deleteNhpRecord(recordId: number): Promise<void> {
  await authHttp.delete<Result<void>>(`/nhp/records/${recordId}`);
}

/** 创建表单实例 */
export async function createNhpRecord(subjectId: number, formId: number): Promise<NhpRecord> {
  return authHttp
    .post<Result<NhpRecord>>(`/nhp/subjects/${subjectId}/records`, { formId })
    .then(({ data }) => data.data);
}

/** 批量 upsert 字段值（EAV，字段用 fieldCode 定位） */
export async function upsertNhpValues(
  recordId: number,
  values: { fieldCode: string; value: unknown; collectedAt?: string }[],
  operatorId?: string,
): Promise<void> {
  await authHttp.put<Result<void>>(`/nhp/records/${recordId}/values`, { values, operatorId });
}

/** 动物详情 + 记录树 */
export async function fetchNhpSubjectDetail(subjectId: number): Promise<{
  subject: NhpSubject;
  records: NhpRecord[];
  [key: string]: unknown;
}> {
  return authHttp
    .get<Result<{ subject: NhpSubject; records: NhpRecord[] } & Record<string, unknown>>>(`/nhp/subjects/${subjectId}`)
    .then(({ data }) => data.data);
}

/** 表单实例详情（含值） */
export async function fetchNhpRecordDetail(recordId: number): Promise<{
  record: NhpRecord;
  subject: NhpSubject | null;
  values: Record<string, unknown>;
  snapshotCount: number;
}> {
  return authHttp
    .get<
      Result<{
        record: NhpRecord;
        subject: NhpSubject | null;
        values: Record<string, unknown>;
        snapshotCount: number;
      }>
    >(`/nhp/records/${recordId}`)
    .then(({ data }) => data.data);
}

/** 更新记录状态（COMPLETE/LOCKED 自动打快照） */
export async function updateNhpRecordStatus(
  recordId: number,
  body: { status: string; operatorId?: string; bizStage?: string; note?: string },
): Promise<NhpRecord> {
  return authHttp
    .put<Result<NhpRecord>>(`/nhp/records/${recordId}/status`, body)
    .then(({ data }) => data.data);
}

/** 审计日志 */
export async function fetchNhpAudit(recordId: number): Promise<NhpAuditEntry[]> {
  return authHttp
    .get<Result<NhpAuditEntry[]>>(`/nhp/records/${recordId}/audit`)
    .then(({ data }) => data.data ?? []);
}

/** 快照列表 */
export async function fetchNhpSnapshots(recordId: number): Promise<NhpSnapshotMeta[]> {
  return authHttp
    .get<Result<NhpSnapshotMeta[]>>(`/nhp/records/${recordId}/snapshots`)
    .then(({ data }) => data.data ?? []);
}

/** 创建快照 */
export async function createNhpSnapshot(
  recordId: number,
  body?: { operatorId?: string; bizStage?: string; note?: string },
): Promise<NhpSnapshotMeta> {
  return authHttp
    .post<Result<NhpSnapshotMeta>>(`/nhp/records/${recordId}/snapshots`, body ?? {})
    .then(({ data }) => data.data);
}

/** 快照详情（含 dataJson） */
export async function fetchNhpSnapshot(recordId: number, snapshotId: number): Promise<NhpSnapshotMeta> {
  return authHttp
    .get<Result<NhpSnapshotMeta>>(`/nhp/records/${recordId}/snapshots/${snapshotId}`)
    .then(({ data }) => data.data);
}

/** 回退到目标快照（覆盖当前值，状态回 DRAFT） */
export async function rollbackNhpSnapshot(
  recordId: number,
  snapshotId: number,
  body?: { operatorId?: string; bizStage?: string; note?: string },
): Promise<{
  record: NhpRecord;
  values: Record<string, unknown>;
  snapshotCount: number;
  restoredVersionNo: number;
}> {
  return authHttp
    .post<
      Result<{
        record: NhpRecord;
        values: Record<string, unknown>;
        snapshotCount: number;
        restoredVersionNo: number;
      }>
    >(`/nhp/records/${recordId}/snapshots/${snapshotId}/rollback`, body ?? {})
    .then(({ data }) => data.data);
}

export interface NhpRecordListItem {
  record: NhpRecord;
  subject: NhpSubject | null;
  formCode?: string;
  formName?: string;
}

export interface NhpPageResult<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}

/** 表单实例分页列表 */
export async function fetchNhpRecords(params?: {
  status?: string;
  subjectId?: number;
  q?: string;
  page?: number;
  size?: number;
}): Promise<NhpPageResult<NhpRecordListItem>> {
  return authHttp
    .get<Result<NhpPageResult<NhpRecordListItem>>>("/nhp/records", { params })
    .then(({ data }) => data.data ?? { items: [], total: 0, page: 1, size: 20 });
}

/** 动物分页列表 */
export async function fetchNhpSubjects(params?: {
  subjectType?: string;
  status?: string;
  q?: string;
  page?: number;
  size?: number;
}): Promise<NhpPageResult<NhpSubject>> {
  return authHttp
    .get<Result<NhpPageResult<NhpSubject>>>("/nhp/subjects", { params })
    .then(({ data }) => data.data ?? { items: [], total: 0, page: 1, size: 20 });
}

/** 双录入二录 */
export async function submitNhpDoubleEntry(
  recordId: number,
  body: { values: { fieldCode: string; value: unknown }[]; operatorId?: string; replace?: boolean },
): Promise<{ saved: number }> {
  return authHttp
    .post<Result<{ saved: number }>>(`/nhp/records/${recordId}/double-entry`, body)
    .then(({ data }) => data.data);
}

/** 两录比对 */
export async function compareNhpDoubleEntry(recordId: number): Promise<{
  match: boolean;
  diffCount: number;
  firstCount: number;
  secondCount: number;
  diffs: { fieldCode: string; first: unknown; second: unknown }[];
}> {
  return authHttp.get<Result<{
    match: boolean;
    diffCount: number;
    firstCount: number;
    secondCount: number;
    diffs: { fieldCode: string; first: unknown; second: unknown }[];
  }>>(`/nhp/records/${recordId}/compare`).then(({ data }) => data.data);
}

/** 二录值 map */
export async function fetchNhpSecondValues(recordId: number): Promise<Record<string, unknown>> {
  return authHttp
    .get<Result<Record<string, unknown>>>(`/nhp/records/${recordId}/values/second`)
    .then(({ data }) => data.data ?? {});
}

export interface NhpQueryItem {
  id: number;
  recordId: number;
  fieldId?: number;
  queryText: string;
  status: string;
  openedBy?: string;
  /** 发起人展示名（UserDisplayNameService） */
  openedByName?: string;
  openedAt?: string;
  answeredBy?: string;
  /** 回复人展示名（UserDisplayNameService） */
  answeredByName?: string;
  answeredAt?: string;
  answerText?: string;
}

export async function fetchNhpQueries(recordId: number): Promise<NhpQueryItem[]> {
  return authHttp
    .get<Result<NhpQueryItem[]>>(`/nhp/records/${recordId}/queries`)
    .then(({ data }) => data.data ?? []);
}

export async function createNhpQuery(body: {
  recordId: number;
  fieldId?: number;
  queryText: string;
  openedBy?: string;
}): Promise<NhpQueryItem> {
  return authHttp.post<Result<NhpQueryItem>>("/nhp/queries", body).then(({ data }) => data.data);
}

export async function answerNhpQuery(
  id: number,
  body: { answerText: string; answeredBy?: string },
): Promise<NhpQueryItem> {
  return authHttp.put<Result<NhpQueryItem>>(`/nhp/queries/${id}/answer`, body).then(({ data }) => data.data);
}

export async function closeNhpQuery(id: number, body?: { closedBy?: string }): Promise<NhpQueryItem> {
  return authHttp.put<Result<NhpQueryItem>>(`/nhp/queries/${id}/close`, body ?? {}).then(({ data }) => data.data);
}

/** 电子签署 */
export async function signNhpRecord(
  recordId: number,
  body?: { operatorId?: string; meaning?: string; note?: string },
): Promise<unknown> {
  return authHttp
    .post<Result<unknown>>(`/nhp/records/${recordId}/sign`, body ?? {})
    .then(({ data }) => data.data);
}

