package com.example.demo.modules.nhp.entity;

import lombok.Data;

import java.time.LocalDateTime;

/** NHP 表单模板章节（Section/SubSection，呈现层）。 */
@Data
public class CrfTemplateSection {
    private Long id;
    private Long formId;
    /** 父章节 id（NULL=Section 数据域 D1，非空=SubSection D1.01） */
    private Long parentId;
    private String code;
    private String label;
    private Integer sortOrder;
    private Boolean subdivisible = false;
    /** 条件显示 JSON */
    private String showWhen;
    private String description;
    private LocalDateTime createdAt;
}
