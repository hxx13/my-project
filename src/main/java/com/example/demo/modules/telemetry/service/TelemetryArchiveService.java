package com.example.demo.modules.telemetry.service;

import com.example.demo.modules.telemetry.dto.TelemetryWatchlistEnrichment;
import com.example.demo.modules.telemetry.dto.archive.TelemetryArchiveAdminRowDto;
import com.example.demo.modules.telemetry.dto.archive.TelemetryArchiveIngestItem;
import com.example.demo.modules.telemetry.dto.archive.TelemetryArchivePointDto;
import com.example.demo.modules.telemetry.dto.archive.TelemetryArchivePurgeResultDto;
import com.example.demo.modules.telemetry.dto.archive.TelemetryArchiveQueryPageDto;
import com.example.demo.modules.telemetry.dto.archive.TelemetryArchiveSeriesDto;
import com.example.demo.modules.telemetry.dto.archive.TelemetryArchiveStorageStatsDto;
import com.example.demo.modules.twin.common.support.TwinTimingDiagnostics;
import com.example.demo.modules.telemetry.dto.archive.TelemetryArchiveSeriesBatchDto;
import com.example.demo.modules.telemetry.dto.archive.TelemetryFleetAggRow;
import com.example.demo.modules.telemetry.dto.archive.TelemetryFleetMatrixCellDto;
import com.example.demo.modules.telemetry.dto.archive.TelemetryFleetMatrixDto;
import com.example.demo.modules.telemetry.dto.archive.TelemetryPartitionSummaryDto;
import com.example.demo.modules.telemetry.dto.watchlist.TelemetryGlobalAlarmLimitsDto;
import com.example.demo.modules.telemetry.entity.TelemetryValueRollupRow;
import com.example.demo.modules.telemetry.mapper.TelemetryValueRollupMapper;
import com.example.demo.modules.telemetry.util.TelemetryArchiveDownsampleUtil;
import com.example.demo.modules.telemetry.util.TelemetryArchiveDownsampleUtil.DisplayProfile;
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
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.time.temporal.ChronoUnit;
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

    private static final long ROLLUP_AUTO_HOURS = 48;

    private final TelemetryValueArchiveMapper archiveMapper;
    private final TelemetryValueRollupMapper rollupMapper;
    private final TelemetryArchivePurgeConfigService purgeConfigService;
    private final TelemetryDisplayProfileService displayProfileService;
    private final TelemetryGlobalAlarmLimitsService globalAlarmLimitsService;
    private final TelemetryWatchlistDbService watchlistDbService;
    private final org.springframework.jdbc.core.JdbcTemplate jdbcTemplate;
    private final PlatformTransactionManager transactionManager;

    @Value("${app.telemetry.archive.enabled:true}")
    private boolean enabled;

    @Value("${app.telemetry.archive.retention-days:30}")
    private int retentionDays;

    public TelemetryArchiveService(
            TelemetryValueArchiveMapper archiveMapper,
            TelemetryValueRollupMapper rollupMapper,
            TelemetryArchivePurgeConfigService purgeConfigService,
            TelemetryDisplayProfileService displayProfileService,
            TelemetryGlobalAlarmLimitsService globalAlarmLimitsService,
            TelemetryWatchlistDbService watchlistDbService,
            org.springframework.jdbc.core.JdbcTemplate jdbcTemplate,
            PlatformTransactionManager transactionManager) {
        this.archiveMapper = archiveMapper;
        this.rollupMapper = rollupMapper;
        this.purgeConfigService = purgeConfigService;
        this.displayProfileService = displayProfileService;
        this.globalAlarmLimitsService = globalAlarmLimitsService;
        this.watchlistDbService = watchlistDbService;
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

    public TelemetryArchiveSeriesDto querySeries(String variableName,
                                                 java.time.LocalDateTime from,
                                                 java.time.LocalDateTime to,
                                                 int maxPoints,
                                                 String seriesScope,
                                                 Integer windowHours,
                                                 String displayProfile,
                                                 Boolean fromRollup) {
        ResolvedWindow w = resolveWindow(from, to, seriesScope, windowHours);
        String profile = normalizeProfile(displayProfile);
        int cap = resolveMaxPoints(maxPoints, profile);
        DisplayProfile dp = toDisplayProfile(profile);
        boolean useRollup = shouldUseRollup(w.effFrom, w.effTo, fromRollup);
        List<TelemetryArchivePointDto> points;
        if (useRollup) {
            int bucketSec = windowSpanHours(w) > 168 ? 3600 : 300;
            points = queryRollupPoints(variableName, w.effFrom, w.effTo, cap, dp, bucketSec);
        } else {
            List<TelemetryValueArchiveRow> rows = archiveMapper.selectSeriesAsc(trimVar(variableName), w.effFrom, w.effTo);
            points = TelemetryArchiveDownsampleUtil.downsample(rows, cap, dp);
        }
        return TelemetryArchiveSeriesDto.builder()
                .variableName(trimVar(variableName))
                .points(points)
                .displayProfile(profile)
                .fromRollup(useRollup)
                .queriedFrom(w.qFrom)
                .queriedTo(w.qTo)
                .build();
    }

    /** 兼容旧签名 */
    public TelemetryArchiveSeriesDto querySeries(String variableName,
                                                 java.time.LocalDateTime from,
                                                 java.time.LocalDateTime to,
                                                 int maxPoints,
                                                 String seriesScope,
                                                 Integer windowHours) {
        return querySeries(variableName, from, to, maxPoints, seriesScope, windowHours, "STANDARD", null);
    }

    public TelemetryArchiveSeriesBatchDto querySeriesBatch(
            List<String> variableNames,
            java.time.LocalDateTime from,
            java.time.LocalDateTime to,
            int maxPoints,
            String seriesScope,
            Integer windowHours,
            String displayProfile,
            Boolean fromRollup) {
        if (variableNames == null || variableNames.isEmpty()) {
            throw new IllegalArgumentException("variableNames 不能为空");
        }
        List<TelemetryArchiveSeriesDto> series = new ArrayList<>();
        ResolvedWindow w = resolveWindow(from, to, seriesScope, windowHours);
        String profile = normalizeProfile(displayProfile);
        for (String vn : variableNames) {
            if (!StringUtils.hasText(vn)) {
                continue;
            }
            series.add(querySeries(vn, w.effFrom, w.effTo, maxPoints, "RANGE", null, profile, fromRollup));
        }
        return TelemetryArchiveSeriesBatchDto.builder()
                .displayProfile(profile)
                .queriedFrom(w.qFrom)
                .queriedTo(w.qTo)
                .series(series)
                .build();
    }

    public TelemetryFleetMatrixDto queryFleetMatrix(
            java.time.LocalDateTime from,
            java.time.LocalDateTime to,
            String metricKindCode,
            String floorFilter) {
        return queryFleetMatrix(from, to, metricKindCode, floorFilter, false);
    }

    public TelemetryFleetMatrixDto queryFleetMatrix(
            java.time.LocalDateTime from,
            java.time.LocalDateTime to,
            String metricKindCode,
            String floorFilter,
            boolean debug) {
        if (from == null || to == null) {
            throw new IllegalArgumentException("from/to 不能为空");
        }
        if (to.isBefore(from)) {
            throw new IllegalArgumentException("to 不能早于 from");
        }
        ZoneId z = ZoneId.systemDefault();
        String metric = StringUtils.hasText(metricKindCode) ? metricKindCode.trim().toUpperCase() : null;
        String floor = StringUtils.hasText(floorFilter) ? floorFilter.trim() : null;
        List<TelemetryFleetAggRow> rows = archiveMapper.selectFleetAgg(from, to, metric, floor);
        TelemetryGlobalAlarmLimitsDto limits = globalAlarmLimitsService.load();
        TelemetryWatchlistEnrichment enrichment = watchlistDbService.loadActiveWatchlistEnrichment();
        List<TelemetryFleetMatrixCellDto> cells = new ArrayList<>();
        if (rows != null) {
            for (TelemetryFleetAggRow r : rows) {
                cells.add(buildFleetCell(r, limits, enrichment));
            }
        }
        if (debug) {
            log.info(
                    "[telemetry-insights] fleet-matrix from={} to={} metric={} floor={} rawRows={} cells={}",
                    from,
                    to,
                    metric,
                    floor,
                    rows == null ? 0 : rows.size(),
                    cells.size());
        }
        return TelemetryFleetMatrixDto.builder()
                .queriedFrom(from.atZone(z).toOffsetDateTime().toString())
                .queriedTo(to.atZone(z).toOffsetDateTime().toString())
                .metricKindCode(metric)
                .floorFilter(floor)
                .cells(cells)
                .build();
    }

    public List<TelemetryPartitionSummaryDto> queryPartitionSummary(
            java.time.LocalDateTime from,
            java.time.LocalDateTime to,
            String metricKindCode,
            String floorFilter,
            String displayProfile) {
        if (from == null || to == null) {
            throw new IllegalArgumentException("from/to 不能为空");
        }
        ZoneId z = ZoneId.systemDefault();
        String metric = StringUtils.hasText(metricKindCode) ? metricKindCode.trim().toUpperCase() : null;
        String floor = StringUtils.hasText(floorFilter) ? floorFilter.trim() : null;
        List<TelemetryValueArchiveRow> samples = archiveMapper.selectPartitionBucketSamples(from, to, metric, floor);
        Map<String, Map<Long, List<Double>>> partitionBuckets = new LinkedHashMap<>();
        for (TelemetryValueArchiveRow r : samples) {
            if (r.getSampleAt() == null || r.getNumericValue() == null) {
                continue;
            }
            String pk = partitionKey(r.getRoomCanonical());
            long bucketMs = r.getSampleAt().atZone(z).toInstant().toEpochMilli();
            bucketMs = bucketMs - (bucketMs % (15 * 60_000L));
            partitionBuckets.computeIfAbsent(pk, k -> new TreeMap<>())
                    .computeIfAbsent(bucketMs, k -> new ArrayList<>())
                    .add(r.getNumericValue());
        }
        List<TelemetryPartitionSummaryDto> out = new ArrayList<>();
        String qFrom = from.atZone(z).toOffsetDateTime().toString();
        String qTo = to.atZone(z).toOffsetDateTime().toString();
        for (Map.Entry<String, Map<Long, List<Double>>> pe : partitionBuckets.entrySet()) {
            List<TelemetryArchivePointDto> medianPts = new ArrayList<>();
            List<TelemetryArchivePointDto> p90Pts = new ArrayList<>();
            for (Map.Entry<Long, List<Double>> be : pe.getValue().entrySet()) {
                List<Double> vals = be.getValue();
                vals.sort(Double::compareTo);
                double med = percentile(vals, 0.5);
                double p90 = percentile(vals, 0.9);
                String t = java.time.Instant.ofEpochMilli(be.getKey()).atZone(z).toOffsetDateTime().toString();
                medianPts.add(TelemetryArchivePointDto.builder().t(t).value(med).build());
                p90Pts.add(TelemetryArchivePointDto.builder().t(t).value(p90).build());
            }
            out.add(TelemetryPartitionSummaryDto.builder()
                    .partitionKey(pe.getKey())
                    .partitionLabel(pe.getKey())
                    .metricKindCode(metric)
                    .medianPoints(medianPts)
                    .p90Points(p90Pts)
                    .queriedFrom(qFrom)
                    .queriedTo(qTo)
                    .build());
        }
        return out;
    }

    private TelemetryFleetMatrixCellDto buildFleetCell(
            TelemetryFleetAggRow r,
            TelemetryGlobalAlarmLimitsDto limits,
            TelemetryWatchlistEnrichment enrichment) {
        Double minL = null;
        Double maxL = null;
        String mk = r.getMetricKindCode() == null ? "" : r.getMetricKindCode().trim().toUpperCase();
        if (mk.contains("TEMP") || "T".equals(mk)) {
            minL = parseLimit(limits.getTempMin());
            maxL = parseLimit(limits.getTempMax());
        } else if (mk.contains("HUM") || mk.contains("RH") || "H".equals(mk)) {
            minL = parseLimit(limits.getHumMin());
            maxL = parseLimit(limits.getHumMax());
        } else if (mk.contains("PRESS") || mk.contains("PA") || "P".equals(mk)) {
            minL = parseLimit(limits.getPressureMin());
            maxL = parseLimit(limits.getPressureMax());
        }
        Double latest = r.getLatestValue();
        String status = "UNKNOWN";
        Double deviation = null;
        if (latest != null && minL != null && maxL != null) {
            if (latest < minL) {
                status = "LOW";
                deviation = minL - latest;
            } else if (latest > maxL) {
                status = "HIGH";
                deviation = latest - maxL;
            } else {
                status = "OK";
                deviation = 0.0;
            }
        }
        double compliance = 1.0;
        if (latest != null && minL != null && maxL != null && (latest < minL || latest > maxL)) {
            compliance = 0.0;
        }
        String vn = r.getVariableName();
        String displayLabel = resolveWatchlistLabel(enrichment, vn);
        if (!StringUtils.hasText(displayLabel) && StringUtils.hasText(r.getRoomCanonical())) {
            displayLabel = r.getRoomCanonical();
        }
        String floorCode = resolveWatchlistField(enrichment.getFloorCodeByVariable(), vn);
        String bundleCode = resolveWatchlistField(enrichment.getBundleCodeByVariable(), vn);
        return TelemetryFleetMatrixCellDto.builder()
                .roomCanonical(r.getRoomCanonical())
                .metricKindCode(r.getMetricKindCode())
                .variableName(vn)
                .displayLabel(displayLabel)
                .floorCode(floorCode)
                .bundleCode(bundleCode)
                .latestValue(latest)
                .minValue(r.getMinValue())
                .maxValue(r.getMaxValue())
                .avgValue(r.getAvgValue())
                .sampleCount(r.getSampleCount())
                .complianceRate(compliance)
                .complianceStatus(status)
                .maxDeviation(deviation)
                .build();
    }

    private static String resolveWatchlistLabel(TelemetryWatchlistEnrichment enrichment, String variableName) {
        if (enrichment == null || !StringUtils.hasText(variableName)) {
            return null;
        }
        String hit = enrichment.getDisplayLabelByVariable().get(variableName.trim());
        if (StringUtils.hasText(hit)) {
            return hit.trim();
        }
        for (Map.Entry<String, String> e : enrichment.getDisplayLabelByVariable().entrySet()) {
            if (e.getKey() != null && e.getKey().equalsIgnoreCase(variableName.trim()) && StringUtils.hasText(e.getValue())) {
                return e.getValue().trim();
            }
        }
        return null;
    }

    private static String resolveWatchlistField(Map<String, String> map, String variableName) {
        if (map == null || map.isEmpty() || !StringUtils.hasText(variableName)) {
            return null;
        }
        String hit = map.get(variableName.trim());
        if (StringUtils.hasText(hit)) {
            return hit.trim();
        }
        for (Map.Entry<String, String> e : map.entrySet()) {
            if (e.getKey() != null && e.getKey().equalsIgnoreCase(variableName.trim()) && StringUtils.hasText(e.getValue())) {
                return e.getValue().trim();
            }
        }
        return null;
    }

    private List<TelemetryArchivePointDto> queryRollupPoints(
            String variableName, LocalDateTime from, LocalDateTime to, int cap, DisplayProfile dp, int bucketSec) {
        ZoneId z = ZoneId.systemDefault();
        List<TelemetryValueRollupRow> rows;
        try {
            rows = rollupMapper.selectSeriesAsc(trimVar(variableName), from, to, bucketSec);
        } catch (Exception e) {
            log.debug("[遥测归档] rollup 查询失败，回退 raw: {}", e.getMessage());
            rows = List.of();
        }
        if (rows == null || rows.isEmpty()) {
            List<TelemetryValueArchiveRow> raw = archiveMapper.selectSeriesAsc(trimVar(variableName), from, to);
            return TelemetryArchiveDownsampleUtil.downsample(raw, cap, dp);
        }
        List<TelemetryArchivePointDto> rawPts = new ArrayList<>();
        for (TelemetryValueRollupRow r : rows) {
            if (r.getBucketStart() == null || r.getAvgValue() == null) {
                continue;
            }
            String t = r.getBucketStart().atZone(z).toOffsetDateTime().toString();
            rawPts.add(TelemetryArchivePointDto.builder().t(t).value(r.getAvgValue()).build());
        }
        return TelemetryArchiveDownsampleUtil.downsampleRollupPoints(rawPts, cap, dp);
    }

    private static double percentile(List<Double> sorted, double p) {
        if (sorted.isEmpty()) {
            return Double.NaN;
        }
        if (sorted.size() == 1) {
            return sorted.get(0);
        }
        double idx = p * (sorted.size() - 1);
        int lo = (int) Math.floor(idx);
        int hi = (int) Math.ceil(idx);
        if (lo == hi) {
            return sorted.get(lo);
        }
        double w = idx - lo;
        return sorted.get(lo) * (1 - w) + sorted.get(hi) * w;
    }

    private static String partitionKey(String roomCanonical) {
        if (!StringUtils.hasText(roomCanonical)) {
            return "_unknown";
        }
        String rc = roomCanonical.trim();
        int dash = rc.indexOf('-');
        return dash > 0 ? rc.substring(0, dash) : rc;
    }

    private static Double parseLimit(String s) {
        if (!StringUtils.hasText(s)) {
            return null;
        }
        try {
            return Double.parseDouble(s.trim().replace(',', '.'));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private boolean shouldUseRollup(LocalDateTime from, LocalDateTime to, Boolean fromRollup) {
        if (Boolean.FALSE.equals(fromRollup)) {
            return false;
        }
        if (Boolean.TRUE.equals(fromRollup)) {
            return true;
        }
        return ChronoUnit.HOURS.between(from, to) > ROLLUP_AUTO_HOURS;
    }

    private static long windowSpanHours(ResolvedWindow w) {
        return ChronoUnit.HOURS.between(w.effFrom, w.effTo);
    }

    private int resolveMaxPoints(int maxPoints, String profile) {
        if (maxPoints > 0 && maxPoints != 120) {
            return Math.min(500, Math.max(2, maxPoints));
        }
        return displayProfileService.resolveMaxPoints(profile);
    }

    private static String normalizeProfile(String displayProfile) {
        if (!StringUtils.hasText(displayProfile)) {
            return "STANDARD";
        }
        String p = displayProfile.trim().toUpperCase();
        return "PRESENTATION".equals(p) ? "PRESENTATION" : "STANDARD";
    }

    private static DisplayProfile toDisplayProfile(String profile) {
        return "PRESENTATION".equals(profile) ? DisplayProfile.PRESENTATION : DisplayProfile.STANDARD;
    }

    private String trimVar(String variableName) {
        if (!StringUtils.hasText(variableName)) {
            throw new IllegalArgumentException("variableName 不能为空");
        }
        String vn = variableName.trim();
        return vn.length() > 500 ? vn.substring(0, 500) : vn;
    }

    private ResolvedWindow resolveWindow(
            LocalDateTime from, LocalDateTime to, String seriesScope, Integer windowHours) {
        ZoneId z = ZoneId.systemDefault();
        LocalDateTime effFrom;
        LocalDateTime effTo;
        if (StringUtils.hasText(seriesScope) && "ROLLING".equalsIgnoreCase(seriesScope.trim())) {
            int wh = windowHours == null ? 6 : Math.min(168, Math.max(1, windowHours));
            effTo = LocalDateTime.now(z);
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
        return new ResolvedWindow(
                effFrom,
                effTo,
                effFrom.atZone(z).toOffsetDateTime().toString(),
                effTo.atZone(z).toOffsetDateTime().toString());
    }

    private record ResolvedWindow(
            LocalDateTime effFrom, LocalDateTime effTo, String qFrom, String qTo) {
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
