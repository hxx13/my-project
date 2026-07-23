package com.example.demo.modules.knowledge.service;

import com.example.demo.common.exception.ErrorCodeConstants;
import com.example.demo.modules.knowledge.entity.KnowledgeCategory;
import com.example.demo.modules.knowledge.entity.KnowledgeHistory;
import com.example.demo.modules.knowledge.entity.KnowledgePage;
import com.example.demo.modules.knowledge.mapper.KnowledgeCategoryMapper;
import com.example.demo.modules.knowledge.mapper.KnowledgeHistoryMapper;
import com.example.demo.modules.knowledge.mapper.KnowledgePageMapper;
import com.example.demo.modules.knowledge.model.KnowledgeImportRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;

@Service
public class KnowledgeImportService {

    private static final Logger log = LoggerFactory.getLogger(KnowledgeImportService.class);

    private final KnowledgePageMapper pageMapper;
    private final KnowledgeCategoryMapper categoryMapper;
    private final KnowledgeHistoryMapper historyMapper;

    public KnowledgeImportService(KnowledgePageMapper pageMapper,
                                  KnowledgeCategoryMapper categoryMapper,
                                  KnowledgeHistoryMapper historyMapper) {
        this.pageMapper = pageMapper;
        this.categoryMapper = categoryMapper;
        this.historyMapper = historyMapper;
    }

    @Transactional
    public KnowledgePage importSingle(KnowledgeImportRequest req) {
        KnowledgeCategory cat = categoryMapper.findById(req.getCategoryId());
        if (cat == null) {
            throw new KnowledgeCategoryService.KnowledgeException(
                ErrorCodeConstants.KNOWLEDGE_CATEGORY_NOT_FOUND, "知识库分类不存在");
        }

        String slug = generateSlug(req.getTitle());
        int existing = pageMapper.countByCategoryAndSlug(req.getCategoryId(), slug);
        if (existing > 0) {
            throw new KnowledgeCategoryService.KnowledgeException(
                ErrorCodeConstants.KNOWLEDGE_SLUG_DUPLICATE, "该分类下已存在相同标识的文档: " + slug);
        }

        KnowledgePage page = new KnowledgePage();
        page.setCategoryId(req.getCategoryId());
        page.setSlug(slug);
        page.setTitle(req.getTitle());
        page.setContentHtml("html".equalsIgnoreCase(req.getFormat()) ? req.getContent() : req.getContent());
        page.setContentMd("markdown".equalsIgnoreCase(req.getFormat()) ? req.getContent() : null);
        page.setSource("agent".equals(req.getAuthor()) || (req.getAuthor() != null && req.getAuthor().startsWith("agent:"))
            ? "agent" : "imported");
        page.setVersion(1);
        page.setAuthor(req.getAuthor() != null ? req.getAuthor() : "system");
        page.setIsPublished(1);
        pageMapper.insert(page);

        KnowledgeHistory hist = new KnowledgeHistory();
        hist.setPageId(page.getId());
        hist.setVersion(1);
        hist.setContentHtml(page.getContentHtml());
        hist.setContentMd(page.getContentMd());
        hist.setAuthor(page.getAuthor());
        hist.setSummary("导入");
        historyMapper.insert(hist);

        log.info("[KNOWLEDGE] Imported page #{}: {} by {}", page.getId(), page.getTitle(), page.getAuthor());
        return page;
    }

    @Transactional
    public List<KnowledgePage> importBatch(List<KnowledgeImportRequest> items) {
        List<KnowledgePage> results = new ArrayList<>();
        int success = 0;
        int skipped = 0;
        List<String> errors = new ArrayList<>();

        for (KnowledgeImportRequest item : items) {
            try {
                KnowledgePage page = importSingle(item);
                results.add(page);
                success++;
            } catch (KnowledgeCategoryService.KnowledgeException e) {
                skipped++;
                errors.add(item.getTitle() + " — " + e.getMessage());
                log.warn("[KNOWLEDGE] Import skipped: {} — {}", item.getTitle(), e.getMessage());
            } catch (Exception e) {
                errors.add(item.getTitle() + " — " + e.getMessage());
                log.error("[KNOWLEDGE] Import error: {}", item.getTitle(), e);
            }
        }

        log.info("[KNOWLEDGE] Import completed: {} total, {} success, {} skipped",
            items.size(), success, skipped);
        return results;
    }

    /**
     * 从标题生成 slug：中文 → 拼音首字母缩写，英文 → 小写连字符
     */
    public static String generateSlug(String title) {
        if (title == null || title.isBlank()) return "untitled";
        // 简单处理：替换非字母数字为连字符，去重连字符
        String slug = title.trim()
            .replaceAll("[^a-zA-Z0-9\\u4e00-\\u9fa5]", "-")
            .replaceAll("-+", "-")
            .replaceAll("^-|-$", "");
        if (slug.isBlank()) return "untitled";
        return slug.toLowerCase();
    }
}
