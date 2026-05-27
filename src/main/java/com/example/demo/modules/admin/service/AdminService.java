package com.example.demo.modules.admin.service;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.admin.dto.CreateSystemStaffRequest;
import com.example.demo.modules.admin.mapper.AdminMapper;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.mapper.UserMapper;
import com.example.demo.modules.auth.service.PasswordCredentialService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.*;

@Service
public class AdminService {

    private static final String BUILTIN_SUPER_ADMIN_ID = "SYS_SUPER_ROOT";

    private final AdminMapper adminMapper;
    private final UserMapper userMapper;
    private final PasswordCredentialService passwordCredentialService;

    public AdminService(AdminMapper adminMapper,
                        UserMapper userMapper,
                        PasswordCredentialService passwordCredentialService) {
        this.adminMapper = adminMapper;
        this.userMapper = userMapper;
        this.passwordCredentialService = passwordCredentialService;
    }

    public Map<String, Object> listPersonnel(int page, int size, String keyword) {
        int safePage = Math.max(page, 1);
        int safeSize = Math.min(Math.max(size, 1), 100);
        int offset = (safePage - 1) * safeSize;
        String search = keyword == null ? null : keyword.trim();
        List<Map<String, Object>> list = adminMapper.getPersonnelWithAuth(search, safeSize, offset);
        int total = adminMapper.countPersonnelWithAuth(search);
        Map<String, Object> data = new HashMap<>();
        data.put("data", list);
        data.put("total", total);
        return data;
    }

    public Map<String, Object> listSystemUsers(int page, int size, String keyword) {
        int safePage = Math.max(page, 1);
        int safeSize = Math.min(Math.max(size, 1), 100);
        int offset = (safePage - 1) * safeSize;
        String search = keyword == null ? null : keyword.trim();
        List<Map<String, Object>> list = adminMapper.getSystemOnlyUsers(search, safeSize, offset);
        int total = adminMapper.countSystemOnlyUsers(search);
        Map<String, Object> data = new HashMap<>();
        data.put("data", list);
        data.put("total", total);
        return data;
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> createSystemStaffUser(CreateSystemStaffRequest request) {
        if (request == null || !StringUtils.hasText(request.getUsername()) || !StringUtils.hasText(request.getPassword())) {
            throw new IllegalArgumentException("账号与密码必填");
        }
        String username = request.getUsername().trim();
        if (username.length() < 2 || username.length() > 64) {
            throw new IllegalArgumentException("账号长度须在 2～64 字符");
        }
        String rawPwd = request.getPassword();
        if (rawPwd.length() < 6) {
            throw new IllegalArgumentException("密码至少 6 位");
        }
        if (userMapper.findByUsername(username) != null) {
            throw new IllegalArgumentException("该登录账号已存在");
        }
        String roleCode = StringUtils.hasText(request.getRole()) ? request.getRole().trim().toUpperCase() : RoleEnum.STAFF.getCode();
        RoleEnum roleEnum;
        try {
            roleEnum = RoleEnum.valueOf(roleCode);
        } catch (Exception e) {
            throw new IllegalArgumentException("角色参数不合法");
        }
        if (roleEnum == RoleEnum.PLATFORM_OWNER) {
            throw new IllegalArgumentException("禁止通过此接口创建平台所有者账号");
        }
        if (roleEnum == RoleEnum.STUDENT) {
            throw new IllegalArgumentException("员工账号不可为学生角色，请使用人员库同步学生");
        }
        String nick = request.getDisplayNickname() != null ? request.getDisplayNickname().trim() : "";
        if (nick.length() > 32) {
            throw new IllegalArgumentException("展示昵称不能超过32个字符");
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
        return out;
    }

    @Transactional(rollbackFor = Exception.class)
    public void deleteSystemUser(String id, String currentUserId) {
        if (!StringUtils.hasText(id)) {
            throw new IllegalArgumentException("id 不合法");
        }
        User target = userMapper.findById(id);
        if (target == null) {
            throw new IllegalArgumentException("用户不存在");
        }
        if (BUILTIN_SUPER_ADMIN_ID.equals(target.getId())) {
            throw new IllegalArgumentException("内置超级根账号不可删除");
        }
        if (id.equals(currentUserId)) {
            throw new IllegalArgumentException("不可删除当前登录账号");
        }
        if (userMapper.existsPersonnelById(id) > 0) {
            throw new IllegalArgumentException("该用户存在于人员结构库，请先在主数据侧处理后再删系统账号");
        }
        int n = userMapper.deleteById(id);
        if (n == 0) {
            throw new IllegalArgumentException("删除失败");
        }
    }

    public void updateRole(String id, String roleCode) {
        if (!StringUtils.hasText(roleCode)) {
            throw new IllegalArgumentException("角色参数不合法");
        }
        RoleEnum roleEnum;
        try {
            roleEnum = RoleEnum.valueOf(roleCode.trim().toUpperCase());
        } catch (Exception e) {
            throw new IllegalArgumentException("角色参数不合法");
        }
        User target = userMapper.findById(id);
        if (target == null) {
            throw new IllegalArgumentException("用户不存在");
        }
        if (BUILTIN_SUPER_ADMIN_ID.equals(target.getId()) && roleEnum != RoleEnum.PLATFORM_OWNER) {
            throw new IllegalArgumentException("内置平台所有者账号角色不可降级");
        }
        userMapper.updateRoleById(id, roleEnum.getCode());
    }

    public void updateStatus(String id, Boolean enabled) {
        if (enabled == null) {
            throw new IllegalArgumentException("状态参数不合法");
        }
        User target = userMapper.findById(id);
        if (target == null) {
            throw new IllegalArgumentException("用户不存在");
        }
        if (BUILTIN_SUPER_ADMIN_ID.equals(target.getId()) && !Boolean.TRUE.equals(enabled)) {
            throw new IllegalArgumentException("内置超级管理员不可禁用");
        }
        userMapper.updateStatusById(id, Boolean.TRUE.equals(enabled) ? 1 : 0);
    }

    public Map<String, Object> resetPassword(String id) {
        User target = userMapper.findById(id);
        if (target == null) {
            throw new IllegalArgumentException("用户不存在");
        }
        if (BUILTIN_SUPER_ADMIN_ID.equals(target.getId())) {
            throw new IllegalArgumentException("内置超级管理员不可重置密码");
        }
        String defaultPassword = UUID.randomUUID().toString().substring(0, 8);
        userMapper.updatePasswordAndResetRequiredById(id, passwordCredentialService.encodeForStorage(defaultPassword), 1);
        Map<String, Object> data = new HashMap<>();
        data.put("defaultPassword", defaultPassword);
        return data;
    }

    public void updateDisplayNickname(String id, String rawNickname) {
        User target = userMapper.findById(id);
        if (target == null) {
            throw new IllegalArgumentException("用户不存在");
        }
        if (userMapper.existsPersonnelById(id) > 0) {
            throw new IllegalArgumentException("该用户存在于人员结构库，请在人员主数据维护姓名");
        }
        if (BUILTIN_SUPER_ADMIN_ID.equals(target.getId())) {
            throw new IllegalArgumentException("内置超级管理员不可在此修改昵称");
        }
        String normalized = null;
        if (rawNickname != null) {
            String t = rawNickname.trim();
            normalized = t.isEmpty() ? null : t;
        }
        if (normalized != null && normalized.length() > 32) {
            throw new IllegalArgumentException("昵称长度不能超过32个字符");
        }
        userMapper.updateDisplayNicknameById(id, normalized);
    }

    public void resetOpenId(String id) {
        User target = userMapper.findById(id);
        if (target == null) {
            throw new IllegalArgumentException("用户不存在");
        }
        userMapper.clearOpenIdById(id);
    }
}
