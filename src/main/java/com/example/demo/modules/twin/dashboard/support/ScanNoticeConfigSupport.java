package com.example.demo.modules.twin.dashboard.support;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.notification.dto.UpdateSystemConfigRequest;
import com.example.demo.modules.notification.entity.SystemConfigItem;
import com.example.demo.modules.notification.service.NotificationSettingsService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * T2-6 · 扫码公告 / 未绑卡提示配置的共用读写与角色规范化。
 * 消除 TwinScanPopupAnnouncementConfigService 与 TwinStudentViolationNoticeConfigService 的逐行重复。
 */
@Component
public class ScanNoticeConfigSupport {

    public static final String MODULE = "student_violation";

    public static final List<String> DEFAULT_APPLY_ROLE_CODES = List.of(RoleEnum.MEMBER.getCode());

    private static final Set<String> VALID_ROLE_CODES = Set.of(
            RoleEnum.MEMBER.getCode(),
            RoleEnum.STAFF.getCode(),
            RoleEnum.SENIOR.getCode(),
            RoleEnum.ADMIN.getCode(),
            RoleEnum.SUPER_ADMIN.getCode(),
            RoleEnum.PLATFORM_OWNER.getCode()
    );

    private final NotificationSettingsService notificationSettingsService;
    private final ObjectMapper objectMapper;

    public ScanNoticeConfigSupport(
            NotificationSettingsService notificationSettingsService,
            ObjectMapper objectMapper
    ) {
        this.notificationSettingsService = notificationSettingsService;
        this.objectMapper = objectMapper;
    }

    public Map<String, SystemConfigItem> loadItemsByKey() {
        return notificationSettingsService.listConfigs(MODULE).stream()
                .collect(Collectors.toMap(SystemConfigItem::getConfigKey, it -> it, (a, b) -> b));
    }

    public Map<String, String> loadValues() {
        return loadItemsByKey().entrySet().stream()
                .collect(Collectors.toMap(
                        Map.Entry::getKey,
                        e -> e.getValue().getConfigValue() != null ? e.getValue().getConfigValue() : ""));
    }

    public void updateValue(Map<String, SystemConfigItem> items, String key, String value, String operatorId) {
        SystemConfigItem item = items.get(key);
        if (item == null || item.getId() == null) {
            return;
        }
        UpdateSystemConfigRequest req = new UpdateSystemConfigRequest();
        req.setConfigValue(value);
        notificationSettingsService.updateConfig(item.getId(), req, operatorId);
    }

    public List<String> normalizeRoleCodes(List<String> raw) {
        if (raw == null || raw.isEmpty()) {
            return new ArrayList<>(DEFAULT_APPLY_ROLE_CODES);
        }
        List<String> out = raw.stream()
                .filter(StringUtils::hasText)
                .map(String::trim)
                .map(String::toUpperCase)
                .filter(VALID_ROLE_CODES::contains)
                .distinct()
                .collect(Collectors.toCollection(ArrayList::new));
        return out.isEmpty() ? new ArrayList<>(DEFAULT_APPLY_ROLE_CODES) : out;
    }

    public List<String> parseRoleCodes(String raw) {
        if (!StringUtils.hasText(raw)) {
            return new ArrayList<>(DEFAULT_APPLY_ROLE_CODES);
        }
        try {
            List<String> list = objectMapper.readValue(raw.trim(), new TypeReference<List<String>>() {});
            return normalizeRoleCodes(list);
        } catch (Exception ignored) {
            return new ArrayList<>(DEFAULT_APPLY_ROLE_CODES);
        }
    }

    public String writeRoleCodesJson(List<String> roles) {
        try {
            return objectMapper.writeValueAsString(normalizeRoleCodes(roles));
        } catch (Exception e) {
            return "[\"STUDENT\"]";
        }
    }

    public static boolean parseBoolean(String raw, boolean defaultValue) {
        if (!StringUtils.hasText(raw)) {
            return defaultValue;
        }
        String n = raw.trim().toLowerCase();
        if ("true".equals(n) || "1".equals(n) || "yes".equals(n)) {
            return true;
        }
        if ("false".equals(n) || "0".equals(n) || "no".equals(n)) {
            return false;
        }
        return defaultValue;
    }

    public ObjectMapper objectMapper() {
        return objectMapper;
    }
}
