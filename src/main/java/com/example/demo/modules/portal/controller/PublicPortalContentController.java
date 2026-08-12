package com.example.demo.modules.portal.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.portal.dto.PortalCategoryView;
import com.example.demo.modules.portal.dto.PortalContentView;
import com.example.demo.modules.portal.service.PortalContentService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/public/portal")
@Tag(name = "公开·门户内容", description = "新闻、公告、模型资源的公开只读接口")
public class PublicPortalContentController {

    private final PortalContentService service;

    public PublicPortalContentController(PortalContentService service) {
        this.service = service;
    }

    @GetMapping("/content")
    @Operation(summary = "分页查询已发布内容")
    public Result<Map<String, Object>> listContent(
            @RequestParam(value = "type", required = false) String type,
            @RequestParam(value = "categoryId", required = false) Long categoryId,
            @RequestParam(value = "search", required = false) String search,
            @RequestParam(value = "sort", defaultValue = "default") String sort,
            @RequestParam(value = "page", defaultValue = "1") int page,
            @RequestParam(value = "size", defaultValue = "20") int size) {
        return Result.success(service.listPublic(type, categoryId, search, sort, page, size));
    }

    @GetMapping("/content/{id}")
    @Operation(summary = "内容详情")
    public Result<PortalContentView> getContent(@PathVariable Long id) {
        PortalContentView v = service.getPublic(id);
        return v != null ? Result.success(v) : Result.error("内容不存在");
    }

    @GetMapping("/categories")
    @Operation(summary = "分类列表")
    public Result<List<PortalCategoryView>> listCategories(
            @RequestParam(value = "scope", required = false) String scope) {
        return Result.success(service.listCategories(scope));
    }
}
