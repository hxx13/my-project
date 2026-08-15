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
  /** 课题组名称（学生端按课题组查本组的计划书） */
  projectGroupName?: string;
  /** 排除草稿（后台列表不显示未提交的草稿） */
  excludeDraft?: boolean;
  draftSource?: DraftSource;
  roundNo?: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
}

/** GET /aup/list */
export function fetchAupList(params: AupListParams = {}): Promise<AupPage<AupListItem>> {
  return authHttp.get<Result<AupPage<AupListItem>>>("/aup/list", { params }).then(({ data }) => data.data);
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

/** DELETE /aup/{id} —— 删除草稿状态计划书（申请人本人或管理员） */
export function deleteAup(id: string): Promise<void> {
  return authHttp.delete<Result<void>>(`/aup/${id}`).then(() => undefined);
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

export type TemplateStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

/** 版本列表项（GET /aup-template），对齐 TemplateVersionVO */
export interface TemplateVersionVO {
  id: number;
  formKey: string;
  name: string;
  description?: string;
  version: number;
  status: TemplateStatus;
  publishedAt?: string;
  updatedAt?: string;
  updatedBy?: string;
}

/** 版本简要（版本历史 / 新建草稿 / 发布响应），对齐 TemplateVersionBriefVO */
export interface TemplateVersionBriefVO {
  id: number;
  version: number;
  status: TemplateStatus;
  publishedAt?: string;
}

/** 模板完整结构（GET /aup-template/published、resolve、{id}），对齐 TemplateDetailVO */
export interface TemplateDetailVO {
  id: number;
  formKey: string;
  name: string;
  version: number;
  status: TemplateStatus;
  description?: string;
  publishedAt?: string;
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

/** GET /aup-template —— 版本列表（含 DRAFT/PUBLISHED/ARCHIVED） */
export function fetchAupTemplates(): Promise<TemplateVersionVO[]> {
  return authHttp.get<Result<TemplateVersionVO[]>>("/aup-template").then(({ data }) => data.data);
}

/** GET /aup-template/published —— 当前 PUBLISHED 版本结构（新填页用；未发布返回 null） */
export function fetchPublishedTemplate(formKey: string): Promise<TemplateDetailVO | null> {
  return authHttp.get<Result<TemplateDetailVO | null>>("/aup-template/published", { params: { formKey } }).then(
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

/** GET /aup-template/default-seed —— 内置默认模板（「导入内置模板」填充当前草稿用） */
export function fetchAupDefaultSeed(): Promise<UpdateTemplateBody> {
  return authHttp.get<Result<UpdateTemplateBody>>("/aup-template/default-seed").then(({ data }) => data.data);
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

export interface AupDictListParams {
  page?: number;
  size?: number;
  keyword?: string;
  /** 按分类筛选（NULL=未分类） */
  category?: string;
}

export interface AupDictListItem {
  dictKey: string;
  name: string;
  /** 分类（分组/文件夹；NULL=未分类） */
  category?: string;
  itemCount: number;
}

export interface CreateDictBody {
  dictKey: string;
  name: string;
  category?: string;
}

export interface AupDictItem {
  itemId: number;
  value: string;
  label: string;
  sortOrder: number;
}

export interface AupDictDetail {
  dictKey: string;
  name: string;
  category?: string;
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

/** GET /aup-dict/{dictKey} —— 查字典 + 有序项 */
export function fetchAupDict(dictKey: string): Promise<AupDictDetail> {
  return authHttp.get<Result<AupDictDetail>>(`/aup-dict/${dictKey}`).then(({ data }) => data.data);
}

/** PUT /aup-dict/{dictKey} —— 改名（category 非空时一并更新分类） */
export function updateAupDict(dictKey: string, body: { name: string; category?: string }): Promise<void> {
  return authHttp.put<Result<void>>(`/aup-dict/${dictKey}`, body).then(() => undefined);
}

/** DELETE /aup-dict/{dictKey} —— 删字典（校验无字段引用） */
export function deleteAupDict(dictKey: string): Promise<void> {
  return authHttp.delete<Result<void>>(`/aup-dict/${dictKey}`).then(() => undefined);
}

/** POST /aup-dict/{dictKey}/items —— 新增项 */
export function createAupDictItem(dictKey: string, body: CreateDictItemBody): Promise<{ itemId: number }> {
  return authHttp.post<Result<{ itemId: number }>>(`/aup-dict/${dictKey}/items`, body).then(({ data }) => data.data);
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
 * 类型再导出（供页面/组件从单一入口引用，避免散落 import）
 * ================================================================== */

export type { AupAttachment, AupAttachmentUpload, AupDetailVO, AupListItem, AupPrintData, AupSnapshot, AupSnapshotMeta, AupStage, AupTrace, DraftSource, ReviewForm } from "@/features/aup/schema/aup";
export type { Assignment, Expert, FormatReviewItemInput, ReviewItem, ReviewProgress, ReviewTodoItem, Reviewer, ReviewerConfig, ReviewVO, VoteRequest } from "@/features/aup/schema/review";
export type { FormField, FormSection, FormSubSection } from "@/features/aup/schema/formTemplate";
