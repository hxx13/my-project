package com.example.demo.modules.notification.push.channel;

import com.example.demo.modules.notification.mapper.NotificationSettingsMapper;
import com.example.demo.modules.notification.push.PushConstants;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestTemplate;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Map;

@Component
public class ServerChanPushChannel implements PushChannel {

    private static final Logger log = LoggerFactory.getLogger(ServerChanPushChannel.class);
    private static final String API_URL = "https://sctapi.ftqq.com/%s.send";
    private static final ObjectMapper objectMapper = new ObjectMapper();
    private final RestTemplate restTemplate;
    private final NotificationSettingsMapper settingsMapper;

    public ServerChanPushChannel(@Qualifier("aroRestTemplate") RestTemplate restTemplate,
                                  NotificationSettingsMapper settingsMapper) {
        this.restTemplate = restTemplate;
        this.settingsMapper = settingsMapper;
    }

    @Override public String getCode() { return PushConstants.CHANNEL_SERVER_CHAN; }
    @Override public String getDisplayName() { return "Server酱微信通知"; }

    @Override
    public boolean isEnabled() {
        return ChannelConfigHelper.getBool(settingsMapper, PushConstants.CONFIG_MODULE,
                PushConstants.CHANNEL_SERVER_CHAN + ".enabled", true);
    }

    @Override
    public PushResult send(String target, String title, String content) {
        if (!StringUtils.hasText(target)) {
            return PushResult.fail("INVALID_TARGET", "SendKey为空");
        }
        try {
            String url = String.format(API_URL, target)
                    + "?title=" + URLEncoder.encode(title != null ? title : "", StandardCharsets.UTF_8)
                    + "&desp=" + URLEncoder.encode(content != null ? content : "", StandardCharsets.UTF_8);
            String response = restTemplate.getForObject(url, String.class);
            if (response != null) {
                @SuppressWarnings("unchecked")
                Map<String, Object> map = objectMapper.readValue(response, Map.class);
                Object code = map.get("code");
                if (code instanceof Number && ((Number) code).intValue() == 0) {
                    log.info("[ServerChan] ok: {}", response);
                    return PushResult.ok("SC_" + map.getOrDefault("data", "ok"));
                }
                String errMsg = String.valueOf(map.getOrDefault("message", response));
                log.warn("[ServerChan] API error: {}", errMsg);
                return PushResult.fail("API_ERROR", errMsg);
            }
            return PushResult.ok("SC_" + System.currentTimeMillis());
        } catch (Exception e) {
            log.error("[ServerChan] failed: {}", e.getMessage());
            return PushResult.fail("SEND_ERROR", e.getMessage());
        }
    }
}
