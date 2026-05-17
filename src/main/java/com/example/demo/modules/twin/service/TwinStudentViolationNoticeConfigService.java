package com.example.demo.modules.twin.service;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.mapper.UserMapper;
import com.example.demo.modules.notification.entity.SystemConfigItem;
import com.example.demo.modules.notification.service.NotificationSettingsService;
import com.example.demo.modules.notification.dto.UpdateSystemConfigRequest;
import com.example.demo.modules.twin.dto.ScanStudentViolationNoticeDTO;
import com.example.demo.modules.twin.dto.UnboundCardNoticeSettingsDTO;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class TwinStudentViolationNoticeConfigService {
    public static final String MODULE = "student_violation";
    /** 扫码端 sessionStorage 与违规记录 id 区分 */
    public static final long UNBOUND_NOTICE_ID = 1L;

    private static final String KEY_ENABLED = "student.violation.unbound.notice.enabled";
    private static final String KEY_SHOW_EVERY = "student.violation.unbound.notice.show_every_scan";
    private static final String KEY_TEXT = "student.violation.unbound.notice.text";
    private static final String KEY_IMAGES = "student.violation.unbound.notice.image_urls";
    private static final String KEY_FORBID_ENTER = "student.violation.unbound.notice.forbid_enter";
    private static final String KEY_APPLY_ROLE_CODES = "student.violation.unbound.notice.apply_role_codes";

    private static final List<String> DEFAULT_APPLY_ROLE_CODES = List.of(RoleEnum.STUDENT.getCode());

    private final NotificationSettingsService notificationSettingsService;
    private final ObjectMapper objectMapper;
    private final UserMapper userMapper;

    public TwinStudentViolationNoticeConfigService(
            NotificationSettingsService notificationSettingsService,
            ObjectMapper objectMapper,
            UserMapper userMapper
    ) {
        this.notificationSettingsService = notificationSettingsService;
        this.objectMapper = objectMapper;
        this.userMapper = userMapper;
    }

    public UnboundCardNoticeSettingsDTO getSettings() {
        Map<String, String> values = loadValues();
        UnboundCardNoticeSettingsDTO dto = new UnboundCardNoticeSettingsDTO();
        dto.setEnabled(parseBoolean(values.get(KEY_ENABLED), true));
        dto.setShowNoticeEveryScan(parseBoolean(values.get(KEY_SHOW_EVERY), true));
        dto.setForbidEnter(parseBoolean(values.get(KEY_FORBID_ENTER), false));
        dto.setApplyRoleCodes(parseRoleCodes(values.get(KEY_APPLY_ROLE_CODES)));
        dto.setViolationText(values.getOrDefault(KEY_TEXT, ""));
        dto.setImageUrls(parseImageUrls(values.get(KEY_IMAGES)));
        return dto;
    }

    public void saveSettings(UnboundCardNoticeSettingsDTO body, String operatorId) {
        if (body == null) {
            return;
        }
        Map<String, SystemConfigItem> items = loadItemsByKey();
        updateValue(items, KEY_ENABLED, body.isEnabled() ? "true" : "false", operatorId);
        updateValue(items, KEY_SHOW_EVERY, body.isShowNoticeEveryScan() ? "true" : "false", operatorId);
        updateValue(items, KEY_FORBID_ENTER, body.isForbidEnter() ? "true" : "false", operatorId);
        updateValue(items, KEY_TEXT, body.getViolationText() != null ? body.getViolationText() : "", operatorId);
        try {
            String rolesJson = objectMapper.writeValueAsString(
                    normalizeRoleCodes(body.getApplyRoleCodes())
            );
            updateValue(items, KEY_APPLY_ROLE_CODES, rolesJson, operatorId);
        } catch (Exception e) {
            updateValue(items, KEY_APPLY_ROLE_CODES, "[\"STUDENT\"]", operatorId);
        }
        try {
            String json = objectMapper.writeValueAsString(
                    body.getImageUrls() != null ? body.getImageUrls() : Collections.emptyList()
            );
            updateValue(items, KEY_IMAGES, json, operatorId);
        } catch (Exception e) {
            updateValue(items, KEY_IMAGES, "[]", operatorId);
        }
    }

    public ScanStudentViolationNoticeDTO buildUnboundNotice(User operator, String operatorRoleHint) {
        if (!appliesToOperator(operator, operatorRoleHint)) {
            return null;
        }
        UnboundCardNoticeSettingsDTO settings = getSettings();
        String text = settings.getViolationText() != null ? settings.getViolationText().trim() : "";
        List<String> images = settings.getImageUrls() != null ? settings.getImageUrls() : Collections.emptyList();
        if (!StringUtils.hasText(text) && images.isEmpty() && !settings.isForbidEnter()) {
            return null;
        }
        ScanStudentViolationNoticeDTO dto = new ScanStudentViolationNoticeDTO();
        dto.setId(UNBOUND_NOTICE_ID);
        dto.setViolationText(settings.getViolationText());
        dto.setImageUrls(images);
        dto.setShowNoticeEveryScan(settings.isShowNoticeEveryScan());
        dto.setEnterLocked(settings.isForbidEnter());
        dto.setRemainingEnterAllowance(null);
        return dto;
    }

    /** 未绑卡且配置开启禁止进入时，服务端 execute 与前端按钮锁定均应对齐 */
    public boolean isUnboundEnterForbidden(boolean hasPhysicalCardMapping, User operator, String operatorRoleHint) {
        if (Boolean.TRUE.equals(hasPhysicalCardMapping)) {
            return false;
        }
        if (!appliesToOperator(operator, operatorRoleHint)) {
            return false;
        }
        return getSettings().isForbidEnter();
    }

    /** 全局开关开启且当前登录操作员角色在配置列表内 */
    public boolean appliesToOperator(User operator, String operatorRoleHint) {
        UnboundCardNoticeSettingsDTO settings = getSettings();
        if (!settings.isEnabled()) {
            return false;
        }
        List<String> allowed = normalizeRoleCodes(settings.getApplyRoleCodes());
        if (allowed.isEmpty()) {
            return false;
        }
        String roleCode = resolveOperatorRoleCode(operator, operatorRoleHint);
        if (!StringUtils.hasText(roleCode)) {
            return false;
        }
        return allowed.stream().anyMatch(code -> code.equalsIgnoreCase(roleCode));
    }

    /**
     * 当前网页登录操作员角色：优先 sys_user；其次请求头 X-Scan-Operator-Role（与前端 authStorage 一致）。
     */
    public String resolveOperatorRoleCode(User operator, String operatorRoleHint) {
        if (operator != null && operator.getRole() != null) {
            return operator.getRole().getCode();
        }
        if (operator != null && StringUtils.hasText(operator.getId())) {
            try {
                User fresh = userMapper.findById(operator.getId().trim());
                if (fresh != null && fresh.getRole() != null) {
                    return fresh.getRole().getCode();
                }
            } catch (Exception ignored) {
                // ignore
            }
        }
        return parseRoleHint(operatorRoleHint);
    }

    private static String parseRoleHint(String roleHint) {
        if (!StringUtils.hasText(roleHint)) {
            return null;
        }
        String code = roleHint.trim().toUpperCase();
        for (RoleEnum r : RoleEnum.values()) {
            if (r.getCode().equalsIgnoreCase(code)) {
                return r.getCode();
            }
        }
        return null;
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
        List<SystemConfigItem> items = notificationSettingsService.listConfigs(MODULE);
        return items.stream().collect(Collectors.toMap(SystemConfigItem::getConfigKey, it -> it, (a, b) -> b));
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

    private List<String> parseImageUrls(String raw) {
        if (!StringUtils.hasText(raw)) {
            return new ArrayList<>();
        }
        try {
            List<String> list = objectMapper.readValue(raw.trim(), new TypeReference<List<String>>() {});
            if (list == null) {
                return new ArrayList<>();
            }
            return list.stream().filter(StringUtils::hasText).map(String::trim).toList();
        } catch (Exception ignored) {
            return new ArrayList<>();
        }
    }
}
