package com.example.demo.modules.me.dto;

import lombok.Data;

/**
 * 全站亮/暗色定时切换偏好（持久化在 mini_preferences_json.appearanceSchedule）。
 */
@Data
public class AppearanceScheduleVo {
    /** 是否启用定时自动切换；缺省 true */
    private Boolean autoScheduleEnabled;
    /** light | dark | null — 手动覆盖至下一 schedule 边界 */
    private String manualOverride;
    /** 亮色开始 HH:mm，默认 08:00 */
    private String lightStart;
    /** 亮色结束 HH:mm，默认 16:30 */
    private String lightEnd;
    /** 关闭自动切换时的主题 id：standard | standard-dark | scifi */
    private String manualThemeId;
}
