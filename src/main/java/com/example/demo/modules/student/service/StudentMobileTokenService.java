package com.example.demo.modules.student.service;

import com.example.demo.common.exception.ErrorCodeConstants;
import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.modules.student.entity.StudentMobileToken;
import com.example.demo.modules.student.mapper.StudentMobileTokenMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.LocalDateTime;

@Service
public class StudentMobileTokenService {

    private static final Logger log = LoggerFactory.getLogger(StudentMobileTokenService.class);
    private static final SecureRandom RNG = new SecureRandom();
    private static final int DEFAULT_DURATION_DAYS = 3;

    private final StudentMobileTokenMapper tokenMapper;

    public StudentMobileTokenService(StudentMobileTokenMapper tokenMapper) {
        this.tokenMapper = tokenMapper;
    }

    /** 为学生生成新 token（旧的全部失效），返回 token 串 */
    public String generateToken(String userId, int durationDays) {
        if (userId == null || userId.isBlank()) {
            throw new TwinBusinessException(ErrorCodeConstants.BAD_REQUEST, "userId 不能为空");
        }
        int days = durationDays > 0 ? durationDays : DEFAULT_DURATION_DAYS;

        // 1. 旧 token 全部失效
        tokenMapper.deactivateAllByUserId(userId);

        // 2. 生成新 token
        String newToken = randomToken();
        LocalDateTime expiresAt = LocalDateTime.now().plusDays(days);
        tokenMapper.insert(newToken, userId, expiresAt);

        log.info("Generated mobile token for userId={}, expires in {} days", userId, days);
        return newToken;
    }

    /**
     * 校验 token 并返回 userId（公开接口）。
     * 首次访问记录 IP，若检测到多 IP 使用则使该用户全部 token 失效。
     */
    public String validateToken(String token, String clientIp) {
        if (token == null || token.isBlank()) {
            throw new TwinBusinessException(ErrorCodeConstants.MOBILE_TOKEN_INVALID, "链接无效");
        }

        StudentMobileToken record = tokenMapper.selectByToken(token.trim());
        if (record == null || record.getIsActive() == null || !record.getIsActive()) {
            throw new TwinBusinessException(ErrorCodeConstants.MOBILE_TOKEN_INVALID, "链接无效或已失效");
        }

        if (record.getExpiresAt() != null && record.getExpiresAt().isBefore(LocalDateTime.now())) {
            throw new TwinBusinessException(ErrorCodeConstants.MOBILE_TOKEN_EXPIRED, "链接已过期");
        }

        // 反分享：首次访问记录 IP，之后检测 IP 是否变化
        String storedIp = record.getLastIp();
        String ip = (clientIp != null && !clientIp.isBlank()) ? clientIp.trim() : null;

        if (ip != null) {
            if (storedIp == null) {
                // 首次访问，记录 IP
                tokenMapper.setLastIp(record.getId(), ip);
                log.info("Mobile token first access: userId={}, ip={}", record.getUserId(), ip);
            } else if (!storedIp.equals(ip)) {
                // 多 IP 检测 → 全部失效
                log.warn("Multi-IP detected for userId={}: stored={}, current={}. Deactivating all tokens.",
                        record.getUserId(), storedIp, ip);
                tokenMapper.deactivateAllByUserId(record.getUserId());
                throw new TwinBusinessException(ErrorCodeConstants.MOBILE_TOKEN_MULTI_IP,
                        "检测到多设备使用，链接已失效，请重新生成");
            }
        }

        return record.getUserId();
    }

    /**
     * WebSocket 等长连接场景：仅校验 token 有效性，不更新/校验 IP（避免握手地址与 HTTP 不一致导致无法订阅）。
     */
    public String resolveUserIdByToken(String token) {
        if (token == null || token.isBlank()) {
            throw new TwinBusinessException(ErrorCodeConstants.MOBILE_TOKEN_INVALID, "链接无效");
        }
        StudentMobileToken record = tokenMapper.selectByToken(token.trim());
        if (record == null || record.getIsActive() == null || !record.getIsActive()) {
            throw new TwinBusinessException(ErrorCodeConstants.MOBILE_TOKEN_INVALID, "链接无效或已失效");
        }
        if (record.getExpiresAt() != null && record.getExpiresAt().isBefore(LocalDateTime.now())) {
            throw new TwinBusinessException(ErrorCodeConstants.MOBILE_TOKEN_EXPIRED, "链接已过期");
        }
        return record.getUserId();
    }

    /** 获取用户当前活跃且未过期的 token 信息（供弹窗展示），无则返回 null */
    public StudentMobileToken getActiveToken(String userId) {
        if (userId == null || userId.isBlank()) return null;
        return tokenMapper.selectActiveByUserId(userId);
    }

    private String randomToken() {
        byte[] bytes = new byte[24];
        RNG.nextBytes(bytes);
        StringBuilder sb = new StringBuilder(48);
        for (byte b : bytes) {
            sb.append(String.format("%02x", b));
        }
        return sb.toString();
    }
}
