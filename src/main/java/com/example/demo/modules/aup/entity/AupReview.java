package com.example.demo.modules.aup.entity;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * AUP 专家审查投票记录（一次投票 = 1 行整体 verdict + N 条逐字段意见 aup_review_item）。
 * 幂等约束：UNIQUE(aup_id, reviewer, round_no)。
 */
@Data
public class AupReview {
    private Long id;
    private Long aupId;
    private Integer roundNo;
    /** 投票人 userId */
    private String reviewer;
    /** 固定 expert（专家投票） */
    private String role;
    /** agree/disagree/modify/recuse/abstain */
    private String verdict;
    /** 整体审核反馈 */
    private String comment;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
