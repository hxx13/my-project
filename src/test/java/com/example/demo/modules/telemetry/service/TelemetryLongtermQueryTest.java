package com.example.demo.modules.telemetry.service;

import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * 按月筛选的区间换算：`2026-10` 必须是 [10-01 00:00:00, 10-31 23:59:59.999]，
 * 不能只算到月初 —— 差一天就是「用户说这个月、结果少了最后几天」。
 */
class TelemetryLongtermQueryTest {

    @Test
    void monthRangeCoversWholeMonth() {
        LocalDateTime[] r = TelemetryLongtermArchiveService.monthRange("2026-10");
        assertEquals(LocalDateTime.of(2026, 10, 1, 0, 0, 0), r[0]);
        assertEquals(LocalDateTime.of(2026, 10, 31, 23, 59, 59, 999_000_000), r[1]);
    }

    @Test
    void februaryLeapYearIsHandled() {
        LocalDateTime[] r = TelemetryLongtermArchiveService.monthRange("2028-02");
        assertEquals(LocalDateTime.of(2028, 2, 29, 23, 59, 59, 999_000_000), r[1]);
    }

    @Test
    void blankOrInvalidMonthMeansNoRange() {
        assertNull(TelemetryLongtermArchiveService.monthRange(null));
        assertNull(TelemetryLongtermArchiveService.monthRange("  "));
        assertNull(TelemetryLongtermArchiveService.monthRange("2026"));
        assertNull(TelemetryLongtermArchiveService.monthRange("2026-13"));
    }
}
