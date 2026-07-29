package com.example.demo.modules.agv.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.agv.mapper.AgvTrajectoryMapper;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * AGV 数据分析接口。后端 SQL 聚合 + Java 计算，避免前端拉全量原始数据。
 */
@RestController
@RequestMapping("/api/v1/agv/analytics")
@Tag(name = "AGV 数据分析", description = "速度/效率/能耗/利用率/站点/加速度")
public class AgvAnalyticsController {

    private final AgvTrajectoryMapper mapper;

    public AgvAnalyticsController(AgvTrajectoryMapper mapper) {
        this.mapper = mapper;
    }

    // ── 请求参数 ──
    public record AnalyticsRequest(String from, String to, String ip, int sampleLimit) {}

    // ── 响应 ──
    public static class AnalyticsResult {
        public Map<String, Object> overview;
        public List<Map<String, Object>> speedHistogram;
        public List<Map<String, Object>> stationRanking;
        public List<Map<String, Object>> stationHops;
        public List<Map<String, Object>> accelEvents;
    }

    @GetMapping("/{ip}")
    @Operation(summary = "AGV 数据分析")
    public Result<AnalyticsResult> analyze(
            @PathVariable String ip,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            @RequestParam(defaultValue = "5000") int sampleLimit) {

        LocalDateTime now = LocalDateTime.now();
        LocalDateTime fromDt = from != null ? parseIso(from) : now.minusHours(1);
        LocalDateTime toDt = to != null ? parseIso(to) : now;

        int limit = Math.min(sampleLimit, 20000);
        List<Map<String, Object>> rows = mapper.selectTrajectoryAsc(ip, fromDt, toDt, limit);

        if (rows.isEmpty()) {
            return Result.error("无数据");
        }

        AnalyticsResult result = new AnalyticsResult();
        result.overview = computeOverview(rows);
        result.speedHistogram = computeSpeedHistogram(rows);
        result.stationRanking = computeStationRanking(rows);
        result.stationHops = computeStationHops(rows);
        result.accelEvents = computeAccelEvents(rows);

        return Result.success(result);
    }

    // ══════════════════════════════════════════
    //  SQL 级聚合
    // ══════════════════════════════════════════

    @GetMapping("/{ip}/summary")
    @Operation(summary = "AGV 概要统计（纯 SQL）")
    public Result<Map<String, Object>> summary(@PathVariable String ip) {
        Map<String, Object> stats = mapper.selectRobotSummary(ip);
        return stats != null ? Result.success(stats) : Result.error("无数据");
    }

    // ══════════════════════════════════════════
    //  Java 计算
    // ══════════════════════════════════════════

    private Map<String, Object> computeOverview(List<Map<String, Object>> rows) {
        double totalDist = 0;
        double minX = Double.MAX_VALUE, maxX = -Double.MAX_VALUE;
        double minY = Double.MAX_VALUE, maxY = -Double.MAX_VALUE;
        long firstTs = 0, lastTs = 0;
        int movingCount = 0;

        for (int i = 0; i < rows.size(); i++) {
            Map<String, Object> r = rows.get(i);
            Double x = toDouble(r.get("x"));
            Double y = toDouble(r.get("y"));
            if (x == null || y == null) continue;

            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;

            if (i > 0) {
                Map<String, Object> prev = rows.get(i - 1);
                Double px = toDouble(prev.get("x"));
                Double py = toDouble(prev.get("y"));
                if (px != null && py != null) {
                    double d = Math.sqrt((x - px) * (x - px) + (y - py) * (y - py));
                    totalDist += d;
                    Object rts = r.get("recorded_at"), pts = prev.get("recorded_at");
                    if (rts != null && pts != null) {
                        double dt = timeDiffSec(pts.toString(), rts.toString());
                        if (dt > 0.01 && d / dt > 0.05) movingCount++;
                    }
                }
            }

            Object ts = r.get("recorded_at");
            if (ts != null) {
                long t = toEpochMs(ts.toString());
                if (firstTs == 0) firstTs = t;
                lastTs = t;
            }
        }

        Map<String, Object> overview = new LinkedHashMap<>();
        overview.put("totalDistanceKm", Math.round(totalDist / 10.0) / 100.0);
        double totalHr = (lastTs - firstTs) / 3600_000.0;
        overview.put("totalTimeHr", Math.round(totalHr * 10) / 10.0);
        overview.put("avgSpeedMps", totalHr > 0 ? Math.round(totalDist / (totalHr * 3600) * 100.0) / 100.0 : 0);
        overview.put("movingCount", movingCount);
        overview.put("totalSamples", rows.size());
        overview.put("utilization", rows.size() > 0 ? Math.round(movingCount * 100.0 / rows.size()) : 0);
        overview.put("xRange", Math.round((maxX - minX) * 100.0) / 100.0);
        overview.put("yRange", Math.round((maxY - minY) * 100.0) / 100.0);

        // path efficiency (straight-line / actual)
        if (rows.size() >= 2 && totalDist > 0) {
            Map<String, Object> first = rows.get(0), last = rows.get(rows.size() - 1);
            Double fx = toDouble(first.get("x")), fy = toDouble(first.get("y"));
            Double lx = toDouble(last.get("x")), ly = toDouble(last.get("y"));
            if (fx != null && fy != null && lx != null && ly != null) {
                double straight = Math.sqrt((lx - fx) * (lx - fx) + (ly - fy) * (ly - fy));
                overview.put("pathEfficiency", Math.round(straight / totalDist * 100));
            }
        }

        return overview;
    }

    private List<Map<String, Object>> computeSpeedHistogram(List<Map<String, Object>> rows) {
        int[] bins = new int[7];
        double[] thresholds = {0.1, 0.3, 0.5, 0.8, 1.2, 1.8};
        String[] labels = {"0-0.1", "0.1-0.3", "0.3-0.5", "0.5-0.8", "0.8-1.2", "1.2-1.8", "1.8+"};

        for (int i = 1; i < rows.size(); i++) {
            Map<String, Object> prev = rows.get(i - 1), cur = rows.get(i);
            Double px = toDouble(prev.get("x")), py = toDouble(prev.get("y"));
            Double cx = toDouble(cur.get("x")), cy = toDouble(cur.get("y"));
            Object pts = prev.get("recorded_at"), cts = cur.get("recorded_at");
            if (px == null || py == null || cx == null || cy == null || pts == null || cts == null) continue;
            double d = Math.sqrt((cx - px) * (cx - px) + (cy - py) * (cy - py));
            double dt = timeDiffSec(pts.toString(), cts.toString());
            if (dt < 0.01) continue;
            double speed = d / dt;
            int bin = 6;
            for (int b = 0; b < thresholds.length; b++) {
                if (speed < thresholds[b]) { bin = b; break; }
            }
            bins[bin]++;
        }

        List<Map<String, Object>> result = new ArrayList<>();
        for (int i = 0; i < bins.length; i++) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("label", labels[i]); m.put("count", bins[i]);
            result.add(m);
        }
        return result;
    }

    private List<Map<String, Object>> computeStationRanking(List<Map<String, Object>> rows) {
        Map<String, int[]> stationMap = new LinkedHashMap<>(); // [count, totalSec, lastIdx]
        Map<String, Integer> lastSeen = new LinkedHashMap<>();

        for (int i = 0; i < rows.size(); i++) {
            Object st = rows.get(i).get("station");
            if (st == null || st.toString().isEmpty()) continue;
            String station = st.toString();

            if (lastSeen.containsKey(station)) {
                int prevIdx = lastSeen.get(station);
                if (i == prevIdx + 1) { // consecutive
                    double dur = timeDiffSec(
                        rows.get(prevIdx).get("recorded_at").toString(),
                        rows.get(i).get("recorded_at").toString()
                    );
                    int[] arr = stationMap.computeIfAbsent(station, k -> new int[]{0, 0, 0});
                    arr[0]++;
                    arr[1] += (int) dur;
                }
            }
            lastSeen.put(station, i);
        }

        // Count distinct visits
        String prevSt = null;
        for (Map<String, Object> row : rows) {
            Object st = row.get("station");
            String curSt = st != null ? st.toString() : "";
            if (!curSt.isEmpty() && !curSt.equals(prevSt)) {
                int[] arr = stationMap.computeIfAbsent(curSt, k -> new int[]{0, 0, 0});
                arr[2]++; // visit count
            }
            prevSt = curSt.isEmpty() ? prevSt : curSt;
        }

        return stationMap.entrySet().stream()
            .filter(e -> e.getValue()[1] > 0)
            .sorted((a, b) -> Integer.compare(b.getValue()[1], a.getValue()[1]))
            .map(e -> {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("station", e.getKey());
                m.put("count", e.getValue()[2]);
                m.put("totalSec", e.getValue()[1]);
                m.put("avgSec", e.getValue()[2] > 0 ? e.getValue()[1] / e.getValue()[2] : 0);
                return m;
            })
            .collect(Collectors.toList());
    }

    private List<Map<String, Object>> computeStationHops(List<Map<String, Object>> rows) {
        List<Map<String, Object>> hops = new ArrayList<>();
        String prevStation = null;
        double prevX = 0, prevY = 0;
        long prevTs = 0;

        for (Map<String, Object> row : rows) {
            Object st = row.get("station");
            String curStation = st != null ? st.toString() : "";
            Double cx = toDouble(row.get("x")), cy = toDouble(row.get("y"));
            Object ts = row.get("recorded_at");
            if (cx == null || cy == null || ts == null) continue;

            if (prevStation != null && !curStation.isEmpty() && !curStation.equals(prevStation)) {
                double dist = Math.sqrt((cx - prevX) * (cx - prevX) + (cy - prevY) * (cy - prevY));
                long curTs = toEpochMs(ts.toString());
                Map<String, Object> hop = new LinkedHashMap<>();
                hop.put("from", prevStation);
                hop.put("to", curStation);
                hop.put("durationSec", curTs > prevTs ? (curTs - prevTs) / 1000 : 0);
                hop.put("distance", Math.round(dist * 100.0) / 100.0);
                hops.add(hop);
            }

            if (!curStation.isEmpty()) {
                prevStation = curStation; prevX = cx; prevY = cy; prevTs = toEpochMs(ts.toString());
            }
        }
        return hops;
    }

    private List<Map<String, Object>> computeAccelEvents(List<Map<String, Object>> rows) {
        List<Map<String, Object>> events = new ArrayList<>();
        double lastSpeed = 0;
        long lastTs = 0;
        boolean first = true;

        for (int i = 1; i < rows.size(); i++) {
            Map<String, Object> prev = rows.get(i - 1), cur = rows.get(i);
            Double px = toDouble(prev.get("x")), py = toDouble(prev.get("y"));
            Double cx = toDouble(cur.get("x")), cy = toDouble(cur.get("y"));
            Object pts = prev.get("recorded_at"), cts = cur.get("recorded_at");
            if (px == null || py == null || cx == null || cy == null || pts == null || cts == null) continue;

            double d = Math.sqrt((cx - px) * (cx - px) + (cy - py) * (cy - py));
            double dt = timeDiffSec(pts.toString(), cts.toString());
            if (dt < 0.01) continue;
            double speed = d / dt;

            if (!first) {
                double acc = (speed - lastSpeed) / dt;
                if (Math.abs(acc) > 0.5) {
                    Map<String, Object> evt = new LinkedHashMap<>();
                    evt.put("ts", cts.toString());
                    evt.put("mps2", Math.round(acc * 100.0) / 100.0);
                    evt.put("type", acc > 0 ? "急加速" : "急减速");
                    events.add(evt);
                }
            }

            lastSpeed = speed; lastTs = toEpochMs(cts.toString()); first = false;
        }
        return events;
    }

    // ── helpers ──
    private static double toDouble(Object o) {
        if (o instanceof Number n) return n.doubleValue();
        if (o instanceof String s) try { return Double.parseDouble(s); } catch (Exception e) { }
        return 0;
    }

    private static double timeDiffSec(String from, String to) {
        try {
            long f = java.time.Instant.parse(from).toEpochMilli();
            long t = java.time.Instant.parse(to).toEpochMilli();
            return (t - f) / 1000.0;
        } catch (Exception e) { return 0; }
    }

    private static long toEpochMs(String iso) {
        try { return java.time.Instant.parse(iso).toEpochMilli(); } catch (Exception e) { return 0; }
    }

    private static LocalDateTime parseIso(String s) {
        try { return java.time.Instant.parse(s).atZone(java.time.ZoneId.systemDefault()).toLocalDateTime(); }
        catch (Exception e) { return LocalDateTime.parse(s); }
    }
}
