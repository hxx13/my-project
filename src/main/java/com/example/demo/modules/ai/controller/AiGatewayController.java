package com.example.demo.modules.ai.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.ai.core.SseEventSink;
import com.example.demo.modules.ai.entity.AiMessage;
import com.example.demo.modules.ai.entity.AiLearnEntry;
import com.example.demo.modules.ai.entity.AiSession;
import com.example.demo.modules.ai.entity.AiUserPreference;
import com.example.demo.modules.ai.mapper.AiLearnEntryMapper;
import com.example.demo.modules.ai.mapper.AiUserPreferenceMapper;
import com.example.demo.modules.ai.service.AiAuditService;
import com.example.demo.modules.ai.service.AiLearnRunner;
import com.example.demo.modules.ai.service.AiMessageFeedbackService;
import com.example.demo.modules.ai.service.AiOrchestrator;
import com.example.demo.modules.ai.service.AiPromptService;
import com.example.demo.modules.ai.service.AiSessionService;
import com.example.demo.modules.ai.tool.AiPackRouter;
import com.example.demo.modules.ai.tool.AiToolPack;
import com.example.demo.modules.ai.tool.ToolRegistry;
import com.example.demo.modules.auth.entity.User;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executor;
import java.util.stream.Collectors;

/**
 * AI 对话操作网关接入层。**载体无关** —— Web 智能体球与小程序走同一套接口。
 *
 * 身份一律来自 JWT（{@code Authorization} 头），**不从请求体读**（不变量 I1）。
 * 路径落在 {@code /api/v1/**} 下，已由 apiAuthInterceptor 覆盖，无需改 WebMvcConfig。
 */
@RestController
@RequestMapping("/api/v1/ai")
@Tag(name = "AI 对话操作网关", description = "自然语言驱动的受约束操作：会话、消息流、审计、约束预览")
public class AiGatewayController {

    private static final long SSE_TIMEOUT_MS = 10 * 60 * 1000L;

    private final AuthContextService authContextService;
    private final AiSessionService sessionService;
    private final AiOrchestrator orchestrator;
    private final AiAuditService auditService;
    private final AiPromptService promptService;
    private final ToolRegistry toolRegistry;
    private final Executor aiTaskExecutor;
    private final AiPackRouter packRouter;
    private final AiMessageFeedbackService feedbackService;
    private final AiLearnRunner learnRunner;
    private final AiLearnEntryMapper learnEntryMapper;
    private final AiUserPreferenceMapper preferenceMapper;

    public AiGatewayController(AuthContextService authContextService,
                               AiSessionService sessionService,
                               AiOrchestrator orchestrator,
                               AiAuditService auditService,
                               AiPromptService promptService,
                               ToolRegistry toolRegistry,
                               @Qualifier("aiTaskExecutor") Executor aiTaskExecutor,
                               AiPackRouter packRouter,
                               AiMessageFeedbackService feedbackService,
                               AiLearnRunner learnRunner,
                               AiLearnEntryMapper learnEntryMapper,
                               AiUserPreferenceMapper preferenceMapper) {
        this.authContextService = authContextService;
        this.sessionService = sessionService;
        this.orchestrator = orchestrator;
        this.auditService = auditService;
        this.promptService = promptService;
        this.toolRegistry = toolRegistry;
        this.aiTaskExecutor = aiTaskExecutor;
        this.packRouter = packRouter;
        this.feedbackService = feedbackService;
        this.learnRunner = learnRunner;
        this.learnEntryMapper = learnEntryMapper;
        this.preferenceMapper = preferenceMapper;
    }

    // ── 会话 ──

    @PostMapping("/sessions")
    @Operation(summary = "新建会话")
    public Result<AiSession> createSession(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody(required = false) Map<String, Object> body) {
        User user = currentUser(authorization);
        if (user == null) {
            return Result.error("未登录");
        }
        String contextPage = body == null ? null : str(body.get("contextPage"));
        String source = body == null ? "web" : str(body.getOrDefault("source", "web"));
        return Result.success(sessionService.create(user.getId(), source, contextPage));
    }

    @GetMapping("/sessions")
    @Operation(summary = "会话列表（侧栏）")
    public Result<Map<String, Object>> listSessions(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        User user = currentUser(authorization);
        if (user == null) {
            return Result.error("未登录");
        }
        List<AiSession> list = sessionService.list(user.getId(), page, size);
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("list", list);
        data.put("total", sessionService.count(user.getId()));
        data.put("page", page);
        data.put("size", size);
        return Result.success(data);
    }

    @DeleteMapping("/sessions/{id}")
    @Operation(summary = "删除一条对话（软删：列表/续聊不再出现，审计留痕保留）")
    public Result<?> deleteSession(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable Long id) {
        User user = currentUser(authorization);
        if (user == null) {
            return Result.error("未登录");
        }
        try {
            sessionService.delete(id, user.getId());
        } catch (IllegalStateException e) {
            return Result.error(e.getMessage());
        }
        return Result.success(true);
    }

    @GetMapping("/sessions/{id}/messages")
    @Operation(summary = "会话历史。不给 limit = 全量（老行为不变）；给了 limit 就取**尾页**，"
            + "带 beforeSeq 往前翻（打开旧对话先给最后一屏，往上滚再要更早的）")
    public Result<List<AiMessage>> history(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable Long id,
            @RequestParam(value = "beforeSeq", required = false) Integer beforeSeq,
            @RequestParam(value = "limit", required = false, defaultValue = "0") int limit) {
        User user = currentUser(authorization);
        if (user == null) {
            return Result.error("未登录");
        }
        try {
            sessionService.requireOwned(id, user.getId());
        } catch (IllegalStateException e) {
            return Result.error(e.getMessage());
        }
        if (limit <= 0) {
            return Result.success(sessionService.history(id));
        }
        // 上限拦一道：别让一个 limit=99999 把长会话整本拉回来（那正是分页要避免的）
        return Result.success(sessionService.historyTail(id, beforeSeq, Math.min(limit, MAX_HISTORY_PAGE)));
    }

    /** 一页历史最多几条。 */
    private static final int MAX_HISTORY_PAGE = 200;

    /**
     * 给一条助手回复点**赞 / 踩**。
     *
     * <p>同一条回复重复投 = **改那一票**（赞↔踩），不堆行 —— 唯一键保证「只算一次」。
     * 只能评自己会话里的回复（归属判据与读历史同一套）。
     */
    @PostMapping("/messages/{id}/feedback")
    @Operation(summary = "回复级反馈：赞/踩挂在具体那条回复上，同一人同一回复只算一票")
    public Result<?> voteMessage(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable Long id,
            @RequestBody(required = false) Map<String, String> body) {
        User user = currentUser(authorization);
        if (user == null) {
            return Result.error("未登录");
        }
        try {
            feedbackService.vote(user, id,
                    body == null ? null : body.get("vote"),
                    body == null ? null : body.get("reason"));
            return Result.success(true);
        } catch (IllegalStateException | IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    /**
     * **撤掉**这一票 —— 用户再点一次同一个图标。
     *
     * <p>与投票分开成两个方法：那个是「我要投 up/down」（幂等 upsert），
     * 这个是「我不投了」（整行删）。合成一个用空串表示取消也行，但语义会糊在参数里。
     */
    @DeleteMapping("/messages/{id}/feedback")
    @Operation(summary = "撤掉赞/踩（再点一次同一个图标就是取消）")
    public Result<?> cancelVote(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable Long id) {
        User user = currentUser(authorization);
        if (user == null) {
            return Result.error("未登录");
        }
        try {
            feedbackService.cancelVote(user, id);
            return Result.success(true);
        } catch (IllegalStateException | IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    /** 某个会话里**我自己**投过的票 —— 界面用它回填「我点过哪条」。 */    @GetMapping("/sessions/{id}/my-feedback")
    @Operation(summary = "我自己在这个会话里的赞/踩（只回本人的）")
    public Result<List<Map<String, Object>>> myFeedback(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable Long id) {
        User user = currentUser(authorization);
        if (user == null) {
            return Result.error("未登录");
        }
        try {
            return Result.success(feedbackService.myVotes(user, id));
        } catch (IllegalStateException e) {
            return Result.error(e.getMessage());
        }
    }

    // ── 发消息（SSE）──

    @PostMapping(value = "/sessions/{id}/messages/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @Operation(summary = "发送消息并流式回复（SSE：delta / tool / interaction / done / error）")
    public SseEmitter streamMessage(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable Long id,
            @RequestBody Map<String, Object> body) {
        SseEmitter emitter = new SseEmitter(SSE_TIMEOUT_MS);
        SseEventSink sink = new SseEventSink(emitter);

        // 参数类错误一律走 SSE error 事件，不用 completeWithError —— 后者会变成裸 500 + 空响应体，
        // 前端只看到流断裂、拿不到原因；而同一个接口的会话类错误走的是 event:error。
        // 同一个接口不能有两种错误形态。（实测 c/d 干净、e 是裸 500，故统一。）
        User user = currentUser(authorization);
        if (user == null) {
            sink.error("UNAUTHORIZED", "未登录");
            emitter.complete();
            return emitter;
        }
        String content = body == null ? null : str(body.get("content"));
        if (content == null || content.isBlank()) {
            sink.error("BAD_REQUEST", "消息内容不能为空");
            emitter.complete();
            return emitter;
        }
        String contextPage = body == null ? null : str(body.get("contextPage"));

        aiTaskExecutor.execute(() -> {
            try {
                orchestrator.run(user, id, content, contextPage, sink);
            } catch (IllegalStateException e) {
                sink.error("BAD_REQUEST", e.getMessage());
            } catch (Exception e) {
                sink.error("INTERNAL", "服务异常：" + e.getMessage());
            } finally {
                emitter.complete();
            }
        });
        return emitter;
    }

    // ── 挂起续跑（P2）──

    @PostMapping(value = "/sessions/{id}/interactions/{token}/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @Operation(summary = "回应挂起（确认/取消）并从挂起处继续，SSE 同发消息")
    public SseEmitter resumeInteraction(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable Long id,
            @PathVariable String token,
            @RequestBody(required = false) Map<String, Object> body) {
        SseEmitter emitter = new SseEmitter(SSE_TIMEOUT_MS);
        SseEventSink sink = new SseEventSink(emitter);

        User user = currentUser(authorization);
        if (user == null) {
            sink.error("UNAUTHORIZED", "未登录");
            emitter.complete();
            return emitter;
        }
        // **只收选择值**（不变量 I4）：挂起态在服务端，前端回传整个对象等于给它篡改的机会。
        String value = body == null ? null : str(body.get("value"));
        if (value == null || value.isBlank()) {
            sink.error("BAD_REQUEST", "缺少选择值");
            emitter.complete();
            return emitter;
        }

        aiTaskExecutor.execute(() -> {
            try {
                orchestrator.resume(user, id, token, value, sink);
            } catch (IllegalStateException e) {
                // 凭证失效/已处理/过期都走这里，全是可以直接给用户看的话
                sink.error("BAD_REQUEST", e.getMessage());
            } catch (Exception e) {
                sink.error("INTERNAL", "服务异常：" + e.getMessage());
            } finally {
                emitter.complete();
            }
        });
        return emitter;
    }

    // ── 审计（表格页数据源）──

    @GetMapping("/audit/rows")
    @Operation(summary = "AI 操作审计表（一次工具调用一行，含被拒绝的）")
    public Result<Map<String, Object>> auditRows(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam(required = false) String userId,
            @RequestParam(required = false) Long sessionId,
            @RequestParam(required = false) String toolName,
            @RequestParam(required = false) Boolean executed,
            @RequestParam(required = false) Boolean deniedOnly,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime to,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        User user = requireAuditor(authorization);
        if (user == null) {
            return Result.error("无权限查看审计");
        }
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("rows", auditService.auditRows(userId, sessionId, toolName, executed, deniedOnly, from, to, page, size));
        data.put("total", auditService.countAuditRows(userId, sessionId, toolName, executed, deniedOnly, from, to));
        data.put("page", page);
        data.put("size", size);
        return Result.success(data);
    }

    @GetMapping("/audit/tool-names")
    @Operation(summary = "审计筛选下拉：出现过的工具名")
    public Result<List<String>> auditToolNames(
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        if (requireAuditor(authorization) == null) {
            return Result.error("无权限查看审计");
        }
        return Result.success(auditService.toolNames());
    }

    // ── 学习池 ──

    /**
     * 立刻跑一轮学习，**跳过触发条件**（不看新候选够不够数、不看冷却期）。
     *
     * <p>定期那轮由 {@code AiLearnScheduler} 喊，但「池子里怎么一点动静都没有」只能靠手动跑一次
     * 才分得清：是**没到点**，还是**到了点却捞不出候选**。两者的处置完全不同。
     */
    @PostMapping("/learn/run")
    @Operation(summary = "立刻跑一轮学习（跳过触发条件）")
    public Result<Map<String, Object>> runLearn(
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        if (requireAuditor(authorization) == null) {
            return Result.error("无权限");
        }
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("absorbed", learnRunner.runNow());
        return Result.success(data);
    }

    // ── 单条消息的思考正文（按需拉取）──

    /**
     * 取**一条**助手回复的思考正文。
     *
     * <p>为什么要这个接口：思考正文很长，各端**故意不把它放进本地缓存**（会撑爆存储），
     * 于是「切走再切回来」时只能靠历史接口补 —— 而历史接口那条路上有好几处会把它弄丢
     * （实测撞过三次：只存了工具轮、历史回调的二次重建、小程序重开走缓存不拉历史）。
     *
     * <p>与其在每个本地状态流转处都堵一遍，不如**让展开这个动作直接去后端要** ——
     * 库是唯一真相源，中间任何一层的状态丢了都不影响。
     */
    @GetMapping("/messages/{id}/reasoning")
    @Operation(summary = "单条回复的思考正文（展开时按需拉取）")
    public Result<Map<String, Object>> messageReasoning(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable Long id) {
        User user = currentUser(authorization);
        if (user == null) {
            return Result.error("未登录");
        }
        AiMessage m = sessionService.message(id);
        if (m == null || !"assistant".equals(m.getRole())) {
            return Result.error("找不到这条回复");
        }
        try {
            sessionService.requireOwned(m.getSessionId(), user.getId());
        } catch (IllegalStateException e) {
            return Result.error(e.getMessage());
        }
        Map<String, Object> data = new LinkedHashMap<>();
        // 没有就回空串 —— 有些轮次模型**真的没思考**（实测简单请求只 46 字、甚至 0 字），
        // 那不是丢了。载体拿到空串时应如实显示「这一轮没有思考内容」，别显示成故障。
        data.put("reasoning", m.getReasoningContent() == null ? "" : m.getReasoningContent());
        data.put("reasoningTokens", m.getReasoningTokens());
        data.put("thinkingMs", m.getThinkingMs());
        return Result.success(data);
    }

    // ── 学习池 / 个人偏好（后台）──

    /**
     * 学习池全量 —— 后台看「学出了什么、没学什么、各是什么原因」。
     *
     * <p>按状态筛选：观察中 / 生效 / 停用 / 淘汰。**淘汰的那些不删是有意的** ——
     * 判死的理由就写在它们的 note 里（如「模型判定这是我们给的选项措辞」），删了就查不到了。
     */
    @GetMapping("/learn/entries")
    @Operation(summary = "学习池全量（可按状态筛）")
    public Result<List<AiLearnEntry>> learnEntries(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam(required = false) String status) {
        if (requireAuditor(authorization) == null) {
            return Result.error("无权限查看");
        }
        return Result.success(learnEntryMapper.list(status, 500));
    }

    /** 停用 / 启回一条。停用的不进提示词（超管的手工总闸，兜底用）。 */
    @PostMapping("/learn/entries/{id}/status")
    @Operation(summary = "改学习池条目的状态（停用 / 启回）")
    public Result<Boolean> setLearnEntryStatus(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable Long id,
            @RequestParam String status) {
        if (requireAuditor(authorization) == null) {
            return Result.error("无权限");
        }
        // 只允许人手动切这两态：观察中/淘汰是判定跑出来的，人工改回去等于伪造证据
        if (!AiLearnEntry.ACTIVE.equals(status) && !AiLearnEntry.DISABLED.equals(status)) {
            return Result.error("只能切成「生效」或「停用」");
        }
        return Result.success(learnEntryMapper.updateStatus(id, status) > 0);
    }

    /** 某一批学了多少条 —— 回滚前让超管看清影响面，别盲点。 */
    @GetMapping("/learn/batch/{batchNo}/size")
    @Operation(summary = "按批看影响面（回滚前用）")
    public Result<Integer> learnBatchSize(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable String batchNo) {
        if (requireAuditor(authorization) == null) {
            return Result.error("无权限");
        }
        return Result.success(learnEntryMapper.countBatch(batchNo));
    }

    /** **整批回滚**：撤掉某一批学出来的东西（学歪了、或某天数据异常时的兜底）。 */
    @PostMapping("/learn/batch/{batchNo}/rollback")
    @Operation(summary = "按批回滚")
    public Result<Integer> rollbackLearnBatch(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable String batchNo) {
        if (requireAuditor(authorization) == null) {
            return Result.error("无权限");
        }
        return Result.success(learnEntryMapper.deleteBatch(batchNo));
    }

    /**
     * 看**某个人**的偏好。
     *
     * <p>这是审计用的第三条腿（前两条：写入时当场明说、用户随时可以问）。
     * **用户自己的控制入口是对话**，这个页面只服务事后审计与兜底重置。
     */
    @GetMapping("/preferences")
    @Operation(summary = "按人查看偏好（超管）")
    public Result<List<AiUserPreference>> preferences(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam String userId) {
        if (requireAuditor(authorization) == null) {
            return Result.error("无权限查看");
        }
        return Result.success(preferenceMapper.listByUser(userId, 200));
    }

    /** 清空某人的偏好 —— 兜底与重置。 */
    @DeleteMapping("/preferences")
    @Operation(summary = "清空某人的偏好（超管）")
    public Result<Integer> clearPreferences(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam String userId) {
        if (requireAuditor(authorization) == null) {
            return Result.error("无权限");
        }
        return Result.success(preferenceMapper.clear(userId));
    }

    // ── 个人偏好：用户自助（只能碰自己的）──

    /**
     * **我自己的**偏好。
     *
     * <p>为什么必须有这条路：只用「对话里问一句」的话，用户**根本不知道助手记了什么** ——
     * 知情权不能只靠他想得起来问。所以给一个看得见的列表，还能直接改。
     * 这与「用户的控制入口是对话」不冲突：对话是最快的那条路，这里是**兜底与可见性**。
     */
    @GetMapping("/preferences/mine")
    @Operation(summary = "我自己的偏好")
    public Result<List<AiUserPreference>> myPreferences(
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        User me = currentUser(authorization);
        if (me == null) {
            return Result.error("未登录");
        }
        return Result.success(preferenceMapper.listByUser(me.getId(), 200));
    }

    /** 自己加一条。**不需要审计权限** —— 谁都能管自己的偏好，但也只能管自己的。 */
    @PostMapping("/preferences/mine")
    @Operation(summary = "自己加一条偏好")
    public Result<Boolean> addMyPreference(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody Map<String, String> body) {
        User me = currentUser(authorization);
        if (me == null) {
            return Result.error("未登录");
        }
        String content = body == null ? null : body.get("content");
        if (content == null || content.isBlank()) {
            return Result.error("内容不能为空");
        }
        String c = content.strip();
        // 上限与工具那条一致：太长的不像「偏好」，像一段说明
        if (c.length() > 120) {
            return Result.error("太长了（" + c.length() + " 字），偏好要短 —— 一句话说清");
        }
        AiUserPreference p = new AiUserPreference();
        p.setUserId(me.getId());
        p.setContent(c);
        p.setSource("USER");
        preferenceMapper.remember(p);
        return Result.success(true);
    }

    /** 自己删一条。 */
    @DeleteMapping("/preferences/mine")
    @Operation(summary = "自己删一条偏好")
    public Result<Boolean> deleteMyPreference(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam String content) {
        User me = currentUser(authorization);
        if (me == null) {
            return Result.error("未登录");
        }
        return Result.success(preferenceMapper.forget(me.getId(), content) > 0);
    }

    // ── 约束预览 ──
    @GetMapping("/prompt-preview")
    @Operation(summary = "约束拼装预览（L0/L1 在库、L2 在代码，单看任一处都看不全最终发给模型的内容）")
    public Result<AiPromptService.PromptPreview> promptPreview(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam(required = false) String contextPage) {
        User auditor = requireAuditor(authorization);
        if (auditor == null) {
            return Result.error("无权限查看");
        }
        StringBuilder ctx = new StringBuilder();
        if (contextPage != null && !contextPage.isBlank()) {
            ctx.append("入口页面：").append(contextPage);
        }
        // 预览走**和真实请求同一条路**（AiPackRouter.routeForTurn）：这个接口存在的理由就是
        // 「单看任一处都看不全最终发给模型的是什么」，不按同一口径取包，预览的就是一个不会发生的请求。
        List<AiToolPack> packs = packRouter.routeForTurn(new ArrayList<>(toolRegistry.packs()), contextPage, "（预览）", "");
        ctx.append(ctx.length() > 0 ? "；" : "")
                .append("本轮下发的工具包：")
                .append(packs.stream().map(AiToolPack::packKey).collect(Collectors.joining("、")));
        // 带上「看的人」自己的 id —— 预览要把**个人偏好**那层也拼出来，
        // 否则管理员看不到「加了偏好之后整段长什么样」，而那正是这个接口存在的理由
        return Result.success(promptService.preview(packs, ctx.toString(), auditor.getId()));
    }

    // ── 公共 ──

    private User currentUser(String authorization) {
        return authContextService.resolveUserFromBearer(authorization);
    }

    /** 审计与预览要求 ADMIN 及以上。 */
    private User requireAuditor(String authorization) {
        User user = currentUser(authorization);
        if (user == null) {
            return null;
        }
        RoleEnum role = user.getRole() == null ? RoleEnum.MEMBER : user.getRole();
        return role.getLevel() >= RoleEnum.ADMIN.getLevel() ? user : null;
    }

    private static String str(Object v) {
        return v == null ? null : String.valueOf(v);
    }
}
