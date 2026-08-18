package com.example.demo.common.config;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.entity.UserAroBinding;
import com.example.demo.modules.auth.mapper.UserMapper;
import com.example.demo.modules.auth.mapper.UserAroBindingMapper;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.Date;

@Service
public class JwtTokenService {

    private static final Logger log = LoggerFactory.getLogger(JwtTokenService.class);

    @Value("${app.jwt.secret:}")
    private String configuredSecret;

    private final UserMapper userMapper;
    private final UserAroBindingMapper userAroBindingMapper;
    private SecretKey secretKey;

    public JwtTokenService(UserMapper userMapper, UserAroBindingMapper userAroBindingMapper) {
        this.userMapper = userMapper;
        this.userAroBindingMapper = userAroBindingMapper;
    }

    @PostConstruct
    void init() {
        if (configuredSecret != null && !configuredSecret.isBlank()) {
            byte[] keyBytes = Base64.getDecoder().decode(configuredSecret.trim());
            this.secretKey = Keys.hmacShaKeyFor(keyBytes);
            log.info("[JWT] 已加载自定义签名密钥");
        } else {
            this.secretKey = Keys.hmacShaKeyFor(java.util.UUID.randomUUID().toString().getBytes(StandardCharsets.UTF_8));
            log.warn("[JWT] 未配置 app.jwt.secret，使用随机临时密钥（重启后所有 Token 失效）");
        }
    }

    public String generateToken(User user) {
        Instant now = Instant.now();
        return Jwts.builder()
                .subject(user.getId())
                .claim("role", user.getRole().name())
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(30, ChronoUnit.DAYS)))
                .signWith(secretKey)
                .compact();
    }

    public String generateImpersonationToken(User staffUser, String aroUserId) {
        Instant now = Instant.now();
        return Jwts.builder()
                .subject(aroUserId)
                .claim("role", RoleEnum.MEMBER.name())
                .claim("impersonatedBy", staffUser.getId())
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(30, ChronoUnit.DAYS)))
                .signWith(secretKey)
                .compact();
    }

    /** 人脸验证通过凭证 claim type */
    public static final String CLAIM_FACE_VERIFY = "face_verify";

    private static final String LEGACY_MOCK_PREFIX = "jwt_mock_token_";

    public User validateTokenAndResolveUser(String token) {
        if (token.startsWith(LEGACY_MOCK_PREFIX)) {
            String userId = token.substring(LEGACY_MOCK_PREFIX.length());
            if (userId.isBlank()) return null;
            User user = userMapper.findById(userId);
            if (user == null) return null;
            if (user.getStatus() != null && user.getStatus() == 0) return null;
            return user;
        }
        try {
            Claims claims = Jwts.parser()
                    .verifyWith(secretKey)
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();
            String userId = claims.getSubject();
            if (userId == null || userId.isBlank()) {
                return null;
            }

            User user = userMapper.findById(userId);
            if (user == null) {
                return null;
            }
            if (user.getStatus() != null && user.getStatus() == 0) {
                return null;
            }
            // 统一权限：一个人合并后有教职工/学生两个 id，取两者最高角色
            resolveUnifiedRole(user);
            return user;
        } catch (JwtException e) {
            log.debug("[JWT] Token 校验失败: {}", e.getMessage());
            return null;
        }
    }

    /** 解析模拟学生 token 里的教职工（impersonatedBy）身份；非模拟 token 返回 null */
    public User resolveImpersonator(String token) {
        if (token == null || token.isBlank() || token.startsWith(LEGACY_MOCK_PREFIX)) {
            return null;
        }
        try {
            Claims claims = Jwts.parser()
                    .verifyWith(secretKey)
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();
            String impersonatedBy = claims.get("impersonatedBy", String.class);
            if (impersonatedBy == null || impersonatedBy.isBlank()) {
                return null;
            }
            return userMapper.findById(impersonatedBy);
        } catch (JwtException e) {
            log.debug("[JWT] 解析教职工身份失败: {}", e.getMessage());
            return null;
        }
    }

    /**
     * 角色保持数据库原值，不再自动取对端最高角色。
     * MEMBER（最低权限）学生不得进管理后台是特制设计；绑定只用于「切换视角」，不抬升 role。
     */
    public void resolveUnifiedRole(User user) {
        // no-op：role 以 sys_user.role 为准，登录/解析 token 时不自动升级
    }

    private static final int REFRESH_WINDOW_DAYS = 60;

    public boolean isImpersonatedToken(String token) {
        if (token == null || token.isBlank() || token.startsWith(LEGACY_MOCK_PREFIX)) {
            return false;
        }
        try {
            Claims claims = Jwts.parser()
                    .verifyWith(secretKey)
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();
            String impersonatedBy = claims.get("impersonatedBy", String.class);
            return impersonatedBy != null && !impersonatedBy.isBlank();
        } catch (JwtException e) {
            return false;
        }
    }

    /** 签发人脸验证通过凭证（5 分钟有效，绑定 userId + sessionId） */
    public String generateFaceVerifyToken(String userId, String sessionId, double similarity) {
        Instant now = Instant.now();
        return Jwts.builder()
                .subject(userId)
                .claim("typ", CLAIM_FACE_VERIFY)
                .claim("sid", sessionId != null ? sessionId : "")
                .claim("sim", similarity)
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(5, ChronoUnit.MINUTES)))
                .signWith(secretKey)
                .compact();
    }

    /** 校验人脸验证凭证是否有效且 userId 一致 */
    public boolean validateFaceVerifyToken(String token, String expectedUserId) {
        if (token == null || token.isBlank() || expectedUserId == null || expectedUserId.isBlank()) {
            return false;
        }
        try {
            Claims claims = Jwts.parser()
                    .verifyWith(secretKey)
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();
            String typ = claims.get("typ", String.class);
            if (!CLAIM_FACE_VERIFY.equals(typ)) {
                return false;
            }
            String userId = claims.getSubject();
            return expectedUserId.equals(userId);
        } catch (JwtException e) {
            log.debug("[JWT] 人脸验证 Token 无效: {}", e.getMessage());
            return false;
        }
    }

    public User validateTokenForRefresh(String token) {
        try {
            Claims claims;
            try {
                claims = Jwts.parser()
                        .verifyWith(secretKey)
                        .build()
                        .parseSignedClaims(token)
                        .getPayload();
            } catch (ExpiredJwtException e) {
                claims = e.getClaims();
            }
            String userId = claims.getSubject();
            if (userId == null || userId.isBlank()) return null;
            Instant issuedAt = claims.getIssuedAt() != null
                    ? claims.getIssuedAt().toInstant()
                    : Instant.EPOCH;
            if (issuedAt.plus(REFRESH_WINDOW_DAYS, ChronoUnit.DAYS).isBefore(Instant.now())) {
                log.debug("[JWT] Token 签发超过 {} 天，拒绝刷新 userId={}", REFRESH_WINDOW_DAYS, userId);
                return null;
            }

            User user = userMapper.findById(userId);
            if (user == null || (user.getStatus() != null && user.getStatus() == 0)) return null;
            return user;
        } catch (JwtException e) {
            log.debug("[JWT] Token 刷新校验失败: {}", e.getMessage());
            return null;
        }
    }
}
