package com.example.demo.modules.ai.tool.pack;

import com.example.demo.modules.ai.timer.entity.AiTimer;
import com.example.demo.modules.ai.timer.service.AiTimerService;
import com.example.demo.modules.ai.tool.AiTool;
import com.example.demo.modules.ai.tool.AiToolPack;
import com.example.demo.modules.ai.tool.SideEffect;
import com.example.demo.modules.auth.entity.User;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Predicate;

/**
 * 计时器包 —— **通用工具链接口**：把任何一个已注册的工具挂到未来的某个时刻执行。
 *
 * <p>它不认识任何业务域：建单只记「工具名 + 参数 + 绝对触发时间」，到点由
 * {@link AiTimerService} 从 {@link ToolRegistry} 现取执行体。所以以后新加的每一个工具包
 * 都**自动可被定时调度**，本类一行都不用改（设计文档 §3）。
 *
 * <p>四个工具的分工：{@code listSchedulableTools} 是「有哪些工具可定时」，
 * {@code listTimers} 是「已经挂了哪些」——一个朝前看、一个朝后看，模型最常缺的就是这两个视野。
 *
 * <p>建单与停止都是写操作 → 侧效等级 {@code BULK}（批量、影响多个对象），必然过用户确认。
 */
@Component
public class TimerToolPack implements AiToolPack {

    /** 用计时器：登录即可（学生账号已被 AiOrchestrator.requireStaffView 统一挡在网关外）。 */
    public static final String CAP_TIMER_USE = "ai.timer.use";

    private static final DateTimeFormatter TS = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final int MAX_SCHEDULABLE_ROWS = 60;
    private static final int MAX_LIST_ROWS = 40;

    private final AiTimerService timerService;

    public TimerToolPack(AiTimerService timerService) {
        this.timerService = timerService;
    }

    @Override
    public String packKey() {
        return "timer";
    }

    @Override
    public String displayName() {
        return "计时器";
    }

    @Override
    public Set<String> routeHints() {
        // 「秒后」「分钟后」是用户交代定时任务时最自然的说法（「10 秒后查一下湿度」），
        // 只写「计时器」接不住口语。这几个词本身就是本域的信号，命中即带上本包。
        return Set.of("计时器", "定时器", "定时执行", "定时", "倒计时", "闹钟",
                "秒后", "分钟后", "小时后", "过一会儿", "稍后", "延迟执行", "延迟一下");
    }

    @Override
    public String defaultPrompt() {
        return """
                计时器的口径：
                - 它是**通用**的：能定时的不是少数几个工具，而是**这个身份有权调用的任何一个工具**。
                  用户说「过 5 分钟帮我做 X」时，X 是哪个工具就定时哪个工具，不要因为「这台工具好像不是定时的」而拒绝。
                - **先确认有哪些工具可定时** → listSchedulableTools（列出你有权定时的全部工具）；
                  **先确认已经挂了哪些** → listTimers。这两个工具一眼看清能力边界，别凭印象编工具名。
                - 建单 → scheduleTimers。时间优先用 delaySeconds（相对秒数，最不容易算错）；
                  用户给的是绝对时刻（「明天 9 点」）才用 fireAt，格式 yyyy-MM-dd HH:mm:ss，
                  当前时间见上面的「当前时间」。一次最多 10 条。
                - **label 一定要写**，用一句人话说明「到点要干什么」（「5 分钟后同步门禁流水」）——
                  用户在后端页面上就是靠这句话认出来的，别写成工具名。
                - 到点行为分两档，**要主动告诉用户**：查数据这类**读操作会自动执行**；
                  而会改动数据 / 动外部设备的操作到点后**会停下来等用户点确认**（定时执行时用户不在场，
                  不能替他做不可逆的事）。所以「5 分钟后给张三免冻」不要答成「已经安排好了」——
                  答成「到点会提醒你确认」。
                - 停 → cancelTimers：给 ids 停指定的，说「全部」才传 all=true。
                - **只能看和停自己的计时器**（超级管理员及以上可以看全部人的，那是后门不是常规路径）。
                - 计时器是**一次性**的，没有循环；需要每天重复的任务是另一套机制，不要用本工具假装能做到。""";
    }

    @Override
    public Map<String, Predicate<User>> capabilities() {
        return Map.of(CAP_TIMER_USE, user -> true);
    }

    @Override
    public List<AiTool> tools() {
        return List.of(listSchedulableTools(), listTimers(), scheduleTimers(), cancelTimers());
    }

    // ── 有哪些工具可被定时 ──

    private AiTool listSchedulableTools() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "keyword": { "type": "string", "description": "按名字或用途过滤，例如「同步」「环境」「门禁」" },
                    "limit": { "type": "integer", "description": "最多回几条，默认 40，上限 60" }
                  },
                  "additionalProperties": false
                }""";
        return new AiTool(
                "listSchedulableTools",
                "列出**当前身份有权定时执行的全部工具**（工具名 + 一句用途）。"
                        + "用户说「过 N 分钟做某件事」而你不确定这件事归哪个工具时，先用它。"
                        + "注意这里列的是全平台所有可定时工具，不只是这一轮对话里发给你那几个。",
                schema, CAP_TIMER_USE, SideEffect.READ,
                (ctx, args) -> {
                    String keyword = text(args, "keyword");
                    int limit = Math.min(Math.max(args.path("limit").asInt(40), 1), MAX_SCHEDULABLE_ROWS);
                    List<AiTool> found = timerService.schedulableTools(ctx.actor(), keyword, limit);
                    List<Map<String, Object>> rows = new ArrayList<>();
                    for (AiTool t : found) {
                        Map<String, Object> row = new LinkedHashMap<>();
                        row.put("toolName", t.name());
                        row.put("what", oneLine(t.confirmPhrase()));
                        row.put("needsConfirmAtFireTime", t.requiresConfirm());
                        rows.add(row);
                    }
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("ok", true);
                    out.put("count", rows.size());
                    out.put("tools", rows);
                    if (rows.isEmpty()) {
                        out.put("note", "没有匹配的工具；换个关键词，或去掉 keyword 看全部");
                    } else {
                        out.put("note", "needsConfirmAtFireTime=true 的那些，到点后会停下来等用户确认再执行");
                    }
                    return out;
                });
    }

    // ── 已经挂了哪些 ──

    private AiTool listTimers() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "status": {
                      "type": "string",
                      "enum": ["PENDING", "AWAITING_CONFIRM", "FIRED", "CANCELLED", "FAILED"],
                      "description": "只看某个状态；省略 = 全部（在跑的排前面）"
                    },
                    "all": { "type": "boolean", "description": "看**所有人**的计时器。仅超级管理员及以上可用，普通账号会被拒" }
                  },
                  "additionalProperties": false
                }""";
        return new AiTool(
                "listTimers",
                "列出计时器：正在倒计时的、到点等人确认的、已经跑完的（含执行结果）。"
                        + "用户问「我定了哪些定时任务」「那个计时器跑了吗」时用它。默认只看自己的。",
                schema, CAP_TIMER_USE, SideEffect.READ,
                (ctx, args) -> {
                    boolean all = args.path("all").asBoolean(false);
                    List<AiTimer> timers;
                    try {
                        timers = timerService.list(ctx.actor(), all, null, text(args, "status"));
                    } catch (IllegalStateException e) {
                        return Map.of("ok", false, "reason", e.getMessage());
                    }
                    List<Map<String, Object>> rows = new ArrayList<>();
                    for (AiTimer t : timers) {
                        if (rows.size() >= MAX_LIST_ROWS) {
                            break;
                        }
                        Map<String, Object> row = timerService.describe(t);
                        row.put("owner", t.getOwnerNameSnapshot());
                        rows.add(row);
                    }
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("ok", true);
                    out.put("now", LocalDateTime.now().format(TS));
                    out.put("count", rows.size());
                    out.put("timers", rows);
                    out.put("note", "remainingSeconds 是服务端此刻算的，只是给你参考；"
                            + "页面上的倒计时以 fireAt 为锚，服务器重启也不会偏");
                    return out;
                });
    }

    // ── 建单（批量）──

    private AiTool scheduleTimers() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "timers": {
                      "type": "array",
                      "description": "要建的计时器，一次最多 10 条",
                      "items": {
                        "type": "object",
                        "properties": {
                          "toolName": { "type": "string", "description": "到点执行哪个工具，必须是 listSchedulableTools 里列出的名字" },
                          "arguments": { "type": "object", "description": "传给那个工具的参数，照它自己的参数说明写；不确定就传空对象 {}" },
                          "delaySeconds": { "type": "integer", "description": "多少秒后执行（相对时间优先用这个），最少 1 秒，最多 7 天" },
                          "fireAt": { "type": "string", "description": "绝对时刻 yyyy-MM-dd HH:mm:ss；与 delaySeconds 二选一，两个都给以它为准" },
                          "label": { "type": "string", "description": "一句人话说明到点干什么，例如「5 分钟后同步门禁流水」" }
                        },
                        "required": ["toolName", "label"],
                        "additionalProperties": false
                      }
                    }
                  },
                  "required": ["timers"],
                  "additionalProperties": false
                }""";
        return new AiTool(
                "scheduleTimers",
                "建立一个或多个计时器：到点替你执行指定的工具。支持任何有权调用、且未被排除的工具（不止这一类）。"
                        + "**只在用户明确要求「过一会儿/到某个时间再做某事」时用**；"
                        + "用户只是想现在就做，就直接调那个工具，不要用它绕一圈。"
                        + "参数不齐（没说多久之后、没说对谁）就先问清楚再调。",
                schema, CAP_TIMER_USE, SideEffect.BULK,
                (ctx, args) -> {
                    JsonNode arr = args.path("timers");
                    if (!arr.isArray() || arr.isEmpty()) {
                        return Map.of("ok", false, "reason", "要建哪些计时器？每条至少要有 toolName 和 label");
                    }
                    if (arr.size() > AiTimerService.MAX_BATCH) {
                        return Map.of("ok", false, "reason",
                                "一次最多建 " + AiTimerService.MAX_BATCH + " 条，请拆成几批");
                    }
                    List<Map<String, Object>> created = new ArrayList<>();
                    List<String> failed = new ArrayList<>();
                    for (JsonNode node : arr) {
                        String toolName = text(node, "toolName");
                        try {
                            AiTimer t = timerService.schedule(ctx.actor(),
                                    new AiTimerService.ScheduleSpec(toolName, node.path("arguments"),
                                            node.path("delaySeconds").isMissingNode() || node.path("delaySeconds").isNull()
                                                    ? null : node.path("delaySeconds").asInt(),
                                            text(node, "fireAt"), text(node, "label")),
                                    ctx.sessionId(), ctx.messageId());
                            created.add(timerService.describe(t));
                        } catch (RuntimeException e) {
                            // 逐条报错：一条建不成不该把同批其他几条一起废掉
                            failed.add((toolName.isEmpty() ? "（没给工具名）" : toolName) + "：" + e.getMessage());
                        }
                    }
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("ok", !created.isEmpty());
                    out.put("created", created);
                    out.put("failed", failed);
                    out.put("note", created.isEmpty()
                            ? "一条都没建成，看 failed 里的原因"
                            : "已开始倒计时。读操作到点自动执行；会改动数据/外部设备的操作到点会停下来等你确认");
                    return out;
                },
                null,
                TimerToolPack::describeSchedule);
    }

    /** 确认卡上「本次…」那一行：把将建的几张单列成人话，别让用户看一串参数 JSON。 */
    private static String describeSchedule(JsonNode args) {
        JsonNode arr = args == null ? null : args.path("timers");
        if (arr == null || !arr.isArray() || arr.isEmpty()) {
            return "本次参数：" + String.valueOf(args);
        }
        StringBuilder sb = new StringBuilder("将建立 ").append(arr.size()).append(" 个计时器：");
        for (JsonNode n : arr) {
            String when = n.path("delaySeconds").isMissingNode() || n.path("delaySeconds").isNull()
                    ? text(n, "fireAt") : n.path("delaySeconds").asInt() + " 秒后";
            sb.append("\n· ").append(when.isEmpty() ? "（未给时间）" : when)
              .append(" · ").append(text(n, "label").isEmpty() ? text(n, "toolName") : text(n, "label"))
              .append(" [").append(text(n, "toolName")).append(']');
        }
        return sb.toString();
    }

    // ── 停（批量）──

    private AiTool cancelTimers() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "ids": {
                      "type": "array",
                      "items": { "type": "integer" },
                      "description": "要停的计时器 id（来自 listTimers）。用户报了具体哪几个就传这个"
                    },
                    "all": { "type": "boolean", "description": "停掉全部在倒计时/等确认的。用户说「全部停掉」才传 true" }
                  },
                  "additionalProperties": false
                }""";
        return new AiTool(
                "cancelTimers",
                "停掉还没执行的计时器（一个或全部）。"
                        + "**只能停自己的**；已经执行完的停不了。"
                        + "用户说「别执行了」「取消那个定时」时用它——用户没说清是哪几个就先 listTimers 问一句，别默认全部。",
                schema, CAP_TIMER_USE, SideEffect.BULK,
                (ctx, args) -> {
                    List<Long> ids = new ArrayList<>();
                    JsonNode arr = args.path("ids");
                    if (arr.isArray()) {
                        for (JsonNode n : arr) {
                            if (n.canConvertToLong()) {
                                ids.add(n.asLong());
                            }
                        }
                    }
                    boolean all = args.path("all").asBoolean(false);
                    int stopped;
                    try {
                        stopped = timerService.cancel(ctx.actor(), ids, all);
                    } catch (RuntimeException e) {
                        return Map.of("ok", false, "reason", e.getMessage());
                    }
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("ok", stopped > 0);
                    out.put("stopped", stopped);
                    out.put("note", stopped == 0
                            ? "没有停掉任何一条（id 不对、或者它们已经执行完/已经被停了）"
                            : "已停止 " + stopped + " 条");
                    return out;
                });
    }

    private static String text(JsonNode node, String field) {
        JsonNode n = node == null ? null : node.path(field);
        return n == null || !n.isTextual() ? "" : n.asText("").trim();
    }

    /** 供路由与列表用的一行摘要（去掉换行，太长截断）。 */
    private static String oneLine(String s) {
        if (s == null) {
            return "";
        }
        String flat = s.replaceAll("\\s+", " ").strip();
        return flat.length() <= 60 ? flat : flat.substring(0, 60) + "…";
    }
}
