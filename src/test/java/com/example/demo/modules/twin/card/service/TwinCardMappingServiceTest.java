package com.example.demo.modules.twin.card.service;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 豁免到期时间的换算 —— 特别是「到 24:00」这一档。
 */
class TwinCardMappingServiceTest {

    private final TwinCardMappingService service = new TwinCardMappingService();

    @Test
    @DisplayName("「到 24:00」按当天最后一刻算，不能判成「时点已过」")
    void midnightMeansEndOfDay() {
        // 真机 2026-10-13：免冻的时长档里就有「到 24:00（今晚）」，用户点它**必失败** ——
        // LocalTime.parse("24:00") 在 SMART 解析下落到当天 00:00，随后被判「所选时点已过」，
        // 报的还是句看不出所以然的话。它想说的是「今晚有效到零点」。
        String at = service.computeExemptExpireAtUntil("24:00");
        assertTrue(at.startsWith(LocalDate.now().toString()), at);
        assertTrue(at.contains("23:59"), at);
    }

    @Test
    @DisplayName("格式不对仍旧拒绝（别把「abc」也当成到点）")
    void badFormatStillRejected() {
        assertThrows(IllegalArgumentException.class, () -> service.computeExemptExpireAtUntil("abc"));
        assertThrows(IllegalArgumentException.class, () -> service.computeExemptExpireAtUntil(""));
    }
}
