package com.example.demo.modules.twin.scan.state;

import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

class ScanOccupancyStateServiceTest {

    @Test
    void buildInside_setsStateAndRoomFields() {
        LocalDateTime now = LocalDateTime.now();
        ScanOccupancyState row = ScanOccupancyStateService.buildInside("u1", "room1", "601A", "LOCAL-xxx", now);

        assertEquals("INSIDE", row.getState());
        assertEquals("room1", row.getCurrentRoomId());
        assertEquals("601A", row.getCurrentRoomName());
        assertEquals("LOCAL-xxx", row.getEnterLogId());
        assertEquals("u1", row.getUserId());
        assertNotNull(row.getUpdatedAt());
    }

    @Test
    void buildOutside_clearsRoomFields() {
        LocalDateTime now = LocalDateTime.now();
        ScanOccupancyState row = ScanOccupancyStateService.buildOutside("u1", now);

        assertEquals("OUTSIDE", row.getState());
        assertNull(row.getCurrentRoomId());
        assertNull(row.getCurrentRoomName());
        assertNull(row.getEnterLogId());
        assertEquals("u1", row.getUserId());
        assertNotNull(row.getUpdatedAt());
    }

    @Test
    void constants_holdExpectedValues() {
        assertEquals("INSIDE", ScanOccupancyStateService.STATE_INSIDE);
        assertEquals("OUTSIDE", ScanOccupancyStateService.STATE_OUTSIDE);
    }
}
