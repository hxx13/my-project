package com.example.demo.modules.telemetry.service;

import com.example.demo.modules.telemetry.dto.archive.TelemetryArchiveAdminRowDto;
import com.example.demo.modules.telemetry.dto.archive.TelemetryArchiveIngestItem;
import com.example.demo.modules.telemetry.dto.archive.TelemetryArchivePointDto;
import com.example.demo.modules.telemetry.dto.archive.TelemetryArchivePurgeResultDto;
import com.example.demo.modules.telemetry.dto.archive.TelemetryArchiveQueryPageDto;
import com.example.demo.modules.telemetry.dto.archive.TelemetryArchiveSeriesDto;
import com.example.demo.modules.telemetry.dto.archive.TelemetryArchiveStorageStatsDto;
import com.example.demo.modules.twin.common.support.TwinTimingDiagnostics;
import com.example.demo.modules.telemetry.entity.TelemetryValueArchiveRow;
import com.example.demo.modules.telemetry.mapper.TelemetryValueArchiveMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.dao.CannotAcquireLockException;
import org.springframework.dao.DeadlockLoserDataAccessException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.util.StringUtils;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/**
 * WinCC 测量快照异步归档 + 查询/降采样序列（{@code telemetry_value_archive}）。
 */
@Service
public class TelemetryArchiveService {

    private static final Logger log = LoggerFactory.getLogger(TelemetryArchiveService.class);
    private static final int INSERT_CHUNK = 400;
    private static final int LOCK_RETRY_MAX = 6;
    /** 后台持续清理安全上限（批次数） */
    private static final int CONTINUOUS_MAX_BATCHES = 50_000;
    private static final Pattern LEADING_NUMBER = Pattern.compile("^(-?\\d+(?:\\.\\d*)?)");

    private final TelemetryValueArchiveMapper archiveMapper;
    private final TelemetryArchivePurgeConfigService purgeConfigService;
    private final org.springframework.jdbc.core.JdbcTemplate jdbcTemplate;
    private final PlatformTransactionManager transactionManager;

    @Value("${app.telemetry.archive.enabled:true}")
    private boolean enabled;

    @Value("${app.telemetry.archive.retention-days:30}")
    private int retentionDays;

    public TelemetryArchiveService(
            TelemetryValueArchiveMapper archiveMapper,
            TelemetryArchivePurgeConfigService purgeConfigService,
            org.springframework.jdbc.core.JdbcTemplate jdbcTemplate,
            PlatformTransactionManager transactionManager) {
        this.archiveMapper = archiveMapper;
        this.purgeConfigService = purgeConfigService;
        this.jdbcTemplate = jdbcTemplate;
        this.transactionManager = transactionManager;
    }

    @Async
    public void appendAfterRefresh(List<TelemetryArchiveIngestItem> items, Instant sampleAt, String ingestBatchId) {
        if (!enabled || !purgeConfigService.isArchiveWriteEnabled() || items == null || items.isEmpty()) {
            return;
        }
        try {
            java.time.LocalDateTime at = java.time.LocalDateTime.ofInstant(sampleAt, ZoneId.systemDefault());
            List<TelemetryValueArchiveRow> batch = new ArrayList<>();
            for (TelemetryArchiveIngestItem it : items) {
                if (it == null || !StringUtils.hasText(it.variableName())) {
                    continue;
                }
                String vn = it.variableName().trim();
                if (vn.length() > 500) {
                    vn = vn.substring(0, 500);
                }
                TelemetryValueArchiveRow r = new TelemetryValueArchiveRow();
                r.setSampleAt(at);
                r.setVariableName(vn);
                r.setRawValue(trimLen(it.value(), 500));
                r.setNumericValue(parseItemNumeric(it.value()));
                r.setMetricKindCode(trimLen(it.metricKindCode(), 64));
                r.setRoomCanonical(trimLen(it.roomCanonical(), 256));
                r.setBundleCode(trimLen(it.bundleCode(), 128));
                r.setSchemaVersion(1);
                r.setIngestBatchId(trimLen(ingestBatchId, 64));
                r.setExtJson(null);
                batch.add(r);
                if (batch.size() >= INSERT_CHUNK) {
                    archiveMapper.insertBatch(batch);
                    batch.clear();
                }
            }
            if (!batch.isEmpty()) {
                archiveMapper.insertBatch(batch);
            }
        } catch (Exception e) {
            log.warn("[遥测归档] 异步写入失败（不影响快照）: {}", e.getMessage());
        }
    }

    /**
     * 管理端表格分页：按 {@code sample_at}、{@code id} 倒序（新记录在前），
     * 与 {@code TelemetryValueArchiveMapper#selectPageByFilter} 的 {@code ORDER BY sample_at DESC, id DESC} 一致。
     */
    public TelemetryArchiveQueryPageDto queryPage(int page, int size, String variableQ,
                                                  java.time.LocalDateTime from, java.time.LocalDateTime to) {
        int p = Math.max(1, page);
        int s = Math.min(200, Math.max(1, size));
        String q = StringUtils.hasText(variableQ) ? variableQ.trim() : null;
        long total = archiveMapper.countByFilter(q, from, to);
        int offset = (p - 1) * s;
        List<TelemetryValueArchiveRow> rows = archiveMapper.selectPageByFilter(q, from, to, offset, s);
        List<TelemetryArchiveAdminRowDto> items = new ArrayList<>();
        if (rows != null) {
            ZoneId z = ZoneId.systemDefault();
            for (TelemetryValueArchiveRow r : rows) {
                if (r == null) {
                    continue;
                }
                items.add(TelemetryArchiveAdminRowDto.builder()
                        .id(r.getId())
                        .sampleAt(r.getSampleAt() == null ? null
                                : r.getSampleAt().atZone(z).toOffsetDateTime().toString())
                        .variableName(r.getVariableName())
                        .numericValue(r.getNumericValue())
                        .rawValue(r.getRawValue())
                        .metricKindCode(r.getMetricKindCode())
                        .roomCanonical(r.getRoomCanonical())
                        .bundleCode(r.getBundleCode())
                        .build());
            }
        }
        return TelemetryArchiveQueryPageDto.builder()
                .total(total)
                .page(p)
                .size(s)
                .items(items)
                .build();
    }

    /**
     * @param seriesScope 为空或 {@code RANGE}：使用 from/to；{@code ROLLING}：服务端以当前时间为 to、向前 windowHours 小时为 from，忽略客户端 from/to
     */
    public TelemetryArchiveSeriesDto querySeries(String variableName,
                                                 java.time.LocalDateTime from,
                                                 java.time.LocalDateTime to,
                                                 int maxPoints,
                                                 String seriesScope,
                                                 Integer windowHours) {
        if (!StringUtils.hasText(variableName)) {
            throw new IllegalArgumentException("variableName 不能为空");
        }
        String vn = variableName.trim();
        if (vn.length() > 500) {
            vn = vn.substring(0, 500);
        }
        ZoneId z = ZoneId.systemDefault();
        java.time.LocalDateTime effFrom;
        java.time.LocalDateTime effTo;
        if (StringUtils.hasText(seriesScope) && "ROLLING".equalsIgnoreCase(seriesScope.trim())) {
            int wh = windowHours == null ? 6 : Math.min(168, Math.max(1, windowHours));
            effTo = java.time.LocalDateTime.now(z);
            effFrom = effTo.minusHours(wh);
        } else {
            if (from == null || to == null) {
                throw new IllegalArgumentException("from/to 不能为空（或使用 seriesScope=ROLLING）");
            }
            if (to.isBefore(from)) {
                throw new IllegalArgumentException("to 不能早于 from");
            }
            effFrom = from;
            effTo = to;
        }
        int cap = Math.min(500, Math.max(2, maxPoints));
        List<TelemetryValueArchiveRow> rows = archiveMapper.selectSeriesAsc(vn, effFrom, effTo);
        List<TelemetryArchivePointDto> points = downsample(rows, cap);
        String qFrom = effFrom.atZone(z).toOffsetDateTime().toString();
        String qTo = effTo.atZone(z).toOffsetDateTime().toString();
        return TelemetryArchiveSeriesDto.builder()
                .variableName(vn)
                .points(points)
                .queriedFrom(qFrom)
                .queriedTo(qTo)
                .build();
    }

    private static List<TelemetryArchivePointDto> downsample(List<TelemetryValueArchiveRow> rows, int maxPoints) {
        List<TelemetryArchivePointDto> out = new ArrayList<>();
        if (rows == null || rows.isEmpty()) {
            return out;
        }
        ZoneId z = ZoneId.systemDefault();
        if (rows.size() <= maxPoints) {
            for (TelemetryValueArchiveRow r : rows) {
                out.add(toPoint(r, z));
            }
            return out;
        }
        int last = rows.size() - 1;
        for (int i = 0; i < maxPoints; i++) {
            double pos = i * last / (double) (maxPoints - 1);
            int idx = (int) Math.round(pos);
            if (idx < 0) {
                idx = 0;
            } else if (idx > last) {
                idx = last;
            }
            out.add(toPoint(rows.get(idx), z));
        }
        return out;
    }

    private static TelemetryArchivePointDto toPoint(TelemetryValueArchiveRow r, ZoneId z) {
        String t = r.getSampleAt() == null ? null : r.getSampleAt().atZone(z).toOffsetDateTime().toString();
        Double v = r.getNumericValue();
        if (v == null && StringUtils.hasText(r.getRawValue())) {
            v = parseItemNumeric(r.getRawValue());
        }
        return TelemetryArchivePointDto.builder().t(t).value(v).build();
    }

    public int purgeExpired() {
        return (int) Math.min(Integer.MAX_VALUE, purgeExpiredBatched("legacy-cron", 200).getDeletedRows());
    }

    public TelemetryArchivePurgeResultDto purgeExpiredBatched(String operator) {
        return purgeExpiredBatched(operator, 40);
    }

    /** 后台任务：持续删到没有过期数据或达到安全批次数上限 */
    public TelemetryArchivePurgeResultDto purgeExpiredContinuous(String operator) {
        return purgeExpiredBatched(operator, CONTINUOUS_MAX_BATCHES, true);
    }

    /**
     * @param maxBatches null=定时任务（200 批）；正整数=有限批；CONTINUOUS 用 {@link #purgeExpiredContinuous}
     */
    public TelemetryArchivePurgeResultDto purgeExpiredBatched(String operator, Integer maxBatches) {
        return purgeExpiredBatched(operator, maxBatches == null ? 200 : maxBatches, false);
    }

    private TelemetryArchivePurgeResultDto purgeExpiredBatched(String operator, int maxRounds, boolean continuous) {
        if (!purgeConfigService.tryBeginPurge()) {
            throw new IllegalStateException("归档清理正在进行中，请稍后再试");
        }
        long t0 = System.currentTimeMillis();
        try {
            if (!enabled || !purgeConfigService.isPurgeEnabled()) {
                purgeConfigService.finishProgress("COMPLETED", "清理未启用", null);
                return TelemetryArchivePurgeResultDto.builder()
                        .deletedRows(0)
                        .durationMs((int) (System.currentTimeMillis() - t0))
                        .optimized(false)
                        .remainingRows(approximateRowCount())
                        .partial(false)
                        .message("清理未启用")
                        .build();
            }
            int days = purgeConfigService.effectiveRetentionDays();
            int batch = purgeConfigService.effectiveBatchDeleteSize();
            LocalDateTime cutoff = LocalDateTime.now().minusDays(days);
            long initialTarget = estimateInitialDeleteTarget(cutoff);
            purgeConfigService.beginProgressSession(initialTarget);
            long totalDeleted = 0;
            int rounds = 0;
            boolean hitLimit = false;
            while (rounds < maxRounds) {
                int n = deleteOneBatchWithRetry(cutoff, batch);
                totalDeleted += n;
                rounds++;
                long remaining = approximateRowCount();
                purgeConfigService.updateProgress(totalDeleted, rounds, remaining, null);
                if (n < batch) {
                    break;
                }
                if (rounds >= maxRounds) {
                    hitLimit = true;
                    break;
                }
                briefPauseBetweenBatches();
            }
            boolean optimized = false;
            if (totalDeleted > 0 && purgeConfigService.isOptimizeAfterPurge() && !hitLimit) {
                purgeConfigService.updateProgress(totalDeleted, rounds, approximateRowCount(), "正在 OPTIMIZE TABLE…");
                try {
                    jdbcTemplate.execute("OPTIMIZE TABLE telemetry_value_archive");
                    optimized = true;
                } catch (Exception e) {
                    log.warn("[遥测归档] OPTIMIZE TABLE 失败: {}", e.getMessage());
                }
            }
            int durationMs = (int) (System.currentTimeMillis() - t0);
            purgeConfigService.recordPurgeResult(totalDeleted, durationMs, operator);
            long remaining = approximateRowCount();
            String message;
            if (hitLimit && continuous) {
                message = "已达单次安全上限，已删 " + totalDeleted + " 行，请再次启动清理";
                purgeConfigService.finishProgress("COMPLETED", message, null);
            } else if (hitLimit) {
                message = "本批已删 " + totalDeleted + " 行，仍有数据待清理";
                purgeConfigService.finishProgress("COMPLETED", message, null);
            } else if (totalDeleted == 0) {
                message = "无超过保留期的数据";
                purgeConfigService.finishProgress("COMPLETED", message, null);
            } else {
                message = "清理完成，共删除 " + totalDeleted + " 行";
                purgeConfigService.finishProgress("COMPLETED", message, null);
            }
            TwinTimingDiagnostics.logMysql(
                    "archivePurge",
                    durationMs,
                    true,
                    "deleted=" + totalDeleted + " remaining~=" + remaining + " retentionDays=" + days + " partial=" + hitLimit);
            log.info("[遥测归档] 清理 deleted={} remaining~={} retentionDays={} ms={} optimize={} partial={}",
                    totalDeleted, remaining, days, durationMs, optimized, hitLimit);
            return TelemetryArchivePurgeResultDto.builder()
                    .deletedRows(totalDeleted)
                    .durationMs(durationMs)
                    .optimized(optimized)
                    .cutoffBefore(cutoff.toString())
                    .remainingRows(remaining)
                    .partial(hitLimit)
                    .message(message)
                    .build();
        } catch (Exception e) {
            purgeConfigService.finishProgress("FAILED", "清理失败", e.getMessage());
            throw e;
        } finally {
            purgeConfigService.endPurge();
        }
    }

    private long estimateInitialDeleteTarget(LocalDateTime cutoff) {
        try {
            LocalDateTime oldest = archiveMapper.selectOldestSampleAt();
            if (oldest == null || !oldest.isBefore(cutoff)) {
                return 1;
            }
            long approx = approximateRowCount();
            return Math.max(1, approx);
        } catch (Exception e) {
            return 1;
        }
    }

    private int deleteOneBatchWithRetry(LocalDateTime cutoff, int batch) {
        TransactionTemplate tpl = new TransactionTemplate(transactionManager);
        tpl.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        for (int attempt = 0; attempt < LOCK_RETRY_MAX; attempt++) {
            try {
                Integer n = tpl.execute(status -> archiveMapper.deleteOlderThanBatch(cutoff, batch));
                return n == null ? 0 : n;
            } catch (CannotAcquireLockException | DeadlockLoserDataAccessException e) {
                log.warn("[遥测归档] DELETE 锁等待 attempt={}/{} err={}", attempt + 1, LOCK_RETRY_MAX, e.getMessage());
                if (attempt >= LOCK_RETRY_MAX - 1) {
                    throw e;
                }
                sleepQuiet(400L * (attempt + 1));
            }
        }
        return 0;
    }

    private static void briefPauseBetweenBatches() {
        sleepQuiet(80);
    }

    private static void sleepQuiet(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    public TelemetryArchiveStorageStatsDto getStorageStats() {
        int days = purgeConfigService.effectiveRetentionDays();
        LocalDateTime cutoff = LocalDateTime.now().minusDays(days);
        long total = approximateRowCount();
        Double sizeMb = null;
        try {
            sizeMb = jdbcTemplate.queryForObject(
                    "SELECT ROUND((data_length + index_length) / 1024 / 1024, 2) "
                            + "FROM information_schema.tables "
                            + "WHERE table_schema = DATABASE() AND table_name = 'telemetry_value_archive'",
                    Double.class);
        } catch (Exception ignored) {
            log.debug("查询归档表大小失败: {}", ignored.getMessage());
        }
        long older = estimateRowsOlderThan(cutoff, total);
        LocalDateTime oldest = null;
        LocalDateTime newest = null;
        try {
            oldest = archiveMapper.selectOldestSampleAt();
            newest = archiveMapper.selectNewestSampleAt();
        } catch (Exception ignored) {
            log.debug("查询归档最旧/最新采样时间失败: {}", ignored.getMessage());
        }
        ZoneId z = ZoneId.systemDefault();
        return TelemetryArchiveStorageStatsDto.builder()
                .totalRows(total)
                .tableSizeMb(sizeMb)
                .oldestSampleAt(oldest == null ? null : oldest.atZone(z).toOffsetDateTime().toString())
                .newestSampleAt(newest == null ? null : newest.atZone(z).toOffsetDateTime().toString())
                .rowsOlderThanRetention(older)
                .effectiveRetentionDays(days)
                .approximate(true)
                .build();
    }

    /** information_schema 估算，避免大表 COUNT(*) 超时 */
    private long approximateRowCount() {
        try {
            Long rows = jdbcTemplate.queryForObject(
                    "SELECT IFNULL(table_rows, 0) FROM information_schema.tables "
                            + "WHERE table_schema = DATABASE() AND table_name = 'telemetry_value_archive'",
                    Long.class);
            return rows == null ? 0 : Math.max(0, rows);
        } catch (Exception e) {
            return safeCountAll();
        }
    }

    /** 若最早样本仍新于 cutoff 则待删为 0；否则返回 -1 表示未知（避免全表 COUNT） */
    private long estimateRowsOlderThan(LocalDateTime cutoff, long approxTotal) {
        try {
            LocalDateTime oldest = archiveMapper.selectOldestSampleAt();
            if (oldest == null || !oldest.isBefore(cutoff)) {
                return 0;
            }
        } catch (Exception ignored) {
            log.debug("估算过期行数时查询最旧采样时间失败: {}", ignored.getMessage());
        }
        return approxTotal > 0 ? -1 : 0;
    }

    private long safeCountAll() {
        try {
            return archiveMapper.countAll();
        } catch (Exception e) {
            return 0;
        }
    }

    private static String trimLen(String s, int max) {
        if (!StringUtils.hasText(s)) {
            return null;
        }
        String t = s.trim();
        return t.length() <= max ? t : t.substring(0, max);
    }

    private static Double parseItemNumeric(String raw) {
        if (!StringUtils.hasText(raw)) {
            return null;
        }
        String t = raw.trim().replace(',', '.');
        var m = LEADING_NUMBER.matcher(t);
        if (m.find()) {
            try {
                return Double.parseDouble(m.group(1));
            } catch (NumberFormatException ignored) {
                return null;
            }
        }
        try {
            return Double.parseDouble(t);
        } catch (NumberFormatException e) {
            return null;
        }
    }

}
