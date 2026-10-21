package com.example.demo.modules.agv.service;

import com.example.demo.modules.agv.analysis.AgvMetricService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.sql.Date;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * AGV 原始数据回收。
 *
 * <p>只清「原始流水」：轨迹表按整月分区 DROP，统计事件日志按天分批 DELETE。
 * 日封存 {@code agv_metric_daily}、小时聚合、活动段、拓扑快照都不动 ——
 * 驾驶舱的历史曲线与审计快照读的是这些，原始行只在最近的重算/回放窗口里有用。
 */
@Service
public class AgvRetentionService {

    private static final Logger log = LoggerFactory.getLogger(AgvRetentionService.class);
    private static final ZoneId BEIJING = ZoneId.of("Asia/Shanghai");
    private static final int MIN_RETENTION_DAYS = 7;
    /** 分区至少铺到「今天 + 3 个月」，否则新数据会全落进 p_future 而无法单独 DROP */
    private static final int PARTITION_LOOKAHEAD_MONTHS = 3;
    private static final int DELETE_BATCH = 10_000;
    private static final DateTimeFormatter YM = DateTimeFormatter.ofPattern("yyyyMM");

    private final JdbcTemplate jdbc;
    private final int retentionDays;

    public AgvRetentionService(JdbcTemplate jdbc,
                               @Value("${app.agv.retention-days:30}") int retentionDays) {
        this.jdbc = jdbc;
        this.retentionDays = Math.max(MIN_RETENTION_DAYS, retentionDays);
    }

    /** 每天 03:20（北京）回收。早于日封存 00:05，昨天的数据一定已在日行表里。 */
    @Scheduled(cron = "0 20 3 * * ?", zone = "Asia/Shanghai")
    public void purgeScheduled() {
        LocalDate cutoff = LocalDate.now(BEIJING).minusDays(retentionDays);
        try {
            Map<String, Object> result = purge(cutoff);
            log.info("[AgvRetention] cutoff={} addedPartitions={} droppedPartitions={} deletedEvents={}",
                    cutoff, result.get("addedPartitions"), result.get("droppedPartitions"),
                    result.get("deletedEvents"));
        } catch (Exception e) {
            log.warn("[AgvRetention] 回收失败 cutoff={}: {}", cutoff, e.getMessage(), e);
        }
    }

    public Map<String, Object> purge(LocalDate cutoff) {
        int added = ensureFuturePartitions();
        List<String> dropped = dropExpiredPartitions(cutoff);
        int deleted = deleteEventLogBefore(cutoff);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("cutoff", cutoff.toString());
        out.put("addedPartitions", added);
        out.put("droppedPartitions", dropped);
        out.put("deletedEvents", deleted);
        return out;
    }

    /** 分区上界（不含）减一天 = 分区内最后一天；整段都早于 cutoff 才可丢。 */
    static boolean isPartitionExpired(LocalDate boundaryExclusive, LocalDate cutoff) {
        return boundaryExclusive.minusDays(1).isBefore(cutoff);
    }

    private List<String> dropExpiredPartitions(LocalDate cutoff) {
        List<String> dropped = new ArrayList<>();
        for (PartitionInfo p : loadNamedPartitions()) {
            if (!isPartitionExpired(p.boundary(), cutoff)) continue;
            if (!p.name().matches("p\\d{6}")) continue; // 只动自己建的月分区
            try {
                jdbc.execute("ALTER TABLE agv_trajectory DROP PARTITION `" + p.name() + "`");
                dropped.add(p.name());
            } catch (Exception e) {
                log.warn("[AgvRetention] 丢弃分区 {} 失败: {}", p.name(), e.getMessage());
            }
        }
        return dropped;
    }

    /** 把命名分区续建到目标月份；p_future 正常应为空，REORGANIZE 只搬元数据。 */
    private int ensureFuturePartitions() {
        List<PartitionInfo> parts = loadNamedPartitions();
        if (parts.isEmpty()) return 0; // 未分区或表不存在
        LocalDate boundary = parts.stream()
                .map(PartitionInfo::boundary)
                .max(LocalDate::compareTo)
                .orElse(null);
        if (boundary == null) return 0;

        LocalDate target = LocalDate.now(BEIJING).plusMonths(PARTITION_LOOKAHEAD_MONTHS).withDayOfMonth(1);
        int added = 0;
        while (boundary.isBefore(target)) {
            String name = "p" + boundary.format(YM);
            LocalDate next = boundary.plusMonths(1);
            try {
                jdbc.execute("ALTER TABLE agv_trajectory REORGANIZE PARTITION p_future INTO ("
                        + "PARTITION `" + name + "` VALUES LESS THAN (TO_DAYS('" + next + "')), "
                        + "PARTITION p_future VALUES LESS THAN MAXVALUE)");
                boundary = next;
                added++;
            } catch (Exception e) {
                log.warn("[AgvRetention] 续建分区 {} 失败: {}", name, e.getMessage());
                break;
            }
        }
        return added;
    }

    private List<PartitionInfo> loadNamedPartitions() {
        List<PartitionInfo> out = new ArrayList<>();
        try {
            jdbc.query(
                    "SELECT PARTITION_NAME AS name, FROM_DAYS(PARTITION_DESCRIPTION) AS boundary "
                            + "FROM information_schema.PARTITIONS "
                            + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agv_trajectory' "
                            + "AND PARTITION_NAME IS NOT NULL AND PARTITION_DESCRIPTION <> 'MAXVALUE'",
                    rs -> {
                        String name = rs.getString("name");
                        Date boundary = rs.getDate("boundary");
                        if (name != null && boundary != null) {
                            out.add(new PartitionInfo(name, boundary.toLocalDate()));
                        }
                    });
        } catch (Exception e) {
            log.warn("[AgvRetention] 读取分区信息失败: {}", e.getMessage());
        }
        return out;
    }

    private int deleteEventLogBefore(LocalDate cutoff) {
        Timestamp before = Timestamp.valueOf(AgvMetricService.beijingDayBounds(cutoff)[0]);
        int total = 0;
        int n;
        do {
            n = jdbc.update("DELETE FROM agv_stats_event_log WHERE event_at < ? LIMIT " + DELETE_BATCH, before);
            total += n;
        } while (n == DELETE_BATCH);
        return total;
    }

    private record PartitionInfo(String name, LocalDate boundary) {
    }
}
