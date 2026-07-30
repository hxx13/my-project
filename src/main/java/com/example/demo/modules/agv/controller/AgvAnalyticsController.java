package com.example.demo.modules.agv.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.agv.analysis.AgvAnalyticsRollupService;
import com.example.demo.modules.agv.analysis.AgvSpatialService;
import com.example.demo.modules.agv.mapper.AgvAnalysisMapper;
import com.example.demo.modules.agv.mapper.AgvTrajectoryMapper;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.*;
import java.util.stream.Collectors;

/**
 * AGV 数据分析接口。
 * <p>
 * 重新设计后的分析区块（4块）：
 * <ol>
 *   <li>任务概览 — 趟次/里程/时长/速度/电量/异常</li>
 *   <li>时间分配 — 运输/充电/站点停靠/寻路/其他 占比</li>
 *   <li>站点排行 — 各站点停留频次和时长</li>
 *   <li>异常汇总 — 急停/阻挡/重定位 次数 + 最近发生时间</li>
 * </ol>
 */
@RestController
@RequestMapping("/api/v1/agv/analytics")
@Tag(name = "AGV 数据分析", description = "任务概览 / 时间分配 / 站点排行 / 异常汇总")
public class AgvAnalyticsController {

    private final AgvTrajectoryMapper trajectoryMapper;
    private final AgvAnalysisMapper analysisMapper;
    private final AgvAnalyticsRollupService rollupService;
    private final AgvSpatialService spatialService;

    public AgvAnalyticsController(AgvTrajectoryMapper trajectoryMapper,
                                   AgvAnalysisMapper analysisMapper,
                                   AgvAnalyticsRollupService rollupService,
                                   AgvSpatialService spatialService) {
        this.trajectoryMapper = trajectoryMapper;
        this.analysisMapper = analysisMapper;
        this.rollupService = rollupService;
        this.spatialService = spatialService;
    }

    @GetMapping("/{ip}")
    @Operation(summary = "AGV 数据分析")
    public Result<Map<String, Object>> analyze(
            @PathVariable String ip,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to) {

        LocalDateTime now = LocalDateTime.now();
        LocalDateTime fromDt = from != null ? parseIso(from) : now.minusHours(24);
        LocalDateTime toDt = to != null ? parseIso(to) : now;

        Map<String, Object> resp = new LinkedHashMap<>();

        // ── ① 任务概览 ──
        Map<String, Object> hourly = rollupService.buildFromHourly(ip, fromDt, toDt);
        int transportTrips = analysisMapper.countTransportTrips(ip, fromDt, toDt);
        double batteryAvg = analysisMapper.avgBattery(ip, fromDt, toDt);

        Map<String, Object> overview;
        if (hourly != null) {
            @SuppressWarnings("unchecked")
            Map<String, Object> hourlyOverview = (Map<String, Object>) hourly.get("overview");
            overview = new LinkedHashMap<>(hourlyOverview);
            overview.put("transportTrips", transportTrips);
            overview.put("avgBattery", Math.round(batteryAvg * 100.0) / 100.0);
            overview.remove("xRange");
            overview.remove("yRange");
            overview.remove("movingCount");
        } else {
            overview = new LinkedHashMap<>();
            overview.put("transportTrips", transportTrips);
            overview.put("totalDistanceKm", 0);
            overview.put("totalTimeHr", 0);
            overview.put("avgSpeedMps", 0);
            overview.put("avgBattery", Math.round(batteryAvg * 100.0) / 100.0);
            overview.put("totalSamples", 0);
            overview.put("utilization", 0);
        }
        resp.put("overview", overview);

        // ── ② 时间分配 ──
        List<Map<String, Object>> distRaw = analysisMapper.selectActivityDistribution(ip, fromDt, toDt);
        long totalSec = distRaw.stream().mapToLong(m -> toLong(m.get("total_sec"))).sum();
        Map<String, String> categoryMap = new HashMap<>();
        categoryMap.put("TRANSPORT", "运输"); categoryMap.put("NAVIGATING", "寻路");
        categoryMap.put("CHARGING", "充电"); categoryMap.put("CHARGING_COMPLETE", "充电");
        categoryMap.put("STATION_DWELL", "站点停靠"); categoryMap.put("STATION_WORK", "站点停靠");
        categoryMap.put("REST_STATION", "站点停靠"); categoryMap.put("FORK_OPERATION", "站点停靠");
        categoryMap.put("UNKNOWN_IDLE", "站点停靠");
        categoryMap.put("PATH_WAIT", "其他"); categoryMap.put("REVERSE_MANEUVER", "其他");
        categoryMap.put("RELOC_EVENT", "其他"); categoryMap.put("BLOCKED_WAIT", "其他");
        categoryMap.put("EMERGENCY_STOP", "其他");
        Map<String, Long> categorySec = new LinkedHashMap<>();
        for (var row : distRaw) {
            String type = (String) row.get("activity_type");
            long sec = toLong(row.get("total_sec"));
            categorySec.merge(categoryMap.getOrDefault(type, "其他"), sec, Long::sum);
        }
        String[] order = {"运输", "充电", "站点停靠", "寻路", "其他"};
        List<Map<String, Object>> timeDist = new ArrayList<>();
        for (String cat : order) {
            long sec = categorySec.getOrDefault(cat, 0L);
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("category", cat); item.put("totalSec", sec);
            item.put("percent", totalSec > 0 ? Math.round(sec * 1000.0 / totalSec) / 10.0 : 0);
            timeDist.add(item);
        }
        resp.put("timeDistribution", timeDist);

        // ── ③ 站点排行（带中文名称解析）──
        if (hourly != null) {
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> ranking = (List<Map<String, Object>>) hourly.get("stationRanking");
            if (ranking != null) {
                for (Map<String, Object> item : ranking) {
                    String code = (String) item.get("station");
                    if (code != null) {
                        item.put("stationName", spatialService.resolveStationName(code));
                    }
                }
            }
            resp.put("stationRanking", ranking != null ? ranking : Collections.emptyList());
        } else {
            resp.put("stationRanking", Collections.emptyList());
        }

        // ── ④ 异常汇总 ──
        List<Map<String, Object>> anomalyRows = analysisMapper.selectAnomalyCounts(ip, fromDt, toDt);
        int emergencyCount = 0, blockedCount = 0, relocCount = 0;
        for (var row : anomalyRows) {
            String t = (String) row.get("activity_type");
            int c = toInt(row.get("cnt"));
            switch (t) {
                case "EMERGENCY_STOP" -> emergencyCount = c;
                case "BLOCKED_WAIT" -> blockedCount = c;
                case "RELOC_EVENT" -> relocCount = c;
            }
        }
        Map<String, Object> anomalies = new LinkedHashMap<>();
        anomalies.put("emergencyCount", emergencyCount);
        anomalies.put("blockedCount", blockedCount);
        anomalies.put("relocCount", relocCount);
        anomalies.put("totalAnomalies", emergencyCount + blockedCount + relocCount);
        resp.put("anomalies", anomalies);

        return Result.success(resp);
    }

    @GetMapping("/{ip}/summary")
    @Operation(summary = "AGV 概要统计（纯 SQL）")
    public Result<Map<String, Object>> summary(@PathVariable String ip) {
        Map<String, Object> stats = trajectoryMapper.selectRobotSummary(ip);
        return stats != null ? Result.success(stats) : Result.error("无数据");
    }

    @PostMapping("/{ip}/refresh")
    @Operation(summary = "手动刷新小时聚合")
    public Result<String> refresh(@PathVariable String ip) {
        rollupService.refreshRecentHours(ip);
        return Result.success("ok");
    }

    // ── helpers ──

    private static long toLong(Object o) {
        if (o instanceof Number n) return n.longValue();
        if (o instanceof String s) try { return Long.parseLong(s); } catch (Exception e) { }
        return 0;
    }

    private static int toInt(Object o) {
        if (o instanceof Number n) return n.intValue();
        if (o instanceof String s) try { return Integer.parseInt(s); } catch (Exception e) { }
        return 0;
    }

    private static LocalDateTime parseIso(String s) {
        try { return Instant.parse(s).atZone(ZoneId.systemDefault()).toLocalDateTime(); }
        catch (Exception e) { return LocalDateTime.parse(s); }
    }
}
