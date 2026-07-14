package com.example.demo.modules.dahua.service;

import com.example.demo.common.event.CredentialsChangedEvent;
import com.example.demo.modules.dahua.util.RSAUtil;
import com.example.demo.modules.notification.service.NotificationSettingsService;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.event.EventListener;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import javax.net.ssl.*;
import java.io.IOException;
import java.net.HttpURLConnection;
import java.security.SecureRandom;
import java.security.cert.X509Certificate;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;

@Service
public class DahuaAuthService {

    private static final Logger log = LoggerFactory.getLogger(DahuaAuthService.class);

    private static final long REFRESH_AHEAD_SECONDS = 120L;

    // @Value 仅作为默认值，运行时优先从系统设置（sys_system_config）读取
    @Value("${app.dahua.base-url:https://172.22.161.200}")
    private String defaultBaseUrl;
    @Value("${app.dahua.client-id:client_id}")
    private String defaultClientId;
    @Value("${app.dahua.client-secret:}")
    private String defaultClientSecret;
    @Value("${app.dahua.username:}")
    private String defaultUsername;
    @Value("${app.dahua.password:}")
    private String defaultPasswordRaw;
    @Value("${app.dahua.ssl-insecure:true}")
    private boolean defaultSslInsecure;

    private final NotificationSettingsService settingsService;

    // 运行时凭证（优先 DB，回退到 @Value）
    private String baseUrl;
    private String clientId;
    private String clientSecret;
    private String username;
    private String passwordRaw;
    private boolean sslInsecure;

    private volatile String cachedToken = null;
    private volatile Instant tokenExpireAt = null;
    private volatile RestTemplate restTemplate;

    public DahuaAuthService(NotificationSettingsService settingsService) {
        this.settingsService = settingsService;
    }

    @PostConstruct
    public void reloadCredentials() {
        try {
            this.baseUrl = settingsService.getEffectiveValue("credentials", "dahua.base_url", defaultBaseUrl);
            this.clientId = settingsService.getEffectiveValue("credentials", "dahua.client_id", defaultClientId);
            this.clientSecret = settingsService.getEffectiveValue("credentials", "dahua.client_secret", defaultClientSecret);
            this.username = settingsService.getEffectiveValue("credentials", "dahua.username", defaultUsername);
            this.passwordRaw = settingsService.getEffectiveValue("credentials", "dahua.password", defaultPasswordRaw);
            String sslStr = settingsService.getEffectiveValue("integration", "dahua.ssl_insecure", String.valueOf(defaultSslInsecure));
            this.sslInsecure = "true".equalsIgnoreCase(sslStr);
        } catch (Exception e) {
            // 数据库表尚未就绪，使用默认值；CredentialsChangedEvent 触发后会重新加载
        }
        this.restTemplate = createSecureRestTemplate();
        log.info("[大华鉴权] 凭证已从系统设置加载, baseUrl={}", baseUrl);
    }

    public String getBaseUrl() {
        return baseUrl;
    }

    public RestTemplate getRestTemplate() {
        return restTemplate;
    }

    public String getValidToken() {
        if (cachedToken == null || isTokenExpiringSoon()) {
            synchronized (this) {
                if (cachedToken == null || isTokenExpiringSoon()) {
                    try {
                        register();
                    } catch (Exception e) {
                        log.error("[大华鉴权] Token 获取致命失败", e);
                        throw new RuntimeException("大华鉴权服务不可用");
                    }
                }
            }
        }
        return cachedToken;
    }

    public synchronized void forceRefreshToken() {
        try {
            log.info("[大华鉴权] 触发 Token 强制刷新...");
            register();
        } catch (Exception e) {
            log.error("[大华鉴权] 强制刷新失败", e);
        }
    }

    @EventListener
    public void onCredentialsChanged(CredentialsChangedEvent event) {
        if (event.isCredentials() && event.getConfigKey() != null && event.getConfigKey().startsWith("dahua.")) {
            log.info("[大华鉴权] 系统设置凭证变动，重载并清除旧 Token: {}", event.getConfigKey());
            reloadCredentials();
            this.cachedToken = null;
            this.tokenExpireAt = null;
        }
    }

    /** 测试连接：尝试获取 Token，成功返回 true，失败返回错误消息。 */
    public Map<String, Object> testConnection() {
        try {
            reloadCredentials();
            this.cachedToken = null;
            this.tokenExpireAt = null;
            register();
            return Map.of("ok", true, "baseUrl", baseUrl);
        } catch (Exception e) {
            log.warn("[大华鉴权] 连接测试失败: {}", e.getMessage());
            return Map.of("ok", false, "error", e.getMessage());
        }
    }

    private void register() throws Exception {
        String keyUrl = baseUrl + "/evo-apigw/evo-oauth/1.0.0/oauth/public-key";
        Map<String, Object> keyRes = restTemplate.getForObject(keyUrl, Map.class);
        String publicKey = (String) ((Map) keyRes.get("data")).get("publicKey");
        String encryptedPwd = RSAUtil.encrypt(passwordRaw, publicKey);

        String authUrl = baseUrl + "/evo-apigw/evo-oauth/1.0.0/oauth/extend/token";
        Map<String, Object> authBody = new HashMap<>();
        authBody.put("client_id", clientId);
        authBody.put("client_secret", clientSecret);
        authBody.put("username", username);
        authBody.put("password", encryptedPwd);
        authBody.put("grant_type", "password");
        authBody.put("public_key", publicKey);

        Map<String, Object> tokenRes = restTemplate.postForObject(authUrl, authBody, Map.class);
        if (tokenRes != null && "0".equals(String.valueOf(tokenRes.get("code")))) {
            Map data = (Map) tokenRes.get("data");
            this.cachedToken = (String) data.get("access_token");
            long expiresIn = parseExpiresInSeconds(data.get("expires_in"));
            this.tokenExpireAt = Instant.now().plusSeconds(expiresIn);
            log.info("[大华鉴权] Token 派发成功");
        } else {
            throw new RuntimeException("大华接口拒绝了登录请求");
        }
    }

    private boolean isTokenExpiringSoon() {
        if (tokenExpireAt == null) {
            return true;
        }
        return Instant.now().plusSeconds(REFRESH_AHEAD_SECONDS).isAfter(tokenExpireAt);
    }

    private static long parseExpiresInSeconds(Object raw) {
        long fallback = 1800L;
        if (raw == null) {
            return fallback;
        }
        if (raw instanceof Number n) {
            long v = n.longValue();
            return v > 0 ? v : fallback;
        }
        try {
            long v = Long.parseLong(String.valueOf(raw));
            return v > 0 ? v : fallback;
        } catch (Exception ignored) {
            return fallback;
        }
    }

    private RestTemplate createSecureRestTemplate() {
        SimpleClientHttpRequestFactory f = new SimpleClientHttpRequestFactory() {
            @Override
            protected void prepareConnection(HttpURLConnection connection, String httpMethod) throws IOException {
                if (sslInsecure && connection instanceof HttpsURLConnection https) {
                    try {
                        SSLContext sc = SSLContext.getInstance("TLS");
                        sc.init(null, new TrustManager[]{new X509TrustManager() {
                            public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
                            public void checkClientTrusted(X509Certificate[] c, String a) { }
                            public void checkServerTrusted(X509Certificate[] c, String a) { }
                        }}, new SecureRandom());
                        https.setSSLSocketFactory(sc.getSocketFactory());
                        https.setHostnameVerifier((h, s) -> true);
                    } catch (Exception ignored) {
                        log.debug("SSL配置失败，退回默认校验: {}", ignored.getMessage());
                    }
                }
                super.prepareConnection(connection, httpMethod);
            }
        };
        f.setConnectTimeout(10_000);
        f.setReadTimeout(120_000);
        return new RestTemplate(f);
    }
}
