package com.example.demo.modules.auth.service;

import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.mapper.UserMapper;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
public class PasswordCredentialService {

    private final PasswordEncoder passwordEncoder;
    private final UserMapper userMapper;
    private final AesEncryptionService aesEncryptionService;

    public PasswordCredentialService(PasswordEncoder passwordEncoder,
                                     UserMapper userMapper,
                                     AesEncryptionService aesEncryptionService) {
        this.passwordEncoder = passwordEncoder;
        this.userMapper = userMapper;
        this.aesEncryptionService = aesEncryptionService;
    }

    public String encodeForStorage(String rawPassword) {
        return passwordEncoder.encode(rawPassword);
    }

    /** Encrypt plaintext password for recoverable admin viewing */
    public String encryptPlaintext(String rawPassword) {
        if (rawPassword == null || rawPassword.isEmpty()) {
            return null;
        }
        return aesEncryptionService.encrypt(rawPassword);
    }

    /** Decrypt stored password_plain back to readable form */
    public String decryptPlaintext(String encrypted) {
        if (encrypted == null || encrypted.isEmpty()) {
            return null;
        }
        return aesEncryptionService.decrypt(encrypted);
    }

    public boolean verifyAndRehashIfLegacy(User user, String rawPassword) {
        if (user == null || rawPassword == null) {
            return false;
        }
        String stored = user.getPassword();
        if (stored == null) {
            return false;
        }
        // BCrypt 哈希 → BCryptPasswordEncoder 匹配
        if (isBcryptHash(stored)) {
            return passwordEncoder.matches(rawPassword, stored);
        }
        // 遗留明文密码：直接比对，匹配则自动升级为 BCrypt
        if (!rawPassword.equals(stored)) {
            return false;
        }
        userMapper.updatePasswordById(user.getId(), passwordEncoder.encode(rawPassword));
        return true;
    }

    private static boolean isBcryptHash(String stored) {
        return stored != null && (stored.startsWith("$2a$") || stored.startsWith("$2b$") || stored.startsWith("$2y$"));
    }
}
