package com.example.demo.common.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedDeque;

/**
 * 登录/注册接口简单限流（单机内存），减轻撞库与批量注册。
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 20)
public class AuthEndpointRateLimitFilter extends OncePerRequestFilter {

    private static final String LOGIN_PATH = "/api/auth/login/web";
    private static final String REGISTER_PATH = "/api/auth/register/staff";
    private static final String FORGOT_PWD_VERIFY = "/api/auth/forgot-password/verify";
    private static final String FORGOT_PWD_RESET = "/api/auth/forgot-password/reset";
    private static final String PIN_SELF_RESET = "/api/auth/special-channel/self/reset-pin";

    private final Map<String, Deque<Long>> loginHits = new ConcurrentHashMap<>();
    private final Map<String, Deque<Long>> registerHits = new ConcurrentHashMap<>();
    private final Map<String, Deque<Long>> forgotPwdHits = new ConcurrentHashMap<>();
    private final Map<String, Deque<Long>> pinSelfResetHits = new ConcurrentHashMap<>();

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String uri = request.getRequestURI();
        return !LOGIN_PATH.equals(uri)
            && !REGISTER_PATH.equals(uri)
            && !FORGOT_PWD_VERIFY.equals(uri)
            && !FORGOT_PWD_RESET.equals(uri)
            && !PIN_SELF_RESET.equals(uri);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        String ip = clientIp(request);
        String uri = request.getRequestURI();
        if (LOGIN_PATH.equals(uri)) {
            if (!allow(loginHits, ip, 60_000L, 40)) {
                tooMany(response);
                return;
            }
        } else if (REGISTER_PATH.equals(uri)) {
            if (!allow(registerHits, ip, 3_600_000L, 30)) {
                tooMany(response);
                return;
            }
        } else if (FORGOT_PWD_VERIFY.equals(uri) || FORGOT_PWD_RESET.equals(uri)) {
            if (!allow(forgotPwdHits, ip, 300_000L, 5)) {
                tooMany(response);
                return;
            }
        } else if (PIN_SELF_RESET.equals(uri)) {
            if (!allow(pinSelfResetHits, ip, 300_000L, 5)) {
                tooMany(response);
                return;
            }
        }
        filterChain.doFilter(request, response);
    }

    private static boolean allow(Map<String, Deque<Long>> bucket, String key, long windowMs, int max) {
        long now = System.currentTimeMillis();
        Deque<Long> q = bucket.computeIfAbsent(key, k -> new ConcurrentLinkedDeque<>());
        synchronized (q) {
            while (!q.isEmpty() && q.peekFirst() != null && now - q.peekFirst() > windowMs) {
                q.pollFirst();
            }
            if (q.size() >= max) {
                return false;
            }
            q.addLast(now);
            return true;
        }
    }

    private static void tooMany(HttpServletResponse response) throws IOException {
        response.setStatus(429);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.getWriter().write("{\"code\":429,\"success\":false,\"message\":\"请求过于频繁，请稍后再试\"}");
    }

    private static String clientIp(HttpServletRequest request) {
        String xff = request.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            return xff.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }
}
