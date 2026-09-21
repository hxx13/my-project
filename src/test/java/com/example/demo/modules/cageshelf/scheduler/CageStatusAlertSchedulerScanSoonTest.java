package com.example.demo.modules.cageshelf.scheduler;

import com.example.demo.modules.cageshelf.mapper.CageStatusAlertMapper;
import org.junit.jupiter.api.Test;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.scheduling.Trigger;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ScheduledFuture;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;

/**
 * {@code scanSoon()} 的**合并**行为回归。
 *
 * <p>2026-09-18 加的：状态一改就立刻重算（不等 5 分钟 tick），触发点挂在
 * {@code CageFormAuditService.logDataChange}（状态审计的唯一写口）。而批量写状态会**连着**触发
 * 很多次（一次 ARO 同步上千个笼位、一次分笼多个目标），每次触发都是一轮**全量折叠**
 * （审计表 10 万行量级）。没有合并就等于把 5 分钟一次换成上千轮 —— 用户明确要求「别误伤算力」，
 * 所以这条必须钉住。
 */
class CageStatusAlertSchedulerScanSoonTest {

    /** 只记录「排了几轮」，不真跑（真跑要读库）。 */
    private static final class RecordingTaskScheduler implements TaskScheduler {
        final List<Runnable> queued = new ArrayList<>();

        @Override
        public ScheduledFuture<?> schedule(Runnable task, Instant startTime) {
            queued.add(task);
            return null;
        }

        @Override
        public ScheduledFuture<?> schedule(Runnable task, Trigger trigger) {
            throw new UnsupportedOperationException();
        }

        @Override
        public ScheduledFuture<?> scheduleAtFixedRate(Runnable task, Instant startTime, Duration period) {
            throw new UnsupportedOperationException();
        }

        @Override
        public ScheduledFuture<?> scheduleAtFixedRate(Runnable task, Duration period) {
            throw new UnsupportedOperationException();
        }

        @Override
        public ScheduledFuture<?> scheduleWithFixedDelay(Runnable task, Instant startTime, Duration delay) {
            throw new UnsupportedOperationException();
        }

        @Override
        public ScheduledFuture<?> scheduleWithFixedDelay(Runnable task, Duration delay) {
            throw new UnsupportedOperationException();
        }
    }

    /**
     * mapper 不 stub → scan() 里不会真跑全量折叠（jdbcTemplate 为 null 时取锁那步就抛、被 scan 自己吞掉）。
     * 于是测试能安全地把排队的任务 run 掉，用来验标记复位。
     */
    private CageStatusAlertScheduler schedulerWith(RecordingTaskScheduler ts) {
        return new CageStatusAlertScheduler(null, null, mock(CageStatusAlertMapper.class),
                null, null, null, ts, null);
    }

    @Test
    void repeatedScanSoonWhileQueuedCollapsesToSingleRun() {
        RecordingTaskScheduler ts = new RecordingTaskScheduler();
        CageStatusAlertScheduler scheduler = schedulerWith(ts);

        for (int i = 0; i < 50; i++) scheduler.scanSoon();   // 模拟一次批量写状态连着触发

        assertEquals(1, ts.queued.size(), "一轮没跑完之前，重复触发必须合并成一轮");
    }

    @Test
    void scanSoonCanQueueAgainAfterPreviousRunStarted() {
        RecordingTaskScheduler ts = new RecordingTaskScheduler();
        CageStatusAlertScheduler scheduler = schedulerWith(ts);

        scheduler.scanSoon();
        ts.queued.get(0).run();      // 跑掉这一轮（加锁失败即返回），标记复位
        scheduler.scanSoon();

        assertEquals(2, ts.queued.size(), "扫描期间/之后到达的触发是真新变更，必须还能排下一轮");
    }
}
