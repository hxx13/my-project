package com.example.demo.modules.aup.entity;

import lombok.Data;
import java.time.LocalDateTime;

/** AUP 表单模板（含版本）。每发布版本 = 一行 + 其下 section/subsection/field。 */
@Data
public class FormTemplate {
    private Long id;
    private String formKey;
    private String name;
    private Integer version;
    /** DRAFT / PUBLISHED / ARCHIVED；仅 PUBLISHED 对填写人生效 */
    private String status;
    private String description;
    private LocalDateTime publishedAt;
    private String createdBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
