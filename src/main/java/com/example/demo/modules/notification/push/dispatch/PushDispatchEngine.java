package com.example.demo.modules.notification.push.dispatch;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.mapper.UserMapper;
import com.example.demo.modules.auth.service.UserDisplayNameService;
import com.example.demo.modules.notification.entity.NotifyDeliveryLog;
import com.example.demo.modules.notification.mapper.NotificationMiniProgramMapper;
import com.example.demo.modules.aro.mapper.AroPersonnelMapper;
import com.example.demo.modules.notification.push.PushConstants;
import com.example.demo.modules.notification.push.channel.PushChannel;
import com.example.demo.modules.notification.push.channel.PushResult;
import com.example.demo.modules.notification.push.config.NotifySourceChannel;
import com.example.demo.modules.notification.push.config.NotifySourceChannelService;
import com.example.demo.modules.notification.push.recipient.NotifySourceRecipient;
import com.example.demo.modules.notification.push.recipient.NotifySourceRecipientService;
import com.example.demo.modules.notification.push.source.NotifySource;
import com.example.demo.modules.notification.push.source.NotifySourceService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class PushDispatchEngine {

    private static final Logger log = LoggerFactory.getLogger(PushDispatchEngine.class);

    private final NotifySourceService sourceService;
    private final NotifySourceChannelService channelConfigService;
    private final NotifySourceRecipientService recipientService;
    private final AroPersonnelMapper personnelMapper;
    private final UserMapper userMapper;
    private final UserDisplayNameService displayNameService;
    private final NotificationMiniProgramMapper deliveryLogMapper;
    private final PushRateLimiter rateLimiter;
    private final List<PushChannel> channels;

    public PushDispatchEngine(NotifySourceService sourceService,
                              NotifySourceChannelService channelConfigService,
                              NotifySourceRecipientService recipientService,
                              AroPersonnelMapper personnelMapper,
                              UserMapper userMapper,
                              UserDisplayNameService displayNameService,
                              NotificationMiniProgramMapper deliveryLogMapper,
                              PushRateLimiter rateLimiter,
                              List<PushChannel> channels) {
        this.sourceService = sourceService;
        this.channelConfigService = channelConfigService;
        this.recipientService = recipientService;
        this.personnelMapper = personnelMapper;
        this.userMapper = userMapper;
        this.displayNameService = displayNameService;
        this.deliveryLogMapper = deliveryLogMapper;
        this.rateLimiter = rateLimiter;
        this.channels = channels;
    }

    public void dispatch(String sourceCode, Map<String, String> variables, Set<String> dynamicUserIds) {
        NotifySource source = sourceService.getByCode(sourceCode);
        if (source.getEnabled() == null || source.getEnabled() != 1) {
            log.debug("[Push] 通知源已禁用: {}", sourceCode);
            return;
        }

        List<NotifySourceChannel> channelConfigs = channelConfigService.listBySourceId(source.getId());
        if (channelConfigs.isEmpty()) {
            return;
        }

        Set<String> allRecipientIds = resolveRecipients(source.getId(), dynamicUserIds);
        if (allRecipientIds.isEmpty()) {
            log.debug("[Push] 无接收人: {}", sourceCode);
            return;
        }

        // Batch preload users and display names
        List<String> idList = new ArrayList<>(allRecipientIds);
        Map<String, User> userCache = userMapper.findByIds(idList).stream()
                .collect(Collectors.toMap(User::getId, u -> u, (a, b) -> a));
        Map<String, String> nameMap = displayNameService.resolveDisplayNames(idList);

        for (NotifySourceChannel channelCfg : channelConfigs) {
            if (channelCfg.getEnabled() == null || channelCfg.getEnabled() != 1) {
                continue;
            }
            PushChannel channel = findChannel(channelCfg.getChannelCode());
            if (channel == null || !channel.isEnabled()) {
                continue;
            }

            if (rateLimiter.isQuietTime(channelCfg)) {
                log.debug("[Push] 静默时段: {}/{}", sourceCode, channel.getCode());
                continue;
            }

            String title = render(channelCfg.getTitleTpl(), variables);
            String content = render(channelCfg.getContentTpl(), variables);

            for (String userId : allRecipientIds) {
                // Get target based on channel
                String target = PushConstants.CHANNEL_EMAIL.equals(channel.getCode())
                        ? personnelMapper.findContactEmailByUserId(userId)
                        : personnelMapper.findSendKeyByUserId(userId);
                if (target == null || target.isBlank()) continue;

                int limitSec = channelCfg.getRateLimitSeconds() != null ? channelCfg.getRateLimitSeconds() : 300;
                if (rateLimiter.isRateLimited(sourceCode, userId, channel.getCode(), limitSec)) {
                    continue;
                }

                String recipientName = nameMap.getOrDefault(userId, userId);

                NotifyDeliveryLog logEntry = new NotifyDeliveryLog();
                logEntry.setNotificationId("PUSH_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16));
                logEntry.setRecipientUserId(userId);
                logEntry.setChannel(channel.getCode());
                logEntry.setTemplateKey(source.getSourceCode());
                logEntry.setStatus(PushConstants.STATUS_PENDING);
                logEntry.setRetryCount(0);
                logEntry.setMaxRetries(3);
                logEntry.setCreateTime(LocalDateTime.now());
                logEntry.setSourceCode(source.getSourceCode());
                logEntry.setSourceName(source.getSourceName());
                logEntry.setChannelName(channel.getDisplayName());
                logEntry.setRecipientName(recipientName);
                logEntry.setTitle(title);
                logEntry.setContent(content);

                try {
                    deliveryLogMapper.insertDeliveryLog(logEntry);
                    PushResult result = channel.send(target, title, content);
                    if (result.isSuccess()) {
                        deliveryLogMapper.markDeliverySuccess(logEntry.getId(), result.getProviderMsgId());
                    } else {
                        deliveryLogMapper.markDeliveryFailed(logEntry.getId(), result.getErrorCode(), result.getErrorMsg());
                    }
                } catch (Exception e) {
                    log.error("[Push] 单用户推送异常: {} {} {}", sourceCode, userId, channel.getCode(), e);
                    try {
                        deliveryLogMapper.markDeliveryFailed(logEntry.getId(), "INTERNAL_ERROR", e.getMessage());
                    } catch (Exception ignored) {
                        // best-effort
                    }
                }
            }
        }
    }

    private Set<String> resolveRecipients(Long sourceId, Set<String> dynamicUserIds) {
        Set<String> result = new LinkedHashSet<>();
        if (dynamicUserIds != null) {
            result.addAll(dynamicUserIds);
        }
        for (NotifySourceRecipient rc : recipientService.listBySourceId(sourceId)) {
            if (PushConstants.PERSPECTIVE_ALL.equals(rc.getPerspective())) {
                if (PushConstants.SCOPE_ALL.equals(rc.getScopeType())) {
                    userMapper.listEnabledUsersByMinRoleLevel(0).forEach(u -> result.add(u.getId()));
                } else {
                    addByScope(rc, result);
                }
            } else if (PushConstants.PERSPECTIVE_STUDENT.equals(rc.getPerspective())) {
                // Only MEMBER role for student perspective
                if (PushConstants.SCOPE_ALL.equals(rc.getScopeType())) {
                    userMapper.findEnabledByRole(RoleEnum.MEMBER.getCode()).forEach(u -> result.add(u.getId()));
                } else if (PushConstants.SCOPE_ROLE.equals(rc.getScopeType()) && rc.getScopeValue() != null) {
                    try {
                        RoleEnum role = RoleEnum.valueOf(rc.getScopeValue());
                        userMapper.findEnabledByRole(role.getCode()).forEach(u -> result.add(u.getId()));
                    } catch (IllegalArgumentException e) {
                        log.warn("[Push] 未知角色: {}", rc.getScopeValue());
                    }
                } else if (PushConstants.SCOPE_USER.equals(rc.getScopeType()) && rc.getScopeValue() != null) {
                    result.add(rc.getScopeValue());
                }
            } else if (PushConstants.PERSPECTIVE_STAFF.equals(rc.getPerspective())) {
                if (PushConstants.SCOPE_ALL.equals(rc.getScopeType())) {
                    userMapper.listEnabledStaffUsers().forEach(u -> result.add(u.getId()));
                } else {
                    addByScope(rc, result);
                }
            }
        }
        return result;
    }

    private void addByScope(NotifySourceRecipient rc, Set<String> result) {
        if (PushConstants.SCOPE_ROLE.equals(rc.getScopeType()) && rc.getScopeValue() != null) {
            try {
                RoleEnum role = RoleEnum.valueOf(rc.getScopeValue());
                userMapper.findEnabledByRole(role.getCode()).forEach(u -> result.add(u.getId()));
            } catch (IllegalArgumentException e) {
                log.warn("[Push] 未知角色: {}", rc.getScopeValue());
            }
        } else if (PushConstants.SCOPE_USER.equals(rc.getScopeType()) && rc.getScopeValue() != null) {
            result.add(rc.getScopeValue());
        }
    }

    private PushChannel findChannel(String code) {
        return channels.stream().filter(c -> c.getCode().equals(code)).findFirst().orElse(null);
    }

    private String render(String tpl, Map<String, String> vars) {
        if (tpl == null) return "";
        String result = tpl;
        for (Map.Entry<String, String> e : vars.entrySet()) {
            result = result.replace("{" + e.getKey() + "}", e.getValue() != null ? e.getValue() : "");
        }
        return result;
    }
}
