package com.example.demo.modules.ai.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.ai.core.SseEventSink;
import com.example.demo.modules.ai.entity.AiMessage;
import com.example.demo.modules.ai.entity.AiSession;
import com.example.demo.modules.ai.service.AiAuditService;
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

    public AiGatewayController(AuthContextService authContextService,
                               AiSessionService sessionService,
                               AiOrchestrator orchestrator,
                               AiAuditService auditService,
                               AiPromptService promptService,
                               ToolRegistry toolRegistry,
                               @Qualifier("aiTaskExecutor") Executor aiTaskExecutor,
                               AiPackRouter packRouter) {
        this.authContextService = authContextService;
        this.sessionService = sessionService;
        this.orchestrator = orchestrator;
        this.auditService = auditService;
        this.promptService = promptService;
        this.toolRegistry = toolRegistry;
        this.aiTaskExecutor = aiTaskExecutor;
        this.packRouter = packRouter;
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
    @Operation(summary = "会话历史（全量，前端展示用）")
    public Result<List<AiMessage>> history(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable Long id) {
        User user = currentUser(authorization);
        if (user == null) {
            return Result.error("未登录");
        }
        try {
            sessionService.requireOwned(id, user.getId());
        } catch (IllegalStateException e) {
            return Result.error(e.getMessage());
        }
        return Result.success(sessionService.history(id));
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

    // ── 约束预览 ──

    @GetMapping("/prompt-preview")
    @Operation(summary = "约束拼装预览（L0/L1 在库、L2 在代码，单看任一处都看不全最终发给模型的内容）")
    public Result<AiPromptService.PromptPreview> promptPreview(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam(required = false) String contextPage) {
        if (requireAuditor(authorization) == null) {
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
        return Result.success(promptService.preview(packs, ctx.toString()));
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
