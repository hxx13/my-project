package com.example.demo.modules.admin.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.config.AdminAuthInterceptor;
import com.example.demo.modules.admin.dto.CreateSystemStaffRequest;
import com.example.demo.modules.admin.dto.UpdateRoleRequest;
import com.example.demo.modules.admin.dto.UpdateStatusRequest;
import com.example.demo.modules.admin.service.AdminService;
import com.example.demo.modules.auth.dto.UpdateDisplayNicknameRequest;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.service.SpecialChannelService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/admin")
@Tag(name = "后台管理", description = "人员授权与账户管理接口")
public class AdminController {

    private final AdminService adminService;
    private final SpecialChannelService specialChannelService;

    public AdminController(AdminService adminService, SpecialChannelService specialChannelService) {
        this.adminService = adminService;
        this.specialChannelService = specialChannelService;
    }

    @GetMapping("/personnel")
    @Operation(summary = "分页查询人员授权库")
    public Result<?> listPersonnel(@RequestParam(defaultValue = "1") int page,
                                   @RequestParam(defaultValue = "20") int size,
                                   @RequestParam(required = false) String keyword,
                                   HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.SUPER_ADMIN);
        if (denied != null) return denied;
        return Result.success(adminService.listPersonnel(page, size, keyword));
    }

    @GetMapping("/system-users")
    @Operation(summary = "分页查询系统用户")
    public Result<?> listSystemOnlyUsers(@RequestParam(defaultValue = "1") int page,
                                         @RequestParam(defaultValue = "20") int size,
                                         @RequestParam(required = false) String keyword,
                                         HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.SUPER_ADMIN);
        if (denied != null) return denied;
        return Result.success(adminService.listSystemUsers(page, size, keyword));
    }

    @PostMapping("/system-users")
    @Operation(summary = "新增员工账号（账号密码，无人员库绑定；不可创建平台所有者）")
    public Result<?> createSystemStaffUser(@RequestBody CreateSystemStaffRequest request, HttpServletRequest httpRequest) {
        Result<?> denied = requireSuperAdmin(httpRequest);
        if (denied != null) return denied;
        try {
            return Result.success(adminService.createSystemStaffUser(request));
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    @DeleteMapping("/users/{id}")
    @Operation(summary = "删除系统用户（须无人员库绑定；内置根账号与当前登录账号不可删）")
    public Result<?> deleteSystemUser(@PathVariable String id, HttpServletRequest httpRequest) {
        Result<?> denied = requireSuperAdmin(httpRequest);
        if (denied != null) return denied;
        Object attr = httpRequest.getAttribute(AdminAuthInterceptor.CURRENT_ADMIN_USER_ATTR);
        String currentUserId = attr instanceof User me ? me.getId() : "";
        try {
            adminService.deleteSystemUser(id, currentUserId);
            return Result.success();
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    @PatchMapping("/users/{id}/role")
    @Operation(summary = "修改用户角色")
    public Result<?> updateRole(@PathVariable String id,
                                @RequestBody UpdateRoleRequest request,
                                HttpServletRequest httpRequest) {
        Result<?> denied = requireSuperAdmin(httpRequest);
        if (denied != null) return denied;
        try {
            adminService.updateRole(id, request != null ? request.getRole() : null);
            return Result.success();
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    @PatchMapping("/users/{id}/status")
    @Operation(summary = "启用或禁用账号")
    public Result<?> updateStatus(@PathVariable String id,
                                  @RequestBody UpdateStatusRequest request,
                                  HttpServletRequest httpRequest) {
        Result<?> denied = requireSuperAdmin(httpRequest);
        if (denied != null) return denied;
        try {
            adminService.updateStatus(id, request != null ? request.getEnabled() : null);
            return Result.success();
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    @PostMapping("/users/{id}/reset-password")
    @Operation(summary = "重置用户密码")
    public Result<?> resetPassword(@PathVariable String id, HttpServletRequest httpRequest) {
        Result<?> denied = requireSuperAdmin(httpRequest);
        if (denied != null) return denied;
        try {
            return Result.success(adminService.resetPassword(id));
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    @PatchMapping("/users/{id}/display-nickname")
    @Operation(summary = "配置员工账号展示昵称（与小程序自助修改同一字段；人员库账号请改人员数据）")
    public Result<?> updateDisplayNickname(@PathVariable String id,
                                           @RequestBody(required = false) UpdateDisplayNicknameRequest request,
                                           HttpServletRequest httpRequest) {
        Result<?> denied = requireSuperAdmin(httpRequest);
        if (denied != null) return denied;
        try {
            adminService.updateDisplayNickname(id, request != null ? request.getDisplayNickname() : null);
            return Result.success();
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    @PostMapping("/users/{id}/reset-openid")
    @Operation(summary = "重置用户OpenID绑定")
    public Result<?> resetOpenId(@PathVariable String id, HttpServletRequest httpRequest) {
        Result<?> denied = requireSuperAdmin(httpRequest);
        if (denied != null) return denied;
        try {
            adminService.resetOpenId(id);
            return Result.success();
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    @PostMapping("/personnel/{personnelUserId}/reset-pin")
    @Operation(summary = "重置人员库学号的扫码个人密码（PIN），与 special-channel 存储一致")
    public Result<?> resetPersonnelPin(@PathVariable String personnelUserId, HttpServletRequest httpRequest) {
        Result<?> denied = requireSuperAdmin(httpRequest);
        if (denied != null) return denied;
        Object attr = httpRequest.getAttribute(com.example.demo.common.config.AdminAuthInterceptor.CURRENT_ADMIN_USER_ATTR);
        String adminId = attr instanceof User me ? me.getId() : "";
        try {
            specialChannelService.resetPin(personnelUserId.trim(), adminId);
            return Result.success();
        } catch (com.example.demo.common.exception.TwinBusinessException e) {
            return Result.fail(e.getCode(), e.getMessage());
        }
    }

    private Result<?> requireSuperAdmin(HttpServletRequest request) {
        return requireMinRole(request, RoleEnum.SUPER_ADMIN);
    }

    private Result<?> requireMinRole(HttpServletRequest request, RoleEnum minRole) {
        Object attr = request.getAttribute(AdminAuthInterceptor.CURRENT_ADMIN_USER_ATTR);
        if (!(attr instanceof User currentUser)) {
            return Result.error("当前登录信息无效");
        }
        RoleEnum currentRole = currentUser.getRole() == null ? RoleEnum.MEMBER : currentUser.getRole();
        if (currentRole.getLevel() < minRole.getLevel()) {
            return Result.error("无权限访问");
        }
        return null;
    }
}
