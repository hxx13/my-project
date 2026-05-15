package com.example.demo.modules.telemetry.service;

import com.example.demo.modules.telemetry.dto.TelemetryTagItemDto;
import com.example.demo.modules.telemetry.dto.archive.TelemetryArchiveAdminRowDto;
import com.example.demo.modules.telemetry.dto.archive.TelemetryArchivePointDto;
import com.example.demo.modules.telemetry.dto.archive.TelemetryArchiveQueryPageDto;
import com.example.demo.modules.telemetry.dto.archive.TelemetryArchiveSeriesDto;
import com.example.demo.modules.telemetry.entity.TelemetryValueArchiveRow;
import com.example.demo.modules.telemetry.mapper.TelemetryValueArchiveMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.Instant;
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
    private static final Pattern LEADING_NUMBER = Pattern.compile("^(-?\\d+(?:\\.\\d*)?)");

    private final TelemetryValueArchiveMapper archiveMapper;

    @Value("${app.telemetry.archive.enabled:true}")
    private boolean enabled;

    @Value("${app.telemetry.archive.retention-days:30}")
    private int retentionDays;

    public TelemetryArchiveService(TelemetryValueArchiveMapper archiveMapper) {
        this.archiveMapper = archiveMapper;
    }

    @Async
    public void appendAfterRefresh(List<TelemetryTagItemDto> items, Instant sampleAt, String ingestBatchId) {
        if (!enabled || items == null || items.isEmpty()) {
            return;
        }
        try {
            java.time.LocalDateTime at = java.time.LocalDateTime.ofInstant(sampleAt, ZoneId.systemDefault());
            List<TelemetryValueArchiveRow> batch = new ArrayList<>();
            for (TelemetryTagItemDto it : items) {
                if (it == null || !StringUtils.hasText(it.getVariableName())) {
                    continue;
                }
                String vn = it.getVariableName().trim();
                if (vn.length() > 500) {
                    vn = vn.substring(0, 500);
                }
                TelemetryValueArchiveRow r = new TelemetryValueArchiveRow();
                r.setSampleAt(at);
                r.setVariableName(vn);
                r.setRawValue(trimLen(it.getValue(), 500));
                r.setNumericValue(parseItemNumeric(it.getValue()));
                r.setMetricKindCode(trimLen(it.getMetricKindCode(), 64));
                r.setRoomCanonical(trimLen(it.getRoomCanonical(), 256));
                r.setBundleCode(trimLen(it.getBundleCode(), 128));
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

    @Transactional
    public int purgeExpired() {
        if (!enabled || retentionDays <= 0) {
            return 0;
        }
        java.time.LocalDateTime cutoff = java.time.LocalDateTime.now().minusDays(retentionDays);
        return archiveMapper.deleteOlderThan(cutoff);
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
