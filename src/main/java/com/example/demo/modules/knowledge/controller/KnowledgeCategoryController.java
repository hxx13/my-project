package com.example.demo.modules.knowledge.controller;

import com.example.demo.common.config.AdminAuthInterceptor;
import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.knowledge.entity.KnowledgeCategory;
import com.example.demo.modules.knowledge.mapper.KnowledgePageMapper;
import com.example.demo.modules.knowledge.model.KnowledgeCategoryRequest;
import com.example.demo.modules.knowledge.model.KnowledgeTreeResponse;
import com.example.demo.modules.knowledge.service.KnowledgeCategoryService;
import com.example.demo.modules.knowledge.entity.KnowledgePage;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/admin/knowledge/categories")
public class KnowledgeCategoryController {

    private final KnowledgeCategoryService categoryService;
    private final KnowledgePageMapper pageMapper;

    public KnowledgeCategoryController(KnowledgeCategoryService categoryService,
                                       KnowledgePageMapper pageMapper) {
        this.categoryService = categoryService;
        this.pageMapper = pageMapper;
    }

    @GetMapping("/tree")
    public Result<List<KnowledgeTreeResponse>> tree(HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.STAFF);
        if (denied != null) return Result.error(denied.getMessage());

        List<KnowledgeCategory> all = categoryService.findAll();
        // Build recursive tree from roots
        List<KnowledgeTreeResponse> roots = all.stream()
            .filter(c -> c.getParentId() == null)
            .map(c -> buildNode(c, all))
            .collect(Collectors.toList());
        return Result.success(roots);
    }

    private KnowledgeTreeResponse buildNode(KnowledgeCategory cat, List<KnowledgeCategory> all) {
        KnowledgeTreeResponse node = new KnowledgeTreeResponse();
        node.setCategoryId(cat.getId());
        node.setParentId(cat.getParentId());
        node.setCategoryName(cat.getName());
        node.setCategorySlug(cat.getSlug());
        node.setIcon(cat.getIcon());
        node.setSortOrder(cat.getSortOrder());

        // Pages only on leaf categories (those with actual content)
        List<KnowledgePage> pages = pageMapper.findByCategory(cat.getId());
        node.setPages(pages.stream().map(p -> {
            KnowledgeTreeResponse.PageSummary ps = new KnowledgeTreeResponse.PageSummary();
            ps.setId(p.getId()); ps.setSlug(p.getSlug());
            ps.setTitle(p.getTitle()); ps.setSource(p.getSource()); ps.setVersion(p.getVersion());
            return ps;
        }).collect(Collectors.toList()));

        // Recursive children
        List<KnowledgeTreeResponse> children = all.stream()
            .filter(c -> cat.getId().equals(c.getParentId()))
            .map(c -> buildNode(c, all))
            .collect(Collectors.toList());
        node.setChildren(children);

        return node;
    }

    @PostMapping
    public Result<KnowledgeCategory> create(@RequestBody KnowledgeCategoryRequest req,
                                            HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.SUPER_ADMIN);
        if (denied != null) return Result.error(denied.getMessage());
        return Result.success(categoryService.create(req));
    }

    @PutMapping("/{id}")
    public Result<KnowledgeCategory> update(@PathVariable Long id,
                                            @RequestBody KnowledgeCategoryRequest req,
                                            HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.SUPER_ADMIN);
        if (denied != null) return Result.error(denied.getMessage());
        return Result.success(categoryService.update(id, req));
    }

    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable Long id, HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.SUPER_ADMIN);
        if (denied != null) return Result.error(denied.getMessage());
        categoryService.delete(id);
        return Result.success(null);
    }

    @PutMapping("/sort")
    public Result<Void> sort(@RequestBody List<Long> ids, HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.SUPER_ADMIN);
        if (denied != null) return Result.error(denied.getMessage());
        categoryService.updateSort(ids);
        return Result.success(null);
    }

    private Result<?> requireMinRole(HttpServletRequest request, RoleEnum minRole) {
        Object attr = request.getAttribute(AdminAuthInterceptor.CURRENT_ADMIN_USER_ATTR);
        if (!(attr instanceof User currentUser)) {
            return Result.error("当前登录信息无效");
        }
        RoleEnum currentRole = currentUser.getRole() == null ? RoleEnum.STUDENT : currentUser.getRole();
        if (currentRole.getLevel() < minRole.getLevel()) {
            return Result.error("无权限访问");
        }
        return null;
    }
}
