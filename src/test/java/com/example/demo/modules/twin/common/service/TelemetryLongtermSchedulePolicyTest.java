package com.example.demo.modules.twin.common.service;

import com.example.demo.modules.twin.common.entity.TwinJobScheduleConfig;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 长期归档任务的调度口径。两处会**静默**把 2 小时压成 1 小时 / 变成一天一次：
 *   ① 不挂进「窗口内轮询」集合 → 走「窗口内整分命中」老路，pollIntervalSeconds 被完全忽略，一天只跑一次；
 *   ② clampPollInterval 对非窗口轮询类上限 3600。
 * 这个测试就是钉这两条 —— 它们不影响编译、不影响别的测试，只在真机上表现为「配了 2 小时却每小时跑」。
 */
class TelemetryLongtermSchedulePolicyTest {

    private static final String KEY = JobExecutionRegistry.JOB_TELEMETRY_LONGTERM_SAMPLE;

    @Test
    void longtermJobIsPollInWindowSoIntervalIsHonored() {
        assertTrue(JobSchedulePolicy.isPollInWindow(KEY),
                "必须挂进窗口内轮询，否则 pollIntervalSeconds 被完全忽略");
    }

    @Test
    void twoHoursIsNotClampedToOneHour() {
        assertEquals(7200, JobSchedulePolicy.clampPollInterval(KEY, 7200));
    }

    @Test
    void defaultIntervalIsTwoHours() {
        assertEquals(7200, JobSchedulePolicy.defaultPollIntervalSeconds(KEY));
    }

    @Test
    void slotStartAnchorsToDayBoundaryNotToFirstRun() {
        // 17:40 落在 [16:00,18:00) 这一槽 → 槽起点是 16:00（不是「启动时刻」17:40）
        assertEquals(LocalDateTime.of(2026, 10, 10, 16, 0),
                JobScheduleDueEvaluator.slotStartOf(LocalDateTime.of(2026, 10, 10, 17, 40, 15), 7200));
        assertEquals(LocalDateTime.of(2026, 10, 10, 0, 0),
                JobScheduleDueEvaluator.slotStartOf(LocalDateTime.of(2026, 10, 10, 0, 30), 7200));
        assertEquals(LocalDateTime.of(2026, 10, 10, 22, 0),
                JobScheduleDueEvaluator.slotStartOf(LocalDateTime.of(2026, 10, 10, 23, 59), 7200));
    }

    @Test
    void longtermJobFiresOncePerEvenSlot() {
        TwinJobScheduleConfig cfg = new TwinJobScheduleConfig();
        cfg.setJobKey(KEY);
        cfg.setPollIntervalSeconds(7200);
        // 16:00:05 已经跑过 → 17:00 还在同一槽内，不再触发
        cfg.setLastRunAt(LocalDateTime.of(2026, 10, 10, 16, 0, 5));
        assertFalse(JobScheduleDueEvaluator.shouldRunByPollInterval(cfg, LocalDateTime.of(2026, 10, 10, 17, 0)));
        // 跨到 18:00 那一槽 → 该跑了
        assertTrue(JobScheduleDueEvaluator.shouldRunByPollInterval(cfg, LocalDateTime.of(2026, 10, 10, 18, 0, 3)));
    }
}
