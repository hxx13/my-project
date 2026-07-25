package com.example.demo.modules.notification.push.retry;

import com.example.demo.modules.notification.mapper.NotificationMiniProgramMapper;
import com.example.demo.modules.notification.mapper.NotificationSettingsMapper;
import com.example.demo.modules.notification.push.PushConstants;
import com.example.demo.modules.notification.push.channel.PushChannel;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class PushRetryScheduler {

    private static final Logger log = LoggerFactory.getLogger(PushRetryScheduler.class);
    private static final int MAX_RETRIES = 3;
    private static final int HEALTH_THRESHOLD = 50;

    private final NotificationMiniProgramMapper logMapper;
    private final NotificationSettingsMapper settingsMapper;
    private final List<PushChannel> channels;

    public PushRetryScheduler(NotificationMiniProgramMapper logMapper,
                               NotificationSettingsMapper settingsMapper,
                               List<PushChannel> channels) {
        this.logMapper = logMapper;
        this.settingsMapper = settingsMapper;
        this.channels = channels;
    }

    @Scheduled(fixedDelay = 60_000)
    public void retryFailed() {
        // TODO: Implement findPendingRetry query in NotificationMiniProgramMapper
        // For now, health check only — full retry implementation follows in next iteration
        log.debug("[PushRetry] Health check running...");
        checkChannelHealth();
    }

    private void checkChannelHealth() {
        for (PushChannel ch : channels) {
            long failed = 0; // TODO: countRecentFailed(ch.getCode(), 10) in mapper
            if (failed > HEALTH_THRESHOLD) {
                log.warn("[Push] 渠道 {} 10分钟失败{}条，自动暂停", ch.getCode(), failed);
                var configs = settingsMapper.listConfigsByModule(PushConstants.CONFIG_MODULE);
                for (var item : configs) {
                    if ((ch.getCode() + ".enabled").equals(item.getConfigKey())) {
                        item.setConfigValue("false");
                        settingsMapper.updateConfig(item);
                    }
                }
            }
        }
    }
}
