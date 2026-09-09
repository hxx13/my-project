package com.example.demo.modules.asset.service;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** 拖拽改地点前的在途转移拦截：纯函数契约 */
class AssetMoveGuardTest {

    @Test
    void nullOrZeroCountsAreNotInFlight() {
        assertFalse(AssetService.hasInFlightTransfer(null));
        assertFalse(AssetService.hasInFlightTransfer(0));
    }

    @Test
    void positiveCountIsInFlight() {
        assertTrue(AssetService.hasInFlightTransfer(1));
        assertTrue(AssetService.hasInFlightTransfer(3));
    }

    @Test
    void guardThrowsWithActionableMessage() {
        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class,
                () -> AssetService.assertNoInFlightTransfer(2));
        assertEquals("该资产有进行中的转移申请，请先完成或撤回", ex.getMessage());
    }

    @Test
    void guardPassesWhenNothingInFlight() {
        AssetService.assertNoInFlightTransfer(null);
        AssetService.assertNoInFlightTransfer(0);
    }
}
