package com.example.demo.modules.animalorder.engine;

import com.example.demo.common.exception.ErrorCodeConstants;
import com.example.demo.common.exception.TwinBusinessException;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static com.example.demo.modules.animalorder.engine.AnimalOrderTimeModels.Policy;
import static com.example.demo.modules.animalorder.engine.AnimalOrderTimeModels.TimeSegment;
import static com.example.demo.modules.animalorder.engine.AnimalOrderTimeModels.WindowRule;

/**
 * Pure workday and purchase-window logic (spec §3.2–§3.6). No Spring dependencies.
 */
public class AnimalOrderTimeEngine {

    public static final String EFFECT_OPEN = "OPEN";
    public static final String EFFECT_DISABLE = "DISABLE";
    public static final String SHAPE_WEEKLY = "WEEKLY";
    /**
     * Cross-weekday continuous span on a circular week:
     * from (startWeekday, dailyStartTime) to (endWeekday, dailyEndTime).
     */
    public static final String SHAPE_WEEKLY_SPAN = "WEEKLY_SPAN";
    /** Legacy: treated as WEEKLY with all weekdays when weekdays empty. */
    public static final String SHAPE_DAILY = "DAILY";
    /** Legacy one-shot calendar range; not offered in new UI. */
    public static final String SHAPE_RANGE = "RANGE";
    private static final int MAX_PROBE_DAYS = 400;
    private static final long SECONDS_PER_DAY = 86_400L;

    private final Policy policy;
    private final List<WindowRule> allRules;
    private final Map<LocalDate, String> holidayMap;

    public AnimalOrderTimeEngine(
            Policy policy, List<WindowRule> allRules, Map<LocalDate, String> holidayMap) {
        this.policy = policy;
        this.allRules = allRules != null ? List.copyOf(allRules) : List.of();
        this.holidayMap = holidayMap != null ? holidayMap : Map.of();
    }

    /** Spec §3.2 */
    public static boolean isWorkday(LocalDate date, Map<LocalDate, String> holidayMap) {
        Map<LocalDate, String> map = holidayMap != null ? holidayMap : Map.of();
        String dayType = map.get(date);
        if ("HOLIDAY".equals(dayType)) {
            return false;
        }
        if ("WORKDAY_SHIFT".equals(dayType)) {
            return true;
        }
        DayOfWeek dow = date.getDayOfWeek();
        return dow != DayOfWeek.SATURDAY && dow != DayOfWeek.SUNDAY;
    }

    /** Spec §3.3 */
    public static List<WindowRule> selectRuleSet(String categoryKey, List<WindowRule> allRules) {
        List<WindowRule> rules = allRules != null ? allRules : List.of();
        if (categoryKey != null) {
            List<WindowRule> categoryRules = new ArrayList<>();
            for (WindowRule rule : rules) {
                if ("CATEGORY".equals(rule.scope()) && categoryKey.equals(rule.categoryKey())) {
                    categoryRules.add(rule);
                }
            }
            if (!categoryRules.isEmpty()) {
                return categoryRules;
            }
        }
        List<WindowRule> globalRules = new ArrayList<>();
        for (WindowRule rule : rules) {
            if ("GLOBAL".equals(rule.scope())) {
                globalRules.add(rule);
            }
        }
        return globalRules;
    }

    /**
     * Spec §3.4 —
     * WEEKLY/DAILY (Form A): selected weekdays + same daily clock window;
     * WEEKLY_SPAN (Form B): circular-week arc from (startDow,startTime) to (endDow,endTime);
     * RANGE is legacy absolute interval.
     */
    public static boolean ruleCoversInstant(WindowRule rule, ZonedDateTime instant) {
        if (SHAPE_WEEKLY.equals(rule.shape()) || SHAPE_DAILY.equals(rule.shape())) {
            if (!weekdayMatches(rule.weekdays(), instant.getDayOfWeek())) {
                return false;
            }
            LocalTime start = rule.dailyStartTime();
            LocalTime end = rule.dailyEndTime();
            if (start == null || end == null) {
                return false;
            }
            return dailyCovers(instant.toLocalTime(), start, end);
        }
        if (SHAPE_WEEKLY_SPAN.equals(rule.shape())) {
            Integer startDow = rule.startWeekday();
            Integer endDow = rule.endWeekday();
            LocalTime start = rule.dailyStartTime();
            LocalTime end = rule.dailyEndTime();
            if (startDow == null || endDow == null || start == null || end == null) {
                return false;
            }
            if (startDow < 1 || startDow > 7 || endDow < 1 || endDow > 7) {
                return false;
            }
            return weekSpanCovers(
                    startDow, start, endDow, end,
                    instant.getDayOfWeek().getValue(), instant.toLocalTime());
        }
        if (SHAPE_RANGE.equals(rule.shape())) {
            ZonedDateTime rangeStart = rule.rangeStartAt();
            ZonedDateTime rangeEnd = rule.rangeEndAt();
            if (rangeStart == null || rangeEnd == null) {
                return false;
            }
            return !instant.isBefore(rangeStart) && !instant.isAfter(rangeEnd);
        }
        return false;
    }

    /**
     * Circular week: instant is covered if it lies on the arc from (startDow,startTime)
     * to (endDow,endTime), inclusive. When start &gt; end in week-seconds, the arc wraps
     * across Sunday→Monday (e.g. Fri 17:00 → Mon 09:00).
     */
    static boolean weekSpanCovers(
            int startDow,
            LocalTime startTime,
            int endDow,
            LocalTime endTime,
            int instantDow,
            LocalTime instantTime) {
        long startSec = secondOfWeek(startDow, startTime);
        long endSec = secondOfWeek(endDow, endTime);
        long instantSec = secondOfWeek(instantDow, instantTime);
        if (startSec <= endSec) {
            return instantSec >= startSec && instantSec <= endSec;
        }
        return instantSec >= startSec || instantSec <= endSec;
    }

    /** Seconds from Monday 00:00:00 within a 7-day circular week (ISO dow 1=Mon … 7=Sun). */
    static long secondOfWeek(int isoDow, LocalTime time) {
        long dayOffset = (isoDow - 1L) * SECONDS_PER_DAY;
        return dayOffset + time.toSecondOfDay();
    }

    /**
     * Empty/null weekdays = every day (legacy DAILY). Otherwise ISO 1=Mon … 7=Sun comma list.
     */
    static boolean weekdayMatches(String weekdaysCsv, DayOfWeek dayOfWeek) {
        Set<Integer> days = parseWeekdays(weekdaysCsv);
        if (days.isEmpty()) {
            return true;
        }
        return days.contains(dayOfWeek.getValue());
    }

    static Set<Integer> parseWeekdays(String weekdaysCsv) {
        Set<Integer> days = new HashSet<>();
        if (weekdaysCsv == null || weekdaysCsv.isBlank()) {
            return days;
        }
        for (String part : weekdaysCsv.split(",")) {
            String trimmed = part.trim();
            if (trimmed.isEmpty()) {
                continue;
            }
            try {
                int v = Integer.parseInt(trimmed);
                if (v >= 1 && v <= 7) {
                    days.add(v);
                }
            } catch (NumberFormatException ignored) {
                // skip malformed token
            }
        }
        return days;
    }

    /** Spec §3.5 — returns {@code OPEN} or {@code CLOSED}. */
    public String effectiveEffectAt(ZonedDateTime instant, String categoryKey) {
        List<WindowRule> rules = selectRuleSet(categoryKey, allRules);
        boolean hasOpen = false;
        boolean hasDisable = false;
        for (WindowRule rule : rules) {
            if (!ruleCoversInstant(rule, instant)) {
                continue;
            }
            if (EFFECT_OPEN.equals(rule.effect())) {
                hasOpen = true;
            } else if (EFFECT_DISABLE.equals(rule.effect())) {
                hasDisable = true;
            }
        }
        if (hasOpen && hasDisable) {
            throw TwinBusinessException.of(
                    ErrorCodeConstants.ANIMAL_ORDER_WINDOW_CONFLICT, "时间窗口配置异常");
        }
        if (!hasOpen && !hasDisable) {
            return policy.defaultMode();
        }
        if (hasDisable) {
            return "CLOSED";
        }
        return EFFECT_OPEN;
    }

    /** Spec §3.6 */
    public boolean canOrder(ZonedDateTime orderAt, String categoryKey) {
        return EFFECT_OPEN.equals(effectiveEffectAt(orderAt, categoryKey));
    }

    /** Spec §3.7 — maximum continuous unavailable interval containing {@code instant}, or {@code null} if open. */
    public TimeSegment findUnavailableSegmentContaining(ZonedDateTime instant, String categoryKey) {
        if (canOrder(instant, categoryKey)) {
            return null;
        }
        ZonedDateTime pastLimit = instant.minusDays(MAX_PROBE_DAYS);
        ZonedDateTime startInclusive = instant;
        while (startInclusive.isAfter(pastLimit) && !canOrder(startInclusive.minusMinutes(1), categoryKey)) {
            startInclusive = startInclusive.minusMinutes(1);
        }
        ZonedDateTime futureLimit = instant.plusDays(MAX_PROBE_DAYS);
        ZonedDateTime endExclusive = instant;
        while (endExclusive.isBefore(futureLimit) && !canOrder(endExclusive.plusMinutes(1), categoryKey)) {
            endExclusive = endExclusive.plusMinutes(1);
        }
        return new TimeSegment(startInclusive, endExclusive.plusMinutes(1));
    }

    /** Spec §3.8 */
    public LocalDate estimateDelivery(ZonedDateTime orderAt, String categoryKey) {
        TimeSegment seg = findUnavailableSegmentContaining(orderAt, categoryKey);
        ZonedDateTime anchor = seg != null ? seg.endExclusive() : orderAt;
        LocalDate anchorDate = anchor.toLocalDate();

        if ("FIXED".equals(policy.etaMode())) {
            Integer weekday = policy.etaWeekday();
            if (weekday == null || weekday < 1 || weekday > 7) {
                throw TwinBusinessException.of(
                        ErrorCodeConstants.ANIMAL_ORDER_ETA_POLICY_INVALID, "固定送达星期未配置");
            }
            // Anchor calendar date (same as RELATIVE): unavailable segment end, else order instant.
            // Next ISO weekday strictly after anchor; same weekday → +7 days (never same calendar day).
            LocalDate weekdayDate = nextFixedWeekdayAfter(anchorDate, weekday);
            // If that weekday is not a workday (weekend/holiday), roll forward to next workday.
            return firstWorkdayOnOrAfter(weekdayDate);
        }

        LocalDate startWorkday = firstWorkdayOnOrAfter(anchorDate);
        return advanceWorkdays(startWorkday, policy.etaWorkdayOffset());
    }

    /** Probe minute-by-minute up to {@value #MAX_PROBE_DAYS} days for the first open instant at or after {@code from}. */
    public ZonedDateTime findNextOpenAt(ZonedDateTime from, String categoryKey) {
        ZonedDateTime limit = from.plusDays(MAX_PROBE_DAYS);
        ZonedDateTime cursor = from;
        while (!cursor.isAfter(limit)) {
            if (canOrder(cursor, categoryKey)) {
                return cursor;
            }
            cursor = cursor.plusMinutes(1);
        }
        return null;
    }

    private LocalDate firstWorkdayOnOrAfter(LocalDate date) {
        LocalDate cursor = date;
        while (!isWorkday(cursor, holidayMap)) {
            cursor = cursor.plusDays(1);
        }
        return cursor;
    }

    /**
     * FIXED mode: first calendar occurrence of {@code isoWeekday} (1=Mon … 7=Sun) strictly after
     * {@code anchorDate}. When anchor already falls on that weekday, returns the same weekday next week (+7).
     */
    private static LocalDate nextFixedWeekdayAfter(LocalDate anchorDate, int isoWeekday) {
        int anchorWeekday = anchorDate.getDayOfWeek().getValue();
        int daysUntil = (isoWeekday - anchorWeekday + 7) % 7;
        if (daysUntil == 0) {
            daysUntil = 7;
        }
        return anchorDate.plusDays(daysUntil);
    }

    private LocalDate advanceWorkdays(LocalDate start, int workdays) {
        LocalDate cursor = start;
        for (int i = 0; i < workdays; i++) {
            cursor = cursor.plusDays(1);
            while (!isWorkday(cursor, holidayMap)) {
                cursor = cursor.plusDays(1);
            }
        }
        return cursor;
    }

    private static boolean dailyCovers(LocalTime t, LocalTime start, LocalTime end) {
        if (start.compareTo(end) <= 0) {
            return !t.isBefore(start) && !t.isAfter(end);
        }
        return !t.isBefore(start) || !t.isAfter(end);
    }
}
