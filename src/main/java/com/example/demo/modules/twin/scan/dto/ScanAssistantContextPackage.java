package com.example.demo.modules.twin.scan.dto;

import lombok.Data;

import java.util.List;

/**
 * 扫码助手 AI 上下文数据包（结构化 JSON，供 LLM 与调试预览共用）。
 *
 * <p>顶层字段：
 * <ul>
 *   <li>{@code scenario} — welcome | alert | info</li>
 *   <li>{@code generatedAt} — 包生成时刻（业务时区墙钟）</li>
 *   <li>{@code person} — 刷卡人基本信息</li>
 *   <li>{@code access} — 门禁状态与今日进出统计（含 {@code todayEntryRank} 等派生字段）</li>
 *   <li>{@code rooms} — 可选/待选房间摘要</li>
 *   <li>{@code notices} — 违规、未绑卡、时段限制等提示</li>
 *   <li>{@code facility} — 全馆今日汇总</li>
 *   <li>{@code temporal} — 时段/星期等时间语境</li>
 *   <li>{@code promptHints} — 播报语气与长度约束（来自 llm.assistant.* 配置）</li>
 * </ul>
 */
@Data
public class ScanAssistantContextPackage {

    private String scenario;
    private String generatedAt;
    private PersonSection person;
    private AccessSection access;
    private RoomsSection rooms;
    private NoticesSection notices;
    private FacilitySection facility;
    private TemporalSection temporal;
    private PromptHintsSection promptHints;

    @Data
    public static class PersonSection {
        private String userId;
        private String name;
        private String role;
        private String department;
        private String projectGroup;
        private String group;
        private Integer rpgLevel;
    }

    @Data
    public static class AccessSection {
        /** 推断动作：enter | exit | stay | blocked */
        private String action;
        private String currentState;
        /** 该人员今日第几位入场者（尚未入场时为 N+1） */
        private Integer todayEntryRank;
        /** 该人员今日成功进入次数 accessType=1 */
        private Integer todayEntryCount;
        /** 该人员今日全部刷卡次数 */
        private Integer todayScanCount;
        private Boolean isFirstEntryToday;
        private String lastVisitGap;
        private Integer personTodayMinutes;
        private Integer globalUserState;
        private Boolean hasPhysicalCardMapping;
        private Boolean scanPopupEntryAllowedNow;
    }

    @Data
    public static class RoomsSection {
        private String primaryRoom;
        private List<String> allowedRoomNames;
        private List<String> pendingRoomNames;
        private Integer allowedCount;
        private Integer pendingCount;
        private Boolean currentInside;
    }

    @Data
    public static class NoticesSection {
        private String violationTitle;
        private Boolean violationEnterLocked;
        private Integer violationRemainingAllowance;
        private String violationRuleName;
        private String unboundNotice;
        private Boolean unboundEnterLocked;
        private Boolean entryWindowBlocked;
    }

    @Data
    public static class FacilitySection {
        /** 今日全馆进入人次 accessType=1 */
        private Integer todayTotalEntries;
        /** 今日全馆刷卡总次数（含离开等） */
        private Integer todayTotalScans;
        /** 估计当前在场人数 */
        private Integer activeInsideCount;
        private Integer pudongEntries;
        private Integer puxiEntries;
    }

    @Data
    public static class TemporalSection {
        /** morning | afternoon | evening | night */
        private String timeOfDay;
        private String dayOfWeek;
        private String businessDayStart;
    }

    @Data
    public static class PromptHintsSection {
        private String tone;
        private Integer maxSentences;
    }
}
