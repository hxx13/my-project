package com.example.demo.modules.ai.tool.pack;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.ai.tool.AiTool;
import com.example.demo.modules.ai.tool.AiToolPack;
import com.example.demo.modules.ai.tool.SideEffect;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.telemetry.dto.TelemetrySnapshotDto;
import com.example.demo.modules.telemetry.dto.TelemetryTagItemDto;
import com.example.demo.modules.telemetry.dto.archive.TelemetryArchivePointDto;
import com.example.demo.modules.telemetry.dto.archive.TelemetryArchiveSeriesDto;
import com.example.demo.modules.telemetry.service.TelemetryArchiveService;
import com.example.demo.modules.telemetry.service.TelemetrySnapshotService;
import com.example.demo.modules.telemetry.service.TelemetryWinCcWriteService;
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
 * 动物房环境监测（{@code /#/console/admin/animal-room-telemetry}）的工具包。
 *
 * <p>三件事：**看在值**（点位目录 + 当前值 + 是否越限）、**看趋势**（某点的历史曲线摘要）、
 * **下发**（开关 / 设定值）。
 *
 * <p>两条与数据源有关的口径，写错就会答错：
 * <ul>
 *   <li><b>「当前值」的权威是内存快照</b>（{@link TelemetrySnapshotService#getSnapshot()}），
 *       不是 {code telemetry_value_archive} —— 归档表是历史，拿它当「现在」会答出几十分钟前的数。</li>
 *   <li>报警上下限与越限判定**已经并进快照行**（{@code alarmMinValue/alarmMaxValue/alarmOutOfRange}），
 *       所以不需要再单开一个「查阈值」工具。</li>
 * </ul>
 *
 * <p>下发是碰硬件的写：上游只允许 SWITCH / SETPOINT 且必须在点名内（校验在
 * {@link TelemetryWinCcWriteService} 里，这里不重复实现），侧效等级 C —— 服务端挂起等用户点确认。
 */
@Component
public class TelemetryToolPack implements AiToolPack {

    /** 看环境数据：与页面接口同口径（登录即可，接口层没有额外角色判定）。 */
    public static final String CAP_TELEMETRY_READ = "ai.telemetry.read";
    /** 下发：与 TelemetryWinCcWriteController 同口径（requireSuperAdmin）。 */
    public static final String CAP_TELEMETRY_WRITE = "ai.telemetry.write";

    /** 一次最多回多少行点位（模型读不动整份快照，也费 token）。 */
    private static final int MAX_ROWS = 40;
    /** 候选不超过这个数才给可点选项。 */
    private static final int CHOICE_MAX = 6;

    private final TelemetrySnapshotService snapshotService;
    private final TelemetryArchiveService archiveService;
    private final TelemetryWinCcWriteService writeService;

    public TelemetryToolPack(TelemetrySnapshotService snapshotService,
                             TelemetryArchiveService archiveService,
                             TelemetryWinCcWriteService writeService) {
        this.snapshotService = snapshotService;
        this.archiveService = archiveService;
        this.writeService = writeService;
    }

    @Override
    public String packKey() {
        return "telemetry";
    }

    @Override
    public String displayName() {
        return "环境监测";
    }

    @Override
    public Set<String> routeHints() {
        // L2 路由词：这些话/页面提到本域时带上本包（见 AiPackRouter）。
        return Set.of("环境", "温湿度", "温度", "湿度", "压差", "氨气", "监控", "探头", "点位", "遥测", "阈值", "越限");
    }

    @Override
    public String defaultPrompt() {
        return """
                动物房环境监测的口径：
                - **先定范围，再列点位。** 用户没说哪个楼层/房间时 → listTelemetryPoints 会回楼层候选，
                  把候选摆给用户挑，**不要**一次把整栋楼的点位都列出来（几百个点，一次一屏读不进去）。
                  用户给了房间号（如「201A」）或指标（如「温度」）就按它查，不必再问楼层。
                - 「现在多少度」→ listTelemetryPoints（内存快照，**就是**现在的值；结果里带 fetchedAt，
                  答的时候要说清是什么时候的数）。**不要拿历史当现状**。
                - 「这段时间怎么走的」→ queryTelemetryHistory（按点位变量名取曲线，返回的是摘要 + 采样点，
                  不是原始逐秒数据）。变量名只能从 listTelemetryPoints 里拿，别凭印象编。
                - 越限与否已经含在点位行里（alarmBand / outOfRange），不用再找别的工具查阈值。
                - 下发（开关 / 设定值）→ writeTelemetryTag：**先用 listTelemetryPoints(writableOnly=true)
                  找到能下发的点位**（只有 role 为 SWITCH / SETPOINT 的允许，METRIC 只测不控），
                  再下发。开关类传 1 / 0 或 true / false。碰硬件，服务端会挂起等用户点确认；
                  **只在用户明确说了要下发什么值时才调**，别替他决定。""";
    }

    @Override
    public Map<String, Predicate<User>> capabilities() {
        return Map.of(
                // 页面上的三个读接口都没做额外角色判定，AI 这边不能更松也不能更严
                CAP_TELEMETRY_READ, user -> user != null,
                CAP_TELEMETRY_WRITE, user -> user.getRole() != null
                        && user.getRole().getLevel() >= RoleEnum.SUPER_ADMIN.getLevel());
    }

    @Override
    public List<AiTool> tools() {
        return List.of(listPoints(), queryHistory(), writeTag());
    }

    // ── 看现状 ──

    private AiTool listPoints() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "keyword": { "type": "string", "description": "按房间号 / 指标 / 点位名过滤，例如「201A」「温度」「压差」" },
                    "floor": { "type": "string", "description": "只看某个楼层，例如「3F」「B1F」。**用户没说范围时先用本工具返回的楼层候选问一句**" },
                    "writableOnly": { "type": "boolean", "description": "只列可以下发的点位（开关 / 设定值）。要下发之前先用它找点位" },
                    "limit": { "type": "integer", "description": "最多回几行，默认 20，上限 40" }
                  },
                  "additionalProperties": false
                }""";
        return new AiTool(
                "listTelemetryPoints",
                "查环境监测点位的**当前值**（温湿度/压差/氨气等），带报警上下限与是否越限。"
                        + "没给范围时会先回**楼层候选**让用户挑，不要一次把整栋楼列出来。",
                schema, CAP_TELEMETRY_READ, SideEffect.READ,
                (ctx, args) -> {
                    TelemetrySnapshotDto snap = snapshotService.getSnapshot();
                    List<TelemetryTagItemDto> items = snap == null || snap.getItems() == null
                            ? List.of() : snap.getItems();
                    String keyword = text(args, "keyword").toLowerCase(Locale.ROOT);
                    // 与 keyword 一样先归一化大小写：contains(...) 拿的是「已小写的针」，
                    // 传原样的「3F」会匹配不上（真机就是这里挂过一次）
                    String floor = text(args, "floor").toLowerCase(Locale.ROOT);
                    boolean writableOnly = args.path("writableOnly").asBoolean(false);
                    int limit = Math.min(Math.max(args.path("limit").asInt(20), 1), MAX_ROWS);

                    List<TelemetryTagItemDto> matched = new ArrayList<>();
                    Map<String, Integer> byFloor = new LinkedHashMap<>();
                    for (TelemetryTagItemDto it : items) {
                        if (it == null || !hit(it, keyword) || !onFloor(it, floor) || !writable(it, writableOnly)) {
                            continue;
                        }
                        matched.add(it);
                        byFloor.merge(floorOf(it), 1, Integer::sum);
                    }

                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("total", matched.size());
                    out.put("winccReachable", snap != null && snap.isWinccReachable());
                    out.put("fetchedAt", snap == null || snap.getFetchedAt() == null
                            ? null : snap.getFetchedAt().toString());

                    // 没给范围而点位又跨楼层 → 先让用户挑楼层。一次列一屏（40 行）读不进去，
                    // 用户真正要看的通常就是自己那层。
                    boolean scoped = !keyword.isEmpty() || !floor.isEmpty();
                    if (!scoped && byFloor.size() > 1) {
                        List<Map<String, Object>> choices = new ArrayList<>();
                        for (Map.Entry<String, Integer> e : byFloor.entrySet()) {
                            Map<String, Object> c = new LinkedHashMap<>();
                            c.put("label", e.getKey() + " · " + e.getValue() + " 个点位");
                            c.put("value", e.getKey());
                            choices.add(c);
                        }
                        out.put("byFloor", byFloor);
                        out.put("choices", choices);
                        out.put("choicesTitle", "看哪个楼层？");
                        out.put("note", "点位跨多个楼层，先挑一层再列；用户给了房间号或指标就不用问");
                        return out;
                    }

                    List<Map<String, Object>> rows = new ArrayList<>();
                    for (TelemetryTagItemDto it : matched) {
                        if (rows.size() >= limit) {
                            break;
                        }
                        rows.add(describe(it));
                    }
                    out.put("points", rows);
                    if (items.isEmpty()) {
                        out.put("note", "快照里没有任何点位（采集可能没起来，或该域未配置）");
                    } else if (matched.isEmpty()) {
                        out.put("note", "没有匹配的点位，换个关键词（房间号或指标名）再试");
                    } else if (matched.size() <= CHOICE_MAX) {
                        List<Map<String, Object>> choices = new ArrayList<>();
                        for (Map<String, Object> r : rows) {
                            Map<String, Object> c = new LinkedHashMap<>();
                            c.put("label", r.get("summary"));
                            c.put("value", r.get("variable"));
                            choices.add(c);
                        }
                        out.put("choices", choices);
                        out.put("choicesTitle", "挑一个点位");
                    }
                    return out;
                });
    }

    // ── 看趋势 ──

    private AiTool queryHistory() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "variableName": { "type": "string", "description": "点位变量名，**来自 listTelemetryPoints 的 variable**" },
                    "windowHours": { "type": "integer", "description": "往回看几小时，默认 24，上限 720（30 天）" },
                    "maxPoints": { "type": "integer", "description": "曲线最多回几个采样点，默认 24，上限 120" }
                  },
                  "required": ["variableName"],
                  "additionalProperties": false
                }""";
        return new AiTool(
                "queryTelemetryHistory",
                "查一个环境点位的**历史曲线摘要**（最高/最低/平均/当前 + 采样点）。",
                schema, CAP_TELEMETRY_READ, SideEffect.READ,
                (ctx, args) -> {
                    String variable = text(args, "variableName");
                    if (variable.isEmpty()) {
                        return Map.of("ok", false, "reason", "没说是哪个点位");
                    }
                    int hours = Math.min(Math.max(args.path("windowHours").asInt(24), 1), 720);
                    int maxPoints = Math.min(Math.max(args.path("maxPoints").asInt(24), 2), 120);

                    TelemetryArchiveSeriesDto series = archiveService.querySeries(
                            variable, null, null, maxPoints, "ROLLING", hours, "STANDARD", null);
                    List<TelemetryArchivePointDto> points = series == null || series.getPoints() == null
                            ? List.of() : series.getPoints();
                    if (points.isEmpty()) {
                        return Map.of("ok", false, "variableName", variable, "windowHours", hours,
                                "reason", "这段时间没有归档数据（点位名拼错，或者归档里确实没有）");
                    }

                    double min = Double.MAX_VALUE, max = -Double.MAX_VALUE, sum = 0;
                    int n = 0;
                    double last = 0;
                    List<Map<String, Object>> sampled = new ArrayList<>();
                    for (TelemetryArchivePointDto p : points) {
                        if (p == null || p.getValue() == null) {
                            continue;
                        }
                        double v = p.getValue();
                        min = Math.min(min, v);
                        max = Math.max(max, v);
                        sum += v;
                        last = v;
                        n++;
                        sampled.add(Map.of("t", str(p.getT()), "value", v));
                    }
                    if (n == 0) {
                        return Map.of("ok", false, "variableName", variable, "reason", "点位的值都是空的");
                    }
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("ok", true);
                    out.put("variableName", variable);
                    out.put("windowHours", hours);
                    out.put("from", str(series.getQueriedFrom()));
                    out.put("to", str(series.getQueriedTo()));
                    out.put("samples", n);
                    out.put("min", round(min));
                    out.put("max", round(max));
                    out.put("avg", round(sum / n));
                    out.put("last", round(last));
                    out.put("series", sampled);
                    return out;
                });
    }

    // ── 下发 ──

    private AiTool writeTag() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "variableName": { "type": "string", "description": "点位变量名，来自 listTelemetryPoints；上游只接受开关(SWITCH)与设定值(SETPOINT)类点位" },
                    "value": {
                      "description": "要下发的值。开关类用 1 / 0（或 true / false，两者等价）；设定值用数字或字符串"
                    }
                  },
                  "required": ["variableName", "value"],
                  "additionalProperties": false
                }""";
        return new AiTool(
                "writeTelemetryTag",
                "下发一个环境监测点位的开关或设定值（真的写进 WinCC，会动现场设备）。",
                schema, CAP_TELEMETRY_WRITE, SideEffect.EXTERNAL_WRITE,
                (ctx, args) -> {
                    String variable = text(args, "variableName");
                    if (variable.isEmpty()) {
                        return Map.of("ok", false, "reason", "没说是哪个点位");
                    }
                    JsonNode node = args.path("value");
                    if (node.isMissingNode() || node.isNull()) {
                        return Map.of("ok", false, "reason", "没说下发什么值");
                    }
                    Object value;
                    if (node.isBoolean()) {
                        // 上游 coerceSwitchPayload 认布尔（true→1）：快照里开关本来也是 true/false，
                        // 原样传下去即可，这里不替它猜。
                        value = node.asBoolean();
                    } else if (node.isIntegralNumber()) {
                        value = node.asInt();
                    } else if (node.isNumber()) {
                        value = node.asDouble();
                    } else {
                        value = node.asText();
                    }
                    try {
                        TelemetryTagItemDto row = writeService.writeTagAndRefreshSnapshotRow(variable, value);
                        Map<String, Object> out = new LinkedHashMap<>();
                        out.put("ok", true);
                        out.put("variableName", variable);
                        out.put("value", value);
                        out.put("readBackValue", row == null ? null : str(row.getValue()));
                        out.put("alarmBand", row == null ? null : str(row.getAlarmBand()));
                        return out;
                    } catch (IllegalArgumentException e) {
                        // 上游的拒绝话术可以直接给人看（点位不在点名内 / 不是开关类）
                        return Map.of("ok", false, "reason", e.getMessage() == null ? "这个点位不能下发" : e.getMessage());
                    }
                });
    }

    // ── 内部 ──

    private static boolean hit(TelemetryTagItemDto it, String keyword) {
        if (keyword.isEmpty()) {
            return true;
        }
        return contains(it.getVariableName(), keyword)
                || contains(it.getDisplayLabel(), keyword)
                || contains(it.getRoomCanonical(), keyword)
                || contains(it.getFloorCode(), keyword)
                || contains(it.getMetricKindLabel(), keyword)
                || contains(it.getMetricKindCode(), keyword)
                || contains(it.getBundleDisplayName(), keyword);
    }

    private static boolean onFloor(TelemetryTagItemDto it, String floor) {
        return floor.isEmpty()
                || contains(it.getFloorCode(), floor)
                || contains(it.getDisplayLabel(), floor);
    }

    /** 能不能下发：只有 SWITCH / SETPOINT 允许（与 {@link TelemetryWinCcWriteService} 同一条判据）。 */
    private static boolean writable(TelemetryTagItemDto it, boolean writableOnly) {
        if (!writableOnly) {
            return true;
        }
        String role = str(it.getKindRole());
        return "SWITCH".equals(role) || "SETPOINT".equals(role);
    }

    private static String floorOf(TelemetryTagItemDto it) {
        String f = str(it.getFloorCode());
        return f.isEmpty() ? "未标注楼层" : f;
    }

    private static boolean contains(String value, String keyword) {
        return value != null && value.toLowerCase(Locale.ROOT).contains(keyword);
    }

    /** 一行点位压成给模型看的形状；summary 是候选芯片上的那行字（**要能看出是哪个房间的什么指标**）。 */
    private static Map<String, Object> describe(TelemetryTagItemDto it) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("variable", str(it.getVariableName()));
        row.put("label", str(it.getDisplayLabel()));
        row.put("room", str(it.getRoomCanonical()));
        row.put("floor", str(it.getFloorCode()));
        row.put("metric", str(it.getMetricKindLabel()).isEmpty() ? str(it.getMetricKindCode()) : str(it.getMetricKindLabel()));
        // 点位角色：SWITCH / SETPOINT 才能下发，METRIC 只测不控 —— 不知道角色的模型会拿只读点去下发，白挂起一次
        row.put("role", str(it.getKindRole()));
        row.put("value", str(it.getValue()));
        row.put("at", str(it.getTimestamp()));
        row.put("alarmBand", str(it.getAlarmBand()));
        row.put("outOfRange", Boolean.TRUE.equals(it.getAlarmOutOfRange()));
        if (str(it.getAlarmMinValue()).length() > 0 || str(it.getAlarmMaxValue()).length() > 0) {
            row.put("alarmMin", str(it.getAlarmMinValue()));
            row.put("alarmMax", str(it.getAlarmMaxValue()));
        }
        if (str(it.getError()).length() > 0) {
            row.put("error", str(it.getError()));
        }
        String where = str(it.getRoomCanonical());
        String metric = String.valueOf(row.get("metric"));
        row.put("summary", (where.isEmpty() ? "" : where + " · ") + (metric.isEmpty() ? str(it.getVariableName()) : metric)
                + " · " + str(it.getValue()));
        return row;
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
