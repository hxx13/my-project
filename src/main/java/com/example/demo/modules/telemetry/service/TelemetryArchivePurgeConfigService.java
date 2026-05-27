package com.example.demo.modules.telemetry.service;

import com.example.demo.modules.telemetry.dto.archive.TelemetryArchivePurgeConfigDto;
import com.example.demo.modules.telemetry.dto.archive.TelemetryArchivePurgeProgressDto;
import com.example.demo.modules.telemetry.entity.TelemetryArchivePurgeConfig;
import com.example.demo.modules.telemetry.mapper.TelemetryArchivePurgeConfigMapper;
import com.example.demo.modules.twin.service.JobExecutionRegistry;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.CannotAcquireLockException;
import org.springframework.dao.DeadlockLoserDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.Instant;
import java.time.ZoneId;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * WinCC 归档清理策略（DB 可配置）+ 内存进度（供管理端轮询可视化）。
 */
@Service
public class TelemetryArchivePurgeConfigService {

    private static final Logger log = LoggerFactory.getLogger(TelemetryArchivePurgeConfigService.class);
    private static final int LOCK_RETRY_MAX = 8;

    private final TelemetryArchivePurgeConfigMapper configMapper;
    private final JdbcTemplate jdbcTemplate;
    private final AtomicBoolean purgeInProgress = new AtomicBoolean(false);
    private volatile PurgeProgressState progress = PurgeProgressState.idle();

    @Value("${app.telemetry.archive.retention-days:30}")
    private int defaultRetentionDays;

    private volatile boolean tableReady;

    public TelemetryArchivePurgeConfigService(
            TelemetryArchivePurgeConfigMapper configMapper,
            JdbcTemplate jdbcTemplate) {
        this.configMapper = configMapper;
        this.jdbcTemplate = jdbcTemplate;
    }

    public boolean isPurgeInProgress() {
        return purgeInProgress.get();
    }

    public boolean tryBeginPurge() {
        return purgeInProgress.compareAndSet(false, true);
    }

    public void endPurge() {
        purgeInProgress.set(false);
    }

    public void beginProgressSession(long initialTargetRows) {
        PurgeProgressState s = new PurgeProgressState();
        s.status = "RUNNING";
        s.initialTargetRows = Math.max(1, initialTargetRows);
        s.startedAt = Instant.now();
        s.lastUpdatedAt = s.startedAt;
        s.message = "正在清理过期归档…";
        progress = s;
    }

    public void updateProgress(long deletedThisSession, int batchRounds, long remainingApprox, String message) {
        PurgeProgressState s = progress;
        if (s == null || !"RUNNING".equals(s.status)) {
            return;
        }
        s.deletedThisSession = deletedThisSession;
        s.batchRounds = batchRounds;
        s.remainingRowsApprox = remainingApprox;
        s.lastUpdatedAt = Instant.now();
        if (StringUtils.hasText(message)) {
            s.message = message;
        } else {
            s.message = String.format("已删除 %,d 行，剩余约 %,d 行（第 %d 批）",
                    deletedThisSession, remainingApprox, batchRounds);
        }
    }

    public void finishProgress(String status, String message, String error) {
        PurgeProgressState s = progress;
        if (s == null) {
            s = PurgeProgressState.idle();
        }
        s.status = status;
        s.lastUpdatedAt = Instant.now();
        if (StringUtils.hasText(message)) {
            s.message = message;
        }
        s.error = error;
        progress = s;
    }

    public TelemetryArchivePurgeProgressDto getProgressDto() {
        PurgeProgressState s = progress == null ? PurgeProgressState.idle() : progress;
        ZoneId z = ZoneId.systemDefault();
        int percent = 0;
        if (s.initialTargetRows > 0 && s.deletedThisSession > 0) {
            percent = (int) Math.min(100, s.deletedThisSession * 100 / s.initialTargetRows);
        } else if ("COMPLETED".equals(s.status)) {
            percent = 100;
        }
        boolean running = purgeInProgress.get() || "RUNNING".equals(s.status);
        return TelemetryArchivePurgeProgressDto.builder()
                .inProgress(running)
                .status(running ? "RUNNING" : s.status)
                .deletedThisSession(s.deletedThisSession)
                .batchRounds(s.batchRounds)
                .remainingRowsApprox(s.remainingRowsApprox)
                .initialTargetRows(s.initialTargetRows)
                .percentComplete(percent)
                .startedAt(s.startedAt == null ? null : s.startedAt.atZone(z).toOffsetDateTime().toString())
                .lastUpdatedAt(s.lastUpdatedAt == null ? null : s.lastUpdatedAt.atZone(z).toOffsetDateTime().toString())
                .message(s.message)
                .error(s.error)
                .build();
    }

    @PostConstruct
    public void ensureSchema() {
        try {
            jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS telemetry_archive_purge_config (
                        id TINYINT NOT NULL PRIMARY KEY,
                        purge_enabled TINYINT NOT NULL DEFAULT 1,
                        retention_days INT NOT NULL DEFAULT 14,
                        batch_delete_size INT NOT NULL DEFAULT 5000,
                        optimize_after_purge TINYINT NOT NULL DEFAULT 1,
                        archive_write_enabled TINYINT NOT NULL DEFAULT 1,
                        last_purge_at DATETIME NULL,
                        last_purge_deleted_rows BIGINT NULL,
                        last_purge_duration_ms INT NULL,
                        updated_by VARCHAR(64) NULL,
                        update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                    """);
            jdbcTemplate.update("""
                    INSERT IGNORE INTO telemetry_archive_purge_config (
                        id, purge_enabled, retention_days, batch_delete_size,
                        optimize_after_purge, archive_write_enabled, updated_by
                    ) VALUES (1, 1, ?, 5000, 1, 1, 'system-init')
                    """, Math.min(90, Math.max(1, defaultRetentionDays)));
            tableReady = true;
        } catch (Exception e) {
            log.warn("[遥测归档] purge_config 表初始化失败: {}", e.getMessage());
        }
    }

    public TelemetryArchivePurgeConfigDto getConfigDto() {
        ensureSchema();
        TelemetryArchivePurgeConfig cfg = configMapper.selectSingleton();
        if (cfg == null) {
            return defaultDto();
        }
        return toDto(cfg);
    }

    public TelemetryArchivePurgeConfig getEffectiveConfig() {
        ensureSchema();
        TelemetryArchivePurgeConfig cfg = configMapper.selectSingleton();
        if (cfg == null) {
            return defaultEntity();
        }
        return cfg;
    }

    public void saveConfig(TelemetryArchivePurgeConfigDto input, String updatedBy) {
        ensureSchema();
        if (purgeInProgress.get()) {
            throw new IllegalStateException("归档清理进行中，请等待完成后再保存策略");
        }
        upsertConfigWithRetry(
                input.isPurgeEnabled() ? 1 : 0,
                clampRetention(input.getRetentionDays()),
                clampBatch(input.getBatchDeleteSize()),
                input.isOptimizeAfterPurge() ? 1 : 0,
                input.isArchiveWriteEnabled() ? 1 : 0,
                StringUtils.hasText(updatedBy) ? updatedBy : "admin");
    }

    public void recordPurgeResult(long deletedRows, int durationMs, String updatedBy) {
        ensureSchema();
        String by = StringUtils.hasText(updatedBy) ? updatedBy : "system";
        for (int attempt = 0; attempt < LOCK_RETRY_MAX; attempt++) {
            try {
                jdbcTemplate.update("""
                        UPDATE telemetry_archive_purge_config
                        SET last_purge_at = NOW(),
                            last_purge_deleted_rows = ?,
                            last_purge_duration_ms = ?,
                            updated_by = ?
                        WHERE id = 1
                        """, deletedRows, durationMs, by);
                return;
            } catch (CannotAcquireLockException | DeadlockLoserDataAccessException e) {
                if (attempt >= LOCK_RETRY_MAX - 1) {
                    log.error("[遥测归档] 更新清理结果失败（可忽略）: {}", e.getMessage());
                    return;
                }
                sleepQuiet(300L * (attempt + 1));
            }
        }
    }

    public boolean isArchiveWriteEnabled() {
        if (purgeInProgress.get()) {
            return false;
        }
        TelemetryArchivePurgeConfig cfg = getEffectiveConfig();
        return cfg.getArchiveWriteEnabled() == null || cfg.getArchiveWriteEnabled() == 1;
    }

    public int effectiveRetentionDays() {
        TelemetryArchivePurgeConfig cfg = getEffectiveConfig();
        int days = cfg.getRetentionDays() == null ? defaultRetentionDays : cfg.getRetentionDays();
        return clampRetention(days);
    }

    public int effectiveBatchDeleteSize() {
        TelemetryArchivePurgeConfig cfg = getEffectiveConfig();
        return clampBatch(cfg.getBatchDeleteSize() == null ? 5_000 : cfg.getBatchDeleteSize());
    }

    public boolean isPurgeEnabled() {
        TelemetryArchivePurgeConfig cfg = getEffectiveConfig();
        return cfg.getPurgeEnabled() == null || cfg.getPurgeEnabled() == 1;
    }

    public boolean isOptimizeAfterPurge() {
        TelemetryArchivePurgeConfig cfg = getEffectiveConfig();
        return cfg.getOptimizeAfterPurge() == null || cfg.getOptimizeAfterPurge() == 1;
    }

    private void upsertConfigWithRetry(
            int purgeEnabled, int retentionDays, int batchSize,
            int optimize, int writeEnabled, String updatedBy) {
        for (int attempt = 0; attempt < LOCK_RETRY_MAX; attempt++) {
            try {
                jdbcTemplate.update("""
                        INSERT INTO telemetry_archive_purge_config (
                            id, purge_enabled, retention_days, batch_delete_size, optimize_after_purge,
                            archive_write_enabled, updated_by
                        ) VALUES (1, ?, ?, ?, ?, ?, ?)
                        ON DUPLICATE KEY UPDATE
                            purge_enabled = VALUES(purge_enabled),
                            retention_days = VALUES(retention_days),
                            batch_delete_size = VALUES(batch_delete_size),
                            optimize_after_purge = VALUES(optimize_after_purge),
                            archive_write_enabled = VALUES(archive_write_enabled),
                            updated_by = VALUES(updated_by)
                        """, purgeEnabled, retentionDays, batchSize, optimize, writeEnabled, updatedBy);
                return;
            } catch (CannotAcquireLockException | DeadlockLoserDataAccessException e) {
                if (attempt >= LOCK_RETRY_MAX - 1) {
                    throw new IllegalStateException(
                            "保存策略失败：数据库锁等待超时。请等待清理完成后再试。", e);
                }
                sleepQuiet(400L * (attempt + 1));
            }
        }
    }

    private static int clampRetention(int days) {
        return Math.min(3650, Math.max(1, days));
    }

    private static int clampBatch(int batch) {
        return Math.min(20_000, Math.max(500, batch));
    }

    private static void sleepQuiet(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private TelemetryArchivePurgeConfigDto defaultDto() {
        return TelemetryArchivePurgeConfigDto.builder()
                .purgeEnabled(true)
                .retentionDays(clampRetention(defaultRetentionDays))
                .batchDeleteSize(5_000)
                .optimizeAfterPurge(true)
                .archiveWriteEnabled(true)
                .scheduleJobKey(JobExecutionRegistry.JOB_TELEMETRY_ARCHIVE_PURGE)
                .scheduleJobName("温湿度·WinCC归档自动清理")
                .build();
    }

    private TelemetryArchivePurgeConfig defaultEntity() {
        TelemetryArchivePurgeConfig c = new TelemetryArchivePurgeConfig();
        c.setId(1);
        c.setPurgeEnabled(1);
        c.setRetentionDays(clampRetention(defaultRetentionDays));
        c.setBatchDeleteSize(5_000);
        c.setOptimizeAfterPurge(1);
        c.setArchiveWriteEnabled(1);
        return c;
    }

    private TelemetryArchivePurgeConfigDto toDto(TelemetryArchivePurgeConfig cfg) {
        return TelemetryArchivePurgeConfigDto.builder()
                .purgeEnabled(cfg.getPurgeEnabled() == null || cfg.getPurgeEnabled() == 1)
                .retentionDays(clampRetention(cfg.getRetentionDays() == null ? defaultRetentionDays : cfg.getRetentionDays()))
                .batchDeleteSize(clampBatch(cfg.getBatchDeleteSize() == null ? 5_000 : cfg.getBatchDeleteSize()))
                .optimizeAfterPurge(cfg.getOptimizeAfterPurge() == null || cfg.getOptimizeAfterPurge() == 1)
                .archiveWriteEnabled(cfg.getArchiveWriteEnabled() == null || cfg.getArchiveWriteEnabled() == 1)
                .lastPurgeAt(cfg.getLastPurgeAt() == null ? null : cfg.getLastPurgeAt().toString())
                .lastPurgeDeletedRows(cfg.getLastPurgeDeletedRows())
                .lastPurgeDurationMs(cfg.getLastPurgeDurationMs())
                .scheduleJobKey(JobExecutionRegistry.JOB_TELEMETRY_ARCHIVE_PURGE)
                .scheduleJobName("温湿度·WinCC归档自动清理")
                .build();
    }

    private static final class PurgeProgressState {
        String status = "IDLE";
        long deletedThisSession;
        int batchRounds;
        long remainingRowsApprox;
        long initialTargetRows = 1;
        String message = "空闲";
        String error;
        Instant startedAt;
        Instant lastUpdatedAt;

        static PurgeProgressState idle() {
            PurgeProgressState s = new PurgeProgressState();
            s.status = "IDLE";
            s.message = "暂无清理任务";
            return s;
        }
    }
}
