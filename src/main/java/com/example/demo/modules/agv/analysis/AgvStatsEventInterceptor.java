package com.example.demo.modules.agv.analysis;

import com.example.demo.modules.agv.mapper.AgvStatsMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.*;

/**
 * AGV 轨迹事件拦截器。
 * <p>
 * 定时轮询 agv_trajectory 表，检测新写入的行，
 * 从中识别站点进出、任务起止、状态变更等业务事件，
 * 写入 agv_stats_event_log 供下游 {@link AgvStatsComputeEngine} 消费。
 * <p>
 * 设计要点：
 * <ul>
 *   <li>轮询间隔 2 秒，避免频繁扫表</li>
 *   <li>按 robot_ip 独立追踪处理进度，重启后从最近 5 分钟数据恢复</li>
 *   <li>站点/任务状态变化通过相邻行对比检测，不依赖外部状态机</li>
 *   <li>所有状态保存在内存中，重启丢失可接受（事件不重复即可）</li>
 * </ul>
 *
 * <h3>事件类型定义</h3>
 * <ul>
 *   <li><b>STATION_ENTER</b> — 进入站点（station 从空或不同值变为新值）</li>
 *   <li><b>STATION_EXIT</b>  — 离开站点（station 从有值变为空或不同值）</li>
 *   <li><b>TASK_START</b>    — 任务开始（task_status 变为 2=执行中）</li>
 *   <li><b>TASK_END</b>      — 任务结束（task_status 从 2=执行中变为其他）</li>
 *   <li><b>STATUS_CHANGE</b> — 任务状态变更（task_status 任意变化）</li>
 * </ul>
 */
@Service
public class AgvStatsEventInterceptor {

    private static final Logger log = LoggerFactory.getLogger(AgvStatsEventInterceptor.class);

    /** 每次轮询单机器人最多取多少行 */
    private static final int FETCH_LIMIT = 500;
    /** 启动时回追时长（分钟） */
    private static final int CATCH_UP_MINUTES = 5;
    /** 单次 tick 最多写入的事件数（防抖） */
    private static final int MAX_EVENTS_PER_TICK = 2000;

    private final AgvStatsMapper statsMapper;

    /** 每个机器人上次处理到的轨迹时间 */
    private final Map<String, LocalDateTime> lastProcessedAt = new HashMap<>();
    /** 每个机器人当前所在站点（上一次看到的 station） */
    private final Map<String, String> lastStation = new HashMap<>();
    /** 每个机器人当前任务状态（上一次看到的 task_status） */
    private final Map<String, Integer> lastTaskStatus = new HashMap<>();

    public AgvStatsEventInterceptor(AgvStatsMapper statsMapper) {
        this.statsMapper = statsMapper;
    }

    /**
     * 定时轮询：每 2 秒检查一次是否有新的轨迹数据写入。
     * 对每个活跃机器人增量拉取新行，逐行对比检测事件并写入事件日志。
     */
    @Scheduled(fixedDelay = 2_000)
    public void pollAndEmit() {
        LocalDateTime now = LocalDateTime.now();
        int eventsWritten = 0;

        // 获取最近活跃的机器人列表（过去 10 分钟有数据的）
        List<String> activeRobots = statsMapper.selectActiveRobotIps(now.minus(10, ChronoUnit.MINUTES));

        for (String robotIp : activeRobots) {
            if (eventsWritten >= MAX_EVENTS_PER_TICK) break;

            try {
                eventsWritten += processRobot(robotIp);
            } catch (Exception e) {
                log.debug("[AgvStatsEvent] Error processing robot {}: {}", robotIp, e.getMessage());
            }
        }

        if (eventsWritten > 0) {
            log.debug("[AgvStatsEvent] Tick complete: {} robots, {} events written",
                activeRobots.size(), eventsWritten);
        }
    }

    /**
     * 处理单个机器人的增量轨迹数据。
     *
     * @param robotIp 机器人 IP
     * @return 写入的事件数
     */
    private int processRobot(String robotIp) {
        // Determine the "since" timestamp for this robot
        LocalDateTime since = lastProcessedAt.get(robotIp);
        if (since == null) {
            // First time seeing this robot — catch up from 5 min ago
            since = LocalDateTime.now().minus(CATCH_UP_MINUTES, ChronoUnit.MINUTES);
        }

        List<Map<String, Object>> rows = statsMapper.selectTrajectoryAfter(robotIp, since, FETCH_LIMIT);
        if (rows.isEmpty()) return 0;

        int eventsWritten = 0;
        String prevStation = lastStation.get(robotIp);
        Integer prevTaskStatus = lastTaskStatus.get(robotIp);
        LocalDateTime maxRecordedAt = since;

        for (Map<String, Object> row : rows) {
            String station = emptyToNull((String) row.get("station"));
            Integer taskStatus = toIntOrNull(row.get("task_status"));
            LocalDateTime recordedAt = toLocalDateTime(row.get("recorded_at"));

            if (recordedAt != null && (maxRecordedAt == null || recordedAt.isAfter(maxRecordedAt))) {
                maxRecordedAt = recordedAt;
            }

            // ── Station events ──
            boolean stationChanged = !Objects.equals(prevStation, station);
            if (stationChanged) {
                if (prevStation != null) {
                    // Left previous station
                    writeEvent(robotIp, "STATION_EXIT", prevStation, recordedAt,
                        "{\"nextStation\":\"" + (station != null ? station : "") + "\"}");
                    eventsWritten++;
                }
                if (station != null) {
                    // Entered new station
                    writeEvent(robotIp, "STATION_ENTER", station, recordedAt,
                        "{\"prevStation\":\"" + (prevStation != null ? prevStation : "") + "\"}");
                    eventsWritten++;
                }
                prevStation = station;
            }

            // ── Task status events ──
            boolean taskChanged = !Objects.equals(prevTaskStatus, taskStatus);
            if (taskChanged) {
                // TASK_START: transition to executing (task_status == 2)
                if (taskStatus != null && taskStatus == 2 && (prevTaskStatus == null || prevTaskStatus != 2)) {
                    writeEvent(robotIp, "TASK_START", taskStatus.toString(), recordedAt,
                        "{\"prevStatus\":" + prevTaskStatus + "}");
                    eventsWritten++;
                }
                // TASK_END: transition from executing to something else
                if (prevTaskStatus != null && prevTaskStatus == 2 && (taskStatus == null || taskStatus != 2)) {
                    writeEvent(robotIp, "TASK_END", prevTaskStatus.toString(), recordedAt,
                        "{\"newStatus\":" + taskStatus + "}");
                    eventsWritten++;
                }
                // STATUS_CHANGE: any task_status change
                if (taskStatus != null) {
                    writeEvent(robotIp, "STATUS_CHANGE", taskStatus.toString(), recordedAt,
                        "{\"prevStatus\":" + prevTaskStatus + "}");
                    eventsWritten++;
                }
                prevTaskStatus = taskStatus;
            }

            if (eventsWritten >= MAX_EVENTS_PER_TICK) break;
        }

        // Update in-memory state
        if (maxRecordedAt != null && maxRecordedAt.isAfter(since)) {
            lastProcessedAt.put(robotIp, maxRecordedAt);
        }
        lastStation.put(robotIp, prevStation);
        lastTaskStatus.put(robotIp, prevTaskStatus);

        return eventsWritten;
    }

    /**
     * 写入单条事件到日志表。
     * <p>
     * 使用 mapper.insertEvent(Map) 方法，事件结构包含
     * robotIp / eventType / eventTarget / eventAt / metadataJson。
     */
    private void writeEvent(String robotIp, String eventType, String eventTarget,
                            LocalDateTime eventAt, String metadataJson) {
        try {
            Map<String, Object> event = new LinkedHashMap<>();
            event.put("robotIp", robotIp);
            event.put("eventType", eventType);
            event.put("eventTarget", eventTarget);
            event.put("eventAt", eventAt != null ? eventAt : LocalDateTime.now());
            event.put("metadataJson", metadataJson);
            statsMapper.insertEvent(event);
        } catch (Exception e) {
            log.debug("[AgvStatsEvent] Failed to write event {}:{}:{}: {}", robotIp, eventType, eventTarget, e.getMessage());
        }
    }

    // ── helpers ──

    private static String emptyToNull(String s) {
        return (s == null || s.isEmpty()) ? null : s;
    }

    private static Integer toIntOrNull(Object o) {
        if (o instanceof Number n) return n.intValue();
        if (o instanceof String s) try { return Integer.parseInt(s); } catch (Exception e) { /* fall through */ }
        return null;
    }

    private static LocalDateTime toLocalDateTime(Object o) {
        if (o instanceof LocalDateTime ldt) return ldt;
        if (o instanceof java.sql.Timestamp ts) return ts.toLocalDateTime();
        return null;
    }
}
