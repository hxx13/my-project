package com.example.demo.modules.admin.controller;

import com.example.demo.common.config.AdminAuthInterceptor;
import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.twin.service.SystemDiagnosticsService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 超时排查：对比 MySQL 与 ARO 官方接口延迟（SUPER_ADMIN）。
 */
@RestController
@RequestMapping("/api/admin/diagnostics")
@Tag(name = "系统诊断", description = "MySQL / ARO 延迟探测（排查扫码与定时任务超时）")
public class AdminSystemDiagnosticsController {

    private final SystemDiagnosticsService diagnosticsService;

    public AdminSystemDiagnosticsController(SystemDiagnosticsService diagnosticsService) {
        this.diagnosticsService = diagnosticsService;
    }

    @GetMapping("/latency-probe")
    @Operation(summary = "探测 MySQL ping 与 ARO 登录/滞留接口耗时")
    public Result<Map<String, Object>> latencyProbe(
            HttpServletRequest request,
            @RequestParam(required = false) String sampleUserId) {
        Result<?> denied = requireSuperAdmin(request);
        if (denied != null) {
            return (Result<Map<String, Object>>) denied;
        }
        return Result.success(diagnosticsService.runLatencyProbe(sampleUserId));
    }

    private Result<?> requireSuperAdmin(HttpServletRequest request) {
        Object attr = request.getAttribute(AdminAuthInterceptor.CURRENT_ADMIN_USER_ATTR);
        if (!(attr instanceof User user)) {
            return Result.fail(401, "未登录");
        }
        if (user.getRole() == null || user.getRole().getLevel() < RoleEnum.SUPER_ADMIN.getLevel()) {
            return Result.fail(403, "需要超级管理员权限");
        }
        return null;
    }
}
