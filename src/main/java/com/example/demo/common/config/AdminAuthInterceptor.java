package com.example.demo.common.config;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.mapper.UserMapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

@Component
public class AdminAuthInterceptor implements HandlerInterceptor {

    public static final String CURRENT_ADMIN_USER_ATTR = "CURRENT_ADMIN_USER";
    private static final String TOKEN_PREFIX = "jwt_mock_token_";
    private static final int ADMIN_BASE_MIN_LEVEL = RoleEnum.STAFF.getLevel();
    private final UserMapper userMapper;

    public AdminAuthInterceptor(UserMapper userMapper) {
        this.userMapper = userMapper;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        String authHeader = request.getHeader("Authorization");
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            writeUnauthorized(response, "未登录或 Token 缺失");
            return false;
        }
        String token = authHeader.substring("Bearer ".length()).trim();
        if (!token.startsWith(TOKEN_PREFIX)) {
            writeUnauthorized(response, "Token 非法");
            return false;
        }
        String userId = token.substring(TOKEN_PREFIX.length());
        if (userId.isBlank()) {
            writeUnauthorized(response, "Token 非法");
            return false;
        }
        User user = userMapper.findById(userId);
        if (user == null) {
            writeUnauthorized(response, "用户不存在");
            return false;
        }
        if (user.getStatus() != null && user.getStatus() == 0) {
            writeUnauthorized(response, "账号已禁用");
            return false;
        }
        RoleEnum role = user.getRole();
        int level = role == null ? RoleEnum.STUDENT.getLevel() : role.getLevel();
        if (level < ADMIN_BASE_MIN_LEVEL) {
            response.setStatus(HttpServletResponse.SC_FORBIDDEN);
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write("{\"code\":403,\"success\":false,\"message\":\"无权限访问\"}");
            return false;
        }
        request.setAttribute(CURRENT_ADMIN_USER_ATTR, user);
        return true;
    }

    private void writeUnauthorized(HttpServletResponse response, String message) throws Exception {
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType("application/json;charset=UTF-8");
        response.getWriter().write("{\"code\":401,\"success\":false,\"message\":\"" + message + "\"}");
    }
}
