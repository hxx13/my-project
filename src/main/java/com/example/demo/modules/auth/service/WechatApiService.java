package com.example.demo.modules.auth.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.DigestUtils;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

/**
 * 微信小程序 API 服务：jscode2session 换取 openId。
 * 未配置 app-id/app-secret 时自动降级为 MD5 Mock（开发环境），配置后走真实微信 API（生产环境）。
 */
@Service
public class WechatApiService {

    private static final Logger log = LoggerFactory.getLogger(WechatApiService.class);
    private static final String JSCODE2SESSION_URL =
            "https://api.weixin.qq.com/sns/jscode2session?appid=%s&secret=%s&js_code=%s&grant_type=authorization_code";
    private static final ObjectMapper objectMapper = new ObjectMapper();
    private static final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(8))
            .build();

    private final String appId;
    private final String appSecret;

    public WechatApiService(@Value("${wechat.miniapp.app-id:}") String appId,
                            @Value("${wechat.miniapp.app-secret:}") String appSecret) {
        this.appId = appId;
        this.appSecret = appSecret;
    }

    private boolean isConfigured() {
        return appId != null && !appId.isBlank() && appSecret != null && !appSecret.isBlank();
    }

    /**
     * 用 jsCode 换取 openId。
     * 已配置 AppID/AppSecret → 调微信真实 API；
     * 未配置 → MD5 Mock（开发环境，每次 wx.login 码不同则 openId 会变）。
     */
    public String exchangeJsCodeForOpenId(String jsCode) {
        if (jsCode == null || jsCode.isBlank()) {
            log.warn("jsCode 为空");
            return null;
        }
        if (isConfigured()) {
            return exchangeReal(jsCode);
        }
        return exchangeMock(jsCode);
    }

    private String exchangeReal(String jsCode) {
        String url = String.format(JSCODE2SESSION_URL, appId, appSecret, jsCode.trim());
        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .timeout(Duration.ofSeconds(8))
                    .GET()
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            String body = response.body();
            if (body == null || body.isBlank()) {
                log.warn("微信 jscode2session 返回空");
                return null;
            }
            JsonNode json = objectMapper.readTree(body);
            if (json.has("errcode") && json.get("errcode").asInt() != 0) {
                int errcode = json.get("errcode").asInt();
                String errmsg = json.has("errmsg") ? json.get("errmsg").asText() : "";
                log.error("微信 jscode2session 错误: errcode={} errmsg={}", errcode, errmsg);
                return null;
            }
            String openId = json.has("openid") ? json.get("openid").asText() : null;
            if (openId == null || openId.isBlank()) {
                log.warn("微信 jscode2session 未返回 openid");
                return null;
            }
            return openId;
        } catch (Exception e) {
            log.error("微信 jscode2session 调用异常: {}", e.getMessage());
            return null;
        }
    }

    private String exchangeMock(String jsCode) {
        String normalized = jsCode.trim();
        String digest = DigestUtils.md5DigestAsHex(normalized.getBytes(StandardCharsets.UTF_8));
        return "wx_openid_" + digest.substring(0, 16);
    }
}
