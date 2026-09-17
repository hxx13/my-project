package com.example.demo.modules.telemetry.service;

import java.time.Duration;
import java.time.LocalDateTime;

/**
 * 单测点报警状态机。纯函数：不查数据库、不读系统时钟，时间和历史状态都由调用方传进来。
 *
 * <p>与改造前的区别：不再有「距上次报警超过 N 分钟就把上次状态改写成 OK」的强制重置。
 * 测点状态只由当前值是否落回滞回带内决定；持续越限时按重提醒间隔产生提醒事件。
 * 强制重置是"同一房间每半小时报一次"的根因，已删除。
 *
 * <p>本类只判定"状态变成什么"，不管"要不要通知"。恢复是否对外发通知由调用方按楼层配置决定。
 */
public final class TelemetryAlarmBandEvaluator {

    private TelemetryAlarmBandEvaluator() {}

    /** 本次评估应该产生什么事件。 */
    public enum EventType {
        /** 什么都不做 */
        NONE,
        /** 新越限 */
        ALARM,
        /** 持续越限且到达重提醒间隔 */
        RENOTIFY,
        /** 落回滞回带内 */
        RECOVERY
    }

    /**
     * @param lastBand            上次台账里的 alarm_band，取值 HIGH / LOW / OK，null 表示无历史
     * @param lastNotifiedAt      上次台账写入时间（即上次通知时间）
     * @param streakStartedAt     本轮同方向连续报警的起点，用于算"已持续多久"；未知传 null
     * @param now                 当前时间
     * @param current             当前读数
     * @param limitMin            生效下限，可为 null（该方向不判）
     * @param limitMax            生效上限，可为 null
     * @param hysteresis          滞回（死区）
     * @param renotifyIntervalMin 重提醒间隔，<= 0 表示永不重提醒
     */
    public record Input(String lastBand,
                        LocalDateTime lastNotifiedAt,
                        LocalDateTime streakStartedAt,
                        LocalDateTime now,
                        double current,
                        Double limitMin,
                        Double limitMax,
                        double hysteresis,
                        int renotifyIntervalMin) {}

    public record Outcome(EventType eventType, String band, String direction, long sustainedMinutes) {
        public static final Outcome NONE = new Outcome(EventType.NONE, null, null, 0L);
    }

    public static Outcome evaluate(Input in) {
        boolean overMax = in.limitMax() != null && in.current() > in.limitMax();
        boolean overMin = in.limitMin() != null && in.current() < in.limitMin();
        boolean lastIsAlarm = "HIGH".equals(in.lastBand()) || "LOW".equals(in.lastBand());

        if (!lastIsAlarm) {
            if (overMax) return new Outcome(EventType.ALARM, "HIGH", "偏高", 0L);
            if (overMin) return new Outcome(EventType.ALARM, "LOW", "偏低", 0L);
            return Outcome.NONE;
        }

        if ("HIGH".equals(in.lastBand())) {
            // 滞回带：[max - hysteresis, +∞) 之间都算"仍在报高限"
            boolean stillHigh = in.limitMax() != null
                    && in.current() >= in.limitMax() - in.hysteresis();
            if (stillHigh) return renotify(in, "HIGH", "偏高");
            // 一路跌穿对侧下限：直接报下限报警，不要先落一条 band=OK 的假台账
            if (overMin) return new Outcome(EventType.ALARM, "LOW", "偏低", 0L);
            return recovery();
        }

        boolean stillLow = in.limitMin() != null
                && in.current() <= in.limitMin() + in.hysteresis();
        if (stillLow) return renotify(in, "LOW", "偏低");
        if (overMax) return new Outcome(EventType.ALARM, "HIGH", "偏高", 0L);
        return recovery();
    }

    private static Outcome renotify(Input in, String band, String direction) {
        if (in.renotifyIntervalMin() <= 0 || in.lastNotifiedAt() == null) return Outcome.NONE;
        long elapsed = Duration.between(in.lastNotifiedAt(), in.now()).toMinutes();
        if (elapsed < in.renotifyIntervalMin()) return Outcome.NONE;
        long sustained = in.streakStartedAt() == null ? 0L
                : Duration.between(in.streakStartedAt(), in.now()).toMinutes();
        return new Outcome(EventType.RENOTIFY, band, direction, sustained);
    }

    private static Outcome recovery() {
        return new Outcome(EventType.RECOVERY, "OK", "恢复", 0L);
    }
}
