package com.example.demo.modules.notification.push.bootstrap;

import com.example.demo.modules.notification.entity.SystemConfigItem;
import com.example.demo.modules.notification.mapper.NotificationSettingsMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

@Component
@Order(1)
public class PushChannelConfigSeed implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(PushChannelConfigSeed.class);
    private final NotificationSettingsMapper settingsMapper;

    public PushChannelConfigSeed(NotificationSettingsMapper settingsMapper) {
        this.settingsMapper = settingsMapper;
    }

    @Override
    public void run(ApplicationArguments args) {
        ensureConfig("push_channel", "EMAIL.enabled", "true", "BOOLEAN", "邮件渠道总开关");
        ensureConfig("push_channel", "SERVER_CHAN.enabled", "true", "BOOLEAN", "Server酱渠道总开关");
        ensureConfig("push_channel", "WXPUSHER.enabled", "true", "BOOLEAN", "WxPusher渠道总开关");
        ensureConfig("push_channel", "WXPUSHER.appToken", "", "STRING", "WxPusher应用appToken（从管理后台获取）");
        log.info("[Push] 渠道总控种子数据已确认");
    }

    private void ensureConfig(String module, String key, String value, String type, String desc) {
        var existing = settingsMapper.listConfigsByModule(module);
        boolean found = existing.stream().anyMatch(c -> key.equals(c.getConfigKey()));
        if (!found) {
            SystemConfigItem item = new SystemConfigItem();
            item.setModule(module);
            item.setConfigKey(key);
            item.setConfigValue(value);
            item.setValueType(type);
            item.setRemark(desc);
            settingsMapper.insertConfigItem(item);
        }
    }
}
