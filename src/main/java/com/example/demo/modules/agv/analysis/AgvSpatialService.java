package com.example.demo.modules.agv.analysis;

import com.example.demo.common.exception.ErrorCodeConstants;
import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.modules.agv.analysis.model.AgvActivitySegment;
import com.example.demo.modules.agv.analysis.model.AgvSpatialElement;
import com.example.demo.modules.agv.mapper.AgvAnalysisMapper;
import com.example.demo.modules.agv.mapper.AgvTrajectoryMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class AgvSpatialService {

    private static final Logger log = LoggerFactory.getLogger(AgvSpatialService.class);

    /** 空间聚类网格精度 (米) — 5cm */
    private static final double GRID_CELL_M = 0.05;
    /** 固定矩形半边长 (m)：作业/充电区域 5cm×5cm */
    private static final double FIXED_HALF_M = 0.025;
    /** 聚类最少段数（休息站需要 5 次以上，等待类 3 次） */
    private static final int REST_MIN_SEGMENTS = 3;

    /** 固定休息站编码 — 始终标记为"休息"，不受算法判定影响 */
    private static final Set<String> FIXED_REST_STATIONS = Set.of("LM1299", "LM1199", "LM2102", "LM2202");

    /** 固定休息站 → 所属 AGV IP 映射，用于前端标签显隐控制 */
    private static final Map<String, String> REST_STATION_AGV = Map.of(
        "LM1299", "172.22.159.16",  // AGV-1
        "LM1199", "172.22.159.18",  // AGV-2
        "LM2202", "172.22.159.20",  // AGV-3
        "LM2102", "172.22.159.22"   // AGV-4
    );

    private final AgvAnalysisMapper mapper;
    private final AgvTrajectoryMapper trajectoryMapper;
    private final JdbcTemplate jdbc;
    private final ObjectMapper jsonMapper = new ObjectMapper();

    public AgvSpatialService(AgvAnalysisMapper mapper, AgvTrajectoryMapper trajectoryMapper,
                             JdbcTemplate jdbc) {
        this.mapper = mapper;
        this.trajectoryMapper = trajectoryMapper;
        this.jdbc = jdbc;
    }

    /** Ensure AUTO zones exist for every known station (CP/LM/AP), upsert on startup. */
    @PostConstruct
    public void autoImportOnStartup() {
        List<AgvSpatialElement> candidates = autoGenerateCandidates(null);
        int created = 0, skipped = 0;
        for (AgvSpatialElement e : candidates) {
            // 检查是否已有同 station_pattern 的 AUTO zone
            List<AgvSpatialElement> dup = mapper.selectByStationPatternAndSource(e.getStationPattern(), "AUTO");
            if (!dup.isEmpty()) { skipped++; continue; }
            e.setIsActive(true);
            e.setConfidence(0.5);
            e.setHitCount(0);
            e.setSource("AUTO");
            mapper.insertSpatialElement(e);
            created++;
        }
        if (created > 0 || skipped > 0) {
            log.info("[AgvSpatial] Startup AUTO zones: {} created, {} skipped (already exist)", created, skipped);
        }
    }

    // ── 站点名称映射 ──

    /** 站点代码 → 中文名称缓存，从 spatial_element 的 stationPattern + name 构建 */
    private volatile Map<String, String> stationNameCache = Map.of();

    @PostConstruct
    void refreshStationNameCache() {
        Map<String, String> map = new LinkedHashMap<>();
        for (AgvSpatialElement e : listAll()) {
            String pattern = e.getStationPattern();
            String name = e.getName();
            if (pattern == null || pattern.isBlank() || name == null || name.isBlank()) continue;
            // 精确匹配模式直接映射
            map.put(pattern, name);
        }
        stationNameCache = Collections.unmodifiableMap(map);
    }

    /**
     * 解析站点代码为中文名称。
     * 优先级：spatial_element 精确匹配 → 前缀启发式 → 原始代码
     */
    public String resolveStationName(String code) {
        if (code == null || code.isBlank()) return code;
        // 1. spatial_element 精确匹配
        Map<String, String> cache = stationNameCache;
        String resolved = cache.get(code);
        if (resolved != null) return resolved;
        // 2. 前缀启发式
        if (code.startsWith("LM")) return "路径点" + code.substring(2);
        if (code.startsWith("CP")) return "充电站" + code.substring(2);
        if (code.startsWith("AP")) return "作业站" + code.substring(2);
        // 3. 兜底
        return code;
    }

    /** 获取全量站点映射表，供前端使用 */
    public Map<String, String> getStationNameMap() {
        return stationNameCache;
    }

    // ── 原有方法 ──

    public List<AgvSpatialElement> listAll() {
        return mapper.selectAllSpatialElements();
    }

    public AgvSpatialElement getById(Long id) {
        AgvSpatialElement e = mapper.selectSpatialElementById(id);
        if (e == null) throw new TwinBusinessException(ErrorCodeConstants.AGV_ZONE_NOT_FOUND, "空间元素不存在: " + id);
        return e;
    }

    public AgvSpatialElement save(AgvSpatialElement e) {
        if (e.getId() == null) {
            e.setIsActive(true);
            if (e.getSource() == null) e.setSource("MANUAL");
            if (e.getConfidence() == null) e.setConfidence(0.8);
            if (e.getHitCount() == null) e.setHitCount(0);
            mapper.insertSpatialElement(e);
        } else {
            // 只更新非 null 字段，防止前端局部编辑冲掉已有数据
            AgvSpatialElement existing = mapper.selectSpatialElementById(e.getId());
            if (existing == null) throw new TwinBusinessException(ErrorCodeConstants.AGV_ZONE_NOT_FOUND, "空间元素不存在: " + e.getId());
            if (e.getName() != null) existing.setName(e.getName());
            if (e.getMapName() != null) existing.setMapName(e.getMapName());
            if (e.getElementType() != null) existing.setElementType(e.getElementType());
            if (e.getStationPattern() != null) existing.setStationPattern(e.getStationPattern());
            if (e.getPolygonJson() != null) existing.setPolygonJson(e.getPolygonJson());
            if (e.getPoiX() != null) existing.setPoiX(e.getPoiX());
            if (e.getPoiY() != null) existing.setPoiY(e.getPoiY());
            if (e.getPoiRadiusM() != null) existing.setPoiRadiusM(e.getPoiRadiusM());
            if (e.getSemanticTags() != null) existing.setSemanticTags(e.getSemanticTags());
            if (e.getColor() != null) existing.setColor(e.getColor());
            if (e.getIsActive() != null) existing.setIsActive(e.getIsActive());
            if (e.getConfidence() != null) existing.setConfidence(e.getConfidence());
            if (e.getHitCount() != null) existing.setHitCount(e.getHitCount());
            if (e.getSource() != null) existing.setSource(e.getSource());
            mapper.updateSpatialElement(existing);
        }
        return e;
    }

    public void softDelete(Long id) {
        mapper.softDeleteSpatialElement(id);
    }

    /**
     * Auto-generate candidate zones from all distinct stations in trajectory history.
     * Only generates for key station prefixes: CP (充电), LM (作业), AP (路径).
     */
    public List<AgvSpatialElement> autoGenerateCandidates(String mapNameFilter) {
        List<Map<String, Object>> stations = trajectoryMapper.selectDistinctStations(mapNameFilter);
        List<AgvSpatialElement> candidates = new ArrayList<>();
        for (Map<String, Object> row : stations) {
            String station = (String) row.get("station");
            String mapName = (String) row.get("map_name");
            if (station == null || station.isEmpty()) continue;

            // 只对关键站点生成区域：充电(CP) / 作业(LM) / 路径(AP)
            if (!station.startsWith("CP") && !station.startsWith("LM") && !station.startsWith("AP")) {
                continue;
            }

            List<Map<String, Object>> coords = trajectoryMapper.selectStationCoords(station, 50);
            String polygonJson = buildBoundingPolygon(coords);
            // 取该站点轨迹中出现最多的 robotIp 作为归属
            String robotIp = coords.stream()
                .map(r -> (String) r.get("robot_ip"))
                .filter(Objects::nonNull)
                .collect(Collectors.groupingBy(ip -> ip, Collectors.counting()))
                .entrySet().stream().max(Map.Entry.comparingByValue())
                .map(Map.Entry::getKey).orElse(null);

            AgvSpatialElement e = new AgvSpatialElement();
            e.setName(station);
            e.setMapName(mapName);
            e.setElementType("STATION_ZONE");
            e.setStationPattern(station);
            e.setPolygonJson(polygonJson);
            e.setSemanticTags(inferTags(station));
            e.setColor(inferColor(station));
            e.setIsActive(true);
            e.setConfidence(0.5);
            e.setHitCount(0);
            e.setSource("AUTO");
            e.setRobotIp(robotIp);
            candidates.add(e);
        }
        return candidates;
    }

    // ═══════════════════════════════════════════════════════════════
    // 路线拓扑驱动的区域生成（与路线模型2同等质量）
    // ═══════════════════════════════════════════════════════════════

    /**
     * 从路线拓扑数据生成区域，复用路线模型2的频次统计、方向分析和标签推断。
     * 质量远高于旧的 station-prefix 简单标签方法。
     *
     * 算法：
     * 1. 读 agv_route_topology_station 获取站点锚点和观测次数
     * 2. 读 agv_route_topology_edge 获取连接关系和频次
     * 3. 为每个站点生成区域：标签由连接边的类型决定，大小由观测次数决定
     * 4. 为高频主干路段生成通道区域
     * 5. UPSERT 到 agv_spatial_element
     */
    public int generateZonesFromTopology() {
        int created = 0;
        LocalDateTime now = LocalDateTime.now();

        // 检查拓扑表是否有数据
        Integer edgeCount = jdbc.queryForObject(
            "SELECT COUNT(*) FROM agv_route_topology_edge", Integer.class);
        if (edgeCount == null || edgeCount == 0) {
            log.warn("[AgvSpatial] 路线拓扑表为空，无法生成区域。请先运行路线模型2生成。");
            return 0;
        }

        // 软删除旧的 TOPOLOGY 来源区域（幂等替换）
        jdbc.update("UPDATE agv_spatial_element SET is_active = 0 WHERE source = 'TOPOLOGY'");

        // ── 阶段1：站点区域 ──
        List<Map<String, Object>> stations = jdbc.queryForList(
            "SELECT s.station_code, s.x, s.y, s.observations, s.zone_key " +
            "FROM agv_route_topology_station s ORDER BY s.observations DESC");

        for (var st : stations) {
            String code = (String) st.get("station_code");
            double cx = ((Number) st.get("x")).doubleValue();
            double cy = ((Number) st.get("y")).doubleValue();
            int obs = ((Number) st.get("observations")).intValue();
            String zoneKey = (String) st.get("zone_key");

            // 查询该站点连接的所有边，统计边的类型
            List<Map<String, Object>> edges = jdbc.queryForList(
                "SELECT station_from, station_to, confidence, is_one_way, total_count " +
                "FROM agv_route_topology_edge " +
                "WHERE zone_key = ? AND (station_from = ? OR station_to = ?) " +
                "ORDER BY total_count DESC",
                zoneKey, code, code);

            if (edges.isEmpty()) continue;

            // 智能标签：CP→充电, AP→作业, LM→检查是否为休息站
            String primaryTag;
            String color;
            if (code.startsWith("LM")) {
                int totalEdgeTraffic = edges.stream()
                    .mapToInt(e -> ((Number) e.get("total_count")).intValue()).sum();
                int dwellScore = obs - totalEdgeTraffic;
                // 休息站判定：固定休息站 OR 观测远超边流量
                boolean isRest = FIXED_REST_STATIONS.contains(code) || (dwellScore > 100 && obs > totalEdgeTraffic * 5);
                if (isRest) {
                    primaryTag = "[\"休息\"]";
                    color = inferColorByTag("休息");
                } else {
                    primaryTag = "[\"路径\"]";
                    color = inferColorByTag("路径");
                }
            } else {
                primaryTag = inferTags(code);
                color = inferColor(code);
            }
            double confidence = Math.min(0.95, 0.5 + edges.size() * 0.05);

            // 区域大小基于观测次数：观测越多，区域越大（log 缩放）
            double half = Math.max(0.3, Math.min(3.0, Math.log10(obs + 1) * 0.8));
            String polygonJson = String.format("[[%.3f,%.3f],[%.3f,%.3f],[%.3f,%.3f],[%.3f,%.3f]]",
                cx - half, cy - half, cx + half, cy - half,
                cx + half, cy + half, cx - half, cy + half);

            // 查询该站点轨迹数据中占比最多的小车 IP
            String stationRobotIp = REST_STATION_AGV.get(code); // 固定休息站优先
            if (stationRobotIp == null) {
                try {
                    Map<String, Object> dom = trajectoryMapper.selectDominantRobotIpForStation(code);
                    if (dom != null) stationRobotIp = (String) dom.get("robot_ip");
                } catch (Exception ignored) {}
            }

            // UPSERT
            List<AgvSpatialElement> existing = mapper.selectByStationPatternAndSource(code, "TOPOLOGY");
            AgvSpatialElement zone;
            // 名称取标签值（与行为发现一致：充电/作业/路径），站号存 stationPattern
            String tagName = primaryTag.replace("[\"", "").replace("\"]", "");
            if (!existing.isEmpty()) {
                zone = existing.get(0);
                zone.setName(tagName);
                zone.setIsActive(true);
                zone.setPolygonJson(polygonJson);
                zone.setSemanticTags(primaryTag);
                zone.setColor(color);
                zone.setConfidence(confidence);
                zone.setHitCount(edges.size());
                zone.setRobotIp(stationRobotIp);
                zone.setUpdatedAt(now);
                mapper.updateSpatialElement(zone);
            } else {
                zone = new AgvSpatialElement();
                zone.setName(tagName);
                zone.setElementType("STATION_ZONE");
                zone.setStationPattern(code);
                zone.setPolygonJson(polygonJson);
                zone.setSemanticTags(primaryTag);
                zone.setColor(color);
                zone.setIsActive(true);
                zone.setConfidence(confidence);
                zone.setHitCount(edges.size());
                zone.setSource("TOPOLOGY");
                zone.setRobotIp(stationRobotIp);
                zone.setCreatedAt(now);
                zone.setUpdatedAt(now);
                mapper.insertSpatialElement(zone);
            }
            created++;
        }

        // ── 阶段2：高频主干路段通道区域 ──
        List<Map<String, Object>> mainEdges = jdbc.queryForList(
            "SELECT e.station_from, e.station_to, e.total_count, e.confidence, e.is_one_way, " +
            "e.zone_key, s1.x as x1, s1.y as y1, s2.x as x2, s2.y as y2 " +
            "FROM agv_route_topology_edge e " +
            "JOIN agv_route_topology_station s1 ON s1.zone_key = e.zone_key AND s1.station_code = e.station_from " +
            "JOIN agv_route_topology_station s2 ON s2.zone_key = e.zone_key AND s2.station_code = e.station_to " +
            "WHERE e.total_count >= 15 AND e.confidence = 'high' " +
            "ORDER BY e.total_count DESC LIMIT 30");

        for (var e : mainEdges) {
            String from = (String) e.get("station_from");
            String to = (String) e.get("station_to");
            double x1 = ((Number) e.get("x1")).doubleValue();
            double y1 = ((Number) e.get("y1")).doubleValue();
            double x2 = ((Number) e.get("x2")).doubleValue();
            double y2 = ((Number) e.get("y2")).doubleValue();
            int total = ((Number) e.get("total_count")).intValue();
            Object owObj = e.get("is_one_way");
            boolean isOneWay = owObj instanceof Boolean b ? b : ((Number) owObj).intValue() == 1;

            // 边标签判定：纯LM→作业走廊，纯AP→路径通道，混接→运输，触CP→充电
            String tag;
            String color;
            boolean hasLM = from.startsWith("LM") || to.startsWith("LM");
            boolean hasAP = from.startsWith("AP") || to.startsWith("AP");
            boolean hasCP = from.startsWith("CP") || to.startsWith("CP");

            if (isOneWay) { tag = "运输"; color = inferColorByTag("运输"); }
            else if (hasCP) { tag = "充电"; color = inferColorByTag("充电"); }
            else if (hasLM && !hasAP) { tag = "路径"; color = inferColorByTag("路径"); }
            else if (hasAP && !hasLM) { tag = "作业"; color = inferColorByTag("作业"); }
            else { tag = "运输"; color = inferColorByTag("运输"); }  // LM+AP混合边

            // 通道宽度：高频宽，低频窄
            double halfW = Math.max(0.15, Math.min(1.0, total / 30.0));
            double dx = x2 - x1, dy = y2 - y1;
            double len = Math.sqrt(dx * dx + dy * dy);
            if (len < 0.01) continue;
            double ux = -dy / len * halfW, uy = dx / len * halfW;

            String polygonJson = String.format("[[%.3f,%.3f],[%.3f,%.3f],[%.3f,%.3f],[%.3f,%.3f]]",
                x1 + ux, y1 + uy, x1 - ux, y1 - uy,
                x2 - ux, y2 - uy, x2 + ux, y2 + uy);

            // 查询起始站点轨迹中最多的 robot_ip 作为路段归属
            String edgeRobotIp = null;
            try {
                Map<String, Object> dom = trajectoryMapper.selectDominantRobotIpForStation(from);
                if (dom != null) edgeRobotIp = (String) dom.get("robot_ip");
            } catch (Exception ignored) {}

            String zoneKey = (String) e.get("zone_key");
            List<AgvSpatialElement> existing = mapper.selectByStationPatternAndSource(
                from + "→" + to, "TOPOLOGY");
            AgvSpatialElement zone;
            if (!existing.isEmpty()) {
                zone = existing.get(0);
                zone.setIsActive(true);
                zone.setPolygonJson(polygonJson);
                zone.setSemanticTags("[\"" + tag + "\"]");
                zone.setColor(color);
                zone.setConfidence(0.85);
                zone.setHitCount(total);
                zone.setRobotIp(edgeRobotIp);
                zone.setUpdatedAt(now);
                mapper.updateSpatialElement(zone);
            } else {
                zone = new AgvSpatialElement();
                zone.setName(tag);
                zone.setElementType("POLYGON_ZONE");
                zone.setStationPattern(from + "→" + to);
                zone.setPolygonJson(polygonJson);
                zone.setSemanticTags("[\"" + tag + "\"]");
                zone.setColor(color);
                zone.setIsActive(true);
                zone.setConfidence(0.85);
                zone.setHitCount(total);
                zone.setSource("TOPOLOGY");
                zone.setRobotIp(edgeRobotIp);
                zone.setCreatedAt(now);
                zone.setUpdatedAt(now);
                mapper.insertSpatialElement(zone);
            }
            created++;
        }

            log.info("[AgvSpatial] 路线拓扑区域生成完成: {}站点 + {}边 → 写入{}条",
                stations.size(), mainEdges.size(), created);
        return created;
    }

    // ── 行为驱动的空间区域发现 ──

    /** 确定性映射的活动类型：出现即确认，不需要概率统计 */
    private static final Map<String, String> DEFINITIVE_TAGS = Map.of(
        "CHARGING", "充电",
        "STATION_WORK", "作业"
    );

    /**
     * 从分析结果中发现空间区域。
     * CHARGING / STATION_WORK：确定性映射——出现即标记为区域（置信度1.0）。
     * REST_STATION / PATH_WAIT：聚类发现（需要足够多样本）。
     */
    public int spatialZoneDiscovery(LocalDateTime from, LocalDateTime to) {
        List<AgvActivitySegment> segments = mapper.selectSegmentsInWindow(from, to);
        if (segments.isEmpty()) {
            log.info("[AgvSpatial] No segments in window for spatial discovery");
            return 0;
        }

        Map<String, Long> typeCounts = segments.stream()
            .collect(Collectors.groupingBy(AgvActivitySegment::getActivityType, Collectors.counting()));
        log.info("[AgvSpatial] Segments in window: total={}, byType={}", segments.size(), typeCounts);

        int created = 0, updated = 0;

        // ── 确定性映射：CHARGING → 充电区域，STATION_WORK → 作业区域 ──
        for (var entry : DEFINITIVE_TAGS.entrySet()) {
            String activityType = entry.getKey();
            String tag = entry.getValue();

            List<AgvActivitySegment> typed = segments.stream()
                .filter(s -> activityType.equals(s.getActivityType()))
                .collect(Collectors.toList());

            for (AgvActivitySegment seg : typed) {
                if (seg.getAvgX() == null || seg.getAvgY() == null) continue;

                // 排除移动中的叉臂操作：距离 > 50cm 说明车在走动
                if (seg.getDistanceM() != null && seg.getDistanceM() > 0.5) continue;

                // 作业标签额外条件：必须有叉臂抬升/降低动作
                if ("STATION_WORK".equals(activityType)) {
                    int forkActive = trajectoryMapper.countForkActiveInWindow(
                        seg.getRobotIp(), seg.getStartTime(), seg.getEndTime());
                    if (forkActive == 0) continue;
                }

                double cx = seg.getAvgX(), cy = seg.getAvgY();

                // 去重：5cm 质心距离内视为同一区域 → 仅增量更新
                List<AgvSpatialElement> existingZones = mapper.selectBehaviorZonesByTag(tag);
                boolean covered = false;
                for (AgvSpatialElement ez : existingZones) {
                    double[] zb = zoneBounds(ez);
                    double ezCx = (zb[0] + zb[1]) / 2, ezCy = (zb[2] + zb[3]) / 2;
                    if (Math.sqrt((cx - ezCx) * (cx - ezCx) + (cy - ezCy) * (cy - ezCy)) <= MERGE_DISTANCE_M) {
                        mapper.incrementZoneConfidence(ez.getId(), 1, 1.0);
                        covered = true; break;
                    }
                }
                if (covered) continue;

                // 创建 5cm 精度矩形，以叉臂变动坐标为锚点
                double minX = cx - FIXED_HALF_M, maxX = cx + FIXED_HALF_M;
                double minY = cy - FIXED_HALF_M, maxY = cy + FIXED_HALF_M;
                AgvSpatialElement zone = new AgvSpatialElement();
                zone.setName(tag);
                zone.setElementType("STATION_ZONE");
                zone.setPolygonJson(buildBoundingPolygonCoords(minX, minY, maxX, maxY));
                zone.setSemanticTags("[\"" + tag + "\"]");
                zone.setColor(inferColorByTag(tag));
                zone.setIsActive(true);
                zone.setHitCount(1);
                zone.setConfidence(1.0);
                zone.setSource("BEHAVIOR");
                zone.setRobotIp(seg.getRobotIp());
                mapper.insertSpatialElement(zone);
                created++;
            }
        }

        // ── 聚类发现：REST_STATION → 休息 ──
        {
            String activityType = "REST_STATION";
            String tag = "休息";

            List<AgvActivitySegment> typed = segments.stream()
                .filter(s -> activityType.equals(s.getActivityType()))
                .collect(Collectors.toList());
            if (typed.size() >= REST_MIN_SEGMENTS) {

                Map<String, List<AgvActivitySegment>> grid = new HashMap<>();
                for (AgvActivitySegment seg : typed) {
                    if (seg.getAvgX() == null || seg.getAvgY() == null) continue;
                    int gx = (int) Math.floor(seg.getAvgX() / GRID_CELL_M);
                    int gy = (int) Math.floor(seg.getAvgY() / GRID_CELL_M);
                    grid.computeIfAbsent(gx + "," + gy, k -> new ArrayList<>()).add(seg);
                }

                for (Cluster cluster : mergeAdjacentCells(grid)) {
                    if (cluster.segments.size() < REST_MIN_SEGMENTS) continue;
                    double[] bbox = clusterBbox(cluster);

                    String majorityIp = cluster.segments.stream()
                        .collect(Collectors.groupingBy(AgvActivitySegment::getRobotIp, Collectors.counting()))
                        .entrySet().stream().max(Map.Entry.comparingByValue())
                        .map(Map.Entry::getKey).orElse(null);
                    created += upsertZone(bbox[0], bbox[1], bbox[2], bbox[3], tag, cluster.segments.size(), majorityIp);
                }
            }
        }

        mapper.decayUnhitZones(from);
        log.info("[AgvSpatial] Spatial discovery: created={} (window {} → {})",
            created, from, to);
        return created;
    }

    /** 合并同标签且质心 ≤5cm 的 BEHAVIOR 区域（仅去重，不扩展包围盒） */
    private static final double MERGE_DISTANCE_M = 0.80; // 80cm

    public int mergeOverlappingZones() {
        List<AgvSpatialElement> all = mapper.selectAllSpatialElements().stream()
            .filter(z -> "BEHAVIOR".equals(z.getSource()) && z.getIsActive())
            .collect(Collectors.toList());
        int merged = 0;
        for (int i = 0; i < all.size(); i++) {
            AgvSpatialElement a = all.get(i);
            if (!a.getIsActive()) continue;
            double[] ba = zoneBounds(a);
            double acx = (ba[0] + ba[1]) / 2, acy = (ba[2] + ba[3]) / 2;
            for (int j = i + 1; j < all.size(); j++) {
                AgvSpatialElement b = all.get(j);
                if (!b.getIsActive()) continue;
                if (!Objects.equals(a.getSemanticTags(), b.getSemanticTags())) continue;
                double[] bb = zoneBounds(b);
                double bcx = (bb[0] + bb[1]) / 2, bcy = (bb[2] + bb[3]) / 2;
                double dist = Math.sqrt((acx - bcx) * (acx - bcx) + (acy - bcy) * (acy - bcy));
                if (dist > MERGE_DISTANCE_M) continue;
                // 质心 ≤5cm → 视为同一区域，保留命中多的，去重另一个
                if ((a.getHitCount() != null ? a.getHitCount() : 0) >= (b.getHitCount() != null ? b.getHitCount() : 0)) {
                    a.setHitCount((a.getHitCount() != null ? a.getHitCount() : 0) + (b.getHitCount() != null ? b.getHitCount() : 0));
                    mapper.updateSpatialElement(a);
                    b.setIsActive(false);
                    mapper.updateSpatialElement(b);
                } else {
                    b.setHitCount((a.getHitCount() != null ? a.getHitCount() : 0) + (b.getHitCount() != null ? b.getHitCount() : 0));
                    mapper.updateSpatialElement(b);
                    a.setIsActive(false);
                    mapper.updateSpatialElement(a);
                    // 更新后续循环的引用
                    ba = zoneBounds(b);
                    acx = (ba[0] + ba[1]) / 2; acy = (ba[2] + ba[3]) / 2;
                }
                merged++;
            }
        }
        return merged;
    }

    /** 清理过期 BEHAVIOR 区域：24h 未更新且命中 ≤2 次 → 删除 */
    public int cleanupStaleZones(int hours) {
        List<AgvSpatialElement> all = mapper.selectAllSpatialElements().stream()
            .filter(z -> "BEHAVIOR".equals(z.getSource()) && z.getIsActive())
            .collect(Collectors.toList());
        int cleaned = 0;
        LocalDateTime cutoff = LocalDateTime.now().minusHours(hours);
        for (AgvSpatialElement z : all) {
            if (z.getUpdatedAt() != null && z.getUpdatedAt().isBefore(cutoff)
                && (z.getHitCount() == null || z.getHitCount() <= 2)) {
                z.setIsActive(false);
                mapper.updateSpatialElement(z);
                cleaned++;
            }
        }
        return cleaned;
    }

    private double[] clusterBbox(Cluster cluster) {
        double minX = Double.MAX_VALUE, minY = Double.MAX_VALUE, maxX = -Double.MAX_VALUE, maxY = -Double.MAX_VALUE;
        for (AgvActivitySegment seg : cluster.segments) {
            if (seg.getAvgX() < minX) minX = seg.getAvgX();
            if (seg.getAvgY() < minY) minY = seg.getAvgY();
            if (seg.getAvgX() > maxX) maxX = seg.getAvgX();
            if (seg.getAvgY() > maxY) maxY = seg.getAvgY();
        }
        return new double[]{minX, minY, maxX, maxY};
    }

    private int upsertZone(double minX, double minY, double maxX, double maxY, String tag, int hits, String robotIp) {
        double cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
        List<AgvSpatialElement> existingZones = mapper.selectBehaviorZonesByTag(tag);
        for (AgvSpatialElement zone : existingZones) {
            double[] zb = zoneBounds(zone);
            double ezCx = (zb[0] + zb[1]) / 2, ezCy = (zb[2] + zb[3]) / 2;
            // 质心距离 ≤5cm 视为同一区域
            if (Math.sqrt((cx - ezCx) * (cx - ezCx) + (cy - ezCy) * (cy - ezCy)) <= MERGE_DISTANCE_M) {
                mapper.incrementZoneConfidence(zone.getId(), hits, (double) hits / (hits + 5));
                return 0;
            }
        }
        AgvSpatialElement zone = new AgvSpatialElement();
        zone.setName(tag + "-" + String.format("%.0f", cx) + "," + String.format("%.0f", cy));
        zone.setElementType("STATION_ZONE");
        zone.setPolygonJson(buildBoundingPolygonCoords(minX, minY, maxX, maxY));
        zone.setSemanticTags("[\"" + tag + "\"]");
        zone.setColor(inferColorByTag(tag));
        zone.setIsActive(true);
        zone.setHitCount(hits);
        zone.setConfidence((double) hits / (hits + 5));
        zone.setSource("BEHAVIOR");
        zone.setRobotIp(robotIp);
        mapper.insertSpatialElement(zone);
        return 1; // created
    }

    // ── 聚类算法 ──

    private static class Cluster {
        List<AgvActivitySegment> segments = new ArrayList<>();
    }

    /** 合并相邻网格单元为集群（BFS 泛洪） */
    private List<Cluster> mergeAdjacentCells(Map<String, List<AgvActivitySegment>> grid) {
        Set<String> visited = new HashSet<>();
        List<Cluster> clusters = new ArrayList<>();

        for (String cellKey : grid.keySet()) {
            if (visited.contains(cellKey)) continue;

            // BFS
            Cluster cluster = new Cluster();
            Queue<String> queue = new LinkedList<>();
            queue.add(cellKey);
            visited.add(cellKey);

            while (!queue.isEmpty()) {
                String key = queue.poll();
                List<AgvActivitySegment> cellSegs = grid.get(key);
                if (cellSegs != null) cluster.segments.addAll(cellSegs);

                // 检查 8 个相邻网格
                String[] parts = key.split(",");
                int gx = Integer.parseInt(parts[0]), gy = Integer.parseInt(parts[1]);
                for (int dx = -1; dx <= 1; dx++) {
                    for (int dy = -1; dy <= 1; dy++) {
                        if (dx == 0 && dy == 0) continue;
                        String nk = (gx + dx) + "," + (gy + dy);
                        if (grid.containsKey(nk) && !visited.contains(nk)) {
                            visited.add(nk);
                            queue.add(nk);
                        }
                    }
                }
            }
            clusters.add(cluster);
        }
        return clusters;
    }

    // ── 辅助方法 ──

    /** 计算区域的多边形质心 */
    private double[] zoneCentroid(AgvSpatialElement zone) {
        List<double[]> poly = AgvPrimitiveDetector.parsePolygon(zone.getPolygonJson());
        if (poly == null || poly.isEmpty()) return null;
        double cx = 0, cy = 0;
        for (double[] p : poly) { cx += p[0]; cy += p[1]; }
        return new double[]{ cx / poly.size(), cy / poly.size() };
    }

    /** 计算区域多边形的包围盒 [minX, maxX, minY, maxY] */
    private double[] zoneBounds(AgvSpatialElement zone) {
        List<double[]> poly = AgvPrimitiveDetector.parsePolygon(zone.getPolygonJson());
        if (poly == null || poly.isEmpty()) return new double[]{0, 1, 0, 1};
        double minX = Double.MAX_VALUE, maxX = -Double.MAX_VALUE;
        double minY = Double.MAX_VALUE, maxY = -Double.MAX_VALUE;
        for (double[] p : poly) {
            if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
            if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1];
        }
        return new double[]{minX, maxX, minY, maxY};
    }

    /** Build bounding box polygon from coordinate list */
    private String buildBoundingPolygon(List<Map<String, Object>> coords) {
        if (coords == null || coords.isEmpty()) return null;
        double minX = Double.MAX_VALUE, minY = Double.MAX_VALUE, maxX = -Double.MAX_VALUE, maxY = -Double.MAX_VALUE;
        for (Map<String, Object> row : coords) {
            Double x = toDouble(row.get("x")), y = toDouble(row.get("y"));
            if (x == null || y == null) continue;
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
        return buildBoundingPolygonCoords(minX, minY, maxX, maxY);
    }

    /** Build bounding box polygon JSON from direct coordinates */
    private String buildBoundingPolygonCoords(double minX, double minY, double maxX, double maxY) {
        double mx = 0.02, my = 0.02; // 2cm margin
        if (maxX - minX < 0.05) { double cx = (minX + maxX) / 2; minX = cx - 0.025; maxX = cx + 0.025; }
        if (maxY - minY < 0.05) { double cy = (minY + maxY) / 2; minY = cy - 0.025; maxY = cy + 0.025; }
        minX -= mx; minY -= my; maxX += mx; maxY += my;
        return String.format("[[%.4f,%.4f],[%.4f,%.4f],[%.4f,%.4f],[%.4f,%.4f]]",
                minX, minY, maxX, minY, maxX, maxY, minX, maxY);
    }

    private static Double toDouble(Object o) {
        if (o instanceof Number) return ((Number) o).doubleValue();
        return null;
    }

    private String inferTags(String station) {
        if (station.startsWith("CP")) return "[\"充电\"]";
        if (station.startsWith("LM")) return "[\"路径\"]";
        if (station.startsWith("AP")) return "[\"作业\"]";
        return "[\"未知\"]";
    }

    private String inferColor(String station) {
        if (station.startsWith("CP")) return "#22c55e";
        if (station.startsWith("LM")) return "#6b7280";
        if (station.startsWith("AP")) return "#f59e0b";
        return "#3b82f6";
    }

    private String inferColorByTag(String tag) {
        return switch (tag) {
            case "充电" -> "#22c55e";
            case "作业", "载货" -> "#f59e0b";
            case "路径" -> "#6b7280";
            case "休息" -> "#14b8a6";
            default -> "#3b82f6";
        };
    }
}
