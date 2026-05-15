package com.example.demo.common.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.annotation.Order;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * 可选：配置 app.mp.proxy.secret 非空后，要求访问 /api/** 的请求携带相同值的 X-Proxy-Secret，
 * 用于公网暴露 Spring 时仅允许经微信云函数转发。留空则不启用，Web 直连调试不受影响。
 */
@Component
@Order(0)
public class MpCloudProxySecretFilter extends OncePerRequestFilter {

    public static final String HEADER_NAME = "X-Proxy-Secret";

    @Value("${app.mp.proxy.secret:}")
    private String expectedSecret;

    @Override
    protected void doFilterInternal(
            @NonNull HttpServletRequest request,
            @NonNull HttpServletResponse response,
            @NonNull FilterChain filterChain) throws ServletException, IOException {
        if (!StringUtils.hasText(expectedSecret)) {
            filterChain.doFilter(request, response);
            return;
        }
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            filterChain.doFilter(request, response);
            return;
        }
        String uri = request.getRequestURI();
        if (uri == null || !uri.startsWith("/api/")) {
            filterChain.doFilter(request, response);
            return;
        }
        // <img> 无法携带 X-Proxy-Secret；头像同源代理必须放行
        if (uri.startsWith("/api/v1/twin/dashboard/proxy/personnel-avatar")) {
            filterChain.doFilter(request, response);
            return;
        }
        String provided = request.getHeader(HEADER_NAME);
        if (!expectedSecret.equals(provided)) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setCharacterEncoding(StandardCharsets.UTF_8.name());
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write("{\"success\":false,\"message\":\"云函数代理密钥无效或未携带\"}");
            return;
        }
        filterChain.doFilter(request, response);
    }
}
