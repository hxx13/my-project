package com.example.demo.modules.cageshelf.scheduler;

import com.example.demo.modules.cageshelf.service.CageClaimService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 认领超时扫描 — 每小时扫描一次过期的 pending_approval 和 locked 记录。
 */
@Component
public class CageClaimTimeoutScheduler {

    private static final Logger log = LoggerFactory.getLogger(CageClaimTimeoutScheduler.class);

    private final CageClaimService claimService;

    public CageClaimTimeoutScheduler(CageClaimService claimService) {
        this.claimService = claimService;
    }

    @Scheduled(fixedDelay = 3_600_000, initialDelay = 120_000) // 每 60 分钟，启动后 2 分钟首次
    public void scanTimeouts() {
        try {
            int rejected = claimService.scanTimedOutPendingApproval(72);
            int cancelled = claimService.scanTimedOutLocked(168);
            if (rejected > 0 || cancelled > 0) {
                log.info("[claim-timeout-scan] rejected={} cancelled={}", rejected, cancelled);
            }
        } catch (Exception e) {
            log.error("[claim-timeout-scan] 扫描异常: {}", e.getMessage(), e);
        }
    }
}
