package com.example.demo.modules.accessfusion.support;

import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

/** 将清洗时间窗按自然日切分，避免跨多日一次合并触发预览上限导致漏数。 */
public final class AccessCleanDaySplitSupport {

    private static final DateTimeFormatter DT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private AccessCleanDaySplitSupport() {}

    public record DayWindow(String coverageDay, String windowStart, String windowEnd) {}

    public static List<DayWindow> split(String startTime, String endTime) {
        LocalDateTime start = parse(startTime);
        LocalDateTime end = parse(endTime);
        if (start == null || end == null || !end.isAfter(start)) {
            return List.of();
        }
        List<DayWindow> out = new ArrayList<>();
        LocalDate d = start.toLocalDate();
        LocalDate endDate = end.toLocalDate();
        while (!d.isAfter(endDate)) {
            LocalDateTime dayStart =
                    d.equals(start.toLocalDate())
                            ? start
                            : d.atStartOfDay();
            LocalDateTime dayEnd =
                    d.equals(end.toLocalDate())
                            ? end
                            : d.atTime(23, 59, 59);
            if (dayEnd.isAfter(dayStart)) {
                out.add(
                        new DayWindow(
                                d.toString(),
                                dayStart.format(DT),
                                dayEnd.format(DT)));
            }
            d = d.plusDays(1);
        }
        return out;
    }

    private static LocalDateTime parse(String text) {
        if (!StringUtils.hasText(text)) {
            return null;
        }
        String s = text.trim().replace("T", " ");
        if (s.length() == 10) {
            s = s + " 00:00:00";
        } else if (s.length() == 16) {
            s = s + ":00";
        }
        try {
            return LocalDateTime.parse(s, DT);
        } catch (Exception e) {
            return null;
        }
    }
}
