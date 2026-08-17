package com.example.demo.modules.notification.push.retry;

import com.example.demo.modules.aro.mapper.AroPersonnelMapper;
import com.example.demo.modules.auth.mapper.UserMapper;
import com.example.demo.modules.notification.entity.NotifyDeliveryLog;
import com.example.demo.modules.notification.mapper.NotificationMiniProgramMapper;
import com.example.demo.modules.notification.push.PushConstants;
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

    private final NotificationMiniProgramMapper logMapper;
    private final AroPersonnelMapper personnelMapper;
    private final UserMapper userMapper;
    private final List<PushChannel> channels;

    public PushRetryScheduler(NotificationMiniProgramMapper logMapper,
                               AroPersonnelMapper personnelMapper,
                               UserMapper userMapper,
                               List<PushChannel> channels) {
        this.logMapper = logMapper;
        this.personnelMapper = personnelMapper;
        this.userMapper = userMapper;
        this.channels = channels;
    }

    @Scheduled(fixedDelay = 60_000)
    public void retryFailed() {
        List<NotifyDeliveryLog> pending = logMapper.findPendingRetry(
                PushConstants.STATUS_FAILED, MAX_RETRIES, LocalDateTime.now());
        for (NotifyDeliveryLog entry : pending) {
            PushChannel channel = findChannel(entry.getChannel());
            if (channel == null || !channel.isEnabled()) continue;

            String userId = entry.getRecipientUserId();
            boolean isStaff = userId != null && (userId.toUpperCase().startsWith("USR_") || userId.toUpperCase().startsWith("STAFF_") || "SYS_SUPER_ROOT".equals(userId));
            String target = PushConstants.CHANNEL_EMAIL.equals(channel.getCode())
                    ? (isStaff ? userMapper.findContactEmailById(userId) : personnelMapper.findContactEmailByUserId(userId))
                    : (isStaff ? userMapper.findSendKeyById(userId) : personnelMapper.findSendKeyByUserId(userId));
            if (target == null || target.isBlank()) continue;

            PushResult result = channel.send(target,
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
    }

    private PushChannel findChannel(String code) {
        return channels.stream().filter(c -> c.getCode().equals(code)).findFirst().orElse(null);
    }
}
