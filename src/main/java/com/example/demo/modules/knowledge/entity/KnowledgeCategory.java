package com.example.demo.modules.knowledge.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class KnowledgeCategory {
    private Long id;
    private Long parentId;
    private String name;
    private String slug;
    private Integer sortOrder;
    private String icon;
    private String description;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
