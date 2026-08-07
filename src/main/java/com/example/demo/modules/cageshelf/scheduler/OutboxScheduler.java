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
    private String lastInfraError = null; // 上一次基础设施错误消息，用于去重

    @Scheduled(fixedDelay = 10_000, initialDelay = 30_000)
    public void pollAndDeliver() {
        try {
            int delivered = outboxService.deliverBatch(20);
            heartbeatCount++;
            lastInfraError = null; // 本轮成功，重置
            if (delivered > 0) {
                log.info("[outbox-scheduler] 本轮投递: {} 条成功", delivered);
            } else if (heartbeatCount % 6 == 1) { // 每60秒一次心跳
                log.info("[outbox-scheduler] ♥ 心跳正常，无待投递记录");
            }
        } catch (Exception e) {
            String msg = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
            if (!msg.equals(lastInfraError)) {
                // 新错误 → ERROR + 完整堆栈（仅首次）
                log.error("[outbox-scheduler] ⚠ 基础设施故障，投递暂停: {}", msg, e);
                lastInfraError = msg;
            } else {
                // 重复错误 → WARN 级别，不打印堆栈
                log.warn("[outbox-scheduler] ⚠ 基础设施故障持续中，跳过本轮 ({}s 后重试)", 10);
            }
        }
    }
}
