package com.example.demo.modules.aro.scheduler;

import com.example.demo.modules.aro.service.AroTrainingSyncService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 每日凌晨 2 点全量同步 ARO 培训数据到本地缓存表。
 * 可通过 /admin/settings/scheduler 注册和手动触发。
 */
@Component
public class AroTrainingSyncScheduler {

    private static final Logger log = LoggerFactory.getLogger(AroTrainingSyncScheduler.class);
    private final AroTrainingSyncService syncService;

    public AroTrainingSyncScheduler(AroTrainingSyncService syncService) {
        this.syncService = syncService;
    }

    @Scheduled(cron = "${app.aro.training-sync-cron:0 37 2 * * ?}")
    public void syncTrainingData() {
        log.info("[AroTrainingSync] 定时同步触发");
        try {
            syncService.syncAll();
        } catch (Exception e) {
            log.error("[AroTrainingSync] 定时同步异常: {}", e.getMessage());
        }
    }
}
