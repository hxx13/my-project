package com.example.demo.modules.twin.service;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.notification.entity.SystemConfigItem;
import com.example.demo.modules.notification.service.NotificationSettingsService;
import com.example.demo.modules.notification.dto.UpdateSystemConfigRequest;
import com.example.demo.modules.twin.dto.ScanPopupAnnouncementSettingsDTO;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class TwinScanPopupAnnouncementConfigService {
    public static final String MODULE = "student_violation";

    private static final String KEY_ENABLED = "student.scan.announcement.enabled";
    private static final String KEY_SHOW_EVERY = "student.scan.announcement.show_every_scan";
    private static final String KEY_APPLY_ROLE_CODES = "student.scan.announcement.apply_role_codes";

    private static final List<String> DEFAULT_APPLY_ROLE_CODES = List.of(RoleEnum.STUDENT.getCode());

    private final NotificationSettingsService notificationSettingsService;
    private final ObjectMapper objectMapper;
    private final TwinStudentViolationNoticeConfigService roleHelper;

    public TwinScanPopupAnnouncementConfigService(
            NotificationSettingsService notificationSettingsService,
            ObjectMapper objectMapper,
            TwinStudentViolationNoticeConfigService roleHelper
    ) {
        this.notificationSettingsService = notificationSettingsService;
        this.objectMapper = objectMapper;
        this.roleHelper = roleHelper;
    }

    public ScanPopupAnnouncementSettingsDTO getSettings() {
        Map<String, String> values = loadValues();
        ScanPopupAnnouncementSettingsDTO dto = new ScanPopupAnnouncementSettingsDTO();
        dto.setEnabled(parseBoolean(values.get(KEY_ENABLED), true));
        dto.setShowNoticeEveryScan(parseBoolean(values.get(KEY_SHOW_EVERY), true));
        dto.setApplyRoleCodes(parseRoleCodes(values.get(KEY_APPLY_ROLE_CODES)));
        return dto;
    }

    public void saveSettings(ScanPopupAnnouncementSettingsDTO body, String operatorId) {
        if (body == null) {
            return;
        }
        Map<String, SystemConfigItem> items = loadItemsByKey();
        updateValue(items, KEY_ENABLED, body.isEnabled() ? "true" : "false", operatorId);
        updateValue(items, KEY_SHOW_EVERY, body.isShowNoticeEveryScan() ? "true" : "false", operatorId);
        try {
            updateValue(items, KEY_APPLY_ROLE_CODES, objectMapper.writeValueAsString(normalizeRoleCodes(body.getApplyRoleCodes())), operatorId);
        } catch (Exception e) {
            updateValue(items, KEY_APPLY_ROLE_CODES, "[\"STUDENT\"]", operatorId);
        }
    }

    /** 全局开关开启且当前登录操作员角色在配置列表内 */
    public boolean appliesToOperator(User operator, String operatorRoleHint) {
        ScanPopupAnnouncementSettingsDTO settings = getSettings();
        if (!settings.isEnabled()) {
            return false;
        }
        List<String> allowed = normalizeRoleCodes(settings.getApplyRoleCodes());
        if (allowed.isEmpty()) {
            return false;
        }
        String roleCode = roleHelper.resolveOperatorRoleCode(operator, operatorRoleHint);
        if (!StringUtils.hasText(roleCode)) {
            return false;
        }
        return allowed.stream().anyMatch(code -> code.equalsIgnoreCase(roleCode));
    }

    private List<String> normalizeRoleCodes(List<String> raw) {
        if (raw == null || raw.isEmpty()) {
            return new ArrayList<>(DEFAULT_APPLY_ROLE_CODES);
        }
        Set<String> valid = Set.of(
                RoleEnum.STUDENT.getCode(),
                RoleEnum.STAFF.getCode(),
                RoleEnum.SENIOR.getCode(),
                RoleEnum.ADMIN.getCode(),
                RoleEnum.SUPER_ADMIN.getCode(),
                RoleEnum.PLATFORM_OWNER.getCode()
        );
        List<String> out = raw.stream()
                .filter(StringUtils::hasText)
                .map(String::trim)
                .map(String::toUpperCase)
                .filter(valid::contains)
                .distinct()
                .collect(Collectors.toCollection(ArrayList::new));
        return out.isEmpty() ? new ArrayList<>(DEFAULT_APPLY_ROLE_CODES) : out;
    }

    private List<String> parseRoleCodes(String raw) {
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

    private Map<String, String> loadValues() {
        return loadItemsByKey().entrySet().stream()
                .collect(Collectors.toMap(Map.Entry::getKey, e -> e.getValue().getConfigValue() != null ? e.getValue().getConfigValue() : ""));
    }

    private Map<String, SystemConfigItem> loadItemsByKey() {
        return notificationSettingsService.listConfigs(MODULE).stream()
                .collect(Collectors.toMap(SystemConfigItem::getConfigKey, it -> it, (a, b) -> b));
    }

    private void updateValue(Map<String, SystemConfigItem> items, String key, String value, String operatorId) {
        SystemConfigItem item = items.get(key);
        if (item == null || item.getId() == null) {
            return;
        }
        UpdateSystemConfigRequest req = new UpdateSystemConfigRequest();
        req.setConfigValue(value);
        notificationSettingsService.updateConfig(item.getId(), req, operatorId);
    }

    private static boolean parseBoolean(String raw, boolean defaultValue) {
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
}
