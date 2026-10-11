package com.example.demo.modules.ai.watch.service;

import com.example.demo.modules.ai.tool.AiToolContext;
import com.example.demo.modules.ai.core.CapturingEventSink;
import com.example.demo.modules.ai.service.AiOrchestrator;
import com.example.demo.modules.ai.timer.service.AiTimerService;
import com.example.demo.modules.ai.tool.AiTool;
import com.example.demo.modules.ai.tool.ToolRegistry;
import com.example.demo.modules.ai.capability.AiCapabilityGate;
import com.example.demo.modules.ai.watch.entity.AiWatch;
import com.example.demo.modules.ai.watch.mapper.AiWatchMapper;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.mapper.UserMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 条件触发器：**当「查出来的条件」成立时，执行「计划里的动作」**。
 *
 * <h2>到点之后是「让模型再进一轮」，不是裸调工具</h2>
 * 条件成立时走 {@link AiOrchestrator#runTriggered} —— 模型在对话上下文里再跑一轮。
 * 这样它能知道当初答应过什么、能调不止一个工具、也能说一句人话交代结果；
 * 而裸调工具只会留下一条没人看得懂的执行记录。
 *
 * <h2>那一刻没有人看着，所以确认挪到了建计划时</h2>
 * 前端多半关着（没人能点确认、也没人看得到流），所以创建时把「条件 + 动作参数」**原样**展示给人看过、
 * 点过一次确认，到点就直接执行。这是对「写操作必须确认」的**扩展**：确认对象从「这一次执行」
 * 变成「这个计划」；不这样做，这条计划就永远停在等确认 —— 等于废掉。
 *
 * <h2>判据比「大于 0」讲究</h2>
 * 见 {@link AiWatch} 的类注释：窗口从开始盯的那一刻起只增不减、并且跟**基线**比，
 * 这样「盯之前就发生过」和「记录晚到」两个坑都不会踩。
 */
@Service
public class AiWatchService {

    private static final Logger log = LoggerFactory.getLogger(AiWatchService.class);
    private static final DateTimeFormatter TS = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    /** 比较符。{@code INCREASED}/{@code CHANGED} 要跟基线比，其余跟 {@code checkValue} 比。 */
    public static final Map<String, String> OPS = new LinkedHashMap<>();

    static {
        OPS.put("INCREASED", "比开始时多了");
        OPS.put("CHANGED", "和开始时不一样");
        OPS.put("NOT_EMPTY", "有内容/不为空");
        OPS.put("EMPTY", "为空");
        OPS.put("GT", "大于");
        OPS.put("LT", "小于");
        OPS.put("EQ", "等于");
        OPS.put("NE", "不等于");
    }

    /** 两次检查之间的最小间隔 —— 再密就是拿库在烧，而门禁记录本来就是分钟级的。 */
    static final int MIN_INTERVAL_SECONDS = 15;
    /** 一次最多盯多久。 */
    static final int MAX_TIMEOUT_SECONDS = 2 * 3600;
    /** 一个人同时最多盯几条。 */
    static final int MAX_PER_USER = 3;

    /** 检查参数里哪个键是时间窗左端 —— 模型没指定就按 {@code from}
     *（项目里那两个查询工具都用这个键）。 */
    public static final String DEFAULT_TIME_FIELD = "from";

    private final AiWatchMapper mapper;
    private final ObjectMapper objectMapper;
    private final UserMapper userMapper;
    private final AiCapabilityGate capabilityGate;
    /**
     * 延迟注入：{@code ToolRegistry} 构造时要收集全部工具包，而监视器包依赖本服务 ——
     * 直接注入就是 ToolRegistry → WatchToolPack → 本类 → ToolRegistry 的构造器环。
     * {@code AiOrchestrator} 同理（它也拿 ToolRegistry）。照 {@code AiTimerService} 的写法。
     */
    private final ObjectProvider<ToolRegistry> toolRegistryProvider;
    private final ObjectProvider<AiOrchestrator> orchestratorProvider;

    public AiWatchService(AiWatchMapper mapper,
                          ObjectMapper objectMapper,
                          UserMapper userMapper,
                          AiCapabilityGate capabilityGate,
                          ObjectProvider<ToolRegistry> toolRegistryProvider,
                          ObjectProvider<AiOrchestrator> orchestratorProvider) {
        this.mapper = mapper;
        this.objectMapper = objectMapper;
        this.userMapper = userMapper;
        this.capabilityGate = capabilityGate;
        this.toolRegistryProvider = toolRegistryProvider;
        this.orchestratorProvider = orchestratorProvider;
    }

    private ToolRegistry toolRegistry() {
        return toolRegistryProvider.getObject();
    }

    /**
     * 按名字找工具，找不到返回 {@code null}。
     *
     * <p>给**确认文案**用：弹窗要说明「条件成立后会动哪一扇门」，而这件事动作工具自己最会描述
     * （{@code confirmDetail}），不该在监视器这边再写一份说法。
     */
    public AiTool findTool(String name) {
        return StringUtils.hasText(name) ? toolRegistry().tool(name.trim()) : null;
    }

    // ── 建计划 ──

    /**
     * 一次建计划请求（工具层直接照抄模型传来的字段）。
     *
     * @param checkTimeField 检查参数里**哪个字段是时间窗左端**（通常是 {@code from}）。
     *                       调度器每次检查前把它填成 {@code startedAt} —— 这样窗口只增不减，
     *                       晚到的记录不会掉进两窗之间的缝里（见 {@link AiWatch} 的类注释）。
     */
    public record WatchSpec(String label, String checkTool, JsonNode checkArgs, String checkTimeField,
                            String checkField, String checkOp, String checkValue,
                            String actTool, JsonNode actArgs, Integer intervalSeconds,
                            Integer timeoutSeconds, String notifyUserIds) {
    }

    public AiWatch create(User actor, WatchSpec spec, Long sessionId, Long messageId) {
        if (actor == null) {
            throw new IllegalArgumentException("未识别到操作人");
        }
        AiTool check = requireTool(actor, spec.checkTool(), "检查");
        AiTool act = requireTool(actor, spec.actTool(), "执行");
        /*
         * **检查工具必须只读。**
         *
         * 光在工具描述里写「必须是只读工具」是不够的 —— 那是给模型看的建议，不是墙。
         * 真让它把检查写成 controlDoor，这条监视器就变成**每 15 秒开一次门**，
         * 而且是无人值守地一直开下去。所以这里按副作用档**硬拦**：
         * 只有 READ 才配当「检查」。
         */
        if (check.sideEffect() != com.example.demo.modules.ai.tool.SideEffect.READ) {
            throw new IllegalArgumentException(
                    "「检查」那一步必须用只读工具（" + spec.checkTool() + " 是写操作）。"
                            + "写操作只能放在「条件成立后做什么」那一步。");
        }
        /*
         * **动作工具不许是那几个元工具** —— 与定时器同一份黑名单
         * （计时器自身 + 页面导航）：到点把用户面前的页面切走是惊吓不是功能，
         * 给监视器再挂监视器只会把模型绕进去。
         */
        if (!AiTimerService.isSchedulable(act.name())) {
            throw new IllegalArgumentException("这个工具不能被自动执行：" + act.name()
                    + "。换一个能对业务产生实际作用的工具。");
        }
        if (!StringUtils.hasText(spec.checkField())) {
            throw new IllegalArgumentException("没说清看哪个字段来判断条件成立");
        }
        String op = spec.checkOp() == null ? "" : spec.checkOp().trim().toUpperCase();
        if (!OPS.containsKey(op)) {
            throw new IllegalArgumentException("不认识的判定方式：" + op
                    + "。可用的有 " + String.join(" / ", OPS.keySet()));
        }
        if (!"INCREASED".equals(op) && !"CHANGED".equals(op) && !"NOT_EMPTY".equals(op)
                && !"EMPTY".equals(op) && !StringUtils.hasText(spec.checkValue())) {
            throw new IllegalArgumentException("判定方式「" + OPS.get(op) + "」要给出比较的值");
        }
        int interval = spec.intervalSeconds() == null ? 30 : spec.intervalSeconds();
        if (interval < MIN_INTERVAL_SECONDS) {
            throw new IllegalArgumentException("检查间隔至少 " + MIN_INTERVAL_SECONDS + " 秒");
        }
        int timeout = spec.timeoutSeconds() == null ? 900 : spec.timeoutSeconds();
        if (timeout > MAX_TIMEOUT_SECONDS) {
            throw new IllegalArgumentException("最多只能盯 " + (MAX_TIMEOUT_SECONDS / 3600) + " 小时");
        }
        if (timeout < interval * 2) {
            throw new IllegalArgumentException("盯的时间太短了，连两次都查不完");
        }
        if (mapper.countActive(actor.getId()) >= MAX_PER_USER) {
            throw new IllegalArgumentException("你已经盯着 " + MAX_PER_USER + " 条了，先取消一条再加");
        }

        LocalDateTime now = LocalDateTime.now();
        // **建计划时先查一次**：这一趟只为拿基线（后面判「比开始时多了」全靠它），
        // 顺带把「检查工具本身跑不通」在这一刻就暴露出来，而不是等到十分钟后才发现。
        String rawBaseline = runCheckTool(actor, check,
                withTimeWindow(spec.checkArgs(), spec.checkTimeField(), now));
        String baseline;
        try {
            baseline = fieldText(rawBaseline, spec.checkField());
        } catch (Exception e) {
            throw new IllegalArgumentException("检查工具返回的不是能看懂的结果，先看看它出了什么错："
                    + e.getMessage());
        }
        if (baseline == null) {
            /*
             * **字段取不到就当场退回**，别建一条注定不触发的计划。
             *
             * 检查工具返回的字段是固定的（门禁查询永远是 `{ok, total, records}`），
             * 所以「现在取不到」等于「将来也取不到」—— 静默建下去，用户以为盯着了，
             * 实际上永远不会响，这是最难发现的一种坏。当场退回，模型会去重查字段名再填一次。
             */
            throw new IllegalArgumentException("从 " + spec.checkTool() + " 的结果里取不到字段「"
                    + spec.checkField() + "」。先跑一次这个工具看它到底返回哪些字段，按实际字段名重填"
                    + "（例如条数是 total、记录列表是 records；**条数别写 records.channelName 这类**）。");
        }

        AiWatch w = new AiWatch();
        w.setOwnerUserId(actor.getId());
        w.setOwnerNameSnapshot(ownerName(actor));
        w.setSessionId(sessionId);
        w.setMessageId(messageId);
        w.setLabel(trim(spec.label(), 200));
        w.setCheckTool(spec.checkTool().trim());
        w.setCheckArgs(spec.checkArgs() == null || spec.checkArgs().isNull() ? "{}" : spec.checkArgs().toString());
        w.setCheckField(spec.checkField().trim());
        w.setCheckOp(op);
        w.setCheckValue(trim(spec.checkValue(), 64));
        w.setBaselineValue(trim(baseline, 64));
        w.setActTool(spec.actTool().trim());
        w.setActArgs(spec.actArgs() == null || spec.actArgs().isNull() ? "{}" : spec.actArgs().toString());
        w.setIntervalSeconds(interval);
        w.setTimeoutSeconds(timeout);
        w.setStatus(AiWatch.WATCHING);
        w.setNextCheckAt(now.plusSeconds(interval));
        w.setStartedAt(now);
        w.setNotifyUserIds(trim(spec.notifyUserIds(), 512));
        mapper.insert(w);
        log.info("[ai-watch] 建计划 id={} owner={} 检查={} 判定={} bas={} 动作={}",
                w.getId(), actor.getId(), w.getCheckTool(), op + "/" + w.getCheckField(),
                w.getBaselineValue(), w.getActTool());
        return w;
    }

    private AiTool requireTool(User actor, String name, String what) {
        String toolName = name == null ? "" : name.trim();
        if (!StringUtils.hasText(toolName)) {
            throw new IllegalArgumentException("没说清用哪个工具" + what);
        }
        AiTool tool = toolRegistry().tool(toolName);
        if (tool == null) {
            throw new IllegalArgumentException("没有这个工具：" + toolName);
        }
        String denial = capabilityGate.check(actor, tool.capability());
        if (denial != null) {
            throw new IllegalArgumentException("没有权限" + what + "它：" + denial);
        }
        return tool;
    }

    // ── 调度：该查的查一遍 ──

    /**
     * 跑一轮：把到点的挨个查一遍。
     *
     * <p><b>不加「认领」</b>：本方法只由 {@code @Scheduled(fixedDelay)} 单线程调用，
     * 上一轮没跑完不会有下一轮，天然不会并发双跑。将来若改成并行，必须补一个原子认领
     * （照 {@code AiTimerService.claim} 的写法）。
     */
    public int runDue(int limit) {
        List<Long> ids = mapper.dueIds(LocalDateTime.now(), limit);
        if (ids == null || ids.isEmpty()) {
            return 0;
        }
        int n = 0;
        for (Long id : ids) {
            try {
                checkOnce(id);
                n++;
            } catch (Exception e) {
                log.error("[ai-watch] 检查失败 id={}: {}", id, e.getMessage(), e);
            }
        }
        return n;
    }

    /** 查一条。成立就执行动作；不成立就推进下一次；超时就放弃。 */
    public void checkOnce(Long id) {
        AiWatch w = mapper.selectById(id);
        if (w == null || !AiWatch.WATCHING.equals(w.getStatus())) {
            return;
        }
        User owner = userMapper.findById(w.getOwnerUserId());
        if (owner == null) {
            mapper.finish(id, AiWatch.FAILED, "建单人的账号已不存在");
            return;
        }
        AiTool check = toolRegistry().tool(w.getCheckTool());
        if (check == null) {
            mapper.finish(id, AiWatch.FAILED, "检查用的工具已经不在了：" + w.getCheckTool());
            return;
        }
        // **每次重新判权限**（建计划时判过不算数：权限可能已被收掉），与定时器同一口径
        String denial = capabilityGate.check(owner, check.capability());
        if (denial != null) {
            mapper.finish(id, AiWatch.FAILED, "建单人已经没有检查权限了：" + denial);
            return;
        }

        String value;
        try {
            JsonNode args = objectMapper.readTree(
                    w.getCheckArgs() == null || w.getCheckArgs().isBlank() ? "{}" : w.getCheckArgs());
            value = runCheckTool(owner, check, withTimeWindow(args, DEFAULT_TIME_FIELD, w.getStartedAt()));
        } catch (Exception e) {
            // 检查本身失败**不当终态**：上游偶尔抽风，下一轮再来就是了；只有连续失败到超时才收掉
            log.warn("[ai-watch] id={} 检查出错: {}", id, e.getMessage());
            value = "";
        }

        boolean hit = StringUtils.hasText(value) && evaluate(value, w.getCheckField(), w.getCheckOp(),
                w.getCheckValue(), w.getBaselineValue());
        if (!hit) {
            LocalDateTime now = LocalDateTime.now();
            if (now.isAfter(w.getStartedAt().plusSeconds(w.getTimeoutSeconds()))) {
                mapper.finishAfterCheck(id, AiWatch.EXPIRED,
                        "盯了 " + (w.getTimeoutSeconds() / 60) + " 分钟条件一直没成立，先放弃。"
                                + "要接着盯就再说一声。");
                log.info("[ai-watch] id={} 超时放弃", id);
            } else {
                mapper.advance(id);
            }
            return;
        }

        // 成立 → **让模型再进一轮**（不是裸调工具），执行 + 说一句人话，回复落进那条会话
        String result = fireTriggeredTurn(w, value);
        mapper.finishAfterCheck(id, AiWatch.DONE, result);
        log.info("[ai-watch] id={} 条件成立并已执行", id);
    }

    private String fireTriggeredTurn(AiWatch w, String checkedValue) {
        if (w.getSessionId() == null) {
            return "条件成立，但这条计划没记会话，没法把结果说进对话里";
        }
        User owner = userMapper.findById(w.getOwnerUserId());
        if (owner == null) {
            return "建单人的账号已不存在";
        }
        String label = StringUtils.hasText(w.getLabel()) ? w.getLabel() : w.getActTool();
        /*
         * **把「确认过的那套动作」原样喂回去，并且用查到的实际值把占位符填好。**
         *
         * 不这样做有两个后果：
         *  ① 模型只能从「计划名 + 检查结果」猜该调什么、参数填什么 —— 它可能猜出**另一个**动作，
         *     而当初被人点确认的偏偏不是那一个；
         *  ② 建计划时确认的参数（「开大厅那扇门」）到了执行时变成模型的即兴发挥，那道确认就白点了。
         * 所以这里给的是**具体到参数**的一句话，模型照着执行即可。
         */
        String resolvedArgs = resolveActArgs(w.getActArgs(), checkedValue);
        StringBuilder nudge = new StringBuilder();
        nudge.append("你之前答应过一个条件任务：「").append(label).append("」。\n")
                .append("现在条件成立了（检查结果：").append(trim(checkedValue, 300)).append("）。\n")
                .append("按约定你要执行的是：调用 `").append(w.getActTool()).append("`，参数 ")
                .append(trim(resolvedArgs, 600)).append("。\n")
                .append("**照这个执行，别改动作、也别改参数**（参数已经用刚查到的实际数据填好了）。")
                .append("执行完用一两句人话说明你做了什么、结果如何。")
                .append("这是你和服务端约定的自动执行，不需要再向用户确认。")
                /*
                 * **必须说清「已经结束」**：这是一次性的计划，触发完就收工。
                 * 不说的话模型会顺口交代「仍在继续盯着」—— 用户以为还盯着，其实早停了，
                 * 于是该发生的事没发生、也不再有人提醒他。实测就是这么说的。
                 */
                .append("这条计划**只触发这一次，现在已经结束了** —— 别说「还会继续盯着 / 还在监视」这种话。");
        CapturingEventSink sink = new CapturingEventSink();
        try {
            orchestratorProvider.getObject().runTriggered(
                    owner, w.getSessionId(), nudge.toString(), "计划#" + w.getId(), sink);
            String said = sink.text().trim();
            return StringUtils.hasText(said) ? trim(said, 2000) : "已执行（模型没有回话）";
        } catch (Exception e) {
            log.error("[ai-watch] id={} 触发轮失败: {}", w.getId(), e.getMessage(), e);
            return "条件成立，但执行时报错：" + trim(e.getMessage(), 300);
        }
    }

    /**
     * 把动作参数里的 **`{check.字段}` 占位符**换成检查结果里的实际值。**纯函数**，可单测。
     *
     * <h2>为什么需要它</h2>
     * 没有它，动作的参数在建计划时就定死了，于是「开大厅那扇门」可以，但
     * 「开**刚查到的那扇**门」「把**查出来的这个人**加进名单」做不到 —— 而这恰恰是联动里最想要的一类。
     *
     * <h2>两个约定</h2>
     * <ul>
     *   <li>整串**就是一个占位符**、且取到的值是数字/布尔 → 保留原类型（别把个数字变成字符串传下去）。</li>
     *   <li>占位符**混在文字里**（如 {@code "3F-{check.records.0.roomName}"}）→ 按字符串拼。</li>
     * </ul>
     * 取不到的路径**原样留着**：让下游工具自己报「参数不对」，比悄悄换成空串好 ——
     * 空串可能被当成合法值，把动作打到一个不该打的对象上。
     */
    static String resolveActArgs(String actArgsJson, String checkResultJson) {
        if (actArgsJson == null || actArgsJson.isBlank()) {
            return "{}";
        }
        com.fasterxml.jackson.databind.ObjectMapper om = new com.fasterxml.jackson.databind.ObjectMapper();
        try {
            JsonNode args = om.readTree(actArgsJson);
            JsonNode result = om.readTree(checkResultJson == null ? "{}" : checkResultJson);
            JsonNode out = substitute(args, result);
            return out.toString();
        } catch (Exception e) {
            return actArgsJson;
        }
    }

    private static final java.util.regex.Pattern PH =
            java.util.regex.Pattern.compile("\\{check\\.([A-Za-z0-9_.\\-]+)\\}");

    private static JsonNode substitute(JsonNode node, JsonNode result) {
        if (node == null) {
            return com.fasterxml.jackson.databind.node.NullNode.getInstance();
        }
        if (node.isTextual()) {
            String text = node.asText();
            java.util.regex.Matcher m = PH.matcher(text);
            // 整串就是一个占位符 → 尽量保留原来的类型（数字别变成字符串）
            if (m.matches()) {
                JsonNode v = lookup(result, m.group(1));
                return v == null ? node : v;
            }
            StringBuilder sb = new StringBuilder();
            while (m.find()) {
                JsonNode v = lookup(result, m.group(1));
                m.appendReplacement(sb, java.util.regex.Matcher.quoteReplacement(
                        v == null ? m.group(0) : v.asText("")));
            }
            m.appendTail(sb);
            return com.fasterxml.jackson.databind.node.TextNode.valueOf(sb.toString());
        }
        if (node.isObject()) {
            com.fasterxml.jackson.databind.node.ObjectNode obj = (com.fasterxml.jackson.databind.node.ObjectNode) node.deepCopy();
            java.util.Iterator<String> names = obj.fieldNames();
            java.util.List<String> keys = new ArrayList<>();
            names.forEachRemaining(keys::add);
            for (String k : keys) {
                obj.set(k, substitute(obj.get(k), result));
            }
            return obj;
        }
        if (node.isArray()) {
            com.fasterxml.jackson.databind.node.ArrayNode arr = (com.fasterxml.jackson.databind.node.ArrayNode) node.deepCopy();
            for (int i = 0; i < arr.size(); i++) {
                arr.set(i, substitute(arr.get(i), result));
            }
            return arr;
        }
        return node;
    }

    /** 按 {@code a.b.0.c} 路径取值；取不到返回 null（调用方决定是留着还是填空）。 */
    private static JsonNode lookup(JsonNode result, String path) {
        JsonNode node = result;
        for (String seg : path.split("\\.")) {
            node = descend(node, seg);
        }
        return node == null || node.isMissingNode() ? null : node;
    }

    /**
     * 往下走一层。**数字段要在数组上按下标取** ——
     * {@code JsonNode.path("0")} 只按**字段名**找，在数组上永远返回 MissingNode，
     * 于是 {@code records.0.channelName} 这种写法会静默取不到值
     * （单测抓到的：占位符原样留着、条件里的数组路径也永远判为空）。
     */
    private static JsonNode descend(JsonNode node, String seg) {
        if (node == null || node.isMissingNode()) {
            return null;
        }
        if (node.isArray() && seg.matches("\\d+")) {
            return node.path(Integer.parseInt(seg));
        }
        return node.path(seg);
    }

    // ── 查 / 停 ──

    public List<AiWatch> listMine(User actor, int limit) {
        return mapper.listByOwner(actor.getId(), limit);
    }

    /** 取消一条。返回 false = 不是你的、或者它已经不在盯着了。 */
    public boolean cancel(User actor, Long id) {
        return mapper.cancel(id, actor.getId()) > 0;
    }

    // ── 内部 ──

    /** 把检查参数里的时间窗左端填成给定时刻，保证窗口从开始盯的那一刻起只增不减。 */
    JsonNode withTimeWindow(JsonNode args, String field, LocalDateTime since) {
        Map<String, Object> m = new LinkedHashMap<>();
        if (args != null && args.isObject()) {
            args.fields().forEachRemaining(e -> m.put(e.getKey(), e.getValue().isTextual()
                    ? e.getValue().asText() : e.getValue()));
        }
        String key = StringUtils.hasText(field) ? field.trim() : "from";
        m.put(key, since.format(TS));
        return objectMapper.valueToTree(m);
    }

    /** 跑一次检查工具，把结果压成一个字符串（判据只跟这个字符串比）。 */
    private String runCheckTool(User actor, AiTool tool, JsonNode args) {
        Object out;
        try {
            out = tool.executor().execute(new AiToolContext(actor, null, null, "（条件检查）"), args);
        } catch (Exception e) {
            /*
             * 检查工具自己报错 —— 包成非受检抛出去，由调用方决定怎么处置：
             * 建计划时**当场告诉用户**（别等十分钟后才发现工具跑不通）；
             * 盯的过程中则只是**这一轮跳过**、下一轮再来，不把计划判死。
             */
            throw new IllegalStateException("检查工具执行失败：" + e.getMessage(), e);
        }
        if (out == null) {
            return "";
        }
        JsonNode node = objectMapper.valueToTree(out);
        return node.toString();
    }

    /**
     * 从检查结果里取出**字段值**（容器取元素个数）。这是全链路唯一的取值口径。
     *
     * <p>取不到字段返回 {@code null}；结果不是 JSON 则抛异常（调用方各自决定怎么处置：
     * 判定时判不成立，建计划时当场退回）。
     *
     * <p>**容器取元素个数，标量取文本**。少了这一手，字段指向数组/对象时 `asText()` 返回的是
     * 空串 —— 于是「有内容」判不出来、「比开始时多了」也永远为假。而实际结果里这两种都在
     * （门禁查询返回的是 `{total: 4, records: [...]}`，模型指哪个都可能）。
     * 取个数之后，「看 records 的条数」与「看 total」就是同一套语法了。
     */
    static String fieldText(String rawJson, String field) throws Exception {
        JsonNode node = STATIC_MAPPER.readTree(rawJson);
        for (String seg : field.split("\\.")) {
            node = descend(node, seg);
            if (node == null) {
                return null;
            }
        }
        if (node == null || node.isMissingNode() || node.isNull()) {
            return null;
        }
        return node.isContainerNode() ? String.valueOf(node.size()) : node.asText("");
    }

    /** 判定的纯函数要有个静态 mapper；别为此去碰实例状态（那样就不纯了）。 */
    private static final com.fasterxml.jackson.databind.ObjectMapper STATIC_MAPPER =
            new com.fasterxml.jackson.databind.ObjectMapper();

    /**
     * 判条件成不成立。**纯函数**，可单测。
     *
     * @param rawResult 检查结果的 JSON 原文（这里现解析、按 {@code field} 取值）
     * @param baseline  **建计划那一刻的字段值**（不是整份结果的 JSON！见 {@code create}）
     */
    static boolean evaluate(String rawResult, String field, String op, String value, String baseline) {
        String now;
        try {
            now = fieldText(rawResult, field);
        } catch (Exception e) {
            // 结果不是 JSON：**一律判不成立**。宁可不动，也别乱动 ——
            // 拿一个看不懂的结果去执行动作（比如开门）是最坏的一种错。
            return false;
        }
        if (now == null) {
            now = "";
        }
        switch (op == null ? "" : op) {
            case "NOT_EMPTY" -> {
                return StringUtils.hasText(now) && !"0".equals(now) && !"[]".equals(now) && !"{}".equals(now);
            }
            case "EMPTY" -> {
                return !StringUtils.hasText(now) || "0".equals(now) || "[]".equals(now) || "{}".equals(now);
            }
            case "INCREASED" -> {
                Double a = num(baseline);
                Double b = num(now);
                return a != null && b != null && b > a;
            }
            case "CHANGED" -> {
                return !java.util.Objects.equals(baseline == null ? "" : baseline.trim(), now.trim());
            }
            case "GT" -> { return cmp(now, value) > 0; }
            case "LT" -> { return cmp(now, value) < 0; }
            case "EQ" -> { return cmp(now, value) == 0; }
            case "NE" -> { return cmp(now, value) != 0; }
            default -> {
                return false;
            }
        }
    }

    /** 能当数字比就按数字比，否则按字符串比 —— 判据里的值多半是数字（条数），但别对非数字炸掉。 */
    private static int cmp(String a, String b) {
        Double x = num(a);
        Double y = num(b);
        if (x != null && y != null) {
            return Double.compare(x, y);
        }
        return String.valueOf(a).compareTo(String.valueOf(b));
    }

    private static Double num(String s) {
        if (s == null || s.isBlank()) {
            return null;
        }
        try {
            return Double.parseDouble(s.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private String ownerName(User actor) {
        String n = actor.getName();
        return trim(StringUtils.hasText(n) ? n : actor.getUsername(), 64);
    }

    private static String trim(String s, int max) {
        if (s == null) {
            return null;
        }
        String t = s.strip();
        return t.length() <= max ? t : t.substring(0, max);
    }

    /** 给工具层用的：把可选的 ops 说清楚。 */
    public static Collection<String> opNames() {
        return new ArrayList<>(OPS.keySet());
    }
}
