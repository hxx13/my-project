package com.example.demo.modules.cageshelf.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.cageshelf.service.CageInfoCodelistService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 笼位域码表 API — /api/admin/cage-info/codelists。
 * 数据存 cage_info_codelist，与 NHP crf_codelist 隔离。
 */
@RestController
@RequestMapping("/api/admin/cage-info/codelists")
@Tag(name = "笼位码表")
public class CageInfoCodelistController {

    private static final Logger log = LoggerFactory.getLogger(CageInfoCodelistController.class);

    private final AuthContextService authContextService;
    private final CageInfoCodelistService codelistService;

    public CageInfoCodelistController(AuthContextService authContextService,
                                      CageInfoCodelistService codelistService) {
        this.authContextService = authContextService;
        this.codelistService = codelistService;
    }

    private User resolveUser(HttpServletRequest req) {
        User u = authContextService.resolveUserFromBearer(req.getHeader("Authorization"));
        if (u == null) return null;
        if (u.getRole() == null) u.setRole(RoleEnum.MEMBER);
        return u;
    }

    private Result<?> requireAdmin(User u) {
        if (u == null) return Result.error("未登录");
        if (u.getStatus() != null && u.getStatus() == 0) return Result.error("账号已禁用");
        if (u.getRole().getLevel() < RoleEnum.ADMIN.getLevel()) return Result.error("无权限");
        return null;
    }

    @GetMapping
    @Operation(summary = "码表列表（含 itemCount / refCount）")
    public Result<List<Map<String, Object>>> list(HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireAdmin(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        return Result.success(codelistService.list());
    }

    @PostMapping
    @Operation(summary = "新建码表")
    public Result<Map<String, Object>> create(@RequestBody Map<String, Object> body, HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireAdmin(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        try {
            return Result.success(codelistService.create(body, u.getId()));
        } catch (Exception e) {
            return handleServiceException(e);
        }
    }

    @GetMapping("/{code}")
    @Operation(summary = "码表详情（含有序选项项）")
    public Result<Map<String, Object>> detail(@PathVariable String code, HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireAdmin(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        try {
            return Result.success(codelistService.detail(code));
        } catch (Exception e) {
            return handleServiceException(e);
        }
    }

    @PutMapping("/{code}")
    @Operation(summary = "更新码表元数据（name / folder）")
    public Result<Map<String, Object>> updateMeta(@PathVariable String code,
                                                  @RequestBody Map<String, Object> body,
                                                  HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireAdmin(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        try {
            return Result.success(codelistService.updateMeta(code, body, u.getId()));
        } catch (Exception e) {
            return handleServiceException(e);
        }
    }

    @DeleteMapping("/{code}")
    @Operation(summary = "删除码表（被字段引用时拒绝）")
    public Result<?> delete(@PathVariable String code, HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireAdmin(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        try {
            codelistService.delete(code, u.getId());
            return Result.success(null);
        } catch (Exception e) {
            return handleServiceException(e);
        }
    }

    @PostMapping("/{code}/items")
    @Operation(summary = "新增码表项")
    public Result<Map<String, Object>> addItem(@PathVariable String code,
                                               @RequestBody Map<String, Object> body,
                                               HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireAdmin(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        try {
            return Result.success(codelistService.addItem(code, body, u.getId()));
        } catch (Exception e) {
            return handleServiceException(e);
        }
    }

    @PutMapping("/{code}/items/{itemId}")
    @Operation(summary = "更新码表项（itemLabel / sortOrder）")
    public Result<?> updateItem(@PathVariable String code,
                                @PathVariable Long itemId,
                                @RequestBody Map<String, Object> body,
                                HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireAdmin(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        try {
            codelistService.updateItem(code, itemId, body, u.getId());
            return Result.success(null);
        } catch (Exception e) {
            return handleServiceException(e);
        }
    }

    @DeleteMapping("/{code}/items/{itemId}")
    @Operation(summary = "删除码表项")
    public Result<?> deleteItem(@PathVariable String code,
                                @PathVariable Long itemId,
                                HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireAdmin(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        try {
            codelistService.deleteItem(code, itemId, u.getId());
            return Result.success(null);
        } catch (Exception e) {
            return handleServiceException(e);
        }
    }

    // ── 引用链 ──

    @GetMapping("/{code}/usage")
    @Operation(summary = "码表引用链（字段 → 字典套 → 原子 → 组合）")
    public Result<Map<String, Object>> usage(@PathVariable String code, HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireAdmin(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        try {
            return Result.success(codelistService.usage(code));
        } catch (Exception e) {
            return handleServiceException(e);
        }
    }

    // ── 状态机 ──

    @PostMapping("/{code}/submit-review")
    @Operation(summary = "提交校对")
    public Result<Map<String, Object>> submitReview(@PathVariable String code, HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireAdmin(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        try {
            return Result.success(codelistService.submitReview(code, u.getId()));
        } catch (Exception e) {
            return handleServiceException(e);
        }
    }

    @PostMapping("/{code}/approve")
    @Operation(summary = "通过并冻结发布")
    public Result<Map<String, Object>> approve(@PathVariable String code, HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireAdmin(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        try {
            return Result.success(codelistService.approve(code, u.getId()));
        } catch (Exception e) {
            return handleServiceException(e);
        }
    }

    @PostMapping("/{code}/reject")
    @Operation(summary = "驳回")
    public Result<Map<String, Object>> reject(@PathVariable String code, HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireAdmin(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        try {
            return Result.success(codelistService.reject(code, u.getId()));
        } catch (Exception e) {
            return handleServiceException(e);
        }
    }

    @PostMapping("/{code}/unfreeze")
    @Operation(summary = "解冻本版")
    public Result<Map<String, Object>> unfreeze(@PathVariable String code, HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireAdmin(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        try {
            return Result.success(codelistService.unfreeze(code, u.getId()));
        } catch (Exception e) {
            return handleServiceException(e);
        }
    }

    @PostMapping("/actions/unfreeze-unused")
    @Operation(summary = "批量解冻无引用码表")
    public Result<Map<String, Object>> unfreezeUnused(HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireAdmin(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        try {
            return Result.success(codelistService.unfreezeUnused(u.getId()));
        } catch (Exception e) {
            return handleServiceException(e);
        }
    }

    // ── 子字典联动 ──

    @PostMapping("/{code}/items/{itemId}/links")
    @Operation(summary = "新增子字典联动")
    public Result<Map<String, Object>> addLink(@PathVariable String code,
                                               @PathVariable Long itemId,
                                               @RequestBody Map<String, Object> body,
                                               HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireAdmin(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        try {
            Object raw = body == null ? null : body.get("childCodelistCode");
            String childCode = raw == null ? null : String.valueOf(raw);
            return Result.success(codelistService.addLink(code, itemId, childCode, u.getId()));
        } catch (Exception e) {
            return handleServiceException(e);
        }
    }

    @DeleteMapping("/{code}/items/{itemId}/links/{linkId}")
    @Operation(summary = "移除子字典联动")
    public Result<?> removeLink(@PathVariable String code,
                                @PathVariable Long itemId,
                                @PathVariable Long linkId,
                                HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireAdmin(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        try {
            codelistService.removeLink(code, itemId, linkId, u.getId());
            return Result.success(null);
        } catch (Exception e) {
            return handleServiceException(e);
        }
    }

    @SuppressWarnings("unchecked")
    private static <T> Result<T> handleServiceException(Exception e) {
        if (e instanceof com.example.demo.common.exception.TwinBusinessException be) {
            return (Result<T>) Result.fail(be.getCode(), be.getMessage());
        }
        log.warn("[cage-info-codelist] 操作失败: {}", e.getMessage(), e);
        return (Result<T>) Result.error(e.getMessage());
    }
}
