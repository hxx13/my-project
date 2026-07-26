package com.example.demo.modules.notification.push.channel;

import com.example.demo.modules.notification.mapper.NotificationSettingsMapper;
import com.example.demo.modules.notification.push.PushConstants;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestTemplate;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Component
public class WxPusherPushChannel implements PushChannel {

    private static final Logger log = LoggerFactory.getLogger(WxPusherPushChannel.class);
    private static final String API_URL = "https://wxpusher.zjiecode.com/api/send/message";
    private static final ObjectMapper objectMapper = new ObjectMapper();
    private final RestTemplate restTemplate;
    private final NotificationSettingsMapper settingsMapper;

    public WxPusherPushChannel(RestTemplate restTemplate,
                                NotificationSettingsMapper settingsMapper) {
        this.restTemplate = restTemplate;
        this.settingsMapper = settingsMapper;
    }

    @Override public String getCode() { return PushConstants.CHANNEL_WXPUSHER; }
    @Override public String getDisplayName() { return "WxPusher推送"; }

    @Override
    public boolean isEnabled() {
        return ChannelConfigHelper.getBool(settingsMapper, PushConstants.CONFIG_MODULE,
                PushConstants.CHANNEL_WXPUSHER + ".enabled", true);
    }

    /** 从系统配置读取 appToken */
    private String getAppToken() {
        return ChannelConfigHelper.getStr(settingsMapper, PushConstants.CONFIG_MODULE,
                PushConstants.CHANNEL_WXPUSHER + ".appToken", "");
    }

    @Override
    public PushResult send(String target, String title, String content) {
        if (!StringUtils.hasText(target)) {
            return PushResult.fail("INVALID_TARGET", "UID为空");
        }
        String appToken = getAppToken();
        if (!StringUtils.hasText(appToken)) {
            return PushResult.fail("NO_APP_TOKEN", "未配置 WxPusher appToken，请在系统配置 push_channel.WXPUSHER.appToken 中填入");
        }
        try {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("appToken", appToken);
            body.put("content", content != null ? content : "");
            body.put("summary", title != null ? title : "");
            body.put("contentType", 1); // 1=文字
            body.put("uids", Collections.singletonList(target));

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<Map<String, Object>> req = new HttpEntity<>(body, headers);

            log.info("[WxPusher] sending to UID={}: title={}", target, title);
            String response = restTemplate.postForObject(API_URL, req, String.class);

            if (response != null) {
                @SuppressWarnings("unchecked")
                Map<String, Object> map = objectMapper.readValue(response, Map.class);
                Object code = map.get("code");
                if (code instanceof Number && ((Number) code).intValue() == 1000) {
                    // WxPusher 成功码是 1000
                    @SuppressWarnings("unchecked")
                    List<Map<String, Object>> data = (List<Map<String, Object>>) map.get("data");
                    String recordId = (data != null && !data.isEmpty())
                            ? String.valueOf(data.get(0).getOrDefault("sendRecordId", "ok"))
                            : "ok";
                    log.info("[WxPusher] ok: sendRecordId={}", recordId);
                    return PushResult.ok("WP_" + recordId);
                }
                String errMsg = String.valueOf(map.getOrDefault("msg", response));
                log.warn("[WxPusher] API error: code={}, msg={}", code, errMsg);
                return PushResult.fail("API_ERROR", errMsg);
            }
            return PushResult.ok("WP_" + System.currentTimeMillis());
        } catch (Exception e) {
            log.error("[WxPusher] failed to UID={}: {}", target, e.getMessage());
            return PushResult.fail("SEND_ERROR", e.getMessage());
        }
    }
}
