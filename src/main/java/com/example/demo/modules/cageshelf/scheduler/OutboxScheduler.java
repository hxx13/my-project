package com.example.demo.modules.cageshelf.scheduler;

import com.example.demo.modules.cageshelf.service.OutboxService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Outbox 投递调度器 — 每 10 秒轮询一次待投递记录。
 */
@Component
public class OutboxScheduler {

    private static final Logger log = LoggerFactory.getLogger(OutboxScheduler.class);
    private final OutboxService outboxService;

    public OutboxScheduler(OutboxService outboxService) {
        this.outboxService = outboxService;
    }

    private int heartbeatCount = 0;

    @Scheduled(fixedDelay = 10_000, initialDelay = 30_000)
    public void pollAndDeliver() {
        try {
            int delivered = outboxService.deliverBatch(20);
            heartbeatCount++;
            if (delivered > 0) {
                log.info("[outbox-scheduler] 本轮投递: {} 条成功", delivered);
            } else if (heartbeatCount % 6 == 1) { // 每60秒一次心跳
                log.info("[outbox-scheduler] ♥ 心跳正常，无待投递记录");
            }
        } catch (Exception e) {
            log.error("[outbox-scheduler] 投递异常: {}", e.getMessage(), e);
        }
    }
}
