package com.example.demo.modules.twin.dashboard.service;

import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.notification.entity.SystemConfigItem;
import com.example.demo.modules.twin.dashboard.dto.ScanPopupAnnouncementSettingsDTO;
import com.example.demo.modules.twin.dashboard.support.ScanNoticeConfigSupport;
import com.example.demo.modules.twin.dashboard.support.ShowNoticeEveryScanContract;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.List;
import java.util.Map;

/**
 * 扫码弹窗公告的全局开关 / 展开策略 / 生效角色。
 * 与未绑卡提示共用 {@link ScanNoticeConfigSupport}（T2-6）。
 */
@Service
public class TwinScanPopupAnnouncementConfigService {
    public static final String MODULE = ScanNoticeConfigSupport.MODULE;

    private static final String KEY_ENABLED = "student.scan.announcement.enabled";
    private static final String KEY_SHOW_EVERY = "student.scan.announcement.show_every_scan";
    private static final String KEY_APPLY_ROLE_CODES = "student.scan.announcement.apply_role_codes";

    private final ScanNoticeConfigSupport configSupport;
    private final TwinStudentViolationNoticeConfigService roleHelper;

    public TwinScanPopupAnnouncementConfigService(
            ScanNoticeConfigSupport configSupport,
            TwinStudentViolationNoticeConfigService roleHelper
    ) {
        this.configSupport = configSupport;
        this.roleHelper = roleHelper;
    }

    public ScanPopupAnnouncementSettingsDTO getSettings() {
        Map<String, String> values = configSupport.loadValues();
        ScanPopupAnnouncementSettingsDTO dto = new ScanPopupAnnouncementSettingsDTO();
        dto.setEnabled(ScanNoticeConfigSupport.parseBoolean(values.get(KEY_ENABLED), true));
        dto.setShowNoticeEveryScan(ScanNoticeConfigSupport.parseBoolean(
                values.get(KEY_SHOW_EVERY), ShowNoticeEveryScanContract.DEFAULT));
        dto.setApplyRoleCodes(configSupport.parseRoleCodes(values.get(KEY_APPLY_ROLE_CODES)));
        return dto;
    }

    public void saveSettings(ScanPopupAnnouncementSettingsDTO body, String operatorId) {
        if (body == null) {
            return;
        }
        Map<String, SystemConfigItem> items = configSupport.loadItemsByKey();
        configSupport.updateValue(items, KEY_ENABLED, body.isEnabled() ? "true" : "false", operatorId);
        configSupport.updateValue(items, KEY_SHOW_EVERY,
                ShowNoticeEveryScanContract.resolve(body.isShowNoticeEveryScan()) ? "true" : "false",
                operatorId);
        configSupport.updateValue(items, KEY_APPLY_ROLE_CODES,
                configSupport.writeRoleCodesJson(body.getApplyRoleCodes()), operatorId);
    }

    /** 全局开关开启且当前登录操作员角色在配置列表内 */
    public boolean appliesToOperator(User operator, String operatorRoleHint) {
        ScanPopupAnnouncementSettingsDTO settings = getSettings();
        if (!settings.isEnabled()) {
            return false;
        }
        List<String> allowed = configSupport.normalizeRoleCodes(settings.getApplyRoleCodes());
        if (allowed.isEmpty()) {
            return false;
        }
        String roleCode = roleHelper.resolveOperatorRoleCode(operator, operatorRoleHint);
        if (!StringUtils.hasText(roleCode)) {
            return false;
        }
        return allowed.stream().anyMatch(code -> code.equalsIgnoreCase(roleCode));
    }
}
