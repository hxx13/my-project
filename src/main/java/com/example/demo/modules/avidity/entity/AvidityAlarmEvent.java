package com.example.demo.modules.avidity.entity;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 一次报警事件（我们自己按实时状态记的）：每个点位一条「开始时间 / 结束时间」。
 * endedAt 为空 = 此刻还在报。
 * 见 db/bootstrap-avidity-alarm-event.sql。
 */
@Data
public class AvidityAlarmEvent {

    private Long id;

    private Long virtualDeviceId;

    /** 点位标识（画面图元绑定的变量名） */
    private String alarmName;

    /** 分区 / 前室号（201、E11A）—— 界面上按它归文件夹 */
    private String room;

    /** 内间名（201-A、E11A-B106） */
    private String rack;

    /** 点位号 */
    private Integer pointNo;

    private LocalDateTime startedAt;

    /** 为空 = 还在报 */
    private LocalDateTime endedAt;

    private LocalDateTime lastSeenAt;

    private LocalDateTime createdAt;
}
