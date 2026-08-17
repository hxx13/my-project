package com.example.demo.modules.inventory.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.inventory.dto.CategoryNodeView;
import com.example.demo.modules.inventory.dto.CategoryUpsertReq;
import com.example.demo.modules.inventory.entity.InvCategory;
import com.example.demo.modules.inventory.service.CategoryService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/inventory/categories")
@Tag(name = "物品台账分类", description = "分类树管理")
public class CategoryController {

    private final AuthContextService authContextService;
    private final CategoryService categoryService;

    public CategoryController(AuthContextService authContextService, CategoryService categoryService) {
        this.authContextService = authContextService;
        this.categoryService = categoryService;
    }

    @GetMapping("/tree")
    @Operation(summary = "分类树")
    public Result<List<CategoryNodeView>> tree() {
        return categoryService.tree();
    }

    @PostMapping
    @Operation(summary = "新建分类")
    public Result<InvCategory> create(@RequestHeader(value = "Authorization", required = false) String auth,
                                      @RequestBody CategoryUpsertReq req) {
        User user = resolveUser(auth);
        if (user == null) return Result.error("未登录");
        return categoryService.create(req);
    }

    @PutMapping("/{id}")
    @Operation(summary = "更新分类")
    public Result<InvCategory> update(@RequestHeader(value = "Authorization", required = false) String auth,
                                      @PathVariable Long id,
                                      @RequestBody CategoryUpsertReq req) {
        User user = resolveUser(auth);
        if (user == null) return Result.error("未登录");
        return categoryService.update(id, req);
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "删除分类")
    public Result<?> delete(@RequestHeader(value = "Authorization", required = false) String auth,
                            @PathVariable Long id) {
        User user = resolveUser(auth);
        if (user == null) return Result.error("未登录");
        return categoryService.delete(id);
    }

    private User resolveUser(String auth) {
        return authContextService.resolveUserFromBearer(auth);
    }
}
