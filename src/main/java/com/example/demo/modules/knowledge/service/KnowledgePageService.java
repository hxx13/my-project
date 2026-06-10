package com.example.demo.modules.knowledge.service;

import com.example.demo.common.exception.ErrorCodeConstants;
import com.example.demo.modules.knowledge.entity.KnowledgeCategory;
import com.example.demo.modules.knowledge.entity.KnowledgeHistory;
import com.example.demo.modules.knowledge.entity.KnowledgePage;
import com.example.demo.modules.knowledge.mapper.KnowledgeCategoryMapper;
import com.example.demo.modules.knowledge.mapper.KnowledgeHistoryMapper;
import com.example.demo.modules.knowledge.mapper.KnowledgePageMapper;
import com.example.demo.modules.knowledge.model.KnowledgePageSaveRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class KnowledgePageService {

    private static final Logger log = LoggerFactory.getLogger(KnowledgePageService.class);

    private final KnowledgePageMapper mapper;
    private final KnowledgeHistoryMapper historyMapper;
    private final KnowledgeCategoryMapper categoryMapper;

    public KnowledgePageService(KnowledgePageMapper mapper,
                                KnowledgeHistoryMapper historyMapper,
                                KnowledgeCategoryMapper categoryMapper) {
        this.mapper = mapper;
        this.historyMapper = historyMapper;
        this.categoryMapper = categoryMapper;
    }

    public KnowledgePage findById(Long id) {
        KnowledgePage page = mapper.findById(id);
        if (page == null) {
            throw new KnowledgeCategoryService.KnowledgeException(
                ErrorCodeConstants.KNOWLEDGE_PAGE_NOT_FOUND, "文档页面不存在");
        }
        return page;
    }

    public KnowledgePage findBySlug(Long categoryId, String slug) {
        KnowledgePage page = mapper.findByCategoryAndSlug(categoryId, slug);
        if (page == null) {
            throw new KnowledgeCategoryService.KnowledgeException(
                ErrorCodeConstants.KNOWLEDGE_PAGE_NOT_FOUND, "文档页面不存在");
        }
        return page;
    }

    public List<KnowledgePage> findByCategory(Long categoryId) {
        return mapper.findByCategory(categoryId);
    }

    @Transactional
    public KnowledgePage create(KnowledgePageSaveRequest req, String author) {
        // 校验分类存在
        KnowledgeCategory cat = categoryMapper.findById(req.getCategoryId());
        if (cat == null) {
            throw new KnowledgeCategoryService.KnowledgeException(
                ErrorCodeConstants.KNOWLEDGE_CATEGORY_NOT_FOUND, "知识库分类不存在");
        }

        // 校验 slug 唯一
        int existing = mapper.countByCategoryAndSlug(req.getCategoryId(), req.getSlug());
        if (existing > 0) {
            throw new KnowledgeCategoryService.KnowledgeException(
                ErrorCodeConstants.KNOWLEDGE_SLUG_DUPLICATE, "该分类下已存在相同标识的文档");
        }

        KnowledgePage page = new KnowledgePage();
        page.setCategoryId(req.getCategoryId());
        page.setSlug(req.getSlug());
        page.setTitle(req.getTitle());
        page.setContentHtml(req.getContentHtml() != null ? req.getContentHtml() : "");
        page.setContentMd(req.getContentMd());
        page.setSource("manual");
        page.setVersion(1);
        page.setAuthor(author != null ? author : "system");
        page.setIsPublished(1);
        mapper.insert(page);

        // 写入 v1 历史快照
        KnowledgeHistory hist = new KnowledgeHistory();
        hist.setPageId(page.getId());
        hist.setVersion(1);
        hist.setContentHtml(page.getContentHtml());
        hist.setContentMd(page.getContentMd());
        hist.setAuthor(page.getAuthor());
        hist.setSummary(req.getSummary() != null ? req.getSummary() : "初始创建");
        historyMapper.insert(hist);

        log.info("[KNOWLEDGE] Page #{} created: {} by {}", page.getId(), page.getTitle(), page.getAuthor());
        return page;
    }

    @Transactional
    public KnowledgePage update(Long id, KnowledgePageSaveRequest req, String author) {
        KnowledgePage page = findById(id);

        // 如果 slug 变更，检查唯一性
        if (req.getSlug() != null && !req.getSlug().equals(page.getSlug())) {
            int existing = mapper.countByCategoryAndSlug(page.getCategoryId(), req.getSlug());
            if (existing > 0) {
                throw new KnowledgeCategoryService.KnowledgeException(
                    ErrorCodeConstants.KNOWLEDGE_SLUG_DUPLICATE, "该分类下已存在相同标识的文档");
            }
            page.setSlug(req.getSlug());
        }

        int oldVersion = page.getVersion();
        int newVersion = oldVersion + 1;

        page.setTitle(req.getTitle() != null ? req.getTitle() : page.getTitle());
        if (req.getContentHtml() != null) page.setContentHtml(req.getContentHtml());
        if (req.getContentMd() != null) page.setContentMd(req.getContentMd());
        page.setVersion(newVersion);
        if (author != null) page.setAuthor(author);
        mapper.update(page);

        // 写入历史快照
        KnowledgeHistory hist = new KnowledgeHistory();
        hist.setPageId(page.getId());
        hist.setVersion(newVersion);
        hist.setContentHtml(page.getContentHtml());
        hist.setContentMd(page.getContentMd());
        hist.setAuthor(page.getAuthor());
        hist.setSummary(req.getSummary() != null ? req.getSummary() : ("更新至 v" + newVersion));
        historyMapper.insert(hist);

        log.info("[KNOWLEDGE] Page #{} updated: v{} → v{} by {}", id, oldVersion, newVersion, page.getAuthor());
        return page;
    }

    public void delete(Long id) {
        KnowledgePage page = findById(id);
        mapper.deleteById(id);
        log.warn("[KNOWLEDGE] Page #{} deleted: {}", id, page.getTitle());
    }

    public List<KnowledgeHistory> getHistory(Long pageId) {
        findById(pageId); // 确保页面存在
        return historyMapper.findByPageId(pageId);
    }

    @Transactional
    public KnowledgePage rollback(Long pageId, int version, String author) {
        KnowledgePage page = findById(pageId);
        KnowledgeHistory history = historyMapper.findByPageAndVersion(pageId, version);
        if (history == null) {
            throw new KnowledgeCategoryService.KnowledgeException(
                ErrorCodeConstants.KNOWLEDGE_PAGE_NOT_FOUND, "历史版本不存在");
        }

        int oldVersion = page.getVersion();
        int newVersion = oldVersion + 1;

        page.setContentHtml(history.getContentHtml());
        page.setContentMd(history.getContentMd());
        page.setVersion(newVersion);
        if (author != null) page.setAuthor(author);
        mapper.update(page);

        KnowledgeHistory newHist = new KnowledgeHistory();
        newHist.setPageId(page.getId());
        newHist.setVersion(newVersion);
        newHist.setContentHtml(page.getContentHtml());
        newHist.setContentMd(page.getContentMd());
        newHist.setAuthor(page.getAuthor());
        newHist.setSummary("回滚至 v" + version);
        historyMapper.insert(newHist);

        log.warn("[KNOWLEDGE] Page #{} rolled back: v{} → v{} (from v{} snapshot) by {}",
            pageId, oldVersion, newVersion, version, author);
        return page;
    }

    public List<KnowledgePage> search(String q, Long categoryId) {
        if (categoryId != null) {
            return mapper.searchByCategory(q, categoryId);
        }
        return mapper.search(q);
    }
}
