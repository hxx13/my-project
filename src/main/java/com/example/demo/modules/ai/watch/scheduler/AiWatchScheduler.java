package com.example.demo.modules.ai.watch.scheduler;

import com.example.demo.modules.ai.watch.service.AiWatchService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 条件触发器的**节拍器** —— 每十几秒把到点该查的挨个查一遍。
 *
 * <h2>为什么是固定间隔的心跳，而不是「每个监视器各排一个任务」</h2>
 * 监视器的下一次检查时刻是**存在库里的一列**（{@code next_check_at}），不是内存里的定时器。
 * 好处有两个：重启不丢（停机期间该查的，重启后第一跳就补上）；条数变化不用重建调度。
 *
 * <h2>为什么用 {@code fixedDelay} 而不是 {@code fixedRate}</h2>
 * {@code fixedDelay} 是「上一轮跑完再等这么久」，于是**永远不会有两轮叠在一起** ——
 * 这正是 {@link AiWatchService#runDue} 敢不加「认领」的前提（见那边的注释）。
 * 换成 {@code fixedRate} 就可能并发双跑，同一条监视器会被查两次、动作也可能执行两次。
 *
 * <p>{@code initialDelay} 是刻意的：本方法启动后 20 秒就会查表，而这张表由启动链早期的
 * {@code db/bootstrap-ai-watch.sql} 创建（早于任何 {@code @PostConstruct}）——
 * 留一段时间只是让启动期的其它活儿先跑完，不是建表时机的依赖。
 */
@Component
public class AiWatchScheduler {

    private static final Logger log = LoggerFactory.getLogger(AiWatchScheduler.class);

    /** 一次最多处理几条 —— 兜住「积压了几百条」时一口气把线程占死。剩下的下一跳接着来。 */
    private static final int BATCH = 20;

    private final AiWatchService watchService;

    public AiWatchScheduler(AiWatchService watchService) {
        this.watchService = watchService;
    }

    @Scheduled(fixedDelay = 15_000, initialDelay = 20_000)
    public void tick() {
        try {
            int n = watchService.runDue(BATCH);
            if (n > 0) {
                log.debug("[ai-watch] 本轮检查了 {} 条", n);
            }
        } catch (Exception e) {
            // 不能抛出去：全站定时任务共用调度池，抛出去会连累后面所有人的任务
            log.error("[ai-watch] 心跳异常: {}", e.getMessage(), e);
        }
    }
}
