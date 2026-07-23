package com.example.demo.modules.admin.service;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.admin.dto.CreateSystemStaffRequest;
import com.example.demo.modules.admin.mapper.AdminMapper;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.mapper.UserMapper;
import com.example.demo.modules.auth.service.PasswordCredentialService;
import com.example.demo.modules.auth.service.PasswordPolicyValidator;
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
        String pwError = PasswordPolicyValidator.validate(rawPwd);
        if (pwError != null) {
            throw new IllegalArgumentException(pwError);
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
        if (roleEnum == RoleEnum.MEMBER) {
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
        String encryptedPlain = passwordCredentialService.encryptPlaintext(rawPwd);
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
        u.setAccountSource("STAFF");
        userMapper.insertUser(u);
        userMapper.updatePasswordWithPlainById(id, u.getPassword(), encryptedPlain, 1);
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
        String defaultPassword = generateCompliantPassword();
        String hash = passwordCredentialService.encodeForStorage(defaultPassword);
        String encryptedPlain = passwordCredentialService.encryptPlaintext(defaultPassword);
        userMapper.updatePasswordWithPlainById(id, hash, encryptedPlain, 1);
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

    public Map<String, Object> viewPassword(String id) {
        User target = userMapper.findById(id);
        if (target == null) {
            throw new IllegalArgumentException("用户不存在");
        }
        if (BUILTIN_SUPER_ADMIN_ID.equals(target.getId())) {
            throw new IllegalArgumentException("内置超级管理员密码不可查看");
        }
        // Read password_plain from DB directly since User entity doesn't have this field
        String plainEncrypted = userMapper.getPasswordPlainById(id);
        if (plainEncrypted == null || plainEncrypted.isEmpty()) {
            Map<String, Object> data = new HashMap<>();
            data.put("password", null);
            data.put("message", "该密码为历史遗留数据，暂不可查看。请先重置密码后再查看。");
            return data;
        }
        String plaintext = passwordCredentialService.decryptPlaintext(plainEncrypted);
        Map<String, Object> data = new HashMap<>();
        data.put("password", plaintext);
        return data;
    }

    public void resetPersonnelAccount(String userId, String newUsername) {
        if (!StringUtils.hasText(userId)) {
            throw new IllegalArgumentException("用户ID不能为空");
        }
        if (!StringUtils.hasText(newUsername)) {
            throw new IllegalArgumentException("新账号不能为空");
        }
        String username = newUsername.trim();
        if (username.length() < 2 || username.length() > 64) {
            throw new IllegalArgumentException("账号长度须在 2～64 字符");
        }
        User existing = userMapper.findByUsername(username);
        if (existing != null && !existing.getId().equals(userId)) {
            throw new IllegalArgumentException("该登录账号已被占用");
        }
        User target = userMapper.findById(userId);
        if (target == null) {
            throw new IllegalArgumentException("用户不存在");
        }
        userMapper.updateUsernameById(userId, username);
    }

    public Map<String, Object> resetPersonnelPassword(String personnelUserId) {
        if (!StringUtils.hasText(personnelUserId)) {
            throw new IllegalArgumentException("用户ID不能为空");
        }
        String defaultPassword = generateCompliantPassword();
        String hash = passwordCredentialService.encodeForStorage(defaultPassword);
        String encryptedPlain = passwordCredentialService.encryptPlaintext(defaultPassword);
        User target = userMapper.findById(personnelUserId);
        if (target == null) {
            // Auto-create sys_user for personnel who doesn't have one yet
            User u = new User();
            u.setId(personnelUserId);
            u.setUsername(personnelUserId);
            u.setPassword(hash);
            u.setRole(RoleEnum.MEMBER);
            u.setStatus(1);
            u.setPasswordResetRequired(1);
            u.setAuthProfile("WEB_PASSWORD");
            u.setAccountSource("STUDENT");
            userMapper.insertUser(u);
            userMapper.updatePasswordWithPlainById(personnelUserId, hash, encryptedPlain, 1);
        } else {
            userMapper.updatePasswordWithPlainById(personnelUserId, hash, encryptedPlain, 1);
        }
        Map<String, Object> data = new HashMap<>();
        data.put("defaultPassword", defaultPassword);
        return data;
    }

    /**
     * 生成符合密码强度规则的随机密码（≥8位，含大小写字母+数字+特殊字符至少三类）。
     */
    private String generateCompliantPassword() {
        String upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
        String lower = "abcdefghjkmnpqrstuvwxyz";
        String digits = "23456789";
        String special = "!@#$%&*";
        String all = upper + lower + digits + special;

        java.security.SecureRandom rng = new java.security.SecureRandom();
        // 保证三类：大写 + 小写 + 数字 = 3 categories
        char[] chars = new char[10];
        chars[0] = upper.charAt(rng.nextInt(upper.length()));
        chars[1] = lower.charAt(rng.nextInt(lower.length()));
        chars[2] = digits.charAt(rng.nextInt(digits.length()));
        chars[3] = special.charAt(rng.nextInt(special.length()));
        for (int i = 4; i < chars.length; i++) {
            chars[i] = all.charAt(rng.nextInt(all.length()));
        }
        // 打乱顺序
        for (int i = chars.length - 1; i > 0; i--) {
            int j = rng.nextInt(i + 1);
            char tmp = chars[i];
            chars[i] = chars[j];
            chars[j] = tmp;
        }
        return new String(chars);
    }

    public void resetOpenId(String id) {
        User target = userMapper.findById(id);
        if (target == null) {
            throw new IllegalArgumentException("用户不存在");
        }
        userMapper.clearOpenIdById(id);
    }
}
