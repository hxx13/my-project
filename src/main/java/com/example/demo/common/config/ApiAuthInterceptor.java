package com.example.demo.common.config;

import com.example.demo.modules.auth.entity.User;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

@Component
public class ApiAuthInterceptor implements HandlerInterceptor {

    private static final Logger log = LoggerFactory.getLogger(ApiAuthInterceptor.class);
    public static final String CURRENT_USER_ATTR = "CURRENT_API_USER";

    private final JwtTokenService jwtTokenService;

    public ApiAuthInterceptor(JwtTokenService jwtTokenService) {
        this.jwtTokenService = jwtTokenService;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            return true;
        }
        String authHeader = request.getHeader("Authorization");
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            // SSE EventSource 无法设置自定义请求头，允许通过 query param 传递 token
            String queryToken = request.getParameter("token");
            if (queryToken != null && !queryToken.isBlank()) {
                User user = jwtTokenService.validateTokenAndResolveUser(queryToken.trim());
                if (user != null) {
                    request.setAttribute(CURRENT_USER_ATTR, user);
                    return true;
                }
            }
            writeUnauthorized(response, "未登录或 Token 缺失");
            return false;
        }
        String token = authHeader.substring("Bearer ".length()).trim();
        if (token.isBlank()) {
            writeUnauthorized(response, "Token 非法");
            return false;
        }
        User user = jwtTokenService.validateTokenAndResolveUser(token);
        if (user == null) {
            writeUnauthorized(response, "Token 无效或已过期");
            return false;
        }
        request.setAttribute(CURRENT_USER_ATTR, user);
        return true;
    }

    private void writeUnauthorized(HttpServletResponse response, String message) throws Exception {
        log.debug("[ApiAuth] 拦截未授权请求: {} {}", message, response.getStatus());
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType("application/json;charset=UTF-8");
        response.getWriter().write("{\"code\":401,\"success\":false,\"message\":\"" + message + "\"}");
    }
}
