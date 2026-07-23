package com.example.demo.common.dto;

import lombok.Data;

/**
 * 🌟 数字孪生全局标准通信协议 (Universal Digital Twin Event)
 * ---------------------------------------------------------------------------
 * 设计初衷：隔离底层硬件差异。无论底层是大华、ARO还是未来的西门子，
 * 前端 (UE5/Web) 接收到的数据格式永远是这个类序列化后的标准 JSON。
 * 前端无需关心底层硬件 API 如何变动，只需根据 source 和 category 进行分发渲染。
 */
@Data
public class UniversalEvent {

    /**
     * 1. 唯一事件追溯码 (例如: "ARO-2034525746" 或 "DAHUA-89757")
     * 前端用途：用于去重，防止同一个事件在断网重连后被渲染两次。
     */
    private String eventId;

    /**
     * 2. 数据来源标识 (枚举建议: "DAHUA", "ARO", "SIEMENS")
     * 前端用途：决定高亮特效的颜色。例如大华闪蓝色，ARO闪金色。
     */
    private String source;

    /**
     * 3. 业务大类标识 (枚举建议: "ACCESS"门禁, "ALARM"安防报警, "ENV"环境监测)
     * 前端用途：决定前端走哪一套渲染管线。是弹出门禁面板，还是拉响警报铃。
     */
    private String category;

    /**
     * 4. 标准化动作指令 (枚举建议: "ENTER"合法进入, "EXIT"合法离开, "DENY"非法拒绝, "WARN"警告)
     * 前端用途：决定 UI 面板上的具体文案和进出箭头方向。
     */
    private String action;

    /**
     * 5. 统一发生时间 (格式严格统一直为: "yyyy-MM-dd HH:mm:ss")
     * 前端用途：时间轴和历史记录展示。
     */
    private String timestamp;

    /**
     * 6. 人员画像模块 (如果不是门禁事件，如温湿度报警，此模块可为 null)
     */
    private PersonInfo person;

    /**
     * 7. 物理空间定位模块 (极其重要：UE5 需要依靠它来定位 3D 房间)
     */
    private LocationInfo location;

    /**
     * 8. 原始极客数据备查 (兜底模块)
     * 设计初衷：如果前端遇到极端特殊需求，需要查阅大华或 ARO 的原生底层状态码，可以在这里找。
     */
    private OriginalData originalData;

    /** 瀑布流/大屏：本条进出记录的触发溯源（可选） */
    private FeedProvenance feedProvenance;

    // =====================================================================
    // 内部子模块定义 (保持结构层级清晰，拒绝扁平化一锅粥)
    // =====================================================================

    @Data
    public static class PersonInfo {
        /** ARO 用户 ID，用于与自动化审计等关联 */
        private String userId;
        private String name;  // 姓名 (如: 林安顺)
        private String role;  // 身份/类型 (如: 实验员)
        private String group; // 归属组织/课题组 (如: 卢今的课题组)
    }

    @Data
    public static class LocationInfo {
        private String campus;     // 校区 (如: 浦东)
        private String floor;      // 楼层 (如: 4F)
        private String room;       // 房间号 (如: 401) -- UE5 核心绑定锚点！
        /** ARO 房间 ID（与 room 名称并存） */
        private String roomId;
        private String rawChannel; // 原始硬件通道号 (大华特有，如 1000068$7$0$0)
    }

    @Data
    public static class OriginalData {
        private String rawStatusCode; // 底层原生状态码 (如 ARO的2，大华的51)
        private String message;       // 底层原生提示信息
    }

    @Data
    public static class FeedProvenance {
        /** 来源码：ARO_OFFICIAL / WEB_SCAN / DAHUA / SYSTEM 等 */
        private String channel;
        /** 列表行尾一行摘要 */
        private String summaryZh;
        /** 详情弹窗正文 */
        private String detailZh;
        /** 门禁或设备展示名（可空） */
        private String doorName;
        /** 规则/批次提示（可空） */
        private String ruleHint;
    }
}