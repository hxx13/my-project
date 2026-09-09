package com.example.demo.modules.doorswiperule.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.doorswiperule.engine.DoorSwipeRuleEngine;
import com.example.demo.modules.doorswiperule.entity.DoorSwipeRuleChannelScope;
import com.example.demo.modules.doorswiperule.entity.DoorSwipeRuleConfig;
import com.example.demo.modules.doorswiperule.service.DoorSwipeRuleChannelScopeService;
import com.example.demo.modules.doorswiperule.service.DoorSwipeRuleRecordService;
import com.example.demo.modules.doorswiperule.service.DoorSwipeRuleService;
import com.example.demo.modules.twin.common.service.TwinAutomationLogService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin/door-swipe-rule")
@Tag(name = "门禁成功刷卡规则", description = "成功刷卡触发门常开的规则、受控通道与记录管理（仅平台所有者）")
public class DoorSwipeRuleController {

    private static final Logger log = LoggerFactory.getLogger(DoorSwipeRuleController.class);
    private static final DateTimeFormatter DT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final DoorSwipeRuleService ruleService;
    private final DoorSwipeRuleChannelScopeService channelScopeService;
    private final DoorSwipeRuleRecordService recordService;
    private final TwinAutomationLogService automationLogService;
    private final AuthContextService authContextService;

    public DoorSwipeRuleController(DoorSwipeRuleService ruleService,
                                   DoorSwipeRuleChannelScopeService channelScopeService,
                                   DoorSwipeRuleRecordService recordService,
                                   TwinAutomationLogService automationLogService,
                                   AuthContextService authContextService) {
        this.ruleService = ruleService;
        this.channelScopeService = channelScopeService;
        this.recordService = recordService;
        this.automationLogService = automationLogService;
        this.authContextService = authContextService;
    }

    // ── 规则 CRUD ──

    @GetMapping("/rules")
    @Operation(summary = "查询全部成功刷卡规则（含已禁用）")
    public Result<?> listRules(@RequestHeader(value = "Authorization", required = false) String authorization) {
        Result<?> denied = requirePlatformOwner(authorization);
        if (denied != null) return denied;
        try {
            return Result.success(ruleService.listAll());
        } catch (Exception e) {
            return Result.error(e.getMessage() != null ? e.getMessage() : "查询失败");
        }
    }

    @PostMapping("/rules")
    @Operation(summary = "新增成功刷卡规则")
    public Result<?> createRule(@RequestHeader(value = "Authorization", required = false) String authorization,
                                @RequestBody DoorSwipeRuleConfig rule) {
        Result<?> denied = requirePlatformOwner(authorization);
        if (denied != null) return denied;
        try {
            return Result.success(ruleService.create(rule));
        } catch (Exception e) {
            return Result.error(e.getMessage() != null ? e.getMessage() : "创建失败");
        }
    }

    @PutMapping("/rules/{id}")
    @Operation(summary = "更新成功刷卡规则")
    public Result<?> updateRule(@RequestHeader(value = "Authorization", required = false) String authorization,
                                @PathVariable Long id,
                                @RequestBody DoorSwipeRuleConfig input) {
        Result<?> denied = requirePlatformOwner(authorization);
        if (denied != null) return denied;
        try {
            DoorSwipeRuleConfig updated = ruleService.update(id, input);
            if (updated == null) return Result.error("规则不存在: " + id);
            return Result.success(updated);
        } catch (Exception e) {
            return Result.error(e.getMessage() != null ? e.getMessage() : "更新失败");
        }
    }

    @DeleteMapping("/rules/{id}")
    @Operation(summary = "删除成功刷卡规则")
    public Result<?> deleteRule(@RequestHeader(value = "Authorization", required = false) String authorization,
                                @PathVariable Long id) {
        Result<?> denied = requirePlatformOwner(authorization);
        if (denied != null) return denied;
        try {
            boolean ok = ruleService.delete(id);
            if (!ok) return Result.error("规则不存在: " + id);
            return Result.success();
        } catch (Exception e) {
            return Result.error(e.getMessage() != null ? e.getMessage() : "删除失败");
        }
    }

    @PatchMapping("/rules/{id}/toggle")
    @Operation(summary = "启停成功刷卡规则")
    public Result<?> toggleRule(@RequestHeader(value = "Authorization", required = false) String authorization,
                                @PathVariable Long id) {
        Result<?> denied = requirePlatformOwner(authorization);
        if (denied != null) return denied;
        try {
            DoorSwipeRuleConfig updated = ruleService.toggle(id);
            if (updated == null) return Result.error("规则不存在: " + id);
            return Result.success(updated);
        } catch (Exception e) {
            return Result.error(e.getMessage() != null ? e.getMessage() : "切换状态失败");
        }
    }

    // ── 受控通道 ──

    @GetMapping("/channels")
    @Operation(summary = "查询受控通道列表")
    public Result<?> listChannels(@RequestHeader(value = "Authorization", required = false) String authorization) {
        Result<?> denied = requirePlatformOwner(authorization);
        if (denied != null) return denied;
        try {
            return Result.success(channelScopeService.list());
        } catch (Exception e) {
            return Result.error(e.getMessage() != null ? e.getMessage() : "查询失败");
        }
    }

    @PutMapping("/channels/replace")
    @Operation(summary = "批量替换受控通道 scope")
    public Result<?> replaceChannels(@RequestHeader(value = "Authorization", required = false) String authorization,
                                     @RequestBody List<Map<String, String>> channels) {
        Result<?> denied = requirePlatformOwner(authorization);
        if (denied != null) return denied;
        try {
            List<DoorSwipeRuleChannelScope> result = channelScopeService.replaceScope(channels, resolveOperator(authorization));
            return Result.success(result);
        } catch (Exception e) {
            return Result.error(e.getMessage() != null ? e.getMessage() : "替换失败");
        }
    }

    @PatchMapping("/channels/{code}/toggle")
    @Operation(summary = "启停单个受控通道")
    public Result<?> toggleChannel(@RequestHeader(value = "Authorization", required = false) String authorization,
                                   @PathVariable String code) {
        Result<?> denied = requirePlatformOwner(authorization);
        if (denied != null) return denied;
        try {
            DoorSwipeRuleChannelScope updated = channelScopeService.toggle(code, resolveOperator(authorization));
            if (updated == null) return Result.error("通道不存在: " + code);
            return Result.success(updated);
        } catch (Exception e) {
            return Result.error(e.getMessage() != null ? e.getMessage() : "切换状态失败");
        }
    }

    // ── 记录 ──

    @GetMapping("/records")
    @Operation(summary = "分页查询成功刷卡记录（筛通道/人/openType/时间）")
    public Result<?> listRecords(@RequestHeader(value = "Authorization", required = false) String authorization,
                                 @RequestParam(required = false) String channelCode,
                                 @RequestParam(required = false) String person,
                                 @RequestParam(required = false) Integer openType,
                                 @RequestParam(required = false) String startTime,
                                 @RequestParam(required = false) String endTime,
                                 @RequestParam(defaultValue = "1") int page,
                                 @RequestParam(defaultValue = "20") int pageSize) {
        Result<?> denied = requirePlatformOwner(authorization);
        if (denied != null) return denied;
        try {
            return Result.success(recordService.page(channelCode, person, openType, startTime, endTime, page, pageSize));
        } catch (Exception e) {
            return Result.error(e.getMessage() != null ? e.getMessage() : "查询失败");
        }
    }

    // ── 操作记录（复用 twin_automation_log） ──

    @GetMapping("/operation-logs")
    @Operation(summary = "分页查询门禁成功刷卡规则操作记录")
    public Result<?> listOperationLogs(@RequestHeader(value = "Authorization", required = false) String authorization,
                                       @RequestParam(required = false) String triggerType,
                                       @RequestParam(required = false) String keyword,
                                       @RequestParam(required = false) String startTime,
                                       @RequestParam(required = false) String endTime,
                                       @RequestParam(defaultValue = "1") int page,
                                       @RequestParam(defaultValue = "20") int pageSize) {
        Result<?> denied = requirePlatformOwner(authorization);
        if (denied != null) return denied;
        try {
            Map<String, Object> data = automationLogService.listPage(
                    DoorSwipeRuleEngine.TYPE_DOOR_SWIPE_RULE,
                    triggerType,
                    keyword,
                    parseTime(startTime),
                    parseTime(endTime),
                    page,
                    pageSize,
                    true
            );
            return Result.success(data);
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        } catch (Exception e) {
            return Result.error(e.getMessage() != null ? e.getMessage() : "查询失败");
        }
    }

    // ── 鉴权 ──

    private Result<?> requirePlatformOwner(String authorization) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null) return Result.error("未登录或令牌无效");
        if (user.getStatus() != null && user.getStatus() == 0) return Result.error("账号已禁用");
        RoleEnum role = user.getRole() != null ? user.getRole() : RoleEnum.MEMBER;
        if (role.getLevel() < RoleEnum.PLATFORM_OWNER.getLevel()) return Result.error("无权限访问");
        return null;
    }

    private String resolveOperator(String authorization) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null) return null;
        return user.getUsername() != null && !user.getUsername().isBlank() ? user.getUsername() : user.getId();
    }

    private LocalDateTime parseTime(String raw) {
        if (raw == null || raw.isBlank()) return null;
        String v = raw.trim();
        try {
            if (v.length() == 10) v = v + " 00:00:00";
            return LocalDateTime.parse(v, DT);
        } catch (DateTimeParseException e) {
            throw new IllegalArgumentException("时间格式必须为 yyyy-MM-dd HH:mm:ss");
        }
    }
}
