package com.example.demo.modules.policy.controller;

import com.example.demo.common.config.AdminAuthInterceptor;
import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.policy.dto.CapabilityPolicyView;
import com.example.demo.modules.policy.dto.PatchCapabilityPolicyRequest;
import com.example.demo.modules.policy.service.CapabilityPolicyAdminService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/admin/settings/capability-policies")
@Tag(name = "业务能力策略", description = "配置各业务域角色阈值（SUPER_ADMIN）")
public class AdminCapabilityPolicyController {

    private final CapabilityPolicyAdminService adminService;

    public AdminCapabilityPolicyController(CapabilityPolicyAdminService adminService) {
        this.adminService = adminService;
    }

    @GetMapping
    @Operation(summary = "列出业务能力策略")
    public Result<List<CapabilityPolicyView>> list(HttpServletRequest request) {
        Result<?> denied = requireSuperAdmin(request);
        if (denied != null) {
            return Result.error(denied.getMessage());
        }
        return Result.success(adminService.listViews());
    }

    @PatchMapping("/{bizDomain}")
    @Operation(summary = "更新业务能力策略")
    public Result<?> patch(@PathVariable String bizDomain,
                           @RequestBody PatchCapabilityPolicyRequest body,
                           HttpServletRequest request) {
        Result<?> denied = requireSuperAdmin(request);
        if (denied != null) {
            return Result.error(denied.getMessage());
        }
        User currentUser = (User) request.getAttribute(AdminAuthInterceptor.CURRENT_ADMIN_USER_ATTR);
        String opId = currentUser == null ? null : currentUser.getId();
        return adminService.patch(bizDomain, body, opId) ? Result.success() : Result.error("更新失败或业务域不存在");
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
