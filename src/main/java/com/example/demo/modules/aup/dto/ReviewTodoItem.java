package com.example.demo.modules.aup.dto;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 审查待办列表项（秘书 formatReview / 专家 被分配 expertReview）。
 */
@Data
public class ReviewTodoItem {
    /** aup_record.id */
    private Long id;
    private String registerNo;
    private String projectName;
    private String piName;
    private String dept;
    private String currentStage;
    private Integer roundNo;
    private String draftSource;
    private LocalDateTime submittedAt;
}
