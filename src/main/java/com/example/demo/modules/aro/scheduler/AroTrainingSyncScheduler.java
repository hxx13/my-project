package com.example.demo.modules.aro.scheduler;

import com.example.demo.modules.aro.service.AroTrainingSyncService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** 每日定时拉取 ARO 培训场次/学员，写入本地 training 表 */
@Component
public class AroTrainingSyncScheduler {

    private static final Logger log = LoggerFactory.getLogger(AroTrainingSyncScheduler.class);

    private final AroTrainingSyncService syncService;

    public AroTrainingSyncScheduler(AroTrainingSyncService syncService) {
        this.syncService = syncService;
    }

    @Scheduled(cron = "${app.aro.training-sync-cron:0 37 2 * * ?}")
    public void syncAll() {
        try {
            syncService.syncAll();
        } catch (Exception e) {
            log.error("[AroSync] 定时同步失败: {}", e.getMessage());
        }
    }
}
