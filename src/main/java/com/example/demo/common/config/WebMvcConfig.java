package com.example.demo.common.config;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebMvcConfig implements WebMvcConfigurer {

    private final AdminAuthInterceptor adminAuthInterceptor;
    private final ApiAuthInterceptor apiAuthInterceptor;
    private final RequestMetricsInterceptor requestMetricsInterceptor;

    public WebMvcConfig(AdminAuthInterceptor adminAuthInterceptor,
                        ApiAuthInterceptor apiAuthInterceptor,
                        RequestMetricsInterceptor requestMetricsInterceptor) {
        this.adminAuthInterceptor = adminAuthInterceptor;
        this.apiAuthInterceptor = apiAuthInterceptor;
        this.requestMetricsInterceptor = requestMetricsInterceptor;
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOriginPatterns("http://localhost:*", "http://127.0.0.1:*", "http://10.*:*", "https://aroultra.shsmu.edu.cn", "https://arodlas.shsmu.edu.cn")
                .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
                .allowedHeaders("*")
                .allowCredentials(false)
                .maxAge(3600);
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(adminAuthInterceptor)
                .addPathPatterns("/api/admin/**", "/api/portal/admin/**",
                        "/api/person-identity/**")
                // 笼位表单三条读路径供 H5/小程序详情弹窗使用（控制器内标注 MEMBER+ 可读）。
                // 拦截器统一卡 STAFF 会把学生（MEMBER）挡在控制器之外，requireMember + 课题组脱敏成为死代码。
                // 这三条路径上的写方法各自在控制器内 requireAdmin / requireEditor 自守，故整段排除是安全的；
                // 更深的写路径（/codelists/*/items 等）不匹配单层通配，仍受本拦截器保护。
                .excludePathPatterns("/api/admin/cage-info/templates/*",
                        "/api/admin/cage-info/values/*",
                        "/api/admin/cage-info/codelists/*");

        registry.addInterceptor(apiAuthInterceptor)
                .addPathPatterns("/api/v1/**", "/api/me/**", "/api/chat/**",
                        "/api/upload/**", "/api/notifications/**", "/api/supplies/**",
                        "/api/repair/**", "/api/purchase/**", "/api/mp/**",
                        "/api/face/**", "/api/scan/**", "/api/user/**",
                        "/api/aup/**", "/api/aup-template/**")
                .excludePathPatterns("/api/auth/**", "/api/public/**",
                        "/api/event/**", "/api/upload/files/**",
                        "/api/upload/sync/**", "/api/upload/records/*",
                        "/api/upload/proxy-image",
                        "/api/face/baseline/proxy-image",
                        "/api/upload/records/*/wechat-file-id",
                        "/api/upload/cloud-mappings",
                        "/api/upload/repair/**",
                        "/api/v1/twin/dashboard/proxy/**",
                        "/api/v1/twin/speech/file/**",
                        "/api/v1/twin/speech/scan-auto-play");

        // AUP 模板：GET 默认收紧为 sys_user 底座 + ADMIN，仅 /published（新填）与 /{id}（续填/审核）放行登录态；写操作收紧为 ADMIN
        registry.addInterceptor(aupTemplateWriteGuard())
                .addPathPatterns("/api/aup-template/**");

        // AUP 字典：后台配置数据，读+写均不外泄，仅 sys_user 底座 + ADMIN
        registry.addInterceptor(aupDictConfigGuard())
                .addPathPatterns("/api/aup-dict/**");

        // AUP 配置面新增三页（文件夹 / 字段字典 / 变更记录）：读+写均收紧为 sys_user 底座 + ADMIN
        registry.addInterceptor(aupConfigAdminGuard())
                .addPathPatterns("/api/aup-folder/**", "/api/aup-field/**", "/api/aup-config-audit/**");

        // AUP 名册配置：写操作 sys_user 底座 + ADMIN；读操作仅 sys_user 底座（角色仍由控制器按 admin/secretary 裁决）
        registry.addInterceptor(aupReviewerConfigGuard())
                .addPathPatterns("/api/aup/reviewer-config");

        registry.addInterceptor(requestMetricsInterceptor)
                .addPathPatterns("/api/**")
                .excludePathPatterns(
                    "/api/v1/monitor/**",
                    "/api/auth/**",
                    "/api/public/**"
                );
    }

    /**
     * AUP 模板门禁：写方法（POST/PUT/DELETE）转发 {@link AdminAuthInterceptor#preHandleAupConfigAdmin}
     * 校验「sys_user 底座 + RoleEnum≥ADMIN」。
     *
     * GET 默认同样收紧为 ADMIN（避免学生枚举版本列表 /、按版本反查 /resolve、
     * 版本历史 /{id}/versions、内置种子 /default-seed 等配置面），仅放行学生
     * 填表/续填/审核必需的结构读取：/published（新填）与 /{id}（续填/审核读取记录冻结模板）。
     *
     * 不能用 excludePathPatterns 拆分，因为 /api/aup-template/{id} 同时承载 GET 详情与 PUT/DELETE 写，
     * 纯路径无法区分 HTTP 方法，故按方法门禁。
     */
    private HandlerInterceptor aupTemplateWriteGuard() {
        return new HandlerInterceptor() {
            @Override
            public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
                String method = request.getMethod();
                if ("OPTIONS".equalsIgnoreCase(method)) {
                    return true;
                }
                if ("GET".equalsIgnoreCase(method)) {
                    return isStudentReadableTemplatePath(request)
                            ? true
                            : adminAuthInterceptor.preHandleAupConfigAdmin(request, response, handler);
                }
                return adminAuthInterceptor.preHandleAupConfigAdmin(request, response, handler);
            }
        };
    }

    /**
     * 学生可读的 GET /api/aup-template 子路径：
     * {@code /published}（新填当前 PUBLISHED 结构）与 {@code /{id}}（单段数字，续填/审核读取记录冻结模板）。
     * 其余（版本列表、/resolve、/{id}/versions、/default-seed）返回 false → ADMIN 门禁。
     */
    private boolean isStudentReadableTemplatePath(HttpServletRequest request) {
        String sub = subPath(request);
        if (sub == null || sub.isEmpty()) {
            return false; // GET /api/aup-template —— 版本列表，ADMIN
        }
        if ("published".equals(sub)) {
            return true;
        }
        return sub.matches("\\d+"); // /{id} 单段数字
    }

    /** 返回 /api/aup-template 之后的子路径（不含前导斜杠）；非该前缀返回 null。 */
    private String subPath(HttpServletRequest request) {
        String uri = request.getRequestURI();
        String ctx = request.getContextPath();
        String path = (ctx != null && !ctx.isEmpty() && uri.startsWith(ctx)) ? uri.substring(ctx.length()) : uri;
        String prefix = "/api/aup-template";
        if (path.equals(prefix)) {
            return "";
        }
        if (path.startsWith(prefix + "/")) {
            return path.substring(prefix.length() + 1);
        }
        return null;
    }

    /** AUP 配置面新增页整条（读+写）门禁：后台配置数据不外泄，仅 sys_user 底座 + ADMIN。 */
    private HandlerInterceptor aupConfigAdminGuard() {
        return new HandlerInterceptor() {
            @Override
            public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
                if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
                    return true;
                }
                return adminAuthInterceptor.preHandleAupConfigAdmin(request, response, handler);
            }
        };
    }

    /** AUP 字典整条（读+写）门禁：后台配置数据不外泄，仅 sys_user 底座 + ADMIN。 */
    private HandlerInterceptor aupDictConfigGuard() {
        return new HandlerInterceptor() {
            @Override
            public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
                if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
                    return true;
                }
                return adminAuthInterceptor.preHandleAupConfigAdmin(request, response, handler);
            }
        };
    }

    /**
     * AUP 名册配置门禁：PUT 收紧为 sys_user 底座 + ADMIN；GET 仅 sys_user 底座，
     * admin/secretary 角色判断继续由 {@code AupReviewController} 执行（秘书读名册以判定自身身份）。
     */
    private HandlerInterceptor aupReviewerConfigGuard() {
        return new HandlerInterceptor() {
            @Override
            public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
                String method = request.getMethod();
                if ("OPTIONS".equalsIgnoreCase(method)) {
                    return true;
                }
                if ("PUT".equalsIgnoreCase(method)) {
                    return adminAuthInterceptor.preHandleAupConfigAdmin(request, response, handler);
                }
                return adminAuthInterceptor.preHandleStaffBase(request, response, handler);
            }
        };
    }
}
