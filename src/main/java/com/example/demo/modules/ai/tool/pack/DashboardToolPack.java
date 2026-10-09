package com.example.demo.modules.ai.tool.pack;

import com.example.demo.modules.ai.tool.AiTool;
import com.example.demo.modules.ai.tool.AiToolPack;
import com.example.demo.modules.ai.tool.SideEffect;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.twin.common.mapper.TwinDashboardMapper;
import com.example.demo.modules.twin.dashboard.service.TwinDashboardService;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Predicate;

/**
 * 运营大屏（{@code /#/console/dashboard}）的工具链。
 *
 * <p>四件事：**今天进出多少**（各区域人次 + 高峰时段）、**谁在榜上**（课题组排行榜）、
 * **现在楼里怎么样**（实时流水 / 在楼与滞留）。全部是读 —— 大屏本身就没有写操作。
 *
 * <p>数据口径一律复用既有的服务与 Mapper（{@link TwinDashboardService} 与
 * {@link TwinDashboardMapper}），**不在这里重算一遍**：统计口径在两边各写一份必然分叉，
 * 用户会看到「页面上是 823、助手说是 831」。业务日界也走同一个 `BusinessTimeWindow`（服务内部已用）。
 */
@Component
public class DashboardToolPack implements AiToolPack {

    /** 看大屏数据：与页面接口同口径（登录即可，接口层没有额外角色判定）。 */
    public static final String CAP_DASHBOARD_READ = "ai.dashboard.read";

    private static final int MAX_FEED_ROWS = 30;
    private static final int MAX_RANK_ROWS = 20;
    private static final int MAX_RETENTION_ROWS = 30;

    private final TwinDashboardService dashboardService;
    private final TwinDashboardMapper dashboardMapper;

    public DashboardToolPack(TwinDashboardService dashboardService, TwinDashboardMapper dashboardMapper) {
        this.dashboardService = dashboardService;
        this.dashboardMapper = dashboardMapper;
    }

    @Override
    public String packKey() {
        return "dashboard";
    }

    @Override
    public String displayName() {
        return "运营大屏";
    }

    @Override
    public Set<String> routeHints() {
        // 「大屏」「排行榜」「今天进了多少人」是问这块数据的自然说法；页面路径里含 dashboard，
        // packKey 本身已经能命中 /console/dashboard，这里只补中文口语。
        return Set.of("大屏", "排行榜", "进出人次", "进出人数", "高峰", "实时流水", "今天来了多少人",
                "楼里", "运营大屏", "在楼", "滞留", "还没走", "超时");
    }

    @Override
    public String defaultPrompt() {
        return """
                运营大屏（数字孪生大屏）的口径：
                - 「今天进了多少人」→ queryTodayTraffic（分浦东 / 浦西两个校区，另给进出高峰时段）。
                  两个校区的数**不要相加**报成一个总数，用户问哪个校区就说哪个；没问就两个都报。
                - 「课题组排行」「哪个组最活跃」→ queryGroupRanking。时间段默认今天（TODAY），
                  用户说「本周 / 本月」再换 timeType。
                - 「现在楼里有谁 / 刚刚谁刷卡进来了」→ queryRealtimeFeed（实时流水，含进出方向与房间）。
                  它是**流水的最近若干条**，不是「目前在楼内的完整人员名单」——别把它说成一个人数。
                - 「谁还在里面 / 有没有人待太久 / 滞留」→ queryRetentionWarnings：**在楼人数看它**，
                  口径是「今天进楼后还没离开的人」（分浦东 / 浦西，带预计离开时间与超时概率）。
                  用户问「在楼多少人」时用它，**不要**拿实时流水条数去凑一个数。
                - 今天的 peak 如果返回的是**一句说明**（例如「今天还没有进出记录，谈不上高峰」），
                  就照实说还没有高峰数据，**不要**自己编一个时段。
                - 数据来自大屏同一套统计，**不要自己拿流水条数去推算人数**（口径不同，会与页面对不上）。
                - 这一包全是只读，不涉及任何审批或写操作。""";
    }

    @Override
    public Map<String, Predicate<User>> capabilities() {
        return Map.of(CAP_DASHBOARD_READ, user -> true);
    }

    @Override
    public List<AiTool> tools() {
        return List.of(queryTodayTraffic(), queryGroupRanking(), queryRealtimeFeed(), queryRetentionWarnings());
    }

    // ── 今日进出 ──

    private AiTool queryTodayTraffic() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "withPeak": { "type": "boolean", "description": "是否附带今天进出高峰时段，默认 true" }
                  },
                  "additionalProperties": false
                }""";
        return new AiTool(
                "queryTodayTraffic",
                "查今天的进出人次（分浦东 / 浦西校区）与当日进出高峰时段。"
                        + "用户问「今天来了多少人」「什么时候人最多」时用它。"
                        + "这是大屏的聚合口径，**不是**在楼人数。",
                schema, CAP_DASHBOARD_READ, SideEffect.READ,
                (ctx, args) -> {
                    Map<String, Object> out = new LinkedHashMap<>();
                    Map<String, Object> stats = dashboardService.getTodayRoomStats();
                    out.put("ok", true);
                    out.put("pudongTotal", stats.get("pudongTotal"));
                    out.put("puxiTotal", stats.get("puxiTotal"));
                    out.put("pudongRooms", roomStats(stats.get("pudongPie")));
                    out.put("puxiRooms", roomStats(stats.get("puxiPie")));
                    if (args.path("withPeak").asBoolean(true)) {
                        Map<String, Object> peak = peakOf(dashboardService.getTodayLineChart());
                        out.put("peak", peak.get("pudong") == null && peak.get("puxi") == null
                                ? "今天两个校区都还没有进出记录，谈不上高峰"
                                : peak);
                    }
                    out.put("note", "分校区口径，两个校区的数不要相加");
                    return out;
                });
    }

    /** 折线图（27 个半小时刻度，从 07:00 起）里取两个校区各自的高峰时段。 */
    @SuppressWarnings("unchecked")
    private static Map<String, Object> peakOf(Map<String, Object> line) {
        Map<String, Object> out = new LinkedHashMap<>();
        if (line == null) {
            return out;
        }
        List<String> times = line.get("times") instanceof List<?> list
                ? (List<String>) list : List.of();
        out.put("pudong", peakSlot(times, line.get("pudong")));
        out.put("puxi", peakSlot(times, line.get("puxi")));
        return out;
    }

    private static String peakSlot(List<String> times, Object series) {
        int[] arr = ints(series);
        if (arr == null || arr.length == 0) {
            return null;
        }
        int best = 0;
        for (int i = 1; i < arr.length; i++) {
            if (arr[i] > arr[best]) {
                best = i;
            }
        }
        // 全天都是 0 时说「高峰 07:00（0 人次）」是假信息（2026-10-09 真机就这么报了）——
        // 没有进出就没有高峰，宁可说没有。
        if (arr[best] <= 0) {
            return null;
        }
        String at = best < times.size() ? times.get(best) : ("第 " + best + " 个刻度");
        return at + "（" + arr[best] + " 人次）";
    }

    private static int[] ints(Object raw) {
        if (raw instanceof int[] a) {
            return a;
        }
        if (raw instanceof List<?> list) {
            int[] a = new int[list.size()];
            for (int i = 0; i < list.size(); i++) {
                Object o = list.get(i);
                a[i] = o instanceof Number n ? n.intValue() : 0;
            }
            return a;
        }
        return null;
    }

    /** 房间饼图行：只留「房间 + 人次」，别把整行塞给模型。 */
    private static List<Map<String, Object>> roomStats(Object pie) {
        List<Map<String, Object>> rows = new ArrayList<>();
        if (!(pie instanceof List<?> list)) {
            return rows;
        }
        for (Object o : list) {
            if (!(o instanceof Map<?, ?> m)) {
                continue;
            }
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("room", firstOf(m, "name", "room_name", "roomName", "label"));
            row.put("count", firstOf(m, "value", "count", "total"));
            rows.add(row);
        }
        return rows;
    }

    // ── 排行榜 ──

    private AiTool queryGroupRanking() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "timeType": {
                      "type": "string",
                      "enum": ["TODAY", "WEEK", "MONTH"],
                      "description": "统计范围，默认 TODAY（今天）"
                    },
                    "region": {
                      "type": "string",
                      "enum": ["TOTAL", "PUDONG", "PUXI"],
                      "description": "校区，默认 TOTAL（两个校区合计）"
                    },
                    "limit": { "type": "integer", "description": "最多回几名，默认 10，上限 20" }
                  },
                  "additionalProperties": false
                }""";
        return new AiTool(
                "queryGroupRanking",
                "查课题组排行榜（按进出活跃度）。用户问「哪个组最活跃」「课题组排行」时用它。",
                schema, CAP_DASHBOARD_READ, SideEffect.READ,
                (ctx, args) -> {
                    String timeType = arg(args, "timeType", "TODAY").toUpperCase(Locale.ROOT);
                    String region = arg(args, "region", "TOTAL").toUpperCase(Locale.ROOT);
                    int limit = Math.min(Math.max(args.path("limit").asInt(10), 1), MAX_RANK_ROWS);
                    List<Map<String, Object>> raw = dashboardService.getGroupRanking(timeType, region);
                    List<Map<String, Object>> rows = new ArrayList<>();
                    for (Map<String, Object> r : raw) {
                        if (rows.size() >= limit) {
                            break;
                        }
                        Map<String, Object> row = new LinkedHashMap<>();
                        row.put("rank", rows.size() + 1);
                        row.put("group", firstOf(r, "groupName", "group_name", "projectGroupName", "name"));
                        row.put("count", firstOf(r, "total", "count", "value", "num"));
                        rows.add(row);
                    }
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("ok", true);
                    out.put("timeType", timeType);
                    out.put("region", region);
                    out.put("ranked", rows);
                    if (rows.isEmpty()) {
                        out.put("note", "这个范围与校区下暂无数据");
                    }
                    return out;
                });
    }

    private AiTool queryRetentionWarnings() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "area": { "type": "string", "enum": ["浦东", "浦西"], "description": "校区；不传默认浦东" },
                    "limit": { "type": "integer", "description": "最多回几条，默认 15，上限 30" }
                  },
                  "additionalProperties": false
                }""";
        return new AiTool(
                "queryRetentionWarnings",
                "查**当前还在楼 / 可能滞留**的人（大屏「AI 滞留监控」卡）：谁、几点进的、预计待多久、"
                        + "预计何时离开、超时概率多大。**问「在楼多少人 / 谁还没走」就用它** —— "
                        + "不是 queryRealtimeFeed（那条是最近若干条流水，不等于现在楼里有谁）。",
                schema, CAP_DASHBOARD_READ, SideEffect.READ,
                (ctx, args) -> {
                    String area = arg(args, "area", "浦东");
                    int limit = Math.min(Math.max(args.path("limit").asInt(15), 1), MAX_RETENTION_ROWS);
                    List<Map<String, Object>> raw = dashboardService.getActiveRetentionWarnings(limit, area);
                    List<Map<String, Object>> rows = new ArrayList<>();
                    for (Map<String, Object> r : raw) {
                        Map<String, Object> row = new LinkedHashMap<>();
                        row.put("name", firstOf(r, "userName", "name"));
                        row.put("room", firstOf(r, "roomName", "room_name"));
                        row.put("group", firstOf(r, "groupName", "project_group_names"));
                        row.put("enteredAt", firstOf(r, "enterTime"));
                        row.put("forecastStayMinutes", firstOf(r, "aiDurationMins"));
                        row.put("forecastExitAt", firstOf(r, "aiExitTime"));
                        row.put("overtimeProb", firstOf(r, "aiOvertimeProb"));
                        rows.add(row);
                    }
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("ok", true);
                    out.put("area", area);
                    out.put("count", rows.size());
                    out.put("people", rows);
                    out.put("note", rows.isEmpty()
                            ? "这个校区今天没有「进了还没走」的记录"
                            : "口径是「今天进楼后还没离开的人」，与实时流水条数不是一回事；"
                                    + "overtimeProb 是超时概率，forecastExitAt 是预计离开时间（预测，不是承诺）");
                    return out;
                });
    }

    // ── 实时流水 ──

    private AiTool queryRealtimeFeed() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "limit": { "type": "integer", "description": "最多回几条，默认 15，上限 30" }
                  },
                  "additionalProperties": false
                }""";
        return new AiTool(
                "queryRealtimeFeed",
                "查大屏右侧的**实时进出流水**最近若干条（谁、几点、从哪进/出）。"
                        + "用户问「刚刚谁来了」「现在有什么动静」时用它。"
                        + "**它是流水条数，不是在楼人数** —— 不要拿它推算有几个人在里面。",
                schema, CAP_DASHBOARD_READ, SideEffect.READ,
                (ctx, args) -> {
                    int limit = Math.min(Math.max(args.path("limit").asInt(15), 1), MAX_FEED_ROWS);
                    List<Map<String, Object>> raw = dashboardMapper.getRealtimeFeed(limit);
                    List<Map<String, Object>> rows = new ArrayList<>();
                    for (Map<String, Object> r : raw) {
                        Map<String, Object> row = new LinkedHashMap<>();
                        row.put("time", firstOf(r, "create_time", "createTime", "timestamp"));
                        row.put("name", firstOf(r, "name", "userName", "user_name"));
                        row.put("action", firstOf(r, "accessType", "action", "feed_summary_zh"));
                        row.put("area", firstOf(r, "area_name", "areaName"));
                        row.put("room", firstOf(r, "room_name", "roomName"));
                        rows.add(row);
                    }
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("ok", true);
                    out.put("count", rows.size());
                    out.put("feed", rows);
                    return out;
                });
    }

    // ── 内部 ──

    private static String arg(JsonNode args, String field, String fallback) {
        JsonNode n = args == null ? null : args.path(field);
        if (n == null || !n.isTextual() || n.asText("").isBlank()) {
            return fallback;
        }
        return n.asText("").trim();
    }

    /**
     * 按候选列名取第一个有值的。
     *
     * <p>这几个查询都是 `resultType="map"` 的裸 Map（列名由 SQL 一列列写死，没有 DTO 兜底），
     * 换一次 SQL 别名就会静默取空。列名候选写宽一点，比在每个调用点假设一个名字安全。
     */
    private static Object firstOf(Map<?, ?> row, String... keys) {
        for (String k : keys) {
            Object v = row.get(k);
            if (v != null) {
                return v;
            }
        }
        return null;
    }
}
