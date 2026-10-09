package com.example.demo.modules.ai.tool.pack;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.time.BusinessTimeWindow;
import com.example.demo.modules.ai.tool.AiTool;
import com.example.demo.modules.ai.tool.AiToolPack;
import com.example.demo.modules.ai.tool.SideEffect;
import com.example.demo.modules.aro.task.AroSyncTask;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.twin.common.mapper.TwinDashboardMapper;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Component;

import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Predicate;

/**
 * 流水线日志（{@code /#/console/debug}）的工具链。
 *
 * <p>三件事：**查流水**（多维过滤 + 聚合指标）、**手动同步**（把大华门禁的最新流水拉进来）。
 * 前两个复用 {@link TwinDashboardMapper} 上与页面**同一条**过滤查询 ——
 * 口径一致比「重写一份更漂亮的查询」重要，否则页面上 500 条、助手说 480 条。
 *
 * <p>同步这一条是**唯一能在这个包里被定时调度的动作**（其余是读）：它碰外部系统（大华 / ARO），
 * 侧效等级 C。页面上的入口也在「运维」菜单里且要 SUPER_ADMIN —— 本工具的能力码照抄那个口径。
 */
@Component
public class DebugLogToolPack implements AiToolPack {

    /** 查流水：与 debug 页读接口同口径（登录即可）。 */
    public static final String CAP_DEBUG_READ = "ai.debug.read";
    /** 手动同步流水：与页面「运维 → 同步门禁流水」同口径（SUPER_ADMIN 及以上）。 */
    public static final String CAP_DEBUG_SYNC = "ai.debug.sync";

    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    private static final int MAX_ROWS = 50;

    private final TwinDashboardMapper dashboardMapper;
    private final BusinessTimeWindow businessTimeWindow;
    private final AroSyncTask aroSyncTask;

    public DebugLogToolPack(TwinDashboardMapper dashboardMapper,
                            BusinessTimeWindow businessTimeWindow,
                            AroSyncTask aroSyncTask) {
        this.dashboardMapper = dashboardMapper;
        this.businessTimeWindow = businessTimeWindow;
        this.aroSyncTask = aroSyncTask;
    }

    @Override
    public String packKey() {
        return "debug";
    }

    @Override
    public String displayName() {
        return "流水线日志";
    }

    @Override
    public Set<String> routeHints() {
        // 「流水」「门禁记录」「刷卡记录」是这个页面的口语说法；packKey=debug 本身能命中 /console/debug 路径。
        return Set.of("流水", "流水线", "门禁记录", "刷卡记录", "进出记录", "流水日志", "黑名单");
    }

    @Override
    public String defaultPrompt() {
        return """
                流水线日志（门禁进出流水）的口径：
                - 「今天谁进出了」「查一下某人的刷卡记录」→ queryAccessLogs（支持按人 / 校区 / 楼层 /
                  房间 / 时间段 / 进出方向过滤）。**默认只查今天**：不传时间段时本工具会按今天收窄，
                  全量流水是百万级，不要试图一次拉完。
                - 「今天一共多少条 / 进了多少次」这类总数与聚合 → queryAccessLogStats（同一套过滤条件）。
                - **查不到某个人时先别下「他没来过」的结论**：默认会**排除黑名单人员**（与页面一致）。
                  用户说「他明明刷过卡」→ 让他确认是否在黑名单，或传 excludeBlacklist=false 再查一次。
                  （2026-10-09 真机：林安顺在实时流水里有、按人名查却是 0 条，正是这个过滤。）
                - 流水行里的 time 是**北京时间**的业务时间，直接照原样报给用户，不要自己换算时区。
                - 「同步一下最新流水」→ syncAccessLogs（碰外部系统，服务端会挂起等用户点确认；
                  只在用户明确要求同步时调，别自作主张）。
                - 这一包不负责黑名单增删 —— 那不在流水页上。""";
    }

    @Override
    public Map<String, Predicate<User>> capabilities() {
        return Map.of(
                CAP_DEBUG_READ, user -> true,
                CAP_DEBUG_SYNC, user -> user.getRole() != null
                        && user.getRole().getLevel() >= RoleEnum.SUPER_ADMIN.getLevel());
    }

    @Override
    public List<AiTool> tools() {
        return List.of(queryAccessLogs(), queryAccessLogStats(), syncAccessLogs());
    }

    // ── 查流水 ──

    private AiTool queryAccessLogs() {
        return new AiTool(
                "queryAccessLogs",
                "查门禁进出流水（谁、几点、从哪个房间进/出，含校区与楼层过滤）。默认查今天，"
                        + "**默认排除黑名单人员**（某人查不到时，可传 excludeBlacklist=false 再试一次）。"
                        + "用户问「某人的刷卡记录」「今天 3 楼有什么人进出」时用它。"
                        + "只要总数、不要明细时用 queryAccessLogStats 更省。",
                schema("""
                        ,"limit": { "type": "integer", "description": "最多回几条明细，默认 20，上限 50" }"""),
                CAP_DEBUG_READ, SideEffect.READ,
                (ctx, args) -> {
                    Filter f = Filter.of(args, businessTimeWindow);
                    int limit = Math.min(Math.max(args.path("limit").asInt(20), 1), MAX_ROWS);
                    List<Map<String, Object>> raw =
                            dashboardMapper.getFilteredDebugLogs(f.campus, f.floor, f.keyword,
                                    f.startTime, f.endTime, f.actionType, f.roomName, f.excludeBlacklist,
                                    limit, 0);
                    List<Map<String, Object>> rows = new ArrayList<>();
                    for (Map<String, Object> r : raw == null ? List.<Map<String, Object>>of() : raw) {
                        Map<String, Object> row = new LinkedHashMap<>();
                        row.put("time", firstOf(r, "create_time", "createTime"));
                        row.put("name", firstOf(r, "name", "user_name", "userName"));
                        row.put("action", firstOf(r, "feed_summary_zh", "accessType"));
                        row.put("detail", firstOf(r, "feed_detail_zh"));
                        row.put("area", firstOf(r, "area_name", "areaName"));
                        row.put("room", firstOf(r, "room_name", "roomName"));
                        row.put("group", firstOf(r, "project_group_names", "projectGroupName"));
                        rows.add(row);
                    }
                    Map<String, Object> total = dashboardMapper.getFilteredDebugStats(f.campus, f.floor,
                            f.keyword, f.startTime, f.endTime, f.actionType, f.roomName, f.excludeBlacklist);
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("ok", true);
                    out.put("range", f.describe());
                    out.put("totalMatched", total == null ? null : firstOf(total, "totalLogs"));
                    out.put("returned", rows.size());
                    out.put("logs", rows);
                    if (rows.isEmpty()) {
                        out.put("note", "这个条件下没有流水（换个时间段或去掉过滤再试）");
                    } else if (out.get("totalMatched") != null
                            && String.valueOf(out.get("totalMatched")).compareTo(String.valueOf(rows.size())) > 0) {
                        out.put("note", "结果被截断了，只回了前 " + rows.size() + " 条；要更全请收窄条件");
                    }
                    return out;
                });
    }

    // ── 聚合指标 ──

    private AiTool queryAccessLogStats() {
        return new AiTool(
                "queryAccessLogStats",
                "查门禁流水的聚合指标（总条数、进/出次数、涉及人数等），过滤条件与 queryAccessLogs 一致。"
                        + "用户问「今天一共多少条」「进了多少次」时用它。",
                schema(""),
                CAP_DEBUG_READ, SideEffect.READ,
                (ctx, args) -> {
                    Filter f = Filter.of(args, businessTimeWindow);
                    Map<String, Object> stats = dashboardMapper.getFilteredDebugStats(f.campus, f.floor,
                            f.keyword, f.startTime, f.endTime, f.actionType, f.roomName, f.excludeBlacklist);
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("ok", true);
                    out.put("range", f.describe());
                    out.put("stats", stats == null ? Map.of() : stats);
                    return out;
                });
    }

    // ── 手动同步（写）──

    private AiTool syncAccessLogs() {
        String schema = """
                {
                  "type": "object",
                  "properties": {},
                  "additionalProperties": false
                }""";
        return new AiTool(
                "syncAccessLogs",
                "立刻从大华门禁拉取最新刷卡流水入库（页面「运维 → 同步门禁流水」的同一件事）。"
                        + "只在用户明确说「同步一下流水」「拉一下最新记录」时调；"
                        + "常规查询前**不要**顺手同步一次——它有外部依赖、且要用户点确认。",
                schema, CAP_DEBUG_SYNC, SideEffect.EXTERNAL_WRITE,
                (ctx, args) -> {
                    aroSyncTask.syncAroRecords();
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("ok", true);
                    out.put("note", "已触发同步，流水是后台写入的；稍后再查一次就能看到新记录");
                    return out;
                });
    }

    // ── 过滤条件 ──

    /**
     * 六个过滤字段（两个读工具共用一份，保证两边字段名与说明不会写岔）。
     *
     * <p>{@code extra} 是额外追加的属性片段（queryAccessLogs 用它加 limit），**必须以逗号开头**。
     * 拼完整 JSON 而不是让调用方各写一份「半截 schema + 结尾括号」——半截字符串拼起来少一个
     * 花括号在 Java 里完全合法，只有发出去那一刻才炸（这条正是被 AiToolSchemaJsonTest 逮住的）。
     */
    private static String schema(String extra) {
        return """
                {
                  "type": "object",
                  "properties": {
                    "keyword": { "type": "string", "description": "按人名 / 工号 / 卡号模糊查" },
                    "campus": { "type": "string", "description": "校区，如「浦东」「浦西」" },
                    "floor": { "type": "string", "description": "楼层，如「3F」" },
                    "roomName": { "type": "string", "description": "房间名/房间号" },
                    "startTime": { "type": "string", "description": "起始时间 yyyy-MM-dd 或 yyyy-MM-dd HH:mm:ss；**不传默认今天**" },
                    "endTime": { "type": "string", "description": "结束时间，同上；不传默认今天" },
                    "actionType": { "type": "integer", "enum": [1, 2], "description": "进出方向：1=进，2=出；不传=全部" },
                    "excludeBlacklist": { "type": "boolean", "description": "是否排除黑名单人员的流水，默认 true（与页面一致）" }"""
                + extra + """
                  },
                  "additionalProperties": false
                }""";
    }

    /** 一次查询的过滤条件（已经把「默认今天」与日期补时分秒都算好）。 */
    private static final class Filter {
        String keyword;
        String campus;
        String floor;
        String roomName;
        String startTime;
        String endTime;
        Integer actionType;
        Boolean excludeBlacklist = Boolean.TRUE;

        static Filter of(JsonNode args, BusinessTimeWindow window) {
            Filter f = new Filter();
            f.keyword = text(args, "keyword");
            f.campus = text(args, "campus");
            f.floor = text(args, "floor");
            f.roomName = text(args, "roomName");
            f.startTime = normalize(text(args, "startTime"), " 00:00:00");
            f.endTime = normalize(text(args, "endTime"), " 23:59:59");
            if (f.startTime == null && f.endTime == null) {
                // 与页面一致：默认只查今天（业务日界，不是服务器本地日界）
                String today = window.today().format(DAY);
                f.startTime = today + " 00:00:00";
                f.endTime = today + " 23:59:59";
            }
            JsonNode at = args == null ? null : args.path("actionType");
            f.actionType = at != null && at.isInt() ? at.asInt() : null;
            JsonNode ex = args == null ? null : args.path("excludeBlacklist");
            f.excludeBlacklist = ex == null || ex.isMissingNode() || ex.isNull() ? Boolean.TRUE : ex.asBoolean(true);
            return f;
        }

        /** 只给日期（前端那样）就补全时分秒；已经带了时间的原样用。 */
        private static String normalize(String raw, String suffix) {
            if (raw == null || raw.isBlank()) {
                return null;
            }
            String s = raw.trim().replace('T', ' ');
            return s.length() <= 10 ? s + suffix : s;
        }

        Map<String, Object> describe() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("startTime", startTime);
            m.put("endTime", endTime);
            if (keyword != null) m.put("keyword", keyword);
            if (campus != null) m.put("campus", campus);
            if (floor != null) m.put("floor", floor);
            if (roomName != null) m.put("roomName", roomName);
            if (actionType != null) m.put("actionType", actionType);
            m.put("excludeBlacklist", excludeBlacklist);
            return m;
        }
    }

    private static String text(JsonNode args, String field) {
        JsonNode n = args == null ? null : args.path(field);
        return n == null || !n.isTextual() || n.asText("").isBlank() ? null : n.asText("").trim();
    }

    /** 这几个查询都是 `resultType="map"` 的裸 Map（列名由 SQL 写死，没有 DTO 兜底），列名候选写宽一点。 */
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
