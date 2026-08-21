package com.example.demo.modules.agv.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.agv.dto.AgvRobotStatus;
import com.example.demo.modules.agv.analysis.model.AgvActivitySegment;
import com.example.demo.modules.agv.mapper.AgvAnalysisMapper;
import com.example.demo.modules.agv.mapper.AgvTrajectoryMapper;
import com.example.demo.modules.agv.service.AgvProxyService;
import com.example.demo.modules.agv.service.AgvStatusCache;
import com.example.demo.modules.agv.analysis.AgvRouteTopologyService;
import com.example.demo.modules.twin.common.entity.TwinJobScheduleConfig;
import com.example.demo.modules.twin.common.mapper.TwinJobScheduleConfigMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.*;

/**
 * AGV 机器人状态查询接口。
 * 权限：ADMIN 以上。
 */
@RestController
@RequestMapping("/api/v1/agv")
@Tag(name = "AGV 小车追踪", description = "AGV 实时状态、轨迹查询、配置")
public class AgvController {

    private static final ObjectMapper JSON = new ObjectMapper();
    /** 全局单槽预设键：覆盖保存即 upsert 此行 */
    private static final String COORD_PRESET_KEY = "default";

    private final AgvProxyService agvProxyService;
    private final AgvStatusCache statusCache;
    private final AgvTrajectoryMapper trajectoryMapper;
    private final AgvAnalysisMapper analysisMapper;
    private final TwinJobScheduleConfigMapper configMapper;
    private final JdbcTemplate jdbc;
    private final AgvRouteTopologyService routeTopologyService;

    public AgvController(AgvProxyService agvProxyService,
                         AgvStatusCache statusCache,
                         AgvTrajectoryMapper trajectoryMapper,
                         AgvAnalysisMapper analysisMapper,
                         TwinJobScheduleConfigMapper configMapper,
                         JdbcTemplate jdbc,
                         AgvRouteTopologyService routeTopologyService) {
        this.agvProxyService = agvProxyService;
        this.statusCache = statusCache;
        this.trajectoryMapper = trajectoryMapper;
        this.analysisMapper = analysisMapper;
        this.configMapper = configMapper;
        this.jdbc = jdbc;
        this.routeTopologyService = routeTopologyService;
    }

    private static final String[] KNOWN_IPS = {
        "172.22.159.16", "172.22.159.18", "172.22.159.20", "172.22.159.22",
        "172.22.159.113", "172.22.159.115"
    };

    /**
     * 获取四台车最新状态。优先内存缓存，缓存缺失时回退查 DB 最后一条记录。
     */
    @GetMapping("/current")
    @Operation(summary = "获取四台 AGV 最新状态")
    public Result<Map<String, Object>> current() {
        Map<String, AgvStatusCache.CachedStatus> cache = statusCache.all();
        Map<String, Object> result = new LinkedHashMap<>();
        for (String ip : KNOWN_IPS) {
            Map<String, Object> robot = new LinkedHashMap<>();
            if (cache.containsKey(ip)) {
                AgvStatusCache.CachedStatus cs = cache.get(ip);
                robot.put("status", cs.getStatus());
                robot.put("last_polled_at", cs.getLastPolledAt().toString());
            } else {
                // 缓存无 → 查 DB 最新一条，映射列名到前端期望格式
                List<Map<String, Object>> rows = trajectoryMapper.selectTrajectory(
                    ip, LocalDateTime.now().minusHours(24), LocalDateTime.now(), 1);
                if (!rows.isEmpty()) {
                    Map<String, Object> db = rows.get(0);
                    Map<String, Object> s = new LinkedHashMap<>();
                    s.put("x", db.get("x")); s.put("y", db.get("y")); s.put("angle", db.get("angle"));
                    s.put("battery_level", db.get("battery")); s.put("charging", db.get("charging"));
                    s.put("task_status", db.get("task_status")); s.put("blocked", db.get("blocked"));
                    s.put("emergency", db.get("emergency")); s.put("confidence", db.get("confidence"));
                    s.put("current_map", db.get("map_name")); s.put("current_station", db.get("station"));
                    s.put("odo", db.get("odo")); s.put("reloc_status", db.get("reloc_status"));
                    s.put("loadmap_status", db.get("loadmap_status")); s.put("rssi", db.get("rssi"));
                    s.put("driver_emc", db.get("driver_emc")); s.put("fork_height", db.get("fork_height"));
                    s.put("jack_enable", db.get("jack_enable")); s.put("jack_state", db.get("jack_state"));
                    s.put("jack_isFull", db.get("jack_isFull")); s.put("jack_mode", db.get("jack_mode"));
                    s.put("jack_error_code", db.get("jack_error_code"));
                    robot.put("status", s);
                    robot.put("last_polled_at", db.getOrDefault("recorded_at", "").toString());
                }
            }
            result.put(ip, robot);
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("robots", result);
        body.put("count", result.size());
        body.put("server_time", Instant.now().toString());
        return Result.success(body);
    }

    /**
     * 批量获取最近 N 秒的轨迹点（前端低频拉取用）。
     * 后端高频采集，前端 1s 拉一次，一次拿多帧。
     */
    @GetMapping("/recent")
    @Operation(summary = "获取最近 N 秒的轨迹点")
    public Result<Map<String, List<Map<String, Object>>>> recent(
            @RequestParam(defaultValue = "2") int seconds) {
        LocalDateTime since = LocalDateTime.now().minusSeconds(seconds);
        Map<String, List<Map<String, Object>>> result = new LinkedHashMap<>();
        for (String ip : KNOWN_IPS) {
            List<Map<String, Object>> rows = trajectoryMapper.selectTrajectoryAsc(
                ip, since, LocalDateTime.now(), 100);
            if (!rows.isEmpty()) result.put(ip, rows);
        }
        return Result.success(result);
    }

    /** 单台车实时透传上位机（用于调试），不读缓存 */
    @GetMapping("/status/{ip}")
    @Operation(summary = "单台 AGV 实时状态（透传上位机）")
    public Result<AgvRobotStatus> status(@PathVariable String ip) {
        AgvRobotStatus s = agvProxyService.fetchStatus(ip);
        if (s == null) {
            return Result.error("AGV " + ip + " 不可达");
        }
        return Result.success(s);
    }

    /** 单车轨迹查询 */
    @GetMapping("/trajectory/{ip}")
    @Operation(summary = "查询单车轨迹")
    public Result<List<Map<String, Object>>> trajectory(
            @PathVariable String ip,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            @RequestParam(defaultValue = "2000") int limit) {
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime fromDt = from != null ? parseIso(from) : now.minusHours(1);
        LocalDateTime toDt = to != null ? parseIso(to) : now;
        // 安全钳：最多 10000 条
        int safeLimit = Math.min(limit, 10000);
        List<Map<String, Object>> rows = trajectoryMapper.selectTrajectory(ip, fromDt, toDt, safeLimit);
        return Result.success(rows);
    }

    /** 多车回放帧序列 */
    @GetMapping("/replay")
    @Operation(summary = "多车回放帧序列")
    public Result<List<Map<String, Object>>> replay(
            @RequestParam String from,
            @RequestParam String to,
            @RequestParam(defaultValue = "172.22.159.16,172.22.159.18,172.22.159.20,172.22.159.22,172.22.159.113,172.22.159.115") String ips,
            @RequestParam(defaultValue = "20000") int limit) {
        LocalDateTime fromDt = parseIso(from);
        LocalDateTime toDt = parseIso(to);
        int safeLimit = Math.min(limit, 20000);
        List<Map<String, Object>> rows = trajectoryMapper.selectReplay(ips, fromDt, toDt, safeLimit);
        return Result.success(rows);
    }

    /**
     * 历史回放数据接口：返回指定时间窗口（最大10分钟）的单车轨迹 + 活动段，
     * 供前端单象限模式历史回放渲染使用。
     */
    @GetMapping("/history-playback/{ip}")
    @Operation(summary = "历史回放数据（单车，最大2小时窗口）")
    public Result<Map<String, Object>> historyPlayback(
            @PathVariable String ip,
            @RequestParam String from,
            @RequestParam String to) {
        LocalDateTime fromDt = parseIso(from);
        LocalDateTime toDt = parseIso(to);

        // 时间窗口校验：最大 2 小时
        long windowMs = java.time.Duration.between(fromDt, toDt).toMillis();
        if (windowMs <= 0) {
            return Result.error("结束时间必须晚于起始时间");
        }
        if (windowMs > 2 * 60 * 60 * 1000L) {
            return Result.error("时间窗口不能超过2小时，当前窗口: " + (windowMs / 60000) + " 分钟");
        }

        // 2小时窗口 × 500ms 采集频率 ≈ 最多14400条，取15000安全上限
        List<Map<String, Object>> trail = trajectoryMapper.selectTrajectoryAsc(ip, fromDt, toDt, 20000);

        // 取该窗口内的活动段
        List<AgvActivitySegment> segments = analysisMapper.selectSegments(ip, fromDt, toDt);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("robotIp", ip);
        result.put("from", fromDt.toString());
        result.put("to", toDt.toString());
        result.put("totalPoints", trail.size());
        result.put("trail", trail);
        result.put("segments", segments);
        return Result.success(result);
    }

    /** AGV 配置摘要（5 个 Job 的 enabled/窗口/频率） */
    @GetMapping("/config")
    @Operation(summary = "获取 AGV 作业配置摘要")
    public Result<List<Map<String, Object>>> config() {
        List<TwinJobScheduleConfig> all = configMapper.selectAll();
        List<Map<String, Object>> list = new ArrayList<>();
        for (TwinJobScheduleConfig c : all) {
            if (c.getJobKey() == null || !c.getJobKey().startsWith("AGV_")) continue;
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("jobKey", c.getJobKey());
            m.put("enabled", c.getEnabled() != null && c.getEnabled() == 1);
            m.put("scheduleStartTime", c.getScheduleStartTime());
            m.put("scheduleEndTime", c.getScheduleEndTime());
            m.put("weekDays", c.getWeekDays());
            m.put("pollIntervalSeconds", c.getPollIntervalSeconds());
            m.put("lastRunAt", c.getLastRunAt());
            m.put("lastStatus", c.getLastStatus());
            list.add(m);
        }
        return Result.success(list);
    }

    /** 快捷修改单个 Job 的 enabled（前端开关用） */
    @PutMapping("/config/{jobKey}")
    @Operation(summary = "快捷修改 AGV 作业启用状态")
    public Result<String> toggleEnabled(@PathVariable String jobKey,
                                         @RequestParam int enabled) {
        if (!jobKey.startsWith("AGV_")) {
            return Result.error("非 AGV 作业，不允许通过此接口修改");
        }
        TwinJobScheduleConfig cfg = configMapper.selectByJobKey(jobKey);
        if (cfg == null) {
            return Result.error("作业不存在: " + jobKey);
        }
        cfg.setEnabled(enabled);
        configMapper.updateSchedule(cfg);
        return Result.success("ok");
    }

    /** 兼容 ISO 8601 格式（含 Z / +08:00 等时区后缀）→ LocalDateTime（系统默认时区） */
    private static LocalDateTime parseIso(String s) {
        try {
            return Instant.parse(s).atZone(ZoneId.systemDefault()).toLocalDateTime();
        } catch (Exception e) {
            return LocalDateTime.parse(s);
        }
    }

    // ── 坐标系旋转配置 ──

    @GetMapping("/coord-config")
    @Operation(summary = "获取所有小车坐标系配置（旋转+平移偏移）")
    public Result<Map<String, Object>> getCoordConfig() {
        return Result.success(loadLiveCoordConfigs());
    }

    /**
     * 读取已归档的坐标系布局预设（与实时 agv_coord_config 分离）。
     * 无预设时 data.exists=false。
     */
    @GetMapping("/coord-config/preset")
    @Operation(summary = "获取坐标系布局预设快照")
    public Result<Map<String, Object>> getCoordPreset() {
        Map<String, Object> payload = new LinkedHashMap<>();
        try {
            Map<String, Object> row = jdbc.queryForMap(
                "SELECT configs_json, saved_at FROM agv_coord_preset WHERE preset_key = ?",
                COORD_PRESET_KEY);
            Map<String, Object> configs = parsePresetConfigs(String.valueOf(row.get("configs_json")));
            payload.put("exists", !configs.isEmpty());
            payload.put("savedAt", toEpochMillis(row.get("saved_at")));
            payload.put("configs", configs);
        } catch (EmptyResultDataAccessException e) {
            payload.put("exists", false);
            payload.put("savedAt", null);
            payload.put("configs", Map.of());
        } catch (Exception e) {
            return Result.error("读取坐标系预设失败: " + e.getMessage());
        }
        return Result.success(payload);
    }

    /**
     * 归档当前布局为预设。body.configs 可选；缺省则从 agv_coord_config 实时表快照。
     * 覆盖保存 = upsert 单槽 default。
     */
    @PutMapping("/coord-config/preset")
    @Operation(summary = "保存（覆盖）坐标系布局预设快照")
    public Result<Map<String, Object>> saveCoordPreset(@RequestBody(required = false) Map<String, Object> body) {
        try {
            Map<String, Object> configs;
            if (body != null && body.get("configs") instanceof Map<?, ?> raw) {
                configs = normalizePresetConfigs(raw);
            } else {
                configs = loadLiveCoordConfigs();
            }
            if (configs.isEmpty()) {
                return Result.error("当前没有可保存的坐标系数据");
            }
            String json = JSON.writeValueAsString(configs);
            Timestamp savedAt = Timestamp.from(Instant.now());
            jdbc.update(
                "INSERT INTO agv_coord_preset (preset_key, configs_json, saved_at) VALUES (?, ?, ?) " +
                "ON DUPLICATE KEY UPDATE configs_json = VALUES(configs_json), saved_at = VALUES(saved_at)",
                COORD_PRESET_KEY, json, savedAt);
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("exists", true);
            payload.put("savedAt", savedAt.getTime());
            payload.put("configs", configs);
            return Result.success(payload);
        } catch (Exception e) {
            return Result.error("保存坐标系预设失败: " + e.getMessage());
        }
    }

    /**
     * 将上次归档的预设写回实时 agv_coord_config，并返回应用后的配置。
     */
    @PostMapping("/coord-config/preset/restore")
    @Operation(summary = "恢复坐标系布局预设到实时配置")
    @Transactional
    public Result<Map<String, Object>> restoreCoordPreset() {
        try {
            Map<String, Object> row = jdbc.queryForMap(
                "SELECT configs_json, saved_at FROM agv_coord_preset WHERE preset_key = ?",
                COORD_PRESET_KEY);
            Map<String, Object> configs = parsePresetConfigs(String.valueOf(row.get("configs_json")));
            if (configs.isEmpty()) {
                return Result.error("暂无已保存的预设，请先点击「保存预设」");
            }
            for (Map.Entry<String, Object> e : configs.entrySet()) {
                String ip = e.getKey();
                if (!(e.getValue() instanceof Map<?, ?> frame)) continue;
                double deg = toDouble(frame.get("rotationDeg"), 0);
                double ox = toDouble(frame.get("offsetX"), 0);
                double oy = toDouble(frame.get("offsetY"), 0);
                double scale = toDouble(frame.get("scale"), 1);
                jdbc.update(
                    "INSERT INTO agv_coord_config (robot_ip, rotation_deg, offset_x, offset_y, scale) VALUES (?, ?, ?, ?, ?) " +
                    "ON DUPLICATE KEY UPDATE rotation_deg = ?, offset_x = ?, offset_y = ?, scale = ?",
                    ip, deg, ox, oy, scale, deg, ox, oy, scale);
            }
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("exists", true);
            payload.put("savedAt", toEpochMillis(row.get("saved_at")));
            payload.put("configs", configs);
            return Result.success(payload);
        } catch (EmptyResultDataAccessException e) {
            return Result.error("暂无已保存的预设，请先点击「保存预设」");
        } catch (Exception e) {
            return Result.error("恢复坐标系预设失败: " + e.getMessage());
        }
    }

    @PutMapping("/coord-config/{ip}")
    @Operation(summary = "设置单台小车坐标系配置（旋转+平移偏移+缩放）")
    public Result<String> setCoordConfig(@PathVariable String ip,
                                         @RequestParam(defaultValue = "0") double deg,
                                         @RequestParam(defaultValue = "0") double offsetX,
                                         @RequestParam(defaultValue = "0") double offsetY,
                                         @RequestParam(required = false) Double scale) {
        // scale 省略时保持库中原值不变——避免只调平移/旋转的调用把缩放悄悄重置为 1
        if (scale != null) {
            jdbc.update(
                "INSERT INTO agv_coord_config (robot_ip, rotation_deg, offset_x, offset_y, scale) VALUES (?, ?, ?, ?, ?) " +
                "ON DUPLICATE KEY UPDATE rotation_deg = ?, offset_x = ?, offset_y = ?, scale = ?",
                ip, deg, offsetX, offsetY, scale, deg, offsetX, offsetY, scale);
        } else {
            jdbc.update(
                "INSERT INTO agv_coord_config (robot_ip, rotation_deg, offset_x, offset_y) VALUES (?, ?, ?, ?) " +
                "ON DUPLICATE KEY UPDATE rotation_deg = ?, offset_x = ?, offset_y = ?",
                ip, deg, offsetX, offsetY, deg, offsetX, offsetY);
        }
        return Result.success("ok");
    }

    private Map<String, Object> loadLiveCoordConfigs() {
        Map<String, Object> result = new LinkedHashMap<>();
        for (String ip : KNOWN_IPS) {
            try {
                Map<String, Object> cfg = jdbc.queryForMap(
                    "SELECT rotation_deg, offset_x, offset_y, scale FROM agv_coord_config WHERE robot_ip = ?",
                    ip);
                result.put(ip, frameEntry(
                    toDouble(cfg.get("rotation_deg"), 0),
                    toDouble(cfg.get("offset_x"), 0),
                    toDouble(cfg.get("offset_y"), 0),
                    toDouble(cfg.get("scale"), 1)));
            } catch (Exception e) {
                result.put(ip, frameEntry(0, 0, 0, 1));
            }
        }
        return result;
    }

    private static Map<String, Object> frameEntry(double rotationDeg, double offsetX, double offsetY, double scale) {
        Map<String, Object> entry = new LinkedHashMap<>();
        entry.put("rotationDeg", rotationDeg);
        entry.put("offsetX", offsetX);
        entry.put("offsetY", offsetY);
        entry.put("scale", scale);
        return entry;
    }

    private Map<String, Object> parsePresetConfigs(String json) throws Exception {
        if (json == null || json.isBlank() || "null".equals(json)) return new LinkedHashMap<>();
        Map<String, Object> raw = JSON.readValue(json, new TypeReference<Map<String, Object>>() {});
        return normalizePresetConfigs(raw);
    }

    private Map<String, Object> normalizePresetConfigs(Map<?, ?> raw) {
        Map<String, Object> out = new LinkedHashMap<>();
        Set<String> known = new HashSet<>(Arrays.asList(KNOWN_IPS));
        for (Map.Entry<?, ?> e : raw.entrySet()) {
            String ip = String.valueOf(e.getKey());
            if (!known.contains(ip)) continue;
            if (!(e.getValue() instanceof Map<?, ?> frame)) continue;
            out.put(ip, frameEntry(
                toDouble(frame.get("rotationDeg"), 0),
                toDouble(frame.get("offsetX"), 0),
                toDouble(frame.get("offsetY"), 0),
                toDouble(frame.get("scale"), 1)));
        }
        return out;
    }

    private static double toDouble(Object v, double def) {
        if (v == null) return def;
        if (v instanceof Number n) return n.doubleValue();
        try {
            return Double.parseDouble(String.valueOf(v));
        } catch (Exception e) {
            return def;
        }
    }

    private static Long toEpochMillis(Object savedAt) {
        if (savedAt == null) return null;
        if (savedAt instanceof Timestamp ts) return ts.getTime();
        if (savedAt instanceof java.util.Date d) return d.getTime();
        if (savedAt instanceof LocalDateTime ldt) {
            return ldt.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli();
        }
        return null;
    }

    // ── 固定路线拓扑（DEPRECATED — 静态 JSON 方案已废弃） ──
    // 此静态 JSON 方案已被路线模型2取代，请使用:
    //   POST /api/v1/agv/routes/topology/generate  — 从 DB 轨迹数据动态生成
    //   GET  /api/v1/agv/routes/topology/generated  — 查询已生成的拓扑

    /** Zone → AGV IP 映射（zone1 含 4 台：16/18/113/115） */
    private static final Map<String, String[]> ZONE_AGV_MAP = Map.of(
        "zone1", new String[]{"172.22.159.16", "172.22.159.18", "172.22.159.113", "172.22.159.115"},
        "zone2", new String[]{"172.22.159.20", "172.22.159.22"}
    );

    /**
     * 获取修正后的机械化路线拓扑（固定数据，非算法生成）。
     * 可选 robotIp 参数按小车过滤，不传则返回全部。
     *
     * @deprecated 静态 JSON 方案已废弃，请使用 GET /api/v1/agv/routes/topology/generated（动态生成版本）
     */
    @Deprecated
    @GetMapping("/routes/topology")
    @Operation(summary = "[已废弃] 获取机械化路线拓扑（固定修正数据）— 请使用 /routes/topology/generated")
    public Result<Map<String, Object>> routeTopology(
            @RequestParam(required = false) String robotIp) {
        try {
            // 从 classpath 读取修正后的路线拓扑 JSON
            var is = getClass().getClassLoader().getResourceAsStream("agv/route-topology.json");
            if (is == null) {
                return Result.error("路线拓扑数据文件未找到: agv/route-topology.json");
            }
            String json = new String(is.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
            is.close();

            @SuppressWarnings("unchecked")
            Map<String, Object> full = new com.fasterxml.jackson.databind.ObjectMapper().readValue(json, Map.class);

            // 如果指定了 robotIp，只返回该车所属 zone 的数据
            if (robotIp != null && !robotIp.isBlank()) {
                String targetZone = null;
                for (var entry : ZONE_AGV_MAP.entrySet()) {
                    for (String ip : entry.getValue()) {
                        if (ip.equals(robotIp)) { targetZone = entry.getKey(); break; }
                    }
                    if (targetZone != null) break;
                }
                if (targetZone == null) {
                    return Result.error("未知 AGV IP: " + robotIp);
                }

                @SuppressWarnings("unchecked")
                Map<String, Object> zones = (Map<String, Object>) full.get("zones");
                Map<String, Object> filtered = new LinkedHashMap<>(full);
                Map<String, Object> filteredZones = new LinkedHashMap<>();
                filteredZones.put(targetZone, zones.get(targetZone));
                filtered.put("zones", filteredZones);
                return Result.success(filtered);
            }

            return Result.success(full);
        } catch (Exception e) {
            return Result.error("读取路线拓扑失败: " + e.getMessage());
        }
    }

    /**
     * 路线模型2 — 从数据库轨迹数据重新生成路线拓扑。
     * 执行完整的7阶段算法：站点聚类→频次统计→噪声过滤→硬约束→方向分析→区域分配→持久化。
     * 生成结果写入 agv_route_topology_station / agv_route_topology_edge 表。
     */
    @PostMapping("/routes/topology/generate")
    @Operation(summary = "路线模型2：从轨迹数据重新生成机械化路线拓扑")
    public Result<Map<String, Object>> generateRouteTopology() {
        try {
            Map<String, Object> result = routeTopologyService.generateAll();
            return Result.success(result);
        } catch (Exception e) {
            log.error("路线模型2生成失败", e);
            return Result.error("路线拓扑生成失败: " + e.getMessage());
        }
    }

    /**
     * 路线模型2 — 查询最近一次生成结果（从数据库读取，非静态文件）。
     */
    @GetMapping("/routes/topology/generated")
    @Operation(summary = "路线模型2：查询已生成的路线拓扑")
    public Result<Map<String, Object>> getGeneratedTopology(
            @RequestParam(required = false) String robotIp) {
        try {
            Map<String, Object> result = routeTopologyService.getGenerated(robotIp);
            return Result.success(result);
        } catch (Exception e) {
            return Result.error("查询路线拓扑失败: " + e.getMessage());
        }
    }

    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(AgvController.class);
}
