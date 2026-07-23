package com.example.demo.modules.telemetry.dto;

import lombok.Builder;
import lombok.Data;

/**
 * 程序坞「动物房温湿度」页使用的轮询与窗口配置，来源为 twin_job_schedule_config 中
 * {@code TELEMETRY_WINCC_UI} 行（该任务不参与服务端 tick，仅作配置载体）。
 */
@Data
@Builder
public class TelemetryWinccDockPollConfigDto {
    /** 与定时管理页「开关」一致：允许程序坞在窗口内按间隔拉取内存快照（非直连 WinCC） */
    private boolean scheduleEnabled;
    private int pollIntervalSeconds;
    private String scheduleStartTime;
    private String scheduleEndTime;
    private String weekDays;
    private String scheduleType;
}
