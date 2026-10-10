package com.example.demo.modules.agv.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.agv.AgvRobots;
import com.example.demo.modules.agv.analysis.AgvMetricService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.*;

/**
 * AGV 指标接口：笼盒清洗与里程。
 *
 * <p>累计值一律**在这里算**（对日行求和），不留给前端各算一套。
 *
 * <h3>今日与历史的差别</h3>
 * 「今日」走事件日志（在线实时产的，所以实时爬升）；历史走日行表（封存过、固定）。
 * 两者用同一个换算率 {@link AgvRobots#CAGES_PER_FORK_STROKE}。
 */
@RestController
@RequestMapping("/api/v1/agv/metrics")
@Tag(name = "AGV 指标")
public class AgvMetricsController {

    private static final ZoneId BEIJING = ZoneId.of("Asia/Shanghai");

    private final AgvMetricService metricService;

    public AgvMetricsController(AgvMetricService metricService) {
        this.metricService = metricService;
    }

    /** 概况：今日笼盒、今日行程数、今日里程、以及历史累计 */
    @GetMapping("/today")
    @Operation(summary = "AGV 指标概况")
    public Result<Map<String, Object>> today() {
        LocalDate today = LocalDate.now(BEIJING);
        Map<String, Double> totals = metricService.cumulativeTotals();

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("cageWashTotal", totals.get(AgvMetricService.METRIC_CAGE_WASH_TOTAL));
        out.put("odoTotal", totals.get(AgvMetricService.METRIC_ODO_TOTAL));
        // 六台车各自的历史累计里程（顶部「总累计路程」那格下面的横向条形要用）
        out.put("odoTotalByRobot", metricService.cumulativeMetersByRobot());
        out.put("cagesPerStroke", AgvRobots.CAGES_PER_FORK_STROKE);
        out.put("robotCount", AgvRobots.ALL.size());
        out.put("todayFrozen", metricService.rowsForDay(today));
        // 今日实时值：事件还没到今天封存那一步，走曲线最后一个点
        List<Map<String, Object>> curve = metricService.todayCageWashCurve();
        out.put("cageWashTodayLive", curve.isEmpty() ? 0.0 : curve.get(curve.size() - 1).get("cages"));
        // 今日实时里程：按天封存的那行要等次日 00:05，白天查表恒为 0，所以扫当天到此刻的轨迹现算
        out.put("todayLive", metricService.todayLiveMeters());
        return Result.success(out);
    }

    /** 笼盒清洗曲线：range=today 今日 5 分钟桶累计；range=days 近 N 天日值 */
    @GetMapping("/cage-wash")
    @Operation(summary = "笼盒清洗曲线")
    public Result<Map<String, Object>> cageWash(@RequestParam(defaultValue = "today") String range,
                                                @RequestParam(defaultValue = "30") int days) {
        Map<String, Object> out = new LinkedHashMap<>();
        if ("days".equals(range)) {
            int n = Math.max(1, Math.min(days, 365));
            List<Map<String, Object>> pts = new ArrayList<>();
            for (Map<String, Object> r : metricService.dailyRows(n)) {
                if (AgvMetricService.METRIC_CAGE_WASH_TOTAL.equals(String.valueOf(r.get("metric_key")))) {
                    Map<String, Object> p = new LinkedHashMap<>();
                    p.put("at", String.valueOf(r.get("stat_date")));
                    p.put("cages", ((Number) r.get("metric_value")).doubleValue());
                    pts.add(p);
                }
            }
            out.put("range", "days");
            // 缺数据的天不补 0：前端按 at 的间隔自己断线
            out.put("points", pts);
        } else {
            out.put("range", "today");
            out.put("points", metricService.todayCageWashCurve());
        }
        return Result.success(out);
    }

    /** 里程曲线：近 N 天，六台车各一条 + 合计一条 */
    @GetMapping("/distance")
    @Operation(summary = "六台车里程曲线")
    public Result<Map<String, Object>> distance(@RequestParam(defaultValue = "30") int days) {
        int n = Math.max(1, Math.min(days, 365));
        List<Map<String, Object>> rows = metricService.dailyRows(n);

        Map<String, Map<String, Double>> byRobot = new LinkedHashMap<>();
        for (String ip : AgvRobots.ALL) byRobot.put(ip, new LinkedHashMap<>());
        Map<String, Double> totalByDay = new LinkedHashMap<>();

        for (Map<String, Object> r : rows) {
            String date = String.valueOf(r.get("stat_date"));
            String key = String.valueOf(r.get("metric_key"));
            double v = ((Number) r.get("metric_value")).doubleValue();
            if (key.startsWith(AgvMetricService.ODO_BY_ROBOT_PREFIX)) {
                String ip = key.substring(AgvMetricService.ODO_BY_ROBOT_PREFIX.length());
                Map<String, Double> series = byRobot.get(ip);
                if (series != null) series.put(date, v);
            } else if (AgvMetricService.METRIC_ODO_TOTAL.equals(key)) {
                totalByDay.put(date, v);
            }
        }

        List<Map<String, Object>> series = new ArrayList<>();
        for (Map.Entry<String, Map<String, Double>> e : byRobot.entrySet()) {
            Map<String, Object> s = new LinkedHashMap<>();
            s.put("key", e.getKey());
            s.put("points", toPoints(e.getValue()));
            series.add(s);
        }
        Map<String, Object> totalSeries = new LinkedHashMap<>();
        totalSeries.put("key", "TOTAL");
        totalSeries.put("points", toPoints(totalByDay));
        series.add(totalSeries);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("series", series);
        return Result.success(out);
    }

    /** 历史回填（一次性入口，可反复跑：已封存的天会跳过） */
    @PostMapping("/backfill")
    @Operation(summary = "历史回填每日指标")
    public Result<Map<String, Object>> backfill(@RequestParam String from, @RequestParam String to) {
        int written = metricService.backfill(LocalDate.parse(from), LocalDate.parse(to));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("written", written);
        return Result.success(out);
    }

    private static List<Map<String, Object>> toPoints(Map<String, Double> byDay) {
        List<Map<String, Object>> pts = new ArrayList<>();
        for (Map.Entry<String, Double> e : byDay.entrySet()) {
            Map<String, Object> p = new LinkedHashMap<>();
            p.put("at", e.getKey());
            p.put("meters", e.getValue());
            pts.add(p);
        }
        return pts;
    }
}
