package com.example.demo.modules.animalorder.engine;

import java.time.LocalTime;
import java.time.ZonedDateTime;

/**
 * In-memory models for {@link AnimalOrderTimeEngine} (spec §3.1).
 */
public final class AnimalOrderTimeModels {

    private AnimalOrderTimeModels() {
    }

    public record Policy(
            String defaultMode,
            String etaMode,
            int etaWorkdayOffset,
            Integer etaWeekday) {
    }

    /**
     * @param weekdays      Form A (WEEKLY): ISO 1–7 CSV; empty = every day (legacy DAILY)
     * @param startWeekday  Form B (WEEKLY_SPAN): start ISO weekday 1–7
     * @param endWeekday    Form B (WEEKLY_SPAN): end ISO weekday 1–7
     * @param dailyStartTime Form A daily start / Form B span start time
     * @param dailyEndTime   Form A daily end / Form B span end time
     */
    public record WindowRule(
            Long id,
            String scope,
            String categoryKey,
            String effect,
            String shape,
            String weekdays,
            Integer startWeekday,
            Integer endWeekday,
            LocalTime dailyStartTime,
            LocalTime dailyEndTime,
            ZonedDateTime rangeStartAt,
            ZonedDateTime rangeEndAt,
            String label,
            int sortOrder,
            int active) {
    }

    public record TimeSegment(ZonedDateTime startInclusive, ZonedDateTime endExclusive) {
    }

    public static Policy policy(String defaultMode, String etaMode, int offset, Integer weekday) {
        return new Policy(defaultMode, etaMode, offset, weekday);
    }

    /** All weekdays (legacy DAILY semantics). */
    public static WindowRule daily(
            String scope, String categoryKey, String effect, LocalTime start, LocalTime end) {
        return weekly(scope, categoryKey, effect, "1,2,3,4,5,6,7", start, end);
    }

    /** Form A: same clock window on each selected weekday. */
    public static WindowRule weekly(
            String scope,
            String categoryKey,
            String effect,
            String weekdays,
            LocalTime start,
            LocalTime end) {
        return new WindowRule(
                null, scope, categoryKey, effect, AnimalOrderTimeEngine.SHAPE_WEEKLY,
                weekdays, null, null, start, end, null, null, null, 0, 1);
    }

    /** Form B: continuous arc from (startDow, startTime) to (endDow, endTime) on a circular week. */
    public static WindowRule weeklySpan(
            String scope,
            String categoryKey,
            String effect,
            int startWeekday,
            LocalTime startTime,
            int endWeekday,
            LocalTime endTime) {
        return new WindowRule(
                null, scope, categoryKey, effect, AnimalOrderTimeEngine.SHAPE_WEEKLY_SPAN,
                null, startWeekday, endWeekday, startTime, endTime, null, null, null, 0, 1);
    }

    public static WindowRule range(
            String scope, String categoryKey, String effect, ZonedDateTime start, ZonedDateTime end) {
        return new WindowRule(
                null, scope, categoryKey, effect, AnimalOrderTimeEngine.SHAPE_RANGE,
                null, null, null, null, null, start, end, null, 0, 1);
    }
}
