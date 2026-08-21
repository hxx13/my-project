package com.example.demo.modules.nhp.entity;

import lombok.Data;

import java.time.LocalDateTime;

/** NHP 数据审计（每笔值变更 before/after，只追加）。 */
@Data
public class CrfDataAuditLog {
    private Long id;
    private Long recordId;
    private Long fieldId;
    private Long fieldVersionId;
    /** INSERT/UPDATE/DELETE */
    private String changeType;
    private String beforeValue;
    private String afterValue;
    private String operatorId;
    /** 展示用操作人姓名（非持久列，UserDisplayNameService） */
    private String operatorName;
    /** 录入/修正/query回复/导入/校验触发/复核 */
    private String changeReason;
    private Long signatureId;
    private LocalDateTime createdAt;

    /** 查询展示用（JOIN crf_field，非持久列） */
    private String fieldCode;
    private String fieldName;
}
