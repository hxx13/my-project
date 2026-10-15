package com.example.demo.modules.avidity.client;

import com.example.demo.modules.avidity.config.AvidityProperties;
import com.example.demo.modules.notification.service.NotificationSettingsService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 安维迪(云组态) API 客户端。
 *
 * <p><b>通用透传</b>：{@link #get}/{@link #post} 接受任意 {@code api/services/app/...} 路径，
 * 因此平台上那 1416 个接口（清单见 docs）一个不落地都能调，不需要为每个接口写方法。
 *
 * <p><b>口令为什么不发明文</b>：该平台登录走的是自有加密 —— 前端把口令与固定串异或后
 * 才发出去（{@code isEncrypted:true}）。密钥取自前端 bundle 的 {@code passwordXorStr}，
 * 已用一次真实登录的密文逐字节比对确认。改名/改版对方平台时这里要跟着改。
 *
 * <p>token 有效期 5 天，缓存到内存；偶发 401 就重登一次再重试，避免定时任务因 token 到期停摆。
 */
@Component
public class AvidityClient {

    private static final Logger log = LoggerFactory.getLogger(AvidityClient.class);

    private static final String PWD_XOR_KEY = "fcloudpassword".repeat(8);
    private static final String AUTH_PATH = "/api/TokenAuth/Authenticate";
    /** 到期前提前这么久就当作已过期，避免边界上正好撞 401。 */
    private static final long TOKEN_EARLY_RENEW_SECONDS = 300L;

    private final AvidityProperties properties;
    private final ObjectMapper objectMapper;

    private volatile String accessToken;
    private volatile long tokenExpiresAtEpochSecond;

    /**
     * 登录一并返回的加密令牌。**实时长连接拿它当门票**（连接地址上的 enc_auth_token），
     * 普通 accessToken 连不上。重登会换新的，所以跟 accessToken 一起缓存。
     */
    private volatile String encryptedAccessToken;

    /** 令牌是用哪一对账号口令换来的 —— 跟现在该用的那对比，不等就作废重登。 */
    private volatile String tokenUser;
    private volatile String tokenPass;

    private final NotificationSettingsService settingsService;

    public AvidityClient(AvidityProperties properties, ObjectMapper objectMapper,
                         NotificationSettingsService settingsService) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.settingsService = settingsService;
    }

    /**
     * 当前该用的账号口令，三档优先级：后台配置（库）→ 环境变量 → 配置文件。
     * 所以生产上既可以在后台页面上填，也可以用 AVIDITY_USERNAME / AVIDITY_PASSWORD。
     */
    private String[] credentials() {
        String user = settingsService.getEffectiveValue("credentials", "avidity.username", properties.getUsername());
        String pass = settingsService.getEffectiveValue("credentials", "avidity.password", properties.getPassword());
        return new String[]{user == null ? "" : user, pass == null ? "" : pass};
    }

    private boolean credentialsChanged() {
        String[] want = credentials();
        return !want[0].equals(tokenUser) || !want[1].equals(tokenPass);
    }

    public boolean isEnabled() {
        return properties.isEnabled();
    }

    /** 当前有效的加密令牌；没有就登录一次。 */
    public String encryptedToken() {
        token();
        return encryptedAccessToken;
    }

    /** 丢弃缓存令牌，下次调用重新登录。 */
    public void invalidateToken() {
        accessToken = null;
        tokenExpiresAtEpochSecond = 0L;
        encryptedAccessToken = null;
    }

    /** GET，参数进 query string。返回 ABP 响应里的 {@code result} 节点。 */
    public JsonNode get(String path) {
        return get(path, null);
    }

    public JsonNode get(String path, Map<String, ?> query) {
        return call(HttpMethod.GET, path, null, query, true);
    }

    /** POST，body 为可序列化对象（null 表示空 body）。 */
    public JsonNode post(String path, Object body) {
        return call(HttpMethod.POST, path, body, null, true);
    }

    private JsonNode call(HttpMethod method, String path, Object body, Map<String, ?> query, boolean authorized) {
        if (authorized) {
            try {
                return exchange(method, path, body, query, token());
            } catch (TokenExpiredException e) {
                log.info("[安维迪] token 已失效，重新登录后重试 {}", path);
                invalidateToken();
                return exchange(method, path, body, query, token());
            }
        }
        return exchange(method, path, body, query, null);
    }

    private String token() {
        // 账号口令可能在后台「系统设置 → 集成」里被改过。跟当前令牌用的不是同一对就立刻作废重登 ——
        // 否则改了口令要等令牌自然过期（最长 5 天）才轮到，用起来像「改了没反应」。
        if (StringUtils.hasText(accessToken) && credentialsChanged()) {
            log.info("[安维迪] 账号口令已变更，作废旧令牌重新登录");
            invalidateToken();
        }
        String cached = accessToken;
        if (StringUtils.hasText(cached) && System.currentTimeMillis() / 1000L < tokenExpiresAtEpochSecond) {
            return cached;
        }
        synchronized (this) {
            if (StringUtils.hasText(accessToken) && System.currentTimeMillis() / 1000L < tokenExpiresAtEpochSecond) {
                return accessToken;
            }
            login();
            return accessToken;
        }
    }

    /** 登录并缓存 token。 */
    public void login() {
        if (!StringUtils.hasText(properties.getBaseUrl())) {
            throw new IllegalStateException("未配置 app.avidity.base-url");
        }
        String[] cred = credentials();
        if (!StringUtils.hasText(cred[0]) || !StringUtils.hasText(cred[1])) {
            throw new IllegalStateException(
                    "未配置安维迪账号口令：到后台「系统设置 → 集成 → 外部系统凭证」里填，"
                            + "或给环境变量 AVIDITY_USERNAME / AVIDITY_PASSWORD");
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("userNameOrEmailAddressOrPhoneNumber", cred[0]);
        payload.put("password", xor(cred[1], PWD_XOR_KEY));
        payload.put("rememberClient", false);
        payload.put("twoFactorRememberClientToken", null);
        payload.put("singleSignIn", false);
        payload.put("returnUrl", null);
        payload.put("isEncrypted", true);

        JsonNode result;
        try {
            result = exchange(HttpMethod.POST, AUTH_PATH, payload, Map.of("isMobile", false), null);
        } catch (TokenExpiredException e) {
            throw new IllegalStateException("安维迪登录被拒（401），请核对 app.avidity.username / password 与账号状态");
        }
        String token = result.path("accessToken").asText(null);
        if (!StringUtils.hasText(token)) {
            throw new IllegalStateException("安维迪登录未返回 accessToken，请核对账号口令");
        }
        long expireInSeconds = result.path("expireInSeconds").asLong(3600L);
        accessToken = token;
        encryptedAccessToken = result.path("encryptedAccessToken").asText(null);
        tokenUser = cred[0];
        tokenPass = cred[1];
        tokenExpiresAtEpochSecond = System.currentTimeMillis() / 1000L + Math.max(60L, expireInSeconds - TOKEN_EARLY_RENEW_SECONDS);
        log.info("[安维迪] 登录成功 user={} 有效期={}s", cred[0], expireInSeconds);
    }

    private JsonNode exchange(HttpMethod method, String path, Object body, Map<String, ?> query, String bearer) {
        HttpHeaders headers = new HttpHeaders();
        headers.setAccept(java.util.List.of(MediaType.APPLICATION_JSON));
        headers.set(HttpHeaders.USER_AGENT, "twin-system-avidity/1.0");
        if (body != null) {
            headers.setContentType(MediaType.APPLICATION_JSON);
        }
        if (StringUtils.hasText(bearer)) {
            headers.set(HttpHeaders.AUTHORIZATION, "Bearer " + bearer);
        }

        UriComponentsBuilder ub = UriComponentsBuilder.fromHttpUrl(trimSlash(properties.getBaseUrl())).path(path);
        if (query != null) {
            query.forEach((k, v) -> {
                if (v != null) {
                    ub.queryParam(k, v);
                }
            });
        }
        String url = ub.encode().build().toUriString();

        HttpEntity<Object> entity = new HttpEntity<>(body, headers);
        ResponseEntity<String> response;
        try {
            response = buildRestTemplate().exchange(url, method, entity, String.class);
        } catch (HttpClientErrorException.Unauthorized e) {
            throw new TokenExpiredException();
        } catch (RestClientException e) {
            throw new IllegalStateException("调用安维迪接口失败 " + method + " " + path + " · " + e.getMessage(), e);
        }

        String raw = response.getBody();
        if (raw == null || raw.isBlank()) {
            throw new IllegalStateException("安维迪接口返回空响应体 " + method + " " + path);
        }
        JsonNode root;
        try {
            root = objectMapper.readTree(raw);
        } catch (Exception e) {
            throw new IllegalStateException("解析安维迪响应失败 " + path + " · " + e.getMessage(), e);
        }
        if (root.path("unAuthorizedRequest").asBoolean(false)) {
            throw new TokenExpiredException();
        }
        if (root.has("success") && !root.path("success").asBoolean(false)) {
            String message = root.path("error").path("message").asText(root.path("errorMessage").asText("未知错误"));
            throw new IllegalStateException("安维迪接口返回失败 " + path + " · " + message);
        }
        return root.path("result");
    }

    private RestTemplate buildRestTemplate() {
        SimpleClientHttpRequestFactory f = new SimpleClientHttpRequestFactory();
        f.setConnectTimeout(properties.getConnectTimeoutMs());
        f.setReadTimeout(properties.getReadTimeoutMs());
        return new RestTemplate(f);
    }

    /** 与前端一致的字符级异或（键循环使用）。 */
    private static String xor(String text, String key) {
        StringBuilder sb = new StringBuilder(text.length());
        for (int i = 0; i < text.length(); i++) {
            sb.append((char) (text.charAt(i) ^ key.charAt(i % key.length())));
        }
        return sb.toString();
    }

    private static String trimSlash(String base) {
        String s = base.trim();
        while (s.endsWith("/")) {
            s = s.substring(0, s.length() - 1);
        }
        return s;
    }

    /** 内部信号：token 过期/失效，需要重登一次。 */
    private static final class TokenExpiredException extends RuntimeException {
    }
}
