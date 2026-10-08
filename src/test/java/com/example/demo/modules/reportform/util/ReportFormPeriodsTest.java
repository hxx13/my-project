package com.example.demo.modules.reportform.util;

import org.junit.jupiter.api.Test;
import java.time.LocalDate;
import static org.junit.jupiter.api.Assertions.*;

class ReportFormPeriodsTest {

    @Test
    void 日周期_键即日期() {
        assertEquals("2026-10-08",
                ReportFormPeriods.keyFor("daily", null, null, LocalDate.of(2026, 10, 8)));
    }

    @Test
    void 月周期_键到月_两位补零() {
        assertEquals("2026-10",
                ReportFormPeriods.keyFor("monthly", null, null, LocalDate.of(2026, 10, 8)));
        assertEquals("2026-01",
                ReportFormPeriods.keyFor("monthly", null, null, LocalDate.of(2026, 1, 31)));
    }

    @Test
    void 周周期_用ISO周_含跨年边界() {
        // 2026-01-01 是周四，ISO 周属于 2026-W01
        assertEquals("2026-W01",
                ReportFormPeriods.keyFor("weekly", null, null, LocalDate.of(2026, 1, 1)));
        // 2027-01-01 是周五，ISO 周仍属 2026-W53
        assertEquals("2026-W53",
                ReportFormPeriods.keyFor("weekly", null, null, LocalDate.of(2027, 1, 1)));
    }

    @Test
    void 手动周期_不产生键() {
        assertNull(ReportFormPeriods.keyFor("manual", null, null, LocalDate.of(2026, 10, 8)));
    }

    @Test
    void 是周期表_仅非manual才真() {
        assertTrue(ReportFormPeriods.isPeriodic("daily"));
        assertTrue(ReportFormPeriods.isPeriodic("weekly"));
        assertTrue(ReportFormPeriods.isPeriodic("monthly"));
        assertFalse(ReportFormPeriods.isPeriodic("manual"));
        assertFalse(ReportFormPeriods.isPeriodic(null));
    }

    @Test
    void 到期日_周看星期_月看号数且夹到月末() {
        // 周三(3)；2026-10-08 是周四 → 不匹配
        assertFalse(ReportFormPeriods.matchesDate("weekly", 3, null, LocalDate.of(2026, 10, 8)));
        assertTrue(ReportFormPeriods.matchesDate("weekly", 4, null, LocalDate.of(2026, 10, 8)));
        // 月 31 号在 2 月夹到 28
        assertTrue(ReportFormPeriods.matchesDate("monthly", null, 31, LocalDate.of(2026, 2, 28)));
        assertTrue(ReportFormPeriods.matchesDate("daily", null, null, LocalDate.of(2026, 2, 28)));
    }
}
