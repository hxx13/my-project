package com.example.demo.modules.avidity.entity;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 安维迪当前未恢复报警。描述「此刻」，每轮同步整表替换 —— 报警恢复了就该从表里消失。
 * 见 db/bootstrap-avidity-alarm-current.sql。
 */
@Data
public class AvidityAlarmCurrent {

    private Long id;

    /** 平台报警唯一 ID（形如 639276288974482306_219350_RM_A_B105_SLV_1） */
    private String alarmId;

    private Long virtualDeviceId;

    private String deviceName;

    private String alarmName;

    private String message;

    /** 平台状态：0 未恢复 */
    private Integer state;

    private Integer alarmLevel;

    private String alarmGroupName;

    /** 触发时刻（北京墙钟；平台给的是 UTC，写入前已换算） */
    private LocalDateTime triggeredTime;

    private LocalDateTime syncedAt;
}
