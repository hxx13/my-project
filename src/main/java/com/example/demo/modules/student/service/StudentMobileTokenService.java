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
    /** 免登录码长期有效，靠重新生成作废止损 */
    private static final int LONG_TERM_DAYS = 3650;

    private final StudentMobileTokenMapper tokenMapper;

    public StudentMobileTokenService(StudentMobileTokenMapper tokenMapper) {
        this.tokenMapper = tokenMapper;
    }

    /** 为账号生成新 token（旧的全部失效），返回 token 串 */
    public String generateToken(String userId) {
        if (userId == null || userId.isBlank()) {
            throw new TwinBusinessException(ErrorCodeConstants.BAD_REQUEST, "userId 不能为空");
        }
        int days = LONG_TERM_DAYS;

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
     * 校验 token 并返回 userId（公开换票）。
     * 不对访问网络做限制：手机网络切换频繁，令牌只靠有效期与作废状态约束。
     */
    public String validateToken(String token) {
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
