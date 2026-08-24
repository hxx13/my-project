package com.example.demo.modules.aup.entity;

import lombok.Data;
import java.time.LocalDateTime;

/** AUP 表单模板（含版本）。每发布版本 = 一行 + 其下 section/subsection/field。 */
@Data
public class FormTemplate {
    private Long id;
    private String formKey;
    /** PROTOCOL(计划书模板) / ATOM(原子域) / COMPOSITE(组合域) */
    private String kind;
    /** → aup_folder(owner_type=ATOM)；仅 ATOM/COMPOSITE 用 */
    private Long folderId;
    /** SEED / USER / COMPOSED */
    private String origin;
    private String name;
    private Integer version;
    /** DRAFT / PENDING_REVIEW / PUBLISHED / ARCHIVED；仅 PUBLISHED 对填写人生效 */
    private String status;
    private String description;
    private LocalDateTime publishedAt;
    /** 提交审核时间 */
    private LocalDateTime submittedAt;
    private String reviewComment;
    private String createdBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
