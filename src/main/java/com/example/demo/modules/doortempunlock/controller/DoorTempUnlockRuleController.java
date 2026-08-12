package com.example.demo.modules.doortempunlock.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.doortempunlock.entity.DoorTempUnlockRule;
import com.example.demo.modules.doortempunlock.service.DoorTempUnlockRuleService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/admin/door-temp-unlock")
@Tag(name = "门禁临时解锁规则", description = "门禁临时解锁规则的增删改查与启禁用管理")
public class DoorTempUnlockRuleController {

    private static final Logger log = LoggerFactory.getLogger(DoorTempUnlockRuleController.class);
    private final DoorTempUnlockRuleService service;
    private final AuthContextService authContextService;

    public DoorTempUnlockRuleController(DoorTempUnlockRuleService service, AuthContextService authContextService) {
        this.service = service;
        this.authContextService = authContextService;
    }

    @GetMapping("/rules")
    @Operation(summary = "查询全部临时解锁规则（含已禁用）")
    public Result<?> list(@RequestHeader(value = "Authorization", required = false) String authorization) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        try {
            List<DoorTempUnlockRule> rules = service.listAll();
            return Result.success(rules);
        } catch (Exception e) {
            return Result.error(e.getMessage() != null ? e.getMessage() : "查询失败");
        }
    }

    @PostMapping("/rules")
    @Operation(summary = "新增临时解锁规则")
    public Result<?> create(@RequestHeader(value = "Authorization", required = false) String authorization,
                            @RequestBody DoorTempUnlockRule rule) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        try {
            DoorTempUnlockRule created = service.create(rule);
            return Result.success(created);
        } catch (Exception e) {
            return Result.error(e.getMessage() != null ? e.getMessage() : "创建失败");
        }
    }

    @PutMapping("/rules/{id}")
    @Operation(summary = "更新临时解锁规则")
    public Result<?> update(@RequestHeader(value = "Authorization", required = false) String authorization,
                            @PathVariable Long id,
                            @RequestBody DoorTempUnlockRule input) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        try {
            DoorTempUnlockRule updated = service.update(id, input);
            if (updated == null) return Result.error("规则不存在: " + id);
            return Result.success(updated);
        } catch (Exception e) {
            return Result.error(e.getMessage() != null ? e.getMessage() : "更新失败");
        }
    }

    @DeleteMapping("/rules/{id}")
    @Operation(summary = "删除临时解锁规则")
    public Result<?> delete(@RequestHeader(value = "Authorization", required = false) String authorization,
                            @PathVariable Long id) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        try {
            boolean ok = service.delete(id);
            if (!ok) return Result.error("规则不存在: " + id);
            return Result.success();
        } catch (Exception e) {
            return Result.error(e.getMessage() != null ? e.getMessage() : "删除失败");
        }
    }

    @PatchMapping("/rules/{id}/toggle")
    @Operation(summary = "切换临时解锁规则启禁用状态")
    public Result<?> toggle(@RequestHeader(value = "Authorization", required = false) String authorization,
                            @PathVariable Long id) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        try {
            DoorTempUnlockRule updated = service.toggle(id);
            if (updated == null) return Result.error("规则不存在: " + id);
            return Result.success(updated);
        } catch (Exception e) {
            return Result.error(e.getMessage() != null ? e.getMessage() : "切换状态失败");
        }
    }

    private Result<?> requireAdmin(String authorization) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null) return Result.error("未登录或令牌无效");
        if (user.getStatus() != null && user.getStatus() == 0) return Result.error("账号已禁用");
        RoleEnum role = user.getRole() != null ? user.getRole() : RoleEnum.MEMBER;
        if (role.getLevel() < RoleEnum.ADMIN.getLevel()) return Result.error("无权限访问");
        return null;
    }
}
