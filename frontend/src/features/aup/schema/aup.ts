/**
 * AUP 计划书实例相关类型（与后端 DTO 严格对齐：AupRecord / AupListItem / AupDetailVO / AupSnapshotVO / AupTraceVO / AupAttachmentVO）。
 *
 * 后端 Long 主键序列化为 JSON 数字，前端统一用 `number` 承载。
 */

/** 审批阶段（唯一状态字段 current_stage） */
export type AupStage =
  | "draft"
  | "piReview"
  | "formatReview"
  | "expertReview"
  | "approved"
  | "terminated"
  | "expired";

/** 草稿来源（退回统一回 draft + 标记来源） */
export type DraftSource =
  | "first"
  | "piReturn"
  | "formatReturn"
  | "expertReturn"
  | "rollback";

/** 专家审查形式 */
export type ReviewForm = "member" | "meeting";

/** 列表页「阶段过程」迷你步骤条目（含在 AupListItem.miniSteps JSON 字符串内） */
export interface AupMiniStep {
  key: string;
  label: string;
  status: "done" | "current" | "pending";
}

/** AupListItem.miniSteps 解析后的载荷（后端 buildMiniSteps 序列化为 JSON 字符串） */
export interface AupMiniStepsPayload {
  steps: AupMiniStep[];
  terminal?: string | null;
}

/** 计划书主记录（对应 aup_record 表，camelCase） */
export interface AupRecord {
  id: number;
  templateId: number;
  /** 冗余模板版本号 */
  templateVersion?: string;
  /** 乐观锁版本（流转/保存 CAS 用） */
  version: number;
  /** 注册号 JUMC{年}-{序}[-字母]，提交时生成并锁定，unlock 不清空 */
  registerNo?: string;
  registerYear?: number;
  registerSeq?: number;
  currentStage: AupStage;
  /** 第几轮（≥1） */
  roundNo: number;
  draftSource: DraftSource;
  reviewForm?: ReviewForm;
  /** 更新项目填的原注册号 */
  originRegisterNo?: string;
  /** 结转未使用动物数 */
  carriedOverCount: number;
  /** approved+3 年 */
  expireAt?: string;
  projectName?: string;
  piUserId?: string;
  piName?: string;
  dept?: string;
  projectSource?: string;
  submittedAt?: string;
  approvedAt?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  /** 演示示例标记 0/1 */
  isDemo?: number;
}

/** 列表条目（GET /aup/list 的 items 元素） */
export interface AupListItem {
  id: number;
  registerNo?: string;
  projectName?: string;
  piName?: string;
  dept?: string;
  currentStage: AupStage;
  roundNo: number;
  draftSource: DraftSource;
  submittedAt?: string;
  approvedAt?: string;
  createdAt?: string;
  /** 关键信息摘要 JSON（列表展开详情用，需 JSON.parse） */
  summaryJson?: string | null;
  snapshotCount: number;
  /** 评审意见条数（批注） */
  reviewCount?: number;
  /** 不合规条数 */
  nonCompliantCount?: number;
  /** 申请人（实验员）userId，列表按钮矩阵「实验员填写」判定用 */
  createdBy?: string;
  /** 组长（PI）userId，列表按钮矩阵「组长提交」判定用 */
  piUserId?: string;
  /** 当前用户是否被分配为该计划书的审查专家（>0 即被分配） */
  assignedExpertCount?: number;
  /** 阶段过程迷你指示器 JSON 字符串（需 JSON.parse 为 AupMiniStepsPayload） */
  miniSteps?: string | null;
  /** 演示示例标记 0/1 */
  isDemo?: number;
}

/** 快照轻量列表项（GET /aup/{id}/snapshots，不含 data），对齐 AupSnapshotVO */
export interface AupSnapshotMeta {
  snapshotId: number;
  versionNo: number;
  stage: AupStage;
  createdAt: string;
  createdBy?: string;
}

/** 单快照完整数据（GET /aup/{id}/snapshots/{snapId}，含 data） */
export interface AupSnapshot extends AupSnapshotMeta {
  /** 快照 JSON（不可变） */
  data: string;
}

/** 留痕 / 审计（GET /aup/{id}/traces，倒序），对齐 AupTraceVO */
export interface AupTrace {
  id: number;
  actor?: string;
  actorName?: string;
  role?: string;
  action: string;
  fromStage?: string;
  toStage?: string;
  comment?: string;
  createdAt: string;
}

/** 附件元信息（GET /aup/{id}/attachments），对齐 AupAttachmentVO */
export interface AupAttachment {
  fileId: number;
  fileName: string;
  mimeType?: string;
  size: number;
  url?: string;
  uploadedBy?: string;
  createdAt?: string;
}

/** 附件上传响应（POST /aup/{id}/attachments），对齐 AupAttachmentVO */
export interface AupAttachmentUpload {
  fileId: number;
  fileName: string;
  mimeType?: string;
  size: number;
  url?: string;
}

/** 打印数据（GET /aup/{id}/print-data）——各子块结构由后端组装，前端渲染 PDF */
export interface AupPrintData {
  core?: Record<string, unknown>;
  supplements?: Record<string, unknown> | unknown[];
  reviewSheet?: Record<string, unknown> | unknown[];
  registerNo?: string;
  signature?: unknown;
}

/**
 * 计划书详情（GET /aup/{id}）。
 * 后端只返回 record / draftData / snapshotCount / snapshots / traces；
 * 模板结构由模板子模块组装（前端另取：见 useAupTemplateById / useResolvedTemplate）。
 */
export interface AupDetailVO {
  record: AupRecord;
  /** 当前草稿 JSON（仅 draft 阶段返回，前端 JSON.parse） */
  draftData?: string | null;
  snapshotCount?: number;
  snapshots?: AupSnapshotMeta[];
  traces?: AupTrace[];
}
