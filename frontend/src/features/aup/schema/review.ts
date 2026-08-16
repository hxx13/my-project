/**
 * AUP 审查相关类型（对应《2026-08-14-IACUC-AUP-实现落地清单》§5.3 的 data 字段）
 *
 * 字段命名与 §5 契约严格对齐（camelCase）。
 */

import type { AupStage, AupMiniStep } from "./aup";

/** 专家整体审查结论（aup_review.verdict） */
export type ReviewVerdict = "agree" | "disagree" | "modify" | "recuse" | "abstain";

/** 逐字段评审意见结论（aup_review_item.verdict） */
export type ReviewItemVerdict = "compliant" | "nonCompliant" | "suggest";

/** 审查人名册角色（aup_reviewer.reviewer_role） */
export type ReviewerRole = "secretary" | "expert";

/** 专家分配状态（aup_review_assignment.status） */
export type AssignmentStatus = "pending" | "voted" | "recused";

/** 审查投票记录（aup_review，供「会议人数」聚合） */
export interface ReviewVO {
  id: string;
  aupId: string;
  roundNo: number;
  reviewer?: string;
  role?: string;
  verdict: ReviewVerdict;
  comment?: string;
  createdAt: string;
  updatedAt: string;
}

/** 逐字段评审意见输入（POST /aup/{id}/review 的 items 元素） */
export interface ReviewItemInput {
  fieldKey: string;
  sectionKey: string;
  fieldLabel: string;
  verdict: ReviewItemVerdict;
  /** nonCompliant 必填 */
  reason?: string;
  suggestion?: string;
}

/** 专家投票请求体（POST /aup/{id}/review） */
export interface VoteRequest {
  /** 仅 abstain/recuse 需要显式传；正常评审由 items 逐字段推导为 agree/modify/disagree */
  verdict?: "abstain" | "recuse";
  comment?: string;
  items?: ReviewItemInput[];
}

/** 秘书格式建议输入（POST /aup/{id}/format-review 的 items 元素；非空 → 退回返修） */
export interface FormatReviewItemInput {
  fieldKey: string;
  sectionKey: string;
  fieldLabel: string;
  reason?: string;
  suggestion?: string;
}

/** 逐字段评审意见（aup_review_item / GET review/items 的 items 元素） */
export interface ReviewItem {
  fieldKey: string;
  sectionKey: string;
  fieldLabel: string;
  verdict: ReviewItemVerdict;
  reason?: string;
  suggestion?: string;
  reviewer?: string;
  /** 评审人姓名（后端解析，优先用于展示） */
  reviewerName?: string;
  /** 评审角色 secretary（格式）/ expert（内容） */
  reviewerRole?: string;
  roundNo: number;
  createdAt: string;
}

/** 投票进度（GET /aup/{id}/review/progress） */
export interface ReviewProgress {
  assignCount: number;
  votedCount: number;
  recusedCount: number;
  byVerdict: {
    agree: number;
    modify: number;
    disagree: number;
    abstain: number;
  };
  /** 尚未投票的专家 userId 列表 */
  unvoted: string[];
  /** 已投专家逐人记录 */
  votes?: Array<{
    reviewer?: string;
    role?: string;
    verdict: ReviewVerdict;
    comment?: string;
  }>;
}

/** 专家分配记录（aup_review_assignment） */
export interface Assignment {
  id: string;
  aupId: string;
  roundNo: number;
  reviewerId: string;
  status: AssignmentStatus;
  assignedBy?: string;
  createdAt: string;
}

/** 专家候选（GET /aup/experts 的 items 元素） */
export interface Expert {
  userId: string;
  name: string;
  dept?: string;
}

/** 审查人名册成员（aup_reviewer） */
export interface Reviewer {
  userId: string;
  name?: string;
  dept?: string;
  reviewerRole?: ReviewerRole;
  /** 可审范围（全校/某课题组），NULL=全校 */
  scope?: string | null;
  enabled?: boolean;
}

/** 后台名册配置（GET /aup/reviewer-config） */
export interface ReviewerConfig {
  formatReviewers: Reviewer[];
  expertCandidates: Reviewer[];
}

/** 后台名册配置写入（PUT /aup/reviewer-config）—— 只传 userId 列表，全量替换 */
export interface ReviewerConfigRequest {
  formatReviewers: string[];
  expertCandidates: string[];
}

/** 待审条目（GET /aup/review/todo 的 items 元素） */
export interface ReviewTodoItem {
  id: string;
  registerNo?: string;
  projectName?: string;
  piName?: string;
  dept?: string;
  currentStage: AupStage;
  roundNo: number;
  submittedAt?: string;
  summaryJson?: string | null;
  miniSteps?: AupMiniStep[];
}
