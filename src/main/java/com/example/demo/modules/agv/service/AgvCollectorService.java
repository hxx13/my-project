package com.example.demo.modules.agv.service;

import com.example.demo.modules.agv.dto.AgvRobotStatus;
import com.example.demo.modules.twin.common.entity.TwinJobScheduleConfig;
import com.example.demo.modules.twin.common.mapper.TwinJobScheduleConfigMapper;
import com.example.demo.modules.twin.common.service.JobExecutionRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;
import com.example.demo.modules.agv.mapper.AgvTrajectoryMapper;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.time.Instant;
import java.time.LocalDateTime;

/**
 * AGV 数据采集线程。
 * <p>
 * 使用 Spring {@link Scheduled} + fixedDelay，上一轮完成后才启动下一轮（防堆积）。
 * 读取 {@code twin_job_schedule_config} 中 5 个 AGV Job Key 的配置，
 * 实现总闸 + 子开关的互锁门控。
 * </p>
 *
 * <p>轮询条件：AGV_MASTER.enabled AND 当前在时间窗口内 AND AGV_ROBOT_X.enabled → 采集该机器人</p>
 */
@Service
public class AgvCollectorService {

    private static final Logger log = LoggerFactory.getLogger(AgvCollectorService.class);

    static final String MASTER_KEY = JobExecutionRegistry.AGV_MASTER;
    static final String[] ROBOT_KEYS = {
            JobExecutionRegistry.AGV_ROBOT_16,
            JobExecutionRegistry.AGV_ROBOT_18,
            JobExecutionRegistry.AGV_ROBOT_20,
            JobExecutionRegistry.AGV_ROBOT_22
    };
    static final String[] ROBOT_IPS = {
            "172.22.159.16", "172.22.159.18", "172.22.159.20", "172.22.159.22"
    };

    private final AgvProxyService agvProxyService;
    private final AgvStatusCache statusCache;
    private final TwinJobScheduleConfigMapper configMapper;
    private final AgvTrajectoryMapper trajectoryMapper;

    /** 上次成功采集的时间，用于 fixedDelay 频率控制 */
    private volatile long lastRunAt = 0L;

    /** per-robot 的在线状态跟踪（仅用于日志降噪：仅状态转换时打 log） */
    private final Map<String, Boolean> robotOnline = new ConcurrentHashMap<>(4);

    // ── 自适应轮询休眠 ──
    /** 连续无变化次数阈值 → 进入休眠 */
    private static final int DORMANT_THRESHOLD = 30;
    /** 休眠时每 N 次 tick 才真正采集一次（≈ 每 DORMANT_INTERVAL 秒） */
    private static final int DORMANT_INTERVAL = 10;
    /** per-robot: 上次采集的坐标快照 + 连续相同计数 + 休眠tick计数 */
    private final Map<String, RobotPollState> pollStates = new ConcurrentHashMap<>(4);

    private static class RobotPollState {
        double lastX, lastY, lastAngle;
        int sameCount = 0;      // 连续无变化次数
        int dormantTick = 0;    // 休眠后的 tick 计数
        boolean dormant = false;

        boolean shouldSkip(double x, double y, double angle) {
            double dx = Math.abs(lastX - x);
            double dy = Math.abs(lastY - y);
            double da = Math.abs(lastAngle - angle);
            boolean moved = dx > 0.03 || dy > 0.03 || da > 0.087;

            if (moved) {
                sameCount = 0;
                dormantTick = 0;
                if (dormant) {
                    dormant = false;
                    // 唤醒日志由 updateOnlineState 处理
                }
            } else {
                sameCount++;
                if (!dormant && sameCount >= DORMANT_THRESHOLD) {
                    dormant = true;
                    dormantTick = 0;
                }
            }

            if (dormant) {
                dormantTick++;
                if (dormantTick % DORMANT_INTERVAL != 0) {
                    return true; // skip this cycle
                }
            }

            lastX = x; lastY = y; lastAngle = angle;
            return false; // proceed with poll
        }
    }

    public AgvCollectorService(AgvProxyService agvProxyService,
                               AgvStatusCache statusCache,
                               TwinJobScheduleConfigMapper configMapper,
                               AgvTrajectoryMapper trajectoryMapper) {
        this.agvProxyService = agvProxyService;
        this.statusCache = statusCache;
        this.configMapper = configMapper;
        this.trajectoryMapper = trajectoryMapper;
    }

    /**
     * 快速采集循环。fixedDelay 直接控制速率（默认 500ms），不再二次门控。
     * AGV_MASTER 只管 enabled + 时间窗口，频率由 {@code app.agv.scheduler-tick-ms} 决定。
     */
    @Scheduled(fixedDelayString = "${app.agv.scheduler-tick-ms:1000}", scheduler = "agvTaskScheduler")
    public void collect() {
        Map<String, TwinJobScheduleConfig> configs = loadAgvConfigs();
        TwinJobScheduleConfig master = configs.get(MASTER_KEY);
        if (master == null || master.getEnabled() == null || master.getEnabled() != 1) {
            return;
        }
        if (!isInWindow(master)) {
            return;
        }

        List<CompletableFuture<AgvRobotStatus>> futures = new ArrayList<>(4);
        for (int i = 0; i < ROBOT_KEYS.length; i++) {
            TwinJobScheduleConfig robotCfg = configs.get(ROBOT_KEYS[i]);
            if (robotCfg == null || robotCfg.getEnabled() == null || robotCfg.getEnabled() != 1) {
                continue;
            }
            final String ip = ROBOT_IPS[i];
            // 自适应休眠：先查缓存判断是否需要跳过
            AgvStatusCache.CachedStatus cached = statusCache.get(ip);
            if (cached != null && cached.getStatus() != null) {
                AgvRobotStatus last = cached.getStatus();
                RobotPollState ps = pollStates.computeIfAbsent(ip, k -> {
                    RobotPollState s = new RobotPollState();
                    s.lastX = last.getX() != null ? last.getX() : 0;
                    s.lastY = last.getY() != null ? last.getY() : 0;
                    s.lastAngle = last.getAngle() != null ? last.getAngle() : 0;
                    return s;
                });
                // 用上次缓存坐标做预判断（不等本次采集结果就先过滤）
                // 实际休眠判断在采集返回后做，这里只检查是否完全跳过本轮
                if (ps.dormant) {
                    ps.dormantTick++;
                    if (ps.dormantTick % DORMANT_INTERVAL != 0) {
                        continue; // 休眠中，跳过本轮
                    }
                }
            }
            futures.add(CompletableFuture.supplyAsync(() -> agvProxyService.fetchStatus(ip)));
        }

        if (futures.isEmpty()) {
            return;
        }

        List<AgvRobotStatus> results = futures.stream()
                .map(cf -> {
                    try {
                        return cf.get(5, TimeUnit.SECONDS);
                    } catch (Exception e) {
                        log.debug("AGV 采集超时或被中断: {}", e.getMessage());
                        return null;
                    }
                })
                .filter(s -> s != null)
                .collect(Collectors.toList());

        for (AgvRobotStatus s : results) {
            String ip = s.getCurrentIp();
            statusCache.put(ip, s);
            updateOnlineState(ip, true);
            insertTrajectory(s);
            // 更新轮询休眠状态
            if (s.getX() != null && s.getY() != null && s.getAngle() != null) {
                RobotPollState ps = pollStates.computeIfAbsent(ip, k -> new RobotPollState());
                boolean skipped = ps.shouldSkip(s.getX(), s.getY(), s.getAngle());
                if (!skipped && ps.dormant) {
                    log.info("AGV {} 唤醒 (休眠 {} 轮后检测到移动)", ip, ps.sameCount);
                }
            }
        }

        // 对本轮未返回的机器人标记离线
        for (String ip : ROBOT_IPS) {
            if (results.stream().noneMatch(s -> ip.equals(s.getCurrentIp()))) {
                updateOnlineState(ip, false);
            }
        }
    }

    /** "立即执行"入口，供 JobExecutionRegistry.execute() 调用 */
    public String runImmediatePoll() {
        collect();
        return "已触发即时采集，缓存中 " + statusCache.all().size() + " 台在线";
    }

    /** 单个机器人即时采集 */
    public String pollRobotNow(String ip) {
        AgvRobotStatus s = agvProxyService.fetchStatus(ip);
        if (s != null) {
            statusCache.put(ip, s);
            insertTrajectory(s);
            updateOnlineState(ip, true);
            return ip + " 采集成功";
        }
        updateOnlineState(ip, false);
        return ip + " 不可达";
    }

    // ---- internal helpers ----

    private Map<String, TwinJobScheduleConfig> loadAgvConfigs() {
        List<TwinJobScheduleConfig> all = configMapper.selectAll();
        Map<String, TwinJobScheduleConfig> map = new ConcurrentHashMap<>();
        for (TwinJobScheduleConfig c : all) {
            if (c.getJobKey() != null && c.getJobKey().startsWith("AGV_")) {
                map.put(c.getJobKey(), c);
            }
        }
        return map;
    }

    private boolean isInWindow(TwinJobScheduleConfig cfg) {
        LocalTime now = LocalTime.now().withSecond(0).withNano(0);
        LocalTime start = parseTime(cfg.getScheduleStartTime(), LocalTime.of(0, 0));
        LocalTime end = parseTime(cfg.getScheduleEndTime(), LocalTime.of(23, 59));
        if (start.isBefore(end)) {
            if (now.isBefore(start) || now.isAfter(end)) return false;
        } else {
            // 跨午夜窗口
            if (now.isBefore(start) && now.isAfter(end)) return false;
        }
        // week_days 检查
        String weekDays = cfg.getWeekDays();
        if (StringUtils.hasText(weekDays)) {
            int today = LocalDate.now().getDayOfWeek().getValue(); // 1=Mon
            if (!weekDays.contains(String.valueOf(today))) {
                return false;
            }
        }
        return true;
    }

    private int getPollIntervalSec(TwinJobScheduleConfig cfg) {
        Integer sec = cfg.getPollIntervalSeconds();
        return sec != null && sec > 0 ? sec : 1;
    }

    private LocalTime parseTime(String hhmm, LocalTime fallback) {
        if (!StringUtils.hasText(hhmm)) return fallback;
        try {
            return LocalTime.parse(hhmm, DateTimeFormatter.ofPattern("HH:mm"));
        } catch (Exception e) {
            return fallback;
        }
    }

    private void updateOnlineState(String ip, boolean online) {
        Boolean prev = robotOnline.put(ip, online);
        if (prev == null || prev != online) {
            if (online) {
                log.info("AGV {} 已上线", ip);
            } else {
                log.warn("AGV {} 已离线", ip);
            }
        }
    }

    private static final ObjectMapper JSON = new ObjectMapper();

    private void insertTrajectory(AgvRobotStatus s) {
        try {
            trajectoryMapper.insert(
                    s.getCurrentIp(),
                    s.getRetCode(),
                    s.getX(), s.getY(), s.getAngle(),
                    s.getBatteryLevel(), s.getTaskStatus(),
                    s.getCurrentMap(), s.getCurrentStation(),
                    s.getCharging(), s.getBlocked(), s.getEmergency(),
                    s.getConfidence(), s.getOdo(), s.getVehicleId(),
                    s.getRelocStatus(), s.getLoadmapStatus(),
                    s.getRssi(), s.getSsid(), s.getDriverEmc(),
                    s.getForkHeight(),
                    s.getJackEnable(), s.getJackErrorCode(),
                    s.getJackIsFull(), s.getJackMode(), s.getJackState(),
                    s.getTotalTime(), s.getRobotNote(),
                    toJson(s.getErrors()), toJson(s.getFatals()),
                    toJson(s.getWarnings()), toJson(s.getNotices()),
                    toJson(s.getDi()),
                    s.getCreateOn(),
                    LocalDateTime.now());
        } catch (Exception e) {
            log.debug("AGV 轨迹入库失败 {}: {}", s.getCurrentIp(), e.getMessage());
        }
    }

    private String toJson(Object obj) {
        if (obj == null) return null;
        try { return JSON.writeValueAsString(obj); } catch (Exception e) { return null; }
    }
}
