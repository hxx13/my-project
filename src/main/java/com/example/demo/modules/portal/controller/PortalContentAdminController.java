package com.example.demo.modules.portal.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.portal.dto.PortalContentView;
import com.example.demo.modules.portal.dto.PortalContentUpsertRequest;
import com.example.demo.modules.portal.service.PortalContentService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 门户内容管理后台接口。
 * 鉴权由 {@code AdminAuthInterceptor}（要求 STAFF+）统一拦截；
 * 前端 PortalContentAdminShell + PortalHeader 下拉菜单再做 ADMIN 可见性控制。
 */
@RestController
@RequestMapping("/api/portal/admin/content")
@Tag(name = "门户内容管理", description = "新闻、公告、模型资源的后台管理")
public class PortalContentAdminController {

    private final PortalContentService service;
    private final AuthContextService authContextService;

    public PortalContentAdminController(PortalContentService service,
                                         AuthContextService authContextService) {
        this.service = service;
        this.authContextService = authContextService;
    }

    private User resolveUser(String authHeader) {
        if (authHeader == null || authHeader.isBlank()) return null;
        return authContextService.resolveUserFromBearer(authHeader);
    }

    @GetMapping
    @Operation(summary = "管理列表")
    public Result<Map<String, Object>> list(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @RequestParam(value = "type", required = false) String type,
            @RequestParam(value = "status", required = false) String status,
            @RequestParam(value = "search", required = false) String search,
            @RequestParam(value = "page", defaultValue = "1") int page,
            @RequestParam(value = "size", defaultValue = "20") int size) {
        return Result.success(service.listAdmin(type, status, search, page, size));
    }

    @GetMapping("/{id}")
    @Operation(summary = "管理详情")
    public Result<PortalContentView> get(@PathVariable Long id) {
        PortalContentView v = service.getAdmin(id);
        return v != null ? Result.success(v) : Result.error("内容不存在");
    }

    @PostMapping
    @Operation(summary = "新建内容")
    public Result<PortalContentView> create(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @RequestBody PortalContentUpsertRequest body) {
        User user = resolveUser(auth);
        String userId = user != null ? user.getId() : null;
        return Result.success(service.create(body, userId));
    }

    @PatchMapping("/{id}")
    @Operation(summary = "更新内容")
    public Result<PortalContentView> update(
            @PathVariable Long id, @RequestBody PortalContentUpsertRequest body) {
        return Result.success(service.update(id, body));
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "软删除")
    public Result<?> delete(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable Long id) {
        User user = resolveUser(auth);
        String userId = user != null ? user.getId() : null;
        return service.softDelete(id, userId);
    }

    @GetMapping("/recycle")
    @Operation(summary = "回收站列表")
    public Result<Map<String, Object>> listRecycle(
            @RequestParam(value = "page", defaultValue = "1") int page,
            @RequestParam(value = "size", defaultValue = "20") int size) {
        return Result.success(service.listRecycle(page, size));
    }

    @PostMapping("/recycle/{id}/restore")
    @Operation(summary = "恢复")
    public Result<?> restore(@PathVariable Long id) {
        return service.restore(id);
    }

    @DeleteMapping("/recycle/{id}")
    @Operation(summary = "物理删除")
    public Result<?> purge(@PathVariable Long id) {
        return service.purge(id);
    }
}
