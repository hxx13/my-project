package com.example.demo.modules.twin.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.twin.service.TwinAutomationLogService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/twin/automation-logs")
@CrossOrigin("*")
@Tag(name = "自动化日志", description = "自动化行为与触发原因审计")
public class TwinAutomationLogController {
    private static final DateTimeFormatter DT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final TwinAutomationLogService automationLogService;
    private final AuthContextService authContextService;

    public TwinAutomationLogController(TwinAutomationLogService automationLogService, AuthContextService authContextService) {
        this.automationLogService = automationLogService;
        this.authContextService = authContextService;
    }

    @GetMapping
    @Operation(summary = "分页查询自动化日志")
    public Result<?> list(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam(required = false) String automationType,
            @RequestParam(required = false) String triggerType,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String startTime,
            @RequestParam(required = false) String endTime,
            @RequestParam(defaultValue = "true") boolean excludePenetrationPoll,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "50") int pageSize
    ) {
        Result<?> denied = requireStaff(authorization);
        if (denied != null) {
            return denied;
        }
        try {
            LocalDateTime st = parseTime(startTime);
            LocalDateTime et = parseTime(endTime);
            Map<String, Object> data = automationLogService.listPage(
                    automationType,
                    triggerType,
                    keyword,
                    st,
                    et,
                    page,
                    pageSize,
                    excludePenetrationPoll
            );
            return Result.success(data);
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        } catch (Exception e) {
            return Result.error("查询失败: " + e.getMessage());
        }
    }

    private LocalDateTime parseTime(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        String v = raw.trim();
        try {
            if (v.length() == 10) {
                v = v + " 00:00:00";
            }
            return LocalDateTime.parse(v, DT);
        } catch (DateTimeParseException e) {
            throw new IllegalArgumentException("时间格式必须为 yyyy-MM-dd HH:mm:ss");
        }
    }

    private Result<?> requireStaff(String authorization) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null) return Result.error("未登录或令牌无效");
        if (user.getStatus() != null && user.getStatus() == 0) return Result.error("账号已禁用");
        RoleEnum role = user.getRole() != null ? user.getRole() : RoleEnum.STUDENT;
        if (role.getLevel() < RoleEnum.STAFF.getLevel()) return Result.error("无权限访问");
        return null;
    }
}
