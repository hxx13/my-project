package com.example.demo.modules.notification.push.admin;

import com.example.demo.common.config.ApiAuthInterceptor;
import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.*;

@RestController
@RequestMapping("/api/admin/push-log")
public class AdminPushLogController {

    private Result<?> requireSuperAdmin(HttpServletRequest request) {
        User user = (User) request.getAttribute(ApiAuthInterceptor.CURRENT_USER_ATTR);
        if (user == null || user.getRole() != RoleEnum.SUPER_ADMIN) return Result.error("仅超级管理员可操作");
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
        Result<?> denied = requireSuperAdmin(request); if (denied != null) return Result.error(denied.getMessage());
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("data", List.of());
        data.put("total", 0);
        data.put("note", "详细查询委托给 mapper 后续实现");
        return Result.success(data);
    }

    @GetMapping("/stats")
    public Result<Map<String, Object>> stats(HttpServletRequest request) {
        Result<?> denied = requireSuperAdmin(request); if (denied != null) return Result.error(denied.getMessage());
        return Result.success(Map.of("sent24h", 0, "success24h", 0, "failed24h", 0));
    }

    @GetMapping("/{id}")
    public Result<Map<String, Object>> detail(@PathVariable Long id, HttpServletRequest request) {
        Result<?> denied = requireSuperAdmin(request); if (denied != null) return Result.error(denied.getMessage());
        return Result.success(Map.of("id", id, "note", "详情查询委托给 mapper 后续实现"));
    }
}
