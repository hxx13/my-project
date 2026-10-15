package com.example.demo.modules.avidity.entity;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 一条历史报警流水。给「点平面图上的点位、看它的历史」用。
 * 见 db/bootstrap-avidity-alarm-history.sql。
 */
@Data
public class AvidityAlarmHistory {

    private Long id;

    private String alarmId;

    private Long virtualDeviceId;

    private String deviceName;

    /** 告警名称，与平面图上的点位标识（var）一一对应 */
    private String alarmName;

    private String message;

    private Integer state;

    private Integer alarmLevel;

    private String alarmGroupName;

    /** 触发时刻（北京墙钟；平台给的是 UTC，写入前已换算） */
    private LocalDateTime triggeredTime;

    private LocalDateTime syncedAt;
}
