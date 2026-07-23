package com.example.demo.common.time;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;

/**
 * 业务自然日窗口（默认 Asia/Shanghai 0:00～次日 0:00），供流水统计/雷达/房卡监控统一使用。
 */
@Component
public class BusinessTimeWindow {

    public static final DateTimeFormatter DATETIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final ZoneId zoneId;

    public BusinessTimeWindow(@Value("${app.business-timezone:Asia/Shanghai}") String timezone) {
        this.zoneId = ZoneId.of(timezone == null || timezone.isBlank() ? "Asia/Shanghai" : timezone.trim());
    }

    public ZoneId getZoneId() {
        return zoneId;
    }

    public LocalDate today() {
        return LocalDate.now(zoneId);
    }

    /** [startInclusive, endExclusive)，格式 yyyy-MM-dd HH:mm:ss */
    public Window todayWindow() {
        LocalDate day = today();
        LocalDateTime start = day.atStartOfDay();
        LocalDateTime end = day.plusDays(1).atStartOfDay();
        return new Window(start.format(DATETIME), end.format(DATETIME));
    }

    public record Window(String startInclusive, String endExclusive) {
    }

    /**
     * 格式化 {@link LocalDateTime} 为北京时间墙钟字符串。
     * JVM 默认时区已设为 Asia/Shanghai，MySQL JDBC serverTimezone=Asia/Shanghai，
     * 无需额外偏移，直接输出。
     */
    public static String toDisplayWallClock(LocalDateTime dt) {
        if (dt == null) {
            return null;
        }
        return dt.format(DATETIME);
    }
}
