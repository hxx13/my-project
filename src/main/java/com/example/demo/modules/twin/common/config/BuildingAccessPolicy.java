package com.example.demo.modules.twin.common.config;

import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

/**
 * 大楼出入场业务政策（debug 预测、滞留预警、跑批模型共用）。
 */
@Component
public class BuildingAccessPolicy {

    /** 非授权人员最晚入场时刻 */
    public static final LocalTime NORMAL_ENTRY_DEADLINE = LocalTime.of(17, 30);

    /** 授权人员最晚离场时刻 */
    public static final LocalTime AUTHORIZED_LATEST_EXIT = LocalTime.of(22, 0);

    /** 非授权：离场晚于该时刻计为「晚归」统计 */
    public static final LocalTime NORMAL_LATE_EXIT_THRESHOLD = LocalTime.of(20, 0);

    /** 日内出入曲线展示起止小时（含端点） */
    public static final int DAY_CHART_START_HOUR = 7;
    public static final int DAY_CHART_END_HOUR = 22;

    public LocalDateTime authorizedLatestExitOn(LocalDate day) {
        return day.atTime(AUTHORIZED_LATEST_EXIT);
    }

    public LocalDateTime normalLateExitThresholdOn(LocalDate day) {
        return day.atTime(NORMAL_LATE_EXIT_THRESHOLD);
    }

    public boolean isLateExit(LocalDateTime exitTime, boolean authorized) {
        LocalTime t = exitTime.toLocalTime();
        if (authorized) {
            return t.isAfter(AUTHORIZED_LATEST_EXIT);
        }
        return t.isAfter(NORMAL_LATE_EXIT_THRESHOLD);
    }

    public double exitHourValue(LocalDateTime exitTime) {
        return exitTime.getHour() + exitTime.getMinute() / 60.0 + exitTime.getSecond() / 3600.0;
    }
}
