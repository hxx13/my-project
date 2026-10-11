package com.example.demo.modules.accessfusion.service;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 「查不到数据」那条诊断日志的限流。
 *
 * <p>它挡的是**刷屏**，不是错误 —— 挡太狠会连排查用的线索一起丢掉，挡不住等于没改。
 * 所以窗口边界、参数隔离、表不能无界长，三样都钉住。
 */
class AccessCleanPackageAnalyticsServiceTest {

    private static final long INTERVAL = 10 * 60 * 1000L;

    @Test
    @DisplayName("同一组参数在窗口内只放一条，过了窗口再放")
    void throttlesSameKeyWithinWindow() {
        Map<String, Long> table = new HashMap<>();

        assertTrue(AccessCleanPackageAnalyticsService.throttleOk(table, "k", 1_000, INTERVAL, 100));
        assertFalse(AccessCleanPackageAnalyticsService.throttleOk(table, "k", 2_000, INTERVAL, 100),
                "窗口内第二次要挡掉（这就是刷屏的那一次）");
        assertFalse(AccessCleanPackageAnalyticsService.throttleOk(table, "k", 1_000 + INTERVAL - 1, INTERVAL, 100));
        assertTrue(AccessCleanPackageAnalyticsService.throttleOk(table, "k", 1_000 + INTERVAL, INTERVAL, 100),
                "正好到窗口边界要放行");
    }

    @Test
    @DisplayName("不同参数互不影响 —— 换个通道该打还是要打")
    void differentKeysAreIndependent() {
        Map<String, Long> table = new HashMap<>();
        assertTrue(AccessCleanPackageAnalyticsService.throttleOk(table, "a|b|大厅", 1_000, INTERVAL, 100));
        assertTrue(AccessCleanPackageAnalyticsService.throttleOk(table, "a|b|监控室", 1_000, INTERVAL, 100),
                "另一个通道没打过，不该被前一个挡住");
    }

    @Test
    @DisplayName("指纹表不许无界增长 —— 超过上限就整体收缩，最多比上限多一条")
    void tableDoesNotGrowUnbounded() {
        int maxKeys = 3;
        Map<String, Long> table = new HashMap<>();
        for (int i = 0; i < 50; i++) {
            AccessCleanPackageAnalyticsService.throttleOk(table, "k" + i, 1_000, INTERVAL, maxKeys);
        }
        // 判据是**有界**，不是「正好剩几条」：每次超限清空后又会长回来，所以在上限附近来回
        assertTrue(table.size() <= maxKeys + 1,
                "表应被收缩到 " + (maxKeys + 1) + " 以内，实际 " + table.size() + " 条");
    }
}
