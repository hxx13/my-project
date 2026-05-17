package com.example.demo.modules.twin.dto;

import lombok.Data;

import java.util.List;

/** 管理端：未绑卡扫码提示全局配置 */
@Data
public class UnboundCardNoticeSettingsDTO {
    private boolean enabled = true;
    private boolean showNoticeEveryScan = true;
    /** 未绑卡人员是否禁止扫码进入房间（离开不受影响） */
    private boolean forbidEnter;
    /** 对哪些系统账号角色生效，如 ["STUDENT"]；非列表内角色扫码不展示提示、不禁止进入 */
    private List<String> applyRoleCodes;
    private String violationText;
    private List<String> imageUrls;
}
