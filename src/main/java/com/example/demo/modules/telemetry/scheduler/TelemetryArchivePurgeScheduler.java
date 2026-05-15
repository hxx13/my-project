package com.example.demo.modules.telemetry.scheduler;

import com.example.demo.modules.telemetry.service.TelemetryArchiveService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 清理归档表中超过保留期的样本（默认 30 天）。
 */
@Component
@ConditionalOnProperty(prefix = "app.telemetry.archive", name = "enabled", havingValue = "true", matchIfMissing = true)
public class TelemetryArchivePurgeScheduler {

    private static final Logger log = LoggerFactory.getLogger(TelemetryArchivePurgeScheduler.class);

    private final TelemetryArchiveService archiveService;

    public TelemetryArchivePurgeScheduler(TelemetryArchiveService archiveService) {
        this.archiveService = archiveService;
    }

    @Scheduled(cron = "${app.telemetry.archive.purge-cron:0 40 3 * * ?}")
    public void purge() {
        try {
            int n = archiveService.purgeExpired();
            if (n > 0) {
                log.info("[遥测归档] 定时清理删除 {} 行", n);
            }
        } catch (Exception e) {
            log.warn("[遥测归档] 定时清理失败: {}", e.getMessage());
        }
    }
}
