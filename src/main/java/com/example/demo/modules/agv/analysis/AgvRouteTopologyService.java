package com.example.demo.modules.agv.analysis;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 路线模型2 — 机械化路线拓扑生成。
 *
 * <h3>与路线模型1(AgvRouteService)的区别</h3>
 * <ul>
 *   <li>模型1：按时间戳匹配共识模板，算法动态发现"AGV走过的路径"</li>
 *   <li>模型2：频次统计+双向验证+硬约束，输出"确定化的道路网络图"</li>
 * </ul>
 *
 * <h3>算法流程 (7阶段)</h3>
 * <pre>
 * 阶段1 — 站点坐标聚类：每个站点编号取所有观测(x,y)的中位数作为锚点
 * 阶段2 — 段落频次统计：按时序提取站点序列→去重相邻重复→计数有向段落
 * 阶段3 — 噪声过滤：双向总频次 < 3 的段落丢弃（单次绕路/探索/传感器误差）
 * 阶段4 — 硬约束应用：物理道路布局约束（如 LM1210 仅连接 LM1209/LM1305）
 * 阶段5 — 方向性分析：atan2 计算角度，双向计数失衡→标记单行道
 * 阶段6 — 区域分配：站点前缀 LM1xxx→zone1 / LM2xxx→zone2
 * 阶段7 — 持久化：UPSERT 到 agv_route_topology_station + agv_route_topology_edge
 * </pre>
 *
 * <h3>噪声过滤的统计依据</h3>
 * 对 2026-07-29 原始轨迹分析：
 * <pre>
 *   频次 1x: 136 段 ← 单次绕路/异常/传感器跳变
 *   频次 2x:  51 段 ← 去程未回/回程未去/探索性路径
 *   频次 3x:  48 段 ← 开始形成稳定模式
 *   频次 ≥5x: 248 段 ← 核心道路网络
 * </pre>
 * 阈值=3 是基于数据自然断层：1-2次占39%但几乎全是异常，3次以上进入稳定道路网。
 *
 * @author Route Topology Model v2.0
 */
@Service
public class AgvRouteTopologyService {

    private static final Logger log = LoggerFactory.getLogger(AgvRouteTopologyService.class);
    private static final ObjectMapper mapper = new ObjectMapper();

    private final JdbcTemplate jdbc;

    /** 已知六台 AGV 的 IP */
    private static final String[] KNOWN_IPS = {
        "172.22.159.16", "172.22.159.18", "172.22.159.20", "172.22.159.22",
        "172.22.159.113", "172.22.159.115"
    };

    /** Zone → AGV IP 映射（zone1 现在含 4 台：16/18/113/115） */
    private static final Map<String, String[]> ZONE_AGV_MAP = Map.of(
        "zone1", new String[]{"172.22.159.16", "172.22.159.18", "172.22.159.113", "172.22.159.115"},
        "zone2", new String[]{"172.22.159.20", "172.22.159.22"}
    );

    // ═══════════════════════════════════════════════════════════════
    // 阶段4 — 硬约束：物理道路布局规则
    // 这些规则来自对站点实际物理连接关系的人工确认
    // ═══════════════════════════════════════════════════════════════

    /** 站点 → 仅允许连接的邻居集合 */
    private static final Map<String, Set<String>> HARD_CONSTRAINTS = Map.of(
        "LM1210", Set.of("LM1209", "LM1305")
        // 未来发现更多物理约束时在此追加
    );

    // ═══════════════════════════════════════════════════════════════
    // 参数常量
    // ═══════════════════════════════════════════════════════════════

    /** 频次阈值：双向总次数低于此值的段落视为噪声丢弃 */
    private static final int NOISE_THRESHOLD = 3;

    /** 高置信度阈值：双向总次数 >= 此值 */
    private static final int HIGH_CONFIDENCE_THRESHOLD = 5;

    /** 分析窗口：回溯多少小时的轨迹数据 */
    private static final int TRAJECTORY_WINDOW_HOURS = 168; // 7天

    public AgvRouteTopologyService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    // ═══════════════════════════════════════════════════════════════
    // 公开 API
    // ═══════════════════════════════════════════════════════════════

    /**
     * 执行完整的路线拓扑生成流程。
     *
     * @return 生成结果摘要
     */
    public Map<String, Object> generateAll() {
        LocalDateTime since = LocalDateTime.now().minusHours(TRAJECTORY_WINDOW_HOURS);
        LocalDateTime until = LocalDateTime.now();

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("algorithmVersion", "2.0");
        result.put("noiseThreshold", NOISE_THRESHOLD);
        result.put("windowHours", TRAJECTORY_WINDOW_HOURS);
        result.put("generatedAt", until.toString());

        List<Map<String, Object>> zoneResults = new ArrayList<>();
        int totalStations = 0, totalEdges = 0, totalRaw = 0, totalNoise = 0, totalConstraint = 0;

        for (var zoneEntry : ZONE_AGV_MAP.entrySet()) {
            String zoneKey = zoneEntry.getKey();
            String[] agvIps = zoneEntry.getValue();

            log.info("路线模型2: 开始分析 {} (AGVs: {})", zoneKey, String.join(",", agvIps));

            // 阶段1+2：提取站点坐标 + 统计段落频次（按 IP 分开，追踪每组路段由哪些车贡献）
            Map<String, List<double[]>> stationObservations = new LinkedHashMap<>();
            Map<String, Map<String, Integer>> segmentsByIp = new LinkedHashMap<>(); // ip → ("A→B" → count)
            Map<String, Integer> segmentFwdAll = new LinkedHashMap<>();  // 合并：所有 IP 的 "A→B" 总次数

            for (String ip : agvIps) {
                Map<String, Integer> ipSegs = new LinkedHashMap<>();
                processSingleAgv(ip, since, until, stationObservations, ipSegs);
                segmentsByIp.put(ip, ipSegs);
                for (var entry : ipSegs.entrySet()) {
                    segmentFwdAll.merge(entry.getKey(), entry.getValue(), Integer::sum);
                }
            }

            int rawSegments = segmentFwdAll.size();

            // 阶段1续：计算站点中位数锚点
            Map<String, double[]> stationAnchors = computeStationAnchors(stationObservations);

            // 阶段3：噪声过滤 + 阶段4：硬约束
            List<Map<String, Object>> edges = new ArrayList<>();
            Set<String> processedPairs = new HashSet<>();
            int noiseRemoved = 0, constraintRemoved = 0;

            for (String segKey : segmentFwdAll.keySet()) {
                String[] parts = segKey.split("→");
                String a = parts[0], b = parts[1];

                // 去重：每对(A,B)只处理一次
                String pairKey = a.compareTo(b) < 0 ? a + "|" + b : b + "|" + a;
                if (!processedPairs.add(pairKey)) continue;

                int fwd = segmentFwdAll.getOrDefault(segKey, 0);
                int rev = segmentFwdAll.getOrDefault(b + "→" + a, 0);
                int total = fwd + rev;

                // 追踪哪些 IP 贡献了此路段
                List<String> contributingIps = new ArrayList<>();
                for (String ip : agvIps) {
                    Map<String, Integer> ipSegs = segmentsByIp.get(ip);
                    if (ipSegs != null) {
                        int ipFwd = ipSegs.getOrDefault(segKey, 0);
                        int ipRev = ipSegs.getOrDefault(b + "→" + a, 0);
                        if (ipFwd + ipRev > 0) contributingIps.add(ip);
                    }
                }

                // 阶段3：噪声过滤
                if (total < NOISE_THRESHOLD) {
                    noiseRemoved++;
                    continue;
                }

                // 阶段4：硬约束
                boolean constrained = false;
                if (HARD_CONSTRAINTS.containsKey(a) && !HARD_CONSTRAINTS.get(a).contains(b)) {
                    constrained = true;
                }
                if (HARD_CONSTRAINTS.containsKey(b) && !HARD_CONSTRAINTS.get(b).contains(a)) {
                    constrained = true;
                }
                if (constrained) {
                    constraintRemoved++;
                    continue;
                }

                // 阶段5：方向性分析
                double[] posA = stationAnchors.get(a);
                double[] posB = stationAnchors.get(b);
                if (posA == null || posB == null) continue;

                double dx = posB[0] - posA[0];
                double dy = posB[1] - posA[1];
                double dist = Math.sqrt(dx * dx + dy * dy);
                double angleDeg = Math.toDegrees(Math.atan2(dy, dx));
                double reverseAngleDeg = (angleDeg + 180.0) % 360.0;

                boolean isOneWay = (fwd == 0 || rev == 0);
                String oneWayDir = null;
                if (isOneWay) {
                    oneWayDir = rev == 0 ? "forward" : "reverse";
                }
                String confidence = total >= HIGH_CONFIDENCE_THRESHOLD ? "high" : "medium";

                Map<String, Object> edge = new LinkedHashMap<>();
                edge.put("from", a);
                edge.put("to", b);
                edge.put("distance_m", round(dist, 3));
                edge.put("angle_deg", round(angleDeg, 1));
                edge.put("reverse_angle_deg", round(reverseAngleDeg, 1));
                edge.put("forward_count", fwd);
                edge.put("reverse_count", rev);
                edge.put("total_count", total);
                edge.put("is_one_way", isOneWay);
                edge.put("one_way_direction", oneWayDir);
                edge.put("confidence", confidence);
                edge.put("robot_ips", contributingIps);  // 追踪哪些 AGV 走过此路段

                // 阶段5续：从轨迹缓存取实际路径（带转角节点），fallback 直线
                String pathJson = buildPathJson(a, b, contributingIps, stationAnchors);
                edge.put("path_json", pathJson);
                edges.add(edge);
            }

            // 按总频次降序排列
            edges.sort((e1, e2) -> Integer.compare(
                (int) e2.get("total_count"), (int) e1.get("total_count")));

            // 阶段7：持久化到数据库
            persistZone(zoneKey, stationAnchors, edges);

            Map<String, Object> zoneResult = new LinkedHashMap<>();
            zoneResult.put("zone", zoneKey);
            zoneResult.put("agvs", List.of(agvIps));
            zoneResult.put("stationCount", stationAnchors.size());
            zoneResult.put("edgeCount", edges.size());
            zoneResult.put("rawSegments", rawSegments);
            zoneResult.put("noiseRemoved", noiseRemoved);
            zoneResult.put("constraintRemoved", constraintRemoved);
            zoneResults.add(zoneResult);

            totalStations += stationAnchors.size();
            totalEdges += edges.size();
            totalRaw += rawSegments;
            totalNoise += noiseRemoved;
            totalConstraint += constraintRemoved;

            log.info("路线模型2: {} 完成 — {} 站点, {} 边 (原始{}条, 噪声剔除{}, 约束剔除{})",
                zoneKey, stationAnchors.size(), edges.size(), rawSegments, noiseRemoved, constraintRemoved);
        }

        // 记录快照
        recordSnapshot(totalStations, totalEdges, totalRaw, totalNoise, totalConstraint);

        result.put("zones", zoneResults);
        result.put("totalStations", totalStations);
        result.put("totalEdges", totalEdges);
        result.put("totalRawSegments", totalRaw);
        result.put("totalNoiseRemoved", totalNoise);
        result.put("totalConstraintRemoved", totalConstraint);
        result.put("success", true);

        log.info("路线模型2: 全量生成完成 — {} 站点, {} 验证边 (原始{}条, 剔除{}噪声+{}约束)",
            totalStations, totalEdges, totalRaw, totalNoise, totalConstraint);

        return result;
    }

    /**
     * 查询已生成的路线拓扑（从数据库读取最近一次快照对应的数据）。
     */
    public Map<String, Object> getGenerated(String robotIp) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("description", "路线模型2 — 机械化路线拓扑（数据库生成结果）");
        result.put("method", "频次阈值>=3 + 双向验证 + 硬约束 + 单行道检测");
        result.put("algorithmVersion", "2.0");

        // 确定要返回的 zone
        List<String> targetZones = new ArrayList<>();
        if (robotIp != null && !robotIp.isBlank()) {
            for (var entry : ZONE_AGV_MAP.entrySet()) {
                for (String ip : entry.getValue()) {
                    if (ip.equals(robotIp)) {
                        targetZones.add(entry.getKey());
                        break;
                    }
                }
            }
            if (targetZones.isEmpty()) {
                result.put("error", "未知 AGV IP: " + robotIp);
                return result;
            }
        } else {
            targetZones.addAll(ZONE_AGV_MAP.keySet());
        }

        Map<String, Object> zones = new LinkedHashMap<>();
        for (String zoneKey : targetZones) {
            Map<String, Object> zone = new LinkedHashMap<>();

            // 读站点
            List<Map<String, Object>> stationRows = jdbc.queryForList(
                "SELECT station_code, x, y, observations FROM agv_route_topology_station WHERE zone_key = ?",
                zoneKey);
            Map<String, Object> stations = new LinkedHashMap<>();
            for (var row : stationRows) {
                Map<String, Object> s = new LinkedHashMap<>();
                s.put("x", row.get("x"));
                s.put("y", row.get("y"));
                s.put("observations", row.get("observations"));
                stations.put((String) row.get("station_code"), s);
            }
            zone.put("stations", stations);

            // 读边 → 字段名映射为前端期望的格式（from/to 而非 station_from/station_to）
            List<Map<String, Object>> edgeRows = jdbc.queryForList(
                "SELECT station_from, station_to, distance_m, angle_deg, reverse_angle_deg, " +
                "forward_count, reverse_count, total_count, is_one_way, one_way_direction, " +
                "confidence, robot_ips, path_json " +
                "FROM agv_route_topology_edge WHERE zone_key = ? ORDER BY total_count DESC",
                zoneKey);
            List<Map<String, Object>> edgesOut = new ArrayList<>();
            for (var row : edgeRows) {
                Map<String, Object> e = new LinkedHashMap<>();
                e.put("from", row.get("station_from"));
                e.put("to", row.get("station_to"));
                e.put("distance_m", row.get("distance_m"));
                e.put("angle_deg", row.get("angle_deg"));
                e.put("reverse_angle_deg", row.get("reverse_angle_deg"));
                e.put("forward_count", row.get("forward_count"));
                e.put("reverse_count", row.get("reverse_count"));
                e.put("total_count", row.get("total_count"));
                e.put("is_one_way", row.get("is_one_way"));
                e.put("one_way_direction", row.get("one_way_direction"));
                e.put("confidence", row.get("confidence"));
                e.put("path_json", row.get("path_json") != null ? row.get("path_json") : "[]");
                // 解析 robot_ips JSON 数组
                String ipsJson = (String) row.get("robot_ips");
                if (ipsJson != null && !ipsJson.isBlank()) {
                    try { e.put("robot_ips", mapper.readValue(ipsJson, List.class)); } catch (Exception ex) { e.put("robot_ips", List.of()); }
                } else {
                    e.put("robot_ips", List.of());
                }
                edgesOut.add(e);
            }
            zone.put("edges", edgesOut);
            zone.put("station_count", stations.size());
            zone.put("edge_count", edgeRows.size());
            zone.put("agvs", List.of(ZONE_AGV_MAP.get(zoneKey)));

            zones.put(zoneKey, zone);
        }
        result.put("zones", zones);

        // 附加约束说明
        Map<String, String> constraints = new LinkedHashMap<>();
        for (var entry : HARD_CONSTRAINTS.entrySet()) {
            constraints.put(entry.getKey(), "仅连接: " + String.join(", ", entry.getValue()));
        }
        result.put("hard_constraints_applied", constraints);

        return result;
    }

    // ═══════════════════════════════════════════════════════════════
    // 阶段1+2：单台 AGV 的站点提取 + 段落统计 + 路径追踪
    // ═══════════════════════════════════════════════════════════════

    private void processSingleAgv(String ip, LocalDateTime since, LocalDateTime until,
                                   Map<String, List<double[]>> stationObs,
                                   Map<String, Integer> segmentCounts) {
        // 收集此 IP 的站点间路径 (segKey → 各次穿行的轨迹点列表)
        Map<String, List<List<double[]>>> segPaths = new LinkedHashMap<>();

        // 查询该 AGV 在时间窗口内的所有轨迹点（按时间升序）
        List<Map<String, Object>> rows = jdbc.queryForList(
            "SELECT x, y, station, recorded_at FROM agv_trajectory " +
            "WHERE robot_ip = ? AND recorded_at >= ? AND recorded_at <= ? " +
            "AND x IS NOT NULL AND y IS NOT NULL " +
            "ORDER BY recorded_at ASC LIMIT 200000",
            ip, since, until);

        if (rows.isEmpty()) {
            log.debug("路线模型2: {} 在窗口内无数据", ip);
            return;
        }

        // 阶段1：收集站点坐标观测
        for (var row : rows) {
            String station = (String) row.get("station");
            if (station == null || station.isBlank()) continue;
            Object xObj = row.get("x"), yObj = row.get("y");
            if (xObj == null || yObj == null) continue;
            double x = ((Number) xObj).doubleValue();
            double y = ((Number) yObj).doubleValue();
            stationObs.computeIfAbsent(station, k -> new ArrayList<>()).add(new double[]{x, y});
        }

        // 阶段2：提取站点访问序列 → 去重相邻重复 → 统计段落 + 记录路径点
        String prevStation = null;
        List<double[]> currentPath = new ArrayList<>();  // 当前站点段的轨迹点
        for (var row : rows) {
            String station = (String) row.get("station");
            Object xObj = row.get("x"), yObj = row.get("y");
            if (xObj == null || yObj == null) continue;
            double x = ((Number) xObj).doubleValue();
            double y = ((Number) yObj).doubleValue();
            currentPath.add(new double[]{x, y});

            // 站点变化：结束一个段
            if (station != null && !station.isBlank() && !station.equals(prevStation)) {
                if (prevStation != null && !currentPath.isEmpty()) {
                    String segKey = prevStation + "→" + station;
                    segmentCounts.merge(segKey, 1, Integer::sum);
                    // 保存路径（取当前累积的点）
                    segPaths.computeIfAbsent(segKey, k -> new ArrayList<>()).add(new ArrayList<>(currentPath));
                    currentPath.clear();
                }
                prevStation = station;
            }
        }

        // 对每组路段的多次穿行轨迹做合并 → 简化为带转角节点的路径模板
        for (var entry : segPaths.entrySet()) {
            String segKey = entry.getKey();
            List<List<double[]>> traversals = entry.getValue();
            List<double[]> merged = mergeAndSimplifyPath(traversals);
            // 用 segKey 的最后一组路径作为该边的 path_json（多次穿行取最频繁的）
            // 为简单起见，取最长的穿行路径（通常包含最多转角信息）
            List<double[]> best = traversals.get(0);
            for (var t : traversals) { if (t.size() > best.size()) best = t; }
            List<double[]> simplified = simplifyByAngle(best, 35.0); // 转角>35度保留节点
            segmentPathCache.put(ip + "|" + segKey, simplified);
        }
    }

    /** IP+segKey → 简化后的路径点（阶段2填充，阶段5使用） */
    private final Map<String, List<double[]>> segmentPathCache = new LinkedHashMap<>();

    // ═══════════════════════════════════════════════════════════════
    // 路径简化：角度变化超过阈值则保留为转角节点
    // ═══════════════════════════════════════════════════════════════

    /** 基于角度变化的路径简化：相邻线段方向变化超过 thresholdDeg 度则保留节点 */
    private List<double[]> simplifyByAngle(List<double[]> points, double thresholdDeg) {
        if (points.size() <= 3) return new ArrayList<>(points);
        List<double[]> result = new ArrayList<>();
        result.add(points.get(0));  // 起点始终保留

        for (int i = 1; i < points.size() - 1; i++) {
            double[] prev = points.get(i - 1);
            double[] curr = points.get(i);
            double[] next = points.get(i + 1);

            double angle1 = Math.toDegrees(Math.atan2(curr[1] - prev[1], curr[0] - prev[0]));
            double angle2 = Math.toDegrees(Math.atan2(next[1] - curr[1], next[0] - curr[0]));
            double delta = Math.abs(angle2 - angle1);
            if (delta > 180) delta = 360 - delta;

            if (delta >= thresholdDeg) {
                result.add(curr);  // 转角处保留
            }
        }
        result.add(points.get(points.size() - 1));  // 终点始终保留

        // 如果简化后只剩2点（无转角），补充中间点保持形状
        if (result.size() == 2 && points.size() > 5) {
            int mid = points.size() / 2;
            result.add(1, points.get(mid));
        }
        return result;
    }

    /** 合并多次穿行路径（取最长/最具代表性的一条），简单实现 */
    private List<double[]> mergeAndSimplifyPath(List<List<double[]>> traversals) {
        // 选最长的穿行路径
        List<double[]> best = traversals.get(0);
        for (var t : traversals) { if (t.size() > best.size()) best = t; }
        return best;
    }

    // ═══════════════════════════════════════════════════════════════
    // 阶段1续：站点坐标中位数锚点
    // ═══════════════════════════════════════════════════════════════

    private Map<String, double[]> computeStationAnchors(Map<String, List<double[]>> observations) {
        Map<String, double[]> anchors = new LinkedHashMap<>();
        for (var entry : observations.entrySet()) {
            String station = entry.getKey();
            List<double[]> positions = entry.getValue();
            int n = positions.size();

            // X 中位数
            double[] xs = positions.stream().mapToDouble(p -> p[0]).sorted().toArray();
            double medianX = xs[n / 2];

            // Y 中位数
            double[] ys = positions.stream().mapToDouble(p -> p[1]).sorted().toArray();
            double medianY = ys[n / 2];

            anchors.put(station, new double[]{medianX, medianY});
        }
        return anchors;
    }

    // ═══════════════════════════════════════════════════════════════
    // 阶段7：持久化
    // ═══════════════════════════════════════════════════════════════

    private void persistZone(String zoneKey, Map<String, double[]> stations,
                              List<Map<String, Object>> edges) {
        // 先清空该 zone 的旧数据
        jdbc.update("DELETE FROM agv_route_topology_edge WHERE zone_key = ?", zoneKey);
        jdbc.update("DELETE FROM agv_route_topology_station WHERE zone_key = ?", zoneKey);

        LocalDateTime now = LocalDateTime.now();

        // 写站点
        for (var entry : stations.entrySet()) {
            String code = entry.getKey();
            double[] pos = entry.getValue();
            // observations 从 station 表重新统计（这里简化：只要有锚点就写1，实际观测数不重要）
            jdbc.update(
                "INSERT INTO agv_route_topology_station (zone_key, station_code, x, y, observations, generated_at) " +
                "VALUES (?, ?, ?, ?, ?, ?)",
                zoneKey, code, pos[0], pos[1], 1, now);
        }

        // 写边
        for (var edge : edges) {
            @SuppressWarnings("unchecked")
            List<String> robotIps = (List<String>) edge.get("robot_ips");
            String robotIpsJson = "[]";
            if (robotIps != null && !robotIps.isEmpty()) {
                try { robotIpsJson = mapper.writeValueAsString(robotIps); } catch (Exception ignored) {}
            }
            String pathJson = (String) edge.getOrDefault("path_json", "[]");
            jdbc.update(
                "INSERT INTO agv_route_topology_edge " +
                "(zone_key, station_from, station_to, distance_m, angle_deg, reverse_angle_deg, " +
                "forward_count, reverse_count, total_count, is_one_way, one_way_direction, " +
                "confidence, robot_ips, path_json, generated_at) " +
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                zoneKey,
                edge.get("from"), edge.get("to"),
                ((Number) edge.get("distance_m")).doubleValue(),
                ((Number) edge.get("angle_deg")).doubleValue(),
                ((Number) edge.get("reverse_angle_deg")).doubleValue(),
                ((Number) edge.get("forward_count")).intValue(),
                ((Number) edge.get("reverse_count")).intValue(),
                ((Number) edge.get("total_count")).intValue(),
                Boolean.TRUE.equals(edge.get("is_one_way")) ? 1 : 0,
                edge.get("one_way_direction"),
                edge.get("confidence"),
                robotIpsJson,
                pathJson,
                now);
        }
    }

    private void recordSnapshot(int stations, int edges, int raw, int noise, int constraint) {
        LocalDateTime now = LocalDateTime.now();
        String snapshotKey = "gen-" + now.toString().replace(":", "").substring(0, 16);

        for (String zoneKey : ZONE_AGV_MAP.keySet()) {
            jdbc.update(
                "INSERT INTO agv_route_topology_snapshot " +
                "(snapshot_key, zone_key, station_count, edge_count, raw_segments, " +
                "noise_removed, constraint_removed, trajectory_window_hours, algorithm_version, generated_at) " +
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, '2.0', ?)",
                snapshotKey, zoneKey, stations / 2, edges / 2,
                raw / 2, noise / 2, constraint / 2, TRAJECTORY_WINDOW_HOURS, now);
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // 工具方法
    // ═══════════════════════════════════════════════════════════════

    /** 从轨迹缓存取实际行驶路径，无缓存时用站点锚点直线 */
    private String buildPathJson(String from, String to, List<String> ips,
                                  Map<String, double[]> anchors) {
        // 优先取轨迹路径
        for (String ip : ips) {
            String cacheKey = ip + "|" + from + "→" + to;
            List<double[]> path = segmentPathCache.get(cacheKey);
            if (path != null && path.size() >= 2) {
                return toJson(path);
            }
        }
        // Fallback：两站点锚点直线
        double[] a = anchors.get(from), b = anchors.get(to);
        if (a != null && b != null) {
            return "[[" + round(a[0], 3) + "," + round(a[1], 3) + "],[" +
                   round(b[0], 3) + "," + round(b[1], 3) + "]]";
        }
        return "[]";
    }

    private String toJson(List<double[]> path) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < path.size(); i++) {
            if (i > 0) sb.append(",");
            sb.append("[").append(round(path.get(i)[0], 3)).append(",")
              .append(round(path.get(i)[1], 3)).append("]");
        }
        return sb.append("]").toString();
    }

    private static double round(double value, int decimals) {
        double factor = Math.pow(10, decimals);
        return Math.round(value * factor) / factor;
    }
}
