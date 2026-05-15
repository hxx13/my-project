package com.example.demo.modules.dahua.service;

import com.example.demo.modules.dahua.util.RSAUtil;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import javax.net.ssl.*;
import java.security.cert.X509Certificate;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;

@Service
public class DahuaAuthService {

    private final String baseUrl = "https://172.22.161.200";
    private final String clientId = "client_id";
    private final String clientSecret = "85aa12c3-56aa-4ab9-9ccb-23db84791e5f";
    private final String username = "WYL";
    private final String passwordRaw = "Qazwsx@1234";

    // 💥 核心装甲：volatile 保证多线程可见性
    private volatile String cachedToken = null;
    private volatile Instant tokenExpireAt = null;
    private static final long REFRESH_AHEAD_SECONDS = 120L;

    // 全局共享的免 SSL 校验 RestTemplate
    private final RestTemplate restTemplate = createSecureRestTemplate();

    /**
     * 获取大华 BaseUrl，供其他服务拼接使用
     */
    public String getBaseUrl() {
        return baseUrl;
    }

    /**
     * 获取免 SSL 校验的 RestTemplate
     */
    public RestTemplate getRestTemplate() {
        return restTemplate;
    }

    /**
     * 🚀 绝对线程安全的 Token 获取方法 (双重检查锁定 DCL)
     */
    public String getValidToken() {
        if (cachedToken == null || isTokenExpiringSoon()) {
            synchronized (this) {
                if (cachedToken == null || isTokenExpiringSoon()) {
                    try {
                        register();
                    } catch (Exception e) {
                        System.err.println("❌ [大华鉴权] Token 获取致命失败: " + e.getMessage());
                        throw new RuntimeException("大华鉴权服务不可用");
                    }
                }
            }
        }
        return cachedToken;
    }

    /**
     * 强制刷新 Token (当其他服务收到 401 报错时调用)
     */
    public synchronized void forceRefreshToken() {
        try {
            System.out.println("🔄 [大华鉴权] 触发 Token 强制刷新...");
            register();
        } catch (Exception e) {
            System.err.println("❌ [大华鉴权] 强制刷新失败: " + e.getMessage());
        }
    }

    // 您原汁原味的注册与加密逻辑，一行未改！
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
            System.out.println("✅ [大华鉴权] Token 派发成功！");
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

    // 您原汁原味的 SSL 绕过逻辑，一行未改！
    private RestTemplate createSecureRestTemplate() {
        SimpleClientHttpRequestFactory f = new SimpleClientHttpRequestFactory();
        f.setConnectTimeout(5000);
        f.setReadTimeout(5000);
        try {
            SSLContext sc = SSLContext.getInstance("SSL");
            sc.init(null, new TrustManager[]{new X509TrustManager() {
                public X509Certificate[] getAcceptedIssuers() { return null; }
                public void checkClientTrusted(X509Certificate[] c, String a) { }
                public void checkServerTrusted(X509Certificate[] c, String a) { }
            }}, new java.security.SecureRandom());
            HttpsURLConnection.setDefaultSSLSocketFactory(sc.getSocketFactory());
            HttpsURLConnection.setDefaultHostnameVerifier((h, s) -> true);
        } catch (Exception ignored) {}
        return new RestTemplate(f);
    }
}