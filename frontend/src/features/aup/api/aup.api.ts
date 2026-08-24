/**
 * IACUC AUP 模块前端 API 层。
 *
 * 覆盖《2026-08-14-IACUC-AUP-实现落地清单》§5 全部端点。
 * 后端统一响应包装 Result<T>：{ code, success, message, data }。
 *
 * 走 authHttp（baseURL `/api`），其响应拦截器已对 `success === false` / `code !== 200`
 * 统一抛 Error；故此处用 `.then(({ data }) => data.data)` 解包即可（与 report-form 模块一致）。
 * 乐观锁冲突/非法流转返回 HTTP 409，由拦截器转为 Error（message 来自后端 message 字段）。
 */

import { authHttp } from "@/api/core/authHttp";

import type { FormSection } from "@/features/aup/schema/formTemplate";
import type {
  AupAttachment,
  AupAttachmentUpload,
  AupDetailVO,
  AupListItem,
  AupPrintData,
  AupSnapshot,
  AupSnapshotMeta,
  AupStage,
  AupTrace,
  DraftSource,
  ReviewForm,
} from "@/features/aup/schema/aup";
import type {
  Expert,
  FormatReviewItemInput,
  ReviewItem,
  ReviewProgress,
  ReviewTodoItem,
  ReviewerConfig,
  ReviewerConfigRequest,
  ReviewVerdict,
  VoteRequest,
} from "@/features/aup/schema/review";

/** 统一响应包装（与后端 Result<T> 对齐） */
interface Result<T> {
  code: number;
  success: boolean;
  message?: string;
  data: T;
}

/** 分页结果（列表类端点通用） */
export interface AupPage<T> {
  total: number;
  items: T[];
}

/* =====================================================================
 * 5.1 计划书
 * ================================================================== */

export interface AupListParams {
  page?: number;
  size?: number;
  keyword?: string;
  registerNo?: string;
  stage?: AupStage;
  /** 排除某个阶段（如未通过 tab 排除 approved） */
  excludeStage?: AupStage;
  /** 排除多个阶段（逗号分隔传参，如 approved,expired） */
  excludeStages?: AupStage[];
  /** 课题组名称（学生端按课题组查本组的计划书） */
  projectGroupName?: string;
  /** 排除草稿（后台列表不显示未提交的草稿） */
  excludeDraft?: boolean;
  draftSource?: DraftSource;
  roundNo?: number;
  /** 提交人（申请人 userId） */
  submitterId?: string;
  /** 审核人（被分配专家或留痕 actor 的 userId） */
  reviewerId?: string;
  /** 提交人姓名（模糊匹配） */
  submitterName?: string;
  /** 审核人姓名（模糊匹配） */
  reviewerName?: string;
  /** 只看与我相关（我是提交人 / 组长PI / 被分配专家 / 留痕操作人） */
  relatedToMe?: boolean;
  /** 学生端：强制按课题组或本人范围过滤（忽略管理员全量可见） */
  groupScopeOnly?: boolean;
  sortBy?: string;
  sortDir?: "asc" | "desc";
}

/** GET /aup/list */
export function fetchAupList(params: AupListParams = {}): Promise<AupPage<AupListItem>> {
  const { excludeStages, ...rest } = params;
  const query = {
    ...rest,
    ...(excludeStages?.length ? { excludeStages: excludeStages.join(",") } : {}),
  };
  return authHttp.get<Result<AupPage<AupListItem>>>("/aup/list", { params: query }).then(({ data }) => data.data);
}

/** GET /aup/project-groups —— 列表筛选用去重课题组名称 */
export function fetchAupProjectGroups(): Promise<string[]> {
  return authHttp.get<Result<string[]>>("/aup/project-groups").then(({ data }) => data.data);
}

export interface CreateAupBody {
  /** 可空，后端取当前 PUBLISHED */
  templateVersion?: string;
}

export interface CreateAupResult {
  id: string;
  registerNo?: string;
  currentStage: AupStage;
  templateVersion?: string;
}

/** POST /aup —— 新建草稿 */
export function createAup(body: CreateAupBody = {}): Promise<CreateAupResult> {
  return authHttp.post<Result<CreateAupResult>>("/aup", body).then(({ data }) => data.data);
}

/** ARO 同步摘要 */
export interface AupSyncResult {
  total: number;
  inserted: number;
  updated: number;
  reviewCount: number;
  failed: number;
}

/** 管理员手动触发：从 ARO 全量同步计划书（正文 + 状态 + 评审记录）。 */
export function syncAupFromAro(): Promise<AupSyncResult> {
  return authHttp.post<Result<AupSyncResult>>("/aup/sync-from-aro").then(({ data }) => data.data);
}

/** GET /aup/{id} */
export function fetchAupDetail(id: string): Promise<AupDetailVO> {
  return authHttp.get<Result<AupDetailVO>>(`/aup/${id}`).then(({ data }) => data.data);
}

export interface SaveAupBody {
  /** 整表填报内容 JSON 字符串 */
  dataJson: string;
  /** 乐观锁版本（CAS） */
  expectedVersion: number;
}

export interface SaveAupResult {
  id: string;
  version: number;
}

/** PUT /aup/{id} —— 保存草稿（乐观锁；非 draft 返回 403 只读） */
export function saveAup(id: string, body: SaveAupBody): Promise<SaveAupResult> {
  return authHttp.put<Result<SaveAupResult>>(`/aup/${id}`, body).then(({ data }) => data.data);
}

/** PUT /aup/{id}/autosave —— 自动保存（防抖、幂等，同 PUT 语义） */
export function autosaveAup(id: string, body: SaveAupBody): Promise<SaveAupResult> {
  return authHttp.put<Result<SaveAupResult>>(`/aup/${id}/autosave`, body).then(({ data }) => data.data);
}

export interface StageChangeResult {
  id: string;
  currentStage: AupStage;
}

/** POST /aup/{id}/submit —— 校验 + 签名 + CAS 流转 draft→piReview */
export function submitAup(id: string): Promise<StageChangeResult> {
  return authHttp.post<Result<StageChangeResult>>(`/aup/${id}/submit`).then(({ data }) => data.data);
}

/** 结构化校验错误（提交前预检用） */
export interface AupValidationError {
  fieldKey: string;
  code: string;
  message: string;
  rowIndex?: number;
}

/** GET /aup/{id}/validate —— 提交前预检，返回结构化错误（空数组 = 可提交） */
export function fetchAupValidate(id: string): Promise<AupValidationError[]> {
  return authHttp.get<Result<AupValidationError[]>>(`/aup/${id}/validate`).then(({ data }) => data.data);
}

/** POST /aup/{id}/restore-demo —— 恢复单条演示示例到内置种子态（仅管理员） */
export function restoreAupDemo(id: string): Promise<void> {
  return authHttp.post<Result<void>>(`/aup/${id}/restore-demo`).then(() => undefined);
}

/** POST /aup/demo/reseed —— 重新生成演示示例（补齐缺失 demo 计划书，幂等） */
export function reseedAupDemo(): Promise<{ ok: boolean }> {
  return authHttp.post<Result<{ ok: boolean }>>("/aup/demo/reseed").then(({ data }) => data.data);
}

/** DELETE /aup/{id} —— 删除草稿状态计划书（申请人本人或管理员） */
export function deleteAup(id: string): Promise<void> {
  return authHttp.delete<Result<void>>(`/aup/${id}`).then(() => undefined);
}

/** POST /aup/batch-delete —— 批量删除计划书；selectAll=true 时按筛选条件全删（含未加载分页） */
export function batchDeleteAup(
  body: { selectAll?: boolean; ids?: number[] } & Partial<AupListParams>,
): Promise<{ deletedCount: number; failed: { id: number; reason: string }[] }> {
  return authHttp
    .post<Result<{ deletedCount: number; failed: { id: number; reason: string }[] }>>("/aup/batch-delete", body)
    .then(({ data }) => data.data);
}

/** POST /aup/{id}/unlock —— 解锁锁定终态（仅管理员），terminated/approved/expired → draft 返修 */
export function unlockAup(id: string): Promise<StageChangeResult> {
  return authHttp.post<Result<StageChangeResult>>(`/aup/${id}/unlock`).then(({ data }) => data.data);
}

/** POST /aup/{id}/renew —— 续期（expired 后基于旧计划书新建草稿，引用原注册号、结转未用动物数） */
export function renewAup(id: string): Promise<CreateAupResult> {
  return authHttp.post<Result<CreateAupResult>>(`/aup/${id}/renew`).then(({ data }) => data.data);
}

/** GET /aup/{id}/snapshots —— 轻量列表（不返 data） */
export function fetchAupSnapshots(id: string): Promise<AupSnapshotMeta[]> {
  return authHttp.get<Result<AupSnapshotMeta[]>>(`/aup/${id}/snapshots`).then(({ data }) => data.data);
}

/** GET /aup/{id}/snapshots/{snapId} —— 单快照完整 data（回退前预览） */
export function fetchAupSnapshot(id: string, snapshotId: number): Promise<AupSnapshot> {
  return authHttp.get<Result<AupSnapshot>>(`/aup/${id}/snapshots/${snapshotId}`).then(({ data }) => data.data);
}

/** POST /aup/{id}/snapshots/{snapId}/rollback —— 回退到目标快照 */
export function rollbackAupSnapshot(id: string, snapshotId: number): Promise<StageChangeResult> {
  return authHttp.post<Result<StageChangeResult>>(`/aup/${id}/snapshots/${snapshotId}/rollback`).then(({ data }) => data.data);
}

/** GET /aup/{id}/traces —— 留痕（倒序） */
export function fetchAupTraces(id: string): Promise<AupTrace[]> {
  return authHttp.get<Result<AupTrace[]>>(`/aup/${id}/traces`).then(({ data }) => data.data);
}

/** GET /aup/{id}/print-data —— 打印数据（供前端渲染 PDF） */
export function fetchAupPrintData(id: string): Promise<AupPrintData> {
  return authHttp.get<Result<AupPrintData>>(`/aup/${id}/print-data`).then(({ data }) => data.data);
}

/* =====================================================================
 * 5.2 模板
 * ================================================================== */

export type TemplateStatus = "DRAFT" | "PENDING_REVIEW" | "PUBLISHED" | "ARCHIVED";

/** 版本列表项（GET /aup-template），对齐 TemplateVersionVO */
export interface TemplateVersionVO {
  id: number;
  formKey: string;
  /** PROTOCOL / ATOM / COMPOSITE */
  kind?: string;
  folderId?: number;
  name: string;
  description?: string;
  version: number;
  status: TemplateStatus;
  publishedAt?: string;
  submittedAt?: string;
  reviewComment?: string;
  updatedAt?: string;
  updatedBy?: string;
}

/** 版本简要（版本历史 / 新建草稿 / 发布响应），对齐 TemplateVersionBriefVO */
export interface TemplateVersionBriefVO {
  id: number;
  kind?: string;
  version: number;
  status: TemplateStatus;
  publishedAt?: string;
}

/** 模板完整结构（GET /aup-template/published、resolve、{id}），对齐 TemplateDetailVO */
export interface TemplateDetailVO {
  id: number;
  formKey: string;
  kind?: string;
  folderId?: number;
  name: string;
  version: number;
  status: TemplateStatus;
  description?: string;
  publishedAt?: string;
  submittedAt?: string;
  reviewComment?: string;
  updatedAt?: string;
  sections: FormSection[];
}

export interface CreateTemplateBody {
  formKey: string;
  name: string;
}

/** 整树快照式保存请求（PUT /aup-template/{id}），对齐 TemplateSaveRequest */
export interface UpdateTemplateBody {
  name: string;
  description?: string;
  sections: FormSection[];
}

/** GET /aup-template —— 版本列表（含 DRAFT/PENDING_REVIEW/PUBLISHED/ARCHIVED；kind 默认 PROTOCOL） */
export function fetchAupTemplates(): Promise<TemplateVersionVO[]> {
  return authHttp.get<Result<TemplateVersionVO[]>>("/aup-template").then(({ data }) => data.data);
}

/** GET /aup-template?kind= —— 按 kind 取版本列表（PROTOCOL / ATOM / COMPOSITE） */
export function fetchAupTemplatesByKind(kind: string): Promise<TemplateVersionVO[]> {
  return authHttp.get<Result<TemplateVersionVO[]>>("/aup-template", { params: { kind } }).then(({ data }) => data.data);
}

/** GET /aup-template/published —— 当前 PUBLISHED 版本结构（新填页用；未发布返回 null；kind 默认 PROTOCOL） */
export function fetchPublishedTemplate(formKey: string, kind?: string): Promise<TemplateDetailVO | null> {
  return authHttp.get<Result<TemplateDetailVO | null>>("/aup-template/published", { params: { formKey, kind } }).then(
    ({ data }) => data.data
  );
}

/** GET /aup-template/resolve —— 按版本反查结构（续填用） */
export function resolveTemplate(formKey: string, version: string): Promise<TemplateDetailVO> {
  return authHttp.get<Result<TemplateDetailVO>>("/aup-template/resolve", { params: { formKey, version } }).then(
    ({ data }) => data.data
  );
}

/** GET /aup-template/{id} —— 模板结构（sections/subsections/fields） */
export function fetchAupTemplateById(id: number): Promise<TemplateDetailVO> {
  return authHttp.get<Result<TemplateDetailVO>>(`/aup-template/${id}`).then(({ data }) => data.data);
}

/** GET /aup-template/{id}/versions —— 版本历史 */
export function fetchAupTemplateVersions(id: number): Promise<TemplateVersionBriefVO[]> {
  return authHttp.get<Result<TemplateVersionBriefVO[]>>(`/aup-template/${id}/versions`).then(({ data }) => data.data);
}

/** POST /aup-template —— 新建 DRAFT 版本（深拷贝上一 PUBLISHED） */
export function createAupTemplate(body: CreateTemplateBody): Promise<TemplateVersionBriefVO> {
  return authHttp.post<Result<TemplateVersionBriefVO>>("/aup-template", body).then(({ data }) => data.data);
}

/** PUT /aup-template/{id} —— 整树快照式保存（后端全量重建 + 差异审计） */
export function updateAupTemplate(id: number, body: UpdateTemplateBody): Promise<TemplateDetailVO> {
  return authHttp.put<Result<TemplateDetailVO>>(`/aup-template/${id}`, body).then(({ data }) => data.data);
}

/** POST /aup-template/{id}/publish —— 发布版本 */
export function publishAupTemplate(id: number): Promise<TemplateVersionBriefVO> {
  return authHttp.post<Result<TemplateVersionBriefVO>>(`/aup-template/${id}/publish`).then(({ data }) => data.data);
}

/** POST /aup-template/{id}/archive —— 归档已发布版本 */
export function archiveAupTemplate(id: number): Promise<void> {
  return authHttp.post<Result<void>>(`/aup-template/${id}/archive`).then(() => undefined);
}

/** DELETE /aup-template/{id} —— 删除版本（含整树结构，任意状态可删） */
export function deleteAupTemplate(id: number): Promise<void> {
  return authHttp.delete<Result<never>>(`/aup-template/${id}`).then(({ data }) => data.data);
}

/** POST /aup-template/{id}/copy —— 复制版本为新的 DRAFT */
export function copyAupTemplate(id: number): Promise<TemplateVersionBriefVO> {
  return authHttp.post<Result<TemplateVersionBriefVO>>(`/aup-template/${id}/copy`).then(({ data }) => data.data);
}

/** PUT /aup-template/{id}/meta —— 仅更新名称/描述（不触碰结构树） */
export function updateAupTemplateMeta(id: number, body: { name: string; description?: string }): Promise<TemplateDetailVO> {
  return authHttp.put<Result<TemplateDetailVO>>(`/aup-template/${id}/meta`, body).then(({ data }) => data.data);
}

/* =====================================================================
 * 5.3 审查
 * ================================================================== */

export interface ReviewTodoParams {
  role: string;
  page?: number;
  size?: number;
}

/** GET /aup/review/todo —— 按角色返回待审 */
export function fetchReviewTodo(params: ReviewTodoParams): Promise<AupPage<ReviewTodoItem>> {
  return authHttp.get<Result<AupPage<ReviewTodoItem>>>("/aup/review/todo", { params }).then(({ data }) => data.data);
}

export interface FormatReviewBody {
  comment?: string;
  reviewForm?: ReviewForm;
  expertIds?: string[];
  /** 逐字段格式建议（非空 → 退回返修；空 → 通过并分配专家） */
  items?: FormatReviewItemInput[];
}

/** POST /aup/{id}/format-review —— 格式审查（approve 时选专家） */
export function submitFormatReview(id: string, body: FormatReviewBody): Promise<StageChangeResult> {
  return authHttp.post<Result<StageChangeResult>>(`/aup/${id}/format-review`, body).then(({ data }) => data.data);
}

export interface PiReviewBody {
  /** approve 通过进格式审查 / return 退回申请人 */
  action: "approve" | "return";
  /** 退回意见（return 时必填） */
  comment?: string;
}

/** POST /aup/{id}/pi-review —— 组长审核（approve 通过 / return 退回） */
export function submitPiReview(id: string, body: PiReviewBody): Promise<StageChangeResult> {
  return authHttp.post<Result<StageChangeResult>>(`/aup/${id}/pi-review`, body).then(({ data }) => data.data);
}

/** POST /aup/{id}/review —— 专家投票（幂等；逐字段意见） */
export function submitExpertReview(id: string, body: VoteRequest): Promise<StageChangeResult> {
  return authHttp.post<Result<StageChangeResult>>(`/aup/${id}/review`, body).then(({ data }) => data.data);
}

/** GET /aup/{id}/review/progress —— 投票进度 */
export function fetchReviewProgress(id: string): Promise<ReviewProgress> {
  return authHttp.get<Result<ReviewProgress>>(`/aup/${id}/review/progress`).then(({ data }) => data.data);
}

export interface ReviewItemsParams {
  roundNo?: number;
  fieldKey?: string;
}

export interface ReviewItemsSummary {
  reviewedCount: number;
  nonCompliantCount: number;
  suggestCount: number;
  totalFields: number;
}

export interface ReviewItemsResult {
  summary: ReviewItemsSummary;
  items: ReviewItem[];
}

/** GET /aup/{id}/review/items —— 逐字段评审意见（总览=不带 fieldKey；快捷入口=带 fieldKey） */
export function fetchReviewItems(id: string, params: ReviewItemsParams = {}): Promise<ReviewItemsResult> {
  return authHttp.get<Result<ReviewItemsResult>>(`/aup/${id}/review/items`, { params }).then(({ data }) => data.data);
}

/** 单次评审记录（一次专家投票 / 一次秘书格式审查 = 整体结论 + 逐字段意见） */
export interface ReviewSessionVO {
  /** 评审人 userId */
  reviewer: string;
  /** 评审人姓名（后端解析） */
  reviewerName?: string;
  /** secretary（格式）/ expert（内容） */
  role?: string;
  /** agree/disagree/modify/recuse/abstain（整体结论） */
  verdict: ReviewVerdict;
  /** 整体审核反馈 */
  comment?: string;
  roundNo: number;
  createdAt: string;
  /** 逐字段意见（整体同意/弃权/回避时可能为空） */
  items: ReviewItem[];
}

export interface ReviewSessionsResult {
  summary: ReviewItemsSummary;
  sessions: ReviewSessionVO[];
}

/** GET /aup/{id}/review/sessions —— 评审总览：全轮次每次评审记录（含整体同意/拒评/回避等无逐条批注的评审人） */
export function fetchReviewSessions(id: string): Promise<ReviewSessionsResult> {
  return authHttp.get<Result<ReviewSessionsResult>>(`/aup/${id}/review/sessions`).then(({ data }) => data.data);
}

/** GET /aup/experts —— 专家候选（供格式审查选择器） */
export function fetchExperts(): Promise<Expert[]> {
  return authHttp.get<Result<Expert[]>>("/aup/experts").then(({ data }) => data.data);
}

/** GET /aup/reviewer-config —— 后台名册配置读取 */
export function fetchReviewerConfig(): Promise<ReviewerConfig> {
  return authHttp.get<Result<ReviewerConfig>>("/aup/reviewer-config").then(({ data }) => data.data);
}

/** PUT /aup/reviewer-config —— 后台名册配置写入（全量替换，只传 userId 列表） */
export function updateReviewerConfig(body: ReviewerConfigRequest): Promise<void> {
  return authHttp.put<Result<void>>("/aup/reviewer-config", body).then(() => undefined);
}

/* =====================================================================
 * 5.4 字典
 * ================================================================== */

/** 码表状态机：DRAFT → PENDING_REVIEW → PUBLISHED（unfreeze 回 DRAFT） */
export type AupDictStatus = "DRAFT" | "PENDING_REVIEW" | "PUBLISHED";

export interface AupDictListParams {
  page?: number;
  size?: number;
  keyword?: string;
  /** 按分类筛选（NULL=未分类） */
  category?: string;
}

export interface AupDictListItem {
  id: number;
  dictKey: string;
  name: string;
  /** 分类（分组/文件夹；NULL=未分类） */
  category?: string;
  version?: number;
  status?: AupDictStatus;
  folderId?: number;
  /** LOCAL（本地维护）/ EXTERNAL（外部引用，只读） */
  source?: string;
  /** EXTERNAL 的源模块标识：projectGroup / ANIMAL_BREED / ANIMAL_STRAIN */
  sourceRef?: string;
  itemCount: number;
  refCount?: number;
  versionCount?: number;
}

export interface CreateDictBody {
  dictKey: string;
  name: string;
  category?: string;
  /** → aup_folder(owner_type=CODELIST)；NULL=未分类 */
  folderId?: number;
}

export interface AupDictItem {
  itemId: number;
  value: string;
  label: string;
  sortOrder?: number;
  /** CONFIRM / MODIFY / DELETE / QUESTION */
  verdict?: string;
  verdictNote?: string;
}

export interface AupDictDetail {
  id: number;
  dictKey: string;
  name: string;
  category?: string;
  version?: number;
  status?: AupDictStatus;
  folderId?: number;
  /** LOCAL（本地维护）/ EXTERNAL（外部引用，只读） */
  source?: string;
  /** EXTERNAL 的源模块标识：projectGroup / ANIMAL_BREED / ANIMAL_STRAIN */
  sourceRef?: string;
  publishedAt?: string;
  publishedBy?: string;
  reviewComment?: string;
  items: AupDictItem[];
}

export interface CreateDictItemBody {
  value: string;
  label: string;
  sortOrder?: number;
}

export interface UpdateDictItemBody {
  value: string;
  label: string;
}

/** GET /aup-dict —— 分页列表 */
export function fetchAupDicts(params: AupDictListParams = {}): Promise<AupPage<AupDictListItem>> {
  return authHttp.get<Result<AupPage<AupDictListItem>>>("/aup-dict", { params }).then(({ data }) => data.data);
}

/** POST /aup-dict —— 新建字典（后端返回 DictDetailVO） */
export function createAupDict(body: CreateDictBody): Promise<AupDictDetail> {
  return authHttp.post<Result<AupDictDetail>>("/aup-dict", body).then(({ data }) => data.data);
}

/** GET /aup-dict/{dictKey} —— 查字典 + 有序项（version 可选，按版本取） */
export function fetchAupDict(dictKey: string, version?: number): Promise<AupDictDetail> {
  return authHttp
    .get<Result<AupDictDetail>>(`/aup-dict/${dictKey}`, { params: version != null ? { version } : undefined })
    .then(({ data }) => data.data);
}

/** PUT /aup-dict/{dictKey} —— 改名（category 非空时一并更新分类；folderId 可迁移文件夹） */
export function updateAupDict(dictKey: string, body: { name: string; category?: string; folderId?: number }): Promise<void> {
  return authHttp.put<Result<void>>(`/aup-dict/${dictKey}`, body).then(() => undefined);
}

/** DELETE /aup-dict/{dictKey} —— 删字典（校验无字段引用） */
export function deleteAupDict(dictKey: string): Promise<void> {
  return authHttp.delete<Result<void>>(`/aup-dict/${dictKey}`).then(() => undefined);
}

/** POST /aup-dict/{dictKey}/items —— 新增项（后端返回 DictItemVO） */
export function createAupDictItem(dictKey: string, body: CreateDictItemBody): Promise<AupDictItem> {
  return authHttp.post<Result<AupDictItem>>(`/aup-dict/${dictKey}/items`, body).then(({ data }) => data.data);
}

/** PUT /aup-dict/{dictKey}/items/{itemId} —— 改项 */
export function updateAupDictItem(dictKey: string, itemId: number, body: UpdateDictItemBody): Promise<void> {
  return authHttp.put<Result<void>>(`/aup-dict/${dictKey}/items/${itemId}`, body).then(() => undefined);
}

/** DELETE /aup-dict/{dictKey}/items/{itemId} —— 删项 */
export function deleteAupDictItem(dictKey: string, itemId: number): Promise<void> {
  return authHttp.delete<Result<void>>(`/aup-dict/${dictKey}/items/${itemId}`).then(() => undefined);
}

/** PUT /aup-dict/{dictKey}/items/reorder —— 按序落 sort_order（itemIds 为 Long 数组） */
export function reorderAupDictItems(dictKey: string, itemIds: number[]): Promise<void> {
  return authHttp.put<Result<void>>(`/aup-dict/${dictKey}/items/reorder`, itemIds).then(() => undefined);
}

/* =====================================================================
 * 5.5 附件
 * ================================================================== */

/** POST /aup/{id}/attachments —— multipart 上传 */
export function uploadAupAttachment(id: string, file: File): Promise<AupAttachmentUpload> {
  const form = new FormData();
  form.append("file", file);
  return authHttp
    .post<Result<AupAttachmentUpload>>(`/aup/${id}/attachments`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    })
    .then(({ data }) => data.data);
}

/** GET /aup/{id}/attachments —— 列表 */
export function fetchAupAttachments(id: string): Promise<AupAttachment[]> {
  return authHttp.get<Result<AupAttachment[]>>(`/aup/${id}/attachments`).then(({ data }) => data.data);
}

export interface AttachmentDownload {
  blob: Blob;
  fileName: string;
}

/** GET /aup/attachments/{fileId}/download —— 下载（流 + Content-Disposition） */
export async function downloadAupAttachment(fileId: number): Promise<AttachmentDownload> {
  const res = await authHttp.get<Blob>(`/aup/attachments/${fileId}/download`, { responseType: "blob" });
  const blob = res.data;
  const disposition = (res.headers["content-disposition"] as string) ?? "";
  const match = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(disposition);
  const fileName = match ? decodeURIComponent(match[1]) : `attachment-${fileId}`;
  return { blob, fileName };
}

/** DELETE /aup/{id}/attachments/{fileId} —— 软删 + 审计 */
export function deleteAupAttachment(id: string, fileId: number): Promise<void> {
  return authHttp.delete<Result<void>>(`/aup/${id}/attachments/${fileId}`).then(() => undefined);
}

/* =====================================================================
 * 5.6 其他
 * ================================================================== */

export interface SignatureContext {
  email?: string;
  domainTrusted?: boolean;
  signatureRequired?: boolean;
}

/** GET /aup/signature-context —— 签名资格 */
export function fetchAupSignatureContext(): Promise<SignatureContext> {
  return authHttp.get<Result<SignatureContext>>("/aup/signature-context").then(({ data }) => data.data);
}

export interface AupMyRoles {
  isPi: boolean;
  isSecretary: boolean;
  isExpert: boolean;
}

/** GET /aup/my-roles —— 当前登录用户的 AUP 角色（组长/秘书/专家） */
export function fetchAupMyRoles(): Promise<AupMyRoles> {
  return authHttp.get<Result<AupMyRoles>>("/aup/my-roles").then(({ data }) => data.data);
}

export type PickerType = "person" | "department" | "cage" | "animal";

export interface PickerOption {
  value: string;
  label: string;
}

/** GET /aup/pickers/{type} —— 选择器数据源 */
export function fetchAupPickers(type: PickerType, params: Record<string, unknown> = {}): Promise<PickerOption[]> {
  return authHttp.get<Result<PickerOption[]>>(`/aup/pickers/${type}`, { params }).then(({ data }) => data.data);
}

/** GET /aup/project-group-options —— 课题组下拉（本地 project_group 字典，动态，value=id label=name） */
export function fetchAupProjectGroupOptions(): Promise<PickerOption[]> {
  return authHttp.get<Result<PickerOption[]>>("/aup/project-group-options").then(({ data }) => data.data);
}

export interface AupNotification {
  id: string;
  title?: string;
  content?: string;
  bizType?: string;
  bizId?: string;
  isRead?: boolean;
  createdAt?: string;
}

/** GET /aup/notifications —— AUP 通知列表（复用现有站内信结构） */
export function fetchAupNotifications(params: Record<string, unknown> = {}): Promise<AupPage<AupNotification>> {
  return authHttp.get<Result<AupPage<AupNotification>>>("/aup/notifications", { params }).then(({ data }) => data.data);
}

/** PUT /aup/notifications/{id}/read —— 标记已读 */
export function markAupNotificationRead(id: string): Promise<void> {
  return authHttp.put<Result<void>>(`/aup/notifications/${id}/read`).then(() => undefined);
}

/* =====================================================================
 * 5.7 配置工作台：文件夹 / 字段域 / 码表状态机 / 模板原子域 / 变更记录
 * ================================================================== */

/* ── 文件夹 /api/aup-folder ── */

/** 配置面文件夹树节点，对齐 AupFolderVO */
export interface AupFolderVO {
  id: number;
  /** CODELIST / FIELD / ATOM */
  ownerType?: string;
  parentId?: number;
  name: string;
  sortOrder?: number;
  description?: string;
  children?: AupFolderVO[];
}

/** 新建文件夹请求，对齐 AupFolderCreateRequest */
export interface AupFolderCreateRequest {
  /** CODELIST / FIELD / ATOM */
  ownerType?: string;
  parentId?: number;
  name: string;
  sortOrder?: number;
  description?: string;
}

/** 重命名/改排序请求，对齐 AupFolderUpdateRequest */
export interface AupFolderUpdateRequest {
  name?: string;
  sortOrder?: number;
  description?: string;
}

/** 换父节点请求，对齐 AupFolderMoveRequest */
export interface AupFolderMoveRequest {
  parentId?: number;
}

/** GET /aup-folder —— 取整棵文件夹树 */
export function listAupFolders(ownerType?: string): Promise<AupFolderVO[]> {
  return authHttp.get<Result<AupFolderVO[]>>("/aup-folder", { params: { ownerType } }).then(({ data }) => data.data);
}

/** POST /aup-folder —— 新建文件夹 */
export function createAupFolder(body: AupFolderCreateRequest): Promise<AupFolderVO> {
  return authHttp.post<Result<AupFolderVO>>("/aup-folder", body).then(({ data }) => data.data);
}

/** PUT /aup-folder/{id} —— 重命名/改排序 */
export function updateAupFolder(id: number, body: AupFolderUpdateRequest): Promise<AupFolderVO> {
  return authHttp.put<Result<AupFolderVO>>(`/aup-folder/${id}`, body).then(({ data }) => data.data);
}

/** PUT /aup-folder/{id}/move —— 换父节点 */
export function moveAupFolder(id: number, body: AupFolderMoveRequest): Promise<void> {
  return authHttp.put<Result<void>>(`/aup-folder/${id}/move`, body).then(() => undefined);
}

/** DELETE /aup-folder/{id} —— 删除空文件夹 */
export function deleteAupFolder(id: number): Promise<void> {
  return authHttp.delete<Result<void>>(`/aup-folder/${id}`).then(() => undefined);
}

/* ── 字段域 /api/aup-field ── */

/** 字段状态机：DRAFT → PENDING_REVIEW → PUBLISHED（unfreeze 回 DRAFT） */
export type AupFieldStatus = "DRAFT" | "PENDING_REVIEW" | "PUBLISHED";

/** 字段字典视图，对齐 AupFieldVO（options/config/showWhen 解析为 Object） */
export interface AupFieldVO {
  id: number;
  fieldCode: string;
  label: string;
  type?: string;
  dictKey?: string;
  options?: unknown;
  required?: boolean;
  description?: string;
  config?: unknown;
  showWhen?: unknown;
  folderId?: number;
  status?: AupFieldStatus;
  frozenAt?: string;
  frozenBy?: string;
  sortOrder?: number;
  refCount?: number;
}

export interface AupFieldListParams {
  folderId?: number;
  status?: string;
  keyword?: string;
  page?: number;
  size?: number;
}

export interface AupFieldListResult {
  items: AupFieldVO[];
  total: number;
}

/** 新建字段请求，对齐 AupFieldCreateRequest */
export interface AupFieldCreateRequest {
  fieldCode: string;
  label: string;
  type?: string;
  dictKey?: string;
  options?: unknown;
  required?: boolean;
  description?: string;
  config?: unknown;
  showWhen?: unknown;
  folderId?: number;
  sortOrder?: number;
}

/** 修改字段请求，对齐 AupFieldUpdateRequest（仅 DRAFT 可改） */
export interface AupFieldUpdateRequest {
  label?: string;
  type?: string;
  dictKey?: string;
  options?: unknown;
  required?: boolean;
  description?: string;
  config?: unknown;
  showWhen?: unknown;
  sortOrder?: number;
}

/** 字段移动请求，对齐 AupFieldMoveRequest */
export interface AupFieldMoveRequest {
  folderId?: number;
  sortOrder?: number;
}

/** 字段状态机审核请求（reject 意见必填），对齐 AupFieldReviewRequest */
export interface AupFieldReviewRequest {
  comment?: string;
}

/** 引用某字段编码的原子域模板，对齐 AupFieldTemplateRef */
export interface AupFieldTemplateRef {
  templateId?: number;
  formKey?: string;
  templateName?: string;
  templateVersion?: number;
  kind?: string;
  fieldId?: number;
  fieldKey?: string;
  fieldLabel?: string;
}

/** 字段 usage 结果（fieldCode/label/status/refCount/refs） */
export interface AupFieldUsageVO {
  fieldCode?: string;
  label?: string;
  status?: AupFieldStatus;
  refCount?: number;
  refs?: AupFieldTemplateRef[];
}

/** 从已发布模板抽取字段请求，对齐 ExtractFromTemplateRequest */
export interface ExtractFromTemplateRequest {
  templateId?: number;
  /** templateId 为空时按 formKey 解析（kind=PROTOCOL 已发布版） */
  formKey?: string;
}

/** 字段抽取结果，对齐 ExtractFromTemplateResponse */
export interface ExtractFromTemplateResponse {
  created?: number;
  skipped?: number;
}

/** GET /aup-field —— 字段分页列表 */
export function fetchAupFields(params: AupFieldListParams = {}): Promise<AupFieldListResult> {
  return authHttp.get<Result<AupFieldListResult>>("/aup-field", { params }).then(({ data }) => data.data);
}

/** POST /aup-field —— 新建字段（DRAFT） */
export function createAupField(body: AupFieldCreateRequest): Promise<AupFieldVO> {
  return authHttp.post<Result<AupFieldVO>>("/aup-field", body).then(({ data }) => data.data);
}

/** PUT /aup-field/{id} —— 修改字段（仅 DRAFT） */
export function updateAupField(id: number, body: AupFieldUpdateRequest): Promise<AupFieldVO> {
  return authHttp.put<Result<AupFieldVO>>(`/aup-field/${id}`, body).then(({ data }) => data.data);
}

/** PUT /aup-field/{id}/move —— 移动到别的文件夹 */
export function moveAupField(id: number, body: AupFieldMoveRequest): Promise<void> {
  return authHttp.put<Result<void>>(`/aup-field/${id}/move`, body).then(() => undefined);
}

/** DELETE /aup-field/{id} —— 删除字段（被原子域引用则拒绝） */
export function deleteAupField(id: number): Promise<void> {
  return authHttp.delete<Result<void>>(`/aup-field/${id}`).then(() => undefined);
}

/** GET /aup-field/{id}/usage —— 被哪些原子域引用 */
export function fetchAupFieldUsage(id: number): Promise<AupFieldUsageVO> {
  return authHttp.get<Result<AupFieldUsageVO>>(`/aup-field/${id}/usage`).then(({ data }) => data.data);
}

/** POST /aup-field/{id}/submit-review —— 提交审核 */
export function submitAupFieldReview(id: number): Promise<void> {
  return authHttp.post<Result<void>>(`/aup-field/${id}/submit-review`).then(() => undefined);
}

/** POST /aup-field/{id}/approve —— 通过发布 */
export function approveAupField(id: number): Promise<void> {
  return authHttp.post<Result<void>>(`/aup-field/${id}/approve`).then(() => undefined);
}

/** POST /aup-field/{id}/reject —— 驳回（意见必填） */
export function rejectAupField(id: number, body?: AupFieldReviewRequest): Promise<void> {
  return authHttp.post<Result<void>>(`/aup-field/${id}/reject`, body).then(() => undefined);
}

/** POST /aup-field/{id}/unfreeze —— 解冻 */
export function unfreezeAupField(id: number): Promise<void> {
  return authHttp.post<Result<void>>(`/aup-field/${id}/unfreeze`).then(() => undefined);
}

/** POST /api/aup-seed/seed —— 幂等导入内置种子（码表+字段+原子域+组合域） */
export function importAupSeed(): Promise<Record<string, number>> {
  return authHttp.post<Result<Record<string, number>>>("/aup-seed/seed").then(({ data }) => data.data);
}

/** POST /api/aup-seed/reset —— 清空全部内置种子数据（码表/字段/原子域/组合域/文件夹），返回删除行数 */
export function resetAupSeed(): Promise<number> {
  return authHttp.post<Result<number>>("/aup-seed/reset").then(({ data }) => data.data);
}

/* ── 码表状态机（/api/aup-dict 扩展） ── */

/** 码表版本列表项，对齐 DictVersionVO */
export interface AupDictVersionVO {
  id: number;
  dictKey?: string;
  name?: string;
  version?: number;
  status?: AupDictStatus;
  folderId?: number;
  publishedAt?: string;
  publishedBy?: string;
  reviewComment?: string;
  itemCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

/** 码表引用链，对齐 DictUsageVO */
export interface AupDictUsageVO {
  dictKey?: string;
  refCount?: number;
  refs?: AupDictUsageRef[];
}

/** 码表引用链中的单个引用，对齐 DictUsageRef */
export interface AupDictUsageRef {
  /** TEMPLATE_FIELD（模板字段） / FIELD_DEF（字段字典） */
  refType?: string;
  fieldKey?: string;
  fieldLabel?: string;
  templateId?: number;
  formKey?: string;
  templateName?: string;
  templateVersion?: number;
  /** form_field.dict_version（可能为 null=跟随最新） */
  dictVersion?: number;
  fieldDefId?: number;
}

/** 码表状态机审核请求（approve/reject 共用），对齐 DictReviewRequest */
export interface AupDictReviewRequest {
  comment?: string;
}

/** 逐项校对四态请求，对齐 DictVerdictRequest */
export interface AupDictVerdictRequest {
  /** CONFIRM / MODIFY / DELETE / QUESTION */
  verdict: string;
  verdictNote?: string;
}

/** GET /aup-dict/{dictKey}/versions —— 版本列表 */
export function fetchAupDictVersions(dictKey: string): Promise<AupDictVersionVO[]> {
  return authHttp.get<Result<AupDictVersionVO[]>>(`/aup-dict/${dictKey}/versions`).then(({ data }) => data.data);
}

/** GET /aup-dict/{dictKey}/usage —— 引用链 */
export function fetchAupDictUsage(dictKey: string): Promise<AupDictUsageVO> {
  return authHttp.get<Result<AupDictUsageVO>>(`/aup-dict/${dictKey}/usage`).then(({ data }) => data.data);
}

/** POST /aup-dict/{dictKey}/submit-review —— 提交审核 DRAFT→PENDING_REVIEW */
export function submitAupDictReview(dictKey: string): Promise<void> {
  return authHttp.post<Result<void>>(`/aup-dict/${dictKey}/submit-review`).then(() => undefined);
}

/** POST /aup-dict/{dictKey}/approve —— 通过发布 PENDING_REVIEW→PUBLISHED */
export function approveAupDict(dictKey: string, body?: AupDictReviewRequest): Promise<void> {
  return authHttp.post<Result<void>>(`/aup-dict/${dictKey}/approve`, body).then(() => undefined);
}

/** POST /aup-dict/{dictKey}/reject —— 驳回 PENDING_REVIEW→DRAFT（意见必填） */
export function rejectAupDict(dictKey: string, body: AupDictReviewRequest): Promise<void> {
  return authHttp.post<Result<void>>(`/aup-dict/${dictKey}/reject`, body).then(() => undefined);
}

/** POST /aup-dict/{dictKey}/unfreeze —— 解冻 PUBLISHED→DRAFT（无字段引用才可） */
export function unfreezeAupDict(dictKey: string): Promise<void> {
  return authHttp.post<Result<void>>(`/aup-dict/${dictKey}/unfreeze`).then(() => undefined);
}

/** POST /aup-dict/{dictKey}/draft —— 从已发布版克隆新草稿 */
export function createAupDictDraft(dictKey: string): Promise<AupDictVersionVO> {
  return authHttp.post<Result<AupDictVersionVO>>(`/aup-dict/${dictKey}/draft`).then(({ data }) => data.data);
}

/** POST /aup-dict/{dictKey}/items/{itemId}/verdict —— 逐项校对四态 */
export function submitAupDictItemVerdict(dictKey: string, itemId: number, body: AupDictVerdictRequest): Promise<void> {
  return authHttp.post<Result<void>>(`/aup-dict/${dictKey}/items/${itemId}/verdict`, body).then(() => undefined);
}

/* ── 模板原子域/组合域（/api/aup-template 扩展） ── */

/** 新建原子域请求，对齐 AtomCreateRequest */
export interface AtomCreateRequest {
  /** 调用方给定 formKey；缺省用 atom:{code}（或 atom:{name}） */
  formKey?: string;
  name?: string;
  code?: string;
  description?: string;
  folderId?: number;
}

/** 组合域钉住的原子域引用，对齐 AtomRef */
export interface AtomRef {
  atomFormKey?: string;
  atomTemplateId?: number;
}

/** 新建组合域请求，对齐 ComposeRequest */
export interface ComposeRequest {
  formKey?: string;
  name?: string;
  description?: string;
  folderId?: number;
  atoms?: AtomRef[];
}

/** 把若干原子域字段整段插入当前草稿请求，对齐 ImportAtomsRequest */
export interface ImportAtomsRequest {
  atomTemplateIds?: number[];
}

/** 模板（原子域）被哪些组合域钉住，对齐 TemplateUsageVO */
export interface TemplateUsageVO {
  templateId?: number;
  formKey?: string;
  name?: string;
  version?: number;
  kind?: string;
  refCount?: number;
  refs?: TemplateUsageRef[];
}

/** 组合域对原子域的钉住引用，对齐 TemplateUsageRef */
export interface TemplateUsageRef {
  compositeTemplateId?: number;
  compositeFormKey?: string;
  compositeName?: string;
  compositeVersion?: number;
  atomFormKey?: string;
}

/** 模板状态机审核请求（reject 意见必填），对齐 TemplateReviewRequest */
export interface TemplateReviewRequest {
  comment?: string;
}

/** POST /aup-template/atom —— 新建原子域 */
export function createAupAtom(body: AtomCreateRequest): Promise<TemplateVersionBriefVO> {
  return authHttp.post<Result<TemplateVersionBriefVO>>("/aup-template/atom", body).then(({ data }) => data.data);
}

/** POST /aup-template/compose —— 新建组合域并钉住原子域版本 */
export function composeAupTemplate(body: ComposeRequest): Promise<TemplateVersionBriefVO> {
  return authHttp.post<Result<TemplateVersionBriefVO>>("/aup-template/compose", body).then(({ data }) => data.data);
}

/** POST /aup-template/{id}/import-atoms —— 把若干原子域字段整段插入当前草稿 */
export function importAtomsIntoAupTemplate(id: number, body: ImportAtomsRequest): Promise<TemplateDetailVO> {
  return authHttp.post<Result<TemplateDetailVO>>(`/aup-template/${id}/import-atoms`, body).then(({ data }) => data.data);
}

/** POST /aup-template/{id}/submit-review —— 提交审核 */
export function submitAupTemplateReview(id: number): Promise<void> {
  return authHttp.post<Result<void>>(`/aup-template/${id}/submit-review`).then(() => undefined);
}

/** POST /aup-template/{id}/reject —— 驳回（意见必填） */
export function rejectAupTemplate(id: number, body?: TemplateReviewRequest): Promise<void> {
  return authHttp.post<Result<void>>(`/aup-template/${id}/reject`, body).then(() => undefined);
}

/** POST /aup-template/{id}/unfreeze —— 解冻 */
export function unfreezeAupTemplate(id: number): Promise<void> {
  return authHttp.post<Result<void>>(`/aup-template/${id}/unfreeze`).then(() => undefined);
}

/** GET /aup-template/{id}/usage —— 原子域被哪些组合域钉住 */
export function fetchAupTemplateUsage(id: number): Promise<TemplateUsageVO> {
  return authHttp.get<Result<TemplateUsageVO>>(`/aup-template/${id}/usage`).then(({ data }) => data.data);
}

/* ── 变更记录 /api/aup-config-audit ── */

/** 配置面变更记录条目，对齐 AupConfigChangeLog 实体 */
export interface AupConfigChangeLogVO {
  id?: number;
  /** codelist / codelist_item / field / folder / template */
  entity?: string;
  entityId?: number;
  entityCode?: string;
  entityName?: string;
  /** CREATE/UPDATE/DELETE/MOVE/SUBMIT_REVIEW/APPROVE/REJECT/UNFREEZE/NEW_VERSION/ARCHIVE */
  changeType?: string;
  beforeJson?: string;
  afterJson?: string;
  operatorId?: number;
  operator?: string;
  comment?: string;
  createdAt?: string;
}

/** 按 entity 分组计数（供前端分类 chip） */
export interface AupConfigEntitySummary {
  entity?: string;
  count?: number;
}

export interface AupConfigAuditQuery {
  entity?: string;
  changeType?: string;
  operatorId?: string;
  keyword?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

export interface AupConfigAuditResult {
  items: AupConfigChangeLogVO[];
  total: number;
  page: number;
  pageSize: number;
  entitySummaries: AupConfigEntitySummary[];
}

/** GET /aup-config-audit —— 分页查询配置变更记录 */
export function fetchAupConfigAudit(query: AupConfigAuditQuery = {}): Promise<AupConfigAuditResult> {
  return authHttp.get<Result<AupConfigAuditResult>>("/aup-config-audit", { params: query }).then(({ data }) => data.data);
}

/* =====================================================================
 * 类型再导出（供页面/组件从单一入口引用，避免散落 import）
 * ================================================================== */

export type { AupAttachment, AupAttachmentUpload, AupDetailVO, AupListItem, AupPrintData, AupSnapshot, AupSnapshotMeta, AupStage, AupTrace, DraftSource, ReviewForm } from "@/features/aup/schema/aup";
export type { Assignment, Expert, FormatReviewItemInput, ReviewItem, ReviewProgress, ReviewTodoItem, Reviewer, ReviewerConfig, ReviewVerdict, ReviewVO, VoteRequest } from "@/features/aup/schema/review";
export type { FormField, FormSection, FormSubSection } from "@/features/aup/schema/formTemplate";
