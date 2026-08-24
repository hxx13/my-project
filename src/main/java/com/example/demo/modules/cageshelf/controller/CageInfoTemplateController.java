package com.example.demo.modules.cageshelf.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.cageshelf.service.CageInfoTemplateService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 笼位表单模板 API — /api/admin/cage-info/templates。
 * 原子模板（每域）+ 组合模板（cage_detail）。
 */
@RestController
@RequestMapping("/api/admin/cage-info/templates")
@Tag(name = "笼位表单模板")
public class CageInfoTemplateController {

    private static final Logger log = LoggerFactory.getLogger(CageInfoTemplateController.class);

    private final AuthContextService authContextService;
    private final CageInfoTemplateService templateService;

    public CageInfoTemplateController(AuthContextService authContextService,
                                      CageInfoTemplateService templateService) {
        this.authContextService = authContextService;
        this.templateService = templateService;
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
    @Operation(summary = "模板列表")
    public Result<List<Map<String, Object>>> list(HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireAdmin(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        return Result.success(templateService.list());
    }

    @GetMapping("/{formKey}")
    @Operation(summary = "模板详情（含结构树）")
    public Result<Map<String, Object>> detail(@PathVariable String formKey, HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireAdmin(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        try {
            return Result.success(templateService.detail(formKey));
        } catch (Exception e) {
            return handleServiceException(e);
        }
    }

    @PostMapping("/regenerate")
    @Operation(summary = "从字典套结构 + 已发布字段重建原子/组合模板")
    public Result<Map<String, Object>> regenerate(HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireAdmin(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        try {
            return Result.success(templateService.regenerate(u.getId()));
        } catch (Exception e) {
            return handleServiceException(e);
        }
    }

    @PostMapping("/{formKey}/publish")
    @Operation(summary = "发布模板")
    public Result<Map<String, Object>> publish(@PathVariable String formKey, HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireAdmin(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        try {
            return Result.success(templateService.publish(formKey, u.getId()));
        } catch (Exception e) {
            return handleServiceException(e);
        }
    }

    @PostMapping("/{formKey}/unfreeze")
    @Operation(summary = "解冻模板")
    public Result<Map<String, Object>> unfreeze(@PathVariable String formKey, HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireAdmin(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        try {
            return Result.success(templateService.unfreeze(formKey, u.getId()));
        } catch (Exception e) {
            return handleServiceException(e);
        }
    }

    @PostMapping("/compose")
    @Operation(summary = "组合原子域：新建组合模板（钉住指定原子域）")
    public Result<Map<String, Object>> compose(@RequestBody Map<String, Object> body, HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireAdmin(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        try {
            String formKey = body == null ? null : String.valueOf(body.get("formKey"));
            String title = body == null ? null : String.valueOf(body.get("title"));
            List<String> atomFormKeys = parseStringList(body == null ? null : body.get("atoms"));
            return Result.success(templateService.compose(formKey, title, atomFormKeys, u.getId()));
        } catch (Exception e) {
            return handleServiceException(e);
        }
    }

    @DeleteMapping("/{formKey}")
    @Operation(summary = "删除模板（原子被组合钉住时拒绝）")
    public Result<?> delete(@PathVariable String formKey, HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireAdmin(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        try {
            templateService.delete(formKey, u.getId());
            return Result.success(null);
        } catch (Exception e) {
            return handleServiceException(e);
        }
    }

    @SuppressWarnings("unchecked")
    private static List<String> parseStringList(Object v) {
        if (!(v instanceof List<?> list) || list.isEmpty()) {
            throw new com.example.demo.common.exception.TwinBusinessException(400, "atoms 不能为空");
        }
        List<String> out = new java.util.ArrayList<>();
        for (Object item : list) {
            if (item != null) out.add(String.valueOf(item).trim());
        }
        return out;
    }

    @SuppressWarnings("unchecked")
    private static <T> Result<T> handleServiceException(Exception e) {
        if (e instanceof com.example.demo.common.exception.TwinBusinessException be) {
            return (Result<T>) Result.fail(be.getCode(), be.getMessage());
        }
        log.warn("[cage-info-template] 操作失败: {}", e.getMessage(), e);
        return (Result<T>) Result.error(e.getMessage());
    }
}
