package com.example.demo.modules.admin.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.config.AdminAuthInterceptor;
import com.example.demo.modules.admin.dto.CreateSystemStaffRequest;
import com.example.demo.modules.admin.dto.UpdateRoleRequest;
import com.example.demo.modules.admin.dto.UpdateStatusRequest;
import com.example.demo.modules.auth.dto.UpdateDisplayNicknameRequest;
import com.example.demo.modules.admin.mapper.AdminMapper;
import com.example.demo.modules.auth.service.PasswordCredentialService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.mapper.UserMapper;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/admin")
@Tag(name = "后台管理", description = "人员授权与账户管理接口")
public class AdminController {
    private static final String BUILTIN_SUPER_ADMIN_ID = "SYS_SUPER_ROOT";
    private static final String DEFAULT_RESET_PASSWORD = "123456";

    private final AdminMapper adminMapper;
    private final UserMapper userMapper;
    private final PasswordCredentialService passwordCredentialService;

    public AdminController(AdminMapper adminMapper, UserMapper userMapper, PasswordCredentialService passwordCredentialService) {
        this.adminMapper = adminMapper;
        this.userMapper = userMapper;
        this.passwordCredentialService = passwordCredentialService;
    }

    @GetMapping("/personnel")
    @Operation(summary = "分页查询人员授权库")
    public Result<?> listPersonnel(@RequestParam(defaultValue = "1") int page,
                                   @RequestParam(defaultValue = "20") int size,
                                   @RequestParam(required = false) String keyword,
                                   HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.SUPER_ADMIN);
        if (denied != null) {
            return denied;
        }
        int safePage = Math.max(page, 1);
        int safeSize = Math.min(Math.max(size, 1), 100);
        int offset = (safePage - 1) * safeSize;
        String search = keyword == null ? null : keyword.trim();
        List<Map<String, Object>> list = adminMapper.getPersonnelWithAuth(search, safeSize, offset);
        int total = adminMapper.countPersonnelWithAuth(search);
        Map<String, Object> data = new HashMap<>();
        data.put("data", list);
        data.put("total", total);
        return Result.success(data);
    }

    @GetMapping("/system-users")
    @Operation(summary = "分页查询系统用户")
    public Result<?> listSystemOnlyUsers(@RequestParam(defaultValue = "1") int page,
                                         @RequestParam(defaultValue = "20") int size,
                                         @RequestParam(required = false) String keyword,
                                         HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.SUPER_ADMIN);
        if (denied != null) {
            return denied;
        }
        int safePage = Math.max(page, 1);
        int safeSize = Math.min(Math.max(size, 1), 100);
        int offset = (safePage - 1) * safeSize;
        String search = keyword == null ? null : keyword.trim();
        List<Map<String, Object>> list = adminMapper.getSystemOnlyUsers(search, safeSize, offset);
        int total = adminMapper.countSystemOnlyUsers(search);
        Map<String, Object> data = new HashMap<>();
        data.put("data", list);
        data.put("total", total);
        return Result.success(data);
    }

    @PostMapping("/system-users")
    @Operation(summary = "新增员工账号（账号密码，无人员库绑定；不可创建平台所有者）")
    public Result<?> createSystemStaffUser(@RequestBody CreateSystemStaffRequest request, HttpServletRequest httpRequest) {
        Result<?> denied = requireSuperAdmin(httpRequest);
        if (denied != null) {
            return denied;
        }
        if (request == null || !StringUtils.hasText(request.getUsername()) || !StringUtils.hasText(request.getPassword())) {
            return Result.error("账号与密码必填");
        }
        String username = request.getUsername().trim();
        if (username.length() < 2 || username.length() > 64) {
            return Result.error("账号长度须在 2～64 字符");
        }
        String rawPwd = request.getPassword();
        if (rawPwd.length() < 6) {
            return Result.error("密码至少 6 位");
        }
        if (userMapper.findByUsername(username) != null) {
            return Result.error("该登录账号已存在");
        }
        String roleCode = StringUtils.hasText(request.getRole()) ? request.getRole().trim().toUpperCase() : RoleEnum.STAFF.getCode();
        RoleEnum roleEnum;
        try {
            roleEnum = RoleEnum.valueOf(roleCode);
        } catch (Exception e) {
            return Result.error("角色参数不合法");
        }
        if (roleEnum == RoleEnum.PLATFORM_OWNER) {
            return Result.error("禁止通过此接口创建平台所有者账号");
        }
        if (roleEnum == RoleEnum.STUDENT) {
            return Result.error("员工账号不可为学生角色，请使用人员库同步学生");
        }
        String nick = request.getDisplayNickname() != null ? request.getDisplayNickname().trim() : "";
        if (nick.length() > 32) {
            return Result.error("展示昵称不能超过32个字符");
        }
        if (nick.isEmpty()) {
            nick = username;
        }
        String id = "USR_" + UUID.randomUUID().toString().replace("-", "");
        User u = new User();
        u.setId(id);
        u.setUsername(username);
        u.setPassword(passwordCredentialService.encodeForStorage(rawPwd));
        u.setOpenId(null);
        u.setRole(roleEnum);
        u.setStatus(1);
        u.setPasswordResetRequired(1);
        u.setDisplayNickname(nick);
        u.setMiniBindType(null);
        u.setMiniPreferencesJson(null);
        u.setAuthProfile("WEB_PASSWORD");
        userMapper.insertUser(u);
        Map<String, Object> out = new HashMap<>();
        out.put("id", id);
        out.put("username", username);
        out.put("displayNickname", nick);
        out.put("role", roleEnum.getCode());
        return Result.success(out);
    }

    @DeleteMapping("/users/{id}")
    @Operation(summary = "删除系统用户（须无人员库绑定；内置根账号与当前登录账号不可删）")
    public Result<?> deleteSystemUser(@PathVariable String id, HttpServletRequest httpRequest) {
        Result<?> denied = requireSuperAdmin(httpRequest);
        if (denied != null) {
            return denied;
        }
        if (!StringUtils.hasText(id)) {
            return Result.error("id 不合法");
        }
        User target = userMapper.findById(id);
        if (target == null) {
            return Result.error("用户不存在");
        }
        if (isProtectedSuperAdmin(target)) {
            return Result.error("内置超级根账号不可删除");
        }
        Object attr = httpRequest.getAttribute(AdminAuthInterceptor.CURRENT_ADMIN_USER_ATTR);
        if (attr instanceof User me && id.equals(me.getId())) {
            return Result.error("不可删除当前登录账号");
        }
        if (userMapper.existsPersonnelById(id) > 0) {
            return Result.error("该用户存在于人员结构库，请先在主数据侧处理后再删系统账号");
        }
        int n = userMapper.deleteById(id);
        if (n == 0) {
            return Result.error("删除失败");
        }
        return Result.success();
    }

    @PatchMapping("/users/{id}/role")
    @Operation(summary = "修改用户角色")
    public Result<?> updateRole(@PathVariable String id,
                                @RequestBody UpdateRoleRequest request,
                                HttpServletRequest httpRequest) {
        Result<?> denied = requireSuperAdmin(httpRequest);
        if (denied != null) {
            return denied;
        }
        if (request == null || !StringUtils.hasText(request.getRole())) {
            return Result.error("角色参数不合法");
        }
        String roleCode = request.getRole().trim().toUpperCase();
        RoleEnum roleEnum;
        try {
            roleEnum = RoleEnum.valueOf(roleCode);
        } catch (Exception e) {
            return Result.error("角色参数不合法");
        }

        User target = userMapper.findById(id);
        if (target == null) {
            return Result.error("用户不存在");
        }
        if (isProtectedSuperAdmin(target) && roleEnum != RoleEnum.PLATFORM_OWNER) {
            return Result.error("内置平台所有者账号角色不可降级");
        }
        userMapper.updateRoleById(id, roleEnum.getCode());
        return Result.success();
    }

    @PatchMapping("/users/{id}/status")
    @Operation(summary = "启用或禁用账号")
    public Result<?> updateStatus(@PathVariable String id,
                                  @RequestBody UpdateStatusRequest request,
                                  HttpServletRequest httpRequest) {
        Result<?> denied = requireSuperAdmin(httpRequest);
        if (denied != null) {
            return denied;
        }
        if (request == null || request.getEnabled() == null) {
            return Result.error("状态参数不合法");
        }
        User target = userMapper.findById(id);
        if (target == null) {
            return Result.error("用户不存在");
        }
        if (isProtectedSuperAdmin(target) && !Boolean.TRUE.equals(request.getEnabled())) {
            return Result.error("内置超级管理员不可禁用");
        }
        userMapper.updateStatusById(id, Boolean.TRUE.equals(request.getEnabled()) ? 1 : 0);
        return Result.success();
    }

    @PostMapping("/users/{id}/reset-password")
    @Operation(summary = "重置用户密码")
    public Result<?> resetPassword(@PathVariable String id, HttpServletRequest httpRequest) {
        Result<?> denied = requireSuperAdmin(httpRequest);
        if (denied != null) {
            return denied;
        }
        User target = userMapper.findById(id);
        if (target == null) {
            return Result.error("用户不存在");
        }
        if (isProtectedSuperAdmin(target)) {
            return Result.error("内置超级管理员不可重置密码");
        }
        userMapper.updatePasswordAndResetRequiredById(id, passwordCredentialService.encodeForStorage(DEFAULT_RESET_PASSWORD), 1);
        Map<String, Object> data = new HashMap<>();
        data.put("defaultPassword", DEFAULT_RESET_PASSWORD);
        return Result.success(data);
    }

    @PatchMapping("/users/{id}/display-nickname")
    @Operation(summary = "配置员工账号展示昵称（与小程序自助修改同一字段；人员库账号请改人员数据）")
    public Result<?> updateDisplayNickname(@PathVariable String id,
                                           @RequestBody(required = false) UpdateDisplayNicknameRequest request,
                                           HttpServletRequest httpRequest) {
        Result<?> denied = requireSuperAdmin(httpRequest);
        if (denied != null) {
            return denied;
        }
        User target = userMapper.findById(id);
        if (target == null) {
            return Result.error("用户不存在");
        }
        if (userMapper.existsPersonnelById(id) > 0) {
            return Result.error("该用户存在于人员结构库，请在人员主数据维护姓名");
        }
        if (isProtectedSuperAdmin(target)) {
            return Result.error("内置超级管理员不可在此修改昵称");
        }
        String raw = request != null ? request.getDisplayNickname() : null;
        String normalized = null;
        if (raw != null) {
            String t = raw.trim();
            normalized = t.isEmpty() ? null : t;
        }
        if (normalized != null && normalized.length() > 32) {
            return Result.error("昵称长度不能超过32个字符");
        }
        userMapper.updateDisplayNicknameById(id, normalized);
        return Result.success();
    }

    @PostMapping("/users/{id}/reset-openid")
    @Operation(summary = "重置用户OpenID绑定")
    public Result<?> resetOpenId(@PathVariable String id, HttpServletRequest httpRequest) {
        Result<?> denied = requireSuperAdmin(httpRequest);
        if (denied != null) {
            return denied;
        }
        User target = userMapper.findById(id);
        if (target == null) {
            return Result.error("用户不存在");
        }
        userMapper.clearOpenIdById(id);
        return Result.success();
    }

    private boolean isProtectedSuperAdmin(User user) {
        return BUILTIN_SUPER_ADMIN_ID.equals(user.getId());
    }

    private Result<?> requireSuperAdmin(HttpServletRequest request) {
        return requireMinRole(request, RoleEnum.SUPER_ADMIN);
    }

    private Result<?> requireMinRole(HttpServletRequest request, RoleEnum minRole) {
        Object attr = request.getAttribute(AdminAuthInterceptor.CURRENT_ADMIN_USER_ATTR);
        if (!(attr instanceof User currentUser)) {
            return Result.error("当前登录信息无效");
        }
        RoleEnum currentRole = currentUser.getRole() == null ? RoleEnum.STUDENT : currentUser.getRole();
        if (currentRole.getLevel() < minRole.getLevel()) {
            return Result.error("无权限访问");
        }
        return null;
    }
}
