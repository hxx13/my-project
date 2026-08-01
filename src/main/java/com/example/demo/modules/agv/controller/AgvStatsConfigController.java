package com.example.demo.modules.agv.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.exception.ErrorCodeConstants;
import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.modules.agv.analysis.AgvStatsComputeEngine;
import com.example.demo.modules.agv.analysis.AgvStatsSseService;
import com.example.demo.modules.agv.mapper.AgvStatsMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

/**
 * AGV 统计管道 REST 接口。
 * <p>
 * 提供配置 CRUD、SSE 实时推送、快照查询和历史数据接口。
 * 统计管道是 AGV 轨迹数据的实时聚合层，支持三种配置类型。
 *
 * <h3>配置类型</h3>
 * <ul>
 *   <li>STATION_GROUP — 站点分组（定义统计哪些站点）</li>
 *   <li>METRIC_PIPE  — 指标管道（引用站点组 + 指标定义，生成 SSE 管道）</li>
 *   <li>BUNDLE — 组合管道（引用多个子管道合并输出）</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/v1/agv/stats")
@Tag(name = "AGV 统计管道")
public class AgvStatsConfigController {

    private static final Logger log = LoggerFactory.getLogger(AgvStatsConfigController.class);
    private static final ObjectMapper JSON = new ObjectMapper();

    private final AgvStatsMapper statsMapper;
    private final AgvStatsSseService sseService;
    @SuppressWarnings("unused")
    private final AgvStatsComputeEngine computeEngine; // 仅注入确保 @PostConstruct 建表先于请求

    public AgvStatsConfigController(AgvStatsMapper statsMapper, AgvStatsSseService sseService,
                                     AgvStatsComputeEngine computeEngine) {
        this.statsMapper = statsMapper;
        this.sseService = sseService;
        this.computeEngine = computeEngine;
    }

    // ═══════════════════════════════════════════════════════════════
    // SSE 实时推送
    // ═══════════════════════════════════════════════════════════════

    /**
     * SSE 端点：订阅指定管道的实时推送。
     * <p>
     * 建立连接后立即发送当前快照，后续由 {@code AgvStatsComputeEngine}
     * 每次 tick 完成后自动广播更新。
     *
     * @param slug 管道标识
     * @param from 时间范围起点（预留）
     * @param to   时间范围终点（预留）
     * @return SseEmitter 实例
     */
    @GetMapping(value = "/pipe/{slug}", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @Operation(summary = "订阅管道 SSE 实时推送")
    public SseEmitter subscribe(
            @PathVariable String slug,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to) {

        LocalDateTime fromDt = from != null ? parseIso(from) : LocalDateTime.now().minusHours(24);
        LocalDateTime toDt = to != null ? parseIso(to) : LocalDateTime.now();

        return sseService.subscribe(slug, fromDt, toDt);
    }

    // ═══════════════════════════════════════════════════════════════
    // 快照查询
    // ═══════════════════════════════════════════════════════════════

    /**
     * 一次性快照查询（无 SSE，用于页面初始化）。
     * <p>
     * 返回指定管道当前所有快照数据。
     *
     * @param slug 管道标识
     * @return 快照列表
     */
    @GetMapping("/pipe/{slug}/snapshot")
    @Operation(summary = "查询管道当前快照")
    public Result<List<Map<String, Object>>> snapshot(@PathVariable String slug) {
        Map<String, Object> config = statsMapper.selectConfigBySlug(slug);
        if (config == null) {
            throw TwinBusinessException.of(ErrorCodeConstants.AGV_STATS_PIPE_NOT_FOUND, "管道不存在: " + slug);
        }

        List<Map<String, Object>> snapshots = statsMapper.selectSnapshotsByConfigId(
            toLong(config.get("id")));

        return Result.success(snapshots != null ? snapshots : Collections.emptyList());
    }

    // ═══════════════════════════════════════════════════════════════
    // 历史数据
    // ═══════════════════════════════════════════════════════════════

    /**
     * 历史数据查询：将过去 N 小时内的事件按 5 分钟桶聚合，
     * 返回可用于图表渲染的时间序列数据。
     *
     * <h3>聚合逻辑</h3>
     * <ul>
     *   <li>COUNTER: 统计每个桶内匹配 STATION_ENTER 事件数</li>
     *   <li>TIMER:  统计每个桶内配对事件的估算时长</li>
     *   <li>STATE:  统计每个桶内匹配 STATUS_CHANGE 事件数</li>
     *   <li>GAUGE:  返回当前快照值（无历史趋势）</li>
     *   <li>BUNDLE: 合并各子管道的历史数据</li>
     * </ul>
     *
     * @param slug  管道标识
     * @param hours 回溯小时数，默认 24
     * @return 时间序列数据 [{time, value}, ...]
     */
    @GetMapping("/pipe/{slug}/history")
    @Operation(summary = "查询管道历史数据（最近N小时，5分钟采样）")
    public Result<List<Map<String, Object>>> history(
            @PathVariable String slug,
            @RequestParam(defaultValue = "24") int hours) {

        Map<String, Object> config = statsMapper.selectConfigBySlug(slug);
        if (config == null) {
            throw TwinBusinessException.of(ErrorCodeConstants.AGV_STATS_PIPE_NOT_FOUND, "管道不存在: " + slug);
        }

        String configType = asString(config.get("config_type"));
        Map<String, Object> definition = parseDefinition(config.get("definition_json"));
        LocalDateTime end = LocalDateTime.now();
        LocalDateTime start = end.minus(hours, ChronoUnit.HOURS);

        // For BUNDLE, delegate to child pipes
        if ("BUNDLE".equalsIgnoreCase(configType)) {
            @SuppressWarnings("unchecked")
            List<String> pipeRefs = (List<String>) definition.get("pipeRefs");
            List<Map<String, Object>> combined = new ArrayList<>();
            if (pipeRefs != null) {
                for (String refSlug : pipeRefs) {
                    try {
                        Map<String, Object> refConfig = statsMapper.selectConfigBySlug(refSlug);
                        if (refConfig == null) continue;
                        Map<String, Object> refDef = parseDefinition(refConfig.get("definition_json"));
                        List<String> refStations = resolveStations(refConfig, refDef);
                        List<Map<String, Object>> refHistory = buildHistory(refStations, start, end);
                        for (Map<String, Object> entry : refHistory) {
                            entry.put("_sourceSlug", refSlug);
                        }
                        combined.addAll(refHistory);
                    } catch (Exception e) {
                        log.debug("[AgvStatsController] Bundle history sub-query failed: {}", refSlug);
                    }
                }
            }
            return Result.success(combined);
        }

        // For METRIC_PIPE: resolve referenced STATION_GROUPs to get the station list
        // For STATION_GROUP: use stations directly from definition_json
        List<String> stations = resolveStations(config, definition);
        List<Map<String, Object>> history = buildHistory(stations, start, end);
        return Result.success(history);
    }

    /**
     * Resolve the effective station list from a config.
     * METRIC_PIPE → resolve each referenced STATION_GROUP slug → collect all stations.
     * STATION_GROUP → read stations directly from definition_json.
     */
    @SuppressWarnings("unchecked")
    private List<String> resolveStations(Map<String, Object> config, Map<String, Object> definition) {
        String configType = asString(config.get("config_type"));
        if ("METRIC_PIPE".equalsIgnoreCase(configType)) {
            // definition_json.sourceGroups = ["station-group-charging", ...]
            List<String> groupSlugs = (List<String>) definition.get("sourceGroups");
            if (groupSlugs == null || groupSlugs.isEmpty()) {
                // Fallback: definition_json.stationGroups (legacy key)
                groupSlugs = (List<String>) definition.get("stationGroups");
            }
            Set<String> allStations = new LinkedHashSet<>();
            if (groupSlugs != null) {
                for (String groupSlug : groupSlugs) {
                    Map<String, Object> groupConfig = statsMapper.selectConfigBySlug(groupSlug);
                    if (groupConfig == null) continue;
                    Map<String, Object> groupDef = parseDefinition(groupConfig.get("definition_json"));
                    List<String> groupStations = (List<String>) groupDef.get("stations");
                    if (groupStations != null) allStations.addAll(groupStations);
                }
            }
            return new ArrayList<>(allStations);
        }
        // STATION_GROUP or fallback: read stations directly
        List<String> stations = (List<String>) definition.get("stations");
        return stations != null ? stations : Collections.emptyList();
    }

    /**
     * Build 5-minute bucket aggregated history from event log for a station list.
     * Queries STATION_ENTER + TASK_START/TASK_END events in range, counts per bucket.
     */
    private List<Map<String, Object>> buildHistory(List<String> stations, LocalDateTime from, LocalDateTime to) {
        if (stations == null || stations.isEmpty()) return Collections.emptyList();

        // Query all relevant events for these stations
        List<Map<String, Object>> events = statsMapper.selectEventsInRange(from, to, null, stations);

        // Aggregate into 5-minute buckets
        Map<Long, Integer> buckets = new TreeMap<>();
        for (Map<String, Object> event : events) {
            LocalDateTime eventAt = toLocalDateTime(event.get("event_at"));
            if (eventAt == null) continue;
            long bucketKey = eventAt.truncatedTo(ChronoUnit.MINUTES)
                .withMinute((eventAt.getMinute() / 5) * 5)
                .atZone(ZoneId.systemDefault()).toInstant().toEpochMilli();
            buckets.merge(bucketKey, 1, Integer::sum);
        }

        List<Map<String, Object>> result = new ArrayList<>();
        for (Map.Entry<Long, Integer> entry : buckets.entrySet()) {
            Map<String, Object> point = new LinkedHashMap<>();
            point.put("time", Instant.ofEpochMilli(entry.getKey()).toString());
            point.put("value", entry.getValue().doubleValue());
            result.add(point);
        }
        return result;
    }

    // ═══════════════════════════════════════════════════════════════
    // Config CRUD
    // ═══════════════════════════════════════════════════════════════

    /**
     * 列出所有配置，可选按类型筛选。
     *
     * @param type 配置类型（STATION_GROUP/METRIC_PIPE/BUNDLE），可选
     */
    @GetMapping("/config")
    @Operation(summary = "列出管道配置")
    public Result<List<Map<String, Object>>> listConfigs(
            @RequestParam(required = false) String type) {

        List<Map<String, Object>> configs;
        if (type != null && !type.isBlank()) {
            configs = statsMapper.selectActiveConfigsByType(type.toUpperCase());
        } else {
            configs = statsMapper.selectAllConfigs();
        }

        return Result.success(configs != null ? configs : Collections.emptyList());
    }

    /**
     * 查询单个配置详情。
     */
    @GetMapping("/config/{id}")
    @Operation(summary = "查询管道配置详情")
    public Result<Map<String, Object>> getConfig(@PathVariable Long id) {
        Map<String, Object> config = statsMapper.selectConfigById(id);
        if (config == null) {
            throw TwinBusinessException.of(ErrorCodeConstants.AGV_STATS_CONFIG_NOT_FOUND, "配置不存在: " + id);
        }
        return Result.success(config);
    }

    /**
     * 创建新的统计管道配置。
     *
     * <p>请求体示例：
     * <pre>{@code
     * {
     *   "name": "充电站访问次数",
     *   "configType": "STATION_GROUP",
     *   "pipelineSlug": "charging-visits",
     *   "definitionJson": "{\"stations\":[\"CP1\",\"CP2\"],\"metricType\":\"visit_count\"}"
     * }
     * }</pre>
     */
    @PostMapping("/config")
    @Operation(summary = "创建管道配置")
    public Result<Map<String, Object>> createConfig(@RequestBody Map<String, Object> body) {
        String name = asString(body.get("name"));
        String configType = asString(body.get("configType"));
        String pipelineSlug = asString(body.get("pipelineSlug"));
        String definitionJson = asString(body.get("definitionJson"));

        if (name == null || name.isBlank()) {
            throw TwinBusinessException.of(ErrorCodeConstants.AGV_STATS_INVALID_CONFIG, "name 不能为空");
        }
        if (configType == null || configType.isBlank()) {
            throw TwinBusinessException.of(ErrorCodeConstants.AGV_STATS_INVALID_CONFIG, "configType 不能为空");
        }
        // Validate configType enum — 配置层类型，非计算引擎内部类型
        Set<String> validTypes = Set.of("STATION_GROUP", "METRIC_PIPE", "BUNDLE");
        if (!validTypes.contains(configType.toUpperCase())) {
            throw TwinBusinessException.of(ErrorCodeConstants.AGV_STATS_INVALID_CONFIG,
                "无效的 configType: " + configType + "，有效值: " + validTypes);
        }

        // Slug: METRIC_PIPE 必填；STATION_GROUP/BUNDLE 可选，自动生成
        if (pipelineSlug == null || pipelineSlug.isBlank()) {
            if ("METRIC_PIPE".equalsIgnoreCase(configType)) {
                throw TwinBusinessException.of(ErrorCodeConstants.AGV_STATS_INVALID_CONFIG, "METRIC_PIPE 必须提供 pipelineSlug");
            }
            // Auto-generate slug: lowercase name with hyphens + timestamp suffix
            pipelineSlug = name.trim().toLowerCase().replaceAll("[^a-z0-9\\u4e00-\\u9fff]+", "-")
                .replaceAll("^-|-$", "");
            if (pipelineSlug.length() > 20) pipelineSlug = pipelineSlug.substring(0, 20);
            pipelineSlug = pipelineSlug + "-" + System.currentTimeMillis() % 100000;
        }

        // Check slug uniqueness
        Map<String, Object> existing = statsMapper.selectConfigBySlug(pipelineSlug);
        if (existing != null) {
            throw TwinBusinessException.of(ErrorCodeConstants.AGV_STATS_INVALID_CONFIG,
                "pipelineSlug 已存在: " + pipelineSlug);
        }

        Map<String, Object> config = new LinkedHashMap<>();
        config.put("name", name.trim());
        config.put("configType", configType.toUpperCase());
        config.put("pipelineSlug", pipelineSlug.trim());
        config.put("definitionJson", definitionJson != null ? definitionJson : "{}");

        statsMapper.insertConfig(config);

        // Return the created config with its generated ID
        Object generatedId = config.get("id");
        if (generatedId != null) {
            Map<String, Object> created = statsMapper.selectConfigById(toLong(generatedId));
            return Result.success(created != null ? created : config);
        }
        return Result.success(config);
    }

    /**
     * 更新管道配置。
     */
    @PutMapping("/config/{id}")
    @Operation(summary = "更新管道配置")
    public Result<Map<String, Object>> updateConfig(
            @PathVariable Long id,
            @RequestBody Map<String, Object> body) {

        Map<String, Object> existing = statsMapper.selectConfigById(id);
        if (existing == null) {
            throw TwinBusinessException.of(ErrorCodeConstants.AGV_STATS_CONFIG_NOT_FOUND, "配置不存在: " + id);
        }

        String name = asString(body.get("name"));
        String configType = asString(body.get("configType"));
        String pipelineSlug = asString(body.get("pipelineSlug"));
        String definitionJson = asString(body.get("definitionJson"));

        // Use existing values if not provided
        if (name == null) name = asString(existing.get("name"));
        if (configType == null) configType = asString(existing.get("config_type"));
        if (pipelineSlug == null) pipelineSlug = asString(existing.get("pipeline_slug"));
        if (definitionJson == null) definitionJson = asString(existing.get("definition_json"));

        // Check slug uniqueness if changed
        if (!pipelineSlug.equals(asString(existing.get("pipeline_slug")))) {
            Map<String, Object> slugOwner = statsMapper.selectConfigBySlug(pipelineSlug);
            if (slugOwner != null) {
                throw TwinBusinessException.of(ErrorCodeConstants.AGV_STATS_INVALID_CONFIG,
                    "pipelineSlug 已被使用: " + pipelineSlug);
            }
        }

        statsMapper.updateConfig(id, name, configType, definitionJson, pipelineSlug);

        Map<String, Object> updated = statsMapper.selectConfigById(id);
        return Result.success(updated != null ? updated : Map.of("id", id));
    }

    /**
     * 删除管道配置（同时删除关联快照）。
     */
    @DeleteMapping("/config/{id}")
    @Operation(summary = "删除管道配置")
    public Result<String> deleteConfig(@PathVariable Long id) {
        Map<String, Object> existing = statsMapper.selectConfigById(id);
        if (existing == null) {
            throw TwinBusinessException.of(ErrorCodeConstants.AGV_STATS_CONFIG_NOT_FOUND, "配置不存在: " + id);
        }

        // Delete associated snapshots first
        statsMapper.deleteSnapshotsByConfigId(id);
        statsMapper.deleteConfig(id);

        return Result.success("已删除配置及关联快照");
    }

    /**
     * 切换管道启用/停用状态。
     *
     * @param id     配置 ID
     * @param active 1=启用, 0=停用
     */
    @PutMapping("/config/{id}/toggle")
    @Operation(summary = "切换管道启用/停用")
    public Result<String> toggleConfig(
            @PathVariable Long id,
            @RequestParam int active) {

        Map<String, Object> existing = statsMapper.selectConfigById(id);
        if (existing == null) {
            throw TwinBusinessException.of(ErrorCodeConstants.AGV_STATS_CONFIG_NOT_FOUND, "配置不存在: " + id);
        }

        if (active != 0 && active != 1) {
            throw TwinBusinessException.of(ErrorCodeConstants.AGV_STATS_INVALID_CONFIG, "active 必须为 0 或 1");
        }

        statsMapper.toggleConfig(id, active);
        return Result.success(active == 1 ? "已启用" : "已停用");
    }

    // ═══════════════════════════════════════════════════════════════
    // 辅助接口
    // ═══════════════════════════════════════════════════════════════

    /**
     * 获取所有可用站点编码列表（用于配置 UI 的站点选择器）。
     */
    @GetMapping("/config/stations")
    @Operation(summary = "获取可用站点列表")
    public Result<List<String>> availableStations() {
        List<String> stations = statsMapper.selectDistinctStations();
        return Result.success(stations != null ? stations : Collections.emptyList());
    }

    // ═══════════════════════════════════════════════════════════════
    // Helpers
    // ═══════════════════════════════════════════════════════════════

    @SuppressWarnings("unchecked")
    private static Map<String, Object> parseDefinition(Object json) {
        if (json == null) return Collections.emptyMap();
        try {
            if (json instanceof String s && !s.isBlank()) {
                return JSON.readValue(s, new TypeReference<LinkedHashMap<String, Object>>() {});
            }
        } catch (Exception e) {
            log.debug("[AgvStatsController] Failed to parse definition_json: {}", e.getMessage());
        }
        return Collections.emptyMap();
    }

    @SuppressWarnings("unchecked")
    private static List<Integer> parseIntegerList(Object val) {
        if (val == null) return Collections.emptyList();
        if (val instanceof List<?> list) {
            return list.stream()
                .map(o -> {
                    if (o instanceof Number n) return n.intValue();
                    if (o instanceof String s) try { return Integer.parseInt(s); } catch (Exception e) { return null; }
                    return null;
                })
                .filter(Objects::nonNull)
                .collect(Collectors.toList());
        }
        return Collections.emptyList();
    }

    private static String asString(Object o) {
        return o != null ? o.toString() : null;
    }

    private static Long toLong(Object o) {
        if (o instanceof Number n) return n.longValue();
        if (o instanceof String s) try { return Long.parseLong(s); } catch (Exception e) { /* fall through */ }
        return null;
    }

    private static LocalDateTime toLocalDateTime(Object o) {
        if (o instanceof LocalDateTime ldt) return ldt;
        if (o instanceof java.sql.Timestamp ts) return ts.toLocalDateTime();
        if (o instanceof String s && !s.isBlank()) {
            try { return LocalDateTime.parse(s, java.time.format.DateTimeFormatter.ISO_LOCAL_DATE_TIME); }
            catch (Exception e) { /* fall through */ }
        }
        return null;
    }

    private static LocalDateTime parseIso(String s) {
        try { return Instant.parse(s).atZone(ZoneId.systemDefault()).toLocalDateTime(); }
        catch (Exception e) { return LocalDateTime.parse(s); }
    }
}
