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
    /** 逻辑原子 FK→crf_form.id（版本无关，V34） */
    private Long atomId;
    /** FK→crf_transplant（V34） */
    private Long transplantId;
    /** DRAFT/COMPLETE/LOCKED */
    private String status;
    private Long dagId;
    private String createdBy;
    private LocalDateTime createdAt;
    private String updatedBy;
    private LocalDateTime updatedAt;
}
