package com.example.demo.modules.twin.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.twin.entity.DahuaSwingPullTask;
import com.example.demo.modules.twin.service.DahuaSwingPullService;
import com.example.demo.modules.twin.service.DahuaSwingRuleConfigService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/admin/twin/dahua")
@Tag(name = "Twin-Dahua-Swing", description = "大华门禁记录任务配置与记录库查询")
public class AdminDahuaSwingController {
    private final DahuaSwingPullService dahuaSwingPullService;
    private final DahuaSwingRuleConfigService dahuaSwingRuleConfigService;
    private final AuthContextService authContextService;

    public AdminDahuaSwingController(
            DahuaSwingPullService dahuaSwingPullService,
            DahuaSwingRuleConfigService dahuaSwingRuleConfigService,
            AuthContextService authContextService
    ) {
        this.dahuaSwingPullService = dahuaSwingPullService;
        this.dahuaSwingRuleConfigService = dahuaSwingRuleConfigService;
        this.authContextService = authContextService;
    }

    @GetMapping("/tasks")
    @Operation(summary = "任务列表")
    public Result<?> listTasks(@RequestHeader(value = "Authorization", required = false) String authorization) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        return Result.success(dahuaSwingPullService.listTasks());
    }

    @PostMapping("/tasks")
    @Operation(summary = "创建任务")
    public Result<?> createTask(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody DahuaSwingPullTask body
    ) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        try {
            return Result.success(dahuaSwingPullService.createTask(body));
        } catch (Exception e) {
            return Result.error("创建大华拉取任务失败: " + readableError(e));
        }
    }

    @PutMapping("/tasks/{id}")
    @Operation(summary = "更新任务")
    public Result<?> updateTask(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable("id") Long id,
            @RequestBody DahuaSwingPullTask body
    ) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        try {
            body.setId(id);
            boolean ok = dahuaSwingPullService.updateTask(body);
            return ok ? Result.success() : Result.error("任务不存在或未更新");
        } catch (Exception e) {
            return Result.error("更新大华拉取任务失败: " + readableError(e));
        }
    }

    @DeleteMapping("/tasks/{id}")
    @Operation(summary = "删除任务")
    public Result<?> deleteTask(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable("id") Long id
    ) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        boolean ok = dahuaSwingPullService.deleteTask(id);
        return ok ? Result.success() : Result.error("任务不存在或已删除");
    }

    @PostMapping("/tasks/{id}/execute")
    @Operation(summary = "手动执行任务")
    public Result<?> executeTask(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable("id") Long id
    ) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        try {
            return Result.success(dahuaSwingPullService.executeTaskNow(id));
        } catch (Exception e) {
            return Result.error("执行大华拉取任务失败(taskId=" + id + "): " + readableError(e));
        }
    }

    @PostMapping("/tasks/execute-all")
    @Operation(summary = "执行全部启用任务")
    public Result<?> executeAll(
            @RequestHeader(value = "Authorization", required = false) String authorization
    ) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        try {
            return Result.success(dahuaSwingPullService.executeAllEnabledTasks());
        } catch (Exception e) {
            return Result.error("批量执行大华拉取任务失败: " + readableError(e));
        }
    }

    @GetMapping("/records")
    @Operation(summary = "门禁记录库分页查询")
    public Result<?> listRecords(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam(required = false) Long taskId,
            @RequestParam(required = false) String channelCode,
            @RequestParam(required = false) String personCode,
            @RequestParam(required = false) String personName,
            @RequestParam(required = false) Integer openType,
            @RequestParam(required = false) String startTime,
            @RequestParam(required = false) String endTime,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "100") int size
    ) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        try {
            Map<String, Object> pageData = dahuaSwingPullService.listRecords(
                    taskId, channelCode, personCode, personName, openType, startTime, endTime, page, size
            );
            return Result.success(pageData);
        } catch (Exception e) {
            return Result.error("查询门禁记录库失败: " + readableError(e));
        }
    }

    @PostMapping("/rules/dry-run")
    @Operation(summary = "规则干跑测试（仅回显）")
    public Result<?> dryRun(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody Map<String, Object> body
    ) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        Map<String, Object> out = new HashMap<>();
        out.put("input", body);
        out.put("message", "dry-run 已接收，正式执行请通过任务拉取触发");
        return Result.success(out);
    }

    @GetMapping("/rules/config")
    @Operation(summary = "读取独立联动规则配置")
    public Result<?> getRuleConfig(@RequestHeader(value = "Authorization", required = false) String authorization) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        return Result.success(dahuaSwingRuleConfigService.getConfig());
    }

    @PutMapping("/rules/config")
    @Operation(summary = "保存独立联动规则配置")
    public Result<?> saveRuleConfig(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody Map<String, Object> body
    ) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        dahuaSwingRuleConfigService.saveConfig(body);
        return Result.success();
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

    private String readableError(Throwable throwable) {
        Throwable cur = throwable;
        while (cur.getCause() != null) {
            cur = cur.getCause();
        }
        String msg = cur.getMessage();
        if (msg == null || msg.isBlank()) {
            msg = throwable.getMessage();
        }
        if (msg == null || msg.isBlank()) {
            return "未知错误（无可读错误信息）";
        }
        return msg.length() > 500 ? msg.substring(0, 500) : msg;
    }
}
