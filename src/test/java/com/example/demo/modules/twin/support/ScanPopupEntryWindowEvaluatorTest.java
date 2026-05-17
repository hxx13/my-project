package com.example.demo.modules.twin.support;

import org.junit.jupiter.api.Test;

import java.time.LocalTime;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ScanPopupEntryWindowEvaluatorTest {

    @Test
    void disabledConfig_alwaysAllows() {
        assertTrue(ScanPopupEntryWindowEvaluator.isExecuteAllowedNow(Map.of(), null));
    }

    @Test
    void enabledWithoutBands_denies() {
        Map<String, Object> cfg = Map.of("scanPopupEntryWindowEnabled", true);
        assertFalse(ScanPopupEntryWindowEvaluator.isExecuteAllowedNow(cfg, null));
    }

    @Test
    void withinSameDayBand_allows() {
        assertTrue(ScanPopupEntryWindowEvaluator.withinBand(
                LocalTime.of(10, 0),
                LocalTime.of(9, 0),
                LocalTime.of(18, 0)));
    }

    @Test
    void overnightBand_allowsLateNight() {
        assertTrue(ScanPopupEntryWindowEvaluator.withinBand(
                LocalTime.of(23, 30),
                LocalTime.of(22, 0),
                LocalTime.of(6, 0)));
    }

    @Test
    void enabledWithValidBand_allowsWhenInWindow() {
        Map<String, Object> cfg = Map.of(
                "scanPopupEntryWindowEnabled", true,
                "scanPopupEntryWindows", List.of(Map.of("startHm", "0:00", "endHm", "23:59"))
        );
        assertTrue(ScanPopupEntryWindowEvaluator.isExecuteAllowedNow(cfg, null));
    }
}
