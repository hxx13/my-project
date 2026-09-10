package com.example.demo.modules.me.dto;

import lombok.Data;

import java.util.List;
import java.util.Map;

/**
 * 小程序端个人配置（持久化在 sys_user.mini_preferences_json）。
 *
 * <p>⚠️ 各字段**不要给非 null 默认值**：本 VO 同时用于 PUT 请求体，多个客户端/模块只提交自己负责的
 * 字段（主题、后台侧栏、学生端侧栏、房间关注…）。字段带 {@code new ArrayList<>()} 之类的初值后，
 * 「JSON 里没提交」会在 Java 侧变成「空列表」而不是 null，
 * {@code MiniPreferencesService.mergeMissingFieldsFromExisting} 的 `null 才保留库内值` 判定就永远不成立，
 * 于是 A 模块的部分提交会把 B 模块的数据清空（实测：小程序存房间关注冲掉后台侧栏常用）。
 * 默认值统一由 {@code empty() / normalize()} 在落库前补齐。</p>
 */
@Data
public class MiniPreferencesVo {

    /**
     * Twin Web 壳主题（首页科幻等），与账号绑定持久化在 mini_preferences_json。
     * 允许值：standard | dashboardSciFi；缺省由服务端按 standard 处理。
     */
    private String twinWebChromeTheme;

    /**
     * 全站亮/暗色定时切换（Web ThemeProvider）；缺省 autoScheduleEnabled=true。
     */
    private AppearanceScheduleVo appearanceSchedule;

    /**
     * 页面帮助「新功能介绍」已知晓记录：路由 -> 帮助正文 updatedAt（内容更新后会再次弹出）。
     */
    private Map<String, String> pageHelpIntroAck;

    /** 管理后台侧栏「常用」最近访问路径（仅 pathname，不含 query） */
    private List<String> adminNavRecent;

    /** 管理后台侧栏「收藏」路径 */
    private List<String> adminNavStars;

    /** 管理后台锁定入口路径（同一时间仅一个；null 表示未锁定） */
    private String adminNavLock;

    /** 学生端侧栏「常用」最近访问路径（仅 pathname，不含 query） */
    private List<String> studentNavRecent;

    /** 学生端侧栏「收藏」路径 */
    private List<String> studentNavStars;

    /** 学生端锁定入口路径（同一时间仅一个；null 表示未锁定） */
    private String studentNavLock;

    /**
     * 房间在场红点：用户勾选的关注区域（校区 + 可选楼层；楼层为空表示整校区）。
     */
    private RoomWatchVo roomWatch;

    @Data
    public static class RoomWatchVo {
        private List<RoomWatchSelectionVo> selections;
    }

    @Data
    public static class RoomWatchSelectionVo {
        private String campus;
        private String floor;
    }
}
