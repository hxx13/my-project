package com.example.demo.modules.avidity.entity;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 安维迪报警的推送口径配置。两行：新报警即推 / 当日累计超阈值才推，各自独立开关。
 * 见 db/bootstrap-avidity-alarm-rule.sql。
 */
@Data
public class AvidityAlarmRule {

    public static final String NEW_ALARM = "NEW_ALARM";
    public static final String DAILY_COUNT = "DAILY_COUNT";

    private Long id;

    private String ruleCode;

    private String ruleName;

    private Boolean enabled;

    /** 仅 DAILY_COUNT 用：当日累计次数阈值 */
    private Integer thresholdCount;

    private LocalDateTime updatedAt;
}
