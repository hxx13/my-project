package com.example.demo.modules.aup.entity;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * AUP 专家分配记录（todo 与投票分母计算依据）。
 * 唯一约束：UNIQUE(aup_id, round_no, reviewer_id)。
 */
@Data
public class AupReviewAssignment {
    private Long id;
    private Long aupId;
    private Integer roundNo;
    /** 被分配专家 userId */
    private String reviewerId;
    /** pending/voted/recused */
    private String status;
    /** 分配人（格式审查人） */
    private String assignedBy;
    private LocalDateTime createdAt;
}
