package com.example.demo.modules.knowledge.model;

import lombok.Data;

import java.util.List;

@Data
public class KnowledgeImportBatchRequest {
    private List<KnowledgeImportRequest> items;
}
