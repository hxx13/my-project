package com.example.demo.modules.twin.dahua.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.twin.dahua.entity.DahuaSwingStatsPullTask;
import com.example.demo.modules.twin.dahua.service.DahuaSwingStatsPullService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/admin/twin/dahua/stats-tasks")
@Tag(name = "Twin-Dahua-Stats-Pull", description = "统计用门禁批量拉取（固定时间段，无即时联动）")
public class AdminDahuaSwingStatsPullController {

    private final DahuaSwingStatsPullService statsPullService;
    private final AuthContextService authContextService;

    public AdminDahuaSwingStatsPullController(
            DahuaSwingStatsPullService statsPullService, AuthContextService authContextService) {
        this.statsPullService = statsPullService;
        this.authContextService = authContextService;
    }

    @GetMapping
    @Operation(summary = "统计拉取任务列表")
    public Result<?> list(@RequestHeader(value = "Authorization", required = false) String authorization) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        return Result.success(statsPullService.listTasks());
    }

    @PostMapping
    public Result<?> create(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody DahuaSwingStatsPullTask body) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        try {
            return Result.success(statsPullService.createTask(body));
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }

    @PutMapping("/{id}")
    public Result<?> update(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable Long id,
            @RequestBody DahuaSwingStatsPullTask body) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        try {
            body.setId(id);
            return Result.success(statsPullService.updateTask(body));
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }

    @DeleteMapping("/{id}")
    public Result<?> delete(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable Long id) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        return Result.success(statsPullService.deleteTask(id));
    }

    @PostMapping("/{id}/execute")
    @Operation(summary = "立即执行（按任务 period 或可选覆盖时间窗；回溯可 forceOverwrite 强制全范围重拉）")
    public Result<?> execute(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable Long id,
            @RequestParam(required = false) String startTime,
            @RequestParam(required = false) String endTime,
            @RequestParam(defaultValue = "false") boolean forceOverwrite) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        try {
            return Result.success(statsPullService.executeTaskNow(id, startTime, endTime, forceOverwrite));
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }

    @PostMapping("/execute-all-in-plan")
    @Operation(summary = "执行所有处于计划窗口内的启用任务（供定时 Job 或手动）")
    public Result<?> executeAllInPlan(
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        try {
            return Result.success(statsPullService.executeAllWithinPlan());
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }

    private Result<?> requireAdmin(String authorization) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null) {
            return Result.error("未登录或令牌无效");
        }
        RoleEnum role = user.getRole() != null ? user.getRole() : RoleEnum.STUDENT;
        if (role.getLevel() < RoleEnum.ADMIN.getLevel()) {
            return Result.error("无权限访问");
        }
        return null;
    }
}
