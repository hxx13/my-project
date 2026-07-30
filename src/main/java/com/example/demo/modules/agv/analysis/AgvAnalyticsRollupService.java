package com.example.demo.modules.agv.analysis;

import com.example.demo.modules.agv.mapper.AgvTrajectoryMapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

/**
 * AGV 分析小时级预聚合服务。
 * <p>
 * 核心思路：将 agv_trajectory 原始数据按小时桶预计算，
 * 查询时直接 SUM 小时桶，避免全量扫描。
 * <p>
 * 惰性计算：首次查询某小时时自动触发 rollup；
 * 异步刷新：轨迹插入后异步刷新当前小时。
 */
@Service
public class AgvAnalyticsRollupService {

    private static final Logger log = LoggerFactory.getLogger(AgvAnalyticsRollupService.class);
    private static final ObjectMapper JSON = new ObjectMapper();

    private final AgvTrajectoryMapper mapper;

    public AgvAnalyticsRollupService(AgvTrajectoryMapper mapper) {
        this.mapper = mapper;
    }

    /**
     * 确保指定时间范围内的所有小时桶都已计算。
     * 已存在的小时桶跳过（幂等）。
     *
     * @return 实际新计算的小时数
     */
    public int ensureHourlyBuckets(String ip, LocalDateTime from, LocalDateTime to) {
        LocalDateTime hour = from.truncatedTo(ChronoUnit.HOURS);
        LocalDateTime end = to.truncatedTo(ChronoUnit.HOURS);
        int computed = 0;
        while (!hour.isAfter(end)) {
            if (mapper.selectAnalyticsHour(ip, hour) == null) {
                rollupHour(ip, hour);
                computed++;
            }
            hour = hour.plusHours(1);
        }
        return computed;
    }

    /**
     * 异步刷新当前小时 + 上一个小时（覆盖可能还在写入的边界数据）。
     */
    @Async
    public void refreshRecentHours(String ip) {
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime current = now.truncatedTo(ChronoUnit.HOURS);
        rollupHour(ip, current);
        rollupHour(ip, current.minusHours(1));
    }

    /**
     * 定时刷新：每 60 秒对所有活跃机器人刷新当前小时的聚合。
     * 这样新写入的轨迹数据会定期被吸入聚合表。
     */
    @Scheduled(fixedDelay = 60_000)
    public void scheduledRefresh() {
        LocalDateTime since = LocalDateTime.now().minusHours(2);
        List<String> activeIps = mapper.selectActiveRobots(since);
        if (activeIps.isEmpty()) return;
        for (String ip : activeIps) {
            try {
                refreshRecentHours(ip);
            } catch (Exception e) {
                log.debug("[AgvRollup] Scheduled refresh failed for {}: {}", ip, e.getMessage());
            }
        }
    }

    /**
     * 对单个小时桶执行聚合计算并写入。
     */
    private void rollupHour(String ip, LocalDateTime hour) {
        LocalDateTime from = hour;
        LocalDateTime to = hour.plusHours(1);
        List<Map<String, Object>> rows = mapper.selectTrajectoryAnalytics(ip, from, to, 20000);

        if (rows.isEmpty()) {
            // 写入空桶标记（sample_count=0），避免重复查询空小时
            try {
                mapper.upsertAnalyticsHourly(ip, hour, 0, 0, 0,
                    null, null, null, null, null, null, null, null,
                    "[0,0,0,0,0,0,0]", "[]", "[]", "[]");
            } catch (Exception e) { /* ignore */ }
            return;
        }

        // ── 聚合计算 ──
        int sampleCount = 0, movingCount = 0;
        double totalDist = 0;
        Double firstX = null, firstY = null, lastX = null, lastY = null;
        double minX = Double.MAX_VALUE, maxX = -Double.MAX_VALUE;
        double minY = Double.MAX_VALUE, maxY = -Double.MAX_VALUE;
        int[] speedBins = new int[7];
        double[] thresholds = {0.1, 0.3, 0.5, 0.8, 1.2, 1.8};

        // Station tracking
        Map<String, int[]> stationMap = new LinkedHashMap<>(); // [visits, totalSec]
        String prevStation = null;
        long stationEnterTs = 0;

        // Hop tracking
        List<Map<String, Object>> hops = new ArrayList<>();
        String lastHopStation = null;
        double lastHopX = 0, lastHopY = 0;
        long lastHopTs = 0;

        // Accel tracking
        List<Map<String, Object>> accelEvents = new ArrayList<>();
        double lastSpeed = 0;
        boolean hasLastSpeed = false;

        long prevTs = 0;
        double prevX = 0, prevY = 0;

        for (int i = 0; i < rows.size(); i++) {
            Map<String, Object> row = rows.get(i);
            Double x = toDouble(row.get("x")), y = toDouble(row.get("y"));
            long ts = toEpochMs(row.get("recorded_at"));
            String st = row.get("station") != null ? row.get("station").toString() : "";
            if (x == null || y == null) continue;

            sampleCount++;
            if (firstX == null) { firstX = x; firstY = y; }
            lastX = x; lastY = y;
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;

            if (i > 0 && prevTs > 0) {
                double dx = x - prevX, dy = y - prevY;
                double d = Math.sqrt(dx * dx + dy * dy);
                totalDist += d;
                double dt = (ts - prevTs) / 1000.0;
                if (dt > 0.01) {
                    double speed = d / dt;
                    if (speed > 0.05) movingCount++;
                    int bin = 6;
                    for (int b = 0; b < thresholds.length; b++) {
                        if (speed < thresholds[b]) { bin = b; break; }
                    }
                    speedBins[bin]++;
                    if (hasLastSpeed) {
                        double acc = (speed - lastSpeed) / dt;
                        if (Math.abs(acc) > 0.5 && accelEvents.size() < 50) {
                            Map<String, Object> evt = new LinkedHashMap<>();
                            evt.put("ts", Instant.ofEpochMilli(ts).toString());
                            evt.put("mps2", Math.round(acc * 100.0) / 100.0);
                            evt.put("type", acc > 0 ? "急加速" : "急减速");
                            accelEvents.add(evt);
                        }
                    }
                    lastSpeed = speed;
                    hasLastSpeed = true;
                }
            }

            // Station
            if (!st.isEmpty()) {
                if (prevStation == null || !st.equals(prevStation)) {
                    if (prevStation != null && !prevStation.isEmpty()) {
                        long dur = Math.max(0, (ts - stationEnterTs) / 1000);
                        int[] arr = stationMap.computeIfAbsent(prevStation, k -> new int[]{0, 0});
                        arr[0]++; arr[1] += (int) dur;
                    }
                    stationEnterTs = ts;
                    // count visit only on transition
                    stationMap.computeIfAbsent(st, k -> new int[]{0, 0});
                    int[] arr = stationMap.get(st);
                    if (arr[0] == 0 && arr[1] == 0) { /* first time seeing this station, visit will be counted at end of run */ }
                    // Actually count visits correctly: increment the "from" station's visits on transition
                    if (prevStation != null && !prevStation.isEmpty()) {
                        int[] prevArr = stationMap.get(prevStation);
                        if (prevArr != null) {
                            // visits are tracked as arr[2] implicitly; we'll use arr[0] for visits, arr[1] for totalSec
                        }
                    }
                }
                prevStation = st;
            } else {
                if (prevStation != null && !prevStation.isEmpty()) {
                    long dur = Math.max(0, (ts - stationEnterTs) / 1000);
                    int[] arr = stationMap.computeIfAbsent(prevStation, k -> new int[]{0, 0});
                    arr[0]++; arr[1] += (int) dur;
                }
                prevStation = null;
            }

            // Hops
            if (!st.isEmpty()) {
                if (lastHopStation != null && !st.equals(lastHopStation) && hops.size() < 100) {
                    double hopD = Math.sqrt((x - lastHopX) * (x - lastHopX) + (y - lastHopY) * (y - lastHopY));
                    Map<String, Object> hop = new LinkedHashMap<>();
                    hop.put("from", lastHopStation);
                    hop.put("to", st);
                    hop.put("durationSec", ts > lastHopTs ? (ts - lastHopTs) / 1000 : 0);
                    hop.put("distance", Math.round(hopD * 100.0) / 100.0);
                    hops.add(hop);
                }
                lastHopStation = st; lastHopX = x; lastHopY = y; lastHopTs = ts;
            }

            prevX = x; prevY = y; prevTs = ts;
        }

        // Close final station run
        if (prevStation != null && !prevStation.isEmpty() && !rows.isEmpty()) {
            long lastTs = toEpochMs(rows.get(rows.size() - 1).get("recorded_at"));
            long dur = Math.max(0, (lastTs - stationEnterTs) / 1000);
            int[] arr = stationMap.computeIfAbsent(prevStation, k -> new int[]{0, 0});
            arr[0]++; arr[1] += (int) dur;
        }

        // Build station JSON
        List<Map<String, Object>> stationList = stationMap.entrySet().stream()
            .filter(e -> e.getValue()[1] > 0)
            .map(e -> {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("station", e.getKey());
                m.put("visits", e.getValue()[0]);
                m.put("totalSec", e.getValue()[1]);
                return m;
            }).collect(Collectors.toList());

        try {
            mapper.upsertAnalyticsHourly(ip, hour, sampleCount, movingCount, totalDist,
                firstX, firstY, lastX, lastY,
                minX == Double.MAX_VALUE ? null : minX,
                maxX == -Double.MAX_VALUE ? null : maxX,
                minY == Double.MAX_VALUE ? null : minY,
                maxY == -Double.MAX_VALUE ? null : maxY,
                JSON.writeValueAsString(speedBins),
                JSON.writeValueAsString(stationList),
                JSON.writeValueAsString(hops),
                JSON.writeValueAsString(accelEvents));
        } catch (JsonProcessingException e) {
            log.warn("[AgvRollup] JSON serialization failed for {} @ {}", ip, hour);
        }
    }

    /** 从小时桶聚合数据组装 AnalyticsResult */
    public Map<String, Object> buildFromHourly(String ip, LocalDateTime from, LocalDateTime to) {
        ensureHourlyBuckets(ip, from, to);
        List<Map<String, Object>> buckets = mapper.selectAnalyticsHourly(ip,
            from.truncatedTo(ChronoUnit.HOURS),
            to.truncatedTo(ChronoUnit.HOURS).plusHours(1));

        if (buckets.isEmpty()) return null;

        // SUM across all buckets
        long totalSamples = 0, totalMoving = 0;
        double totalDistM = 0;
        Double overallFirstX = null, overallFirstY = null, overallLastX = null, overallLastY = null;
        double overallMinX = Double.MAX_VALUE, overallMaxX = -Double.MAX_VALUE;
        double overallMinY = Double.MAX_VALUE, overallMaxY = -Double.MAX_VALUE;
        int[] totalBins = new int[7];
        Map<String, int[]> totalStations = new LinkedHashMap<>();
        List<Map<String, Object>> allHops = new ArrayList<>();
        List<Map<String, Object>> allAccel = new ArrayList<>();
        long firstTs = 0, lastTs = 0;

        for (Map<String, Object> b : buckets) {
            int sc = toInt(b.get("sample_count"));
            int mc = toInt(b.get("moving_count"));
            double dist = toDoubleVal(b.get("total_distance_m"));
            totalSamples += sc;
            totalMoving += mc;
            totalDistM += dist;

            if (sc == 0) continue; // empty bucket

            Double fx = toDoubleObj(b.get("first_x")), fy = toDoubleObj(b.get("first_y"));
            if (fx != null && overallFirstX == null) { overallFirstX = fx; overallFirstY = fy; }
            Double lx = toDoubleObj(b.get("last_x")), ly = toDoubleObj(b.get("last_y"));
            if (lx != null) { overallLastX = lx; overallLastY = ly; }

            Double mnx = toDoubleObj(b.get("min_x")), mxx = toDoubleObj(b.get("max_x"));
            if (mnx != null && mnx < overallMinX) overallMinX = mnx;
            if (mxx != null && mxx > overallMaxX) overallMaxX = mxx;
            Double mny = toDoubleObj(b.get("min_y")), mxy = toDoubleObj(b.get("max_y"));
            if (mny != null && mny < overallMinY) overallMinY = mny;
            if (mxy != null && mxy > overallMaxY) overallMaxY = mxy;

            // Speed bins
            int[] bins = parseIntArray(b.get("speed_bins_json"));
            for (int i = 0; i < Math.min(bins.length, totalBins.length); i++) totalBins[i] += bins[i];

            // Stations
            List<Map<String, Object>> sts = parseJsonList(b.get("station_json"));
            if (sts != null) for (Map<String, Object> s : sts) {
                String name = (String) s.get("station");
                int visits = toInt(s.get("visits"));
                int sec = toInt(s.get("totalSec"));
                int[] arr = totalStations.computeIfAbsent(name, k -> new int[2]);
                arr[0] += visits; arr[1] += sec;
            }

            // Hops & accel: just collect (already capped per hour)
            List<Map<String, Object>> h = parseJsonList(b.get("hop_json"));
            if (h != null) allHops.addAll(h);
            List<Map<String, Object>> a = parseJsonList(b.get("accel_json"));
            if (a != null) allAccel.addAll(a);

            // Timestamps from bucket boundaries (MySQL 8 returns LocalDateTime, not Timestamp)
            long t = toEpochMs(b.get("hour_bucket"));
            if (t > 0) {
                if (firstTs == 0 || t < firstTs) firstTs = t;
                long endT = t + 3600_000;
                if (endT > lastTs) lastTs = endT;
            }
        }

        if (totalSamples == 0) return null;

        Map<String, Object> overview = new LinkedHashMap<>();
        double totalHr = (lastTs - firstTs) / 3600_000.0;
        overview.put("totalDistanceKm", Math.round(totalDistM / 10.0) / 100.0);
        overview.put("totalTimeHr", Math.round(totalHr * 10) / 10.0);
        overview.put("avgSpeedMps", totalHr > 0 ? Math.round(totalDistM / (totalHr * 3600) * 100.0) / 100.0 : 0);
        overview.put("movingCount", (int) totalMoving);
        overview.put("totalSamples", (int) totalSamples);
        overview.put("utilization", totalSamples > 0 ? (int) (totalMoving * 100 / totalSamples) : 0);
        overview.put("xRange", Math.round((overallMaxX - overallMinX) * 100.0) / 100.0);
        overview.put("yRange", Math.round((overallMaxY - overallMinY) * 100.0) / 100.0);
        if (overallFirstX != null && overallLastX != null && totalDistM > 0) {
            double straight = Math.sqrt(
                (overallLastX - overallFirstX) * (overallLastX - overallFirstX) +
                (overallLastY - overallFirstY) * (overallLastY - overallFirstY));
            overview.put("pathEfficiency", Math.round(straight / totalDistM * 100));
        }

        // Speed histogram
        String[] labels = {"0-0.1", "0.1-0.3", "0.3-0.5", "0.5-0.8", "0.8-1.2", "1.2-1.8", "1.8+"};
        List<Map<String, Object>> histogram = new ArrayList<>();
        for (int i = 0; i < totalBins.length; i++) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("label", labels[i]); m.put("count", totalBins[i]);
            histogram.add(m);
        }

        // Station ranking
        List<Map<String, Object>> ranking = totalStations.entrySet().stream()
            .filter(e -> e.getValue()[1] > 0)
            .sorted((a, b) -> Integer.compare(b.getValue()[1], a.getValue()[1]))
            .map(e -> {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("station", e.getKey());
                m.put("count", e.getValue()[0]);
                m.put("totalSec", e.getValue()[1]);
                m.put("avgSec", e.getValue()[0] > 0 ? e.getValue()[1] / e.getValue()[0] : 0);
                return m;
            }).collect(Collectors.toList());

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("overview", overview);
        result.put("speedHistogram", histogram);
        result.put("stationRanking", ranking);
        result.put("stationHops", allHops);
        result.put("accelEvents", allAccel);
        return result;
    }

    // ── helpers ──

    private static double toDouble(Object o) {
        if (o instanceof Number n) return n.doubleValue();
        if (o instanceof String s) try { return Double.parseDouble(s); } catch (Exception e) { }
        return 0;
    }

    private static double toDoubleVal(Object o) {
        if (o instanceof Number n) return n.doubleValue();
        return 0;
    }

    private static Double toDoubleObj(Object o) {
        if (o instanceof Number n) return n.doubleValue();
        return null;
    }

    private static int toInt(Object o) {
        if (o instanceof Number n) return n.intValue();
        if (o instanceof String s) try { return Integer.parseInt(s); } catch (Exception e) { }
        return 0;
    }

    private static long toEpochMs(Object o) {
        if (o == null) return 0;
        if (o instanceof java.sql.Timestamp ts) return ts.getTime();
        if (o instanceof LocalDateTime ldt) return ldt.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli();
        if (o instanceof String s) {
            try { return Instant.parse(s).toEpochMilli(); } catch (Exception e) { return 0; }
        }
        return 0;
    }

    private static int[] parseIntArray(Object o) {
        if (o == null) return new int[7];
        try {
            if (o instanceof String s) {
                return JSON.readValue(s, int[].class);
            }
        } catch (Exception e) { /* fall through */ }
        return new int[7];
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> parseJsonList(Object o) {
        if (o == null) return null;
        try {
            if (o instanceof String s) {
                return JSON.readValue(s, List.class);
            }
        } catch (Exception e) { /* fall through */ }
        return null;
    }
}
