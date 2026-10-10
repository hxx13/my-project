package com.example.demo.modules.ai.tool.pack;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.ai.tool.AiChoices;
import com.example.demo.modules.ai.tool.AiTool;
import com.example.demo.modules.ai.tool.AiToolPack;
import com.example.demo.modules.ai.tool.SideEffect;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.telemetry.dto.longterm.TelemetryLongtermBundleOptionDto;
import com.example.demo.modules.telemetry.dto.longterm.TelemetryLongtermCandidateDto;
import com.example.demo.modules.telemetry.dto.longterm.TelemetryLongtermPlanDto;
import com.example.demo.modules.telemetry.dto.longterm.TelemetryLongtermQueryPageDto;
import com.example.demo.modules.telemetry.dto.longterm.TelemetryLongtermSampleDto;
import com.example.demo.modules.telemetry.dto.longterm.TelemetryLongtermSampleLogDto;
import com.example.demo.modules.telemetry.dto.longterm.TelemetryLongtermVariableDto;
import com.example.demo.modules.telemetry.service.TelemetryLongtermArchiveService;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Component;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Predicate;

/**
 * 变量长期归档（{@code /#/console/admin/telemetry-longterm}）的工具包。
 *
 * <p>这里存的是从 WinCC 变量按定时节奏做的**瞬时采样**，单表按月分组长期留存。四件会答错的事：
 * <ul>
 *   <li>采样是**瞬时值**，不是区间统计 —— 相邻两条记录之间没有「平均/累计」。</li>
 *   <li>表里空白 = 当时没采到（采集不可达 / 快照过旧 / 未选变量），不是 0，也不是「设备停了」。</li>
 *   <li>别把整月明细念给模型 —— 摘要（条数 / 时间范围 / 每变量 min/max/avg/last）走
 *       {@code queryLongtermSamples}，明细走 {@code exportLongtermTable}。</li>
 *   <li>变量顺序就是宽表导出的列序，调整顺序要交代清楚它会影响导出。</li>
 * </ul>
 *
 * <p>写操作（增删变量 / 调顺序 / 导出）都是 C 级 —— 服务端挂起等用户点确认。门槛与页面同档
 * （ADMIN 起），不更松也不更严。
 */
@Component
public class TelemetryLongtermToolPack implements AiToolPack {

    public static final String CAP_LONGTERM_READ = "ai.telemetry.longterm.read";
    public static final String CAP_LONGTERM_WRITE = "ai.telemetry.longterm.write";

    /** 候选一次最多回几行（模型读不动整份目录，也费 token）。 */
    private static final int MAX_ROWS = 40;
    /** 摘要最多取多少条采样来算 min/max/avg/last（一页最多 200，这里分页凑）。 */
    private static final int SUMMARY_DEFAULT_LIMIT = 500;
    private static final int SUMMARY_MAX_LIMIT = 2000;

    private final TelemetryLongtermArchiveService service;

    public TelemetryLongtermToolPack(TelemetryLongtermArchiveService service) {
        this.service = service;
    }

    @Override
    public String packKey() {
        return "telemetryLongterm";
    }

    @Override
    public String displayName() {
        // 入口名与页面一致（用户 2026-10-10 定的口径：叫「数据监测」更好口头描述、大模型更容易命中）
        return "数据监测";
    }

    @Override
    public Set<String> routeHints() {
        return Set.of("数据监测", "监测数据", "长期归档", "长期存储", "归档变量", "采样", "定时存", "长期数据");
    }

    @Override
    public String defaultPrompt() {
        return """
                数据监测（入口名也叫「数据监测」，页面 /#/console/admin/telemetry-longterm）的口径：
                - 这里存的是**瞬时采样值**，不是区间统计 —— 两条相邻记录之间没有「平均/累计」，
                  别说成「这段时间的平均」。
                - 表里**空白表示当时没采到**（原因去看 getLongtermPlan 的最近留痕：采集不可达 / 快照过旧 /
                  未选变量），**不要**解释成 0，也不要猜「设备停了」。
                - 表格里一行是一个**房间**（变量名只是实现细节，追溯时看点的标题），
                  问「X 房间怎么样」就按房间名找。
                - **不要把整月数据念出来**（那是导出的活）：用户问「怎么样」就给摘要
                  （条数、时间范围、每个变量的 min/max/avg/last），要明细就引导他导出。
                - **导出必须先确定时间范围，不选时间范围不允许导出**：先用 listLongtermExportDays
                  把有数据的日期摆给用户挑（可多选，也接受他直接说的范围），拿到 `days` 再调导出；
                  用户没给范围时**不要**自己替他挑几天。
                - 两种形式：**表格**（exportLongtermTable → Excel；多天连成一张表、多一列「日期」）与
                  **曲线**（exportLongtermCurves → A4 纵向 PDF，一天一页、一行两张，多天合一份）。
                  用户没说形式时问一句再导。
                - 变量的**顺序就是宽表导出的列序**，调整顺序（setLongtermVariableOrder）要说清它会影响导出。
                - 采样间隔不归这个包管（在定时管理页），要改间隔就说清去哪改。""";
    }

    @Override
    public Map<String, Predicate<User>> capabilities() {
        // 与页面同档：ADMIN 起（页面门槛 ADMIN，AI 不更松也不更严）
        return Map.of(
                CAP_LONGTERM_READ, user -> user != null && user.getRole() != null
                        && user.getRole().getLevel() >= RoleEnum.ADMIN.getLevel(),
                CAP_LONGTERM_WRITE, user -> user != null && user.getRole() != null
                        && user.getRole().getLevel() >= RoleEnum.ADMIN.getLevel());
    }

    @Override
    public List<AiTool> tools() {
        return List.of(listCandidateBundles(), listCandidates(), listVariables(), querySamples(), getPlan(),
                listExportDays(), addVariables(), removeVariables(), setOrder(), exportTable(), exportCurves());
    }

    // ── 读：候选 ──

    /**
     * 变量目录的**分区**这一层。五千多个点位不能一次列完，先给分区让用户/模型收窄，
     * 与页面上「加入变量」先选分区的口径一致。
     */
    private AiTool listCandidateBundles() {
        String schema = """
                {
                  "type": "object",
                  "properties": {},
                  "additionalProperties": false
                }""";
        return new AiTool(
                "listLongtermCandidateBundles",
                "列变量目录里的**分区**（导入分区 + 各分区变量数）。点位有五千多个，"
                        + "用户要按分类/分区找变量时先给这一层，别直接全量列。",
                schema, CAP_LONGTERM_READ, SideEffect.READ,
                (ctx, args) -> {
                    List<TelemetryLongtermBundleOptionDto> bundles = service.listCandidateBundles();
                    List<Map<String, Object>> rows = new ArrayList<>();
                    for (TelemetryLongtermBundleOptionDto b : bundles) {
                        Map<String, Object> row = new LinkedHashMap<>();
                        row.put("bundle", b.getCode());
                        row.put("name", b.getDisplayName());
                        row.put("count", b.getCount());
                        rows.add(row);
                    }
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("total", rows.size());
                    out.put("bundles", rows);
                    out.put("note", "挑一个分区后，把它的 bundle 传给 listLongtermCandidates 列出该分区的变量");
                    return out;
                });
    }

    private AiTool listCandidates() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "keyword": { "type": "string", "description": "按变量名 / 指标 / 房间过滤，例如「温度」「201A」" },
                    "floor": { "type": "string", "description": "只看某个楼层，例如「3F」「B1F」。用户没说范围时先用本工具返回的楼层候选问一句" },
                    "bundle": { "type": "string", "description": "只看某个**分区**（变量目录里的导入分区 code），来自 listLongtermCandidateBundles。变量目录有五千多个点位，先按分区收窄再列" }
                  },
                  "additionalProperties": false
                }""";
        return new AiTool(
                "listLongtermCandidates",
                "列可加入长期归档的**候选变量**（来自变量目录，含哪些已经选中）。"
                        + "没给范围时会先回**楼层候选**；结果太多时回**候选芯片**让用户挑。",
                schema, CAP_LONGTERM_READ, SideEffect.READ,
                (ctx, args) -> {
                    String keyword = text(args, "keyword").toLowerCase(Locale.ROOT);
                    String floor = text(args, "floor").toLowerCase(Locale.ROOT);
                    String bundle = text(args, "bundle");
                    List<TelemetryLongtermCandidateDto> items = service.listCandidates(keyword, floor, bundle);
                    List<TelemetryLongtermCandidateDto> all = items == null ? List.of() : items;

                    Map<String, Integer> byFloor = new LinkedHashMap<>();
                    for (TelemetryLongtermCandidateDto it : all) {
                        if (it == null) {
                            continue;
                        }
                        byFloor.merge(floorOf(it), 1, Integer::sum);
                    }

                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("total", all.size());

                    // 没给范围而候选又跨楼层 → 先让用户挑楼层（与 listTelemetryPoints 同一取舍）
                    boolean scoped = !keyword.isEmpty() || !floor.isEmpty();
                    if (!scoped && byFloor.size() > 1) {
                        List<Map<String, Object>> choices = new ArrayList<>();
                        for (Map.Entry<String, Integer> e : byFloor.entrySet()) {
                            choices.add(AiChoices.option(e.getKey() + " · " + e.getValue() + " 个变量", e.getKey()));
                        }
                        out.putAll(AiChoices.single("看哪个楼层？", choices));
                        out.put("note", "候选跨多个楼层，先挑一层再列；用户给了房间号或指标就不用问");
                        return out;
                    }

                    List<Map<String, Object>> rows = new ArrayList<>();
                    for (TelemetryLongtermCandidateDto it : all) {
                        if (rows.size() >= MAX_ROWS) {
                            break;
                        }
                        rows.add(describe(it));
                    }
                    out.put("variables", rows);
                    if (all.isEmpty()) {
                        out.put("note", "没有匹配的候选变量，换个关键词（房间号或指标名）再试");
                    } else if (all.size() > rows.size()) {
                        // **只有结果被截断时才给候选芯片**：那时它才是真的在帮忙收窄
                        List<Map<String, Object>> choices = new ArrayList<>();
                        for (Map<String, Object> r : rows) {
                            choices.add(AiChoices.option(String.valueOf(r.get("summary")),
                                    String.valueOf(r.get("variable"))));
                        }
                        out.putAll(AiChoices.single("挑一个变量", choices));
                        out.put("note", "匹配到 " + all.size() + " 个变量，只列了前 " + rows.size()
                                + " 个；用户想看别的可以给个更具体的关键词");
                    }
                    return out;
                });
    }

    // ── 读：已选 ──

    private AiTool listVariables() {
        String schema = """
                {
                  "type": "object",
                  "properties": {},
                  "additionalProperties": false
                }""";
        return new AiTool(
                "listLongtermVariables",
                "列出**已选入长期归档的变量与顺序**（顺序就是宽表导出的列序）。",
                schema, CAP_LONGTERM_READ, SideEffect.READ,
                (ctx, args) -> {
                    List<TelemetryLongtermVariableDto> vars = service.listVariables();
                    List<Map<String, Object>> rows = new ArrayList<>();
                    if (vars != null) {
                        /*
                         * 序号给**名次**（1、2、3…）而不是存储的 sortOrder 原值：排序值上留过空洞
                         * （压测数据插入过一批大值），照原值发出去模型会照抄成 102、103…，
                         * 用户看到的就是一串跳号。名次才是「第几个」这件事本身。
                         */
                        int rank = 0;
                        for (TelemetryLongtermVariableDto v : vars) {
                            if (v == null) {
                                continue;
                            }
                            rank++;
                            Map<String, Object> row = new LinkedHashMap<>();
                            row.put("order", rank);
                            row.put("variable", str(v.getWinccVariableName()));
                            row.put("label", str(v.getDisplayLabel()));
                            row.put("unit", str(v.getUnit()));
                            row.put("enabled", v.isEnabled());
                            rows.add(row);
                        }
                    }
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("ok", true);
                    out.put("count", rows.size());
                    out.put("variables", rows);
                    if (rows.isEmpty()) {
                        out.put("note", "还没有选任何变量。要选就先 listLongtermCandidates 找候选，再用 addLongtermVariables 加。");
                    }
                    return out;
                });
    }

    // ── 读：摘要 ──

    private AiTool querySamples() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "month": { "type": "string", "description": "哪个月，形如 2026-10；不传=全部时间" },
                    "variableName": { "type": "string", "description": "只看某个变量（来自 listLongtermVariables 的 variable）；不传=全部变量" },
                    "limit": { "type": "integer", "description": "最多取多少条采样来算摘要，默认 500，上限 2000" }
                  },
                  "additionalProperties": false
                }""";
        return new AiTool(
                "queryLongtermSamples",
                "查长期归档的**摘要**（条数、时间范围、每个变量的 min/max/avg/last）。"
                        + "**只回摘要**，绝不把明细行倒出来；要明细走 exportLongtermTable。",
                schema, CAP_LONGTERM_READ, SideEffect.READ,
                (ctx, args) -> {
                    String month = text(args, "month");
                    String variableName = text(args, "variableName");
                    int limit = Math.min(Math.max(args.path("limit").asInt(SUMMARY_DEFAULT_LIMIT), 1), SUMMARY_MAX_LIMIT);

                    // 分页拉满（一页最多 200），凑到 limit 条为止；total 是完整条数，第一页就有
                    List<TelemetryLongtermSampleDto> samples = new ArrayList<>();
                    long total = 0;
                    int page = 1;
                    while (samples.size() < limit) {
                        int size = Math.min(200, limit - samples.size());
                        TelemetryLongtermQueryPageDto p = service.querySamples(page, size,
                                variableName.isEmpty() ? null : variableName,
                                month.isEmpty() ? null : month, null, null);
                        if (p == null) {
                            break;
                        }
                        total = p.getTotal();
                        List<TelemetryLongtermSampleDto> items = p.getItems();
                        if (items == null || items.isEmpty()) {
                            break;
                        }
                        samples.addAll(items);
                        if (items.size() < size) {
                            break;
                        }
                        page++;
                    }

                    if (total == 0) {
                        return Map.of("ok", false, "month", month.isEmpty() ? null : month,
                                "variableName", variableName.isEmpty() ? null : variableName,
                                "reason", "这段时间/这个变量没有采样数据（变量名拼错，或确实没采到）");
                    }

                    // 每变量 min/max/avg/last（sample_at DESC，首个值就是最新值）
                    Map<String, Stats> byVar = new LinkedHashMap<>();
                    java.time.LocalDateTime from = null, to = null;
                    for (TelemetryLongtermSampleDto s : samples) {
                        if (s == null || str(s.getVariableName()).isEmpty()) {
                            continue;
                        }
                        String v = str(s.getVariableName());
                        java.time.LocalDateTime t = s.getSampleAt();
                        if (t != null) {
                            if (from == null || t.isBefore(from)) {
                                from = t;
                            }
                            if (to == null || t.isAfter(to)) {
                                to = t;
                            }
                        }
                        Double n = s.getNumericValue();
                        if (n != null) {
                            byVar.computeIfAbsent(v, k -> new Stats()).accept(n);
                        }
                    }

                    List<Map<String, Object>> perVar = new ArrayList<>();
                    for (Map.Entry<String, Stats> e : byVar.entrySet()) {
                        Stats st = e.getValue();
                        Map<String, Object> m = new LinkedHashMap<>();
                        m.put("variable", e.getKey());
                        m.put("min", round(st.min));
                        m.put("max", round(st.max));
                        m.put("avg", round(st.avg()));
                        m.put("last", round(st.last));
                        m.put("samples", st.n);
                        perVar.add(m);
                    }

                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("ok", true);
                    out.put("month", month.isEmpty() ? null : month);
                    out.put("variableName", variableName.isEmpty() ? null : variableName);
                    out.put("totalSamples", total);
                    out.put("summarizedSamples", samples.size());
                    out.put("from", from == null ? null : from.toString());
                    out.put("to", to == null ? null : to.toString());
                    out.put("perVariable", perVar);
                    if (total > samples.size()) {
                        out.put("note", "只取了前 " + samples.size() + " 条算摘要（总数 " + total
                                + "），min/max 可能没覆盖整段；要精确或要明细就走 exportLongtermTable。");
                    }
                    return out;
                });
    }

    // ── 读：计划 ──

    private AiTool getPlan() {
        String schema = """
                {
                  "type": "object",
                  "properties": {},
                  "additionalProperties": false
                }""";
        return new AiTool(
                "getLongtermPlan",
                "查长期归档的**计划视图**：是否启用、采样间隔（秒/分钟）、采样窗口、已选变量数、"
                        + "最近几轮采集结果（含跳过原因）。",
                schema, CAP_LONGTERM_READ, SideEffect.READ,
                (ctx, args) -> {
                    TelemetryLongtermPlanDto p = service.getPlanView();
                    if (p == null) {
                        return Map.of("ok", false, "reason", "计划视图为空（调度行可能还没播种）");
                    }
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("ok", true);
                    out.put("scheduleEnabled", p.isScheduleEnabled());
                    out.put("pollIntervalSeconds", p.getPollIntervalSeconds());
                    out.put("pollIntervalMinutes", p.getPollIntervalSeconds() / 60.0);
                    out.put("scheduleStartTime", str(p.getScheduleStartTime()));
                    out.put("scheduleEndTime", str(p.getScheduleEndTime()));
                    out.put("variableCount", p.getVariableCount());
                    out.put("sampleRows", p.getSampleRows());
                    List<Map<String, Object>> runs = new ArrayList<>();
                    if (p.getRecentRuns() != null) {
                        for (TelemetryLongtermSampleLogDto r : p.getRecentRuns()) {
                            if (r == null) {
                                continue;
                            }
                            Map<String, Object> m = new LinkedHashMap<>();
                            m.put("runAt", r.getRunAt() == null ? null : r.getRunAt().toString());
                            m.put("outcome", str(r.getOutcome()));
                            m.put("rowsWritten", r.getRowsWritten());
                            m.put("durationMs", r.getDurationMs());
                            m.put("reason", str(r.getReason()));
                            runs.add(m);
                        }
                    }
                    out.put("recentRuns", runs);
                    return out;
                });
    }

    // ── 写：追加 ──

    private AiTool addVariables() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "variableNames": {
                      "type": "array",
                      "items": { "type": "string" },
                      "description": "要加入长期归档的变量名（来自 listLongtermCandidates 的 variable）"
                    }
                  },
                  "required": ["variableNames"],
                  "additionalProperties": false
                }""";
        return new AiTool(
                "addLongtermVariables",
                "把变量加入长期归档（**按变量名去重**，已在里面的不再加）。",
                schema, CAP_LONGTERM_WRITE, SideEffect.EXTERNAL_WRITE,
                (ctx, args) -> {
                    List<String> requested = stringList(args.path("variableNames"));
                    if (requested.isEmpty()) {
                        return Map.of("ok", false, "reason", "没说加哪些变量");
                    }
                    List<TelemetryLongtermVariableDto> existing = safeVars(service.listVariables());
                    Set<String> existingNames = new LinkedHashSet<>();
                    for (TelemetryLongtermVariableDto v : existing) {
                        if (v != null && !str(v.getWinccVariableName()).isEmpty()) {
                            existingNames.add(v.getWinccVariableName());
                        }
                    }
                    Map<String, String> labels = displayLabelByName();
                    List<TelemetryLongtermVariableDto> merged = new ArrayList<>(existing);
                    List<String> added = new ArrayList<>();
                    List<String> duplicates = new ArrayList<>();
                    Set<String> seen = new LinkedHashSet<>();
                    for (String name : requested) {
                        if (existingNames.contains(name)) {
                            duplicates.add(name);
                            continue;
                        }
                        if (!seen.add(name)) {
                            continue; // 请求里自己重复
                        }
                        TelemetryLongtermVariableDto d = new TelemetryLongtermVariableDto();
                        d.setWinccVariableName(name);
                        d.setDisplayLabel(labels.getOrDefault(name, null));
                        d.setEnabled(true);
                        merged.add(d);
                        added.add(name);
                    }
                    if (added.isEmpty()) {
                        return Map.of("ok", false, "reason",
                                "这些变量都已经在归档里了（" + String.join("、", duplicates) + "），没有新增");
                    }
                    service.saveVariables(merged);
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("ok", true);
                    out.put("added", added);
                    out.put("addedCount", added.size());
                    out.put("totalCount", merged.size());
                    if (!duplicates.isEmpty()) {
                        out.put("duplicates", duplicates);
                        out.put("note", "其中 " + String.join("、", duplicates) + " 已经在归档里，没有重复加");
                    }
                    return out;
                });
    }

    // ── 写：移除 ──

    private AiTool removeVariables() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "variableNames": {
                      "type": "array",
                      "items": { "type": "string" },
                      "description": "要从长期归档移除的变量名"
                    }
                  },
                  "required": ["variableNames"],
                  "additionalProperties": false
                }""";
        return new AiTool(
                "removeLongtermVariables",
                "把变量从长期归档移除。",
                schema, CAP_LONGTERM_WRITE, SideEffect.EXTERNAL_WRITE,
                (ctx, args) -> {
                    List<String> requested = stringList(args.path("variableNames"));
                    if (requested.isEmpty()) {
                        return Map.of("ok", false, "reason", "没说移除哪些变量");
                    }
                    List<TelemetryLongtermVariableDto> existing = safeVars(service.listVariables());
                    Set<String> toRemove = new LinkedHashSet<>(requested);
                    List<TelemetryLongtermVariableDto> kept = new ArrayList<>();
                    List<String> removed = new ArrayList<>();
                    for (TelemetryLongtermVariableDto v : existing) {
                        String name = v == null ? "" : str(v.getWinccVariableName());
                        if (!name.isEmpty() && toRemove.contains(name)) {
                            removed.add(name);
                        } else if (v != null) {
                            kept.add(v);
                        }
                    }
                    if (removed.isEmpty()) {
                        return Map.of("ok", false, "reason",
                                "这些变量不在归档里（" + String.join("、", requested) + "），没有可移除的");
                    }
                    service.saveVariables(kept);
                    List<String> notFound = new ArrayList<>(requested);
                    notFound.removeAll(removed);
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("ok", true);
                    out.put("removed", removed);
                    out.put("remainingCount", kept.size());
                    if (!notFound.isEmpty()) {
                        out.put("notFound", notFound);
                        out.put("note", "其中 " + String.join("、", notFound) + " 本来就不在归档里");
                    }
                    return out;
                });
    }

    // ── 写：顺序 ──

    private AiTool setOrder() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "variableNames": {
                      "type": "array",
                      "items": { "type": "string" },
                      "description": "想要的顺序（**必须覆盖全部已选变量**，一个都不能少，也不许夹带没选中的）"
                    }
                  },
                  "required": ["variableNames"],
                  "additionalProperties": false
                }""";
        return new AiTool(
                "setLongtermVariableOrder",
                "设置长期归档变量的顺序（顺序 = 宽表导出的列序）。必须把全部已选变量都列出来。",
                schema, CAP_LONGTERM_WRITE, SideEffect.EXTERNAL_WRITE,
                (ctx, args) -> {
                    List<String> requested = stringList(args.path("variableNames"));
                    if (requested.isEmpty()) {
                        return Map.of("ok", false, "reason", "没说新的顺序");
                    }
                    List<TelemetryLongtermVariableDto> existing = safeVars(service.listVariables());
                    Map<String, TelemetryLongtermVariableDto> byName = new LinkedHashMap<>();
                    for (TelemetryLongtermVariableDto v : existing) {
                        String name = v == null ? "" : str(v.getWinccVariableName());
                        if (!name.isEmpty()) {
                            byName.put(name, v);
                        }
                    }
                    Set<String> requestedSet = new LinkedHashSet<>(requested);

                    // 少给：覆盖不全 → 不提交，让模型重新列全
                    List<String> missing = new ArrayList<>();
                    for (String n : byName.keySet()) {
                        if (!requestedSet.contains(n)) {
                            missing.add(n);
                        }
                    }
                    if (!missing.isEmpty()) {
                        return Map.of("ok", false, "reason",
                                "顺序没覆盖全部已选变量，少了 " + String.join("、", missing)
                                        + "。请把全部已选变量重新列一遍（别漏）");
                    }
                    // 多给：有没选中的名字 → 报错
                    List<String> extra = new ArrayList<>();
                    for (String n : requested) {
                        if (!byName.containsKey(n)) {
                            extra.add(n);
                        }
                    }
                    if (!extra.isEmpty()) {
                        return Map.of("ok", false, "reason",
                                "这些名字不在归档里：" + String.join("、", extra) + "。只列已选的变量");
                    }

                    List<TelemetryLongtermVariableDto> reordered = new ArrayList<>();
                    for (String n : requested) {
                        reordered.add(byName.get(n));
                    }
                    service.saveVariables(reordered);
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("ok", true);
                    out.put("order", requested);
                    out.put("count", reordered.size());
                    out.put("note", "已按新顺序保存；这个顺序就是宽表导出的列序");
                    return out;
                });
    }

    // ── 写：导出 ──

    /**
     * 导出的**时间范围**：列出有数据的日期让用户挑。
     *
     * <p>用户口径：**导出必须先确定时间范围，不选不允许导出** —— 所以模型得先拿到这份清单，
     * 摆给用户选（可多选），不能自己替他决定导哪些天。
     */
    private AiTool listExportDays() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "month": { "type": "string", "description": "看哪个月有数据，形如 2026-10；不传 = 最近有数据的日期（最多列 60 天）" }
                  },
                  "additionalProperties": false
                }""";
        return new AiTool(
                "listLongtermExportDays",
                "列**哪些日期可以导出**（有采样数据的那些天）。导出前先用它把日期摆给用户挑（可多选）。",
                schema, CAP_LONGTERM_READ, SideEffect.READ,
                (ctx, args) -> {
                    String month = text(args, "month");
                    if (!month.isEmpty() && !month.matches("\\d{4}-\\d{2}")) {
                        return Map.of("ok", false, "reason", "月份格式不对，应是 2026-10 这种写法");
                    }
                    List<String> days = service.listDaysWithData(month.isEmpty() ? null : month, null, null);
                    if (days == null) {
                        days = List.of();
                    }
                    List<String> limited = days.size() > 60 ? days.subList(0, 60) : days;
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("total", days.size());
                    out.put("days", limited);
                    if (limited.isEmpty()) {
                        out.put("note", "这段时间还没有采样数据，导不出东西");
                        return out;
                    }
                    List<Map<String, Object>> choices = new ArrayList<>();
                    for (String d : limited) {
                        choices.add(AiChoices.option(d, d));
                    }
                    out.putAll(AiChoices.multi("要导出哪些日期？（可多选）", choices));
                    out.put("note", "用户选完把这些日期作为 days 传给导出工具；他直接说范围（如「10月1日到7日」）也行");
                    return out;
                });
    }

    /** 导出的公共前置校验：时间范围必填（用户口径：不选不允许导出）。 */
    private static String validateDays(JsonNode args, List<String> daysOut) {
        JsonNode node = args.path("days");
        if (!node.isArray() || node.isEmpty()) {
            return "还没确定时间范围：先用 listLongtermExportDays 把有数据的日期给用户挑（可多选），"
                    + "他直接说了范围也行；**不选时间范围不允许导出**";
        }
        for (JsonNode n : node) {
            String d = n.isTextual() ? n.asText("").trim() : "";
            if (!d.matches("\\d{4}-\\d{2}-\\d{2}")) {
                return "日期格式不对：「" + d + "」应是 2026-10-01 这种写法";
            }
            daysOut.add(d);
        }
        return null;
    }

    private AiTool exportTable() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "days": {
                      "type": "array",
                      "items": { "type": "string" },
                      "description": "**必填**：导出哪些天，形如 [\\"2026-10-01\\",\\"2026-10-02\\"]。可多选、可跨月"
                    },
                    "layout": {
                      "type": "string",
                      "enum": ["LONG", "WIDE"],
                      "description": "长表（一行一条采样，多天连成一张、多一列日期）还是宽表（一行一个时间点、变量一列，多天按天分段堆叠）。默认 LONG"
                    },
                    "variableNames": {
                      "type": "array",
                      "items": { "type": "string" },
                      "description": "只导这些变量；不传=全部已选变量"
                    }
                  },
                  "required": ["days"],
                  "additionalProperties": false
                }""";
        return new AiTool(
                "exportLongtermTable",
                "把长期归档导成 **Excel 表格**，给一个下载按钮。时间范围（`days`）必填。",
                schema, CAP_LONGTERM_WRITE, SideEffect.EXTERNAL_WRITE,
                (ctx, args) -> {
                    List<String> days = new ArrayList<>();
                    String bad = validateDays(args, days);
                    if (bad != null) {
                        return Map.of("ok", false, "reason", bad);
                    }
                    String layout = text(args, "layout");
                    String effLayout = "WIDE".equalsIgnoreCase(layout) ? "WIDE" : "LONG";
                    List<String> variableNames = stringList(args.path("variableNames"));

                    List<String> qs = new ArrayList<>();
                    qs.add("days=" + enc(String.join(",", days)));
                    qs.add("layout=" + enc(effLayout));
                    if (!variableNames.isEmpty()) {
                        qs.add("variables=" + enc(String.join(",", variableNames)));
                    }
                    String url = "/api/admin/telemetry/longterm/export/download?" + String.join("&", qs);
                    return downloadPayload(url, days, "监测数据表格", effLayout, variableNames);
                });
    }

    /** 曲线：A4 纵向 PDF，一天一页、一行两张，多天合到一份文件里。 */
    private AiTool exportCurves() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "days": {
                      "type": "array",
                      "items": { "type": "string" },
                      "description": "**必填**：导出哪些天，形如 [\\"2026-10-01\\",\\"2026-10-07\\"]"
                    },
                    "variableNames": {
                      "type": "array",
                      "items": { "type": "string" },
                      "description": "只导这些变量；不传=全部已选变量"
                    }
                  },
                  "required": ["days"],
                  "additionalProperties": false
                }""";
        return new AiTool(
                "exportLongtermCurves",
                "把长期归档导成 **曲线 PDF**（A4 纵向、一天一页、一行两张，多天合成一份）。时间范围（`days`）必填。",
                schema, CAP_LONGTERM_WRITE, SideEffect.EXTERNAL_WRITE,
                (ctx, args) -> {
                    List<String> days = new ArrayList<>();
                    String bad = validateDays(args, days);
                    if (bad != null) {
                        return Map.of("ok", false, "reason", bad);
                    }
                    List<String> variableNames = stringList(args.path("variableNames"));
                    List<String> qs = new ArrayList<>();
                    qs.add("days=" + enc(String.join(",", days)));
                    if (!variableNames.isEmpty()) {
                        qs.add("variables=" + enc(String.join(",", variableNames)));
                    }
                    String url = "/api/admin/telemetry/longterm/export/pdf/download?" + String.join("&", qs);
                    return downloadPayload(url, days, "监测数据曲线图", "CURVE", variableNames);
                });
    }

    /** 下载载荷：载体的「按地址取」是纯 GET，所以只给地址；文件名由前端按同口径拼。 */
    private static Map<String, Object> downloadPayload(String url, List<String> days, String nameSuffix,
                                                      String layout, List<String> variableNames) {
        List<String> sorted = new ArrayList<>(days);
        java.util.Collections.sort(sorted);
        String stem = sorted.get(0).equals(sorted.get(sorted.size() - 1))
                ? sorted.get(0) : sorted.get(0) + "~" + sorted.get(sorted.size() - 1);
        Map<String, Object> dl = new LinkedHashMap<>();
        dl.put("kind", "telemetryLongterm");
        dl.put("label", stem + nameSuffix);
        dl.put("params", Map.of("url", url));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("days", sorted);
        out.put("layout", layout);
        if (!variableNames.isEmpty()) {
            out.put("variableNames", variableNames);
        }
        out.put("download", dl);
        out.put("note", "告诉用户点下面的下载按钮下载；**不要把 URL 写进正文**");
        return out;
    }

    // ── 内部 ──

    private static final class Stats {
        double min = Double.MAX_VALUE, max = -Double.MAX_VALUE, sum = 0, last = 0;
        boolean seen = false;
        int n = 0;

        void accept(double v) {
            min = Math.min(min, v);
            max = Math.max(max, v);
            sum += v;
            n++;
            // sample_at DESC：首个值就是最新值（last）
            if (!seen) {
                last = v;
                seen = true;
            }
        }

        double avg() {
            return n == 0 ? 0 : sum / n;
        }
    }

    private static Map<String, Object> describe(TelemetryLongtermCandidateDto it) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("variable", str(it.getWinccVariableName()));
        row.put("label", str(it.getDisplayLabel()));
        row.put("room", str(it.getRoomCanonical()));
        row.put("floor", str(it.getFloorCode()));
        row.put("metric", str(it.getMetricKindLabel()).isEmpty() ? str(it.getMetricKindCode()) : str(it.getMetricKindLabel()));
        row.put("selected", it.isSelected());
        row.put("enabledInCatalog", it.isEnabledInCatalog());
        String where = str(it.getRoomCanonical());
        String metric = String.valueOf(row.get("metric"));
        row.put("summary", (where.isEmpty() ? "" : where + " · ")
                + (metric.isEmpty() ? str(it.getWinccVariableName()) : metric)
                + (it.isSelected() ? " · 已选" : ""));
        return row;
    }

    private static String floorOf(TelemetryLongtermCandidateDto it) {
        String f = str(it.getFloorCode());
        return f.isEmpty() ? "未标注楼层" : f;
    }

    private static List<TelemetryLongtermVariableDto> safeVars(List<TelemetryLongtermVariableDto> vars) {
        return vars == null ? new ArrayList<>() : new ArrayList<>(vars);
    }

    private Map<String, String> displayLabelByName() {
        Map<String, String> m = new LinkedHashMap<>();
        List<TelemetryLongtermCandidateDto> candidates = service.listCandidates(null, null, null);
        if (candidates != null) {
            for (TelemetryLongtermCandidateDto c : candidates) {
                if (c != null && !str(c.getWinccVariableName()).isEmpty()) {
                    m.put(c.getWinccVariableName(), str(c.getDisplayLabel()));
                }
            }
        }
        return m;
    }

    private static List<String> stringList(JsonNode node) {
        List<String> out = new ArrayList<>();
        if (node != null && node.isArray()) {
            for (JsonNode n : node) {
                String s = n == null ? "" : n.asText("").trim();
                if (!s.isEmpty() && !out.contains(s)) {
                    out.add(s);
                }
            }
        }
        return out;
    }

    private static String enc(String s) {
        return URLEncoder.encode(s, StandardCharsets.UTF_8);
    }

    private static double round(double v) {
        return Math.round(v * 100.0) / 100.0;
    }

    private static String str(Object o) {
        if (o == null) {
            return "";
        }
        String s = String.valueOf(o).trim();
        return "null".equalsIgnoreCase(s) ? "" : s;
    }

    private static String text(JsonNode args, String field) {
        JsonNode n = args == null ? null : args.path(field);
        return n == null || !n.isTextual() ? "" : n.asText("").trim();
    }
}
