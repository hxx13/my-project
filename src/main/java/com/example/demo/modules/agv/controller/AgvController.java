package com.example.demo.modules.agv.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.agv.dto.AgvRobotStatus;
import com.example.demo.modules.agv.mapper.AgvTrajectoryMapper;
import com.example.demo.modules.agv.service.AgvProxyService;
import com.example.demo.modules.agv.service.AgvStatusCache;
import com.example.demo.modules.twin.common.entity.TwinJobScheduleConfig;
import com.example.demo.modules.twin.common.mapper.TwinJobScheduleConfigMapper;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

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

    private final AgvProxyService agvProxyService;
    private final AgvStatusCache statusCache;
    private final AgvTrajectoryMapper trajectoryMapper;
    private final TwinJobScheduleConfigMapper configMapper;
    private final JdbcTemplate jdbc;

    public AgvController(AgvProxyService agvProxyService,
                         AgvStatusCache statusCache,
                         AgvTrajectoryMapper trajectoryMapper,
                         TwinJobScheduleConfigMapper configMapper,
                         JdbcTemplate jdbc) {
        this.agvProxyService = agvProxyService;
        this.statusCache = statusCache;
        this.trajectoryMapper = trajectoryMapper;
        this.configMapper = configMapper;
        this.jdbc = jdbc;
    }

    private static final String[] KNOWN_IPS = {
        "172.22.159.16", "172.22.159.18", "172.22.159.20", "172.22.159.22"
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
            @RequestParam(defaultValue = "172.22.159.16,172.22.159.18,172.22.159.20,172.22.159.22") String ips,
            @RequestParam(defaultValue = "20000") int limit) {
        LocalDateTime fromDt = parseIso(from);
        LocalDateTime toDt = parseIso(to);
        int safeLimit = Math.min(limit, 20000);
        List<Map<String, Object>> rows = trajectoryMapper.selectReplay(ips, fromDt, toDt, safeLimit);
        return Result.success(rows);
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
    @Operation(summary = "获取所有小车坐标系旋转角度")
    public Result<Map<String, Object>> getCoordConfig() {
        Map<String, Object> result = new LinkedHashMap<>();
        for (String ip : KNOWN_IPS) {
            try {
                Double deg = jdbc.queryForObject(
                    "SELECT rotation_deg FROM agv_coord_config WHERE robot_ip = ?",
                    Double.class, ip);
                result.put(ip, deg != null ? deg : 0.0);
            } catch (Exception e) {
                result.put(ip, 0.0); // 表空或行不存在 → 默认0
            }
        }
        return Result.success(result);
    }

    @PutMapping("/coord-config/{ip}")
    @Operation(summary = "设置单台小车坐标系旋转角度")
    public Result<String> setCoordConfig(@PathVariable String ip, @RequestParam double deg) {
        jdbc.update(
            "INSERT INTO agv_coord_config (robot_ip, rotation_deg) VALUES (?, ?) " +
            "ON DUPLICATE KEY UPDATE rotation_deg = ?",
            ip, deg, deg);
        return Result.success("ok");
    }
}
