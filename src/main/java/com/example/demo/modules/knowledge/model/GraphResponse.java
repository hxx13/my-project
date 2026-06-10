package com.example.demo.modules.knowledge.model;

import lombok.Data;
import java.util.List;

@Data
public class GraphResponse {
    private List<GraphNode> nodes;
    private List<GraphEdge> edges;

    @Data
    public static class GraphNode {
        private Long id;
        private String title;
        private Long categoryId;
        private String categoryName;
        private int refCount;
    }

    @Data
    public static class GraphEdge {
        private Long source;
        private Long target;
        private String type; // "manual" or "auto"
    }
}
