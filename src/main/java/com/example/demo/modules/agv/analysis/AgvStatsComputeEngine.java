package com.example.demo.modules.agv.analysis;

import com.example.demo.modules.agv.mapper.AgvStatsMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import javax.sql.DataSource;
import java.sql.Statement;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

/**
 * AGV 统计管道计算引擎。
 * <p>
 * 核心职责：每个 tick（500ms）读取激活的管道配置和未消费的事件，
 * 按配置类型执行对应的聚合计算，将结果 upsert 到快照表，
 * 并通过 SSE 广播更新。
 *
 * <h3>配置类型与计算逻辑</h3>
 * <ul>
 *   <li><b>COUNTER</b> — 站点访问计数：匹配 STATION_ENTER 事件，递增访问次数。
 *       使用 lastCountedStation 去重连续相同站点的帧。</li>
 *   <li><b>TIMER（驻留）</b> — 站点驻留时长：匹配 STATION_ENTER/STATION_EXIT，
 *       计时并累积 duration。</li>
 *   <li><b>TIMER（任务）</b> — 任务执行时长：匹配 TASK_START/TASK_END，
 *       计时并累积 duration。</li>
 *   <li><b>STATE</b> — 状态持续时长：匹配 STATUS_CHANGE 事件中目标 taskStatus，
 *       跟踪该状态的累计时长。</li>
 *   <li><b>GAUGE</b> — 里程表：每 30 tick 查询 odo 增量更新。</li>
 *   <li><b>BUNDLE</b> — 组合管道：读取 definition_json 中引用的子管道，
 *       合并其快照为结构化结果。</li>
 * </ul>
 *
 * <h3>趋势判定</h3>
 * <pre>
 *   current_value > last_value  →  "up"
 *   current_value < last_value  →  "down"
 *   current_value == last_value →  "flat"
 * </pre>
 *
 * <h3>线程安全</h3>
 * Spring 默认单线程执行 @Scheduled 任务，所有内存 Map 仅在此线程访问。
 */
@Service
public class AgvStatsComputeEngine {

    private static final Logger log = LoggerFactory.getLogger(AgvStatsComputeEngine.class);
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final DateTimeFormatter ISO_FMT = DateTimeFormatter.ISO_LOCAL_DATE_TIME;

    /** 每批处理的事件上限 */
    private static final int EVENT_BATCH_SIZE = 500;
    /** GAUGE（里程）更新间隔（tick 数） */
    private static final int ODO_UPDATE_INTERVAL = 30;

    private final AgvStatsMapper statsMapper;
    private final AgvStatsSseService sseService;
    private final DataSource dataSource;

    private int tickCount = 0;

    /**
     * 站点访问去重：记录每个 (configId:robotIp) 上一次计数的站点。
     * key = "{configId}:{robotIp}"，value = 上次计数的站点名。
     * 只有当前站点与上次不同时才递增计数器。
     */
    private final Map<String, String> lastCountedStation = new ConcurrentHashMap<>();

    public AgvStatsComputeEngine(AgvStatsMapper statsMapper, AgvStatsSseService sseService,
                                  DataSource dataSource) {
        this.statsMapper = statsMapper;
        this.sseService = sseService;
        this.dataSource = dataSource;
    }

    /** 启动时确保统计管道三张表存在，兜底建表 */
    @PostConstruct
    public void ensureTables() {
        String[] ddls = {
            "CREATE TABLE IF NOT EXISTS `agv_stats_config` (`id` BIGINT AUTO_INCREMENT PRIMARY KEY, `name` VARCHAR(64) NOT NULL, `config_type` VARCHAR(20) NOT NULL, `definition_json` JSON NOT NULL, `pipeline_slug` VARCHAR(32) NULL, `is_active` TINYINT(1) NOT NULL DEFAULT 1, `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3), UNIQUE KEY `uk_slug` (`pipeline_slug`), INDEX `idx_type_active` (`config_type`, `is_active`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
            "CREATE TABLE IF NOT EXISTS `agv_stats_snapshot` (`id` BIGINT AUTO_INCREMENT PRIMARY KEY, `config_id` BIGINT NOT NULL, `metric_key` VARCHAR(128) NOT NULL, `current_value` DOUBLE NOT NULL DEFAULT 0, `trend` VARCHAR(10) NULL, `last_value` DOUBLE NULL, `is_running` TINYINT(1) NULL, `started_at` DATETIME(3) NULL, `last_updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3), UNIQUE KEY `uk_config_metric` (`config_id`, `metric_key`), INDEX `idx_updated` (`last_updated_at`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
            "CREATE TABLE IF NOT EXISTS `agv_stats_event_log` (`id` BIGINT AUTO_INCREMENT PRIMARY KEY, `robot_ip` VARCHAR(20) NOT NULL, `event_type` VARCHAR(20) NOT NULL, `event_target` VARCHAR(64) NOT NULL, `event_at` DATETIME(3) NOT NULL, `metadata_json` JSON NULL, `consumed` TINYINT(1) NOT NULL DEFAULT 0, `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), INDEX `idx_consumed` (`consumed`, `event_at`), INDEX `idx_robot_time` (`robot_ip`, `event_at`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
        };
        try (var conn = dataSource.getConnection(); var stmt = conn.createStatement()) {
            for (String sql : ddls) {
                stmt.execute(sql);
            }
            log.info("[AgvStats] ✅ 三张统计表已就绪");
        } catch (Exception e) {
            log.error("[AgvStats] ❌ 建表失败: {}", e.getMessage(), e);
        }
    }

    /**
     * 主循环：每 500ms 执行一次。
     */
    @Scheduled(fixedDelay = 500)
    public void tick() {
        tickCount++;
        LocalDateTime now = LocalDateTime.now();

        try {
            // 1. 读取激活的配置
            List<Map<String, Object>> configs = statsMapper.selectAllActiveConfigs();
            if (configs.isEmpty()) return;

            // 2. 读取未消费事件
            List<Map<String, Object>> events = statsMapper.selectUnconsumedEvents(EVENT_BATCH_SIZE);

            // 3. 处理事件
            Set<Long> consumedEventIds = new LinkedHashSet<>();
            Set<String> updatedSlugs = new LinkedHashSet<>();

            if (!events.isEmpty()) {
                for (Map<String, Object> config : configs) {
                    String configType = asString(config.get("config_type"));
                    String slug = asString(config.get("pipeline_slug"));
                    Long configId = toLong(config.get("id"));
                    Map<String, Object> definition = parseDefinition(config.get("definition_json"));

                    if (slug == null || configType == null) continue;

                    for (Map<String, Object> event : events) {
                        Long eventId = toLong(event.get("id"));
                        if (eventId == null || consumedEventIds.contains(eventId)) continue;

                        String eventType = asString(event.get("event_type"));
                        String eventTarget = asString(event.get("event_target"));
                        String robotIp = asString(event.get("robot_ip"));
                        LocalDateTime eventAt = toLocalDateTime(event.get("event_at"));
                        if (eventType == null || eventTarget == null || robotIp == null) continue;

                        boolean matched = processEvent(configType, configId, slug, definition,
                            eventType, eventTarget, robotIp, eventAt);

                        if (matched) {
                            consumedEventIds.add(eventId);
                            updatedSlugs.add(slug);
                        }
                    }
                }

                // 4. 标记已消费事件
                if (!consumedEventIds.isEmpty()) {
                    List<Long> idList = new ArrayList<>(consumedEventIds);
                    try {
                        statsMapper.markEventsConsumedByIds(idList);
                    } catch (Exception e) {
                        log.debug("[AgvStatsEngine] Failed to mark events consumed: {}", e.getMessage());
                    }
                }
            }

            // 5. GAUGE（里程）定期更新
            if (tickCount % ODO_UPDATE_INTERVAL == 0) {
                for (Map<String, Object> config : configs) {
                    if ("GAUGE".equals(asString(config.get("config_type")))) {
                        try {
                            String slug = asString(config.get("pipeline_slug"));
                            if (slug != null) {
                                updateOdoGauges(config);
                                updatedSlugs.add(slug);
                            }
                        } catch (Exception e) {
                            log.debug("[AgvStatsEngine] Odo update failed: {}", e.getMessage());
                        }
                    }
                }
            }

            // 6. BUNDLE 组合管道
            for (Map<String, Object> config : configs) {
                if ("BUNDLE".equals(asString(config.get("config_type")))) {
                    try {
                        String slug = asString(config.get("pipeline_slug"));
                        if (slug != null) {
                            combineBundle(config);
                            updatedSlugs.add(slug);
                        }
                    } catch (Exception e) {
                        log.debug("[AgvStatsEngine] Bundle combine failed: {}", e.getMessage());
                    }
                }
            }

            // 7. SSE 广播
            for (String slug : updatedSlugs) {
                try {
                    Map<String, Object> config = statsMapper.selectConfigBySlug(slug);
                    if (config != null) {
                        List<Map<String, Object>> snapshots = statsMapper.selectSnapshotsByConfigId(
                            toLong(config.get("id")));
                        Map<String, Object> payload = new LinkedHashMap<>();
                        payload.put("type", "snapshot");
                        payload.put("slug", slug);
                        payload.put("data", snapshots != null ? snapshots : Collections.emptyList());
                        payload.put("timestamp", System.currentTimeMillis());
                        sseService.broadcast(slug, payload);
                    }
                } catch (Exception e) {
                    log.debug("[AgvStatsEngine] SSE broadcast failed for {}: {}", slug, e.getMessage());
                }
            }

        } catch (Exception e) {
            log.debug("[AgvStatsEngine] Tick error: {}", e.getMessage());
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // Event processing per config type
    // ═══════════════════════════════════════════════════════════════

    /**
     * 根据配置类型和事件类型执行匹配并计算。
     *
     * @return true 表示事件被匹配并消费
     */
    @SuppressWarnings("unchecked")
    private boolean processEvent(String configType, Long configId, String slug,
                                  Map<String, Object> definition,
                                  String eventType, String eventTarget,
                                  String robotIp, LocalDateTime eventAt) {

        return switch (configType) {
            case "COUNTER" -> processCounter(configId, slug, definition,
                eventType, eventTarget, robotIp);
            case "TIMER" -> processTimer(configId, slug, definition,
                eventType, eventTarget, robotIp, eventAt);
            case "STATE" -> processState(configId, slug, definition,
                eventType, eventTarget, robotIp, eventAt);
            case "GAUGE" -> false; // handled separately
            case "BUNDLE" -> false; // handled separately
            default -> false;
        };
    }

    /**
     * COUNTER 处理：匹配 STATION_ENTER 事件，递增访问计数。
     * 使用 lastCountedStation 去重避免连续相同站点的重复计数。
     */
    @SuppressWarnings("unchecked")
    private boolean processCounter(Long configId, String slug, Map<String, Object> definition,
                                    String eventType, String eventTarget, String robotIp) {
        if (!"STATION_ENTER".equals(eventType)) return false;

        List<String> stations = (List<String>) definition.get("stations");
        if (stations == null || stations.isEmpty()) return false;
        if (!stations.contains(eventTarget)) return false;

        // Dedup: only count if different from last counted station for this config+robot
        String dedupKey = configId + ":" + robotIp;
        String lastStation = lastCountedStation.get(dedupKey);
        if (eventTarget.equals(lastStation)) return true; // consumed but skipped

        lastCountedStation.put(dedupKey, eventTarget);

        // Increment counter
        Map<String, Object> snapshot = getOrCreateSnapshot(configId, slug, robotIp);
        double current = toDoubleVal(snapshot.get("current_value")) + 1;
        String trend = computeTrend(current, toDoubleVal(snapshot.get("current_value")));

        upsertSnapshotFromMap(configId, slug, robotIp, current,
            toDoubleVal(snapshot.get("current_value")), trend, false, null);
        return true;
    }

    /**
     * TIMER 处理：支持站点驻留计时和任务执行计时两种模式。
     * <ul>
     *   <li>驻留模式（definition 含 stations）：匹配 STATION_ENTER/STATION_EXIT</li>
     *   <li>任务模式（definition 含 activityTypes）：匹配 TASK_START/TASK_END</li>
     * </ul>
     */
    @SuppressWarnings("unchecked")
    private boolean processTimer(Long configId, String slug, Map<String, Object> definition,
                                  String eventType, String eventTarget,
                                  String robotIp, LocalDateTime eventAt) {

        List<String> stations = (List<String>) definition.get("stations");
        List<String> activityTypes = (List<String>) definition.get("activityTypes");

        // Dwell mode: match station enter/exit
        if (stations != null && !stations.isEmpty()) {
            if (!stations.contains(eventTarget)) return false;

            if ("STATION_ENTER".equals(eventType)) {
                // Start dwell timer
                Map<String, Object> snapshot = getOrCreateSnapshot(configId, slug, robotIp);
                upsertSnapshotFromMap(configId, slug, robotIp,
                    toDoubleVal(snapshot.get("current_value")),
                    toDoubleVal(snapshot.get("current_value")),
                    asString(snapshot.get("trend")),
                    true, eventAt);
                return true;
            }

            if ("STATION_EXIT".equals(eventType)) {
                // Stop dwell timer, accumulate duration
                Map<String, Object> snapshot = getOrCreateSnapshot(configId, slug, robotIp);
                if (isTrue(snapshot.get("is_running"))) {
                    LocalDateTime startedAt = toLocalDateTime(snapshot.get("started_at"));
                    if (startedAt != null && eventAt != null) {
                        double elapsedSec = Duration.between(startedAt, eventAt).toMillis() / 1000.0;
                        double newValue = toDoubleVal(snapshot.get("current_value")) + Math.max(0, elapsedSec);
                        double lastValue = toDoubleVal(snapshot.get("current_value"));
                        String trend = computeTrend(newValue, lastValue);
                        upsertSnapshotFromMap(configId, slug, robotIp, newValue, lastValue, trend, false, null);
                    } else {
                        // Can't compute duration, just stop
                        upsertSnapshotFromMap(configId, slug, robotIp,
                            toDoubleVal(snapshot.get("current_value")),
                            toDoubleVal(snapshot.get("current_value")),
                            asString(snapshot.get("trend")),
                            false, null);
                    }
                }
                return true;
            }
        }

        // Task mode: match task start/end
        if (activityTypes != null && !activityTypes.isEmpty()) {
            if ("TASK_START".equals(eventType)) {
                Map<String, Object> snapshot = getOrCreateSnapshot(configId, slug, robotIp);
                upsertSnapshotFromMap(configId, slug, robotIp,
                    toDoubleVal(snapshot.get("current_value")),
                    toDoubleVal(snapshot.get("current_value")),
                    asString(snapshot.get("trend")),
                    true, eventAt);
                return true;
            }

            if ("TASK_END".equals(eventType)) {
                Map<String, Object> snapshot = getOrCreateSnapshot(configId, slug, robotIp);
                if (isTrue(snapshot.get("is_running"))) {
                    LocalDateTime startedAt = toLocalDateTime(snapshot.get("started_at"));
                    if (startedAt != null && eventAt != null) {
                        double elapsedSec = Duration.between(startedAt, eventAt).toMillis() / 1000.0;
                        double newValue = toDoubleVal(snapshot.get("current_value")) + Math.max(0, elapsedSec);
                        double lastValue = toDoubleVal(snapshot.get("current_value"));
                        String trend = computeTrend(newValue, lastValue);
                        upsertSnapshotFromMap(configId, slug, robotIp, newValue, lastValue, trend, false, null);
                    } else {
                        upsertSnapshotFromMap(configId, slug, robotIp,
                            toDoubleVal(snapshot.get("current_value")),
                            toDoubleVal(snapshot.get("current_value")),
                            asString(snapshot.get("trend")),
                            false, null);
                    }
                }
                return true;
            }
        }

        return false;
    }

    /**
     * STATE 处理：匹配 STATUS_CHANGE 事件中目标 taskStatus，
     * 跟踪该状态的累计持续时长。
     */
    @SuppressWarnings("unchecked")
    private boolean processState(Long configId, String slug, Map<String, Object> definition,
                                  String eventType, String eventTarget,
                                  String robotIp, LocalDateTime eventAt) {
        if (!"STATUS_CHANGE".equals(eventType)) return false;

        List<Integer> taskStatuses = parseIntegerList(definition.get("taskStatuses"));
        if (taskStatuses == null || taskStatuses.isEmpty()) return false;

        int newStatus;
        try {
            newStatus = Integer.parseInt(eventTarget);
        } catch (NumberFormatException e) {
            return false;
        }

        if (!taskStatuses.contains(newStatus)) return false;

        // Event target matches one of the watched taskStatuses
        // This means the robot entered this state
        Map<String, Object> snapshot = getOrCreateSnapshot(configId, slug, robotIp);

        if (isTrue(snapshot.get("is_running"))) {
            // Was already in a tracked state — close previous interval
            LocalDateTime startedAt = toLocalDateTime(snapshot.get("started_at"));
            if (startedAt != null && eventAt != null) {
                double elapsedSec = Duration.between(startedAt, eventAt).toMillis() / 1000.0;
                double newValue = toDoubleVal(snapshot.get("current_value")) + Math.max(0, elapsedSec);
                double lastValue = toDoubleVal(snapshot.get("current_value"));
                String trend = computeTrend(newValue, lastValue);
                upsertSnapshotFromMap(configId, slug, robotIp, newValue, lastValue, trend, false, null);
            }
        }

        // Start new interval for the new matching state
        double currentVal = toDoubleVal(snapshot.get("current_value"));
        upsertSnapshotFromMap(configId, slug, robotIp, currentVal, currentVal,
            asString(snapshot.get("trend")), true, eventAt);
        return true;
    }

    // ═══════════════════════════════════════════════════════════════
    // GAUGE (odo) handling
    // ═══════════════════════════════════════════════════════════════

    /**
     * 更新所有 GAUGE 类型配置的里程值。
     * 查询每个机器人自快照创建以来的 odo 增量。
     */
    @SuppressWarnings("unchecked")
    private void updateOdoGauges(Map<String, Object> config) {
        Long configId = toLong(config.get("id"));
        String slug = asString(config.get("pipeline_slug"));
        LocalDateTime now = LocalDateTime.now();
        Map<String, Object> definition = parseDefinition(config.get("definition_json"));

        // Get robots to track: specified in definition or all active
        List<String> targetRobots;
        List<String> defRobots = (List<String>) definition.get("robotIps");
        if (defRobots != null && !defRobots.isEmpty()) {
            targetRobots = defRobots;
        } else {
            targetRobots = statsMapper.selectActiveRobotIps(now.minus(1, ChronoUnit.HOURS));
        }

        for (String robotIp : targetRobots) {
            Map<String, Object> snapshot = getOrCreateSnapshot(configId, slug, robotIp);
            LocalDateTime since = toLocalDateTime(snapshot.get("started_at"));
            if (since == null) {
                // First run: store current as baseline from last hour
                since = now.minus(1, ChronoUnit.HOURS);
                // Save started_at for future delta calculations
                Map<String, Object> initSnap = new LinkedHashMap<>();
                initSnap.put("configId", configId);
                initSnap.put("metricKey", robotIp);
                initSnap.put("currentValue", 0.0);
                initSnap.put("trend", "flat");
                initSnap.put("lastValue", 0.0);
                initSnap.put("isRunning", false);
                initSnap.put("startedAt", since.format(ISO_FMT));
                try {
                    statsMapper.upsertSnapshot(initSnap);
                } catch (Exception e) {
                    log.debug("[AgvStatsEngine] Init odo snapshot failed: {}", e.getMessage());
                }
                continue;
            }

            Double odoDelta = statsMapper.selectOdoDelta(robotIp, since, now);
            if (odoDelta != null && odoDelta > 0) {
                double newValue = odoDelta;
                double lastValue = toDoubleVal(snapshot.get("current_value"));
                String trend = computeTrend(newValue, lastValue);

                Map<String, Object> snapMap = new LinkedHashMap<>();
                snapMap.put("configId", configId);
                snapMap.put("metricKey", robotIp);
                snapMap.put("currentValue", newValue);
                snapMap.put("trend", trend);
                snapMap.put("lastValue", lastValue);
                snapMap.put("isRunning", false);
                snapMap.put("startedAt", since.format(ISO_FMT));
                try {
                    statsMapper.upsertSnapshot(snapMap);
                } catch (Exception e) {
                    log.debug("[AgvStatsEngine] Upsert odo snapshot failed: {}", e.getMessage());
                }
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // BUNDLE handling
    // ═══════════════════════════════════════════════════════════════

    /**
     * 组合管道：读取 definition_json 中的 pipeRefs，
     * 获取各子管道的快照并合并为结构化结果写入当前管道快照。
     */
    @SuppressWarnings("unchecked")
    private void combineBundle(Map<String, Object> config) {
        Long configId = toLong(config.get("id"));
        String slug = asString(config.get("pipeline_slug"));
        Map<String, Object> definition = parseDefinition(config.get("definition_json"));

        List<String> pipeRefs = (List<String>) definition.get("pipeRefs");
        if (pipeRefs == null || pipeRefs.isEmpty()) return;

        // Collect snapshots from all referenced pipes
        List<Map<String, Object>> combined = new ArrayList<>();
        for (String refSlug : pipeRefs) {
            try {
                Map<String, Object> refConfig = statsMapper.selectConfigBySlug(refSlug);
                if (refConfig != null) {
                    List<Map<String, Object>> refSnaps = statsMapper.selectSnapshotsByConfigId(
                        toLong(refConfig.get("id")));
                    if (refSnaps != null) {
                        for (Map<String, Object> snap : refSnaps) {
                            Map<String, Object> enriched = new LinkedHashMap<>(snap);
                            enriched.put("_sourceSlug", refSlug);
                            combined.add(enriched);
                        }
                    }
                }
            } catch (Exception e) {
                log.debug("[AgvStatsEngine] Bundle ref {} failed: {}", refSlug, e.getMessage());
            }
        }

        // Upsert combined result as a single fleet-level snapshot
        try {
            String combinedJson = JSON.writeValueAsString(combined);
            Map<String, Object> snapMap = new LinkedHashMap<>();
            snapMap.put("configId", configId);
            snapMap.put("metricKey", "bundle");
            snapMap.put("currentValue", (double) combined.size());
            snapMap.put("trend", "flat");
            snapMap.put("lastValue", 0.0);
            snapMap.put("isRunning", false);
            snapMap.put("startedAt", LocalDateTime.now().format(ISO_FMT));
            statsMapper.upsertSnapshot(snapMap);
        } catch (Exception e) {
            log.debug("[AgvStatsEngine] Bundle upsert failed: {}", e.getMessage());
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // Snapshot helpers
    // ═══════════════════════════════════════════════════════════════

    /**
     * 获取或创建快照记录（内存缓存 + DB 回退）。
     * 优先从 DB 读取已有快照，不存在则返回空的默认快照。
     */
    private Map<String, Object> getOrCreateSnapshot(Long configId, String slug, String robotIp) {
        Map<String, Object> existing = statsMapper.selectSnapshot(configId, robotIp);
        if (existing != null) return existing;

        // Return empty defaults
        Map<String, Object> defaults = new LinkedHashMap<>();
        defaults.put("config_id", configId);
        defaults.put("metric_key", robotIp);
        defaults.put("current_value", 0.0);
        defaults.put("last_value", 0.0);
        defaults.put("trend", "flat");
        defaults.put("is_running", false);
        defaults.put("started_at", null);
        return defaults;
    }

    /**
     * 通过 Map 参数 upsert 快照（兼容 Agent-1 的 mapper 接口）。
     */
    private void upsertSnapshotFromMap(Long configId, String slug, String robotIp,
                                        double currentValue, double lastValue,
                                        String trend, boolean isRunning,
                                        LocalDateTime startedAt) {
        try {
            Map<String, Object> snap = new LinkedHashMap<>();
            snap.put("configId", configId);
            snap.put("metricKey", robotIp);
            snap.put("currentValue", currentValue);
            snap.put("trend", trend != null ? trend : "flat");
            snap.put("lastValue", lastValue);
            snap.put("isRunning", isRunning);
            snap.put("startedAt", startedAt != null ? startedAt.format(ISO_FMT) : null);
            statsMapper.upsertSnapshot(snap);
        } catch (Exception e) {
            log.debug("[AgvStatsEngine] Upsert snapshot failed for {}/{}: {}", configId, robotIp, e.getMessage());
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // Utility methods
    // ═══════════════════════════════════════════════════════════════

    /** 计算趋势 */
    private static String computeTrend(double current, double last) {
        if (current > last) return "up";
        if (current < last) return "down";
        return "flat";
    }

    /** 安全解析 definition_json 为 Map */
    @SuppressWarnings("unchecked")
    private static Map<String, Object> parseDefinition(Object json) {
        if (json == null) return Collections.emptyMap();
        try {
            if (json instanceof String s && !s.isBlank()) {
                return JSON.readValue(s, new TypeReference<LinkedHashMap<String, Object>>() {});
            }
        } catch (Exception e) {
            log.debug("[AgvStatsEngine] Failed to parse definition_json: {}", e.getMessage());
        }
        return Collections.emptyMap();
    }

    /** 将 definition 中的数组字段解析为整数列表 */
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

    private static double toDoubleVal(Object o) {
        if (o instanceof Number n) return n.doubleValue();
        if (o instanceof String s) try { return Double.parseDouble(s); } catch (Exception e) { /* fall through */ }
        return 0.0;
    }

    private static boolean isTrue(Object o) {
        if (o instanceof Boolean b) return b;
        if (o instanceof Number n) return n.intValue() == 1;
        if (o instanceof String s) return "1".equals(s) || "true".equalsIgnoreCase(s);
        return false;
    }

    private static LocalDateTime toLocalDateTime(Object o) {
        if (o instanceof LocalDateTime ldt) return ldt;
        if (o instanceof java.sql.Timestamp ts) return ts.toLocalDateTime();
        if (o instanceof String s && !s.isBlank()) {
            try { return LocalDateTime.parse(s, ISO_FMT); } catch (Exception e) { /* fall through */ }
        }
        return null;
    }
}
