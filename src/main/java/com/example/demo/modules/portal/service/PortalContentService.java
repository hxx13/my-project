package com.example.demo.modules.portal.service;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.auth.service.UserDisplayNameService;
import com.example.demo.modules.portal.dto.PortalCategoryView;
import com.example.demo.modules.portal.dto.PortalContentView;
import com.example.demo.modules.portal.dto.PortalContentUpsertRequest;
import com.example.demo.modules.portal.entity.PortalCategory;
import com.example.demo.modules.portal.entity.PortalContent;
import com.example.demo.modules.portal.mapper.PortalCategoryMapper;
import com.example.demo.modules.portal.mapper.PortalContentMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class PortalContentService {

    private final PortalContentMapper contentMapper;
    private final PortalCategoryMapper categoryMapper;
    private final UserDisplayNameService userDisplayNameService;

    public PortalContentService(PortalContentMapper contentMapper,
                                PortalCategoryMapper categoryMapper,
                                UserDisplayNameService userDisplayNameService) {
        this.contentMapper = contentMapper;
        this.categoryMapper = categoryMapper;
        this.userDisplayNameService = userDisplayNameService;
    }

    /* ── 分类 ── */

    public List<PortalCategoryView> listCategories(String scope) {
        List<PortalCategory> list = (scope != null && !scope.isBlank())
                ? categoryMapper.listByScope(scope) : categoryMapper.listAll();
        return list.stream().map(this::toCategoryView).collect(Collectors.toList());
    }

    @Transactional
    public PortalCategoryView createCategory(String name, String scope, int sortOrder) {
        PortalCategory c = new PortalCategory();
        c.setName(name);
        c.setScope(scope != null ? scope : "ALL");
        c.setSortOrder(sortOrder);
        c.setStatus(1);
        categoryMapper.insert(c);
        return toCategoryView(c);
    }

    @Transactional
    public PortalCategoryView updateCategory(Long id, String name, String scope, Integer sortOrder, Integer status) {
        PortalCategory c = categoryMapper.findById(id);
        if (c == null) return null;
        if (name != null) c.setName(name);
        if (scope != null) c.setScope(scope);
        if (sortOrder != null) c.setSortOrder(sortOrder);
        if (status != null) c.setStatus(status);
        categoryMapper.update(c);
        return toCategoryView(c);
    }

    @Transactional
    public Result<?> deleteCategory(Long id) {
        categoryMapper.deleteById(id);
        return Result.success(null);
    }

    /* ── 公开查询 ── */

    public Map<String, Object> listPublic(String type, Long categoryId, String search,
                                           String sort, int page, int size) {
        int offset = (page - 1) * size;
        List<PortalContent> list = contentMapper.listPublic(type, categoryId, search, sort, size, offset);
        int total = contentMapper.countPublic(type, categoryId, search);

        Map<Long, String> categoryNameMap = buildCategoryNameMap();

        List<PortalContentView> views = list.stream().map(c -> {
            PortalContentView v = toView(c);
            if (c.getCategoryId() != null) v.setCategoryName(categoryNameMap.get(c.getCategoryId()));
            return v;
        }).collect(Collectors.toList());
        enrichCreatedByNames(views);

        Map<String, Object> result = new HashMap<>();
        result.put("data", views);
        result.put("total", total);
        return result;
    }

    public PortalContentView getPublic(Long id) {
        PortalContent c = contentMapper.findById(id);
        if (c == null || c.getDeleted() == 1 || !"PUBLISHED".equals(c.getStatus())) return null;
        PortalContentView v = toView(c);
        if (c.getCategoryId() != null) {
            PortalCategory cat = categoryMapper.findById(c.getCategoryId());
            if (cat != null) v.setCategoryName(cat.getName());
        }
        enrichCreatedByNames(List.of(v));
        return v;
    }

    /* ── 管理查询 ── */

    public Map<String, Object> listAdmin(String type, String status, String search, int page, int size) {
        int offset = (page - 1) * size;
        List<PortalContent> list = contentMapper.listAdmin(type, status, search, size, offset);
        int total = contentMapper.countAdmin(type, status, search);
        List<PortalContentView> views = list.stream().map(this::toView).collect(Collectors.toList());
        enrichCreatedByNames(views);
        Map<String, Object> result = new HashMap<>();
        result.put("data", views);
        result.put("total", total);
        return result;
    }

    public PortalContentView getAdmin(Long id) {
        PortalContent c = contentMapper.findById(id);
        if (c == null) return null;
        PortalContentView v = toView(c);
        enrichCreatedByNames(List.of(v));
        return v;
    }

    @Transactional
    public PortalContentView create(PortalContentUpsertRequest req, String userId) {
        PortalContent c = fromRequest(req);
        c.setCreatedBy(userId);
        if ("PUBLISHED".equals(req.getStatus()) && c.getPublishedAt() == null) {
            c.setPublishedAt(LocalDateTime.now());
        }
        contentMapper.insert(c);
        PortalContentView v = toView(c);
        enrichCreatedByNames(List.of(v));
        return v;
    }

    @Transactional
    public PortalContentView update(Long id, PortalContentUpsertRequest req) {
        PortalContent c = fromRequest(req);
        c.setId(id);
        if ("PUBLISHED".equals(req.getStatus())) {
            PortalContent existing = contentMapper.findById(id);
            if (existing != null && existing.getPublishedAt() == null) {
                c.setPublishedAt(LocalDateTime.now());
            }
        }
        contentMapper.update(c);
        PortalContent updated = contentMapper.findById(id);
        if (updated == null) return null;
        PortalContentView v = toView(updated);
        enrichCreatedByNames(List.of(v));
        return v;
    }

    @Transactional
    public Result<?> softDelete(Long id, String userId) {
        int affected = contentMapper.softDelete(id, userId);
        return affected > 0 ? Result.success(null) : Result.error("删除失败：内容不存在");
    }

    @Transactional
    public Result<?> restore(Long id) {
        int affected = contentMapper.restoreById(id);
        return affected > 0 ? Result.success(null) : Result.error("恢复失败");
    }

    public Map<String, Object> listRecycle(int page, int size) {
        int offset = (page - 1) * size;
        List<PortalContent> list = contentMapper.listRecycle(size, offset);
        int total = contentMapper.countRecycle();
        List<PortalContentView> views = list.stream().map(this::toView).collect(Collectors.toList());
        enrichCreatedByNames(views);
        Map<String, Object> result = new HashMap<>();
        result.put("data", views);
        result.put("total", total);
        return result;
    }

    @Transactional
    public Result<?> purge(Long id) {
        int affected = contentMapper.hardDeleteById(id);
        return affected > 0 ? Result.success(null) : Result.error("彻底删除失败");
    }

    /* ── 辅助 ── */

    private PortalContentView toView(PortalContent c) {
        PortalContentView v = new PortalContentView();
        v.setId(c.getId());
        v.setContentType(c.getContentType());
        v.setCategoryId(c.getCategoryId());
        v.setTitle(c.getTitle());
        v.setSummary(c.getSummary());
        v.setCoverUrl(c.getCoverUrl());
        v.setContentHtml(c.getContentHtml());
        v.setExtensionJson(c.getExtensionJson());
        v.setStatus(c.getStatus());
        v.setSortOrder(c.getSortOrder());
        v.setPublishedAt(c.getPublishedAt());
        v.setCreatedBy(c.getCreatedBy());
        v.setCreatedAt(c.getCreatedAt());
        v.setUpdatedAt(c.getUpdatedAt());
        return v;
    }

    private PortalCategoryView toCategoryView(PortalCategory c) {
        PortalCategoryView v = new PortalCategoryView();
        v.setId(c.getId());
        v.setName(c.getName());
        v.setScope(c.getScope());
        v.setParentId(c.getParentId());
        v.setSortOrder(c.getSortOrder());
        v.setStatus(c.getStatus());
        v.setCoverUrl(c.getCoverUrl());
        return v;
    }

    private PortalContent fromRequest(PortalContentUpsertRequest req) {
        PortalContent c = new PortalContent();
        c.setContentType(req.getContentType());
        c.setCategoryId(req.getCategoryId());
        c.setTitle(req.getTitle());
        c.setSummary(req.getSummary());
        c.setCoverUrl(req.getCoverUrl());
        c.setContentHtml(req.getContentHtml());
        c.setExtensionJson(req.getExtensionJson());
        c.setStatus(req.getStatus() != null ? req.getStatus() : "DRAFT");
        c.setSortOrder(0);
        if (req.getPublishedAt() != null && !req.getPublishedAt().isBlank()) {
            String raw = req.getPublishedAt();
            if (raw.contains("T")) {
                c.setPublishedAt(LocalDateTime.parse(raw));
            } else {
                c.setPublishedAt(LocalDateTime.parse(raw + "T00:00:00"));
            }
        }
        return c;
    }

    private Map<Long, String> buildCategoryNameMap() {
        return categoryMapper.listAll().stream()
                .collect(Collectors.toMap(PortalCategory::getId, PortalCategory::getName));
    }

    private void enrichCreatedByNames(List<PortalContentView> views) {
        if (views == null || views.isEmpty()) {
            return;
        }
        LinkedHashSet<String> ids = new LinkedHashSet<>();
        for (PortalContentView v : views) {
            if (v != null && StringUtils.hasText(v.getCreatedBy())) {
                ids.add(v.getCreatedBy().trim());
            }
        }
        if (ids.isEmpty()) {
            return;
        }
        Map<String, String> names = userDisplayNameService.resolveDisplayNames(ids);
        for (PortalContentView v : views) {
            if (v == null || !StringUtils.hasText(v.getCreatedBy())) {
                continue;
            }
            String n = names.get(v.getCreatedBy().trim());
            v.setCreatedByName(StringUtils.hasText(n) ? n : v.getCreatedBy().trim());
        }
    }
}
