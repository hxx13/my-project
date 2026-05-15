package com.example.demo.modules.twin.support;

import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Map;

/**
 * 门禁联动配置中的「扫码弹窗入口时段」：启用后仅在配置的 HH:mm 时段内允许 Web 扫码执行进/出。
 */
public final class ScanPopupEntryWindowEvaluator {

    private static final DateTimeFormatter HM = DateTimeFormatter.ofPattern("H:mm");

    private ScanPopupEntryWindowEvaluator() {
    }

    public static boolean isWindowEnabled(Map<String, Object> cfg) {
        return toBool(cfg != null ? cfg.get("scanPopupEntryWindowEnabled") : null);
    }

    /**
     * 未启用时不限制。
     * 启用后须至少配置一个合法 HH:mm 时段；当前时间须落入任一时段，否则禁止执行扫码进/出。
     */
    public static boolean isExecuteAllowedNow(Map<String, Object> cfg, ZoneId zone) {
        if (!isWindowEnabled(cfg)) {
            return true;
        }
        List<?> bands = extractBands(cfg);
        if (bands == null || bands.isEmpty()) {
            return false;
        }
        LocalTime now = ZonedDateTime.now(zone != null ? zone : ZoneId.systemDefault()).toLocalTime();
        for (Object row : bands) {
            if (!(row instanceof Map<?, ?> m)) {
                continue;
            }
            LocalTime start = parseHm(m.get("startHm"));
            LocalTime end = parseHm(m.get("endHm"));
            if (start == null || end == null) {
                continue;
            }
            if (withinBand(now, start, end)) {
                return true;
            }
        }
        // 已启用且存在至少一条合法时段配置时：未落入任一时段须禁止执行（此前误写为 return anyParsed，导致「永远允许」）
        return false;
    }

    @SuppressWarnings("unchecked")
    private static List<?> extractBands(Map<String, Object> cfg) {
        Object raw = cfg.get("scanPopupEntryWindows");
        if (raw instanceof List<?> list) {
            return list;
        }
        return null;
    }

    static boolean withinBand(LocalTime now, LocalTime start, LocalTime end) {
        if (!start.isAfter(end)) {
            return !now.isBefore(start) && !now.isAfter(end);
        }
        return !now.isBefore(start) || !now.isAfter(end);
    }

    private static LocalTime parseHm(Object v) {
        if (v == null) {
            return null;
        }
        String s = String.valueOf(v).trim();
        if (s.isEmpty()) {
            return null;
        }
        try {
            return LocalTime.parse(s, HM);
        } catch (DateTimeParseException e) {
            try {
                return LocalTime.parse(s, DateTimeFormatter.ofPattern("HH:mm"));
            } catch (DateTimeParseException e2) {
                return null;
            }
        }
    }

    private static boolean toBool(Object v) {
        if (v instanceof Boolean b) {
            return b;
        }
        if (v instanceof Number n) {
            return n.intValue() != 0;
        }
        if (v != null) {
            String s = v.toString().trim().toLowerCase();
            return "1".equals(s) || "true".equals(s) || "yes".equals(s);
        }
        return false;
    }
}
