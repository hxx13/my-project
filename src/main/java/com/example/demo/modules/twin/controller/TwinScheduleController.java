package com.example.demo.modules.twin.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.twin.entity.TwinJobScheduleConfig;
import com.example.demo.modules.twin.service.JobSchedulerService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/twin/schedules")
@CrossOrigin("*")
@Tag(name = "定时管理", description = "统一定时任务配置")
public class TwinScheduleController {
    private final JobSchedulerService jobSchedulerService;
    private final AuthContextService authContextService;

    public TwinScheduleController(JobSchedulerService jobSchedulerService, AuthContextService authContextService) {
        this.jobSchedulerService = jobSchedulerService;
        this.authContextService = authContextService;
    }

    @GetMapping
    @Operation(summary = "定时任务配置列表")
    public Result<?> list(@RequestHeader(value = "Authorization", required = false) String authorization) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        List<TwinJobScheduleConfig> data = jobSchedulerService.listAll();
        return Result.success(data);
    }

    @PutMapping("/{jobKey}")
    @Operation(summary = "保存单任务定时配置")
    public Result<?> save(@RequestHeader(value = "Authorization", required = false) String authorization,
                          @PathVariable String jobKey,
                          @RequestBody Map<String, Object> body) {
        User user = authContextService.resolveUserFromBearer(authorization);
        Result<?> denied = requireAdmin(user);
        if (denied != null) return denied;
        try {
            TwinJobScheduleConfig row = new TwinJobScheduleConfig();
            row.setJobKey(jobKey);
            row.setEnabled(Boolean.TRUE.equals(body.get("enabled")) ? 1 : 0);
            row.setScheduleType(body.get("scheduleType") == null ? "DAILY" : String.valueOf(body.get("scheduleType")));
            row.setScheduleTime(body.get("scheduleTime") == null ? "02:00" : String.valueOf(body.get("scheduleTime")));
            row.setScheduleStartTime(body.get("scheduleStartTime") == null ? "07:00" : String.valueOf(body.get("scheduleStartTime")));
            row.setScheduleEndTime(body.get("scheduleEndTime") == null ? "22:00" : String.valueOf(body.get("scheduleEndTime")));
            row.setWeekDays(body.get("weekDays") == null ? "" : String.valueOf(body.get("weekDays")));
            Object poll = body.get("pollIntervalSeconds");
            if (poll != null) {
                try {
                    if (poll instanceof Number n) {
                        row.setPollIntervalSeconds(n.intValue());
                    } else {
                        row.setPollIntervalSeconds(Integer.parseInt(String.valueOf(poll).trim()));
                    }
                } catch (NumberFormatException ignored) {
                    row.setPollIntervalSeconds(null);
                }
            }
            return Result.success(jobSchedulerService.updateSchedule(row, user.getId()));
        } catch (Exception e) {
            return Result.error("保存失败: " + e.getMessage());
        }
    }

    @PostMapping("/{jobKey}/run")
    @Operation(summary = "立即执行任务")
    public Result<?> runNow(@RequestHeader(value = "Authorization", required = false) String authorization,
                            @PathVariable String jobKey) {
        User user = authContextService.resolveUserFromBearer(authorization);
        Result<?> denied = requireAdmin(user);
        if (denied != null) return denied;
        try {
            jobSchedulerService.runManual(jobKey, user.getId());
            return Result.success("执行成功");
        } catch (Exception e) {
            return Result.error("执行失败: " + e.getMessage());
        }
    }

    private Result<?> requireAdmin(String authorization) {
        User user = authContextService.resolveUserFromBearer(authorization);
        return requireAdmin(user);
    }

    private Result<?> requireAdmin(User user) {
        if (user == null) return Result.error("未登录或令牌无效");
        if (user.getStatus() != null && user.getStatus() == 0) return Result.error("账号已禁用");
        RoleEnum role = user.getRole() != null ? user.getRole() : RoleEnum.STUDENT;
        if (role.getLevel() < RoleEnum.ADMIN.getLevel()) return Result.error("无权限访问");
        return null;
    }
}
