package com.example.demo.modules.auth.service;

import com.example.demo.modules.notification.service.NotificationSettingsService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;

/**
 * Cloudflare Turnstile 人机验证服务。
 * 配置从数据库 sys_system_config_def/item 表运行时读取，无需重启。
 * 参考: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */
@Service
public class TurnstileVerificationService {

    private static final Logger log = LoggerFactory.getLogger(TurnstileVerificationService.class);
    private static final String VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
    private static final ObjectMapper objectMapper = new ObjectMapper();
    private static final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();

    private final NotificationSettingsService settingsService;

    public TurnstileVerificationService(NotificationSettingsService settingsService) {
        this.settingsService = settingsService;
    }

    /**
     * 验证 Turnstile token。
     *
     * @param token 前端 widget 返回的 token
     * @return true 表示验证通过或 Turnstile 未启用
     */
    public boolean verify(String token) {
        return verify(token, false);
    }

    /**
     * @param token 前端 Turnstile widget 返回的 token
     * @param loadFailed 前端标记 widget 是否加载失败（CDN 超时）
     */
    public boolean verify(String token, boolean loadFailed) {
        // 紧急关闭：环境变量 TURNSTILE_ENABLED=false 可强制禁用（无需登录管理页，无需重启）
        String emergencyDisable = System.getenv("TURNSTILE_ENABLED");
        if ("false".equalsIgnoreCase(emergencyDisable)) {
            log.info("Turnstile 被环境变量 TURNSTILE_ENABLED=false 紧急关闭");
            return true;
        }

        Map<String, String> cfg = settingsService.getPublicRuntimeConfig();
        boolean enabled = parseBool(cfg.get("turnstile.enabled"), false);

        if (!enabled) {
            return true;
        }

        // secret-key 从完整配置读取（含环境变量覆盖），不可设为 is_public
        String secretKey = settingsService.getEffectiveValue("turnstile", "turnstile.secret-key", "");
        if (secretKey == null || secretKey.isBlank()) {
            log.error("Turnstile enabled=true 但 secret-key 未配置 —— 拒绝所有登录");
            return false;
        }
        if (token == null || token.isBlank()) {
            if (loadFailed) {
                // CDN 挂了，降级放行
                log.warn("Turnstile widget 加载失败（前端超时），降级放行");
                return true;
            }
            // widget 正常加载但用户未完成验证
            log.warn("Turnstile 未提供 token —— 拒绝登录");
            return false;
        }

        try {
            String body = "secret=" + java.net.URLEncoder.encode(secretKey, "UTF-8")
                    + "&response=" + java.net.URLEncoder.encode(token, "UTF-8");

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(VERIFY_URL))
                    .header("Content-Type", "application/x-www-form-urlencoded")
                    .timeout(Duration.ofSeconds(5))
                    .POST(HttpRequest.BodyPublishers.ofString(body))
                    .build();

            HttpResponse<String> response = httpClient.send(request,
                    HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() != 200) {
                log.warn("Turnstile API 返回 HTTP {} —— 临时放行", response.statusCode());
                return true;
            }

            JsonNode json = objectMapper.readTree(response.body());
            boolean success = json.path("success").asBoolean(false);

            if (!success) {
                log.warn("Turnstile 验证失败: {}", json.path("error-codes").toString());
            }

            return success;
        } catch (Exception e) {
            log.warn("Turnstile API 不可达，临时放行: {}", e.getMessage());
            return true;
        }
    }

    private static boolean parseBool(String v, boolean fallback) {
        if (v == null) return fallback;
        String s = v.trim().toLowerCase();
        if (s.isEmpty()) return fallback;
        return "true".equals(s) || "1".equals(s) || "yes".equals(s) || "on".equals(s);
    }
}
