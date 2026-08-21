package com.example.demo.modules.twin.obligation.task;

import com.example.demo.modules.twin.obligation.service.ObligationService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Obligation 过期兜底：due_at 已过且仍非终态时转为 EXPIRED。
 * 与违规主表过期扫描并存；补齐「未完成交互且挂死」的收尾路径。
 */
@Component
public class ObligationExpiryTask {

    private static final Logger log = LoggerFactory.getLogger(ObligationExpiryTask.class);

    private final ObligationService obligationService;

    public ObligationExpiryTask(ObligationService obligationService) {
        this.obligationService = obligationService;
    }

    @Scheduled(
            initialDelayString = "${app.obligation.expiry-initial-delay-ms:90000}",
            fixedDelayString = "${app.obligation.expiry-scan-ms:300000}")
    public void scanExpired() {
        try {
            int n = obligationService.expireOverdue(500);
            if (n > 0) {
                log.info("[obligation] 过期兜底处理 {} 条", n);
            }
        } catch (Exception e) {
            log.warn("[obligation] 定时过期扫描失败: {}", e.getMessage());
        }
    }
}
