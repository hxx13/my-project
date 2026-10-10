package com.example.demo.modules.agv.analysis;

import com.example.demo.modules.agv.AgvRobots;
import com.example.demo.modules.agv.mapper.AgvStatsMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * AGV 每日指标：封存、历史回填、日行聚合、今日曲线。
 *
 * <h3>日界口径（容易搞错，先看这条）</h3>
 * 轨迹表里的 {@code recorded_at} 存的是 <b>UTC 墙钟</b>——实测北京日 2026-10-10 的数据
 * 落在 2026-10-09 16:00 起。Java 侧一律传**无时区的 LocalDateTime**，JDBC 不做转换，
 * 因此「北京日 D」= UTC 墙钟 {@code [D-1 16:00, D 16:00)}，见 {@link #beijingDayUtcBounds}。
 *
 * <h3>为什么日值直接扫轨迹、不数事件</h3>
 * 事件是拦截器**在线增量**产的（重启只回追 5 分钟），历史天根本没有事件行。
 * 扫轨迹用同一个 {@link AgvForkStrokeDetector} 算，**定时封存与历史回填走同一条代码路径**，
 * 不会出现「在线一套口径、回填另一套」的漂移。代价是每天多扫一次当天轨迹（1 号车约 1~4 万行），
 * 一天一次可接受。
 */
@Service
public class AgvMetricService {

    private static final Logger log = LoggerFactory.getLogger(AgvMetricService.class);
    private static final ZoneId BEIJING = ZoneId.of("Asia/Shanghai");

    public static final String METRIC_CAGE_WASH_TOTAL = "CAGE_WASH_TOTAL";
    public static final String METRIC_ODO_TOTAL = "ODO_TOTAL";
    public static final String ODO_BY_ROBOT_PREFIX = "ODO_BY_ROBOT:";
    /** 今日曲线的桶宽（分钟），与既有站点历史的 5 分钟桶一致 */
    public static final int CURVE_BUCKET_MINUTES = 5;
    static final String EVENT_FORK_RAISE_STROKE = "FORK_RAISE_STROKE";

    private final AgvStatsMapper statsMapper;

    public AgvMetricService(AgvStatsMapper statsMapper) {
        this.statsMapper = statsMapper;
    }

    /**
     * 北京日 D 对应的 UTC 墙钟半开区间 {@code [D-1 16:00, D 16:00)}。
     * 实测依据：北京日 2026-10-10 的轨迹落在 2026-10-09 16:00 起。
     */
    public static LocalDateTime[] beijingDayUtcBounds(LocalDate day) {
        LocalDateTime from = day.minusDays(1).atTime(16, 0);
        return new LocalDateTime[] { from, from.plusDays(1) };
    }

    /**
     * 封存一天。已在库里的天直接跳过（幂等，回填可反复跑）。
     *
     * @param source {@code LIVE}（定时封存）或 {@code BACKFILL}（历史回填）
     * @return 写入的指标条数；跳过时返回 0
     */
    public int freezeDay(LocalDate day, String source) {
        String dateStr = day.toString();
        if (statsMapper.countDailyMetricsForDate(dateStr) > 0) {
            log.debug("[AgvMetric] {} 已有封存行，跳过（source={}）", dateStr, source);
            return 0;
        }
        LocalDateTime[] bounds = beijingDayUtcBounds(day);
        int written = 0;

        // 1) 笼盒清洗：1 号车当天叉臂序列 → 行程数 × 80
        List<Double> forkSeries = statsMapper.selectForkHeights(
            AgvRobots.CAGE_WASH_ROBOT, bounds[0], bounds[1]);
        if (forkSeries != null && !forkSeries.isEmpty()) {
            AgvForkStrokeDetector detector = new AgvForkStrokeDetector();
            int strokes = 0;
            for (Double h : forkSeries) {
                if (detector.feed(AgvRobots.CAGE_WASH_ROBOT, h)) strokes++;
            }
            double cages = (double) strokes * AgvRobots.CAGES_PER_FORK_STROKE;
            statsMapper.upsertDailyMetric(dateStr, METRIC_CAGE_WASH_TOTAL, cages, source);
            written++;
            log.info("[AgvMetric] {} 笼盒清洗：{} 次抬臂 × {} = {} 个", dateStr, strokes,
                AgvRobots.CAGES_PER_FORK_STROKE, (long) cages);
        }

        // 2) 里程：六台车各一条 + 合计一条
        double total = 0;
        boolean anyOdo = false;
        for (String ip : AgvRobots.ALL) {
            Double delta = statsMapper.selectOdoDelta(ip, bounds[0], bounds[1]);
            if (delta == null) continue;
            anyOdo = true;
            total += delta;
            statsMapper.upsertDailyMetric(dateStr, ODO_BY_ROBOT_PREFIX + ip, delta, source);
            written++;
        }
        if (anyOdo) {
            statsMapper.upsertDailyMetric(dateStr, METRIC_ODO_TOTAL, total, source);
            written++;
        }
        return written;
    }

    /**
     * 历史回填。逐日封存，天数很大的区间请分批调用（一天一次事务，别一次拉整个月）。
     *
     * @return 实际写入的指标条数
     */
    public int backfill(LocalDate from, LocalDate to) {
        int written = 0;
        for (LocalDate d = from; !d.isAfter(to); d = d.plusDays(1)) {
            try {
                written += freezeDay(d, "BACKFILL");
            } catch (Exception e) {
                log.warn("[AgvMetric] 回填 {} 失败：{}", d, e.getMessage());
            }
        }
        log.info("[AgvMetric] 回填 {} ~ {} 完成，写入 {} 条", from, to, written);
        return written;
    }

    /** 每日定时封存：每天 00:05（北京时间）封存前一天。显式写时区，不依赖 JVM 默认时区 */
    @Scheduled(cron = "0 5 0 * * ?", zone = "Asia/Shanghai")
    public void freezeYesterday() {
        LocalDate yesterday = LocalDate.now(BEIJING).minusDays(1);
        try {
            freezeDay(yesterday, "LIVE");
        } catch (Exception e) {
            log.warn("[AgvMetric] 封存 {} 失败：{}", yesterday, e.getMessage());
        }
    }

    /** 近 N 天日行（含今天），按指标键分组 */
    public List<Map<String, Object>> dailyRows(int days) {
        LocalDate today = LocalDate.now(BEIJING);
        return statsMapper.selectDailyMetrics(today.minusDays(days - 1L).toString(), today.toString());
    }

    /** 某一天的日行（用于「今日已封存」这类单日查询） */
    public List<Map<String, Object>> rowsForDay(LocalDate day) {
        String d = day.toString();
        return statsMapper.selectDailyMetrics(d, d);
    }

    /**
     * 历史累计：笼盒总数与里程总数。
     * <p>走库里的聚合，不把两万多行日行拉回来加（驾驶舱十秒轮询一次）。
     */
    public Map<String, Double> cumulativeTotals() {
        Map<String, Double> out = new LinkedHashMap<>();
        out.put(METRIC_CAGE_WASH_TOTAL, 0.0);
        out.put(METRIC_ODO_TOTAL, 0.0);
        List<Map<String, Object>> rows = statsMapper.selectDailyTotals();
        if (rows == null) return out;
        for (Map<String, Object> r : rows) {
            String key = String.valueOf(r.get("metric_key"));
            Object total = r.get("total");
            if (out.containsKey(key) && total instanceof Number n) {
                out.put(key, n.doubleValue());
            }
        }
        return out;
    }

    /**
     * 六台车各自的**历史累计**里程（米）。同样走库里聚合，不把日行拉回来分组求和。
     */
    public Map<String, Double> cumulativeMetersByRobot() {
        Map<String, Double> out = new LinkedHashMap<>();
        for (String ip : AgvRobots.ALL) out.put(ip, 0.0);
        List<Map<String, Object>> rows = statsMapper.selectOdoTotalsByRobot();
        if (rows == null) return out;
        for (Map<String, Object> r : rows) {
            String key = String.valueOf(r.get("metric_key"));
            String ip = key.substring(ODO_BY_ROBOT_PREFIX.length());
            Object total = r.get("total");
            if (out.containsKey(ip) && total instanceof Number n) {
                out.put(ip, n.doubleValue());
            }
        }
        return out;
    }

    /**
     * 今日**实时**里程：当天到此刻为止每台车走过的距离 + 合计。
     *
     * <p>为什么不查日行表：里程是**按天封存**的，当天那一行要等次日 00:05 才产生 ——
     * 白天去日行表里根本没有今天，值恒为 0。这里直接扫当天到此刻的轨迹，
     * 用**与封存同一个** {@code selectOdoDelta}（MAX(odo)−MIN(odo)），口径与日值一致。
     */
    public Map<String, Object> todayLiveMeters() {
        LocalDate today = LocalDate.now(BEIJING);
        LocalDateTime[] bounds = beijingDayUtcBounds(today);
        LocalDateTime nowUtc = LocalDateTime.now(ZoneOffset.UTC);
        LocalDateTime to = nowUtc.isBefore(bounds[1]) ? nowUtc : bounds[1];

        Map<String, Double> byRobot = new LinkedHashMap<>();
        double total = 0;
        for (String ip : AgvRobots.ALL) {
            Double d = statsMapper.selectOdoDelta(ip, bounds[0], to);
            double v = d == null ? 0 : d;
            byRobot.put(ip, v);
            total += v;
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("odoByRobot", byRobot);
        out.put("odoTotal", total);
        return out;
    }

    /**
     * 今日笼盒清洗累计曲线：按 5 分钟桶累计。
     * 数据源是事件日志（在线实时产的），所以是**实时爬升**的，不等封存。
     */
    public List<Map<String, Object>> todayCageWashCurve() {
        LocalDate today = LocalDate.now(BEIJING);
        LocalDateTime[] bounds = beijingDayUtcBounds(today);
        // 今日尚未结束：区间上界取「现在」对应的 UTC 墙钟
        LocalDateTime nowUtc = LocalDateTime.now(ZoneOffset.UTC);
        LocalDateTime to = nowUtc.isBefore(bounds[1]) ? nowUtc : bounds[1];

        List<LocalDateTime> times = statsMapper.selectEventTimes(
            EVENT_FORK_RAISE_STROKE, AgvRobots.CAGE_WASH_ROBOT, bounds[0], to);

        Map<LocalDateTime, Double> buckets = new LinkedHashMap<>();
        LocalDateTime cursor = bounds[0];
        while (cursor.isBefore(to)) {
            buckets.put(cursor, 0.0);
            cursor = cursor.plusMinutes(CURVE_BUCKET_MINUTES);
        }
        if (times != null) {
            for (LocalDateTime t : times) {
                long mins = Duration.between(bounds[0], t).toMinutes();
                LocalDateTime bucket = bounds[0].plusMinutes((mins / CURVE_BUCKET_MINUTES) * CURVE_BUCKET_MINUTES);
                if (buckets.containsKey(bucket)) {
                    buckets.put(bucket, buckets.get(bucket) + AgvRobots.CAGES_PER_FORK_STROKE);
                }
            }
        }

        List<Map<String, Object>> out = new ArrayList<>();
        double cum = 0;
        for (Map.Entry<LocalDateTime, Double> e : buckets.entrySet()) {
            cum += e.getValue();
            Map<String, Object> point = new LinkedHashMap<>();
            point.put("at", e.getKey().plusHours(8).toString());  // 还原成北京墙钟给前端画轴
            point.put("cages", cum);
            out.add(point);
        }
        return out;
    }
}
