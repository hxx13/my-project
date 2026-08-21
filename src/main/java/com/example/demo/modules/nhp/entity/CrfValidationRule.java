package com.example.demo.modules.nhp.entity;

import lombok.Data;

import java.time.LocalDateTime;

/** NHP 字段级校验/分支规则（expression JSON {type,params}）。 */
@Data
public class CrfValidationRule {
    private Long id;
    private Long fieldId;
    /** RANGE/THRESHOLD/TIME_GAP/CROSS_FIELD/REGEX/CONDITIONAL_REQUIRED/SKIP */
    private String ruleType;
    /** WARN/ERROR/FLAG */
    private String severity;
    /** 结构化表达式 JSON（String 存原始 JSON） */
    private String expression;
    private String message;
    private Boolean active;
    private LocalDateTime createdAt;
}
