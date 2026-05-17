package com.example.demo.modules.twin.dto;

import lombok.Data;

import java.util.List;

/** 管理端：扫码弹窗公告全局配置 */
@Data
public class ScanPopupAnnouncementSettingsDTO {
    private boolean enabled = true;
    private boolean showNoticeEveryScan = true;
    private List<String> applyRoleCodes;
}
