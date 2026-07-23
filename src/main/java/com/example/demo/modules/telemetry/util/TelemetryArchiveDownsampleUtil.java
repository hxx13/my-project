package com.example.demo.modules.telemetry.util;

import com.example.demo.modules.telemetry.dto.archive.TelemetryArchivePointDto;
import com.example.demo.modules.telemetry.entity.TelemetryValueArchiveRow;
import org.springframework.util.StringUtils;

import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * 归档序列降采样：STANDARD=min-max bucket；PRESENTATION=LTTB+EMA。
 */
public final class TelemetryArchiveDownsampleUtil {

    private TelemetryArchiveDownsampleUtil() {
    }

    public enum DisplayProfile {
        STANDARD,
        PRESENTATION
    }

    public static List<TelemetryArchivePointDto> downsample(
            List<TelemetryValueArchiveRow> rows,
            int maxPoints,
            DisplayProfile profile) {
        if (rows == null || rows.isEmpty()) {
            return List.of();
        }
        ZoneId z = ZoneId.systemDefault();
        List<IndexedPoint> pts = new ArrayList<>(rows.size());
        for (int i = 0; i < rows.size(); i++) {
            TelemetryValueArchiveRow r = rows.get(i);
            Double v = resolveNumeric(r);
            if (r.getSampleAt() == null || v == null || !Double.isFinite(v)) {
                continue;
            }
            long tMs = r.getSampleAt().atZone(z).toInstant().toEpochMilli();
            pts.add(new IndexedPoint(i, tMs, v, r, z));
        }
        if (pts.isEmpty()) {
            return List.of();
        }
        if (pts.size() <= maxPoints) {
            return pts.stream().map(p -> p.toDto()).toList();
        }
        if (profile == DisplayProfile.PRESENTATION) {
            pts = applyEma(pts, 5);
            return lttb(pts, maxPoints);
        }
        return minMaxBucket(pts, maxPoints);
    }

    /** Rollup 行转点序列后再降采样（avg 作为 value） */
    public static List<TelemetryArchivePointDto> downsampleRollupPoints(
            List<TelemetryArchivePointDto> raw,
            int maxPoints,
            DisplayProfile profile) {
        if (raw == null || raw.isEmpty()) {
            return List.of();
        }
        if (raw.size() <= maxPoints) {
            return profile == DisplayProfile.PRESENTATION ? applyEmaOnDto(raw, 5) : raw;
        }
        List<IndexedPoint> pts = new ArrayList<>();
        ZoneId z = ZoneId.systemDefault();
        for (int i = 0; i < raw.size(); i++) {
            TelemetryArchivePointDto p = raw.get(i);
            if (p.getT() == null || p.getValue() == null || !Double.isFinite(p.getValue())) {
                continue;
            }
            long tMs = java.time.OffsetDateTime.parse(p.getT()).toInstant().toEpochMilli();
            pts.add(new IndexedPoint(i, tMs, p.getValue(), null, z));
        }
        if (pts.size() <= maxPoints) {
            return pts.stream().map(IndexedPoint::toDto).toList();
        }
        if (profile == DisplayProfile.PRESENTATION) {
            pts = applyEma(pts, 5);
            return lttb(pts, maxPoints);
        }
        return minMaxBucket(pts, maxPoints);
    }

    private static List<TelemetryArchivePointDto> applyEmaOnDto(List<TelemetryArchivePointDto> raw, int window) {
        if (raw.size() <= 1 || window <= 1) {
            return raw;
        }
        double alpha = 2.0 / (window + 1);
        Double prev = null;
        List<TelemetryArchivePointDto> out = new ArrayList<>(raw.size());
        for (TelemetryArchivePointDto p : raw) {
            Double v = p.getValue();
            if (v == null || !Double.isFinite(v)) {
                out.add(p);
                continue;
            }
            if (prev == null) {
                prev = v;
            } else {
                prev = alpha * v + (1 - alpha) * prev;
            }
            out.add(TelemetryArchivePointDto.builder().t(p.getT()).value(prev).build());
        }
        return out;
    }

    private static List<IndexedPoint> applyEma(List<IndexedPoint> pts, int window) {
        if (pts.size() <= 1 || window <= 1) {
            return pts;
        }
        double alpha = 2.0 / (window + 1);
        double prev = pts.get(0).value;
        List<IndexedPoint> out = new ArrayList<>(pts.size());
        for (IndexedPoint p : pts) {
            prev = alpha * p.value + (1 - alpha) * prev;
            out.add(new IndexedPoint(p.srcIndex, p.tMs, prev, p.row, p.zone));
        }
        return out;
    }

    /** Min-Max per time bucket：保留尖峰 */
    private static List<TelemetryArchivePointDto> minMaxBucket(List<IndexedPoint> pts, int maxPoints) {
        int bucketCount = Math.max(1, maxPoints / 2);
        long tMin = pts.get(0).tMs;
        long tMax = pts.get(pts.size() - 1).tMs;
        if (tMax <= tMin) {
            return pts.stream().map(IndexedPoint::toDto).toList();
        }
        double span = (double) (tMax - tMin);
        List<List<IndexedPoint>> buckets = new ArrayList<>(bucketCount);
        for (int i = 0; i < bucketCount; i++) {
            buckets.add(new ArrayList<>());
        }
        for (IndexedPoint p : pts) {
            int b = (int) Math.min(bucketCount - 1, Math.floor((p.tMs - tMin) / span * bucketCount));
            buckets.get(b).add(p);
        }
        List<TelemetryArchivePointDto> out = new ArrayList<>();
        for (List<IndexedPoint> bucket : buckets) {
            if (bucket.isEmpty()) {
                continue;
            }
            IndexedPoint minP = bucket.stream().min(Comparator.comparingDouble(x -> x.value)).orElse(bucket.get(0));
            IndexedPoint maxP = bucket.stream().max(Comparator.comparingDouble(x -> x.value)).orElse(bucket.get(0));
            if (minP.tMs <= maxP.tMs) {
                out.add(minP.toDto());
                if (minP != maxP) {
                    out.add(maxP.toDto());
                }
            } else {
                out.add(maxP.toDto());
                out.add(minP.toDto());
            }
        }
        out.sort(Comparator.comparing(p -> p.getT() == null ? "" : p.getT()));
        if (out.size() > maxPoints) {
            return uniformPick(out, maxPoints);
        }
        return out;
    }

    /** LTTB (Largest Triangle Three Buckets) */
    private static List<TelemetryArchivePointDto> lttb(List<IndexedPoint> pts, int threshold) {
        if (threshold >= pts.size() || threshold < 3) {
            return pts.stream().map(IndexedPoint::toDto).toList();
        }
        List<TelemetryArchivePointDto> sampled = new ArrayList<>(threshold);
        sampled.add(pts.get(0).toDto());
        int bucketSize = (pts.size() - 2) / (threshold - 2);
        int a = 0;
        for (int i = 0; i < threshold - 2; i++) {
            int rangeStart = (i + 1) * bucketSize + 1;
            int rangeEnd = Math.min((i + 2) * bucketSize + 1, pts.size());
            int rangeOffs = (rangeStart + rangeEnd) / 2;
            double avgX = 0;
            double avgY = 0;
            int avgRangeCount = rangeEnd - rangeStart;
            for (int j = rangeStart; j < rangeEnd; j++) {
                avgX += pts.get(j).tMs;
                avgY += pts.get(j).value;
            }
            if (avgRangeCount > 0) {
                avgX /= avgRangeCount;
                avgY /= avgRangeCount;
            }
            int rangeLo = i * bucketSize + 1;
            int rangeHi = Math.min((i + 1) * bucketSize + 1, pts.size());
            double maxArea = -1;
            int maxIdx = rangeLo;
            IndexedPoint pa = pts.get(a);
            for (int j = rangeLo; j < rangeHi; j++) {
                IndexedPoint pj = pts.get(j);
                double area = Math.abs(
                        (pa.tMs - avgX) * (pj.value - pa.value) - (pa.tMs - pj.tMs) * (avgY - pa.value));
                if (area > maxArea) {
                    maxArea = area;
                    maxIdx = j;
                }
            }
            sampled.add(pts.get(maxIdx).toDto());
            a = maxIdx;
        }
        sampled.add(pts.get(pts.size() - 1).toDto());
        return sampled;
    }

    private static List<TelemetryArchivePointDto> uniformPick(List<TelemetryArchivePointDto> pts, int maxPoints) {
        if (pts.size() <= maxPoints) {
            return pts;
        }
        List<TelemetryArchivePointDto> out = new ArrayList<>(maxPoints);
        int last = pts.size() - 1;
        for (int i = 0; i < maxPoints; i++) {
            int idx = (int) Math.round(i * last / (double) (maxPoints - 1));
            out.add(pts.get(idx));
        }
        return out;
    }

    private static Double resolveNumeric(TelemetryValueArchiveRow r) {
        Double v = r.getNumericValue();
        if (v != null) {
            return v;
        }
        if (StringUtils.hasText(r.getRawValue())) {
            try {
                return Double.parseDouble(r.getRawValue().trim().replace(',', '.'));
            } catch (NumberFormatException ignored) {
                return null;
            }
        }
        return null;
    }

    private record IndexedPoint(int srcIndex, long tMs, double value, TelemetryValueArchiveRow row, ZoneId zone) {
        TelemetryArchivePointDto toDto() {
            if (row != null && row.getSampleAt() != null) {
                String t = row.getSampleAt().atZone(zone).toOffsetDateTime().toString();
                return TelemetryArchivePointDto.builder().t(t).value(value).build();
            }
            return TelemetryArchivePointDto.builder()
                    .t(java.time.Instant.ofEpochMilli(tMs).atZone(zone).toOffsetDateTime().toString())
                    .value(value)
                    .build();
        }
    }
}
