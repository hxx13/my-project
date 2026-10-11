package com.example.demo.modules.ai.tool.pack;

import com.example.demo.modules.ai.tool.AiTool;
import com.example.demo.modules.ai.tool.AiToolPack;
import com.example.demo.modules.ai.tool.AiView;
import com.example.demo.modules.ai.tool.SideEffect;
import com.example.demo.modules.ai.watch.entity.AiWatch;
import com.example.demo.modules.ai.watch.service.AiWatchService;
import com.example.demo.modules.auth.entity.User;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Predicate;

/**
 * **条件触发器**：当「查出来的条件」成立时，自动执行一个动作。
 *
 * <h2>它解决什么</h2>
 * 「大厅的门开了，就把监控室的门也开开」这类要求，**那一刻多半没人在对话里**。
 * 定时器只能表达「N 秒后做 X」，表达不了「等某件事发生再做 X」—— 这个包补的就是后者。
 *
 * <h2>安全边界：确认挪到建计划时，而且只挪这一处</h2>
 * 建计划这个工具声明为 {@link SideEffect#EXTERNAL_WRITE}，**唯一的目的就是让它必须过人点确认那一道**
 * （那是编排层的硬拦，见 {@link #watchFor()} 的注释）。到点执行时不再问 ——
 * 那一刻前端多半关着，问也没人点，问了就等于这条计划永远不执行。
 *
 * <p>所以建计划时**必须把条件与动作原样摆给人看**：这正是 {@code confirmDetail} 的用处，
 * 少了它弹窗里就是裸 JSON（设计文档 §14 把这种缺失列为「静默降级」）。
 *
 * <h2>判据怎么写</h2>
 * 检查 = 「用哪个查询工具、看结果的哪个字段」，判定 = 「比开始时多了 / 和开始时不一样 / 有内容 / …」。
 * **推荐用「比开始时多了」**（{@code INCREASED}）—— 它跟建计划时那次检查的取值比，
 * 于是「盯之前就发生过的事」不会被误当成刚发生，晚到的记录也不会被漏掉。
 */
@Component
public class WatchToolPack implements AiToolPack {

    /** 管理自己监视器的能力码：只能碰自己建的，人人可用。 */
    public static final String CAP_WATCH = "ai.watch.manage";

    private final AiWatchService watchService;

    public WatchToolPack(AiWatchService watchService) {
        this.watchService = watchService;
    }

    @Override
    public String packKey() {
        return "watch";
    }

    @Override
    public String displayName() {
        return "条件触发器";
    }

    @Override
    public Set<AiView> views() {
        return Set.of(AiView.STAFF, AiView.STUDENT);
    }

    @Override
    public String defaultPrompt() {
        return """
                ## 条件触发器：等某件事发生，再自动做某件事

                用户说「**如果/一旦/等** <某件事> **就** <做某件事>」，而他要的又是**当时没人在场**的，
                用 `watchFor` 建一条。典型：**大厅的门一开，就把监控室的门也开开**。

                - 只适用于「**条件能查出来**」的场景（门禁记录、库存、待办条数…）。条件查不出来的，如实说做不到。
                - **建之前先把要动的对象查清楚、把参数填全**（要开哪扇门，先 `listDoorChannels` 查出来）。
                  建这个动作本身会弹一道确认给人看，那一刻他会看到条件与动作的全部参数 —— **参数要一步到位**。
                - 判定优先用 `INCREASED`（**比开始时多了**）：
                  「门禁记录里出现一条新的合法开门」就该这么写，别写「条数大于 0」——
                  后者会把「你让我盯之前就发生过的事」也算进去。
                - 用户问「你在盯什么 / 取消掉」→ `listWatches` / `cancelWatch`。
                - **别拿它当定时器用**：纯按时间的用 `scheduleTimers`，那有专门的工具、也更好懂。

                ### 动作能用「刚查到的实际值」—— 用 {check.字段} 占位（**这条很值钱**）

                动作的参数不一定要写死。写 `{check.total}`、`{check.records.0.channel}` 这样的占位符，
                到点会换成**那一次检查到的实际值**。

                例：「大厅出现新的开门记录 → 开**刚开门那一扇**的门」：
                检查查大厅的记录，动作参数写 `{"mode":"OPEN","channels":["{check.records.0.channel}"]}`。
                —— 写死成「大厅的门」就只能开固定的那一扇，用占位符才是「跟着事件走」。

                **路径必须对得上检查结果的字段名**：建之前先跑一次那个查询工具，看看它返回什么字段。
                门禁记录里通道名字段叫 `channel`（**不叫 channelName**），是 `records[0].channel` 这个样子。

                ### 判「门开了没有」的语义（容易答错）
                **没查到记录 ≠ 没开成功**；但**出现失败记录 = 一定没开成功**。
                所以「门开了」的判据是「出现了**成功**的开门记录」，不是「有记录」。
                """;
    }

    @Override
    public Map<String, Predicate<User>> capabilities() {
        return Map.of(CAP_WATCH, user -> true);
    }

    @Override
    public List<AiTool> tools() {
        return List.of(watchFor(), listWatches(), cancelWatch());
    }

    private AiTool watchFor() {
        return new AiTool(
                "watchFor",
                "建一条条件触发器：**当 <条件> 成立时，自动执行 <动作>**。适合「当时没人在场」的场景"
                        + "（如「大厅门一开就开监控室的门」）。建这个动作会弹一道确认给用户看。",
                """
                        {"type":"object","properties":{
                          "label":{"type":"string","description":"一句话说明这条计划在干什么，给人看的，例如「大厅开门后开监控室的门」"},
                          "checkTool":{"type":"string","description":"用哪个查询工具来查条件，例如 queryAccessRecords。必须是只读工具"},
                          "checkArgs":{"type":"object","description":"查询工具的参数。**时间范围不用填**，系统会自动把它设成「从开始盯的那一刻起」"},
                          "checkField":{"type":"string","description":"看结果的哪个字段来判，例如 total（记录条数）。支持 a.b 路径"},
                          "checkOp":{"type":"string","enum":["INCREASED","CHANGED","NOT_EMPTY","EMPTY","GT","LT","EQ","NE"],
                                     "description":"怎么算成立。**优先 INCREASED（比开始时多了）**；NOT_EMPTY=有内容、EMPTY=为空，其余要配 checkValue"},
                          "checkValue":{"type":"string","description":"比较的值（GT/LT/EQ/NE 时必填；INCREASED/CHANGED/NOT_EMPTY/EMPTY 不用填）"},
                          "actTool":{"type":"string","description":"条件成立后执行哪个工具，例如 controlDoor"},
                          "actArgs":{"type":"object","description":"动作工具的参数，**要填全**（这一步到点没人再确认了）。可以用 {check.字段} 占位符引用刚查到的实际值 —— 例：channels 数组里写 {check.records.0.channel}，就是「开刚查到的那扇门」"},
                          "intervalSeconds":{"type":"integer","description":"多久查一次，秒。默认 30，最少 15"},
                          "timeoutSeconds":{"type":"integer","description":"最多盯多久，秒。默认 900，最多 7200"},
                          "notifyUserIds":{"type":"string","description":"结果推给谁（账号 id，逗号分隔）。不填就推给建单人"}
                        },"required":["label","checkTool","checkField","checkOp","actTool","actArgs"]}
                        """,
                CAP_WATCH,
                /*
                 * **借 EXTERNAL_WRITE 的「必须确认」语义**：这个档是编排层唯一会硬拦并要求用户点确认的。
                 *
                 * 建计划这一步**必须**有人点过确认 —— 因为到点执行时是无人值守的，那一次点击就是全部的安全边界。
                 * 声明成幂等写（不拦）会变成「模型说一句就建出一条将来会自动开门的计划」，那是安全降级。
                 */
                SideEffect.EXTERNAL_WRITE,
                (ctx, args) -> doWatchFor(ctx.actor(), ctx.sessionId(), ctx.messageId(), args),
                null,
                // 确认详情：把「盯什么、怎么算成立、成立后干什么、盯多久」翻成人话摆给人看。
                // 少了它弹窗里就是裸 JSON，那道确认就退化成走形式（设计文档 §14）
                // —— 实例方法引用：描述动作那一段要去问动作工具自己（见 actDetail）
                this::describe);
    }

    private Object doWatchFor(User actor, Long sessionId, Long messageId, JsonNode args) {
        try {
            AiWatchService.WatchSpec spec = new AiWatchService.WatchSpec(
                    text(args, "label"),
                    text(args, "checkTool"),
                    args.path("checkArgs"),
                    AiWatchService.DEFAULT_TIME_FIELD,
                    text(args, "checkField"),
                    text(args, "checkOp"),
                    text(args, "checkValue"),
                    text(args, "actTool"),
                    args.path("actArgs"),
                    args.path("intervalSeconds").isNumber() ? args.path("intervalSeconds").asInt() : null,
                    args.path("timeoutSeconds").isNumber() ? args.path("timeoutSeconds").asInt() : null,
                    text(args, "notifyUserIds"));
            AiWatch w = watchService.create(actor, spec, sessionId, messageId);
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("ok", true);
            out.put("watchId", w.getId());
            out.put("label", w.getLabel());
            out.put("baseline", w.getBaselineValue());
            out.put("note", "已经盯着了（编号 " + w.getId() + "）。**回复里说清你在盯什么、"
                    + "多久查一次、最多盯多久**，别只说「好的」。条件成立时你会被自动叫起来执行，"
                    + "那一刻用户可能不在。");
            return out;
        } catch (IllegalArgumentException e) {
            return Map.of("ok", false, "reason", e.getMessage());
        }
    }

    private AiTool listWatches() {
        return new AiTool(
                "listWatches",
                "列出用户自己正在盯（和盯过）的条件触发器。",
                """
                        {"type":"object","properties":{}}
                        """,
                CAP_WATCH,
                SideEffect.READ,
                (ctx, args) -> {
                    List<AiWatch> rows = watchService.listMine(ctx.actor(), 20);
                    List<Map<String, Object>> items = new ArrayList<>();
                    for (AiWatch w : rows) {
                        Map<String, Object> it = new LinkedHashMap<>();
                        it.put("id", w.getId());
                        it.put("label", w.getLabel());
                        it.put("status", statusZh(w.getStatus()));
                        it.put("checkedTimes", w.getAttempts());
                        it.put("result", w.getResultText());
                        items.add(it);
                    }
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("ok", true);
                    out.put("count", items.size());
                    out.put("watches", items);
                    out.put("note", items.isEmpty() ? "他还没建过条件触发器。如实说，别编。" : null);
                    return out;
                });
    }

    private AiTool cancelWatch() {
        return new AiTool(
                "cancelWatch",
                "取消用户自己的某条条件触发器。",
                """
                        {"type":"object","properties":{
                          "watchId":{"type":"integer","description":"要取消的编号（先用 listWatches 看）"}
                        },"required":["watchId"]}
                        """,
                CAP_WATCH,
                SideEffect.IDEMPOTENT_WRITE,
                (ctx, args) -> {
                    long id = args.path("watchId").asLong(0);
                    if (id <= 0) {
                        return Map.of("ok", false, "reason", "要给出要取消的编号，先用 listWatches 看看");
                    }
                    boolean gone = watchService.cancel(ctx.actor(), id);
                    if (!gone) {
                        return Map.of("ok", false,
                                "reason", "没取消成：要么不是你的，要么它已经不在盯着了（已完成/已超时/已取消）");
                    }
                    return Map.of("ok", true, "watchId", id, "note", "取消了，回复里说一声。");
                });
    }

    // ── 内部 ──

    /** 确认弹窗里那一行「本次…」：把四要素翻成人话，参数不摆 JSON。 */
    private String describe(JsonNode args) {
        String label = text(args, "label");
        String checkTool = text(args, "checkTool");
        String field = text(args, "checkField");
        String op = text(args, "checkOp").toUpperCase();
        String value = text(args, "checkValue");
        String actTool = text(args, "actTool");
        int interval = args.path("intervalSeconds").isNumber() ? args.path("intervalSeconds").asInt() : 30;
        int timeout = args.path("timeoutSeconds").isNumber() ? args.path("timeoutSeconds").asInt() : 900;

        StringBuilder sb = new StringBuilder();
        sb.append(StringUtils.hasText(label) ? label : "建一条条件触发器").append("：");
        sb.append("每 ").append(interval).append(" 秒查一次 ").append(checkTool);
        sb.append("（看 ").append(field).append(" ").append(opZh(op, value)).append("）");
        sb.append("；条件一成立就执行 ").append(actTool);
        String detail = actDetail(args);
        if (StringUtils.hasText(detail)) {
            sb.append("（").append(detail);
            if (detail.contains("{check.")) {
                sb.append("，其中 {check.…} 指条件里刚查到的实际值");
            }
            sb.append("）");
        }
        sb.append("；最多盯 ").append(timeout / 60).append(" 分钟。");
        sb.append(" ⚠️ 到点执行时不会再问 —— 这次点确认就是授权。");
        return sb.toString();
    }

    /**
     * 动作那一步「动的是哪个对象、用什么方式」—— **去问动作工具自己**，别在这儿再写一份说法。
     *
     * <p>这道确认是授权一次**无人值守**的动作，所以「开哪扇门、怎么开」必须摆在人眼前。
     * 只说一个工具名等于没说：用户看着 `controlDoor` 这四个字母点「确认执行」，
     * 那道确认就退化成走形式（设计文档 §14 把这种缺失列为「静默降级」）。
     *
     * <p>自己没写确认文案的工具（比如一个纯查询）返回空 —— 宁可不写这一段，
     * 也不能把参数原文的 JSON 摆进确认框。
     */
    private String actDetail(JsonNode args) {
        AiTool act = watchService.findTool(text(args, "actTool"));
        if (act == null || !act.hasConfirmDetail()) {
            return "";
        }
        JsonNode actArgs = args.path("actArgs");
        return act.confirmDetailOf(actArgs.isMissingNode() || actArgs.isNull() ? null : actArgs);
    }

    private static String opZh(String op, String value) {
        return switch (op) {
            case "INCREASED" -> "比开始时多";
            case "CHANGED" -> "和开始时不一样";
            case "NOT_EMPTY" -> "有内容";
            case "EMPTY" -> "为空";
            case "GT" -> "大于 " + value;
            case "LT" -> "小于 " + value;
            case "EQ" -> "等于 " + value;
            case "NE" -> "不等于 " + value;
            default -> op;
        };
    }

    private static String statusZh(String status) {
        if (AiWatch.WATCHING.equals(status)) return "盯着中";
        if (AiWatch.DONE.equals(status)) return "已触发并执行";
        if (AiWatch.EXPIRED.equals(status)) return "超时未成立";
        if (AiWatch.CANCELLED.equals(status)) return "已取消";
        return "失败";
    }

    private static String text(JsonNode args, String field) {
        JsonNode v = args.path(field);
        return v.isMissingNode() || v.isNull() ? "" : v.asText("").trim();
    }
}
