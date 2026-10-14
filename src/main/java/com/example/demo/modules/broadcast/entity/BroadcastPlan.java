package com.example.demo.modules.broadcast.entity;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 广播定时播放方案。我方调度器按它到点下发播放指令，平台只负责出声。
 * 见 db/bootstrap-broadcast-plan.sql 的表注释。
 */
@Data
public class BroadcastPlan {

    private Long id;

    private String planName;

    /** 0 停用 / 1 启用 */
    private Boolean enabled;

    /** 0 按周循环 / 1 按日期区间 */
    private Integer timeMode;

    /** 按周：选中星期，"1"=周一 … "7"=周日，如 "135" */
    private String weekDays;

    /** 按日期：开始日期 yyyy-MM-dd */
    private String startDate;

    /** 按日期：结束日期 yyyy-MM-dd */
    private String endDate;

    /** 每日开始时刻 HH:mm:ss（平台时间） */
    private String startTime;

    /** 每日结束时刻 HH:mm:ss（平台时间） */
    private String endTime;

    /** 开播前设定的音量 0-100；为空则不动音量 */
    private Integer volume;

    /** 目标分区 MAC 数组（JSON 文本） */
    private String zoneMacs;

    /** 曲目路径数组（JSON 文本） */
    private String songPaths;

    /** 曲目所属曲库列表编号 */
    private String songListId;

    /** 循环播放：0 播完即停 / 1 窗口内列表循环 */
    private Boolean loopPlay;

    /** 上次触发日期 yyyy-MM-dd —— 防同一天重复触发 */
    private String lastFiredDate;

    private LocalDateTime lastFiredAt;

    /** 上次收播日期 yyyy-MM-dd —— 窗口结束只收一次播 */
    private String lastStopDate;

    private String lastResult;

    private String createdBy;

    private LocalDateTime createdAt;

    private LocalDateTime updatedAt;
}
