package com.example.demo.modules.twin.service;

import com.example.demo.modules.notification.entity.SystemConfigDefinition;
import com.example.demo.modules.notification.entity.SystemConfigItem;
import com.example.demo.modules.notification.mapper.NotificationSettingsMapper;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.List;

/**
 * 扫码弹窗：按系统设置禁用某校区「进入」按钮（不影响离开）。
 */
@Service
public class ScanCampusEnterConfigService {

    public static final String MODULE = "scanner";
    public static final String KEY_BLOCK_PUDONG = "scan.enter.blockCampusPudong";
    public static final String KEY_BLOCK_PUXI = "scan.enter.blockCampusPuxi";

    private final NotificationSettingsMapper settingsMapper;

    public ScanCampusEnterConfigService(NotificationSettingsMapper settingsMapper) {
        this.settingsMapper = settingsMapper;
    }

    public boolean isPudongEnterBlocked() {
        return readBool(KEY_BLOCK_PUDONG, false);
    }

    public boolean isPuxiEnterBlocked() {
        return readBool(KEY_BLOCK_PUXI, false);
    }

    private boolean readBool(String key, boolean defaultValue) {
        List<SystemConfigDefinition> defs = settingsMapper.listConfigDefinitionsByModule(MODULE);
        SystemConfigDefinition def = defs.stream()
                .filter(d -> key.equals(d.getConfigKey()))
                .findFirst()
                .orElse(null);
        List<SystemConfigItem> items = settingsMapper.listConfigsByModule(MODULE);
        String dbValue = items.stream()
                .filter(item -> key.equals(item.getConfigKey()))
                .map(SystemConfigItem::getConfigValue)
                .findFirst()
                .orElse(null);
        String raw = StringUtils.hasText(dbValue) ? dbValue : (def != null ? def.getDefaultValue() : null);
        if (!StringUtils.hasText(raw)) {
            return defaultValue;
        }
        String v = raw.trim().toLowerCase();
        if ("1".equals(v) || "true".equals(v) || "yes".equals(v)) {
            return true;
        }
        if ("0".equals(v) || "false".equals(v) || "no".equals(v)) {
            return false;
        }
        return defaultValue;
    }
}
