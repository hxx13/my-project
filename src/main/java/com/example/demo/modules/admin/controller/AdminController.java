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
import com.example.demo.modules.auth.mapper.UserMapper;
import com.example.demo.modules.aro.mapper.AroPersonnelMapper;
import com.example.demo.modules.auth.service.SpecialChannelService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api/admin")
@Tag(name = "后台管理", description = "人员授权与账户管理接口")
public class AdminController {

    private final AdminService adminService;
    private final SpecialChannelService specialChannelService;
    private final UserMapper userMapper;
    private final AroPersonnelMapper aroPersonnelMapper;
    private final JdbcTemplate jdbcTemplate;

    public AdminController(AdminService adminService,
                          SpecialChannelService specialChannelService,
                          UserMapper userMapper,
                          AroPersonnelMapper aroPersonnelMapper,
                          JdbcTemplate jdbcTemplate) {
        this.adminService = adminService;
        this.specialChannelService = specialChannelService;
        this.userMapper = userMapper;
        this.aroPersonnelMapper = aroPersonnelMapper;
        this.jdbcTemplate = jdbcTemplate;
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
    @Operation(summary = "新建员工账号（无需推荐码；须填真实姓名并写入 personnel；不可创建平台所有者）")
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

    @PatchMapping("/personnel/{id}/role")
    @Operation(summary = "修改人员角色（personnel.role 唯一权威，写透 sys_user.role）")
    public Result<?> updatePersonnelRole(@PathVariable Long id,
                                         @RequestBody UpdateRoleRequest request,
                                         HttpServletRequest httpRequest) {
        Result<?> denied = requireSuperAdmin(httpRequest);
        if (denied != null) return denied;
        try {
            adminService.updatePersonnelRole(id, request != null ? request.getRole() : null);
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

    @GetMapping("/users/{id}/view-password")
    @Operation(summary = "查看用户明文密码（AES解密，需 SUPER_ADMIN）")
    public Result<?> viewPassword(@PathVariable String id, HttpServletRequest httpRequest) {
        Result<?> denied = requireSuperAdmin(httpRequest);
        if (denied != null) return denied;
        try {
            Map<String, Object> data = adminService.viewPassword(id);
            return Result.success(data);
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    @PostMapping("/personnel/{personnelUserId}/reset-account")
    @Operation(summary = "重置学生登录账号（用户名），需 SUPER_ADMIN")
    public Result<?> resetPersonnelAccount(@PathVariable String personnelUserId,
                                           @RequestBody Map<String, String> body,
                                           HttpServletRequest httpRequest) {
        Result<?> denied = requireSuperAdmin(httpRequest);
        if (denied != null) return denied;
        String newUsername = body != null ? body.get("newUsername") : null;
        try {
            adminService.resetPersonnelAccount(personnelUserId, newUsername);
            return Result.success(Map.of("newUsername", newUsername));
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    @PostMapping("/personnel/{personnelUserId}/reset-password")
    @Operation(summary = "重置学生登录密码，需 SUPER_ADMIN")
    public Result<?> resetPersonnelPassword(@PathVariable String personnelUserId,
                                            HttpServletRequest httpRequest) {
        Result<?> denied = requireSuperAdmin(httpRequest);
        if (denied != null) return denied;
        try {
            Map<String, Object> data = adminService.resetPersonnelPassword(personnelUserId);
            return Result.success(data);
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    @PostMapping("/cleanup-personnel-placeholders")
    @Operation(summary = "一次性清理 aro_personnel 占位行：迁移 contact_email/send_key 到 sys_user，再删除占位行")
    public Result<Map<String, Object>> cleanupPersonnelPlaceholders(HttpServletRequest request) {
        Result<?> denied = requireSuperAdmin(request);
        if (denied != null) return (Result<Map<String, Object>>) (Object) denied;

        // 1. 查出所有占位行 (job_number IS NULL AND name = user_id)
        List<Map<String, Object>> placeholders = jdbcTemplate.queryForList(
            "SELECT user_id, contact_email, send_key FROM aro_personnel WHERE job_number IS NULL AND name = user_id");
        int migratedEmail = 0;
        int migratedSendKey = 0;

        for (Map<String, Object> row : placeholders) {
            String uid = (String) row.get("user_id");
            String email = (String) row.get("contact_email");
            String sk = (String) row.get("send_key");
            if (email != null && !email.isBlank()) {
                jdbcTemplate.update("UPDATE sys_user SET contact_email = ? WHERE id = ?", email, uid);
                migratedEmail++;
            }
            if (sk != null && !sk.isBlank()) {
                jdbcTemplate.update("UPDATE sys_user SET send_key = ? WHERE id = ?", sk, uid);
                migratedSendKey++;
            }
        }

        // 2. 删除占位行
        int deleted = jdbcTemplate.update(
            "DELETE FROM aro_personnel WHERE job_number IS NULL AND name = user_id");

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("placeholderRows", placeholders.size());
        result.put("migratedContactEmail", migratedEmail);
        result.put("migratedSendKey", migratedSendKey);
        result.put("deletedPlaceholders", deleted);
        result.put("affectedUserIds", placeholders.stream().map(r -> r.get("user_id")).toList());
        return Result.success(result);
    }

    private boolean isStaffId(String userId) {
        if (userId == null) return false;
        String up = userId.toUpperCase();
        return up.startsWith("USR_") || up.startsWith("STAFF_") || "SYS_SUPER_ROOT".equals(userId);
    }

    @PutMapping("/personnel/{userId}/contact-email")
    @Operation(summary = "更新人员的联系邮箱（本地管理，不被ARO同步覆盖）")
    public Result<Void> updateContactEmail(@PathVariable String userId, @RequestBody Map<String, String> body) {
        String email = body != null ? body.get("email") : null;
        // 空值 = 取消绑定
        String trimmed = (email != null && !email.isBlank()) ? email.trim() : null;
        // 通知 key 统一存 sys_user（学生账号 sys_user.id=aro_user_id 由 StudentAccountProvisioner 自动供给），不区分视角
        userMapper.updateContactEmail(userId, trimmed);
        return Result.success();
    }

    @GetMapping("/personnel/{userId}/contact-email")
    @Operation(summary = "获取人员的联系邮箱")
    public Result<Map<String, Object>> getContactEmail(@PathVariable String userId) {
        String email = userMapper.findContactEmailById(userId);
        return Result.success(Map.of("email", email != null ? email : ""));
    }

    @PutMapping("/personnel/{userId}/send-key")
    @Operation(summary = "更新人员的Server酱SendKey")
    public Result<Void> updateSendKey(@PathVariable String userId, @RequestBody Map<String, String> body) {
        String sendKey = body != null ? body.get("sendKey") : null;
        String trimmed = (sendKey != null && !sendKey.isBlank()) ? sendKey.trim() : null;
        // 通知 key 统一存 sys_user，不区分视角
        userMapper.updateSendKey(userId, trimmed);
        return Result.success();
    }

    @GetMapping("/personnel/{userId}/send-key")
    @Operation(summary = "获取人员的SendKey（脱敏）")
    public Result<Map<String, Object>> getSendKey(@PathVariable String userId) {
        String sendKey = userMapper.findSendKeyById(userId);
        String masked = sendKey != null && sendKey.length() > 10
                ? sendKey.substring(0, 4) + "****" + sendKey.substring(sendKey.length() - 4)
                : (sendKey != null ? "****" : "");
        return Result.success(Map.of("sendKey", masked, "hasSendKey", sendKey != null && !sendKey.isBlank()));
    }

    @PutMapping("/personnel/{userId}/wx-pusher-uid")
    @Operation(summary = "更新人员的WxPusher UID")
    public Result<Void> updateWxPusherUid(@PathVariable String userId, @RequestBody Map<String, String> body) {
        String wxPusherUid = body != null ? body.get("wxPusherUid") : null;
        String trimmed = (wxPusherUid != null && !wxPusherUid.isBlank()) ? wxPusherUid.trim() : null;
        // 通知 key 统一存 sys_user，不区分视角
        userMapper.updateWxPusherUid(userId, trimmed);
        return Result.success();
    }

    @GetMapping("/personnel/{userId}/wx-pusher-uid")
    @Operation(summary = "获取人员的WxPusher UID（脱敏）")
    public Result<Map<String, Object>> getWxPusherUid(@PathVariable String userId) {
        String wxPusherUid = userMapper.findWxPusherUidById(userId);
        String masked = wxPusherUid != null && wxPusherUid.length() > 10
                ? wxPusherUid.substring(0, 4) + "****" + wxPusherUid.substring(wxPusherUid.length() - 4)
                : (wxPusherUid != null ? "****" : "");
        return Result.success(Map.of("wxPusherUid", masked, "hasWxPusherUid", wxPusherUid != null && !wxPusherUid.isBlank()));
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
