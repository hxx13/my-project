package com.example.demo.modules.notification.push.channel;

import com.example.demo.modules.notification.mapper.NotificationSettingsMapper;
import com.example.demo.modules.notification.push.PushConstants;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestTemplate;

import java.util.Map;

@Component
public class ServerChanPushChannel implements PushChannel {

    private static final Logger log = LoggerFactory.getLogger(ServerChanPushChannel.class);
    private static final String API_URL = "https://sctapi.ftqq.com/%s.send";
    private static final ObjectMapper objectMapper = new ObjectMapper();
    private final RestTemplate restTemplate;
    private final NotificationSettingsMapper settingsMapper;
    /**
     * 当天配额已用尽的 SendKey → 日期。
     * ServerChan 免费版每天只有 5 条，用尽后接口回 400 + code 40001；
     * 不做熔断的话后面每条通知都还会打一次网络、刷一条 ERROR，纯属浪费和刷屏。
     * 按 SendKey 分别记（配额是按 key 算的），第二天自然失效。
     */
    private final Map<String, java.time.LocalDate> quotaExhaustedDay = new java.util.concurrent.ConcurrentHashMap<>();

    public ServerChanPushChannel(RestTemplate restTemplate,
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
        if (java.time.LocalDate.now().equals(quotaExhaustedDay.get(target))) {
            // 今天这个 key 已经用尽：不再打网络，也不再刷 ERROR（一条 WARN 已在用尽那一刻打过）
            return PushResult.fail("DAILY_LIMIT", "Server酱今日发送次数已用尽，本次跳过");
        }
        try {
            // POST form-urlencoded 避免 GET URI 编码问题
            String url = String.format(API_URL, target);
            MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
            form.add("title", title != null ? title : "");
            form.add("desp", content != null ? content : "");
            form.add("short", title != null ? title : "");
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);
            HttpEntity<MultiValueMap<String, String>> req = new HttpEntity<>(form, headers);
            log.info("[ServerChan] calling: title={}, despLen={}",
                    title, content != null ? content.length() : 0);
            String response = restTemplate.postForObject(url, req, String.class);
            if (response != null) {
                @SuppressWarnings("unchecked")
                Map<String, Object> map = objectMapper.readValue(response, Map.class);
                Object code = map.get("code");
                if (code instanceof Number && ((Number) code).intValue() == 0) {
                    log.info("[ServerChan] ok: {}", response);
                    return PushResult.ok("SC_" + map.getOrDefault("data", "ok"));
                }
                String errMsg = String.valueOf(map.getOrDefault("message", response));
                if (isDailyQuota(errMsg)) {
                    markQuotaExhausted(target);
                    return PushResult.fail("DAILY_LIMIT", "ServerChan 今日发送次数已用尽");
                }
                log.warn("[ServerChan] API error: {}", errMsg);
                return PushResult.fail("API_ERROR", errMsg);
            }
            log.warn("[ServerChan] null response from API");
            return PushResult.fail("NULL_RESPONSE", "Server酱 API 返回空响应");
        } catch (Exception e) {
            String msg = e.getMessage() == null ? "" : e.getMessage();
            // 配额用尽是**业务性**的，不该按系统故障刷 ERROR：记下当天用尽，之后直接短路。
            if (isDailyQuota(msg)) {
                markQuotaExhausted(target);
                return PushResult.fail("DAILY_LIMIT", "ServerChan 今日发送次数已用尽");
            }
            log.error("[ServerChan] failed: {}", msg);
            return PushResult.fail("SEND_ERROR", msg);
        }
    }

    /** ServerChan 超额时回 400 + body `{"code":40001,"message":"超过当天的发送次数限制[5]"}`。 */
    private static boolean isDailyQuota(String msg) {
        return msg != null && (msg.contains("40001") || msg.contains("超过当天的发送次数"));
    }

    private void markQuotaExhausted(String target) {
        quotaExhaustedDay.put(target, java.time.LocalDate.now());
        log.warn("[ServerChan] 今日发送次数已用尽，今天剩余通知不再尝试该 key");
    }
}
