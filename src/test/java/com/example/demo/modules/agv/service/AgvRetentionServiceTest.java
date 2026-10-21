package com.example.demo.modules.agv.service;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** 分区只能整月丢：整个分区都早于 cutoff 才允许 DROP。 */
class AgvRetentionServiceTest {

    @Test
    void dropOnlyWhenWholePartitionIsBeforeCutoff() {
        // boundary 是「不含」上界：p202608 的上界是 9/1，最后一天是 8/31
        LocalDate augBoundary = LocalDate.of(2026, 9, 1);
        LocalDate sepBoundary = LocalDate.of(2026, 10, 1);

        // 9/19 为 cutoff：8 月整月已过期；9 月还有 9/20~9/30 在保留期内
        assertTrue(AgvRetentionService.isPartitionExpired(augBoundary, LocalDate.of(2026, 9, 19)));
        assertFalse(AgvRetentionService.isPartitionExpired(sepBoundary, LocalDate.of(2026, 9, 19)));

        // cutoff 一过 9/30，9 月也可整月丢
        assertTrue(AgvRetentionService.isPartitionExpired(sepBoundary, LocalDate.of(2026, 10, 1)));
    }
}
