package com.example.demo.modules.knowledge.model;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

@Data
public class KnowledgeTreeResponse {
    private Long categoryId;
    private Long parentId;
    private String categoryName;
    private String categorySlug;
    private String icon;
    private Integer sortOrder;
    private List<PageSummary> pages = new ArrayList<>();
    private List<KnowledgeTreeResponse> children = new ArrayList<>();

    @Data
    public static class PageSummary {
        private Long id;
        private String slug;
        private String title;
        private String source;
        private Integer version;
    }
}
