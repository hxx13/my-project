package com.example.demo.modules.nhp.entity;

import lombok.Data;

import java.time.LocalDateTime;

/** NHP 表单：原子模板(DOMAIN/MODULE) 或 组合模板(TEMPLATE)。 */
@Data
public class CrfForm {
    private Long id;
    private Long studyId;
    /** 原子编码 D1~D10，或组合模板 formKey 如 nhp-crf */
    private String code;
    private String name;
    /** DOMAIN/MODULE=原子；TEMPLATE=组合；PUBLIC 保留 */
    private String formType;
    private Integer version;
    /** DRAFT/FREEZING/FROZEN/ARCHIVED */
    private String status;
    private String description;
    private Boolean active;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
