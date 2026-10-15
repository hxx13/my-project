package com.example.demo.modules.avidity.entity;

import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 安维迪告警统计：报警仪表盘右侧那张表的一行 —— 某个告警名称在某台设备上、某个统计日内的报警次数。
 * 见 db/bootstrap-avidity-alarm-stat.sql。
 */
@Data
public class AvidityAlarmStat {

    private Long id;

    /** 统计窗口所属日（北京时区） */
    private LocalDate statDate;

    private Long virtualDeviceId;

    private String deviceName;

    /** 告警名称，如 RM201_B_SLV_75 */
    private String alarmName;

    /** 告警内容，如 RM201_B_75_流量报警 */
    private String alarmContent;

    private Integer alarmCount;

    private LocalDateTime syncedAt;
}
