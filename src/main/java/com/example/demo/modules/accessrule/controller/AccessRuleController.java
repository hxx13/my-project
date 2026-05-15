package com.example.demo.modules.accessrule.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.accessrule.dto.AccessRuleSaveRequest;
import com.example.demo.modules.accessrule.service.AccessRuleService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/access-rules")
@CrossOrigin("*")
@Tag(name = "门禁规则", description = "扫码按房间+人员匹配并下发大华授权")
public class AccessRuleController {

    private final AccessRuleService accessRuleService;
    private final AuthContextService authContextService;

    public AccessRuleController(AccessRuleService accessRuleService, AuthContextService authContextService) {
        this.accessRuleService = accessRuleService;
        this.authContextService = authContextService;
    }

    @GetMapping
    @Operation(summary = "分页查询规则列表")
    public Result<?> list(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "50") int pageSize,
            @RequestParam(required = false) String keyword) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        try {
            return Result.success(accessRuleService.list(keyword, page, pageSize));
        } catch (Exception e) {
            return Result.error(e.getMessage() != null ? e.getMessage() : "查询失败");
        }
    }

    @GetMapping("/{id}")
    @Operation(summary = "规则详情（含子项）")
    public Result<?> detail(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable long id) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        try {
            var v = accessRuleService.getDetail(id);
            if (v == null) {
                return Result.error("规则不存在");
            }
            return Result.success(v);
        } catch (Exception e) {
            return Result.error(e.getMessage() != null ? e.getMessage() : "加载失败");
        }
    }

    @PostMapping
    @Operation(summary = "新增规则")
    public Result<?> create(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody AccessRuleSaveRequest body) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        try {
            long id = accessRuleService.create(body);
            return Result.success(java.util.Map.of("id", id));
        } catch (IllegalArgumentException ex) {
            return Result.error(ex.getMessage());
        } catch (Exception e) {
            return Result.error(e.getMessage() != null ? e.getMessage() : "保存失败");
        }
    }

    @PutMapping("/{id}")
    @Operation(summary = "更新规则（全量替换子项）")
    public Result<?> update(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable long id,
            @RequestBody AccessRuleSaveRequest body) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        try {
            accessRuleService.update(id, body);
            return Result.success();
        } catch (IllegalArgumentException ex) {
            return Result.error(ex.getMessage());
        } catch (Exception e) {
            return Result.error(e.getMessage() != null ? e.getMessage() : "保存失败");
        }
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "删除规则")
    public Result<?> delete(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable long id) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        try {
            accessRuleService.delete(id);
            return Result.success();
        } catch (Exception e) {
            return Result.error(e.getMessage() != null ? e.getMessage() : "删除失败");
        }
    }

    private Result<?> requireAdmin(String authorization) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null) {
            return Result.error("未登录或令牌无效");
        }
        if (user.getStatus() != null && user.getStatus() == 0) {
            return Result.error("账号已禁用");
        }
        RoleEnum role = user.getRole() != null ? user.getRole() : RoleEnum.STUDENT;
        if (role.getLevel() < RoleEnum.ADMIN.getLevel()) {
            return Result.error("无权限访问");
        }
        return null;
    }
}
