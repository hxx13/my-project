package com.example.demo.modules.twin.dashboard.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 大屏进出活跃排行榜「当日凌晨基线」快照。
 * <p>
 * 展示：本月累计（MONTH）；趋势：当前本月排名 vs 今日凌晨基线（本月截至今日 00:00 前的排名）。
 */
@Service
public class RankingSnapshotService {

    private static final Logger log = LoggerFactory.getLogger(RankingSnapshotService.class);
    private static final DateTimeFormatter DAY_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    private static final DateTimeFormatter CAPTURE_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss");
    private static final String BASELINE_TYPE = "MONTH_BEFORE_TODAY";
    private static final int SNAPSHOT_VERSION = 2;
    private static final String[] ACTIVITY_REGIONS = {"TOTAL", "PUDONG", "PUXI"};

    private final JdbcTemplate jdbcTemplate;
    private final TwinDashboardService dashboardService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public RankingSnapshotService(JdbcTemplate jdbcTemplate, TwinDashboardService dashboardService) {
        this.jdbcTemplate = jdbcTemplate;
        this.dashboardService = dashboardService;
    }

    public String activitySnapshotKey(String region, LocalDate day) {
        return "activity:" + region + ":" + day.format(DAY_FMT);
    }

    public String todayActivitySnapshotKey(String region) {
        return activitySnapshotKey(region, LocalDate.now());
    }

    /** 通用读取（返回 items 列表，兼容旧扁平数组与 v2 包装） */
    public List<Map<String, Object>> getSnapshot(String key) {
        SnapshotDoc doc = loadDoc(key);
        return doc != null && doc.items != null ? doc.items : List.of();
    }

    public List<Map<String, Object>> getTodayActivityBaseline(String region) {
        SnapshotDoc doc = loadDoc(todayActivitySnapshotKey(region));
        return doc != null ? doc.items : List.of();
    }

    /**
     * 确保当日基线正确：缺失或格式/类型不对时，按「本月截至今日凌晨」重算并写入。
     */
    public List<Map<String, Object>> ensureTodayActivityBaseline(String region) {
        String key = todayActivitySnapshotKey(region);
        SnapshotDoc doc = loadDoc(key);
        if (doc != null && isValidBaseline(doc)) {
            return doc.items;
        }
        if (doc != null) {
            log.warn("[ranking-snapshot] 检测到无效基线 key={}，将按本月凌晨前数据重建", key);
        }
        return repairBaseline(region, doc != null);
    }

    /**
     * 定时任务当天首次刷新：仅当无有效基线时写入。
     */
    public boolean captureActivityBaselineIfAbsent(String region) {
        String key = todayActivitySnapshotKey(region);
        SnapshotDoc existing = loadDoc(key);
        if (existing != null && isValidBaseline(existing)) {
            return false;
        }
        if (existing != null) {
            repairBaseline(region, true);
            return true;
        }
        return writeBaseline(region, false);
    }

    public int captureAllActivityBaselinesIfAbsent() {
        int created = 0;
        for (String region : ACTIVITY_REGIONS) {
            if (captureActivityBaselineIfAbsent(region)) {
                created++;
            }
        }
        return created;
    }

    public boolean saveSnapshot(String key, List<Map<String, Object>> data) {
        try {
            SnapshotDoc doc = new SnapshotDoc();
            doc.version = SNAPSHOT_VERSION;
            doc.baselineType = BASELINE_TYPE;
            doc.capturedAt = LocalDateTime.now().format(CAPTURE_FMT);
            doc.items = data != null ? data : List.of();
            String json = objectMapper.writeValueAsString(doc);
            jdbcTemplate.update(
                    "INSERT IGNORE INTO dashboard_ranking_snapshot (snapshot_key, snapshot_json) VALUES (?, ?)",
                    key, json);
            return true;
        } catch (Exception e) {
            log.error("[ranking-snapshot] 保存失败 key={}: {}", key, e.getMessage());
            return false;
        }
    }

    private List<Map<String, Object>> repairBaseline(String region, boolean replace) {
        writeBaseline(region, replace);
        SnapshotDoc doc = loadDoc(todayActivitySnapshotKey(region));
        return doc != null ? doc.items : List.of();
    }

    private boolean writeBaseline(String region, boolean replace) {
        String key = todayActivitySnapshotKey(region);
        List<Map<String, Object>> ranking = dashboardService.getGroupRanking("MONTH_BEFORE_TODAY", region);
        if (ranking.isEmpty()) {
            log.info("[ranking-snapshot] 本月凌晨前无进出活跃数据，跳过基线 key={}", key);
            return false;
        }
        try {
            SnapshotDoc doc = new SnapshotDoc();
            doc.version = SNAPSHOT_VERSION;
            doc.baselineType = BASELINE_TYPE;
            doc.capturedAt = LocalDateTime.now().format(CAPTURE_FMT);
            doc.items = buildRankSnapshot(ranking);
            String json = objectMapper.writeValueAsString(doc);
            if (replace) {
                jdbcTemplate.update(
                        "UPDATE dashboard_ranking_snapshot SET snapshot_json = ?, updated_at = NOW() WHERE snapshot_key = ?",
                        json, key);
                log.info("[ranking-snapshot] 已重建当日基线 key={} items={}", key, doc.items.size());
            } else {
                int n = jdbcTemplate.update(
                        "INSERT IGNORE INTO dashboard_ranking_snapshot (snapshot_key, snapshot_json) VALUES (?, ?)",
                        key, json);
                if (n > 0) {
                    log.info("[ranking-snapshot] 已写入当日基线 key={} items={}", key, doc.items.size());
                }
            }
            return true;
        } catch (Exception e) {
            log.error("[ranking-snapshot] 写入基线失败 key={}: {}", key, e.getMessage());
            return false;
        }
    }

    private String readRawJson(String key) {
        try {
            return jdbcTemplate.queryForObject(
                    "SELECT snapshot_json FROM dashboard_ranking_snapshot WHERE snapshot_key = ?",
                    String.class, key);
        } catch (EmptyResultDataAccessException e) {
            return null;
        } catch (Exception e) {
            log.warn("[ranking-snapshot] 读取失败 key={}: {}", key, e.getMessage());
            return null;
        }
    }

    private SnapshotDoc loadDoc(String key) {
        String json = readRawJson(key);
        if (json == null || json.isBlank()) {
            return null;
        }
        try {
            Object parsed = objectMapper.readValue(json, Object.class);
            if (parsed instanceof List<?> list) {
                SnapshotDoc legacy = new SnapshotDoc();
                legacy.version = 0;
                legacy.items = new ArrayList<>();
                for (Object o : list) {
                    if (o instanceof Map<?, ?> m) {
                        legacy.items.add(new LinkedHashMap<>((Map<String, Object>) m));
                    }
                }
                return legacy;
            }
            if (parsed instanceof Map<?, ?> map) {
                SnapshotDoc doc = new SnapshotDoc();
                doc.version = map.get("version") instanceof Number n ? n.intValue() : 0;
                doc.baselineType = map.get("baselineType") != null ? String.valueOf(map.get("baselineType")) : null;
                doc.capturedAt = map.get("capturedAt") != null ? String.valueOf(map.get("capturedAt")) : null;
                Object items = map.get("items");
                if (items instanceof List<?> list) {
                    doc.items = new ArrayList<>();
                    for (Object o : list) {
                        if (o instanceof Map<?, ?> m) {
                            doc.items.add(new LinkedHashMap<>((Map<String, Object>) m));
                        }
                    }
                } else {
                    doc.items = List.of();
                }
                return doc;
            }
        } catch (Exception e) {
            log.warn("[ranking-snapshot] 解析失败 key={}: {}", key, e.getMessage());
        }
        return null;
    }

    private boolean isValidBaseline(SnapshotDoc doc) {
        return doc.version == SNAPSHOT_VERSION
                && BASELINE_TYPE.equals(doc.baselineType)
                && doc.items != null
                && !doc.items.isEmpty();
    }

    private List<Map<String, Object>> buildRankSnapshot(List<Map<String, Object>> ranking) {
        List<Map<String, Object>> snap = new ArrayList<>();
        int rank = 1;
        for (Map<String, Object> row : ranking) {
            Map<String, Object> item = new LinkedHashMap<>();
            Object name = row.get("name");
            item.put("name", name == null ? "" : String.valueOf(name).trim());
            Object value = row.get("value");
            item.put("value", value instanceof Number n ? n.intValue() : 0);
            item.put("rank", rank++);
            snap.add(item);
        }
        return snap;
    }

    /** JSON 包装，与前端/API 解耦 */
  private static class SnapshotDoc {
        public int version;
        public String baselineType;
        public String capturedAt;
        public List<Map<String, Object>> items;
    }
}
