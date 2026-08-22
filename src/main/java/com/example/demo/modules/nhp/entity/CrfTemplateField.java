package com.example.demo.modules.nhp.entity;

import lombok.Data;

import java.time.LocalDateTime;

/** NHP 表单模板字段（题型/选项/条件，呈现层）。 */
@Data
public class CrfTemplateField {
    private Long id;
    private Long formId;
    /** FK→crf_template_section.id（归属小节，NULL=直接挂表单） */
    private Long sectionId;
    /** 字段键 D1.01.001（引用 crf_field.field_code） */
    private String fieldKey;
    /** 字段存储类型（字典层权威快照，约束前端可选题型，V41） */
    private String dataType;
    private String label;
    private String description;
    private String type;
    /** 选项 JSON：[{value,label}] */
    private String options;
    /** 引用码表 crf_codelist.code */
    private String dictKey;
    /** PK/FK/VALUE/DERIVED（与 type 正交；缺省 VALUE） */
    private String role;
    /** role 专属元数据 JSON：pkRule / entityType / derivedSource */
    private String roleMeta;
    private Boolean required;
    /** 条件显示 JSON */
    private String showWhen;
    private Integer sortOrder;
    /** maxLength/choiceType/unit/min/max/accept/columns/fields 等 JSON */
    private String config;
    private LocalDateTime createdAt;
}
