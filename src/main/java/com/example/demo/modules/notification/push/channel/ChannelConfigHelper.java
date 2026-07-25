package com.example.demo.modules.notification.push.channel;

import com.example.demo.modules.notification.mapper.NotificationSettingsMapper;

final class ChannelConfigHelper {
    private ChannelConfigHelper() {}

    static boolean getBool(NotificationSettingsMapper mapper, String module, String key, boolean def) {
        return mapper.listConfigsByModule(module).stream()
                .filter(i -> key.equals(i.getConfigKey()))
                .findFirst()
                .map(i -> Boolean.parseBoolean(i.getConfigValue()))
                .orElse(def);
    }

    static String getStr(NotificationSettingsMapper mapper, String module, String key, String def) {
        return mapper.listConfigsByModule(module).stream()
                .filter(i -> key.equals(i.getConfigKey()) && i.getConfigValue() != null)
                .findFirst()
                .map(i -> i.getConfigValue())
                .orElse(def);
    }
}
