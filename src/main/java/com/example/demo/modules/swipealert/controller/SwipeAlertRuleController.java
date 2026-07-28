package com.example.demo.modules.swipealert.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.swipealert.entity.SwipeAlertRule;
import com.example.demo.modules.swipealert.mapper.SwipeAlertRuleMapper;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/admin/swipe-alert/rules")
@Tag(name = "刷卡预警规则", description = "刷卡预警规则的增删改查与启禁用管理")
public class SwipeAlertRuleController {

    private final SwipeAlertRuleMapper mapper;
    private final AuthContextService authContextService;

    public SwipeAlertRuleController(SwipeAlertRuleMapper mapper, AuthContextService authContextService) {
        this.mapper = mapper;
        this.authContextService = authContextService;
    }

    @GetMapping
    @Operation(summary = "查询全部启用的预警规则")
    public Result<?> list(@RequestHeader(value = "Authorization", required = false) String authorization) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        try {
            List<SwipeAlertRule> rules = mapper.findByEnabledTrue();
            return Result.success(rules);
        } catch (Exception e) {
            return Result.error(e.getMessage() != null ? e.getMessage() : "查询失败");
        }
    }

    @PostMapping
    @Operation(summary = "新增预警规则")
    public Result<?> create(@RequestHeader(value = "Authorization", required = false) String authorization,
                            @RequestBody SwipeAlertRule rule) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        try {
            mapper.insert(rule);
            if (rule.getNotifyUserIds() != null) mapper.updateNotifyUserIds(rule.getId(), rule.getNotifyUserIds());
            SwipeAlertRule created = mapper.findById(rule.getId());
            return Result.success(created);
        } catch (Exception e) {
            return Result.error(e.getMessage() != null ? e.getMessage() : "创建失败");
        }
    }

    @PutMapping("/{id}")
    @Operation(summary = "更新预警规则")
    public Result<?> update(@RequestHeader(value = "Authorization", required = false) String authorization,
                            @PathVariable Long id,
                            @RequestBody SwipeAlertRule input) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        try {
            SwipeAlertRule existing = mapper.findById(id);
            if (existing == null) return Result.error("规则不存在: " + id);
            input.setId(id);
            mapper.update(input);
            if (input.getNotifyUserIds() != null) mapper.updateNotifyUserIds(id, input.getNotifyUserIds());
            SwipeAlertRule updated = mapper.findById(id);
            return Result.success(updated);
        } catch (Exception e) {
            return Result.error(e.getMessage() != null ? e.getMessage() : "更新失败");
        }
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "删除预警规则")
    public Result<?> delete(@RequestHeader(value = "Authorization", required = false) String authorization,
                            @PathVariable Long id) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        try {
            mapper.deleteById(id);
            return Result.success();
        } catch (Exception e) {
            return Result.error(e.getMessage() != null ? e.getMessage() : "删除失败");
        }
    }

    @PatchMapping("/{id}/toggle")
    @Operation(summary = "切换预警规则启禁用状态")
    public Result<?> toggle(@RequestHeader(value = "Authorization", required = false) String authorization,
                            @PathVariable Long id) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        try {
            SwipeAlertRule existing = mapper.findById(id);
            if (existing == null) return Result.error("规则不存在: " + id);
            existing.setEnabled(!existing.getEnabled());
            mapper.update(existing);
            SwipeAlertRule updated = mapper.findById(id);
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
