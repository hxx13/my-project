package com.example.demo.modules.knowledge.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class KnowledgeHistory {
    private Long id;
    private Long pageId;
    private Integer version;
    private String contentHtml;
    private String contentMd;
    private String author;
    private String summary;
    private LocalDateTime createdAt;
}
