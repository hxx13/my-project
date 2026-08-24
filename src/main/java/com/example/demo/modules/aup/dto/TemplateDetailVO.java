package com.example.demo.modules.aup.dto;

import lombok.Data;
import java.time.LocalDateTime;
import java.util.List;

/** 模板完整结构（sections → subsections → fields）。 */
@Data
public class TemplateDetailVO {
    private Long id;
    private String formKey;
    private String kind;
    private Long folderId;
    private String name;
    private Integer version;
    private String status;
    private String description;
    private LocalDateTime publishedAt;
    private LocalDateTime submittedAt;
    private String reviewComment;
    private LocalDateTime updatedAt;
    private List<SectionVO> sections;
}
