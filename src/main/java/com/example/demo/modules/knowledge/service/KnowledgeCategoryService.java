package com.example.demo.modules.knowledge.service;

import com.example.demo.common.exception.ErrorCodeConstants;
import com.example.demo.modules.knowledge.entity.KnowledgeCategory;
import com.example.demo.modules.knowledge.mapper.KnowledgeCategoryMapper;
import com.example.demo.modules.knowledge.model.KnowledgeCategoryRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class KnowledgeCategoryService {

    private static final Logger log = LoggerFactory.getLogger(KnowledgeCategoryService.class);

    private final KnowledgeCategoryMapper mapper;

    public KnowledgeCategoryService(KnowledgeCategoryMapper mapper) {
        this.mapper = mapper;
    }

    public List<KnowledgeCategory> findAll() {
        return mapper.findAll();
    }

    public KnowledgeCategory findById(Long id) {
        KnowledgeCategory cat = mapper.findById(id);
        if (cat == null) {
            throw new KnowledgeException(ErrorCodeConstants.KNOWLEDGE_CATEGORY_NOT_FOUND, "知识库分类不存在");
        }
        return cat;
    }

    public KnowledgeCategory create(KnowledgeCategoryRequest req) {
        KnowledgeCategory existing = mapper.findBySlug(req.getSlug());
        if (existing != null) {
            throw new KnowledgeException(ErrorCodeConstants.KNOWLEDGE_CATEGORY_DUPLICATE, "分类标识已存在");
        }
        KnowledgeCategory cat = new KnowledgeCategory();
        cat.setName(req.getName());
        cat.setSlug(req.getSlug());
        cat.setSortOrder(req.getSortOrder() != null ? req.getSortOrder() : 0);
        cat.setIcon(req.getIcon() != null ? req.getIcon() : "BookOpen");
        cat.setDescription(req.getDescription());
        mapper.insert(cat);
        log.info("[KNOWLEDGE] Category #{} created: {}", cat.getId(), cat.getName());
        return cat;
    }

    public KnowledgeCategory update(Long id, KnowledgeCategoryRequest req) {
        KnowledgeCategory cat = findById(id);
        if (req.getName() != null) cat.setName(req.getName());
        if (req.getSlug() != null) {
            KnowledgeCategory dup = mapper.findBySlug(req.getSlug());
            if (dup != null && !dup.getId().equals(id)) {
                throw new KnowledgeException(ErrorCodeConstants.KNOWLEDGE_CATEGORY_DUPLICATE, "分类标识已存在");
            }
            cat.setSlug(req.getSlug());
        }
        if (req.getSortOrder() != null) cat.setSortOrder(req.getSortOrder());
        if (req.getIcon() != null) cat.setIcon(req.getIcon());
        if (req.getDescription() != null) cat.setDescription(req.getDescription());
        // parentId: 0 = move to root, null = don't change, >0 = move to that parent
        if (req.getParentId() != null) cat.setParentId(req.getParentId() == 0 ? null : req.getParentId());
        mapper.update(cat);
        return cat;
    }

    public void delete(Long id) {
        findById(id);
        int count = mapper.countPagesByCategory(id);
        if (count > 0) {
            throw new KnowledgeException(ErrorCodeConstants.KNOWLEDGE_CATEGORY_NOT_EMPTY, "分类下存在文档，无法删除");
        }
        mapper.deleteById(id);
        log.warn("[KNOWLEDGE] Category #{} deleted", id);
    }

    public void updateSort(List<Long> ids) {
        for (int i = 0; i < ids.size(); i++) {
            mapper.updateSortOrder(ids.get(i), i);
        }
    }

    public static class KnowledgeException extends RuntimeException {
        private final int code;

        public KnowledgeException(int code, String message) {
            super(message);
            this.code = code;
        }

        public int getCode() { return code; }
    }
}
