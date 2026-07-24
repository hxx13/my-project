package com.example.demo.common.config;

import com.example.demo.common.event.CredentialsChangedEvent;
import com.example.demo.modules.notification.service.NotificationSettingsService;
import jakarta.annotation.PostConstruct;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.event.EventListener;
import org.springframework.core.annotation.Order;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * @deprecated 2026-07: 云函数 springProxy 配套过滤器。小程序已改为直连，不再需要校验 X-Proxy-Secret。
 * 当前 app.mp.proxy.secret 为空，Filter 已实际旁路。待确认无云函数流量后移除此类。
 */
@Deprecated
@Component
@Order(0)
public class MpCloudProxySecretFilter extends OncePerRequestFilter {

    public static final String HEADER_NAME = "X-Proxy-Secret";

    @Value("${app.mp.proxy.secret:}")
    private String defaultSecret;

    private final NotificationSettingsService settingsService;

    private volatile String expectedSecret;

    public MpCloudProxySecretFilter(NotificationSettingsService settingsService) {
        this.settingsService = settingsService;
    }

    @PostConstruct
    public void init() {
        try {
            this.expectedSecret = settingsService.getEffectiveValue("credentials", "mp.proxy_secret", defaultSecret);
        } catch (Exception e) {
            // 数据库表尚未就绪（StartupRunner 建表晚于 @PostConstruct），降级为默认值
            // CredentialsChangedEvent 触发后会重新从 DB 加载
            this.expectedSecret = defaultSecret;
        }
    }

    @EventListener
    public void onCredentialsChanged(CredentialsChangedEvent event) {
        if (event.isCredentials() && "mp.proxy_secret".equals(event.getConfigKey())) {
            this.expectedSecret = settingsService.getEffectiveValue("credentials", "mp.proxy_secret", defaultSecret);
        }
    }

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
