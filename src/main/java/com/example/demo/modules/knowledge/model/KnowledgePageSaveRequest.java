package com.example.demo.modules.knowledge.model;

import lombok.Data;

@Data
public class KnowledgePageSaveRequest {
    private Long categoryId;
    private String slug;
    private String title;
    private String contentHtml;
    private String contentMd;
    private String summary;
}
