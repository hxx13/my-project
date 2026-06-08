package com.example.demo.modules.auth.service;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.exception.ErrorCodeConstants;
import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.modules.auth.AuthProfileConstants;
import com.example.demo.modules.auth.dto.AuthData;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.mapper.UserMapper;
import com.example.demo.modules.aro.mapper.AroPersonnelMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class SpecialChannelService {

    private static final Logger log = LoggerFactory.getLogger(SpecialChannelService.class);
    private static final int MAX_FAIL_COUNT = 3;
    private static final long LOCK_DURATION_SEC = 30;
    private static final String PIN_PATTERN = "^\\d{6,8}$";

    private final AroPersonnelMapper aroPersonnelMapper;
    private final UserMapper userMapper;
    private final AuthService authService;
    private final PasswordEncoder passwordEncoder;

    // 内存锁定记录（未来可无感升级为 Redis）
    private final Map<String, FailRecord> failMap = new ConcurrentHashMap<>();

    public SpecialChannelService(AroPersonnelMapper aroPersonnelMapper,
                                  UserMapper userMapper,
                                  AuthService authService,
                                  PasswordEncoder passwordEncoder) {
        this.aroPersonnelMapper = aroPersonnelMapper;
        this.userMapper = userMapper;
        this.authService = authService;
        this.passwordEncoder = passwordEncoder;
    }

    // ---- PIN Status ----

    public boolean hasPin(String userId) {
        requirePersonnelExists(userId);
        String hash = aroPersonnelMapper.findPersonalPinByUserId(userId);
        return StringUtils.hasText(hash);
    }

    // ---- Set PIN ----

    @Transactional
    public AuthData setPin(String userId, String rawPin) {
        requirePersonnelExists(userId);
        validatePinFormat(rawPin);

        // 防竞态：Mapper XML 有 WHERE personal_pin IS NULL 条件
        String pinHash = passwordEncoder.encode(rawPin);
        String now = Instant.now().toString();
        int updated = aroPersonnelMapper.updatePersonalPin(userId, pinHash, now);
        if (updated == 0) {
            throw TwinBusinessException.of(
                    ErrorCodeConstants.SPECIAL_CHANNEL_PIN_ALREADY_SET,
                    "已设置过个人密码"
            );
        }

        log.info("[special-channel] PIN set userId={}", userId);
        ensureAccountExists(userId);
        return generateAuthForUser(userId);
    }

    // ---- Login ----

    public AuthData login(String userId, String rawPin) {
        requirePersonnelExists(userId);

        // 检查锁定
        FailRecord record = failMap.computeIfAbsent(userId, k -> new FailRecord());
        synchronized (record) {
            if (record.isLocked()) {
                long remainSec = record.remainingSeconds();
                throw TwinBusinessException.of(
                        ErrorCodeConstants.SPECIAL_CHANNEL_PIN_LOCKED,
                        "密码已锁定，请" + remainSec + "秒后重试"
                );
            }

            String storedHash = aroPersonnelMapper.findPersonalPinByUserId(userId);
            if (!StringUtils.hasText(storedHash)) {
                throw TwinBusinessException.of(
                        ErrorCodeConstants.SPECIAL_CHANNEL_PIN_NOT_SET,
                        "请先设置个人密码"
                );
            }

            boolean matched = passwordEncoder.matches(rawPin, storedHash);

            if (!matched) {
                record.failCount++;
                if (record.failCount >= MAX_FAIL_COUNT) {
                    record.lockUntil = Instant.now().plusSeconds(LOCK_DURATION_SEC);
                    log.warn("[special-channel] locked userId={} until={}", userId, record.lockUntil);
                    throw TwinBusinessException.of(
                            ErrorCodeConstants.SPECIAL_CHANNEL_PIN_LOCKED,
                            "密码错误次数过多，已锁定" + LOCK_DURATION_SEC + "秒"
                    );
                }
                log.warn("[special-channel] login fail userId={} attempt={}", userId, record.failCount);
                throw TwinBusinessException.of(
                        ErrorCodeConstants.SPECIAL_CHANNEL_PIN_INVALID,
                        "个人密码错误"
                );
            }

            // 成功 — 清零
            failMap.remove(userId);
            log.info("[special-channel] login ok userId={}", userId);
        }

        ensureAccountExists(userId);
        return generateAuthForUser(userId);
    }

    // ---- Reset (admin) ----

    @Transactional
    public void resetPin(String userId, String adminId) {
        requirePersonnelExists(userId);
        aroPersonnelMapper.clearPersonalPin(userId);
        failMap.remove(userId);
        log.warn("[special-channel] PIN reset by admin={} for userId={}", adminId, userId);
    }

    // ---- Private helpers ----

    private void validatePinFormat(String pin) {
        if (pin == null || !pin.matches(PIN_PATTERN)) {
            throw TwinBusinessException.of(
                    ErrorCodeConstants.SPECIAL_CHANNEL_PIN_FORMAT,
                    "密码为6-8位纯数字"
            );
        }
    }

    private void requirePersonnelExists(String userId) {
        if (aroPersonnelMapper.findByUserId(userId) == null) {
            throw TwinBusinessException.of(
                    ErrorCodeConstants.SPECIAL_CHANNEL_USER_NOT_FOUND,
                    "未在人员库中找到该学号"
            );
        }
    }

    private void ensureAccountExists(String userId) {
        User existing = userMapper.findById(userId);
        if (existing != null) return;
        User user = new User();
        user.setId(userId);
        user.setUsername(userId);
        user.setRole(RoleEnum.STUDENT);
        user.setStatus(1);
        user.setAuthProfile(AuthProfileConstants.WEB_PASSWORD);
        userMapper.insertUser(user);
        log.info("[special-channel] auto-created account userId={}", userId);
    }

    private AuthData generateAuthForUser(String userId) {
        User user = userMapper.findById(userId);
        if (user == null) {
            throw TwinBusinessException.of(
                    ErrorCodeConstants.SPECIAL_CHANNEL_ACCOUNT_DISABLED,
                    "账号不存在"
            );
        }
        if (user.getStatus() != null && user.getStatus() == 0) {
            throw TwinBusinessException.of(
                    ErrorCodeConstants.SPECIAL_CHANNEL_ACCOUNT_DISABLED,
                    "账号已禁用"
            );
        }
        user.setRole(authService.normalizeRole(user.getRole()));
        return authService.generateAuthResult(user).getData();
    }

    // ---- Inner class ----

    private static class FailRecord {
        int failCount = 0;
        Instant lockUntil = Instant.EPOCH;

        boolean isLocked() {
            return lockUntil.isAfter(Instant.now());
        }

        long remainingSeconds() {
            return Math.max(0, lockUntil.getEpochSecond() - Instant.now().getEpochSecond());
        }
    }
}
