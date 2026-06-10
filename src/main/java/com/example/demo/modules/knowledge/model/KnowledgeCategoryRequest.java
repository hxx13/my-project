package com.example.demo.modules.knowledge.model;

import lombok.Data;

@Data
public class KnowledgeCategoryRequest {
    private Long parentId;
    private String name;
    private String slug;
    private Integer sortOrder;
    private String icon;
    private String description;
}
