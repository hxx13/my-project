package com.example.demo.modules.knowledge.service;

import com.example.demo.modules.knowledge.entity.KnowledgeHistory;
import com.example.demo.modules.knowledge.mapper.KnowledgeHistoryMapper;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class KnowledgeHistoryService {

    private final KnowledgeHistoryMapper mapper;

    public KnowledgeHistoryService(KnowledgeHistoryMapper mapper) {
        this.mapper = mapper;
    }

    public List<KnowledgeHistory> findByPageId(Long pageId) {
        return mapper.findByPageId(pageId);
    }

    public KnowledgeHistory findByPageAndVersion(Long pageId, int version) {
        return mapper.findByPageAndVersion(pageId, version);
    }
}
