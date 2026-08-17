package com.example.demo.modules.institution.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.institution.entity.Institution;
import com.example.demo.modules.institution.service.InstitutionService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 院校字典（学院/机构/医院）。列表登录即可读（人员归属选择用），写操作需 SUPER_ADMIN。
 */
@RestController
@RequestMapping("/api/institution")
@Tag(name = "院校字典")
public class InstitutionController {

    private final AuthContextService authContextService;
    private final InstitutionService institutionService;

    public InstitutionController(AuthContextService authContextService,
                                 InstitutionService institutionService) {
        this.authContextService = authContextService;
        this.institutionService = institutionService;
    }

    private User resolveUser(String authorization) {
        User u = authContextService.resolveUserFromBearer(authorization);
        if (u == null) return null;
        if (u.getRole() == null) u.setRole(RoleEnum.MEMBER);
        return u;
    }

    private Result<?> requireSuperAdmin(User u) {
        if (u == null) return Result.error("未登录");
        if (u.getRole() == null || u.getRole().getLevel() < RoleEnum.SUPER_ADMIN.getLevel()) {
            return Result.error("无权限（仅超级管理员）");
        }
        return null;
    }

    @GetMapping
    @Operation(summary = "启用中的院校列表（人员归属选择用）")
    public Result<List<Institution>> listActive(@RequestHeader(value = "Authorization", required = false) String authorization) {
        User u = resolveUser(authorization);
        if (u == null) return Result.fail(401, "未登录");
        return Result.success(institutionService.listActive());
    }

    @GetMapping("/all")
    @Operation(summary = "全部院校（含停用，管理用）")
    public Result<List<Institution>> listAll(@RequestHeader(value = "Authorization", required = false) String authorization) {
        User u = resolveUser(authorization);
        Result<?> denied = requireSuperAdmin(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        return Result.success(institutionService.listAll());
    }

    @PostMapping
    @Operation(summary = "新建院校")
    public Result<Institution> create(@RequestHeader(value = "Authorization", required = false) String authorization,
                                      @RequestBody Map<String, Object> body) {
        User u = resolveUser(authorization);
        Result<?> denied = requireSuperAdmin(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        Institution inst = institutionService.create(
                str(body, "code"), str(body, "name"), str(body, "type"), toInt(body.get("sortOrder")));
        return Result.success(inst);
    }

    @PutMapping("/{id}")
    @Operation(summary = "更新院校")
    public Result<Institution> update(@RequestHeader(value = "Authorization", required = false) String authorization,
                                      @PathVariable Long id,
                                      @RequestBody Map<String, Object> body) {
        User u = resolveUser(authorization);
        Result<?> denied = requireSuperAdmin(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        Institution inst = institutionService.update(id, str(body, "name"), str(body, "type"),
                toInt(body.get("sortOrder")), toInt(body.get("active")));
        return Result.success(inst);
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "删除院校")
    public Result<?> delete(@RequestHeader(value = "Authorization", required = false) String authorization,
                            @PathVariable Long id) {
        User u = resolveUser(authorization);
        Result<?> denied = requireSuperAdmin(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        institutionService.delete(id);
        return Result.success();
    }

    private static String str(Map<String, Object> m, String k) {
        Object v = m.get(k); return v == null ? null : String.valueOf(v).trim();
    }

    private static Integer toInt(Object v) {
        if (v == null) return null;
        if (v instanceof Number n) return n.intValue();
        try { return Integer.parseInt(String.valueOf(v).trim()); } catch (Exception e) { return null; }
    }
}
