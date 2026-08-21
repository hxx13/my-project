package com.example.demo.modules.animalorder.engine;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AnimalOrderTimeEngineTest {

    private static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");

    @Test
    void isWorkday_weekendWithoutHoliday_false() {
        Map<LocalDate, String> holidays = Map.of();
        assertFalse(AnimalOrderTimeEngine.isWorkday(LocalDate.of(2026, 8, 22), holidays)); // Saturday
    }

    @Test
    void isWorkday_workdayShiftOnSunday_true() {
        Map<LocalDate, String> holidays = Map.of(LocalDate.of(2026, 8, 23), "WORKDAY_SHIFT");
        assertTrue(AnimalOrderTimeEngine.isWorkday(LocalDate.of(2026, 8, 23), holidays));
    }

    @Test
    void defaultClosed_noRules_alwaysCannotOrder() {
        var policy = AnimalOrderTimeModels.policy("CLOSED", "RELATIVE", 3, null);
        var engine = new AnimalOrderTimeEngine(policy, List.of(), Map.of());
        var at = ZonedDateTime.of(2026, 8, 21, 10, 0, 0, 0, ZONE);
        assertFalse(engine.canOrder(at, null));
    }

    @Test
    void dailyOpen_whitelist_allowsInsideWindow() {
        var rule = AnimalOrderTimeModels.daily("GLOBAL", null, "OPEN",
                LocalTime.of(9, 0), LocalTime.of(17, 0));
        var engine = new AnimalOrderTimeEngine(
                AnimalOrderTimeModels.policy("CLOSED", "RELATIVE", 3, null),
                List.of(rule), Map.of());
        var at = ZonedDateTime.of(2026, 8, 21, 10, 0, 0, 0, ZONE); // Monday
        assertTrue(engine.canOrder(at, null));
    }

    @Test
    void relativeOffsetZero_fridayOrder_sameFriday() {
        var engine = new AnimalOrderTimeEngine(
                AnimalOrderTimeModels.policy("OPEN", "RELATIVE", 0, null),
                List.of(), Map.of());
        var friday = ZonedDateTime.of(2026, 8, 21, 10, 0, 0, 0, ZONE);
        assertEquals(LocalDate.of(2026, 8, 21), engine.estimateDelivery(friday, null));
    }

    @Test
    void relativeOffsetZero_saturdayOrder_nextMonday() {
        var engine = new AnimalOrderTimeEngine(
                AnimalOrderTimeModels.policy("OPEN", "RELATIVE", 0, null),
                List.of(), Map.of());
        var saturday = ZonedDateTime.of(2026, 8, 22, 10, 0, 0, 0, ZONE);
        assertEquals(LocalDate.of(2026, 8, 24), engine.estimateDelivery(saturday, null));
    }

    @Test
    void fixedWeekday_monOrder_wedDelivery_thisWeek() {
        var engine = new AnimalOrderTimeEngine(
                AnimalOrderTimeModels.policy("OPEN", "FIXED", 0, 3),
                List.of(), Map.of());
        var monday = ZonedDateTime.of(2026, 8, 24, 10, 0, 0, 0, ZONE);
        assertEquals(LocalDate.of(2026, 8, 26), engine.estimateDelivery(monday, null));
    }

    @Test
    void fixedWeekday_wedOrder_wedDelivery_nextWeek() {
        var engine = new AnimalOrderTimeEngine(
                AnimalOrderTimeModels.policy("OPEN", "FIXED", 0, 3),
                List.of(), Map.of());
        var wednesday = ZonedDateTime.of(2026, 8, 26, 10, 0, 0, 0, ZONE);
        assertEquals(LocalDate.of(2026, 9, 2), engine.estimateDelivery(wednesday, null));
    }

    @Test
    void fixedWeekday_targetHoliday_rollsToNextWorkday() {
        Map<LocalDate, String> holidays = Map.of(LocalDate.of(2026, 8, 26), "HOLIDAY");
        var engine = new AnimalOrderTimeEngine(
                AnimalOrderTimeModels.policy("OPEN", "FIXED", 0, 3),
                List.of(), holidays);
        var monday = ZonedDateTime.of(2026, 8, 24, 10, 0, 0, 0, ZONE);
        assertEquals(LocalDate.of(2026, 8, 27), engine.estimateDelivery(monday, null));
    }

    @Test
    void weeklyOpen_onlySelectedWeekdays() {
        var rule = AnimalOrderTimeModels.weekly(
                "GLOBAL", null, "OPEN", "1,3,5", LocalTime.of(9, 0), LocalTime.of(17, 0));
        var engine = new AnimalOrderTimeEngine(
                AnimalOrderTimeModels.policy("CLOSED", "RELATIVE", 3, null),
                List.of(rule), Map.of());
        // 2026-08-21 Friday (5) 10:00 → open
        assertTrue(engine.canOrder(ZonedDateTime.of(2026, 8, 21, 10, 0, 0, 0, ZONE), null));
        // 2026-08-24 Monday (1) 10:00 → open
        assertTrue(engine.canOrder(ZonedDateTime.of(2026, 8, 24, 10, 0, 0, 0, ZONE), null));
        // 2026-08-25 Tuesday (2) 10:00 → closed
        assertFalse(engine.canOrder(ZonedDateTime.of(2026, 8, 25, 10, 0, 0, 0, ZONE), null));
        // Friday but outside time → closed
        assertFalse(engine.canOrder(ZonedDateTime.of(2026, 8, 21, 8, 0, 0, 0, ZONE), null));
    }

    @Test
    void weeklySpan_mon1700_to_wed0900_coversMidArc() {
        // Form B: Monday 17:00 → Wednesday 09:00 (continuous)
        var rule = AnimalOrderTimeModels.weeklySpan(
                "GLOBAL", null, "OPEN",
                1, LocalTime.of(17, 0),
                3, LocalTime.of(9, 0));
        var engine = new AnimalOrderTimeEngine(
                AnimalOrderTimeModels.policy("CLOSED", "RELATIVE", 3, null),
                List.of(rule), Map.of());
        // Mon 16:59 → outside
        assertFalse(engine.canOrder(ZonedDateTime.of(2026, 8, 24, 16, 59, 0, 0, ZONE), null));
        // Mon 17:00 → open
        assertTrue(engine.canOrder(ZonedDateTime.of(2026, 8, 24, 17, 0, 0, 0, ZONE), null));
        // Tue all day → open
        assertTrue(engine.canOrder(ZonedDateTime.of(2026, 8, 25, 12, 0, 0, 0, ZONE), null));
        // Wed 09:00 → open
        assertTrue(engine.canOrder(ZonedDateTime.of(2026, 8, 26, 9, 0, 0, 0, ZONE), null));
        // Wed 09:01 → closed
        assertFalse(engine.canOrder(ZonedDateTime.of(2026, 8, 26, 9, 1, 0, 0, ZONE), null));
        // Thu → closed
        assertFalse(engine.canOrder(ZonedDateTime.of(2026, 8, 27, 10, 0, 0, 0, ZONE), null));
    }

    @Test
    void weeklySpan_fri1700_to_mon0900_wrapsWeek() {
        // Form B wrapping Sunday→Monday: Fri 17:00 → Mon 09:00
        var rule = AnimalOrderTimeModels.weeklySpan(
                "GLOBAL", null, "OPEN",
                5, LocalTime.of(17, 0),
                1, LocalTime.of(9, 0));
        var engine = new AnimalOrderTimeEngine(
                AnimalOrderTimeModels.policy("CLOSED", "RELATIVE", 3, null),
                List.of(rule), Map.of());
        // Fri 17:00 → open
        assertTrue(engine.canOrder(ZonedDateTime.of(2026, 8, 21, 17, 0, 0, 0, ZONE), null));
        // Sat → open
        assertTrue(engine.canOrder(ZonedDateTime.of(2026, 8, 22, 12, 0, 0, 0, ZONE), null));
        // Sun → open
        assertTrue(engine.canOrder(ZonedDateTime.of(2026, 8, 23, 12, 0, 0, 0, ZONE), null));
        // Mon 09:00 → open
        assertTrue(engine.canOrder(ZonedDateTime.of(2026, 8, 24, 9, 0, 0, 0, ZONE), null));
        // Mon 09:01 → closed
        assertFalse(engine.canOrder(ZonedDateTime.of(2026, 8, 24, 9, 1, 0, 0, ZONE), null));
        // Wed mid-week → closed
        assertFalse(engine.canOrder(ZonedDateTime.of(2026, 8, 26, 12, 0, 0, 0, ZONE), null));
    }

    @Test
    void categoryRules_replaceGlobal() {
        var globalDisable = AnimalOrderTimeModels.daily("GLOBAL", null, "DISABLE",
                LocalTime.of(0, 0), LocalTime.of(23, 59));
        var categoryOpen = AnimalOrderTimeModels.daily("CATEGORY", "42", "OPEN",
                LocalTime.of(9, 0), LocalTime.of(17, 0));
        var engine = new AnimalOrderTimeEngine(
                AnimalOrderTimeModels.policy("CLOSED", "RELATIVE", 0, null),
                List.of(globalDisable, categoryOpen), Map.of());
        var at = ZonedDateTime.of(2026, 8, 21, 10, 0, 0, 0, ZONE);
        assertTrue(engine.canOrder(at, "42"));
        assertFalse(engine.canOrder(at, "99"));
    }
}
