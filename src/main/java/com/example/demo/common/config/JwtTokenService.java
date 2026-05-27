package com.example.demo.common.config;

import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.mapper.UserMapper;
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
    private SecretKey secretKey;

    public JwtTokenService(UserMapper userMapper) {
        this.userMapper = userMapper;
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
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(30, ChronoUnit.DAYS)))
                .signWith(secretKey)
                .compact();
    }

    private static final String LEGACY_MOCK_PREFIX = "jwt_mock_token_";

    public User validateTokenAndResolveUser(String token) {
        if (token.startsWith(LEGACY_MOCK_PREFIX)) {
            String userId = token.substring(LEGACY_MOCK_PREFIX.length());
            if (userId.isBlank()) return null;
            log.warn("[JWT] 检测到旧版 mock token，已兼容放行 userId={}，请前端重新登录以升级为 JWT", userId);
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
            return user;
        } catch (JwtException e) {
            log.debug("[JWT] Token 校验失败: {}", e.getMessage());
            return null;
        }
    }

    private static final int REFRESH_WINDOW_DAYS = 60;

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
