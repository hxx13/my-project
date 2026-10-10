package com.example.demo.modules.ai.timer.service;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.ai.capability.AiCapabilityGate;
import com.example.demo.modules.ai.entity.AiMessage;
import com.example.demo.modules.ai.service.AiOrchestrator;
import com.example.demo.modules.ai.service.AiSessionService;
import com.example.demo.modules.ai.shot.PageShotArchiveService;
import com.example.demo.modules.llm.service.DashScopeChatClient;
import com.example.demo.modules.notification.push.dispatch.PushService;
import com.example.demo.modules.ai.timer.entity.AiTimer;
import com.example.demo.modules.ai.timer.mapper.AiTimerMapper;
import com.example.demo.modules.ai.tool.AiTool;
import com.example.demo.modules.ai.tool.AiToolContext;
import com.example.demo.modules.ai.tool.ToolRegistry;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.mapper.UserMapper;
import com.example.demo.modules.auth.service.UserDisplayNameService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * AI 计时器 —— 大模型定的时，替**建单人**把那个工具跑一次。
 *
 * <p>三条设计口径（详见 docs/02-设计存档/计划文档/2026-10-09-AI计时器与通用工具调度-设计.md）：
 * <ol>
 *   <li><b>时间是绝对的。</b>只存 {@code fire_at}，不存「剩余秒数」—— 服务器重启后倒计时照样准。</li>
 *   <li><b>通用。</b>只认「工具名 + 参数」，到点从 {@link ToolRegistry} **现取**执行体。
 *       任何工具包（含以后新加的）自动可被定时，本类不需要认识任何一个业务域。</li>
 *   <li><b>归属 fail-closed。</b>非本人且非 ≥SUPER_ADMIN 一律拒；拒就是拒，**不静默跳过**——
 *       静默会让越权和「查不到」看起来一模一样。</li>
 * </ol>
 *
 * <p>到点执行前的两道墙与普通工具调用同源：工具白名单（{@link ToolRegistry}）+
 * 能力闸门（{@link AiCapabilityGate}）。**到点会再判一次能力** —— 建单时有权、到点被收权，
 * 就不该照跑。
 */
@Service
public class AiTimerService {

    private static final Logger log = LoggerFactory.getLogger(AiTimerService.class);

    /** 最长可定 7 天。再长不该用计时器（周期任务走既有的定时管理）。 */
    public static final int MAX_DELAY_SECONDS = 7 * 24 * 3600;
    /** 一次批量建单上限（防放大：有权限的人被诱导一次挂几百个）。 */
    public static final int MAX_BATCH = 10;
    /** 列表上限。 */
    public static final int MAX_LIST = 200;
    /** 认领后多久还算「在执行中」，超过即视为僵尸单收成 FAILED。 */
    private static final int STALE_FIRING_MINUTES = 10;

    private static final DateTimeFormatter TS = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final AiTimerMapper mapper;
    /**
     * 工具注册表**延迟解析**。
     *
     * <p>直接注入会形成构造器循环：{@code ToolRegistry} 构造时要收集全部 {@link AiToolPack}，
     * 而计时器包（{@code TimerToolPack}）依赖本类 —— ToolRegistry → TimerToolPack → 本类 → ToolRegistry。
     * 构造器注入的循环 Spring 解不开（启动直接报 cycle）。改成用的时候再取，
     * 循环就断在这里：本类构造时不碰注册表，而真正要用它的时候（请求期 / 调度 tick）容器早已就绪。
     */
    private final ObjectProvider<ToolRegistry> toolRegistryProvider;
    private final AiCapabilityGate capabilityGate;
    private final UserMapper userMapper;
    private final UserDisplayNameService displayNameService;
    private final ObjectMapper objectMapper;
    /**
     * 页面截图（无人值守那条产图路）。**可以直接注入**：它只依赖渲染与产物两个服务，
     * 谁也回不到工具注册表，不会形成上面那个构造器环。
     */
    private final PageShotArchiveService pageShotArchive;
    /** 到点执行完把结果**写回会话**（服务端持久化，不是本地缓存）。 */
    private final AiSessionService sessionService;
    /** 只用来把工具返回的 JSON 讲成人话、并现写通知内容；不参与任何判定。 */
    private final DashScopeChatClient chatClient;
    /** 执行完推一条通知（源/渠道/模板在 /console/admin/push-config 那套里配）。 */
    private final PushService pushService;

    public AiTimerService(AiTimerMapper mapper,
                          ObjectProvider<ToolRegistry> toolRegistryProvider,
                          AiCapabilityGate capabilityGate,
                          UserMapper userMapper,
                          UserDisplayNameService displayNameService,
                          ObjectMapper objectMapper,
                          PageShotArchiveService pageShotArchive,
                          AiSessionService sessionService,
                          DashScopeChatClient chatClient,
                          PushService pushService) {
        this.mapper = mapper;
        this.toolRegistryProvider = toolRegistryProvider;
        this.capabilityGate = capabilityGate;
        this.userMapper = userMapper;
        this.displayNameService = displayNameService;
        this.objectMapper = objectMapper;
        this.pageShotArchive = pageShotArchive;
        this.sessionService = sessionService;
        this.chatClient = chatClient;
        this.pushService = pushService;
    }

    /** 取注册表（见字段注释：不在构造期解析，避免与工具包形成环）。 */
    private ToolRegistry toolRegistry() {
        return toolRegistryProvider.getObject();
    }

    /**
     * 一次建单请求（工具层可以直接照抄模型传来的参数字段）。
     *
     * @param needConfirm   到点是否**先等用户确认**。默认 false（到点直接跑）—— 建单那次确认就是同意书；
     *                      只有不可逆的高危操作才由模型/用户主动要求加这道保险。
     * @param notifyUserIds 执行成功后**推送给谁**（逗号分隔账号 id）。空 = 推给建单人（当前对话的人）。
     *                      模型要推给别人时，先用 searchPerson 拿到账号 id 再传进来。
     */
    public record ScheduleSpec(String toolName, JsonNode arguments, Integer delaySeconds,
                               String fireAt, String label, Boolean needConfirm, String notifyUserIds) {
    }

    // ── 建单 ──

    /**
     * 落一条计时器。**建单前先判**：工具在白名单、且这个人现在有权用它。
     *
     * <p>为什么不「先建了、到点再拒」：那会把一次越权尝试变成一条永远失败的计时器，
     * 用户看到的是一堆失败记录而不是一句「你没权限」。到点还会再判一次（权限可能被收掉）。
     */
    public AiTimer schedule(User actor, ScheduleSpec spec, Long sessionId, Long messageId) {
        if (actor == null) {
            throw new IllegalArgumentException("未识别到操作人");
        }
        String toolName = spec == null || spec.toolName() == null ? "" : spec.toolName().trim();
        AiTool tool = toolRegistry().tool(toolName);
        if (tool == null) {
            throw new IllegalArgumentException("没有这个工具：" + toolName);
        }
        String denial = capabilityGate.check(actor, tool.capability());
        if (denial != null) {
            throw new IllegalArgumentException("没有权限定时执行它：" + denial);
        }
        LocalDateTime fireAt = resolveFireAt(spec);
        LocalDateTime now = LocalDateTime.now();
        if (fireAt.isBefore(now.minusSeconds(2))) {
            throw new IllegalArgumentException("这个时间已经过去了（" + fireAt.format(TS) + "）");
        }
        if (Duration.between(now, fireAt).getSeconds() > MAX_DELAY_SECONDS) {
            throw new IllegalArgumentException("最多只能定到 7 天以内");
        }

        AiTimer t = new AiTimer();
        t.setOwnerUserId(actor.getId());
        t.setOwnerNameSnapshot(ownerName(actor));
        t.setOwnerRoleSnapshot(actor.getRole() == null ? null : actor.getRole().name());
        t.setLabel(trim(spec.label(), 200));
        t.setToolName(toolName);
        t.setArgsJson(writeArgs(spec.arguments()));
        t.setFireAt(fireAt);
        t.setStatus(AiTimer.STATUS_PENDING);
        t.setSessionId(sessionId);
        t.setMessageId(messageId);
        t.setNeedConfirm(Boolean.TRUE.equals(spec.needConfirm()));
        t.setNotifyUserIds(trim(spec.notifyUserIds(), 512));
        mapper.insert(t);
        log.info("[ai-timer] 建单 id={} owner={} tool={} fireAt={}",
                t.getId(), actor.getId(), toolName, fireAt.format(TS));
        return t;
    }

    /** {@code fireAt}（绝对时间）与 {@code delaySeconds}（相对）二选一，两者都给以 {@code fireAt} 为准。 */
    private LocalDateTime resolveFireAt(ScheduleSpec spec) {
        String raw = spec.fireAt() == null ? "" : spec.fireAt().trim();
        if (!raw.isEmpty()) {
            try {
                return LocalDateTime.parse(raw.replace('T', ' ').substring(0, 19), TS);
            } catch (RuntimeException e) {
                throw new IllegalArgumentException("时间格式要写成 yyyy-MM-dd HH:mm:ss，收到的是：" + raw);
            }
        }
        int delay = spec.delaySeconds() == null ? 60 : spec.delaySeconds();
        if (delay < 1) {
            throw new IllegalArgumentException("延时至少 1 秒");
        }
        return LocalDateTime.now().plusSeconds(Math.min(delay, MAX_DELAY_SECONDS));
    }

    /** 参数必须是对象（OpenAI 的 arguments 就是对象）；缺省当空对象。**原样存字符串**，不改写。 */
    private String writeArgs(JsonNode arguments) {
        try {
            if (arguments == null || arguments.isNull() || arguments.isMissingNode()) {
                return "{}";
            }
            return objectMapper.writeValueAsString(arguments);
        } catch (Exception e) {
            throw new IllegalArgumentException("参数不是合法 JSON");
        }
    }

    // ── 查询 ──

    /**
     * 列表。
     *
     * @param allScope ≥SUPER_ADMIN 才允许 true（看全部人的）；普通账号传 true 直接拒，
     *                 **不回落到「只看自己的」**——静默降级会让人以为「别人没有计时器」
     */
    public List<AiTimer> list(User actor, boolean allScope, String ownerFilter, String status) {
        if (allScope && !isSuper(actor)) {
            throw new IllegalStateException("只有超级管理员及以上能查看全部计时器");
        }
        return mapper.selectList(actor.getId(), allScope, ownerFilter, nullIfBlank(status), MAX_LIST);
    }

    public int countOpen(User actor, boolean allScope) {
        return mapper.countOpen(actor.getId(), allScope && isSuper(actor));
    }

    public AiTimer get(User actor, Long id) {
        AiTimer t = require(id);
        requireOwn(actor, t);
        return t;
    }

    /**
     * 可被定时的工具 —— **通用工具链面对模型可见的那一面**。
     *
     * <p>只列「这个人现在有权调用、且不属于计时器自身」的工具。排除自身是因为
     * 「给计时器再定一个计时器」只会让模型把自己绕进去，没有任何业务价值。
     */
    public List<AiTool> schedulableTools(User actor, String keyword, int limit) {
        String needle = keyword == null ? "" : keyword.trim().toLowerCase();
        List<AiTool> out = new ArrayList<>();
        for (AiTool t : toolRegistry().allTools()) {
            if (!isSchedulable(t.name()) || capabilityGate.check(actor, t.capability()) != null) {
                continue;
            }
            if (!needle.isEmpty() && !flat(t.name(), t.description()).contains(needle)) {
                continue;
            }
            out.add(t);
            if (out.size() >= limit) {
                break;
            }
        }
        return out;
    }

    /**
     * 不许被定时的工具名。加新的「元工具」时同步这里。
     *
     * <p>两类：**计时器自身**（给计时器再定一个计时器，只会把模型绕进去）、
     * 与**页面导航**（到点自动把用户面前的页面切走，是惊吓不是功能）。
     */
    private static final List<String> NON_SCHEDULABLE_TOOL_NAMES =
            List.of("listTimers", "listSchedulableTools", "scheduleTimers", "cancelTimers", "openPage");

    public static boolean isSchedulable(String toolName) {
        return !NON_SCHEDULABLE_TOOL_NAMES.contains(toolName);
    }

    // ── 停止 / 确认 ──

    /**
     * 批量停。
     *
     * @param ids 非空 = 只停这几个（逐个判归属，**越界 id 直接报错**，不是静默略过）
     * @param all true = 停「全部在跑的」；普通账号=自己的全部，≥SUPER_ADMIN=所有人的（后门）
     * @return 实际停掉几条
     */
    public int cancel(User actor, List<Long> ids, boolean all) {
        LocalDateTime now = LocalDateTime.now();
        boolean superUser = isSuper(actor);
        if (all) {
            int n = mapper.cancelOpen(actor.getId(), superUser, null, now);
            log.info("[ai-timer] 批量停止 all={} by={} 停掉 {} 条", superUser, actor.getId(), n);
            return n;
        }
        if (ids == null || ids.isEmpty()) {
            throw new IllegalArgumentException("没说停哪些计时器（给 ids，或明确说「全部」）");
        }
        List<Long> owned = new ArrayList<>();
        for (Long id : ids) {
            if (id == null) {
                continue;
            }
            AiTimer t = mapper.selectById(id);
            if (t == null) {
                continue; // 已经不存在 = 无需停，不算越权
            }
            requireOwn(actor, t);
            owned.add(id);
        }
        if (owned.isEmpty()) {
            return 0;
        }
        return mapper.cancelOpen(actor.getId(), superUser, owned, now);
    }

    /** 人点了「确认执行」：把等确认的写类单接着跑完。 */
    public AiTimer confirm(User actor, Long id) {
        AiTimer t = get(actor, id);
        if (!AiTimer.STATUS_AWAITING_CONFIRM.equals(t.getStatus())) {
            throw new IllegalStateException("这条计时器不在等确认的状态（当前：" + statusZh(t.getStatus()) + "）");
        }
        if (mapper.confirmClaim(id, actor.getId(), LocalDateTime.now()) != 1) {
            throw new IllegalStateException("这条已经被处理过了，刷新看一下");
        }
        runNow(mapper.selectById(id));
        return mapper.selectById(id);
    }

    /** 放弃一条等确认的写类单。 */
    public AiTimer skip(User actor, Long id) {
        AiTimer t = get(actor, id);
        if (!AiTimer.STATUS_AWAITING_CONFIRM.equals(t.getStatus())) {
            throw new IllegalStateException("这条计时器不在等确认的状态（当前：" + statusZh(t.getStatus()) + "）");
        }
        if (mapper.skipAwaiting(id, LocalDateTime.now(), actor.getId()) != 1) {
            throw new IllegalStateException("这条已经被处理过了，刷新看一下");
        }
        return mapper.selectById(id);
    }

    // ── 调度器入口 ──

    /** 到点且没人认领的单。 */
    public List<AiTimer> due(LocalDateTime now) {
        return mapper.selectDue(now, 50);
    }

    /** 原子认领。false = 别人抢到了 / 已经被取消，跳过。 */
    public boolean claim(Long id) {
        return mapper.claim(id, LocalDateTime.now()) == 1;
    }

    /**
     * 认领之后该干什么，全看工具的副作用等级（用户 2026-10-09 定案）：
     * 读类直接跑；写类（C/D）置为等确认 —— 定时执行时人不在场，不能替他把不可逆的动作做了。
     */
    public void dispatchClaimed(Long id) {
        AiTimer t = mapper.selectById(id);
        if (t == null) {
            return;
        }
        AiTool tool = toolRegistry().tool(t.getToolName());
        if (tool == null) {
            fail(t.getId(), "这个工具已经不在了：" + t.getToolName());
            return;
        }
        /*
         * **到点不再要求二次确认。**
         *
         * 用户建单时那条确认卡片就是同意书（他点了「确认执行」才建出这条定时）；
         * 到点再问一次等于把「定时」打回「手动」—— 更糟的是**无人值守时根本没人能点**，
         * 这条定时就永远停在「等待确认」，等于废掉（真机 2026-10-10 反馈：
         * 「明明都设计成倒计时了，为什么还要我点一下」）。
         *
         * 需要「到点先问一句」的场景不属于定时器 —— 那是编排层的挂起（人就在对话里，能当场点）。
         */
        // **只有建单时明确勾了「到点先问我」才停** —— 默认到点直接跑（见 ScheduleSpec 的注释）
        if (Boolean.TRUE.equals(t.getNeedConfirm())) {
            mapper.markAwaitingConfirm(t.getId(), LocalDateTime.now());
            log.info("[ai-timer] id={} 到点转为等确认（建单时勾了） tool={}", t.getId(), t.getToolName());
            return;
        }
        runNow(t);
    }

    /**
     * 真正执行。到点**重新取工具、重新判能力** —— 建单时判过不算数：
     * 工具可能已下架、人的权限可能已被收掉（同 {@code AiOrchestrator.usableTools} 的道理，入口裁剪不是墙）。
     */
    private void runNow(AiTimer t) {
        AiTool tool = toolRegistry().tool(t.getToolName());
        if (tool == null) {
            fail(t.getId(), "这个工具已经不在了：" + t.getToolName());
            return;
        }
        User owner = userMapper.findById(t.getOwnerUserId());
        if (owner == null) {
            fail(t.getId(), "建单人的账号已不存在");
            return;
        }
        String denial = capabilityGate.check(owner, tool.capability());
        if (denial != null) {
            fail(t.getId(), "到点时建单人已经没有权限了：" + denial);
            return;
        }
        try {
            JsonNode args = objectMapper.readTree(
                    t.getArgsJson() == null || t.getArgsJson().isBlank() ? "{}" : t.getArgsJson());
            // 身份用建单人（不是「系统」）：这次操作在业务上就是他做的，审计要落到他头上。
            Object out = tool.executor().execute(
                    new AiToolContext(owner, t.getSessionId(), t.getMessageId(), t.getLabel()), args);
            String result = truncate(archiveImageIfAny(owner, t, out), 4000);
            boolean ok = AiOrchestrator.businessOk(out);
            mapper.finishFired(t.getId(), LocalDateTime.now(), result, ok);
            reportFiredResult(t, result, ok);
            log.info("[ai-timer] 执行完成 id={} tool={}", t.getId(), t.getToolName());
        } catch (Exception e) {
            fail(t.getId(), truncate(e.getMessage(), 500));
            reportFiredResult(t, e.getMessage(), false);
            log.warn("[ai-timer] 执行失败 id={} tool={}: {}", t.getId(), t.getToolName(), e.getMessage());
        }
    }

    private void fail(Long id, String message) {
        mapper.finishFailed(id, LocalDateTime.now(), message);
    }

    /**
     * 到点执行完，**把结果作为一条助手消息写回会话**。
     *
     * <p>为什么必须写回：定时到点执行是「助手替你办了件事」，用户回到对话里就该看到一句回复 ——
     * 只把计时器状态改成「已完成」等于没说结果；而只存在本地缓存更不行（换设备、清缓存就没了）。
     * 这里落的是**服务端的一条普通消息**，和平时对话一样留在会话里，下次接着聊它也看得见。
     *
     * <p>为什么要过一遍模型：工具返回的是**写给模型看的 JSON**（{@code {"ok":true,"stats":{...}}}），
     * 原样贴给用户不能看。这里用一次不带工具的普通调用把它讲成人话；
     * 摘要失败就退回一句朴素的报告 —— 「定时办完了」这件事不能因为一次摘要失败而消失。
     */
    private void reportFiredResult(AiTimer t, String rawResult, boolean ok) {
        String label = t.getLabel() == null || t.getLabel().isBlank() ? t.getToolName() : t.getLabel();
        String raw = rawResult == null ? "（无）" : rawResult;

        // 让模型**现场写**这次的通知：标题一行 + 正文一到两句。
        // 每条定时的事都不一样，套固定模板只会说些放之四海皆可的废话。
        String title;
        String body;
        try {
            List<Map<String, String>> msgs = List.of(
                    Map.of("role", "system", "content",
                            "你是实验中心后台的智能助手。用户给你设的定时任务刚到点执行完了，"
                                    + "请写一条给人看的通知：**第一行是标题**（不超过 20 字，结尾不要标点），"
                                    + "**后面若干行是正文**（一到两句中文，直接说结论和关键数字，"
                                    + "不要念技术字段名、不要贴 JSON、不要用 markdown 记号的星号）。"),
                    Map.of("role", "user", "content",
                            "定时任务：" + label + "\n执行结果（原始）：" + raw));
            String spoken = String.valueOf(chatClient.chatWithFallback(msgs).content()).trim();
            int nl = spoken.indexOf('\n');
            title = nl > 0 ? spoken.substring(0, nl).trim() : spoken;
            body = nl > 0 ? spoken.substring(nl + 1).trim() : spoken;
        } catch (Exception e) {
            log.warn("[ai-timer] 通知内容生成失败，退回朴素报告 id={}: {}", t.getId(), e.getMessage());
            title = (ok ? "定时任务完成" : "定时任务失败") + " — " + label;
            body = raw;
        }

        // ① 写回会话：这是**服务端持久化**的一条普通消息（换设备/清缓存都还在，下次接着聊也看得见）
        if (t.getSessionId() != null) {
            try {
                AiMessage msg = new AiMessage();
                msg.setActorUserId(t.getOwnerUserId());
                msg.setSource("timer");
                sessionService.append(t.getSessionId(), "assistant",
                        "⏱ " + title + (body.isBlank() ? "" : "\n" + body), msg);
            } catch (Exception e) {
                log.warn("[ai-timer] 结果写回会话失败 id={}: {}", t.getId(), e.getMessage());
            }
        }

        // ② 推一条通知。推送失败只记日志 —— 通知是附加动作，不能把「已经办好的事」记成失败
        pushFired(t, title, body, label);
    }

    /**
     * 执行完成后推一条通知（走 {@code /console/admin/push-config} 那套源/渠道/模板）。
     *
     * <p>标题与正文是**模型刚写的**，这个源只负责把它们塞进各渠道的外壳里。
     *
     * <p>收件人：建单时指定的那批；**没指定就是建单人**，也就是发起这次对话的人。
     * 模型要推给别人时得先用 searchPerson 拿到账号 id（见 scheduleTimers 的参数说明）。
     */
    private void pushFired(AiTimer t, String title, String body, String label) {
        Set<String> targets = new LinkedHashSet<>();
        String raw = t.getNotifyUserIds();
        if (raw != null) {
            for (String one : raw.split(",")) {
                String v = one.trim();
                if (!v.isEmpty()) {
                    targets.add(v);
                }
            }
        }
        if (targets.isEmpty() && t.getOwnerUserId() != null) {
            targets.add(t.getOwnerUserId());
        }
        if (targets.isEmpty()) {
            return;
        }
        try {
            Map<String, String> vars = new LinkedHashMap<>();
            vars.put("title", title);
            vars.put("body", body);
            vars.put("timerLabel", label);
            vars.put("fireAt", t.getFireAt() == null ? "" : t.getFireAt().format(TS));
            pushService.send("AI_TIMER_FIRED", vars, targets);
        } catch (Exception e) {
            log.warn("[ai-timer] 通知推送失败 id={}: {}", t.getId(), e.getMessage());
        }
    }

    /**
     * 收掉工具返回里的**出图约定**（截图），返回要存进计时器结果的文本。
     *
     * <p>为什么定时器这条路必须单独做：{@code image} 本来是编排层与载体之间的约定，
     * 而定时器到点是**直接调工具执行体**的、根本不经过编排层的事件出口 ——
     * 不收的话，定时的截图会**静默消失**（单子还标成功，但什么也没生成）。
     *
     * <p>产物挂在**建单时的会话/消息**上：那个页面就是这次对话里生出来的，
     * 用户回到那段对话就能看到这张图。
     *
     * <p>这里**一律走服务端渲染**，不看工具给的 {@code render}：无人值守时没有载体可用，
     * 「带用户过去看」那种方式根本无从谈起，但「给他一张这个页面的图」这个目的仍然达得成。
     */
    private String archiveImageIfAny(User owner, AiTimer t, Object out) {
        String base = toText(out);
        if (!(out instanceof Map<?, ?> map) || !(map.get("image") instanceof Map<?, ?> image)) {
            return base;
        }
        Object rawPath = image.get("path");
        String path = rawPath == null ? null : String.valueOf(rawPath);
        Object rawLabel = image.get("label");
        String label = rawLabel == null ? null : String.valueOf(rawLabel);
        try {
            Long id = pageShotArchive.renderAndArchive(owner, t.getSessionId(), t.getMessageId(), path, label);
            return base + "\n（截图已生成，回到发起这条定时的对话里就能看到）";
        } catch (Exception e) {
            // 图取不到就是这一单没办成 —— 标成成功会让用户以为图在那儿，白等
            throw new IllegalStateException("截图没取到：" + e.getMessage(), e);
        }
    }

    /** 收殓卡在 FIRING 的僵尸单（认领后进程死了）。调度器每轮调一次。 */
    public int recoverStale(LocalDateTime now) {
        return mapper.recoverStale(now.minusMinutes(STALE_FIRING_MINUTES), now);
    }

    // ── 归属与工具 ──

    private AiTimer require(Long id) {
        AiTimer t = id == null ? null : mapper.selectById(id);
        if (t == null) {
            throw new IllegalStateException("没有这条计时器（可能已经被删掉）");
        }
        return t;
    }

    /** 唯一一道归属墙：本人 ∨ ≥SUPER_ADMIN。 */
    private void requireOwn(User actor, AiTimer t) {
        if (actor == null) {
            throw new IllegalStateException("未识别到操作人");
        }
        if (!actor.getId().equals(t.getOwnerUserId()) && !isSuper(actor)) {
            throw new IllegalStateException("这不是你的计时器（只有建单人或超级管理员及以上能操作）");
        }
    }

    private static boolean isSuper(User u) {
        return u != null && u.getRole() != null && u.getRole().getLevel() >= RoleEnum.SUPER_ADMIN.getLevel();
    }

    private String ownerName(User actor) {
        try {
            String name = displayNameService.resolveDisplayName(actor.getId());
            if (name != null && !name.isBlank()) {
                return name;
            }
        } catch (RuntimeException e) {
            log.debug("[ai-timer] 取显示名失败，回落昵称: {}", e.getMessage());
        }
        return actor.getDisplayNickname() == null ? actor.getUsername() : actor.getDisplayNickname();
    }

    // ── 杂项 ──

    /** 给模型/前端看的状态中文名。 */
    public static String statusZh(String status) {
        return switch (status == null ? "" : status) {
            case AiTimer.STATUS_PENDING -> "倒计时中";
            case AiTimer.STATUS_FIRING -> "执行中";
            case AiTimer.STATUS_FIRED -> "已完成";
            case AiTimer.STATUS_AWAITING_CONFIRM -> "等待确认";
            case AiTimer.STATUS_CANCELLED -> "已取消";
            case AiTimer.STATUS_FAILED -> "失败";
            default -> "未知";
        };
    }

    /** 给模型看的一行摘要（时间用绝对时刻，别让它自己算「还剩多久」）。 */
    public Map<String, Object> describe(AiTimer t) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", t.getId());
        row.put("label", t.getLabel());
        row.put("toolName", t.getToolName());
        row.put("status", t.getStatus());
        row.put("statusZh", statusZh(t.getStatus()));
        row.put("fireAt", t.getFireAt() == null ? null : t.getFireAt().format(TS));
        row.put("remainingSeconds", t.getFireAt() == null ? null
                : Math.max(0, Duration.between(LocalDateTime.now(), t.getFireAt()).getSeconds()));
        row.put("owner", t.getOwnerNameSnapshot());
        row.put("createdAt", t.getCreatedAt() == null ? null : t.getCreatedAt().format(TS));
        row.put("firedAt", t.getFiredAt() == null ? null : t.getFiredAt().format(TS));
        row.put("ok", t.getOk());
        if (t.getResultText() != null && !t.getResultText().isBlank()) {
            row.put("result", truncate(t.getResultText(), 500));
        }
        if (t.getErrorMessage() != null && !t.getErrorMessage().isBlank()) {
            row.put("error", t.getErrorMessage());
        }
        return row;
    }

    private static String flat(String a, String b) {
        return ((a == null ? "" : a) + ' ' + (b == null ? "" : b)).toLowerCase();
    }

    private static String nullIfBlank(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    private static String trim(String s, int max) {
        if (s == null) {
            return null;
        }
        String t = s.strip();
        return t.isEmpty() ? null : (t.length() <= max ? t : t.substring(0, max));
    }

    private static String truncate(String s, int max) {
        if (s == null) {
            return null;
        }
        return s.length() <= max ? s : s.substring(0, max) + "…";
    }

    private String toText(Object out) {
        if (out == null) {
            return "";
        }
        if (out instanceof String s) {
            return s;
        }
        try {
            return objectMapper.writeValueAsString(out);
        } catch (Exception e) {
            return String.valueOf(out);
        }
    }
}
