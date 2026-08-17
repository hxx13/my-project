package com.example.demo.modules.aup.entity;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * AUP 逐字段评审意见（评审填写 + 返修查看，快捷入口/总览数据源）。
 * 唯一约束：UNIQUE(review_id, field_key)。
 */
@Data
public class AupReviewItem {
    private Long id;
    private Long reviewId;
    private Long aupId;
    private Integer roundNo;
    /** 字段键 A1.projectName / B1.purpose */
    private String fieldKey;
    /** 所属大段 A/B/C… */
    private String sectionKey;
    /** 字段名快照（展示，不依赖模板） */
    private String fieldLabel;
    /** compliant/nonCompliant/suggest */
    private String verdict;
    /** 理由（nonCompliant 必填） */
    private String reason;
    /** 修改建议 */
    private String suggestion;
    private String reviewer;
    /** 评审人姓名（reviewer 的 userId 解析，供前端展示） */
    private String reviewerName;
    /** 评审角色 secretary（格式）/ expert（内容） */
    private String reviewerRole;
    private LocalDateTime createdAt;
}
