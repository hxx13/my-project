package com.example.demo.modules.portal.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.portal.dto.PortalCategoryView;
import com.example.demo.modules.portal.service.PortalContentService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/portal/admin/categories")
@Tag(name = "门户分类管理", description = "门户内容分类的增删改查")
public class PortalCategoryAdminController {

    private final PortalContentService service;

    public PortalCategoryAdminController(PortalContentService service) {
        this.service = service;
    }

    @GetMapping
    @Operation(summary = "全部分类")
    public Result<List<PortalCategoryView>> listAll() {
        return Result.success(service.listCategories(null));
    }

    @PostMapping
    @Operation(summary = "新建分类")
    public Result<PortalCategoryView> create(@RequestBody Map<String, Object> body) {
        String name = (String) body.get("name");
        String scope = (String) body.getOrDefault("scope", "ALL");
        int sortOrder = body.get("sortOrder") instanceof Number ? ((Number) body.get("sortOrder")).intValue() : 0;
        return Result.success(service.createCategory(name, scope, sortOrder));
    }

    @PatchMapping("/{id}")
    @Operation(summary = "更新分类")
    public Result<PortalCategoryView> update(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        String name = (String) body.get("name");
        String scope = (String) body.get("scope");
        Integer sortOrder = body.get("sortOrder") instanceof Number ? ((Number) body.get("sortOrder")).intValue() : null;
        Integer status = body.get("status") instanceof Number ? ((Number) body.get("status")).intValue() : null;
        PortalCategoryView v = service.updateCategory(id, name, scope, sortOrder, status);
        return v != null ? Result.success(v) : Result.error("分类不存在");
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "删除分类")
    public Result<?> delete(@PathVariable Long id) {
        return service.deleteCategory(id);
    }
}
