package com.example.demo.modules.twin.scan.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.cageshelf.service.CageModeVisibilityService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.twin.scan.dto.ScanAssistantContextPackage;
import com.example.demo.modules.twin.scan.dto.ScanAssistantContextRequest;
import com.example.demo.modules.twin.scan.dto.ScanAssistantSpeakRequest;
import com.example.demo.modules.twin.scan.service.ScanAssistantContextService;
import com.example.demo.modules.twin.scan.service.ScanAssistantLlmService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.MediaType;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.Map;
import java.util.concurrent.Executor;

@RestController
@RequestMapping("/api/v1/twin/scan-assistant")
@Tag(name = "Twin-扫码助手", description = "刷卡智能助手 LLM 播报（多轮对话 + 主动播报）")
public class ScanAssistantController {

    private static final long SSE_TIMEOUT_MS = 120_000L;

    private final AuthContextService authContextService;
    private final ScanAssistantLlmService scanAssistantLlmService;
    private final ScanAssistantContextService scanAssistantContextService;
    private final CageModeVisibilityService modeVisibilityService;
    private final Executor heavyCalcExecutor;

    public ScanAssistantController(
            AuthContextService authContextService,
            ScanAssistantLlmService scanAssistantLlmService,
            ScanAssistantContextService scanAssistantContextService,
            CageModeVisibilityService modeVisibilityService,
            @Qualifier("heavyCalcExecutor") Executor heavyCalcExecutor) {
        this.authContextService = authContextService;
        this.scanAssistantLlmService = scanAssistantLlmService;
        this.scanAssistantContextService = scanAssistantContextService;
        this.modeVisibilityService = modeVisibilityService;
        this.heavyCalcExecutor = heavyCalcExecutor;
    }

    @GetMapping("/context")
    @Operation(summary = "构建扫码助手 AI 上下文数据包（调试/预览）")
    public Result<ScanAssistantContextPackage> getContext(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam(value = "userId", required = false) String userId,
            @RequestParam(value = "name", required = false) String name,
            @RequestParam(value = "kind", required = false, defaultValue = "welcome") String kind) {
        requireOperator(authorization);
        Map<String, Object> snapshot = new java.util.LinkedHashMap<>();
        if (StringUtils.hasText(userId)) {
            snapshot.put("userId", userId.trim());
        }
        if (StringUtils.hasText(name)) {
            snapshot.put("name", name.trim());
        }
        return Result.success(scanAssistantContextService.build(kind, snapshot));
    }

    @PostMapping("/context")
    @Operation(summary = "根据 analyze 快照构建完整 AI 上下文数据包")
    public Result<ScanAssistantContextPackage> postContext(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody ScanAssistantContextRequest body) {
        requireOperator(authorization);
        String kind = body != null ? body.getKind() : null;
        Map<String, Object> context = body != null && body.getContext() != null ? body.getContext() : Map.of();
        return Result.success(scanAssistantContextService.build(kind, context));
    }

    @PostMapping("/conversation/welcome")
    @Operation(summary = "ensure 并读取存档对话：有存档直接返回，无存档返回空")
    public Result<Map<String, Object>> loadArchivedWelcome(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody ScanAssistantSpeakRequest body) {
        requireOperator(authorization);
        Map<String, Object> context = body != null && body.getContext() != null ? body.getContext() : Map.of();
        String userId = context.get("userId") != null ? String.valueOf(context.get("userId")).trim() : "";
        String name = context.get("name") != null ? String.valueOf(context.get("name")).trim() : "";
        return Result.success(scanAssistantLlmService.ensureAndLoadArchivedWelcome(userId, name));
    }

    @PostMapping("/conversation/mark-used")
    @Operation(summary = "标记预生成对话已被智能载体使用（auto 10 分钟合并 / click 每次计数）")
    public Result<Map<String, Object>> markConversationUsed(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody ScanAssistantSpeakRequest body) {
        requireOperator(authorization);
        Map<String, Object> context = body != null && body.getContext() != null ? body.getContext() : Map.of();
        String userId = context.get("userId") != null ? String.valueOf(context.get("userId")).trim() : "";
        String source = body != null && StringUtils.hasText(body.getUsageSource())
                ? body.getUsageSource().trim()
                : "auto";
        if (!StringUtils.hasText(userId)) {
            return Result.error("userId 不能为空");
        }
        Map<String, Object> result = scanAssistantLlmService.markConversationUsed(userId, source);
        return Result.success(result);
    }

    @PostMapping(value = "/speak/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @Operation(summary = "扫码助手流式播报（SSE：delta / done / error），含数据包 + 对话记忆")
    public SseEmitter streamSpeak(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody ScanAssistantSpeakRequest body) {
        try {
            requireOperator(authorization);
            String kind = body != null ? body.getKind() : null;
            Map<String, Object> context = body != null && body.getContext() != null ? body.getContext() : Map.of();
            SseEmitter emitter = new SseEmitter(SSE_TIMEOUT_MS);
            heavyCalcExecutor.execute(() -> scanAssistantLlmService.streamSpeak(kind, context, emitter));
            return emitter;
        } catch (IllegalArgumentException e) {
            SseEmitter err = new SseEmitter(0L);
            err.completeWithError(e);
            return err;
        }
    }

    @PostMapping(value = "/ask/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @Operation(summary = "智能载体提问（SSE：started / delta / done / error），经 AI 对话操作网关执行")
    public SseEmitter askQuestion(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody ScanAssistantSpeakRequest body) {
        try {
            User user = requireOperator(authorization);
            String question = body != null ? body.getQuestion() : null;
            Long sessionId = body != null ? body.getSessionId() : null;
            boolean newSession = body != null && Boolean.TRUE.equals(body.getNewSession());
            java.util.List<String> images = body != null ? body.getImages() : null;
            // 表格附件：控制器只做 DTO → 编排层入参的搬运，解析与落库在编排层（那儿才拿得到会话与消息 id）
            final java.util.List<com.example.demo.modules.ai.service.AiOrchestrator.SpreadsheetPart> sheets =
                    toSpreadsheetParts(body);
            // 载体所在地页面：只喂给 L2 路由（「这个页面上该带哪些包」），权限判定一概不看它
            final String contextPage = body != null ? body.getContextPage() : null;
            SseEmitter emitter = new SseEmitter(SSE_TIMEOUT_MS);
            heavyCalcExecutor.execute(() ->
                    scanAssistantLlmService.askQuestion(user, question, sessionId, newSession, images, sheets,
                            contextPage, emitter));
            return emitter;
        } catch (IllegalArgumentException e) {
            SseEmitter err = new SseEmitter(0L);
            err.completeWithError(e);
            return err;
        }
    }

    @PostMapping(value = "/ask/greet/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @Operation(summary = "智能载体主动问好（打开面板即触发，SSE：started / delta / done / error）")
    public SseEmitter greet(
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        try {
            requireOperator(authorization);
            SseEmitter emitter = new SseEmitter(SSE_TIMEOUT_MS);
            heavyCalcExecutor.execute(() -> scanAssistantLlmService.greet(emitter));
            return emitter;
        } catch (IllegalArgumentException e) {
            SseEmitter err = new SseEmitter(0L);
            err.completeWithError(e);
            return err;
        }
    }

    @PostMapping("/broadcast/proactive")
    @Operation(summary = "触发一次主动播报（定时器/手动调用），返回播报文本或 null")
    public Map<String, Object> proactiveBroadcast(
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        requireOperator(authorization);
        String text = scanAssistantLlmService.proactiveBroadcast();
        return Map.of("text", text != null ? text : "", "hasBroadcast", text != null);
    }

    @PostMapping("/conversation/reset")
    @Operation(summary = "重置对话：归档当前会话，下次刷卡开启新会话")
    public Map<String, Object> resetConversation(
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        requireOperator(authorization);
        scanAssistantLlmService.resetConversation();
        Long newSessionId = scanAssistantLlmService.getActiveSessionId();
        return Map.of("ok", true, "sessionId", newSessionId != null ? newSessionId : 0);
    }

    /** DTO 里的表格附件 → 编排层入参。空/无内容的一律丢掉，别把 null 传下去。 */
    private static java.util.List<com.example.demo.modules.ai.service.AiOrchestrator.SpreadsheetPart>
            toSpreadsheetParts(ScanAssistantSpeakRequest body) {
        if (body == null || body.getSpreadsheets() == null || body.getSpreadsheets().isEmpty()) {
            return null;
        }
        return body.getSpreadsheets().stream()
                .filter(f -> f != null && f.getData() != null && !f.getData().isBlank())
                .map(f -> new com.example.demo.modules.ai.service.AiOrchestrator.SpreadsheetPart(
                        f.getFilename(), f.getData()))
                .toList();
    }

    /**
     * 智能助手整条模块的准入。**视角闸门下在这里而不是只挂在界面** ——
     * 球球只渲染在 AdminLayout，学生看不见入口，但 /api/v1/twin/scan-assistant/** 是公开路径，
     * 学生拿有效 token 直连就能打到 greet / speak / context，每一次都是真实的模型调用（花钱 + 滥用面）。
     * 判据复用笼架域唯一出口 isStudent（account_source）。
     */
    private User requireOperator(String authorization) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null) {
            throw new IllegalArgumentException("未登录");
        }
        if (!StringUtils.hasText(user.getId())) {
            throw new IllegalArgumentException("无效用户");
        }
        if (modeVisibilityService.isStudent(user)) {
            throw new IllegalArgumentException("AI 助手目前只对教职工开放");
        }
        return user;
    }
}
