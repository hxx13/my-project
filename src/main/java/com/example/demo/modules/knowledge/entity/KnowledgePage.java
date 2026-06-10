package com.example.demo.modules.knowledge.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class KnowledgePage {
    private Long id;
    private Long categoryId;
    private String slug;
    private String title;
    private String contentHtml;
    private String contentMd;
    private String source;
    private Integer version;
    private String author;
    private Integer isPublished;
    private String tags; // JSON array string
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
