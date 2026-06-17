package com.example.demo.common.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebMvcConfig implements WebMvcConfigurer {

    private final AdminAuthInterceptor adminAuthInterceptor;
    private final ApiAuthInterceptor apiAuthInterceptor;

    public WebMvcConfig(AdminAuthInterceptor adminAuthInterceptor, ApiAuthInterceptor apiAuthInterceptor) {
        this.adminAuthInterceptor = adminAuthInterceptor;
        this.apiAuthInterceptor = apiAuthInterceptor;
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOriginPatterns("http://localhost:*", "http://127.0.0.1:*")
                .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
                .allowedHeaders("*")
                .allowCredentials(false)
                .maxAge(3600);
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(adminAuthInterceptor)
                .addPathPatterns("/api/admin/**");

        registry.addInterceptor(apiAuthInterceptor)
                .addPathPatterns("/api/v1/**", "/api/me/**", "/api/chat/**",
                        "/api/upload/**", "/api/notifications/**", "/api/supplies/**",
                        "/api/repair/**", "/api/purchase/**", "/api/mp/**",
                        "/api/face/**")
                .excludePathPatterns("/api/auth/**", "/api/public/**",
                        "/api/event/**", "/api/upload/files/**",
                        "/api/upload/sync/**", "/api/upload/records/*",
                        "/api/upload/proxy-image",
                        "/api/face/baseline/proxy-image",
                        "/api/upload/records/*/wechat-file-id",
                        "/api/upload/cloud-mappings",
                        "/api/upload/repair/**",
                        "/api/v1/twin/dashboard/proxy/**");
    }
}
