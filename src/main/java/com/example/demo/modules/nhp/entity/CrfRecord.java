package com.example.demo.modules.nhp.entity;

import lombok.Data;

import java.time.LocalDateTime;

/** NHP 表单实例（一次填写）。 */
@Data
public class CrfRecord {
    private Long id;
    private Long subjectId;
    private Long formId;
    private Long formVersionId;
    private Long visitInstanceId;
    /** DRAFT/COMPLETE/LOCKED */
    private String status;
    private Long dagId;
    private String createdBy;
    private LocalDateTime createdAt;
    private String updatedBy;
    private LocalDateTime updatedAt;
}
