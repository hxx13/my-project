package com.example.demo.modules.notification.controller;

import com.example.demo.common.config.AdminAuthInterceptor;
import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.notification.service.ExternalCommConfigService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/settings")
@Tag(name = "外部通信配置", description = "对外通信配置抓取与只读巡检")
public class ExternalCommConfigController {
    private final ExternalCommConfigService externalCommConfigService;

    public ExternalCommConfigController(ExternalCommConfigService externalCommConfigService) {
        this.externalCommConfigService = externalCommConfigService;
    }

    @GetMapping("/external-comm-config")
    @Operation(summary = "获取外部通信配置总览(只读)")
    public Result<?> overview(HttpServletRequest request) {
        Result<?> denied = requireSuperAdmin(request);
        if (denied != null) return denied;
        return Result.success(externalCommConfigService.collectOverview());
    }

    private Result<?> requireSuperAdmin(HttpServletRequest request) {
        Object attr = request.getAttribute(AdminAuthInterceptor.CURRENT_ADMIN_USER_ATTR);
        if (!(attr instanceof User currentUser)) {
            return Result.error("当前登录信息无效");
        }
        RoleEnum currentRole = currentUser.getRole() == null ? RoleEnum.STUDENT : currentUser.getRole();
        if (currentRole.getLevel() < RoleEnum.SUPER_ADMIN.getLevel()) {
            return Result.error("无权限访问");
        }
        return null;
    }
}

