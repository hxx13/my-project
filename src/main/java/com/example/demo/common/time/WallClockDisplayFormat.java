package com.example.demo.common.time;

import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;

/**
 * API / 导出层统一将 JDBC/MyBatis 读出的时间值格式化为北京时间墙钟字符串。
 */
public final class WallClockDisplayFormat {

    private static final DateTimeFormatter WALL_CLOCK = BusinessTimeWindow.DATETIME;

    private WallClockDisplayFormat() {
    }

    public static String fromLocalDateTime(LocalDateTime dt) {
        return BusinessTimeWindow.toDisplayWallClock(dt);
    }

    /** MyBatis HashMap / 动态行中的 DATETIME 列归一化 */
    public static String fromJdbcValue(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof LocalDateTime ldt) {
            return fromLocalDateTime(ldt);
        }
        if (value instanceof Timestamp ts) {
            return fromLocalDateTime(ts.toLocalDateTime());
        }
        if (value instanceof java.util.Date d) {
            return fromLocalDateTime(LocalDateTime.ofInstant(d.toInstant(), ZoneId.of("Asia/Shanghai")));
        }
        String s = String.valueOf(value).trim();
        if (s.isEmpty()) {
            return null;
        }
        if (s.length() >= 19 && s.charAt(10) == 'T') {
            try {
                return LocalDateTime.parse(s.substring(0, 19), DateTimeFormatter.ISO_LOCAL_DATE_TIME).format(WALL_CLOCK);
            } catch (DateTimeParseException ignored) {
                // fall through
            }
        }
        if (s.length() >= 19 && s.charAt(10) == ' ') {
            return s.substring(0, 19);
        }
        return s;
    }

    public static void normalizeMapDateTimeKeys(java.util.Map<String, Object> row, String... keys) {
        if (row == null || keys == null) {
            return;
        }
        for (String key : keys) {
            if (!row.containsKey(key)) {
                continue;
            }
            Object raw = row.get(key);
            if (raw == null) {
                continue;
            }
            String formatted = fromJdbcValue(raw);
            if (formatted != null) {
                row.put(key, formatted);
            }
        }
    }
}
