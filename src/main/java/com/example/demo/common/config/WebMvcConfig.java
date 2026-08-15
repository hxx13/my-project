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
                        "/api/aup-dict/**",
                        "/api/person-identity/**");

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

        // AUP 模板：只读 GET 仅需登录（学生填表/审核加载表单结构），写操作仍需 STAFF 门禁
        registry.addInterceptor(aupTemplateWriteGuard())
                .addPathPatterns("/api/aup-template/**");

        registry.addInterceptor(requestMetricsInterceptor)
                .addPathPatterns("/api/**")
                .excludePathPatterns(
                    "/api/v1/monitor/**",
                    "/api/auth/**",
                    "/api/public/**"
                );
    }

    /**
     * AUP 模板写操作守卫：GET（只读，学生加载结构）放行给 {@link ApiAuthInterceptor} 校验登录，
     * 其余写方法（POST/PUT/DELETE）转发 {@link AdminAuthInterceptor} 校验 STAFF。
     *
     * 不能用 excludePathPatterns 拆分，因为 /api/aup-template/{id} 同时承载 GET 详情与 PUT/DELETE 写，
     * 纯路径无法区分 HTTP 方法，故按方法门禁。
     */
    private HandlerInterceptor aupTemplateWriteGuard() {
        return new HandlerInterceptor() {
            @Override
            public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
                String method = request.getMethod();
                if ("OPTIONS".equalsIgnoreCase(method) || "GET".equalsIgnoreCase(method)) {
                    return true;
                }
                return adminAuthInterceptor.preHandle(request, response, handler);
            }
        };
    }
}
