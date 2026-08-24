package com.example.demo.modules.cageshelf.entity;

import lombok.Data;

import java.time.LocalDateTime;

/** 笼位表单审计日志（data + dict 统一表）。 */
@Data
public class CageFormAuditLog {
    private Long id;
    /** data | dict */
    private String category;
    private String changeType;
    /** field / codelist / claim / cage_box / form */
    private String entity;
    private Long entityId;
    private String entityCode;
    private String entityName;
    private String targetType;
    private Long targetId;
    private String targetLabel;
    private String fieldCode;
    private String fieldName;
    private String beforeValue;
    private String afterValue;
    private String beforeJson;
    private String afterJson;
    private String operatorId;
    /** 查询时由 UserDisplayNameService 填充，非持久化列 */
    private String operatorName;
    private LocalDateTime createdAt;
}
