package com.example.demo.modules.notification.push.retry;

import com.example.demo.modules.notification.entity.NotifyDeliveryLog;
import com.example.demo.modules.notification.mapper.NotificationMiniProgramMapper;
import com.example.demo.modules.notification.mapper.NotificationSettingsMapper;
import com.example.demo.modules.notification.push.PushConstants;
import com.example.demo.modules.notification.push.binding.UserPushBinding;
import com.example.demo.modules.notification.push.binding.UserPushBindingMapper;
import com.example.demo.modules.notification.push.channel.PushChannel;
import com.example.demo.modules.notification.push.channel.PushResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.List;

@Component
public class PushRetryScheduler {

    private static final Logger log = LoggerFactory.getLogger(PushRetryScheduler.class);
    private static final int MAX_RETRIES = 3;
    private static final int HEALTH_THRESHOLD = 50;

    private final NotificationMiniProgramMapper logMapper;
    private final NotificationSettingsMapper settingsMapper;
    private final UserPushBindingMapper bindingMapper;
    private final List<PushChannel> channels;

    public PushRetryScheduler(NotificationMiniProgramMapper logMapper,
                               NotificationSettingsMapper settingsMapper,
                               UserPushBindingMapper bindingMapper,
                               List<PushChannel> channels) {
        this.logMapper = logMapper;
        this.settingsMapper = settingsMapper;
        this.bindingMapper = bindingMapper;
        this.channels = channels;
    }

    @Scheduled(fixedDelay = 60_000)
    public void retryFailed() {
        List<NotifyDeliveryLog> pending = logMapper.findPendingRetry(
                PushConstants.STATUS_FAILED, MAX_RETRIES, LocalDateTime.now());
        for (NotifyDeliveryLog entry : pending) {
            PushChannel channel = findChannel(entry.getChannel());
            if (channel == null || !channel.isEnabled()) continue;

            UserPushBinding binding = bindingMapper.findByUserAndChannel(
                    entry.getRecipientUserId(), entry.getChannel());
            if (binding == null || binding.getIsVerified() == null || binding.getIsVerified() != 1) continue;

            PushResult result = channel.send(binding.getTarget(),
                    entry.getTitle() != null ? entry.getTitle() : "",
                    entry.getContent() != null ? entry.getContent() : "");
            if (result.isSuccess()) {
                logMapper.markDeliverySuccess(entry.getId(), result.getProviderMsgId());
            } else {
                int nextCount = (entry.getRetryCount() != null ? entry.getRetryCount() : 0) + 1;
                int delayMinutes = (int) Math.pow(5, nextCount);
                logMapper.markRetryAttempt(entry.getId(),
                        LocalDateTime.now().plusMinutes(delayMinutes),
                        result.getErrorCode(), result.getErrorMsg());
            }
        }
        checkChannelHealth();
    }

    private void checkChannelHealth() {
        for (PushChannel ch : channels) {
            long failed = logMapper.countRecentFailed(ch.getCode(), 10);
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

    private PushChannel findChannel(String code) {
        return channels.stream().filter(c -> c.getCode().equals(code)).findFirst().orElse(null);
    }
}
