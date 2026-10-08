package com.example.demo.modules.reportform.util;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.temporal.WeekFields;

/**
 * 报表周期键：把「每日/每周/每月」映射成一个可存进 {@code instance_label} 的字符串键。
 *
 * <p>键格式：daily = {@code YYYY-MM-DD}、weekly = ISO {@code YYYY-Www}、monthly = {@code YYYY-MM}。
 * 用 ISO 周（周一到周日、跨年按 ISO 规则），避免「12月31日属于下一年的第1周」这类歧义。
 *
 * <p>为什么复用 {@code instance_label} 而不加列：加列要付双 SQL 迁移 + 启动链注册的代价，
 * 而周期键恰好就是"这一份叫什么"，与子文件名的语义同构。
 */
public final class ReportFormPeriods {

    private static final WeekFields ISO = WeekFields.ISO;
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    private static final DateTimeFormatter MONTH = DateTimeFormatter.ofPattern("yyyy-MM");

    private ReportFormPeriods() {}

    public static boolean isPeriodic(String period) {
        return "daily".equals(period) || "weekly".equals(period) || "monthly".equals(period);
    }

    /** 周期键；manual/未知返回 null。 */
    public static String keyFor(String period, Integer dayOfWeek, Integer dayOfMonth, LocalDate date) {
        if (date == null || period == null) return null;
        return switch (period) {
            case "daily" -> DAY.format(date);
            case "weekly" -> {
                int week = date.get(ISO.weekOfWeekBasedYear());
                int year = date.get(ISO.weekBasedYear());
                yield String.format("%d-W%02d", year, week);
            }
            case "monthly" -> MONTH.format(date);
            default -> null;
        };
    }

    /** 今天是否是该周期的「到点日」。 */
    public static boolean matchesDate(String period, Integer dayOfWeek, Integer dayOfMonth, LocalDate date) {
        if (date == null || period == null) return false;
        return switch (period) {
            case "daily" -> true;
            case "weekly" -> date.getDayOfWeek().getValue() == (dayOfWeek == null ? 1 : dayOfWeek);
            case "monthly" -> {
                int want = dayOfMonth == null ? 1 : dayOfMonth;
                yield date.getDayOfMonth() == Math.min(want, date.lengthOfMonth());
            }
            default -> false;
        };
    }
}
