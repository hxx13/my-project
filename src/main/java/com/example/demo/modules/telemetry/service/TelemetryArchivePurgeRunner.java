package com.example.demo.modules.telemetry.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

/**
 * 后台执行归档清理，避免 HTTP 长连接占满连接池导致保存策略也锁等待。
 */
@Service
public class TelemetryArchivePurgeRunner {

    private static final Logger log = LoggerFactory.getLogger(TelemetryArchivePurgeRunner.class);

    private final TelemetryArchiveService archiveService;

    public TelemetryArchivePurgeRunner(TelemetryArchiveService archiveService) {
        this.archiveService = archiveService;
    }

    @Async
    public void runManualPurgeAsync() {
        try {
            archiveService.purgeExpiredContinuous("admin-manual-async");
        } catch (Exception e) {
            log.error("[遥测归档] 后台清理失败: {}", e.getMessage(), e);
        }
    }
}
