package com.example.demo.modules.twin.dashboard.service;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class StrandedCampusFilterTest {
    @Test
    void bothEnabled_noFilter() {
        assertTrue(StrandedViolationService.campusPatterns(true, true).isEmpty());
    }

    @Test
    void onlyPudong() {
        assertEquals(List.of("%浦东%"), StrandedViolationService.campusPatterns(true, false));
    }

    @Test
    void onlyPuxi() {
        assertEquals(List.of("%浦西%"), StrandedViolationService.campusPatterns(false, true));
    }

    @Test
    void bothDisabled_returnsNullMarker() {
        assertNull(StrandedViolationService.campusPatterns(false, false));
    }
}
