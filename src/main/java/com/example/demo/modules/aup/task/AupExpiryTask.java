package com.example.demo.modules.aup.task;

import com.example.demo.modules.aup.service.AupService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * AUP 到期任务：扫描 current_stage='approved' 且 expire_at<=now → expired + 审计 + 通知。
 */
@Component
public class AupExpiryTask {

    private static final Logger log = LoggerFactory.getLogger(AupExpiryTask.class);

    private final AupService aupService;

    public AupExpiryTask(AupService aupService) {
        this.aupService = aupService;
    }

    /** 每小时扫描一次（cron：整点 0 分）。 */
    @Scheduled(cron = "0 0 * * * *")
    public void expireApproved() {
        try {
            int n = aupService.expireDueApproved();
            if (n > 0) {
                log.info("[AUP] 到期任务处理 {} 条已到期计划书", n);
            }
        } catch (Exception e) {
            log.warn("[AUP] 到期任务执行失败 err={}", e.getMessage());
        }
    }
}
