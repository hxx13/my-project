package com.example.demo.modules.twin.scan.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
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
    private final Executor heavyCalcExecutor;

    public ScanAssistantController(
            AuthContextService authContextService,
            ScanAssistantLlmService scanAssistantLlmService,
            ScanAssistantContextService scanAssistantContextService,
            @Qualifier("heavyCalcExecutor") Executor heavyCalcExecutor) {
        this.authContextService = authContextService;
        this.scanAssistantLlmService = scanAssistantLlmService;
        this.scanAssistantContextService = scanAssistantContextService;
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

    private User requireOperator(String authorization) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null) {
            throw new IllegalArgumentException("未登录");
        }
        if (!StringUtils.hasText(user.getId())) {
            throw new IllegalArgumentException("无效用户");
        }
        return user;
    }
}
