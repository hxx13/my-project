package com.example.demo.common.component;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.annotation.Order;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import jakarta.servlet.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * GET /api/client-version 速率限制：per-IP 每分钟最多 120 次。
 * 内网 IP 段（10.x, 172.16-31.x, 192.168.x）直接放行。
 */
@Component
@Order(-100)
public class ClientVersionRateLimitFilter implements Filter {

    private static final Logger log = LoggerFactory.getLogger(ClientVersionRateLimitFilter.class);
    private static final String TARGET_PATH = "/api/client-version";
    private static final int MAX_REQUESTS_PER_MINUTE = 120;

    private final ConcurrentHashMap<String, RateWindow> windows = new ConcurrentHashMap<>();

    private static class RateWindow {
        final AtomicInteger count = new AtomicInteger(0);
        volatile long windowStartMs = System.currentTimeMillis();
    }

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        HttpServletRequest req = (HttpServletRequest) request;
        HttpServletResponse res = (HttpServletResponse) response;

        if (!TARGET_PATH.equals(req.getRequestURI()) || !"GET".equalsIgnoreCase(req.getMethod())) {
            chain.doFilter(request, response);
            return;
        }

        String ip = clientIp(req);

        if (isPrivateIp(ip)) {
            chain.doFilter(request, response);
            return;
        }

        RateWindow window = windows.computeIfAbsent(ip, k -> new RateWindow());
        long now = System.currentTimeMillis();

        if (now - window.windowStartMs > 60_000) {
            synchronized (window) {
                if (now - window.windowStartMs > 60_000) {
                    window.count.set(0);
                    window.windowStartMs = now;
                }
            }
        }

        int current = window.count.incrementAndGet();
        if (current > MAX_REQUESTS_PER_MINUTE) {
            log.warn("[rate-limit] {} 超过限制 {} req/min，返回 429", ip, current);
            res.setStatus(429);
            res.setContentType("application/json;charset=UTF-8");
            res.getWriter().write("{\"success\":false,\"message\":\"请求过于频繁，请稍后再试\"}");
            return;
        }

        chain.doFilter(request, response);
    }

    /** 定时清理 5 分钟以上未活跃的 IP 窗口，防止内存泄漏 */
    @Scheduled(fixedRate = 300_000)
    public void cleanupStaleWindows() {
        long cutoff = System.currentTimeMillis() - 300_000;
        windows.entrySet().removeIf(e -> e.getValue().windowStartMs < cutoff);
    }

    private static String clientIp(HttpServletRequest request) {
        String xff = request.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            return xff.split(",")[0].trim();
        }
        String xri = request.getHeader("X-Real-IP");
        if (xri != null && !xri.isBlank()) return xri.trim();
        return request.getRemoteAddr();
    }

    private static boolean isPrivateIp(String ip) {
        if (ip == null) return false;
        if (ip.startsWith("10.") || ip.startsWith("192.168.")) return true;
        if (ip.startsWith("172.")) {
            try {
                int second = Integer.parseInt(ip.split("\\.")[1]);
                return second >= 16 && second <= 31;
            } catch (Exception e) {
                return false;
            }
        }
        return false;
    }
}
