package com.example.demo.modules.twin.common.util;

import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.regex.Pattern;

/**
 * 自动审批规则 schedule_cron：UI 为「每天 HH:mm」，存为 {@code 0 分 时 * * *}。
 * 旧版间隔类 Cron（含 *）在任务触发时仍视为「每次任务都执行」。
 */
public final class AutoApproveScheduleMatcher {

    private static final Pattern DAILY = Pattern.compile("^0\\s+(\\d{1,2})\\s+(\\d{1,2})\\s+\\*\\s+\\*\\s+\\*$");

    private AutoApproveScheduleMatcher() {}

    public static String normalizeDailyCron(String scheduleCron) {
        if (!StringUtils.hasText(scheduleCron)) {
            return "0 0 9 * * *";
        }
        String trimmed = scheduleCron.trim();
        var m = DAILY.matcher(trimmed);
        if (m.matches()) {
            int minute = clamp(Integer.parseInt(m.group(1)), 0, 59);
            int hour = clamp(Integer.parseInt(m.group(2)), 0, 23);
            return String.format("0 %d %d * * *", minute, hour);
        }
        if (trimmed.contains("*") || trimmed.contains("/")) {
            return trimmed;
        }
        return "0 0 9 * * *";
    }

    public static boolean matchesNow(String scheduleCron, LocalDateTime now) {
        if (now == null) {
            return false;
        }
        if (!StringUtils.hasText(scheduleCron)) {
            return true;
        }
        String trimmed = scheduleCron.trim();
        var m = DAILY.matcher(trimmed);
        if (m.matches()) {
            int minute = Integer.parseInt(m.group(1));
            int hour = Integer.parseInt(m.group(2));
            return now.getHour() == hour && now.getMinute() == minute;
        }
        if (trimmed.contains("*/15")) {
            return now.getMinute() % 15 == 0;
        }
        if (trimmed.contains("*/30")) {
            return now.getMinute() % 30 == 0;
        }
        if (trimmed.matches("0\\s+0\\s+\\*\\s+\\*\\s+\\*")) {
            return now.getMinute() == 0;
        }
        return true;
    }

    public static String dailyTimeLabel(String scheduleCron) {
        if (!StringUtils.hasText(scheduleCron)) {
            return "每天 09:00";
        }
        var m = DAILY.matcher(scheduleCron.trim());
        if (m.matches()) {
            return String.format("每天 %02d:%02d", Integer.parseInt(m.group(2)), Integer.parseInt(m.group(1)));
        }
        return scheduleCron.trim();
    }

    private static int clamp(int v, int min, int max) {
        return Math.max(min, Math.min(max, v));
    }
}
