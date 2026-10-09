package com.example.demo.modules.ai.timer.scheduler;

import com.example.demo.modules.ai.timer.entity.AiTimer;
import com.example.demo.modules.ai.timer.service.AiTimerService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 到点触发 —— 每 5 秒扫一次 {@code PENDING AND fire_at <= now}。
 *
 * <p>用既有的 {@code @EnableScheduling}（照 {@code CageClaimTimeoutScheduler} 的写法），
 * 不新起调度基建。<b>不存「剩余秒数」</b>：扫的是绝对时间，所以停机期间到期的单，
 * 重启后第一个 tick 就会补跑（见设计文档 §5）。
 *
 * <p>{@code initialDelay} 是刻意的：本方法在启动后 20 秒就会查表，而这张表由启动链早期的
 * {@code db/bootstrap-ai-timer.sql}（在 {@code EmbeddedTwinSystemCoreDdlBootstrap.afterPropertiesSet}
 * 里执行，早于任何 {@code @PostConstruct}）创建 —— 见「改库四步流程」。
 * 留一段时间只是让启动期的其它活儿先跑完，不是建表时机的依赖。
 *
 * <p>同一行只执行一次靠 {@link AiTimerService#claim} 的原子 UPDATE，多 tick / 多线程都不会双跑。
 */
@Component
public class AiTimerScheduler {

    private static final Logger log = LoggerFactory.getLogger(AiTimerScheduler.class);

    /** 认领后超过这个时长的 FIRING 视为僵尸单，收成 FAILED。 */
    private static final long STALE_SWEEP_MS = 60_000L;

    private final AiTimerService timerService;

    public AiTimerScheduler(AiTimerService timerService) {
        this.timerService = timerService;
    }

    @Scheduled(fixedDelay = 5_000, initialDelay = 20_000)
    public void tick() {
        List<AiTimer> due;
        try {
            due = timerService.due(LocalDateTime.now());
        } catch (Exception e) {
            log.error("[ai-timer] 取到期单失败: {}", e.getMessage(), e);
            return;
        }
        for (AiTimer t : due) {
            // 单条失败不中断整批：一条坏单不能把后面所有人的定时都堵住
            try {
                if (!timerService.claim(t.getId())) {
                    continue; // 已被取消 / 别的 tick 抢到了
                }
                timerService.dispatchClaimed(t.getId());
            } catch (Exception e) {
                log.error("[ai-timer] 处理 id={} 失败: {}", t.getId(), e.getMessage(), e);
            }
        }
    }

    /**
     * 收殓僵尸单（认领后进程被 kill，状态会永远停在 FIRING）。
     *
     * <p>按分钟跑而不是跟着 5 秒的 tick —— 它是兜底，不是热路径。
     */
    @Scheduled(fixedDelay = STALE_SWEEP_MS, initialDelay = 90_000)
    public void sweepStale() {
        try {
            int n = timerService.recoverStale(LocalDateTime.now());
            if (n > 0) {
                log.warn("[ai-timer] 收殓了 {} 条中断的执行（状态 FIRING 超时）", n);
            }
        } catch (Exception e) {
            log.error("[ai-timer] 僵尸单收殓失败: {}", e.getMessage(), e);
        }
    }
}
