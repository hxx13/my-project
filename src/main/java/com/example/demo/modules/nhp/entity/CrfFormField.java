package com.example.demo.modules.nhp.entity;

import lombok.Data;

import java.time.LocalDateTime;

/** NHP 表单-字段引用（ItemRef，位置/必填/角色）。 */
@Data
public class CrfFormField {
    private Long id;
    private Long formId;
    private Long fieldId;
    /** PK/FK/VALUE/DERIVED */
    private String role;
    /** FK 字段指向实体（V42） */
    private String fkTarget;
    private Integer position;
    private String requiredOverride;
    private String logicRef;
    private LocalDateTime createdAt;
}
