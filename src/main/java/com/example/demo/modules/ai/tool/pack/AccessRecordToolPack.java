package com.example.demo.modules.ai.tool.pack;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.accessfusion.model.AccessAuditFilterParams;
import com.example.demo.modules.accessfusion.service.AccessAuditSourceService;
import com.example.demo.modules.ai.tool.AiTool;
import com.example.demo.modules.ai.tool.AiToolPack;
import com.example.demo.modules.ai.tool.AiView;
import com.example.demo.modules.ai.tool.SideEffect;
import com.example.demo.modules.auth.entity.User;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Predicate;

/**
 * 门禁记录查询（{@code /#/console/admin/dahua-swing-tasks?tab=records} 页面的「门禁记录查询」）工具包。
 *
 * <p>只接这一页的**查询**：查记录、按人/按通道汇总。补全字段、重算受众、清洗配置这些写动作不在这包里。
 *
 * <p>查询走的是页面同一个服务（{@code AccessAuditSourceService}），筛选维度与页面一一对应，
 * 所以「球球查出来的」与「页面上筛出来的」是同一批数据 —— 不再另写一套 SQL。
 *
 * <p>两个口径必须写死在这里，否则答出来的数是错的：
 * <ol>
 *   <li><b>「刷卡失败/违规刷卡」= 开门类型「非法刷卡」（open_type=52）</b>，不是刷卡结果=失败 ——
 *       大华的 open_result 不可靠（卡刷了只是没权限时也可能回 1）；</li>
 *   <li><b>「部门」是门禁侧部门</b>（大华归属类下的部门：学生卡 / 工作人员 / 临时施工卡…），
 *       与人员档案里的部门、课题组**不是一回事**。</li>
 * </ol>
 *
 * <p>本包与「门禁通道控制」包天然联动：从那边查到门名之后可以直接按通道查这扇门的记录；
 * 反过来从记录里问到某扇门要动它，是那个包的事。
 */
@Component
public class AccessRecordToolPack implements AiToolPack {

    /** 与 {@code AdminAccessAuditController#requireAdmin}、页面权限表（门禁记录库 = ADMIN）同口径。 */
    public static final String CAP_ACCESS_RECORD = "ai.dahua.access.record";

    /** 一次最多回几条明细（再多模型也读不过来，要「多少人/多少次」用汇总）。 */
    private static final int MAX_LIST = 200;
    private static final int DEFAULT_LIST = 50;
    /** 汇总一次最多几组。 */
    private static final int MAX_GROUP = 50;
    private static final int DEFAULT_GROUP = 30;

    /** 开门类型：值与页面 {@code OPEN_TYPE_OPTIONS} 一致，键是用户嘴里的说法。 */
    private static final Map<String, Integer> OPEN_TYPES = Map.of(
            "合法刷卡", 51,
            "非法刷卡", 52,
            "远程开门", 48,
            "按钮开门", 49);
    /** 进出方向：大华 enter_or_exit 1/2。 */
    private static final Map<String, Integer> DIRECTIONS = Map.of("进入", 1, "离开", 2);
    /** 刷卡结果：大华 open_result（1 成功 / 0 失败）。 */
    private static final Map<String, Integer> SWIPE_RESULTS = Map.of("成功", 1, "失败", 0);

    private final AccessAuditSourceService auditSourceService;

    public AccessRecordToolPack(AccessAuditSourceService auditSourceService) {
        this.auditSourceService = auditSourceService;
    }

    @Override
    public String packKey() {
        return "accessRecord";
    }

    @Override
    public String displayName() {
        return "门禁记录查询";
    }

    @Override
    public Set<String> routeHints() {
        return Set.of("门禁记录", "刷卡记录", "进出记录", "刷卡失败", "违规刷卡", "记录库", "谁刷卡");
    }

    /** 教职工后台页，学生视角一条都不给（显式声明，别被改宽）。 */
    @Override
    public Set<AiView> views() {
        return Set.of(AiView.STAFF);
    }

    @Override
    public String defaultPrompt() {
        return """
                门禁记录查询的口径（这是「门禁记录库」那一页的数据）：
                - **「刷卡失败」「违规刷卡」「没权限硬刷」= 开门类型「非法刷卡」**，用 openType 参数传「非法刷卡」。
                  不要用「刷卡结果」去答这类问题：大华的刷卡结果字段不可靠（非法刷卡也可能记成成功）。
                  「刷卡结果」只在用户明确问「开门成功没成功」时才用。
                - **「部门」是门禁侧部门**（大华归属类下的：学生卡 / 工作人员 / 临时施工卡 / 学生2F…），
                  不是人员档案里的部门、更不是课题组。用户说的部门如果对不上，把候选值问清楚再查。
                - **时间和人名先问清再查**：用户说「最近几天」而没给准数时，按最近 3 天查，并**在回答里说明你查的是哪一段**；
                  说了具体日期就照他说的。
                - **要「多少人 / 多少次 / 谁」就用 summarizeAccessRecords**（按人或按通道汇总，聚合在服务端做）。
                  查明细那个工具是**截断**返回的，拿它的前几条自己数人数会数少，工具会提示你这一点。
                - 查不到就如实说这段时间没有记录，不要凭印象说「有人违规」；也不要为了凑出结果悄悄放宽时间。
                - 通道名可以直接用用户在上一句里提到的门（比如刚在门禁控制那边查过/开过的那扇）：
                  传通道名的片段即可（「大厅」能匹配到「大厅-137-MK02-MJ02」）。要**动**那扇门是门禁控制包的事。""";
    }

    @Override
    public Map<String, Predicate<User>> capabilities() {
        return Map.of(CAP_ACCESS_RECORD, user -> level(user) >= RoleEnum.ADMIN.getLevel());
    }

    @Override
    public List<AiTool> tools() {
        return List.of(queryRecords(), summarizeRecords());
    }

    // ── 工具 ──

    private AiTool queryRecords() {
        return new AiTool(
                "queryAccessRecords",
                "按条件查门禁刷卡记录明细（时间倒序）。条件：通道、姓名、工号、门禁侧部门、开门类型、刷卡结果、进出方向、时间段。"
                        + "**明细是截断返回的**，要统计「多少人/多少次」请改用 summarizeAccessRecords。",
                filterSchema(50, 200),
                CAP_ACCESS_RECORD,
                SideEffect.READ,
                (ctx, args) -> {
                    Parsed parsed = parse(args, DEFAULT_LIST, MAX_LIST);
                    if (parsed.error != null) {
                        return parsed.error;
                    }
                    int limit = parsed.limit;
                    Map<String, Object> page = auditSourceService.previewSwing(parsed.filter, 1, limit);
                    @SuppressWarnings("unchecked")
                    List<Map<String, Object>> rows = (List<Map<String, Object>>) page.getOrDefault("data", List.of());
                    int total = intOf(page.get("total"));

                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("ok", true);
                    out.put("total", total);
                    List<Map<String, Object>> records = new ArrayList<>();
                    for (Map<String, Object> row : rows) {
                        records.add(toRecord(row));
                    }
                    out.put("records", records);
                    if (records.isEmpty()) {
                        out.put("note", "这个条件下一条记录都没有。如实说这段时间没有记录，别猜有人违规；"
                                + "时间范围给窄了可以问用户要不要放宽。");
                    } else if (total > records.size()) {
                        out.put("note", "共 " + total + " 条，这里是时间倒序的前 " + records.size()
                                + " 条。**要数人数/次数请用 summarizeAccessRecords**，拿这几条自己数会数少。");
                    }
                    return out;
                });
    }

    private AiTool summarizeRecords() {
        return new AiTool(
                "summarizeAccessRecords",
                "按条件把门禁记录**汇总**：默认按人分组，返回每人刷了多少次、其中非法刷卡几次、最早/最晚时间；"
                        + "groupBy=channel 则按通道分组。用来回答「最近几天谁刷卡失败」「大厅都有谁进出」这类问题。",
                filterSchema(30, 50),
                CAP_ACCESS_RECORD,
                SideEffect.READ,
                (ctx, args) -> {
                    Parsed parsed = parse(args, DEFAULT_GROUP, MAX_GROUP);
                    if (parsed.error != null) {
                        return parsed.error;
                    }
                    int limit = parsed.limit;
                    String groupBy = text(args, "groupBy").equalsIgnoreCase("channel") ? "channel" : "person";
                    List<Map<String, Object>> rows = auditSourceService.summarizeSwing(parsed.filter, groupBy, limit);
                    int matched = auditSourceService.countSwing(parsed.filter);

                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("ok", true);
                    out.put("groupBy", groupBy);
                    out.put("matchedSwings", matched);
                    List<Map<String, Object>> groups = new ArrayList<>();
                    for (Map<String, Object> row : rows) {
                        groups.add(toGroup(row, groupBy));
                    }
                    out.put("groups", groups);
                    if (groups.isEmpty()) {
                        out.put("note", "这个条件下没有记录，也就没有人可以排。如实说没有，不要编名字。");
                    } else if (matched == 0) {
                        // 理论上到不了（有组就有记录），留着是为了「聚合与计数不同源」时能立刻看出来
                        out.put("note", "汇总与计数对不上（计数为 0 但有分组），请把这句如实告诉用户并让他去页面上核。");
                    } else {
                        List<String> notes = new ArrayList<>();
                        if (groups.size() >= limit) {
                            notes.add("只列了次数最多的 " + groups.size() + " 组，可能还有更多 —— 缩小时间范围或加筛选再看。");
                        }
                        if ("person".equals(groupBy) && hasRepeatedLabel(groups)) {
                            // 一个人名下可能挂多张卡/多个工号（按工号分行）—— 不加这句，模型会把他当成好几个人报
                            notes.add("同名可能分成多行（一个人挂多张卡/多个工号）。要报「某人一共几次」就把同名各行相加，"
                                    + "并在回答里说明你是合计的。");
                        }
                        if (!notes.isEmpty()) {
                            out.put("note", String.join(" ", notes));
                        }
                    }
                    return out;
                });
    }

    // ── 参数 ──

    private String filterSchema(int defaultLimit, int maxLimit) {
        return """
                {
                  "type": "object",
                  "properties": {
                    "channel": { "type": "string", "description": "通道名称或编码的片段（模糊匹配），例如「大厅」" },
                    "personName": { "type": "string", "description": "姓名片段（模糊匹配）" },
                    "jobNumber": { "type": "string", "description": "工号（精确匹配）" },
                    "department": { "type": "string", "description": "门禁侧部门（大华归属类下的部门名或部门ID片段，如「学生卡」「工作人员」「临时施工卡」）——不是人员档案里的部门/课题组" },
                    "openType": { "type": "string", "enum": ["合法刷卡", "非法刷卡", "远程开门", "按钮开门"],
                                  "description": "开门类型。「刷卡失败/违规刷卡」用「非法刷卡」" },
                    "swipeResult": { "type": "string", "enum": ["成功", "失败"], "description": "刷卡结果（只在用户明确问成功没成功时用）" },
                    "direction": { "type": "string", "enum": ["进入", "离开"], "description": "进出方向" },
                    "from": { "type": "string", "description": "开始时间 yyyy-MM-dd HH:mm:ss；只给日期按当天 00:00:00 起算" },
                    "to": { "type": "string", "description": "结束时间 yyyy-MM-dd HH:mm:ss；只给日期按当天 23:59:59 止" },
                    "limit": { "type": "integer", "description": "最多返回几条/几组，默认 %d，上限 %d" }
                  },
                  "additionalProperties": false
                }""".formatted(defaultLimit, maxLimit);
    }

    /** 解析结果：要么是筛好的条件，要么是要回给模型的一句「这个值我不认识」。 */
    private record Parsed(AccessAuditFilterParams filter, int limit, Map<String, Object> error) {
    }

    private Parsed parse(JsonNode args, int defaultLimit, int maxLimit) {
        List<String> unknown = new ArrayList<>();
        Integer openType = code(OPEN_TYPES, text(args, "openType"), "开门类型", unknown);
        Integer direction = code(DIRECTIONS, text(args, "direction"), "进出方向", unknown);
        Integer swipeResult = code(SWIPE_RESULTS, text(args, "swipeResult"), "刷卡结果", unknown);
        if (!unknown.isEmpty()) {
            Map<String, Object> err = new LinkedHashMap<>();
            err.put("ok", false);
            err.put("reason", "这些筛选值不认识：" + String.join("、", unknown) + "。让用户从有效值里挑，别自己换个近似的");
            err.put("allowed", Map.of(
                    "开门类型", OPEN_TYPES.keySet(),
                    "进出方向", DIRECTIONS.keySet(),
                    "刷卡结果", SWIPE_RESULTS.keySet()));
            return new Parsed(null, defaultLimit, err);
        }
        String from = normalizeTime(text(args, "from"), false);
        String to = normalizeTime(text(args, "to"), true);
        if (from != null && to != null && from.compareTo(to) > 0) {
            return new Parsed(null, defaultLimit, Map.of("ok", false,
                    "reason", "开始时间比结束时间还晚（" + from + " > " + to + "），先跟用户核一下时间段"));
        }
        AccessAuditFilterParams filter = new AccessAuditFilterParams(
                null,
                null,
                nullIfEmpty(text(args, "jobNumber")),
                nullIfEmpty(text(args, "personName")),
                openType,
                direction,
                from,
                to,
                false,
                false,
                nullIfEmpty(text(args, "channel")),
                null,
                nullIfEmpty(text(args, "department")),
                swipeResult,
                null,
                null);
        int limit = clamp(args.path("limit").asInt(defaultLimit), 1, maxLimit);
        return new Parsed(filter, limit, null);
    }

    /**
     * 枚举值 → 码值。
     *
     * <p>认不出来就记下来、**整条不查**：把不认识的筛选悄悄丢掉等于拿一个更宽的条件去答，
     * 用户看到的是「查不到 / 数不对」，而不是「这个词我不认识」。
     */
    private static Integer code(Map<String, Integer> dict, String raw, String label, List<String> unknown) {
        if (raw.isEmpty()) {
            return null;
        }
        Integer hit = dict.get(raw);
        if (hit != null) {
            return hit;
        }
        if (raw.matches("\\d+")) {
            int n = Integer.parseInt(raw);
            if (dict.containsValue(n)) {
                return n;
            }
        }
        unknown.add(label + "「" + raw + "」");
        return null;
    }

    /** 时间参数：只给日期时按当天首/末补齐，与页面 datetime-local 的补法一致。 */
    private static String normalizeTime(String raw, boolean endOfDay) {
        if (raw.isEmpty()) {
            return null;
        }
        String v = raw.trim().replace('T', ' ');
        if (v.length() == 10) {
            return v + (endOfDay ? " 23:59:59" : " 00:00:00");
        }
        return v.length() == 16 ? v + ":00" : v;
    }

    // ── 输出 ──

    private static Map<String, Object> toRecord(Map<String, Object> view) {
        Map<String, Object> it = new LinkedHashMap<>();
        it.put("time", str(view.get("swingTime")));
        it.put("person", str(view.get("personName")));
        it.put("jobNumber", str(view.get("personCode")));
        it.put("department", str(view.get("departmentName")));
        it.put("channel", str(view.get("channelName")));
        it.put("openType", str(view.get("openTypeLabel")));
        it.put("result", str(view.get("openResultLabel")));
        it.put("direction", str(view.get("enterOrExitLabel")));
        it.put("audience", str(view.get("audienceLabel")));
        return it;
    }

    /** 分组里有重名吗（同一个人挂了多张卡就会同名多行）。 */
    private static boolean hasRepeatedLabel(List<Map<String, Object>> groups) {
        Set<Object> seen = new HashSet<>();
        for (Map<String, Object> g : groups) {
            if (!seen.add(g.get("label"))) {
                return true;
            }
        }
        return false;
    }

    private static Map<String, Object> toGroup(Map<String, Object> row, String groupBy) {        Map<String, Object> it = new LinkedHashMap<>();
        String label = str(row.get("groupLabel"));
        String key = str(row.get("groupKey"));
        it.put("label", label.isEmpty() ? (key.isEmpty() ? "（未识别）" : key) : label);
        it.put("swings", intOf(row.get("swingCount")));
        it.put("illegal", intOf(row.get("illegalCount")));
        it.put("failed", intOf(row.get("failedCount")));
        it.put("firstAt", str(row.get("firstAt")));
        it.put("lastAt", str(row.get("lastAt")));
        if ("person".equals(groupBy)) {
            it.put("jobNumber", key);
            it.put("department", str(row.get("departmentName")));
        } else {
            it.put("channelCode", key);
        }
        return it;
    }

    // ── 杂项 ──

    private static int level(User user) {
        RoleEnum role = user == null || user.getRole() == null ? RoleEnum.MEMBER : user.getRole();
        return role.getLevel();
    }

    private static int clamp(int value, int min, int max) {
        return Math.min(Math.max(value, min), max);
    }

    private static int intOf(Object o) {
        if (o instanceof Number n) {
            return n.intValue();
        }
        try {
            return o == null ? 0 : Integer.parseInt(String.valueOf(o).trim());
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private static String text(JsonNode args, String field) {
        JsonNode node = args == null ? null : args.path(field);
        return node == null || !node.isTextual() ? "" : node.asText("").trim();
    }

    private static String nullIfEmpty(String s) {
        return s == null || s.isEmpty() ? null : s;
    }

    private static String str(Object o) {
        if (o == null) {
            return "";
        }
        String s = String.valueOf(o).trim();
        return "null".equalsIgnoreCase(s) ? "" : s;
    }
}
