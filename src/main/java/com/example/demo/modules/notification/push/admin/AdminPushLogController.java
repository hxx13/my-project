package com.example.demo.modules.notification.push.admin;

import com.example.demo.common.config.AdminAuthInterceptor;
import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.notification.mapper.NotificationMiniProgramMapper;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.*;

@RestController
@RequestMapping("/api/admin/push-log")
public class AdminPushLogController {

    private final NotificationMiniProgramMapper logMapper;

    public AdminPushLogController(NotificationMiniProgramMapper logMapper) {
        this.logMapper = logMapper;
    }

    private Result<?> requireAdmin(HttpServletRequest request) {
        Object attr = request.getAttribute(AdminAuthInterceptor.CURRENT_ADMIN_USER_ATTR);
        if (!(attr instanceof User user)) return Result.error("当前登录信息无效");
        if (user.getRole().getLevel() < RoleEnum.ADMIN.getLevel()) return Result.error("无权限访问");
        return null;
    }

    @GetMapping("/list")
    public Result<Map<String, Object>> list(
            @RequestParam(required = false) String sourceCode,
            @RequestParam(required = false) String channelCode,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            HttpServletRequest request) {
        Result<?> denied = requireAdmin(request); if (denied != null) return Result.error(denied.getMessage());

        LocalDateTime startTime = startDate != null ? startDate.atStartOfDay() : null;
        LocalDateTime endTime = endDate != null ? endDate.atTime(LocalTime.MAX) : null;

        long total = logMapper.countPushLogs(sourceCode, channelCode, status, startTime, endTime);
        int offset = (page - 1) * size;
        List<Map<String, Object>> rows = total > 0
                ? logMapper.listPushLogs(sourceCode, channelCode, status, startTime, endTime, offset, size)
                : List.of();

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("data", rows != null ? rows : List.of());
        data.put("total", total);
        data.put("page", page);
        data.put("size", size);
        return Result.success(data);
    }

    @GetMapping("/stats")
    public Result<Map<String, Object>> stats(HttpServletRequest request) {
        Result<?> denied = requireAdmin(request); if (denied != null) return Result.error(denied.getMessage());

        Map<String, Object> stats = logMapper.getPushStats(LocalDateTime.now().minusHours(24));
        return Result.success(stats != null ? stats : Map.of());
    }

    @GetMapping("/{id}")
    public Result<Map<String, Object>> detail(@PathVariable Long id, HttpServletRequest request) {
        Result<?> denied = requireAdmin(request); if (denied != null) return Result.error(denied.getMessage());

        Map<String, Object> detail = logMapper.getPushLogDetail(id);
        if (detail == null) return Result.error("日志不存在");
        return Result.success(detail);
    }
}
