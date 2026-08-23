package com.example.demo.modules.cageshelf.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.cageshelf.entity.CageInfoField;
import com.example.demo.modules.cageshelf.service.CageInfoFieldService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletRequest;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 管理端笼位字段字典 API — 字段 CRUD + 发布 + 码表列表。
 */
@RestController
@RequestMapping("/api/admin/cage-info")
@Tag(name = "笼位字段字典")
public class CageInfoFieldController {

    private static final Logger log = LoggerFactory.getLogger(CageInfoFieldController.class);

    private final AuthContextService authContextService;
    private final CageInfoFieldService fieldService;

    public CageInfoFieldController(AuthContextService authContextService,
                                   CageInfoFieldService fieldService) {
        this.authContextService = authContextService;
        this.fieldService = fieldService;
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

    // ── 字段字典 ──

    @GetMapping("/fields")
    @Operation(summary = "字段字典列表（全部，含 published 标记）")
    public Result<List<CageInfoField>> fields(HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireAdmin(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        return Result.success(fieldService.listAll());
    }

    @PostMapping("/fields")
    @Operation(summary = "新建自定义字段")
    public Result<CageInfoField> create(@RequestBody Map<String, Object> body,
                                        HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireAdmin(u);
        if (denied != null) return Result.fail(403, denied.getMessage());

        try {
            return Result.success(fieldService.create(body));
        } catch (Exception e) {
            return handleServiceException(e);
        }
    }

    @PutMapping("/fields/{id}")
    @Operation(summary = "更新字段（label/dataType/dictKey/required/sort/showWhen）")
    public Result<CageInfoField> update(@PathVariable Long id,
                                        @RequestBody Map<String, Object> body,
                                        HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireAdmin(u);
        if (denied != null) return Result.fail(403, denied.getMessage());

        try {
            return Result.success(fieldService.update(id, body));
        } catch (Exception e) {
            return handleServiceException(e);
        }
    }

    @DeleteMapping("/fields/{id}")
    @Operation(summary = "删除自定义字段（系统同步字段不可删除）")
    public Result<?> delete(@PathVariable Long id, HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireAdmin(u);
        if (denied != null) return Result.fail(403, denied.getMessage());

        try {
            fieldService.delete(id);
            return Result.success(null);
        } catch (Exception e) {
            return handleServiceException(e);
        }
    }

    // ── 发布 ──

    @PostMapping("/publish")
    @Operation(summary = "发布字段（fieldIds 缺席/null 则发布全部）")
    public Result<Map<String, Object>> publish(@RequestBody(required = false) Map<String, Object> body,
                                               HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireAdmin(u);
        if (denied != null) return Result.fail(403, denied.getMessage());

        try {
            // 仅当 fieldIds 真正缺席或为 null 时全量发布；
            // 存在但为空列表或含非数字项 → 400，避免垃圾 ids 误触发全量。
            List<Long> fieldIds = null;
            if (body != null && body.containsKey("fieldIds") && body.get("fieldIds") != null) {
                fieldIds = parseFieldIds(body.get("fieldIds"));
            }
            int affected = fieldService.publish(fieldIds);
            return Result.success(Map.of("affected", affected));
        } catch (Exception e) {
            return handleServiceException(e);
        }
    }

    // ── 码表列表 ──

    @GetMapping("/codelists")
    @Operation(summary = "可用码表列表（dict_key 选择器）")
    public Result<List<Map<String, Object>>> codelists(HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireAdmin(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        return Result.success(fieldService.listCodelists());
    }

    // ── helpers ──

    @SuppressWarnings("unchecked")
    private static <T> Result<T> handleServiceException(Exception e) {
        if (e instanceof com.example.demo.common.exception.TwinBusinessException be) {
            return (Result<T>) Result.fail(be.getCode(), be.getMessage());
        }
        log.warn("[cage-info-field] 操作失败: {}", e.getMessage(), e);
        return (Result<T>) Result.error(e.getMessage());
    }

    private static List<Long> parseFieldIds(Object v) {
        if (!(v instanceof List<?> list) || list.isEmpty()) {
            throw new com.example.demo.common.exception.TwinBusinessException(400, "fieldIds 无效");
        }
        List<Long> out = new ArrayList<>();
        for (Object item : list) {
            if (item instanceof Number n) {
                out.add(n.longValue());
            } else if (item != null) {
                try {
                    out.add(Long.parseLong(String.valueOf(item).trim()));
                } catch (NumberFormatException e) {
                    throw new com.example.demo.common.exception.TwinBusinessException(400, "fieldIds 无效");
                }
            } else {
                throw new com.example.demo.common.exception.TwinBusinessException(400, "fieldIds 无效");
            }
        }
        return out;
    }
}
