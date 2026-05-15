package com.example.demo.modules.notification.service;

import com.example.demo.modules.notification.entity.MiniSubscribeRecord;
import com.example.demo.modules.notification.entity.NotifyDeliveryLog;
import com.example.demo.modules.notification.entity.NotifyTemplate;
import com.example.demo.modules.notification.entity.SystemConfigItem;
import com.example.demo.modules.notification.mapper.NotificationMiniProgramMapper;
import com.example.demo.modules.notification.mapper.NotificationSettingsMapper;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.*;

@Service
public class MiniProgramNotificationService {
    private final NotificationMiniProgramMapper miniMapper;
    private final NotificationSettingsMapper settingsMapper;

    public MiniProgramNotificationService(NotificationMiniProgramMapper miniMapper,
                                          NotificationSettingsMapper settingsMapper) {
        this.miniMapper = miniMapper;
        this.settingsMapper = settingsMapper;
    }

    public void ackSubscription(String userId, String templateKey, boolean accepted) {
        if (!StringUtils.hasText(userId) || !StringUtils.hasText(templateKey)) return;
        miniMapper.upsertSubscription(userId, templateKey.trim(), accepted ? 1 : 0);
    }

    public List<MiniSubscribeRecord> listSubscriptions(String userId) {
        return miniMapper.listSubscriptionsByUser(userId);
    }

    public Map<String, Object> testSend(String targetUserId, String templateKey) {
        NotifyDeliveryLog log = new NotifyDeliveryLog();
        log.setNotificationId("TEST");
        log.setRecipientUserId(targetUserId);
        log.setChannel("MINI_PROGRAM");
        log.setTemplateKey(templateKey);
        log.setStatus("PENDING");
        miniMapper.insertDeliveryLog(log);
        SendResult result = sendToMiniProgram(targetUserId, templateKey, Map.of("title", "测试消息"));
        if (result.success) {
            miniMapper.markDeliverySuccess(log.getId(), result.providerMsgId);
        } else {
            miniMapper.markDeliveryFailed(log.getId(), result.errorCode, result.errorMsg);
        }
        Map<String, Object> data = new HashMap<>();
        data.put("success", result.success);
        data.put("providerMsgId", result.providerMsgId);
        data.put("errorCode", result.errorCode);
        data.put("errorMsg", result.errorMsg);
        return data;
    }

    public void dispatchAfterPersisted(String notificationId,
                                       Set<String> recipients,
                                       NotifyTemplate template,
                                       Map<String, String> variables) {
        if (!isMiniProgramEnabled()) return;
        if (recipients == null || recipients.isEmpty() || template == null) return;
        for (String userId : recipients) {
            MiniSubscribeRecord subscription = miniMapper.findSubscription(userId, template.getTemplateKey());
            if (subscription == null || subscription.getAccepted() == null || subscription.getAccepted() != 1) {
                continue;
            }
            NotifyDeliveryLog log = new NotifyDeliveryLog();
            log.setNotificationId(notificationId);
            log.setRecipientUserId(userId);
            log.setChannel("MINI_PROGRAM");
            log.setTemplateKey(template.getTemplateKey());
            log.setStatus("PENDING");
            miniMapper.insertDeliveryLog(log);
            SendResult result = sendToMiniProgram(userId, template.getTemplateKey(), variables);
            if (result.success) {
                miniMapper.markDeliverySuccess(log.getId(), result.providerMsgId);
            } else {
                miniMapper.markDeliveryFailed(log.getId(), result.errorCode, result.errorMsg);
            }
        }
    }

    private boolean isMiniProgramEnabled() {
        return getBoolConfig("notify.enabled", true);
    }

    private boolean getBoolConfig(String key, boolean defaultValue) {
        List<SystemConfigItem> configs = settingsMapper.listConfigsByModule("mini_program");
        for (SystemConfigItem item : configs) {
            if (key.equals(item.getConfigKey())) {
                return Boolean.parseBoolean(item.getConfigValue());
            }
        }
        return defaultValue;
    }

    private String getStrConfig(String key, String defaultValue) {
        List<SystemConfigItem> configs = settingsMapper.listConfigsByModule("mini_program");
        for (SystemConfigItem item : configs) {
            if (key.equals(item.getConfigKey()) && item.getConfigValue() != null) {
                return item.getConfigValue();
            }
        }
        return defaultValue;
    }

    private SendResult sendToMiniProgram(String userId, String templateKey, Map<String, String> variables) {
        String mode = getStrConfig("notify.send.mode", "MOCK").trim().toUpperCase();
        if ("MOCK".equals(mode)) {
            return SendResult.ok("MOCK_" + UUID.randomUUID().toString().replace("-", ""));
        }
        return SendResult.fail("NOT_IMPLEMENTED", "REAL 模式待接入微信 API");
    }

    private static class SendResult {
        private final boolean success;
        private final String providerMsgId;
        private final String errorCode;
        private final String errorMsg;

        private SendResult(boolean success, String providerMsgId, String errorCode, String errorMsg) {
            this.success = success;
            this.providerMsgId = providerMsgId;
            this.errorCode = errorCode;
            this.errorMsg = errorMsg;
        }

        static SendResult ok(String providerMsgId) {
            return new SendResult(true, providerMsgId, null, null);
        }

        static SendResult fail(String errorCode, String errorMsg) {
            return new SendResult(false, null, errorCode, errorMsg);
        }
    }
}
