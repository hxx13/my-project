package com.example.demo.modules.twin.dashboard.service;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.mapper.UserMapper;
import com.example.demo.modules.notification.entity.SystemConfigItem;
import com.example.demo.modules.twin.dashboard.dto.ScanStudentViolationNoticeDTO;
import com.example.demo.modules.twin.dashboard.dto.UnboundCardNoticeSettingsDTO;
import com.example.demo.modules.twin.dashboard.support.ScanNoticeConfigSupport;
import com.example.demo.modules.twin.dashboard.support.ShowNoticeEveryScanContract;
import com.example.demo.modules.twin.obligation.service.ObligationService;
import com.fasterxml.jackson.core.type.TypeReference;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * 未绑卡提示配置与扫码 DTO 组装。
 * 与弹窗公告共用 {@link ScanNoticeConfigSupport}（T2-6）。
 */
@Service
public class TwinStudentViolationNoticeConfigService {
    public static final String MODULE = ScanNoticeConfigSupport.MODULE;
    /** 扫码端 sessionStorage 与违规记录 id 区分 */
    public static final long UNBOUND_NOTICE_ID = 1L;

    private static final String KEY_ENABLED = "student.violation.unbound.notice.enabled";
    private static final String KEY_SHOW_EVERY = "student.violation.unbound.notice.show_every_scan";
    private static final String KEY_TEXT = "student.violation.unbound.notice.text";
    private static final String KEY_IMAGES = "student.violation.unbound.notice.image_urls";
    private static final String KEY_FORBID_ENTER = "student.violation.unbound.notice.forbid_enter";
    private static final String KEY_APPLY_ROLE_CODES = "student.violation.unbound.notice.apply_role_codes";

    private final ScanNoticeConfigSupport configSupport;
    private final UserMapper userMapper;
    private final ObligationService obligationService;

    public TwinStudentViolationNoticeConfigService(
            ScanNoticeConfigSupport configSupport,
            UserMapper userMapper,
            @Autowired(required = false) ObligationService obligationService
    ) {
        this.configSupport = configSupport;
        this.userMapper = userMapper;
        this.obligationService = obligationService;
    }

    public UnboundCardNoticeSettingsDTO getSettings() {
        Map<String, String> values = configSupport.loadValues();
        UnboundCardNoticeSettingsDTO dto = new UnboundCardNoticeSettingsDTO();
        dto.setEnabled(ScanNoticeConfigSupport.parseBoolean(values.get(KEY_ENABLED), true));
        dto.setShowNoticeEveryScan(ScanNoticeConfigSupport.parseBoolean(
                values.get(KEY_SHOW_EVERY), ShowNoticeEveryScanContract.DEFAULT));
        dto.setForbidEnter(ScanNoticeConfigSupport.parseBoolean(values.get(KEY_FORBID_ENTER), false));
        dto.setApplyRoleCodes(configSupport.parseRoleCodes(values.get(KEY_APPLY_ROLE_CODES)));
        dto.setViolationText(values.getOrDefault(KEY_TEXT, ""));
        dto.setImageUrls(parseImageUrls(values.get(KEY_IMAGES)));
        return dto;
    }

    public void saveSettings(UnboundCardNoticeSettingsDTO body, String operatorId) {
        if (body == null) {
            return;
        }
        Map<String, SystemConfigItem> items = configSupport.loadItemsByKey();
        configSupport.updateValue(items, KEY_ENABLED, body.isEnabled() ? "true" : "false", operatorId);
        configSupport.updateValue(items, KEY_SHOW_EVERY,
                ShowNoticeEveryScanContract.resolve(body.isShowNoticeEveryScan()) ? "true" : "false",
                operatorId);
        configSupport.updateValue(items, KEY_FORBID_ENTER, body.isForbidEnter() ? "true" : "false", operatorId);
        configSupport.updateValue(items, KEY_TEXT, body.getViolationText() != null ? body.getViolationText() : "", operatorId);
        configSupport.updateValue(items, KEY_APPLY_ROLE_CODES,
                configSupport.writeRoleCodesJson(body.getApplyRoleCodes()), operatorId);
        try {
            String json = configSupport.objectMapper().writeValueAsString(
                    body.getImageUrls() != null ? body.getImageUrls() : Collections.emptyList()
            );
            configSupport.updateValue(items, KEY_IMAGES, json, operatorId);
        } catch (Exception e) {
            configSupport.updateValue(items, KEY_IMAGES, "[]", operatorId);
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
        if (obligationService != null && operator != null && StringUtils.hasText(operator.getId())) {
            obligationService.syncUnboundForSubject(
                    operator.getId().trim(),
                    settings.getViolationText(),
                    settings.isForbidEnter());
        }
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
        List<String> allowed = configSupport.normalizeRoleCodes(settings.getApplyRoleCodes());
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

    private List<String> parseImageUrls(String raw) {
        if (!StringUtils.hasText(raw)) {
            return new ArrayList<>();
        }
        try {
            List<String> list = configSupport.objectMapper().readValue(raw.trim(), new TypeReference<List<String>>() {});
            if (list == null) {
                return new ArrayList<>();
            }
            return list.stream().filter(StringUtils::hasText).map(String::trim).toList();
        } catch (Exception ignored) {
            return new ArrayList<>();
        }
    }
}
