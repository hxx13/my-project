package com.example.demo.modules.ai.tool.pack;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.ai.tool.AiTool;
import com.example.demo.modules.ai.tool.AiToolPack;
import com.example.demo.modules.ai.tool.AiView;
import com.example.demo.modules.ai.tool.SideEffect;
import com.example.demo.modules.analytics.service.StudentActivityService;
import com.example.demo.modules.analytics.service.StudentActivitySnapshotService;
import com.example.demo.modules.auth.entity.User;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Predicate;

/**
 * 学生活跃度统计（{@code /#/console/admin/analytics?report=student_activity}）的工具包。
 *
 * <p>只覆盖统计页里**「学生活跃度统计」这一个 tab** —— 同页的隔离器统计 / 笼架统计 / 订购统计
 * **不属于本包**（用户明确只要这一块）。
 *
 * <h2>数据与口径</h2>
 * 全部走页面上那几个方法（{@link StudentActivityService}），所以行数、人均、占比与页面**同源**，
 * 不会出现「助手说的和页面对不上」。指标一律照工具返回的原样报，**不要自己加总或换算**。
 *
 * <p><b>时间口径照页面</b>：页面的时间预设（昨日 / 本周 / 本月 / 上周 / 上月）里，
 * 结束日期取的**都是昨天**（`23:59:59`），**不含今天**。用户说「本周 / 本月」时按这个口径算，
 * 否则助手报的数会比页面多一天的量。
 *
 * <h2>视角与能力</h2>
 * 页面在权限表里是 **STAFF**（不是 ADMIN）：{@link #views()} 声明 {@link AiView#STAFF}，
 * 能力码同为 STAFF 起。学生端另有自己的活跃度看板，不在本包范围。
 *
 * <h2>「查某一个人」怎么走</h2>
 * 服务端只有**课题组维度**的查询，没有「按人查」。所以用户报**人名**时：先用人员检索工具
 * （common 包那个 searchPerson）查到他的**课题组**，再按课题组查，并用本包的 personName 参数
 * **只报他那一行、并给出他在组内的排名**。人员解析**复用 common 包**，本包不另写一套
 * （网关设计 §6.2：人员/课题组解析是所有场景的公共前置，不重复实现）。
 */
@Component
public class StudentActivityToolPack implements AiToolPack {

    /** 与页面权限表同口径：{@code /admin/analytics} 是 STAFF。 */
    public static final String CAP_STUDENT_ACTIVITY = "ai.analytics.studentActivity";

    /** 详情默认回几行，上限 50。 */
    private static final int DEFAULT_ROWS = 20;
    private static final int MAX_ROWS = 50;
    /** 按人查时要扫全组成员（服务端先算全量再分页，这里要足够大才筛得到人）。 */
    private static final int MEMBER_SCAN = 2000;
    /**
     * 重算天数上限。
     *
     * <p>**上限压到 30 天**是因为这个重算在服务端是**同步**跑的（一天一天循环算，
     * 不是丢给后台）：天数越多，这一轮对话就卡得越久，而网关单次请求有超时。
     * 30 天正好是一次「把最近一个月补齐」的常见诉求，也贴着每日定时任务的口径。
     */
    private static final int MAX_RECALC_DAYS = 30;

    private static final Set<String> SORTS = Set.of("entries", "totalDurationMinutes", "weeklyAvgFreq", "lastActiveDate");
    private static final Set<String> CAMPUS = Set.of("all", "浦东", "浦西");

    private final StudentActivityService activityService;
    private final StudentActivitySnapshotService snapshotService;

    public StudentActivityToolPack(StudentActivityService activityService,
                                   StudentActivitySnapshotService snapshotService) {
        this.activityService = activityService;
        this.snapshotService = snapshotService;
    }

    @Override
    public String packKey() {
        return "studentActivity";
    }

    @Override
    public String displayName() {
        return "学生活跃度统计";
    }

    /** 教职工后台的统计页。显式声明（默认也是 STAFF，安全相关的声明写出来才可审计）。 */
    @Override
    public Set<AiView> views() {
        return Set.of(AiView.STAFF);
    }

    @Override
    public Set<String> routeHints() {
        // 用户对这个 tab 的说法：活跃度 / 到馆 / 进馆 / 出勤。
        // 「统计与审计」是页面名，太宽，别当路由词（同页还有三个别的统计）。
        return Set.of("活跃度", "学生活跃", "到馆", "进馆", "出馆", "出勤", "课题组活跃", "studentActivity");
    }

    @Override
    public String defaultPrompt() {
        return """
                学生活跃度统计（#/console/admin/analytics 里的「学生活跃度统计」tab）的口径：
                - 这个 tab 看的是**课题组维度**：每组多少人、来了多少人次、人均每周来几次、活跃人数占比；
                  点进一个组还有**成员明细**（按人次 / 时长 / 周频次 / 最后活跃排序）、
                  **时段热力**（哪天哪几个小时最挤）、**日趋势**、**房间进出排行**。
                - **时间口径照页面**：页面的「昨日 / 本周 / 本月 / 上周 / 上月」**结束都取到昨天 23:59:59**，
                  **不含今天**。用户说「本周/本月」时按这个口径算 —— 把今天算进去会跟页面对不上。
                  用户没说时间段就先问，别默认一个（不同区间结论完全不同）。
                - **用户报的是人名时**：先用 searchPerson 查到他的**课题组**，再用本包按组查，
                  并把 personName 一起传上（这样只报他那一行 + 他在组内的排名）。
                  **不要**自己编一个课题组名去套。
                - **用户报的是课题组**：名字要用平台里的**全称**（如「卢今的课题组」）；
                  不确定时先用 listStudentActivityGroups 的 keyword 查候选，别拿用户原话硬传。
                - 校区筛选取值：全部 / 浦东 / 浦西；不传就是全部。
                - 人数、人次、人均频次、活跃占比、排名**一律照工具返回的原样报**，不要自己加总或换算；
                  报结论时**带上统计区间**（如「上周（9/29–10/5）」），否则数字没有意义。
                - 查不到数据要**如实说「这个区间没有记录」**，不要用「大家都不太活跃」这种话糊过去
                  （很可能是区间选错、或者快照还没算完）。
                - 数据明显过期时才用 recalculateStudentActivity 触发重算（最近 30 天以内）—— 那一步是
                  **同步**跑的全站重算，返回时就已经算完，可以直接再查；但别拿它当日常操作。""";
    }

    @Override
    public Map<String, Predicate<User>> capabilities() {
        return Map.of(CAP_STUDENT_ACTIVITY, user -> user.getRole() != null
                && user.getRole().getLevel() >= RoleEnum.STAFF.getLevel());
    }

    @Override
    public List<AiTool> tools() {
        return List.of(listGroups(), queryActivity(), queryHabits(), listRoomUsage(), recalculate());
    }

    // ── 一、找课题组（入口） ──

    private AiTool listGroups() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "keyword": { "type": "string", "description": "按课题组名片段筛（用户报的名字不确定写法时用它）" },
                    "from": { "type": "string", "description": "起始日期 yyyy-MM-dd（含当天 00:00:00）" },
                    "to": { "type": "string", "description": "结束日期 yyyy-MM-dd（含当天 23:59:59）" },
                    "campus": { "type": "string", "enum": ["all","浦东","浦西"], "description": "校区，默认全部" },
                    "limit": { "type": "integer", "description": "最多回几个课题组，默认 20，上限 50" }
                  },
                  "required": ["from", "to"],
                  "additionalProperties": false
                }""";
        return new AiTool(
                "listStudentActivityGroups",
                "列**有记录的课题组**及其活跃度概况（人数、总人次、人均每周频次、活跃人数占比），按人次降序。"
                        + "用户说「哪个课题组最活跃」或报的组名不确定写法时用它；确认组名后再用 queryStudentActivity 看细节。",
                schema, CAP_STUDENT_ACTIVITY, SideEffect.READ,
                (ctx, args) -> {
                    String from = date(args, "from");
                    String to = date(args, "to");
                    if (from.isEmpty() || to.isEmpty()) {
                        return Map.of("ok", false, "reason", "没说时间段。先问用户要看哪一段（昨日/本周/本月/上周/上月，或具体日期）");
                    }
                    String kw = text(args, "keyword");
                    String campus = campus(args);
                    int limit = clamp(args.path("limit").asInt(DEFAULT_ROWS), 1, MAX_ROWS);
                    Map<String, Object> data = activityService.listGroupsPaged(
                            kw.isEmpty() ? null : kw, fromStart(from), toEnd(to), 1, limit, campus);
                    List<Map<String, Object>> groups = asMapList(data == null ? null : data.get("groups"));
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("ok", true);
                    out.put("range", from + " ~ " + to);
                    out.put("campus", campus);
                    out.put("matchedTotal", data == null ? groups.size() : data.get("total"));
                    out.put("groups", groups);
                    if (groups.isEmpty()) {
                        out.put("note", "这个区间没有课题组记录。**如实说没有记录**，并提示可能是区间选错或快照未算；"
                                + "可以换区间或先 listStudentActivityGroups 不带关键词看一眼");
                    }
                    return out;
                });
    }

    // ── 二、某组 / 某人的活跃度（KPI + 成员明细） ──

    private AiTool queryActivity() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "group": { "type": "string", "description": "课题组全称（如「卢今的课题组」）" },
                    "from": { "type": "string", "description": "起始日期 yyyy-MM-dd" },
                    "to": { "type": "string", "description": "结束日期 yyyy-MM-dd（照页面口径，一般取到昨天）" },
                    "campus": { "type": "string", "enum": ["all","浦东","浦西"], "description": "校区，默认全部" },
                    "personName": { "type": "string", "description": "只想看**某一个人**时传他的名字 —— 结果只报他那一行，并给出他在组内的排名" },
                    "sortBy": { "type": "string", "enum": ["entries","totalDurationMinutes","weeklyAvgFreq","lastActiveDate"], "description": "按什么排：进馆人次 / 停留时长 / 每周频次 / 最后活跃，默认人次" },
                    "order": { "type": "string", "enum": ["desc","asc"], "description": "默认 desc（最活跃在前）；查「最不活跃的」用 asc" },
                    "limit": { "type": "integer", "description": "最多回几个成员，默认 20，上限 50" }
                  },
                  "required": ["group", "from", "to"],
                  "additionalProperties": false
                }""";
        return new AiTool(
                "queryStudentActivity",
                "看**某个课题组（或其中某个人）**的活跃度：课题组 KPI 汇总 + 成员明细（进馆人次、停留时长、"
                        + "日均/周均频次、经验档位、最后活跃日期）。"
                        + "用户问「某组活跃度怎么样」「谁最活跃」「张三最近来过没」用它。"
                        + "**要看某天哪几个小时最挤 / 房间都去哪，是用 queryStudentActivityHabits 和 listStudentActivityRoomUsage**。",
                schema, CAP_STUDENT_ACTIVITY, SideEffect.READ,
                (ctx, args) -> {
                    String group = text(args, "group");
                    String from = date(args, "from");
                    String to = date(args, "to");
                    if (group.isEmpty()) {
                        return Map.of("ok", false, "reason", "没说哪个课题组。用户报的是人名时，"
                                + "先用 searchPerson 查到他的课题组，再用 group 参数调本工具");
                    }
                    if (from.isEmpty() || to.isEmpty()) {
                        return Map.of("ok", false, "reason", "没说时间段。先问用户要看哪一段");
                    }
                    String sortBy = enumOr(args, "sortBy", SORTS, "entries");
                    String order = "asc".equalsIgnoreCase(text(args, "order")) ? "asc" : "desc";
                    String person = text(args, "personName");
                    int limit = clamp(args.path("limit").asInt(DEFAULT_ROWS), 1, MAX_ROWS);

                    // 按人查要扫全组（服务端先算全量再分页），否则排在后面的那个人筛不到
                    int size = person.isEmpty() ? limit : MEMBER_SCAN;
                    Map<String, Object> data = activityService.queryMemberActivity(
                            group, fromStart(from), toEnd(to), sortBy, order, 1, size);
                    List<Map<String, Object>> members = asMapList(data == null ? null : data.get("members"));

                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("ok", true);
                    out.put("group", group);
                    out.put("range", from + " ~ " + to);
                    out.put("sortBy", sortBy);
                    out.put("order", order);
                    out.put("summary", data == null ? null : data.get("summary"));
                    if (person.isEmpty()) {
                        boolean truncated = members.size() > limit;
                        out.put("memberTotal", data == null ? members.size() : data.get("total"));
                        out.put("members", truncated ? new ArrayList<>(members.subList(0, limit)) : members);
                        out.put("orderNote", "order=desc 是「最活跃在前」，order=asc 是「最不活跃在前」");
                        if (members.isEmpty()) {
                            out.put("note", "这个区间该课题组没有成员记录。**如实说没有记录**，别编");
                        } else if (truncated) {
                            out.put("note", "组内共 " + members.size() + " 人，这里只回了前 " + limit + " 人 —— 报的时候要说清");
                        }
                    } else {
                        int idx = -1;
                        for (int i = 0; i < members.size(); i++) {
                            if (person.equalsIgnoreCase(str(members.get(i).get("userName")))) {
                                idx = i;
                                break;
                            }
                        }
                        if (idx < 0) {
                            out.put("ok", false);
                            out.put("reason", "这个课题组里没有叫「" + person + "」的成员。"
                                    + "**如实说没找到**（可能是组名不对、名字写法不同，或他不属于这个组），"
                                    + "别拿组里的别人顶上");
                            out.put("groupMemberTotal", members.size());
                            return out;
                        }
                        out.put("person", members.get(idx));
                        out.put("rankInGroup", idx + 1);
                        out.put("rankBasis", "按 " + sortBy + " 排的组内名次（第 " + (idx + 1) + " 名 / 共 "
                                + members.size() + " 人）");
                        out.put("note", "这是「" + person + "」本人在该课题组内的活跃度，排名按上面 sortBy 的口径算");
                    }
                    return out;
                });
    }

    // ── 三、作息：时段热力 + 日趋势 ──

    private AiTool queryHabits() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "group": { "type": "string", "description": "课题组全称" },
                    "from": { "type": "string", "description": "起始日期 yyyy-MM-dd" },
                    "to": { "type": "string", "description": "结束日期 yyyy-MM-dd" },
                    "maxCells": { "type": "integer", "description": "热力网格最多回几格（按人数降序），默认 24，上限 50" }
                  },
                  "required": ["group", "from", "to"],
                  "additionalProperties": false
                }""";
        return new AiTool(
                "queryStudentActivityHabits",
                "看某个课题组的**作息**：哪几天、哪几个小时人最多（时段热力），以及逐日的进出趋势。"
                        + "用户问「他们一般什么时候来」「周几最挤」「最近趋势是涨还是跌」用它。"
                        + "**注意热力只统计进入、不含离开**。",
                schema, CAP_STUDENT_ACTIVITY, SideEffect.READ,
                (ctx, args) -> {
                    String group = text(args, "group");
                    String from = date(args, "from");
                    String to = date(args, "to");
                    if (group.isEmpty() || from.isEmpty() || to.isEmpty()) {
                        return Map.of("ok", false, "reason", "要课题组和时间段都要给（用户报人名时先用 searchPerson 查他的课题组）");
                    }
                    int maxCells = clamp(args.path("maxCells").asInt(24), 1, MAX_ROWS);
                    List<Map<String, Object>> heat = activityService.heatmap(group, fromStart(from), toEnd(to));
                    List<Map<String, Object>> trend = activityService.dailyTrend(group, fromStart(from), toEnd(to));
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("ok", true);
                    out.put("group", group);
                    out.put("range", from + " ~ " + to);
                    out.put("heatmapTotal", heat == null ? 0 : heat.size());
                    out.put("heatmap", heat == null ? List.of() : (heat.size() > maxCells
                            ? new ArrayList<>(heat.subList(0, maxCells)) : heat));
                    out.put("dailyTrend", trend == null ? List.of() : trend);
                    out.put("note", "热力图按人数降序，只回了前 " + Math.min(maxCells, heat == null ? 0 : heat.size())
                            + " 格（共 " + (heat == null ? 0 : heat.size()) + " 格）。**只统计进入，不含离开**；"
                            + "热力格与日趋势的窗口都是上面这个区间。数据为空就如实说没有记录");
                    return out;
                });
    }

    // ── 四、房间进出排行 ──

    private AiTool listRoomUsage() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "group": { "type": "string", "description": "课题组全称" },
                    "from": { "type": "string", "description": "起始日期 yyyy-MM-dd" },
                    "to": { "type": "string", "description": "结束日期 yyyy-MM-dd" },
                    "limit": { "type": "integer", "description": "最多回几个房间，默认 15，上限 50" }
                  },
                  "required": ["group", "from", "to"],
                  "additionalProperties": false
                }""";
        return new AiTool(
                "listStudentActivityRoomUsage",
                "某个课题组**常去哪些房间**（按进入次数排行）。用户问「他们主要在哪活动」用它。"
                        + "只统计进入。",
                schema, CAP_STUDENT_ACTIVITY, SideEffect.READ,
                (ctx, args) -> {
                    String group = text(args, "group");
                    String from = date(args, "from");
                    String to = date(args, "to");
                    if (group.isEmpty() || from.isEmpty() || to.isEmpty()) {
                        return Map.of("ok", false, "reason", "要课题组和时间段都要给");
                    }
                    int limit = clamp(args.path("limit").asInt(15), 1, MAX_ROWS);
                    List<Map<String, Object>> rows = activityService.roomUsage(group, fromStart(from), toEnd(to));
                    boolean truncated = rows != null && rows.size() > limit;
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("ok", true);
                    out.put("group", group);
                    out.put("range", from + " ~ " + to);
                    out.put("roomsTotal", rows == null ? 0 : rows.size());
                    out.put("rooms", rows == null ? List.of() : (truncated
                            ? new ArrayList<>(rows.subList(0, limit)) : rows));
                    if (rows == null || rows.isEmpty()) {
                        out.put("note", "这个区间没有房间进出记录。**如实说没有记录**，别编");
                    } else if (truncated) {
                        out.put("note", "共 " + rows.size() + " 个房间，这里只回了前 " + limit + " 个");
                    }
                    return out;
                });
    }

    // ── 五、重算快照（唯一写操作） ──

    private AiTool recalculate() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "daysBack": { "type": "integer", "description": "重算最近多少天，默认 30，上限 180" }
                  },
                  "additionalProperties": false
                }""";
        return new AiTool(
                "recalculateStudentActivity",
                "触发**全量重算**学生活跃度快照（最近 N 天，**上限 30 天**）。只在数据明显过期、跟流水对不上时用。"
                        + "**这一步是同步跑的**：返回时就已经算完了，所以让它等一下再查即可 —— "
                        + "但天数越多这一轮越慢，别拿它当日常操作。调用后会挂起等用户点确认。",
                schema, CAP_STUDENT_ACTIVITY, SideEffect.EXTERNAL_WRITE,
                (ctx, args) -> {
                    int days = clamp(args.path("daysBack").asInt(30), 1, MAX_RECALC_DAYS);
                    LocalDate to = LocalDate.now().minusDays(1);
                    LocalDate from = to.minusDays(days - 1L);
                    try {
                        snapshotService.recomputeRange(from, to);
                    } catch (RuntimeException e) {
                        return Map.of("ok", false, "reason", "重算失败：" + e.getMessage());
                    }
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("ok", true);
                    out.put("from", from.toString());
                    out.put("to", to.toString());
                    out.put("note", "确认已收到并已生效：" + from + " ~ " + to
                            + " 的快照**已经重算完**（这一步是同步的，返回即算完）。"
                            + "可以直接再查一次那个区间；查出来的还是空，就说明那几天确实没有进出记录");
                    return out;
                },
                null,
                a -> "重算最近 " + clamp(a.path("daysBack").asInt(30), 1, MAX_RECALC_DAYS)
                        + " 天的学生活跃度快照（全站，同步执行）");
    }

    // ── 杂项 ──

    /** 日期参数：取 yyyy-MM-dd 那一段（用户/模型可能带时间，多出来的截掉）。 */
    private static String date(JsonNode args, String field) {
        String v = text(args, field).trim();
        if (v.isEmpty()) {
            return "";
        }
        return v.length() > 10 ? v.substring(0, 10) : v;
    }

    private static String fromStart(String day) {
        return day + " 00:00:00";
    }

    /** 结束日期补到当天 23:59:59 —— 与页面口径一致。 */
    private static String toEnd(String day) {
        return day + " 23:59:59";
    }

    private static String campus(JsonNode args) {
        String v = text(args, "campus").trim();
        return CAMPUS.contains(v) ? v : "all";
    }

    private static String enumOr(JsonNode args, String field, Set<String> allowed, String fallback) {
        String v = text(args, field).trim();
        return allowed.contains(v) ? v : fallback;
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> asMapList(Object raw) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (raw instanceof List<?> list) {
            for (Object o : list) {
                if (o instanceof Map<?, ?> m) {
                    out.add((Map<String, Object>) m);
                }
            }
        }
        return out;
    }

    private static String text(JsonNode args, String field) {
        JsonNode n = args == null ? null : args.path(field);
        return n == null || !n.isTextual() ? "" : n.asText("").trim();
    }

    private static String str(Object o) {
        return o == null ? "" : String.valueOf(o).trim();
    }

    private static int clamp(int v, int min, int max) {
        return Math.min(Math.max(v, min), max);
    }
}
