package com.example.demo.modules.ai.service;

import com.example.demo.modules.ai.capability.AiCapabilityGate;
import com.example.demo.modules.ai.core.AiEventSink;
import com.example.demo.modules.ai.core.AiTurnStats;
import com.example.demo.modules.ai.entity.AiAttachment;
import com.example.demo.modules.ai.entity.AiInteraction;
import com.example.demo.modules.ai.entity.AiMessage;
import com.example.demo.modules.ai.entity.AiToolCallLog;
import com.example.demo.modules.ai.tool.AiPackRouter;
import com.example.demo.modules.ai.tool.AiTool;
import com.example.demo.modules.ai.tool.AiToolContext;
import com.example.demo.modules.ai.tool.AiToolPack;
import com.example.demo.modules.ai.tool.ToolRegistry;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.cageshelf.service.CageModeVisibilityService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.llm.service.DashScopeChatClient;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 编排层 —— 用户 ↔ AI 对话的循环本体。详见设计文档 §2.1。
 *
 * 循环：组装约束 → 调模型 → 模型要工具就逐个判定并执行 → 结果回灌 → 再调模型，直到模型不再要工具。
 *
 * 三条不变量在本类里落实：
 * <ul>
 *   <li>I1 身份只来自 JWT —— 执行上下文的 actor 是入参，**模型无法影响它**；</li>
 *   <li>I2 模型只产出意图 —— 本类才决定执不执行，模型给的名字先去 {@link ToolRegistry} 查白名单；</li>
 *   <li>I4 挂起态只存服务端 —— 本类不接受前端传来的挂起对象。</li>
 * </ul>
 *
 * 被拒绝的调用全部落 {@link AiAuditService}，包括白名单未命中与权限不足。
 */
@Service
public class AiOrchestrator {

    private static final Logger log = LoggerFactory.getLogger(AiOrchestrator.class);

    /** 防死循环：模型很乐意一直调工具。 */
    public static final int MAX_TURNS = 8;

    /**
     * 单轮工具调用上限，防并行爆炸。
     *
     * <p>放到 12 是为了**批量清单**：老师发来一份名单，用户粘贴就是一次十来个「给某人授某房间某时长」，
     * 上限 5 会把整轮判超限拒掉（一条都办不成）。12 之上再多就该走分批，别把一次请求拖成几十笔写。
     */
    public static final int MAX_TOOL_CALLS_PER_TURN = 12;

    private static final DateTimeFormatter TS = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final DashScopeChatClient chatClient;
    private final ToolRegistry toolRegistry;
    private final AiPromptService promptService;
    private final AiSessionService sessionService;
    private final AiAuditService auditService;
    private final AiCapabilityGate capabilityGate;
    private final AiInteractionService interactionService;
    private final ObjectMapper objectMapper;
    private final CageModeVisibilityService modeVisibilityService;
    private final AiPackRouter packRouter;
    private final AiAttachmentService attachmentService;

    public AiOrchestrator(DashScopeChatClient chatClient,
                          ToolRegistry toolRegistry,
                          AiPromptService promptService,
                          AiSessionService sessionService,
                          AiAuditService auditService,
                          AiCapabilityGate capabilityGate,
                          AiInteractionService interactionService,
                          ObjectMapper objectMapper,
                          CageModeVisibilityService modeVisibilityService,
                          AiPackRouter packRouter,
                          AiAttachmentService attachmentService) {
        this.chatClient = chatClient;
        this.toolRegistry = toolRegistry;
        this.promptService = promptService;
        this.sessionService = sessionService;
        this.auditService = auditService;
        this.capabilityGate = capabilityGate;
        this.interactionService = interactionService;
        this.objectMapper = objectMapper;
        this.modeVisibilityService = modeVisibilityService;
        this.packRouter = packRouter;
        this.attachmentService = attachmentService;
    }

    /**
     * 跑一轮用户消息。
     *
     * @param actor     来自 JWT 解析，**不是**从对话里读出来的
     * @return 落库的最终 assistant 消息 id；达上限或空回复时返回 null
     */
    public Long run(User actor, Long sessionId, String userText, String contextPage, AiEventSink sink) {
        return run(actor, sessionId, userText, contextPage, sink, null);
    }

    /**
     * 跑一轮用户消息（带图版）。
     *
     * @param images 本轮附带的图片（data URL / 裸 base64）。**只发本轮** —— ai_message 没有存图的地方，
     *               历史回合重放时只剩文字，所以「上一轮那张图」在后续追问里对模型是不存在的（已知取舍）。
     */
    public Long run(User actor, Long sessionId, String userText, String contextPage, AiEventSink sink,
                    List<String> images) {
        return run(actor, sessionId, userText, contextPage, sink, images, null);
    }

    /**
     * 跑一轮用户消息（带附件版）。
     *
     * @param images       本轮附带的图片（data URL / 裸 base64）。**只发本轮** —— ai_message 没有存图的地方，
     *                     历史回合重放时只剩文字，所以「上一轮那张图」在后续追问里对模型是不存在的（已知取舍）。
     * @param spreadsheets 本轮附带的表格（xlsx/xls，base64）。与图片**不同**：服务端解析后**落库**，
     *                     消息里只拼一段预览 —— 于是后续追问我仍然看得见那张表（全量在 ai_attachment 里）。
     */
    public Long run(User actor, Long sessionId, String userText, String contextPage, AiEventSink sink,
                    List<String> images, List<SpreadsheetPart> spreadsheets) {
        if (!requireStaffView(actor, sink)) {
            return null;
        }
        sessionService.requireOwned(sessionId, actor.getId());

        AiMessage userMsg = new AiMessage();
        userMsg.setActorUserId(actor.getId());
        userMsg.setActorRoleSnapshot(actor.getRole() == null ? null : actor.getRole().name());
        userMsg.setSource(contextPageSource(contextPage));
        userMsg.setContextJson(trimTo(contextPage, 512));
        AiMessage savedUser = sessionService.append(sessionId, "user", userText, userMsg);

        saveSpreadsheets(actor, sessionId, savedUser == null ? null : savedUser.getId(), spreadsheets, sink);

        List<AiToolPack> activePacks = routedPacks(actor, contextPage, userText, sessionContextText(sessionId));
        // **排错入口**：用户再遇到「我手里没有这个工具」时，先看这一行选中了哪几个包 ——
        // 是路由没收进来（该补词），还是工具在手、模型没接上（另一类），一眼分得清。
        // 路由自己的命中日志是 debug 级，生产（INFO）看不到，所以这里单独记一条。
        log.info("[ai-route] 本轮选中 {} 个包 [{}] | 原话: {}", activePacks.size(),
                String.join(",", activePacks.stream().map(AiToolPack::packKey).toList()),
                truncate(userText, 60));
        List<Map<String, Object>> messages = baseMessages(actor, sessionId, contextPage, activePacks);
        attachImages(messages, images);
        return drive(actor, sessionId, sink, messages,
                images != null && !images.isEmpty(), new ArrayList<>(), userText, activePacks);
    }

    /** 本轮附带的一份表格：文件名 + 内容（data URL 或裸 base64）。 */
    public record SpreadsheetPart(String filename, String data) {
    }

    /**
     * 解析并落库本轮的表格附件。
     *
     * <p>解析失败**不整轮失败**：文件可能不是表格、或者坏了。这时把原因直接说给用户
     * （他是唯一知道该换一份什么文件的人），其余文字照常处理 —— 让整轮报错等于把「传错文件」升级成「助手坏了」。
     */
    private void saveSpreadsheets(User actor, Long sessionId, Long messageId,
                                  List<SpreadsheetPart> spreadsheets, AiEventSink sink) {
        if (spreadsheets == null || spreadsheets.isEmpty()) {
            return;
        }
        for (SpreadsheetPart part : spreadsheets) {
            String name = part == null || part.filename() == null || part.filename().isBlank()
                    ? "未命名表格" : part.filename();
            try {
                byte[] bytes = decodeAttachment(part == null ? null : part.data());
                attachmentService.parseAndSave(bytes, name, sessionId, actor.getId(), messageId);
            } catch (IllegalArgumentException e) {
                log.warn("[ai-orch] 附件解析失败 name={}: {}", name, e.getMessage());
                sink.delta("（附件「" + name + "」没能读取：" + e.getMessage() + "）\n");
            } catch (RuntimeException e) {
                log.warn("[ai-orch] 附件保存失败 name={}: {}", name, e.getMessage());
                sink.delta("（附件「" + name + "」处理失败：" + e.getMessage() + "）\n");
            }
        }
    }

    /** 附件内容解码：前端可能给 data URL（`data:...;base64,xxx`）也可能给裸 base64。 */
    private static byte[] decodeAttachment(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new IllegalArgumentException("内容为空");
        }
        String s = raw.trim();
        int comma = s.indexOf(',');
        if (s.startsWith("data:") && comma > 0) {
            s = s.substring(comma + 1);
        }
        try {
            return java.util.Base64.getMimeDecoder().decode(s);
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("内容不是合法 base64");
        }
    }

    /**
     * 续跑一次被挂起的确认 —— 设计文档 §8 的「用户点选 → 从挂起处接着跑，不是重新开始一轮」。
     *
     * <p>续跑的起点由**服务端**决定：{@link AiInteractionService#resolve} 取出挂起记录，
     * 里面存着是哪条 assistant 消息、哪一次调用。前端只回传一个选择值（不变量 I4）。
     *
     * <p>那次调用连同同一轮里排在它后面的调用在这里一起补完 —— OpenAI 协议要求 assistant 的
     * tool_calls 逐条配对 tool 响应，漏一条下一轮发回上游就是非法序列。
     */
    public Long resume(User actor, Long sessionId, String token, String chosenValue, AiEventSink sink) {
        if (!requireStaffView(actor, sink)) {
            return null;
        }
        sessionService.requireOwned(sessionId, actor.getId());
        AiInteraction it = interactionService.resolve(sessionId, token, chosenValue);

        List<AiToolPack> activePacks = routedPacks(actor, null, chosenValue, sessionContextText(sessionId));
        List<Map<String, Object>> messages = baseMessages(actor, sessionId, null, activePacks);
        List<ChoiceGroup> choiceGroups = new ArrayList<>();

        AiMessage turn = sessionService.message(it.getMessageId());
        if (turn == null || !StringUtils.hasText(turn.getRawToolCalls())) {
            sink.error("INTERACTION_LOST", "这次确认对应的操作已经找不到了，请重新说一次");
            return null;
        }

        if (!answerToolCalls(actor, sessionId, turn.getId(), parseToolCalls(turn.getRawToolCalls()),
                it.getToolCallId(), AiInteractionService.isConfirm(chosenValue),
                sink, messages, choiceGroups, chosenValue)) {
            // 补完的过程中又一次要确认（同一轮里的下一个写操作）——本轮到此为止，
            // 挂起事件已由 executeOne 发出，这里只做收尾。
            emitClarifyGroups(sink, choiceGroups);
            sink.done(null);
            return null;
        }
        return drive(actor, sessionId, sink, messages, false, choiceGroups, chosenValue, activePacks);
    }

    /**
     * 模型循环本体。进入前 messages 必须是**合法序列**（assistant 的每次 tool_call 都有配对应答）。
     */
    private Long drive(User actor, Long sessionId, AiEventSink sink,
                       List<Map<String, Object>> messages, boolean hasImages,
                       List<ChoiceGroup> choiceGroups, String userText, List<AiToolPack> activePacks) {
        // 两个方向都要洗：先删「有 tool 应答没 tool_calls」的（窗口截断常见），
        // 再删「有 tool_calls 没应答」的。顺序不能反 —— 反了会先给孤儿应答的 assistant 补上正文，
        // 之后那条 tool 还是孤立的。
        dropOrphanToolMessages(messages);
        dropOrphanToolCalls(messages);
        List<Map<String, Object>> tools = toolsPayload(actor, activePacks);

        // 跨轮累加：用户关心的是「这一次提问总共花了多少」，不是最后一轮的数字
        // 候选按「哪一次调用抛的」分组，**整次请求累加**（多轮工具调用里前面抛的候选照样要问）
        int totalLatencyMs = 0;
        int totalPromptTokens = 0;
        int totalCompletionTokens = 0;
        /** 已退回纯文字重试过一次（只退一次，别再抖） */
        boolean imageFallbackTried = false;

        for (int turn = 0; turn < MAX_TURNS; turn++) {
            long started = System.currentTimeMillis();
            DashScopeChatClient.ToolChatResult resp;
            try {
                resp = chatClient.chatWithTools(messages, tools);
            } catch (RuntimeException e) {
                // 带图首发失败 → 退回纯文字重试一次。附了图却整轮失败（上游不吃图、图太大）是最糟的结果：
                // 用户只是想问个问题。退回时明确说一句，别让人以为「我发的图它看见了」。
                if (turn != 0 || !hasImages || imageFallbackTried) {
                    throw e;
                }
                imageFallbackTried = true;
                stripImageParts(messages);
                // 带上游原话，别替它下结论：第一次实测中「图无效」也被写成了「模型读不了图」，
                // 差一点把方向带偏到「模型没有视觉」上（其实这个模型有视觉）。
                sink.delta("（这次附图没发成功，已按纯文字回答：" + truncate(e.getMessage(), 120) + "）\n");
                log.warn("[ai-orch] 带图请求失败，退回纯文字重试: {}", e.getMessage());
                resp = chatClient.chatWithTools(messages, tools);
            }
            long latency = System.currentTimeMillis() - started;
            totalLatencyMs += (int) latency;
            totalPromptTokens += resp.promptTokens();
            totalCompletionTokens += resp.completionTokens();

            // 每轮结束就把用量推出去：载体据此实时刷新「已耗时 / 已用 token」
            sink.usage(new AiTurnStats(null, resp.model(), totalLatencyMs,
                    totalPromptTokens, totalCompletionTokens, turn + 1));

            if (resp.toolCalls().isEmpty()) {
                AiMessage assistant = new AiMessage();
                assistant.setModel(resp.model());
                assistant.setLatencyMs((int) latency);
                assistant.setPromptTokens(resp.promptTokens());
                assistant.setCompletionTokens(resp.completionTokens());
                AiMessage saved = sessionService.append(sessionId, "assistant", resp.content(), assistant);
                if (resp.content() == null || resp.content().isBlank()) {
                    // 有用量、但没正文：多半是输出预算被思考吃满（实测 max_tokens=1024 时如此）。
                    // 不能报成「连不上」——那会把长度问题伪装成网络问题，排查方向全错。
                    sink.error("EMPTY_REPLY",
                            "模型这次没有返回正文（输出长度上限可能被思考占满），换个说法再问一次");
                    return saved.getId();
                }
                sink.delta(resp.content());
                // 本轮工具抛出了候选（如「该人的可选房间」）→ 交给载体渲染成可点选控件，
                // 别让用户照着正文手打。事件顺序：delta（问题）→ interaction（逐问）→ done。
                //
                // 一次请求可能同时挂好几问（批量清单里两个人各缺参数）——**逐问各发一条**，
                // 每条自带标题（谁的什么），载体会按顺序依次问。合成一组会让用户点了不知道是给谁挑的。
                for (ChoiceGroup g : choiceGroups) {
                    sink.interaction(null, "clarify", g.title(), g.options(), false);
                }
                sink.done(new AiTurnStats(saved.getId(), resp.model(), totalLatencyMs,
                        totalPromptTokens, totalCompletionTokens, turn + 1));
                return saved.getId();
            }

            // 模型要调工具：先把这条 assistant 轮原样落库（含 tool_calls），再逐个处理
            String rawCalls = serializeToolCalls(resp.toolCalls());
            AiMessage assistant = new AiMessage();
            assistant.setModel(resp.model());
            assistant.setLatencyMs((int) latency);
            assistant.setPromptTokens(resp.promptTokens());
            assistant.setCompletionTokens(resp.completionTokens());
            assistant.setRawToolCalls(rawCalls);
            AiMessage savedAssistant = sessionService.append(sessionId, "assistant", resp.content(), assistant);

            messages.add(assistantMessageForModel(resp.content(), resp.toolCalls()));

            if (resp.toolCalls().size() > MAX_TOOL_CALLS_PER_TURN) {
                String reason = "单轮工具调用数超限（" + resp.toolCalls().size() + " > " + MAX_TOOL_CALLS_PER_TURN + "）";
                log.warn("[ai-orch] {} session={}", reason, sessionId);
                sink.error("TOO_MANY_TOOL_CALLS", reason);
                return savedAssistant.getId();
            }

            // 候选**整轮累加、不在每次工具轮清空**：一次请求里模型可能来回好几轮
            // （查这个人 → 发现缺房间 → 再查另一个人），只要最后那句回答里还挂着没答的问题，
            // 那一轮的候选就仍然要问。每轮清空会把前几轮的候选项悄悄吞掉 —— 真机踩过：
            // 两人批量、共 4 轮，第一个人的房间候选被后面的搜索调用清掉，界面上一片芯片都没有。
            if (!answerToolCalls(actor, sessionId, savedAssistant.getId(), resp.toolCalls(),
                    null, false, sink, messages, choiceGroups, userText)) {
                // 有写操作要确认：本轮到此为止（挂起事件已由 executeOne 发出）。
                // 模型这一轮已经说出的正文在这里补发 —— 挂起后用户只看到一颗球和一排选项，
                // 模型那句「我这就给张三授权」正是回答「在确认什么」的那句。
                if (StringUtils.hasText(resp.content())) {
                    sink.delta(resp.content());
                }
                emitClarifyGroups(sink, choiceGroups);
                sink.done(new AiTurnStats(savedAssistant.getId(), resp.model(), totalLatencyMs,
                        totalPromptTokens, totalCompletionTokens, turn + 1));
                return savedAssistant.getId();
            }
        }

        log.warn("[ai-orch] 达到最大轮数 {}，session={}", MAX_TURNS, sessionId);
        sink.error("MAX_TURNS", "已达到单次请求的最大轮数，请把需求拆开再说一次");
        return null;
    }

    /**
     * 处理一个工具调用。返回要给模型的 tool 结果文本。
     *
     * 判定顺序即安全顺序：白名单 → 能力 → 副作用。**任何一步不过都不执行**，且都留痕。
     */
    /**
     * 这一次调用要不要挂起等用户点确认。
     *
     * <p>{@code confirmedBy} 非空 = 这次调用是**从一条已落定的挂起记录里走回来的**（续跑路径传进来的），
     * 确认已经发生过了，放行执行；否则写操作一律挂起。
     *
     * <p>少了「已确认就放行」这半边就是**无限确认循环**：续跑 → 又判要确认 → 又挂起 → 用户再点 →
     * 再挂起。2026-10-08 真机就是这个症状（点一下确认，界面又弹回同一张确认卡）。
     * {@code confirmedBy} 只能来自 JWT 解析出的 actor（见 {@code answerToolCalls}），模型影响不到它。
     */
    static boolean mustSuspendForConfirm(AiTool tool, String confirmedBy) {
        return tool.requiresConfirm() && confirmedBy == null;
    }

    private String executeOne(User actor, Long sessionId, Long messageId,
                              DashScopeChatClient.ToolCall call, AiEventSink sink,
                              List<ChoiceGroup> groupsSink, String confirmedBy, String userText) {
        AiTool tool = toolRegistry.tool(call.name());
        if (tool == null) {
            auditService.recordNotExecuted(sessionId, messageId, call.name(), call.argumentsJson(),
                    null, false, "工具不在白名单内");
            return "没有这个工具：" + call.name();
        }

        String denial = capabilityGate.check(actor, tool.capability());
        if (denial != null) {
            auditService.recordNotExecuted(sessionId, messageId, call.name(), call.argumentsJson(),
                    tool.capability(), false, denial);
            sink.tool(call.name(), "denied");
            return "没有权限执行：" + denial;
        }

        if (mustSuspendForConfirm(tool, confirmedBy)) {
            // 挂起**之前**先给工具一次机会：有些参数只能由人决定、又没法塞进 schema
            // （三签的「以哪个身份签」最典型 —— 它决定签的是归属地还是兽医）。
            // 钩子返回非空就当作工具结果交回去（通常带 choices 变成可点选芯片），这一轮不挂起；
            // 用户点完、模型带着那个参数再来一次，才走到下面的确认。
            //
            // 少了这一步，身份就只剩「让模型猜」一条路 —— 那正是源码里记着的老 bug。
            JsonNode confirmArgs = parseArgsQuietly(call.argumentsJson());
            if (confirmArgs != null && tool.hasPreConfirmResolve()) {
                Object pre = tool.resolveBeforeConfirmOrNull(
                        new AiToolContext(actor, sessionId, messageId), confirmArgs);
                if (pre != null) {
                    // **候选必须在这里收**：预解析的结果和普通工具结果一样，可能带 choices
                    // （三签的「以哪个身份签」就是这么问的）。漏了这一步，模型只会在正文里
                    // 把候选念一遍，用户拿不到可点选芯片 —— 2026-10-08 真机就是这么漏的。
                    groupsSink.addAll(collectChoices(pre));
                    // 记成**已执行**：它确实跑了（做了一次解析，也可能带 ok:false 的业务拒绝）。
                    // 记成「等待确认」会让审计页把一次真实的询问显示成一次挂起。
                    AiToolCallLog preEntry = new AiToolCallLog();
                    preEntry.setSessionId(sessionId);
                    preEntry.setMessageId(messageId);
                    preEntry.setToolName(call.name());
                    preEntry.setRawArguments(call.argumentsJson());
                    preEntry.setRequiredCapability(tool.capability());
                    preEntry.setCapabilityGranted(Boolean.TRUE);
                    preEntry.setExecuted(Boolean.TRUE);
                    String preText = toText(pre);
                    preEntry.setRawResult(preText);
                    preEntry.setOk(businessOk(pre));
                    auditService.record(preEntry);
                    sink.tool(call.name(), "needs-input");
                    return preText;
                }
            }

            // 写操作**永不**因为「模型觉得明确了」就执行 —— 挂起，等用户点确认（§8）。
            // 这里 return 的文本**不落库**：这一条 tool_call 要留在未应答状态，
            // 用户点确认后由 resume() 补齐。落了库就等于「已经答过了」，续跑就找不到它了。
            AiInteraction it = interactionService.suspendConfirm(sessionId, messageId, call.id(),
                    confirmQuestion(tool, call), AiInteractionService.CONFIRM_OPTIONS);
            auditService.recordNotExecuted(sessionId, messageId, call.name(), call.argumentsJson(),
                    tool.capability(), true, "等待用户确认");
            sink.tool(call.name(), "needs-confirm");
            // 结构化事件而不是往正文里补一句 —— 前端渲染成可点选控件，点击即明确的回答
            sink.interaction(it.getToken(), AiInteraction.KIND_CONFIRM, it.getQuestion(),
                    AiInteractionService.CONFIRM_OPTIONS, false);
            return null;
        }

        sink.tool(call.name(), "running");
        AiToolCallLog entry = new AiToolCallLog();
        entry.setSessionId(sessionId);
        entry.setMessageId(messageId);
        entry.setToolName(call.name());
        entry.setRawArguments(call.argumentsJson());
        entry.setRequiredCapability(tool.capability());
        entry.setCapabilityGranted(Boolean.TRUE);
        entry.setExecuted(Boolean.TRUE);
        entry.setConfirmedBy(confirmedBy);
        try {
            JsonNode args = objectMapper.readTree(
                    call.argumentsJson() == null || call.argumentsJson().isBlank() ? "{}" : call.argumentsJson());
            Object out = tool.executor().execute(
                    new AiToolContext(actor, sessionId, messageId, userText), args);
            groupsSink.addAll(collectChoices(out));
            String text = toText(out);
            entry.setRawResult(text);
            entry.setOk(businessOk(out));
            auditService.record(entry);
            sink.tool(call.name(), "done");
            return text;
        } catch (Exception e) {
            entry.setOk(Boolean.FALSE);
            entry.setErrorMessage(truncate(e.getMessage(), 500));
            auditService.record(entry);
            log.warn("[ai-orch] 工具 {} 执行失败: {}", call.name(), e.getMessage());
            sink.tool(call.name(), "failed");
            // 抛出来的都是**意料之外**的故障（业务上「不行」由工具自己返回 ok:false/options）。
            // 原样把 Java 异常文本丢回去，模型会以为是自己参数写错了，换个写法接着试 ——
            // 2026-10-08 人员包那次就这么连试 3 次烧满 8 轮，用户收到「已达到最大轮数，请把需求拆开
            // 再说一次」，而真实原因是工具坏了、拆需求根本没用。所以明确告诉它别重试。
            return "执行失败（系统内部错误，不是参数问题）：" + e.getMessage()
                    + "\n换个参数重试没用，请直接告诉用户这个功能现在报错、需要修。";
        }
    }

    /**
     * 处理一条 assistant 轮里**尚未应答**的全部 tool_call：执行 / 挂起 / 取消了事。
     *
     * <p>「尚未应答」查库判定（{@code selectAnsweredToolCallIds}）—— 于是 run（全新一轮，都没答过）
     * 与 resume（同一轮接着跑，前面几次已答过）走的是同一段代码，不必各写一份。
     * 被挂起的那一次**故意不落应答**，所以这里会把「还没办」认出来，交回给 executeOne 重办。
     *
     * @param pendingCallId 这一轮里**已经由用户确认过**的那次调用；null 表示没有（run 路径）
     * @param confirmed     pendingCallId 那次是点了「确认执行」还是「取消」
     * @return true = 全部补完，可以继续调模型；false = 中途挂起，调用方必须结束本轮
     */
    private boolean answerToolCalls(User actor, Long sessionId, Long assistantMessageId,
                                    List<DashScopeChatClient.ToolCall> calls,
                                    String pendingCallId, boolean confirmed,
                                    AiEventSink sink, List<Map<String, Object>> messages,
                                    List<ChoiceGroup> choiceGroups, String userText) {
        // 已经办过的调用要跳过 —— 判据查库不扫窗口：长会话里那一轮可能已被窗口截掉，
        // 靠窗口判就会把「已经执行过的写」当成没执行而**再写一次**。
        Set<String> answeredIds = sessionService.answeredToolCallIds(sessionId);
        for (DashScopeChatClient.ToolCall call : calls) {
            if (call.id() == null || answeredIds.contains(call.id())) {
                continue;
            }
            boolean isPending = call.id() != null && call.id().equals(pendingCallId);
            if (isPending && !confirmed) {
                // 用户取消：不执行，但仍要给出应答 —— tool_calls 逐条配对是协议要求，
                // 缺一条下一轮把历史发回上游就是非法序列。
                String cancelled = "用户取消了这次操作，未执行。除非用户重新提出，不要重试。";
                auditService.recordNotExecuted(sessionId, assistantMessageId, call.name(),
                        call.argumentsJson(), null, true, "用户取消");
                sink.tool(call.name(), "cancelled");
                appendToolReply(sessionId, messages, call.id(), cancelled);
                continue;
            }
            String text = executeOne(actor, sessionId, assistantMessageId, call, sink, choiceGroups,
                    isPending ? actor.getId() : null, userText);
            if (text == null) {
                return false;
            }
            appendToolReply(sessionId, messages, call.id(), text);
        }
        return true;
    }

    /** 工具结果必须同时落库与进本轮 messages：落库是为了下一轮重放合法，进 messages 是为了这一次能继续。 */
    private void appendToolReply(Long sessionId, List<Map<String, Object>> messages,
                                 String toolCallId, String text) {
        AiMessage toolMsg = new AiMessage();
        toolMsg.setToolCallId(toolCallId);
        sessionService.append(sessionId, "tool", text, toolMsg);
        messages.add(toolMessageForModel(toolCallId, text));
    }

    private void emitClarifyGroups(AiEventSink sink, List<ChoiceGroup> choiceGroups) {
        for (ChoiceGroup g : choiceGroups) {
            sink.interaction(null, "clarify", g.title(), g.options(), false);
        }
    }

    /**
     * 挂起确认时的问句：**给人看的**动作短语 + 本次参数原文。
     *
     * <p>用 {@code confirmPhrase()} 而不是 {@code description()} —— 后者是写给模型的，
     * 里面常带「不要自己选」「不要在正文里说已经办好了」这类指令，原样显示给用户就成了
     * 一段在跟他讲规矩的话。
     */
    private String confirmQuestion(AiTool tool, DashScopeChatClient.ToolCall call) {
        String phrase = tool.confirmPhrase();
        JsonNode args = parseArgsQuietly(call.argumentsJson());
        String detail = args == null
                ? "本次参数：" + (call.argumentsJson() == null ? "{}" : call.argumentsJson())
                : tool.confirmDetailOf(args);
        // 确认卡是纯文本控件，不渲染 markdown —— 星号会原样显示成「**文件模板库**」。
        // 在这一处出口统一去掉强调记号，工具的 description/confirmDetail 里照旧可以写 markdown。
        return plain((phrase.isBlank() ? tool.name() : phrase) + "\n" + detail);
    }

    private static String plain(String s) {
        return s == null ? null : s.replace("**", "").replace("`", "");
    }

    /** 解析参数 JSON，失败回 null（调用方据此回落到原文或跳过钩子，不抛）。 */
    private JsonNode parseArgsQuietly(String argumentsJson) {
        try {
            return objectMapper.readTree(
                    argumentsJson == null || argumentsJson.isBlank() ? "{}" : argumentsJson);
        } catch (Exception e) {
            return null;
        }
    }

    /** 教职工视角闸门 —— 学生账号一律挡在门外（见设计文档；接口是公开路径，不能只靠界面不渲染）。 */
    private boolean requireStaffView(User actor, AiEventSink sink) {
        if (modeVisibilityService.isStudent(actor)) {
            log.warn("[ai-orch] 学生账号尝试调用 AI 操作网关，已拒绝: user={}", actor.getId());
            sink.error("STUDENT_VIEW_DENIED", "AI 操作助手目前只对教职工开放");
            return false;
        }
        return true;
    }

    private List<Map<String, Object>> baseMessages(User actor, Long sessionId, String contextPage,
                                                   List<AiToolPack> activePacks) {
        List<Map<String, Object>> messages = new ArrayList<>();
        messages.add(Map.of("role", "system", "content", systemPrompt(actor, contextPage, activePacks)));
        /** 用户消息在 messages 里的下标：注入附件预览要按 message_id 找回那一条。 */
        Map<Long, Integer> userIndex = new LinkedHashMap<>();
        for (AiMessage m : sessionService.window(sessionId)) {
            if ("user".equals(m.getRole()) && m.getId() != null) {
                userIndex.put(m.getId(), messages.size());
            }
            messages.add(toModelMessage(m));
        }
        injectAttachmentPreviews(messages, userIndex);
        return messages;
    }

    /**
     * 把附件的预览**拼进它所属的那条用户消息**（只改发给模型的这一份，库里 content 保持原文）。
     *
     * <p>为什么在「建消息」时注入、而不是上传时拼一次：这样**重放历史也会带上预览** ——
     * 用户上传完接着追问时，模型仍看得见那张表的前几行，而不是只剩一句「我发过一份表」。
     * 全量网格留在 {@code ai_attachment}，不进消息（否则撑爆窗口且每轮重复付费）。
     */
    private void injectAttachmentPreviews(List<Map<String, Object>> messages, Map<Long, Integer> userIndex) {
        if (userIndex.isEmpty()) {
            return;
        }
        List<AiAttachment> attachments;
        try {
            attachments = attachmentService.byMessageIds(new ArrayList<>(userIndex.keySet()));
        } catch (RuntimeException e) {
            log.warn("[ai-orch] 读取附件失败，本轮不带预览: {}", e.getMessage());
            return;
        }
        for (AiAttachment a : attachments) {
            Integer idx = userIndex.get(a.getMessageId());
            if (idx == null) {
                continue;
            }
            Map<String, Object> msg = messages.get(idx);
            // 带图那轮的 content 是 parts 数组（attachImages 之后），这里只处理纯文本那种；
            // 顺序上 attachImages 在建消息之后才跑，所以实际总是字符串，这个判断只是兜底。
            if (!(msg.get("content") instanceof String text)) {
                continue;
            }
            msg.put("content", text + "\n\n" + attachmentService.previewText(a));
        }
    }

    // ── 组装 ──

    /**
     * 本请求该发哪些包：**先按能力裁，再按 L2 路由裁**。
     *
     * <p>顺序是先能力后路由：路由词命中的包如果这个人根本无权用，把它算进命中只会把别的包挤掉。
     *
     * <p>路由交给 {@link AiPackRouter#routeForTurn}：**当轮原话优先**，历史正文只在原话一个域
     * 都认不出时才参与 —— 助手上一轮枚举自己能耐时会把好几个域的名字写进正文，那些域会被当成
     * 命中，把当轮真正问的域挤出包位（真机：问「2 楼的湿度情况」答「我没有环境监测工具」）。
     */
    private List<AiToolPack> routedPacks(User actor, String contextPage, String userText, String sessionContext) {
        List<AiToolPack> usable = new ArrayList<>();
        for (AiToolPack pack : toolRegistry.packs()) {
            if (!usableTools(capabilityGate, actor, pack.tools()).isEmpty()) {
                usable.add(pack);
            }
        }
        return packRouter.routeForTurn(usable, contextPage, userText, sessionContext);
    }

    /**
     * 路由用的**历史**材料：最近一轮助手正文 + 本会话带过的附件名。**不含当轮原话** ——
     * 原话由 {@code routeForTurn} 先单独试，命中就不看这里。
     *
     * <p>为什么需要它：追问「那把它出库」里一个域名词都没有，全靠上一轮助手说的
     * 「这张领用单…」才认得出是物资处理。截断到 400 字：助手正文可能很长，全塞进去反而
     * 到处都能命中，等于路由失效。
     */
    private String sessionContextText(Long sessionId) {
        StringBuilder sb = new StringBuilder();
        List<AiMessage> window = sessionService.window(sessionId);
        if (window != null) {
            for (int i = window.size() - 1; i >= 0; i--) {
                AiMessage m = window.get(i);
                if ("assistant".equals(m.getRole()) && StringUtils.hasText(m.getContent())) {
                    String text = m.getContent();
                    sb.append(' ').append(text, 0, Math.min(text.length(), 400));
                    break;
                }
            }
        }
        // 「本会话带过表格附件」本身就是路由信号。用户传完表往往只说「把日期统一一下」，
        // 句子里根本没有「表格」二字；而每轮只发 4 个包，附件包一旦没被命中就会**整个漏发**
        // —— 模型手里连读表的工具都没有，只能照着预览里的几行瞎猜。这里把它显式加进路由词。
        try {
            for (AiAttachment a : attachmentService.listSession(sessionId)) {
                sb.append(" 附件 表格 ").append(a.getFilename());
            }
        } catch (RuntimeException e) {
            log.debug("[ai-orch] 路由取附件名失败: {}", e.getMessage());
        }
        // ⚠ 别在这里拼「本会话用过的工具名」当粘性信号（2026-10-08 试过，撤掉了）：
        // 工具名是驼峰连写，会跨包撞子串（listPendingCageOpReviews 里含 review），
        // 权重一抬就把当轮**真正**命中的包挤出去 —— 实测「2 楼的湿度情况」在上一轮聊过审核的
        // 会话里变成「我手里没有环境监测类的工具」。粘性本来就由上面的「最近一轮助手正文」自带。
        return sb.toString();
    }

    private String systemPrompt(User actor, String contextPage, List<AiToolPack> activePacks) {
        StringBuilder ctx = new StringBuilder();
        ctx.append("当前时间：").append(LocalDateTime.now().format(TS));
        if (actor != null) {
            // 让模型知道它在跟谁说话（「我能做什么」这类问题要靠它）。
            // 只给姓名与角色 —— 账号 id 是雪花串，对模型没用，也不必外露。
            String who = StringUtils.hasText(actor.getDisplayNickname())
                    ? actor.getDisplayNickname() : actor.getUsername();
            RoleEnum role = actor.getRole() == null ? RoleEnum.MEMBER : actor.getRole();
            ctx.append("；当前操作人：").append(who == null ? "未知" : who)
               .append("（").append(role.getDescZh()).append("）");
        }
        if (contextPage != null && !contextPage.isBlank()) {
            ctx.append("；入口页面：").append(contextPage);
        }
        // L1 口径跟着工具一起裁：包是按能力 + 路由选出来的，没选的包连口径都不该出现 ——
        // 一个工具都没发的包，还留着它的域内约束，等于让模型承诺它其实做不到的事
        //（「你可以审核…」而审核工具根本没发）。
        List<AiToolPack> withTools = new ArrayList<>();
        for (AiToolPack pack : activePacks) {
            if (!usableTools(capabilityGate, actor, pack.tools()).isEmpty()) {
                withTools.add(pack);
            }
        }
        return promptService.assemble(withTools, ctx.toString());
    }

    /**
     * 这个身份实际用得上的工具。**能力不过的直接不发**。
     *
     * <p>为什么必须在这里滤：发了再拒等于让用户白等一轮，还回一句「没有权限」—— 看着像功能坏了。
     * 模型看不见也就不会去调。实测有据：一次「列一下张鹏课题组的全部成员」连发了 6 次调用、
     * 其中 3 次被拒，就是在无权工具上空转。
     *
     * <p>判定走**同一个**闸门 {@link AiCapabilityGate}（不另立一套），与执行时的墙同源；
     * registry 的稳定顺序被保留 —— 顺序一漂，prompt 缓存前缀就全失效了。
     *
     * <p>注意这只是**入口裁剪**，不是安全墙：执行时仍会再判一次（工具名是模型产出的，
     * 身份在会话期间也可能变），墙始终在 {@link #executeOne}。
     */
    static List<AiTool> usableTools(AiCapabilityGate gate, User actor, List<AiTool> all) {
        List<AiTool> out = new ArrayList<>();
        for (AiTool tool : all) {
            if (gate.check(actor, tool.capability()) == null) {
                out.add(tool);
            }
        }
        return out;
    }

    /**
     * 发给模型的 tools 载荷。只放这个身份用得上的（见 {@link #usableTools}）；
     * 空表时不带 tools 参数，模型就只会回文本。
     */
    private List<Map<String, Object>> toolsPayload(User actor, List<AiToolPack> activePacks) {
        // 顺序沿用注册表那份（包名序 + 工具名序）—— 只做筛选，不重排。顺序一漂，prompt 缓存前缀全失效。
        Set<String> allowed = new HashSet<>();
        for (AiToolPack pack : activePacks) {
            for (AiTool t : pack.tools()) {
                allowed.add(t.name());
            }
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (AiTool t : usableTools(capabilityGate, actor, toolRegistry.allTools())) {
            if (!allowed.contains(t.name())) {
                continue;
            }
            Map<String, Object> fn = new LinkedHashMap<>();
            fn.put("name", t.name());
            fn.put("description", t.description());
            fn.put("parameters", parseSchema(t.schemaJson()));
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("type", "function");
            item.put("function", fn);
            out.add(item);
        }
        return out;
    }

    private Object parseSchema(String schemaJson) {
        try {
            if (schemaJson == null || schemaJson.isBlank()) {
                return objectMapper.readTree("{\"type\":\"object\",\"properties\":{}}");
            }
            return objectMapper.readTree(schemaJson);
        } catch (Exception e) {
            throw new IllegalStateException("工具 schema 不是合法 JSON: " + e.getMessage(), e);
        }
    }

    /** 把落库的消息还原成模型要的形状（工具轮必须带 tool_call_id，否则无法重放）。 */
    private Map<String, Object> toModelMessage(AiMessage m) {
        if ("tool".equals(m.getRole())) {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("role", "tool");
            map.put("tool_call_id", m.getToolCallId() == null ? "" : m.getToolCallId());
            map.put("content", m.getContent() == null ? "" : m.getContent());
            return map;
        }
        if ("assistant".equals(m.getRole()) && m.getRawToolCalls() != null && !m.getRawToolCalls().isBlank()) {
            return assistantMessageForModel(m.getContent(), parseToolCalls(m.getRawToolCalls()));
        }
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("role", m.getRole());
        map.put("content", m.getContent() == null ? "" : m.getContent());
        return map;
    }

    /**
     * 把图片拼到**最后一条用户消息**上（OpenAI 兼容的视觉格式：content 从字符串变成 parts 数组）。
     *
     * <p>这里只保证「图真的发出去了」。上游若明确不支持图片会 400 回绝、整轮失败 —— 那时该换模型或撤掉
     * 上传入口，而不是在这儿把图悄悄丢掉：悄悄丢才是功能假通。
     */
    private static void attachImages(List<Map<String, Object>> messages, List<String> images) {
        if (images == null || images.isEmpty()) {
            return;
        }
        List<Map<String, Object>> parts = new ArrayList<>();
        for (String raw : images) {
            String url = normalizeImageUrl(raw);
            if (url != null) {
                parts.add(Map.of("type", "image_url", "image_url", Map.of("url", url)));
            }
        }
        if (parts.isEmpty()) {
            return;
        }
        for (int i = messages.size() - 1; i >= 0; i--) {
            Map<String, Object> m = messages.get(i);
            if (!"user".equals(m.get("role"))) {
                continue;
            }
            parts.add(Map.of("type", "text", "text", String.valueOf(m.get("content"))));
            m.put("content", parts);
            return;
        }
    }

    /** 退回纯文字：把 parts 数组还原成那个 text 段（图全部丢掉）。 */
    private static void stripImageParts(List<Map<String, Object>> messages) {
        for (int i = messages.size() - 1; i >= 0; i--) {
            Map<String, Object> m = messages.get(i);
            if (!(m.get("content") instanceof List<?> parts)) {
                continue;
            }
            String text = "";
            for (Object p : parts) {
                if (p instanceof Map<?, ?> part && "text".equals(part.get("type"))) {
                    text = String.valueOf(part.get("text"));
                    break;
                }
            }
            m.put("content", text);
            return;
        }
    }

    /** 前端给 data URL 或裸 base64 都收：裸 base64 补成 data URL（视觉接口要 URL 形态）。 */
    private static String normalizeImageUrl(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        String s = raw.trim();
        if (s.startsWith("data:") || s.startsWith("http://") || s.startsWith("https://")) {
            return s;
        }
        return "data:image/png;base64," + s;
    }

    /**
     * 把「没有对应 assistant tool_calls 的 tool 消息」删掉。
     *
     * <p>上游对序列的要求是硬性的：{@code Messages with role 'tool' must be a response to a preceding
     * message with 'tool_calls'}。最容易踩的是**窗口截断** —— history 只取最近 N 条，头一条正好落在
     * 某次工具应答中间，它上面那条 assistant(tool_calls) 被截掉了，整次请求就被 400 掉（真机踩过）。
     *
     * <p>与 {@link #dropOrphanToolCalls} 是两个方向，都要做：那边删「有 tool_calls 没应答」，
     * 这边删「有应答没 tool_calls」。
     */
    void dropOrphanToolMessages(List<Map<String, Object>> messages) {
        Set<String> pending = new HashSet<>();
        for (int i = 0; i < messages.size(); i++) {
            Map<String, Object> m = messages.get(i);
            String role = String.valueOf(m.get("role"));
            if ("assistant".equals(role)) {
                pending.clear();
                if (m.get("tool_calls") instanceof List<?> calls) {
                    for (Object c : calls) {
                        if (c instanceof Map<?, ?> cm) {
                            pending.add(String.valueOf(cm.get("id")));
                        }
                    }
                }
            } else if ("tool".equals(role)) {
                if (pending.remove(String.valueOf(m.get("tool_call_id")))) {
                    continue; // 配对成功
                }
                messages.remove(i);
                i--;
            } else {
                // user / system：上一轮工具应答的配对窗口到此结束
                pending.clear();
            }
        }
    }

    /**
     * 把历史里「有 tool_calls 却没有配对 tool 响应」的助理轮降级成普通文本消息。
     *
     * <p>修好落库之前产生的数据都是这个形状（工具结果当时没存），直接重放会被上游拒。
     * 降级只丢「这轮调用过什么」的痕迹，正文保留，对话仍可继续。
     */
    private void dropOrphanToolCalls(List<Map<String, Object>> messages) {
        for (int i = 0; i < messages.size(); i++) {
            Map<String, Object> m = messages.get(i);
            if (!"assistant".equals(m.get("role"))) {
                continue;
            }
            Object raw = m.get("tool_calls");
            if (!(raw instanceof List<?> calls) || calls.isEmpty()) {
                continue;
            }
            java.util.Set<String> pending = new java.util.HashSet<>();
            for (Object c : calls) {
                if (c instanceof Map<?, ?> cm) {
                    pending.add(String.valueOf(cm.get("id")));
                }
            }
            for (int j = i + 1; j < messages.size() && "tool".equals(messages.get(j).get("role")); j++) {
                pending.remove(String.valueOf(messages.get(j).get("tool_call_id")));
            }
            if (!pending.isEmpty()) {
                m.remove("tool_calls");
                log.debug("[ai-orch] 历史里缺 tool 响应的工具轮已降级，缺: {}", pending);
            }
        }
    }

    private Map<String, Object> assistantMessageForModel(String content, List<DashScopeChatClient.ToolCall> calls) {
        List<Map<String, Object>> arr = new ArrayList<>();
        for (DashScopeChatClient.ToolCall c : calls) {
            Map<String, Object> fn = new LinkedHashMap<>();
            fn.put("name", c.name());
            fn.put("arguments", c.argumentsJson());
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", c.id());
            item.put("type", "function");
            item.put("function", fn);
            arr.add(item);
        }
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("role", "assistant");
        map.put("content", content == null ? "" : content);
        map.put("tool_calls", arr);
        return map;
    }

    private Map<String, Object> toolMessageForModel(String toolCallId, String result) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("role", "tool");
        map.put("tool_call_id", toolCallId);
        map.put("content", result == null ? "" : result);
        return map;
    }

    private String serializeToolCalls(List<DashScopeChatClient.ToolCall> calls) {
        try {
            List<Map<String, Object>> arr = new ArrayList<>();
            for (DashScopeChatClient.ToolCall c : calls) {
                Map<String, Object> fn = new LinkedHashMap<>();
                fn.put("name", c.name());
                fn.put("arguments", c.argumentsJson());
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("id", c.id());
                item.put("type", "function");
                item.put("function", fn);
                arr.add(item);
            }
            return objectMapper.writeValueAsString(arr);
        } catch (Exception e) {
            return "[]";
        }
    }

    private List<DashScopeChatClient.ToolCall> parseToolCalls(String raw) {
        List<DashScopeChatClient.ToolCall> out = new ArrayList<>();
        try {
            for (JsonNode n : objectMapper.readTree(raw)) {
                out.add(new DashScopeChatClient.ToolCall(
                        n.path("id").asText(""),
                        n.path("function").path("name").asText(""),
                        n.path("function").path("arguments").asText("{}")));
            }
        } catch (Exception e) {
            log.warn("[ai-orch] 解析历史 tool_calls 失败，按空处理: {}", e.getMessage());
        }
        return out;
    }

    /** 一次工具调用抛出的候选：标题（问的是谁的什么）+ 可点选项。批量清单会同时挂好几组。 */
    private record ChoiceGroup(String title, List<AiEventSink.Option> options) {
    }

    /**
     * 工具返回里的候选约定，两种形态都收：
     *
     * <ul>
     *   <li>单组：{@code choices:[{label,value}]} + 可选 {@code choicesTitle}（既有约定，不动）；</li>
     *   <li>多组：{@code questions:[{title, options:[{label,value}]}]} —— 一个工具一次要问好几件事
     *       （发布门户内容那次：栏目、分类、优先级、发布方式四问一次抛出）。载体本来就支持排队多问
     *       （{@code choiceGroups} 是个 List），缺的一直是"一个工具怎么产出多组"。</li>
     * </ul>
     *
     * <p>约定故意做得很窄，因为它同时是**工具与载体的接口**；工具想说「这几个里挑一个」就带 choices，
     * 载体负责渲染，编排层只做搬运、不懂业务含义。
     */
    @SuppressWarnings("unchecked")
    private List<ChoiceGroup> collectChoices(Object out) {
        if (!(out instanceof Map<?, ?> map)) {
            return List.of();
        }
        Map<String, Object> m = (Map<String, Object>) map;
        List<ChoiceGroup> groups = new ArrayList<>();
        ChoiceGroup single = toGroup(m.get("choices"), m.get("choicesTitle"));
        if (single != null) {
            groups.add(single);
        }
        Object multi = m.get("questions");
        if (multi instanceof List<?> list) {
            for (Object q : list) {
                if (q instanceof Map<?, ?> qm) {
                    Map<String, Object> qmap = (Map<String, Object>) qm;
                    ChoiceGroup g = toGroup(qmap.get("options"), qmap.get("title"));
                    if (g != null) {
                        groups.add(g);
                    }
                }
            }
        }
        return groups;
    }

    @SuppressWarnings("unchecked")
    private static ChoiceGroup toGroup(Object rawChoices, Object rawTitle) {
        if (!(rawChoices instanceof List<?> list)) {
            return null;
        }
        List<AiEventSink.Option> options = new ArrayList<>();
        for (Object item : list) {
            if (item instanceof Map<?, ?> m) {
                Object label = ((Map<String, Object>) m).get("label");
                Object value = ((Map<String, Object>) m).get("value");
                if (label != null && value != null) {
                    options.add(new AiEventSink.Option(String.valueOf(label), String.valueOf(value)));
                }
            }
        }
        return options.isEmpty() ? null : new ChoiceGroup(rawTitle == null ? "" : String.valueOf(rawTitle), options);
    }

    /**
     * 工具结果的业务成败 —— 台账的 {@code ok} 取这个值，不是「调用有没有抛异常」。
     *
     * <p>工具用 {@code {"ok":false,...}} 表达**业务上的拒绝**（越界的房间、得让用户先挑一个），
     * 这类调用执行体正常返回、库也正常写，早期一律记成成功 —— 于是审计页把「被拦住没做事」
     * 显示成「成功」。约定：显式给了 ok:false 就是没成，没给这个键的按成功算。
     */
    static boolean businessOk(Object out) {
        if (out instanceof Map<?, ?> map) {
            Object ok = map.get("ok");
            if (ok instanceof Boolean b) {
                return b;
            }
        }
        return true;
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

    private static String contextPageSource(String contextPage) {
        return contextPage != null && contextPage.startsWith("/mp") ? "mp" : "web";
    }

    private static String trimTo(String s, int max) {
        if (s == null) return null;
        return s.length() <= max ? s : s.substring(0, max);
    }

    private static String truncate(String s, int max) {
        if (s == null) return null;
        return s.length() <= max ? s : s.substring(0, max);
    }
}
