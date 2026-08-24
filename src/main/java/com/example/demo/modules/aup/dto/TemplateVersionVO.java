package com.example.demo.modules.aup.dto;

import lombok.Data;
import java.time.LocalDateTime;

/** 版本列表项（GET /aup-template）。 */
@Data
public class TemplateVersionVO {
    private Long id;
    private String formKey;
    private String kind;
    private Long folderId;
    private String name;
    private String description;
    private Integer version;
    private String status;
    private LocalDateTime publishedAt;
    private LocalDateTime submittedAt;
    private String reviewComment;
    private LocalDateTime updatedAt;
    private String updatedBy;
}
