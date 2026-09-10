package com.example.demo.modules.twin.common.service;

import com.example.demo.modules.twin.common.entity.TwinJobScheduleConfig;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 回归：笼架全量同步等「整分到点」任务，在调度节拍被长任务挤过后必须能补跑。
 */
class JobScheduleDueEvaluatorTest {

    @Test
    void cageWeeklyScan_missedExactMinute_stillDueForCatchup() {
        // 计划：周日 03:30；实际 tick 因争用落到 03:31
        TwinJobScheduleConfig cfg = cageWeeklyCfg();
        cfg.setEnabled(1);
        cfg.setLastRunAt(null);
        cfg.setLastSuccessAt(null);

        LocalDateTime plan = LocalDateTime.of(2026, 8, 16, 3, 30, 0); // Sunday
        LocalDateTime slipped = plan.plusMinutes(1);

        assertTrue(JobScheduleDueEvaluator.shouldRun(cfg, plan), "整分应命中");
        assertFalse(JobScheduleDueEvaluator.shouldRun(cfg, slipped), "错过后仅整分判定会漏跑（旧行为）");
        assertTrue(JobScheduleDueEvaluator.isMissed(cfg, slipped), "应识别为错过");
        assertTrue(JobScheduleDueEvaluator.dueForRun(cfg, slipped), "tick 应用 dueForRun 才能补跑");
    }

    @Test
    void cageWeeklyScan_wrongWeekday_exactHitFalse_butMissedSundayStillCatchup() {
        TwinJobScheduleConfig cfg = cageWeeklyCfg();
        cfg.setEnabled(1);
        // 2026-08-17 是周一：整分不应按「今天」命中，但周日计划若从未成功仍应补跑
        LocalDateTime monday = LocalDateTime.of(2026, 8, 17, 3, 30, 0);
        assertFalse(JobScheduleDueEvaluator.shouldRun(cfg, monday));
        assertTrue(JobScheduleDueEvaluator.isMissed(cfg, monday), "应回溯到上周日计划点并补跑");
        assertTrue(JobScheduleDueEvaluator.dueForRun(cfg, monday));
    }

    @Test
    void cageWeeklyScan_afterSuccess_notMissed() {
        TwinJobScheduleConfig cfg = cageWeeklyCfg();
        LocalDateTime plan = LocalDateTime.of(2026, 8, 16, 3, 30, 0);
        cfg.setLastRunAt(plan);
        cfg.setLastSuccessAt(plan);
        assertFalse(JobScheduleDueEvaluator.isMissed(cfg, plan.plusHours(1)));
        assertFalse(JobScheduleDueEvaluator.dueForRun(cfg, plan.plusHours(1)));
    }

    @Test
    void parseTime_acceptsHhMmSsFromBrowsers() {
        assertTrue(JobScheduleDueEvaluator.parseTime("03:30:00").equals(
                JobScheduleDueEvaluator.parseTime("03:30")));
    }

    /**
     * 回归事故：二道滞留签退计划 21:00，服务器次日 09:09 才起来，
     * 补跑把当时全馆在馆人员自动签退。写动作只允许在计划时刻附近执行。
     */
    @Test
    void strandedSignout_missedByHours_nextMorning_notDue() {
        TwinJobScheduleConfig cfg = strandedSignoutCfg();
        LocalDateTime nextMorning = LocalDateTime.of(2026, 9, 10, 9, 9, 0);

        assertFalse(JobScheduleDueEvaluator.shouldRun(cfg, nextMorning), "非计划整分不该命中");
        assertFalse(JobScheduleDueEvaluator.isMissed(cfg, nextMorning), "迟到十余小时不许补跑");
        assertFalse(JobScheduleDueEvaluator.dueForRun(cfg, nextMorning), "tick 不该补签退");
    }

    @Test
    void strandedSignout_slippedWithinGrace_stillDue() {
        TwinJobScheduleConfig cfg = strandedSignoutCfg();

        assertTrue(JobScheduleDueEvaluator.dueForRun(
                cfg, LocalDateTime.of(2026, 9, 9, 21, 0, 0)), "整分命中");
        assertTrue(JobScheduleDueEvaluator.dueForRun(
                cfg, LocalDateTime.of(2026, 9, 9, 21, 3, 0)), "节拍被长任务挤过 3 分钟仍应补跑");
        assertFalse(JobScheduleDueEvaluator.dueForRun(
                cfg, LocalDateTime.of(2026, 9, 9, 21, 40, 0)), "超宽限不再补跑");
    }

    private static TwinJobScheduleConfig strandedSignoutCfg() {
        TwinJobScheduleConfig cfg = new TwinJobScheduleConfig();
        cfg.setJobKey(JobExecutionRegistry.JOB_STRANDED_SIGNOUT_CHECK);
        cfg.setScheduleType("DAILY");
        cfg.setScheduleTime("21:00");
        cfg.setWeekDays("1,2,3,4,5,6,7");
        cfg.setScheduleStartTime("00:00");
        cfg.setScheduleEndTime("23:59");
        cfg.setEnabled(1);
        return cfg;
    }

    private static TwinJobScheduleConfig cageWeeklyCfg() {
        TwinJobScheduleConfig cfg = new TwinJobScheduleConfig();
        cfg.setJobKey(JobExecutionRegistry.JOB_CAGE_SPECIAL_STATUS_SCAN);
        cfg.setScheduleType("WEEKLY");
        cfg.setScheduleTime("03:30");
        cfg.setWeekDays("7");
        cfg.setScheduleStartTime("00:00");
        cfg.setScheduleEndTime("23:59");
        return cfg;
    }
}
