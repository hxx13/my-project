package com.example.demo.modules.telemetry.service;

import com.example.demo.modules.telemetry.entity.TelemetryValueArchiveRow;
import com.example.demo.modules.telemetry.entity.TelemetryValueRollupRow;
import com.example.demo.modules.telemetry.mapper.TelemetryValueArchiveMapper;
import com.example.demo.modules.telemetry.mapper.TelemetryValueRollupMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Raw → L1 rollup（5min / 1h bucket）。
 */
@Service
public class TelemetryArchiveRollupService {

    private static final Logger log = LoggerFactory.getLogger(TelemetryArchiveRollupService.class);
    private static final int BUCKET_5MIN = 300;
    private static final int BUCKET_1H = 3600;
    private static final int INSERT_CHUNK = 200;

    private final TelemetryValueArchiveMapper archiveMapper;
    private final TelemetryValueRollupMapper rollupMapper;

    @Value("${app.telemetry.rollup.retention-days:365}")
    private int rollupRetentionDays;

    public TelemetryArchiveRollupService(
            TelemetryValueArchiveMapper archiveMapper,
            TelemetryValueRollupMapper rollupMapper) {
        this.archiveMapper = archiveMapper;
        this.rollupMapper = rollupMapper;
    }

    /** 定时任务入口：增量聚合最近 raw 到 5min/1h rollup */
    public Map<String, Object> runRollupJob() {
        long t0 = System.currentTimeMillis();
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime from5 = now.minusHours(2);
        int upserted5 = rollupWindow(from5, now, BUCKET_5MIN);
        LocalDateTime from1h = now.minusDays(3);
        int upserted1h = rollupWindow(from1h, now, BUCKET_1H);
        LocalDateTime cutoff = now.minusDays(Math.max(30, rollupRetentionDays));
        int deleted = 0;
        try {
            deleted = rollupMapper.deleteOlderThan(cutoff);
        } catch (Exception e) {
            log.warn("[遥测 Rollup] 清理过期 bucket 失败: {}", e.getMessage());
        }
        long ms = System.currentTimeMillis() - t0;
        Map<String, Object> summary = new HashMap<>();
        summary.put("upserted5min", upserted5);
        summary.put("upserted1h", upserted1h);
        summary.put("deletedOld", deleted);
        summary.put("durationMs", ms);
        log.info("[遥测 Rollup] 完成 upsert5={} upsert1h={} deleted={} ms={}", upserted5, upserted1h, deleted, ms);
        return summary;
    }

    private int rollupWindow(LocalDateTime from, LocalDateTime to, int bucketSec) {
        List<String> variables = distinctVariables(from, to);
        int total = 0;
        for (String vn : variables) {
            List<TelemetryValueArchiveRow> rows = archiveMapper.selectSeriesAsc(vn, from, to);
            if (rows == null || rows.isEmpty()) {
                continue;
            }
            Map<LocalDateTime, BucketAcc> buckets = new HashMap<>();
            for (TelemetryValueArchiveRow r : rows) {
                if (r.getSampleAt() == null || r.getNumericValue() == null) {
                    continue;
                }
                LocalDateTime bucketStart = truncateToBucket(r.getSampleAt(), bucketSec);
                buckets.computeIfAbsent(bucketStart, k -> new BucketAcc())
                        .accept(r.getNumericValue());
            }
            List<TelemetryValueRollupRow> batch = new ArrayList<>();
            for (Map.Entry<LocalDateTime, BucketAcc> e : buckets.entrySet()) {
                BucketAcc acc = e.getValue();
                if (acc.count == 0) {
                    continue;
                }
                TelemetryValueRollupRow row = new TelemetryValueRollupRow();
                row.setBucketStart(e.getKey());
                row.setBucketSec(bucketSec);
                row.setVariableName(vn);
                row.setMinValue(acc.min);
                row.setMaxValue(acc.max);
                row.setAvgValue(acc.sum / acc.count);
                row.setSampleCount(acc.count);
                batch.add(row);
                if (batch.size() >= INSERT_CHUNK) {
                    rollupMapper.upsertBatch(batch);
                    total += batch.size();
                    batch.clear();
                }
            }
            if (!batch.isEmpty()) {
                rollupMapper.upsertBatch(batch);
                total += batch.size();
            }
        }
        return total;
    }

    private List<String> distinctVariables(LocalDateTime from, LocalDateTime to) {
        try {
            var rows = archiveMapper.selectPageByFilter(null, from, to, 0, 5000);
            List<String> out = new ArrayList<>();
            java.util.Set<String> seen = new java.util.LinkedHashSet<>();
            if (rows != null) {
                for (TelemetryValueArchiveRow r : rows) {
                    if (r != null && StringUtils.hasText(r.getVariableName())) {
                        seen.add(r.getVariableName().trim());
                    }
                }
            }
            out.addAll(seen);
            return out;
        } catch (Exception e) {
            log.warn("[遥测 Rollup] 列举变量失败: {}", e.getMessage());
            return List.of();
        }
    }

    private static LocalDateTime truncateToBucket(LocalDateTime t, int bucketSec) {
        if (bucketSec >= 3600) {
            return t.truncatedTo(ChronoUnit.HOURS);
        }
        int minute = t.getMinute();
        int bucketMin = (minute / 5) * 5;
        return t.withMinute(bucketMin).withSecond(0).withNano(0);
    }

    private static final class BucketAcc {
        double min = Double.POSITIVE_INFINITY;
        double max = Double.NEGATIVE_INFINITY;
        double sum;
        int count;

        void accept(double v) {
            if (!Double.isFinite(v)) {
                return;
            }
            min = Math.min(min, v);
            max = Math.max(max, v);
            sum += v;
            count++;
        }
    }
}
