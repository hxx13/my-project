package com.example.demo.common.config;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

@Component
public class AdminAuthInterceptor implements HandlerInterceptor {

    public static final String CURRENT_ADMIN_USER_ATTR = "CURRENT_ADMIN_USER";
    private static final int ADMIN_BASE_MIN_LEVEL = RoleEnum.STAFF.getLevel();
    /** AUP config 三页写门禁所需最低角色：ADMIN 起（而非普通员工 STAFF）。 */
    private static final int AUP_CONFIG_MIN_LEVEL = RoleEnum.ADMIN.getLevel();
    private final JwtTokenService jwtTokenService;

    public AdminAuthInterceptor(JwtTokenService jwtTokenService) {
        this.jwtTokenService = jwtTokenService;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        User user = resolveUser(request);
        if (user == null) {
            writeUnauthorized(response, "未登录或 Token 缺失");
            return false;
        }
        if (!isStaffBase(user) || roleLevel(user) < ADMIN_BASE_MIN_LEVEL) {
            writeForbidden(response);
            return false;
        }
        request.setAttribute(CURRENT_ADMIN_USER_ATTR, user);
        return true;
    }

    /**
     * AUP config 三页（模板写 / 字典 / 名册写）门禁：RoleEnum≥ADMIN（统一角色等级）。
     */
    public boolean preHandleAupConfigAdmin(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        User user = resolveUser(request);
        if (user == null) {
            writeUnauthorized(response, "未登录或 Token 缺失");
            return false;
        }
        if (!isStaffBase(user) || roleLevel(user) < AUP_CONFIG_MIN_LEVEL) {
            writeForbidden(response);
            return false;
        }
        request.setAttribute(CURRENT_ADMIN_USER_ATTR, user);
        return true;
    }

    /**
     * 仅校验「教职工底座」（role≥STAFF），角色仍交由控制器按业务（admin/secretary）裁决。
     * 用于名册配置 GET：秘书（非 ADMIN）需读取 reviewer-config 以判定自身身份。
     */
    public boolean preHandleStaffBase(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        User user = resolveUser(request);
        if (user == null) {
            writeUnauthorized(response, "未登录或 Token 缺失");
            return false;
        }
        if (!isStaffBase(user)) {
            writeForbidden(response);
            return false;
        }
        request.setAttribute(CURRENT_ADMIN_USER_ATTR, user);
        return true;
    }

    /**
     * 教职工 sys_user 底座判定：统一按角色等级判定（role≥STAFF 即视为教职工），
     * 不再用 accountSource 区分学生库/教职工库 —— 两视角合并为一套权限体系，
     * 学生库账号若被授予高角色同样按角色放行。
     */
    public boolean isStaffBase(User user) {
        if (user == null) {
            return false;
        }
        return roleLevel(user) >= RoleEnum.STAFF.getLevel();
    }

    private int roleLevel(User user) {
        RoleEnum role = user.getRole();
        return role == null ? RoleEnum.MEMBER.getLevel() : role.getLevel();
    }

    private User resolveUser(HttpServletRequest request) {
        String authHeader = request.getHeader("Authorization");
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            return null;
        }
        String token = authHeader.substring("Bearer ".length()).trim();
        if (token.isBlank()) {
            return null;
        }
        return jwtTokenService.validateTokenAndResolveUser(token);
    }

    private void writeForbidden(HttpServletResponse response) throws Exception {
        response.setStatus(HttpServletResponse.SC_FORBIDDEN);
        response.setContentType("application/json;charset=UTF-8");
        response.getWriter().write("{\"code\":403,\"success\":false,\"message\":\"无权限访问\"}");
    }

    private void writeUnauthorized(HttpServletResponse response, String message) throws Exception {
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType("application/json;charset=UTF-8");
        response.getWriter().write("{\"code\":401,\"success\":false,\"message\":\"" + message + "\"}");
    }
}
