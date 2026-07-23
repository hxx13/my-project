package com.example.demo.modules.knowledge.model;

import lombok.Data;

@Data
public class KnowledgeImportRequest {
    private Long categoryId;
    private String title;
    private String content;
    private String format;   // "markdown" or "html"
    private String author;
}
