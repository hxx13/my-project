package com.example.demo.modules.twin.rpg.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class TwinExpRecord {
    private Long id;
    private String userId;
    private String userName;
    private Integer expAmount;
    private String sourceType;
    private Integer accessType;
    private String roomId;
    private String roomName;
    private LocalDateTime createTime;

    // ── 新增：异常标记与审核 ──
    private Integer anomalyFlag;       // 0=正常 1=可疑
    private String anomalyTypes;       // 逗号分隔: OVER_CAP,CROSS_DAY,NIGHT_HOURS
    private Integer reviewStatus;      // 0=待审核 1=已批准 2=已驳回
    private String reviewedBy;
    private LocalDateTime reviewedAt;
    private String reviewNote;

    // ── 新增：溯源字段 ──
    private String feedSource;         // 来自 aro_access_log.feed_source
    private Integer sessionDurationMinutes; // 会话停留时长
}
