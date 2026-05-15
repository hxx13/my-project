package com.example.demo.modules.auth.service;

import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.mapper.UserMapper;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

/**
 * BCrypt 存储与登录读迁移：旧库明文密码在首次登录成功后写回 hash。
 */
@Service
public class PasswordCredentialService {

    private final PasswordEncoder passwordEncoder;
    private final UserMapper userMapper;

    public PasswordCredentialService(PasswordEncoder passwordEncoder, UserMapper userMapper) {
        this.passwordEncoder = passwordEncoder;
        this.userMapper = userMapper;
    }

    public String encodeForStorage(String rawPassword) {
        return passwordEncoder.encode(rawPassword);
    }

    public boolean matchesStored(String rawPassword, String stored) {
        if (stored == null) {
            return false;
        }
        if (isBcryptHash(stored)) {
            return passwordEncoder.matches(rawPassword, stored);
        }
        return rawPassword != null && rawPassword.equals(stored);
    }

    /**
     * 校验密码；若为历史明文且匹配，则立即升级为 BCrypt 写入库。
     *
     * @return true 表示校验通过（含已触发迁移）
     */
    public boolean verifyAndRehashIfLegacy(User user, String rawPassword) {
        if (user == null || rawPassword == null) {
            return false;
        }
        String stored = user.getPassword();
        if (stored == null) {
            return false;
        }
        if (isBcryptHash(stored)) {
            return passwordEncoder.matches(rawPassword, stored);
        }
        if (!rawPassword.equals(stored)) {
            return false;
        }
        userMapper.updatePasswordById(user.getId(), passwordEncoder.encode(rawPassword));
        return true;
    }

    public static boolean isBcryptHash(String stored) {
        return stored != null && (stored.startsWith("$2a$") || stored.startsWith("$2b$") || stored.startsWith("$2y$"));
    }
}
