package com.example.demo.modules.agv.analysis;

import com.example.demo.modules.agv.analysis.dto.AnalysisRequest;
import com.example.demo.modules.agv.analysis.dto.PrimitiveEvent;
import com.example.demo.modules.agv.analysis.model.AgvActivityRule;
import com.example.demo.modules.agv.analysis.model.AgvActivitySegment;
import com.example.demo.modules.agv.analysis.model.AgvSpatialElement;
import com.example.demo.modules.agv.mapper.AgvAnalysisMapper;
import com.example.demo.modules.agv.mapper.AgvTrajectoryMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class AgvAnalysisService {

    private static final Logger log = LoggerFactory.getLogger(AgvAnalysisService.class);
    private static final ObjectMapper JSON = new ObjectMapper();

    private static final String[] ROBOT_IPS = {
        "172.22.159.16", "172.22.159.18", "172.22.159.20", "172.22.159.22"
    };

    /** 窗口超过此小时数自动降采样，避免全量分析超时 */
    private static final long DOWNSAMPLE_WINDOW_HOURS = 4;
    private static final int MAX_FRAMES_BEFORE_DOWNSAMPLE = 50_000;

    private final AgvTrajectoryMapper trajectoryMapper;
    private final AgvAnalysisMapper analysisMapper;
    private final AgvSpatialService spatialService;
    private final AgvRouteService routeService;

    public AgvAnalysisService(AgvTrajectoryMapper trajectoryMapper, AgvAnalysisMapper analysisMapper,
                              AgvSpatialService spatialService, AgvRouteService routeService) {
        this.trajectoryMapper = trajectoryMapper;
        this.analysisMapper = analysisMapper;
        this.spatialService = spatialService;
        this.routeService = routeService;
    }

    /** 启动时初始化路线发现 */
    @jakarta.annotation.PostConstruct
    public void initRoutes() {
        try {
            int routes = routeService.discoverRoutes();
            if (routes > 0) log.info("[AgvAnalysis] Startup: discovered {} routes", routes);
        } catch (Exception e) {
            log.warn("[AgvAnalysis] Startup route discovery failed: {}", e.getMessage());
        }
    }

    /**
     * Run the full analysis pipeline for one robot in a time window.
     * 1. Load trajectory rows (ASC order)
     * 2. Detect primitives
     * 3. Match zones
     * 4. Apply rules -> segments
     * 5. Delete old AUTO segments, insert new ones
     */
    @Transactional
    public List<AgvActivitySegment> analyze(AnalysisRequest req) {
        // Parse ISO datetime strings (handles both "2026-07-29T15:34:00" and "2026-07-29T07:04:45.326Z")
        LocalDateTime from = parseIso(req.getFrom());
        LocalDateTime to = parseIso(req.getTo());

        // Step 1: load frames (ASC order for detector)
        // 使用轻量查询跳过 errors/fatals/warnings/notices 等 TEXT 大字段，减少 DB 传输量
        long windowHours = java.time.Duration.between(from, to).toHours();
        int limit = 200_000;
        List<Map<String, Object>> rows = trajectoryMapper.selectTrajectoryAnalysis(
                req.getRobotIp(), from, to, limit);
        if (rows.isEmpty()) return Collections.emptyList();

        // 大窗口自动降采样：>4h 且帧数超过阈值时均匀抽取，目标 ≤5万帧
        if (windowHours > DOWNSAMPLE_WINDOW_HOURS && rows.size() > MAX_FRAMES_BEFORE_DOWNSAMPLE) {
            int step = (int) Math.ceil((double) rows.size() / MAX_FRAMES_BEFORE_DOWNSAMPLE);
            List<Map<String, Object>> sampled = new ArrayList<>(MAX_FRAMES_BEFORE_DOWNSAMPLE);
            for (int i = 0; i < rows.size(); i += step) {
                sampled.add(rows.get(i));
            }
            log.info("[AgvAnalysis] Downsampled {}→{} frames (window={}h, step={})",
                    rows.size(), sampled.size(), windowHours, step);
            rows = sampled;
        }

        List<AgvPrimitiveDetector.TrajectoryFrame> frames = rows.stream().map(this::mapRow).collect(Collectors.toList());

        // Step 2: detect primitives
        List<AgvSpatialElement> zones = spatialService.listAll();
        AgvPrimitiveDetector detector = new AgvPrimitiveDetector();
        List<PrimitiveEvent> primitives = detector.detect(frames, zones);

        // Step 3 & 4: apply rules (zoneId already set in detector for ENTER/EXIT)
        List<AgvActivityRule> rules = analysisMapper.selectAllRules().stream()
                .filter(r -> r.getEnabled() != null && r.getEnabled())
                .sorted((a, b) -> Integer.compare(b.getPriority(), a.getPriority()))
                .collect(Collectors.toList());

        List<AgvActivitySegment> segments = applyRules(primitives, frames, zones, rules, req.getRobotIp());

        // Step 5: persist
        analysisMapper.deleteAutoSegmentsInWindow(req.getRobotIp(), from, to);
        for (AgvActivitySegment seg : segments) {
            analysisMapper.insertSegment(seg);
        }
        return segments;
    }

    private List<AgvActivitySegment> applyRules(List<PrimitiveEvent> primitives,
                                                  List<AgvPrimitiveDetector.TrajectoryFrame> frames,
                                                  List<AgvSpatialElement> zones,
                                                  List<AgvActivityRule> rules,
                                                  String robotIp) {
        List<AgvActivitySegment> segments = new ArrayList<>();

        for (AgvActivityRule rule : rules) {
            List<String> reqPrims = parseStringList(rule.getPrimitiveCond());
            if (reqPrims == null || reqPrims.isEmpty()) continue;

            // Find trigger points: primitives that match the rule's required primitives
            List<PrimitiveEvent> triggers = primitives.stream()
                    .filter(p -> reqPrims.contains(p.getType()))
                    .collect(Collectors.toList());

            for (PrimitiveEvent trigger : triggers) {
                // Check spatial condition
                if (!checkSpatial(rule, trigger, zones)) continue;

                // Find segment boundaries: from trigger timestamp to next incompatible state
                LocalDateTime segStart = trigger.getTimestamp();
                LocalDateTime segEnd = findSegmentEnd(trigger, primitives, frames, rule);

                long durationSec = Duration.between(segStart, segEnd).getSeconds();
                // Duration check
                if (rule.getMinDurationSec() != null && durationSec < rule.getMinDurationSec()) continue;
                if (rule.getMaxDurationSec() != null && durationSec > rule.getMaxDurationSec()) continue;

                // Check state condition on frames within segment
                if (!checkState(rule, frames, segStart, segEnd)) continue;

                // Build segment
                AgvActivitySegment seg = new AgvActivitySegment();
                seg.setRobotIp(robotIp);
                seg.setStartTime(segStart);
                seg.setEndTime(segEnd);
                seg.setActivityType(rule.getActivityType());
                seg.setZoneId(trigger.getZoneId());
                seg.setSource("AUTO");
                seg.setConfidence(rule.getConfidenceBase());
                seg.setRuleId(rule.getId());

                // Compute spatial stats
                double sx = 0, sy = 0, ex = 0, ey = 0, sumX = 0, sumY = 0, dist = 0;
                int fc = 0;
                Double firstX = null, firstY = null, prevX = null, prevY = null;
                for (var f : frames) {
                    if (f.recordedAt.isBefore(segStart)) continue;
                    if (f.recordedAt.isAfter(segEnd)) break;
                    if (f.x != null && f.y != null) {
                        if (firstX == null) { firstX = f.x; firstY = f.y; }
                        if (prevX != null) dist += Math.sqrt((f.x - prevX) * (f.x - prevX) + (f.y - prevY) * (f.y - prevY));
                        prevX = f.x; prevY = f.y;
                        sx = f.x; sy = f.y; sumX += f.x; sumY += f.y; fc++;
                    }
                }
                if (fc > 0) {
                    seg.setStartX(firstX); seg.setStartY(firstY);
                    seg.setEndX(sx); seg.setEndY(sy);
                    seg.setAvgX(sumX / fc); seg.setAvgY(sumY / fc);
                    seg.setDistanceM(Math.round(dist * 100.0) / 100.0);
                }

                segments.add(seg);
            }
        }

        // Post-process: merge STATION_DWELL + STATION_WORK → complete docking cycle
        segments = mergeDockingSegments(segments);

        // Conflict resolution: remove lower-priority overlapping segments
        return resolveConflicts(segments, rules);
    }

    /**
     * Merge overlapping STATION_DWELL + STATION_WORK into a single complete docking cycle.
     * STATION_DWELL without fork → kept as incomplete visit (low confidence, for review).
     */
    private List<AgvActivitySegment> mergeDockingSegments(List<AgvActivitySegment> segments) {
        List<AgvActivitySegment> dwells = segments.stream()
                .filter(s -> "STATION_DWELL".equals(s.getActivityType())).collect(Collectors.toList());
        List<AgvActivitySegment> works = segments.stream()
                .filter(s -> "STATION_WORK".equals(s.getActivityType())).collect(Collectors.toList());
        if (dwells.isEmpty() || works.isEmpty()) return segments;

        Set<AgvActivitySegment> toRemove = new HashSet<>();
        for (AgvActivitySegment work : works) {
            for (AgvActivitySegment dwell : dwells) {
                if (!work.getRobotIp().equals(dwell.getRobotIp())) continue;
                if (overlapsTime(work, dwell) && work.getZoneId() != null && work.getZoneId().equals(dwell.getZoneId())) {
                    // Extend work start to dwell start (captures full docking: SPIN → REVERSE → FORK)
                    if (dwell.getStartTime().isBefore(work.getStartTime())) {
                        work.setStartTime(dwell.getStartTime());
                        work.setStartX(dwell.getStartX());
                        work.setStartY(dwell.getStartY());
                    }
                    if (dwell.getEndTime().isAfter(work.getEndTime())) {
                        work.setEndTime(dwell.getEndTime());
                        work.setEndX(dwell.getEndX());
                        work.setEndY(dwell.getEndY());
                    }
                    // Increase confidence for complete cycle
                    work.setConfidence(Math.min(1.0, work.getConfidence() + 0.05));
                    toRemove.add(dwell);
                }
            }
        }
        // Downgrade orphan dwells (no fork operation) → incomplete visit
        for (AgvActivitySegment dwell : dwells) {
            if (!toRemove.contains(dwell)) {
                dwell.setActivityType("未完成停靠");
                dwell.setConfidence(0.50);
            }
        }
        segments.removeAll(toRemove);
        return segments;
    }

    private List<AgvActivitySegment> resolveConflicts(List<AgvActivitySegment> segments, List<AgvActivityRule> rules) {
        Map<String, Integer> priorityMap = new HashMap<>();
        for (AgvActivityRule r : rules) priorityMap.put(r.getActivityType(), r.getPriority());

        // Sort by priority desc, then confidence desc, then duration desc
        segments.sort((a, b) -> {
            int p = Integer.compare(priorityMap.getOrDefault(b.getActivityType(), 0),
                                     priorityMap.getOrDefault(a.getActivityType(), 0));
            if (p != 0) return p;
            int c = Double.compare(b.getConfidence(), a.getConfidence());
            if (c != 0) return c;
            long da = Duration.between(a.getStartTime(), a.getEndTime()).getSeconds();
            long db = Duration.between(b.getStartTime(), b.getEndTime()).getSeconds();
            return Long.compare(db, da);
        });

        List<AgvActivitySegment> resolved = new ArrayList<>();
        for (AgvActivitySegment seg : segments) {
            boolean overlaps = false;
            for (AgvActivitySegment r : resolved) {
                if (overlapsTime(seg, r)) { overlaps = true; break; }
            }
            if (!overlaps) resolved.add(seg);
        }
        return resolved;
    }

    private boolean overlapsTime(AgvActivitySegment a, AgvActivitySegment b) {
        return !(a.getEndTime().isBefore(b.getStartTime()) || a.getStartTime().isAfter(b.getEndTime()));
    }

    private LocalDateTime findSegmentEnd(PrimitiveEvent trigger, List<PrimitiveEvent> primitives,
                                          List<AgvPrimitiveDetector.TrajectoryFrame> frames,
                                          AgvActivityRule rule) {
        // End segment at next MOVE_START or after max_duration, whichever comes first
        LocalDateTime maxEnd = rule.getMaxDurationSec() != null
                ? trigger.getTimestamp().plusSeconds(rule.getMaxDurationSec())
                : trigger.getTimestamp().plusHours(1);

        for (PrimitiveEvent p : primitives) {
            if (p.getTimestamp().isBefore(trigger.getTimestamp()) || p.getTimestamp().equals(trigger.getTimestamp()))
                continue;
            if (p.getTimestamp().isAfter(maxEnd)) break;
            // Segment ends when a new MOVE_START fires (for idle/station segments)
            if ("MOVE_START".equals(p.getType())) return p.getTimestamp();
        }
        // If no explicit end, use the last frame timestamp
        return frames.isEmpty() ? maxEnd :
                frames.get(frames.size() - 1).recordedAt.isBefore(maxEnd) ? frames.get(frames.size() - 1).recordedAt : maxEnd;
    }

    private boolean checkSpatial(AgvActivityRule rule, PrimitiveEvent trigger, List<AgvSpatialElement> zones) {
        if (rule.getSpatialCond() == null || rule.getSpatialCond().isEmpty()) return true;
        try {
            Map<String, Object> cond = JSON.readValue(rule.getSpatialCond(), Map.class);
            // station_regex check (runs first, returns true if station matches)
            String stationRegex = (String) cond.get("station_regex");
            if (stationRegex != null) {
                // Check zone by zoneId for station pattern match
                if (trigger.getZoneId() != null) {
                    for (AgvSpatialElement z : zones) {
                        if (z.getId().equals(trigger.getZoneId()) && z.getStationPattern() != null) {
                            if (z.getStationPattern().matches(stationRegex.replace("*", ".*")))
                                return true;
                        }
                    }
                }
                return false; // station_regex required but no match
            }
            // zone_tags check
            List<String> requiredTags = (List<String>) cond.get("zone_tags");
            if (requiredTags == null || requiredTags.isEmpty()) return true;
            // If trigger has zoneId, check that zone's tags
            if (trigger.getZoneId() != null) {
                for (AgvSpatialElement z : zones) {
                    if (z.getId().equals(trigger.getZoneId())) {
                        List<String> tags = parseStringList(z.getSemanticTags());
                        if (tags != null && !Collections.disjoint(tags, requiredTags)) return true;
                    }
                }
                return false;
            }
            // Fallback: trigger has no zoneId (e.g. MOVE_END) — match by coordinates or station
            if (trigger.getX() != null && trigger.getY() != null) {
                for (AgvSpatialElement z : zones) {
                    List<String> tags = parseStringList(z.getSemanticTags());
                    if (tags == null || Collections.disjoint(tags, requiredTags)) continue;
                    // Check if trigger position is inside this zone
                    if (isInsideZone(z, trigger.getX(), trigger.getY())) return true;
                }
            }
            return false;
        } catch (Exception e) {
            // Malformed JSON -> fail-safe: log warning, return false
            log.warn("[AgvAnalysis] Failed to parse spatial_cond for rule {}: {}", rule.getId(), e.getMessage());
            return false;
        }
    }

    private boolean checkState(AgvActivityRule rule, List<AgvPrimitiveDetector.TrajectoryFrame> frames,
                               LocalDateTime start, LocalDateTime end) {
        if (rule.getStateCond() == null || rule.getStateCond().isEmpty()) return true;
        try {
            Map<String, Object> cond = JSON.readValue(rule.getStateCond(), Map.class);
            for (var f : frames) {
                if (f.recordedAt.isBefore(start)) continue;
                if (f.recordedAt.isAfter(end)) break;
                boolean match = true;
                if (cond.containsKey("task_status") && !cond.get("task_status").equals(f.taskStatus)) match = false;
                if (cond.containsKey("charging") && !cond.get("charging").equals(f.charging)) match = false;
                if (cond.containsKey("blocked") && !cond.get("blocked").equals(f.blocked)) match = false;
                if (cond.containsKey("emergency") && !cond.get("emergency").equals(f.emergency)) match = false;
                // fork_height_min: fork must be above threshold
                if (cond.containsKey("fork_height_min") && f.forkHeight != null) {
                    double min = ((Number) cond.get("fork_height_min")).doubleValue();
                    if (f.forkHeight < min) match = false;
                }
                // fork_height_max: fork must be below threshold (for 寻路/navigating)
                if (cond.containsKey("fork_height_max") && f.forkHeight != null) {
                    double max = ((Number) cond.get("fork_height_max")).doubleValue();
                    if (f.forkHeight > max) match = false;
                }
                // battery threshold (numeric comparison: e.g. battery >= 0.95)
                if (cond.containsKey("battery") && f.battery != null) {
                    double threshold = ((Number) cond.get("battery")).doubleValue();
                    if (f.battery < threshold) match = false;
                }
                // DI channel conditions: di_0 through di_8
                for (int di = 0; di <= 8; di++) {
                    String key = "di_" + di;
                    if (cond.containsKey(key) && f.diJson != null) {
                        boolean expected = (Boolean) cond.get(key);
                        boolean actual = parseDiChannel(f.diJson, di);
                        if (actual != expected) match = false;
                    }
                }
                if (match) return true;
            }
            return false;
        } catch (Exception e) {
            // Malformed JSON -> fail-safe: log warning, return false
            log.warn("[AgvAnalysis] Failed to parse state_cond for rule {}: {}", rule.getId(), e.getMessage());
            return false;
        }
    }

    /** Check if a point is inside a spatial element (polygon, POI radius, or station match not applicable here) */
    private boolean isInsideZone(AgvSpatialElement zone, double x, double y) {
        String eType = zone.getElementType();
        if ("POLYGON_ZONE".equals(eType) || "STATION_ZONE".equals(eType)) {
            List<double[]> poly = AgvPrimitiveDetector.parsePolygon(zone.getPolygonJson());
            if (poly != null && !poly.isEmpty()) {
                return AgvPrimitiveDetector.isPointInPolygon(x, y, poly);
            }
        }
        if ("POI".equals(eType)) {
            if (zone.getPoiX() != null && zone.getPoiY() != null) {
                double r = zone.getPoiRadiusM() != null ? zone.getPoiRadiusM() : 1.0;
                return Math.sqrt((x - zone.getPoiX()) * (x - zone.getPoiX()) + (y - zone.getPoiY()) * (y - zone.getPoiY())) <= r;
            }
        }
        return false;
    }

    /** Parse a single DI channel status from di_json string */
    private boolean parseDiChannel(String diJson, int channelId) {
        try {
            List<Map<String, Object>> channels = JSON.readValue(diJson, new TypeReference<List<Map<String, Object>>>() {});
            for (Map<String, Object> ch : channels) {
                Object idObj = ch.get("id");
                if (idObj != null && ((Number) idObj).intValue() == channelId) {
                    Object status = ch.get("status");
                    return status instanceof Boolean ? (Boolean) status : false;
                }
            }
        } catch (Exception e) {
            /* ignore parse errors */
        }
        return false;
    }

    private AgvPrimitiveDetector.TrajectoryFrame mapRow(Map<String, Object> row) {
        AgvPrimitiveDetector.TrajectoryFrame f = new AgvPrimitiveDetector.TrajectoryFrame();
        f.robotIp = (String) row.get("robot_ip");
        f.recordedAt = (LocalDateTime) row.get("recorded_at");
        f.x = toDouble(row.get("x")); f.y = toDouble(row.get("y")); f.angle = toDouble(row.get("angle"));
        f.battery = toDouble(row.get("battery"));
        f.taskStatus = (Integer) row.get("task_status");
        f.station = (String) row.get("station");
        f.charging = toBool(row.get("charging")); f.blocked = toBool(row.get("blocked"));
        f.emergency = toBool(row.get("emergency"));
        f.forkHeight = toDouble(row.get("fork_height"));
        f.jackState = (Integer) row.get("jack_state");
        f.relocStatus = (Integer) row.get("reloc_status");
        f.mapName = (String) row.get("map_name");
        f.diJson = (String) row.get("di_json");
        return f;
    }

    private static Double toDouble(Object o) {
        if (o instanceof Number) return ((Number) o).doubleValue();
        return null;
    }

    private static Boolean toBool(Object o) {
        if (o instanceof Boolean) return (Boolean) o;
        if (o instanceof Number) return ((Number) o).intValue() != 0;
        return null;
    }

    private static List<String> parseStringList(String json) {
        if (json == null || json.isEmpty()) return null;
        try {
            return JSON.readValue(json, new TypeReference<List<String>>() {});
        } catch (Exception e) {
            return null;
        }
    }

    /** Parse ISO 8601 datetime strings including fractional seconds + timezone suffix */
    private static LocalDateTime parseIso(String s) {
        if (s == null) return LocalDateTime.now();
        try {
            return Instant.parse(s).atZone(ZoneId.systemDefault()).toLocalDateTime();
        } catch (Exception e) {
            return LocalDateTime.parse(s);
        }
    }

    /** Incremental analysis: every 5 min, analyze last 15 min + auto-discover zones */
    @Scheduled(fixedDelay = 300_000)
    public void incrementalAnalysis() {
        LocalDateTime to = LocalDateTime.now();
        LocalDateTime from = to.minusMinutes(15);
        for (String ip : ROBOT_IPS) {
            try {
                List<AgvActivitySegment> incomplete = analysisMapper.selectIncompleteVisits(ip, 30);
                for (AgvActivitySegment s : incomplete) {
                    if (s.getEndTime() != null && s.getEndTime().isBefore(from)
                            && s.getEndTime().isAfter(from.minusHours(2))) {
                        from = s.getStartTime().minusMinutes(1);
                    }
                }
                AnalysisRequest req = new AnalysisRequest();
                req.setRobotIp(ip);
                req.setFrom(from.toString());
                req.setTo(to.toString());
                analyze(req);
            } catch (Exception e) {
                log.warn("[AgvAnalysis] Incremental failed for {}: {}", ip, e.getMessage());
            }
        }
        // 自动空间发现 + 路线发现 + 清理（路线发现用 24h 窗口保证足够样本）
        try {
            LocalDateTime spatialFrom = to.minusHours(2);
            int discovered = spatialService.spatialZoneDiscovery(spatialFrom, to);
            int merged = spatialService.mergeOverlappingZones();
            int cleaned = spatialService.cleanupStaleZones(24);
            int routes = routeService.discoverRoutes();
            if (discovered > 0 || merged > 0 || cleaned > 0 || routes > 0) {
                log.info("[AgvAnalysis] Auto: +{} zones, {} merged, {} cleaned, +{} routes", discovered, merged, cleaned, routes);
            }
        } catch (Exception e) {
            log.warn("[AgvAnalysis] Auto-discover failed: {}", e.getMessage());
        }
    }

    /** Daily scheduled analysis: runs at 02:00, analyzes yesterday's data for all robots */
    @Scheduled(cron = "0 0 2 * * *")
    public void dailyAnalysis() {
        LocalDateTime today = LocalDateTime.now().withHour(0).withMinute(0).withSecond(0).withNano(0);
        LocalDateTime yesterdayStart = today.minusDays(1);
        LocalDateTime yesterdayEnd = today.minusSeconds(1);
        log.info("[AgvAnalysis] Daily analysis: {} → {}", yesterdayStart, yesterdayEnd);
        int totalSegs = 0;
        for (String ip : ROBOT_IPS) {
            try {
                AnalysisRequest req = new AnalysisRequest();
                req.setRobotIp(ip);
                req.setFrom(yesterdayStart.toString());
                req.setTo(yesterdayEnd.toString());
                List<AgvActivitySegment> segs = analyze(req);
                totalSegs += segs.size();
                log.info("[AgvAnalysis] {} -> {} segments", ip, segs.size());
            } catch (Exception e) {
                log.warn("[AgvAnalysis] Daily analysis failed for {}: {}", ip, e.getMessage());
            }
        }
        // 行为驱动的空间区域发现 + 路线发现
        try {
            int zonesDiscovered = spatialService.spatialZoneDiscovery(yesterdayStart, yesterdayEnd);
            log.info("[AgvAnalysis] Spatial zone discovery: {} zones", zonesDiscovered);
        } catch (Exception e) {
            log.warn("[AgvAnalysis] Spatial zone discovery failed: {}", e.getMessage());
        }
        try {
            int routesDiscovered = routeService.discoverRoutes();
            log.info("[AgvAnalysis] Route discovery: {} routes", routesDiscovered);
        } catch (Exception e) {
            log.warn("[AgvAnalysis] Route discovery failed: {}", e.getMessage());
        }
    }
}
