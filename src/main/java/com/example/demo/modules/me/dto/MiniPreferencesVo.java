package com.example.demo.modules.me.dto;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/** 小程序端个人配置（持久化在 sys_user.mini_preferences_json） */
@Data
public class MiniPreferencesVo {

    /**
     * Twin Web 壳主题（首页科幻等），与账号绑定持久化在 mini_preferences_json。
     * 允许值：standard | dashboardSciFi；缺省由服务端按 standard 处理。
     */
    private String twinWebChromeTheme;

    /**
     * 房间在场红点：用户勾选的关注区域（校区 + 可选楼层；楼层为空表示整校区）。
     */
    private RoomWatchVo roomWatch = new RoomWatchVo();

    @Data
    public static class RoomWatchVo {
        private List<RoomWatchSelectionVo> selections = new ArrayList<>();
    }

    @Data
    public static class RoomWatchSelectionVo {
        private String campus = "";
        private String floor = "";
    }
}
