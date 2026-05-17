package com.example.demo.modules.analytics.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.analytics.service.AnalyticsChatService;
import com.example.demo.modules.auth.entity.User;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.MediaType;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/analytics/chat")
@Tag(name = "统计-AI对话", description = "隔离服统计页多轮综合分析对话")
public class AnalyticsChatController {

    private final AuthContextService authContextService;
    private final AnalyticsChatService chatService;

    public AnalyticsChatController(AuthContextService authContextService, AnalyticsChatService chatService) {
        this.authContextService = authContextService;
        this.chatService = chatService;
    }

    @GetMapping("/sessions")
    @Operation(summary = "会话列表（viewId=0 表示报表下全部配置）")
    public Result<List<Map<String, Object>>> listSessions(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam String reportKey,
            @RequestParam long viewId) {
        try {
            User user = requireStaffUser(authorization);
            return Result.success(chatService.listSessions(user.getId(), reportKey, viewId));
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    @PostMapping("/sessions")
    @Operation(summary = "新建会话（viewId=0 封箱全部配置与清算数据）")
    public Result<Map<String, Object>> createSession(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody Map<String, Object> body) {
        String reportKey = body != null ? (String) body.get("reportKey") : null;
        Object viewIdObj = body != null ? body.get("viewId") : null;
        if (!StringUtils.hasText(reportKey) || viewIdObj == null) {
            return Result.error("reportKey 与 viewId 必填");
        }
        long viewId = ((Number) viewIdObj).longValue();
        String title = body != null ? (String) body.get("title") : null;
        try {
            User user = requireStaffUser(authorization);
            return Result.success(chatService.createSession(user.getId(), reportKey, viewId, title));
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    @GetMapping("/sessions/{id}/messages")
    @Operation(summary = "会话消息历史")
    public Result<List<Map<String, Object>>> listMessages(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable long id) {
        try {
            User user = requireStaffUser(authorization);
            return Result.success(chatService.listMessages(user.getId(), id));
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    @PatchMapping("/sessions/{id}")
    @Operation(summary = "重命名会话")
    public Result<Void> renameSession(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable long id,
            @RequestBody Map<String, String> body) {
        try {
            User user = requireStaffUser(authorization);
            chatService.renameSession(user.getId(), id, body != null ? body.get("title") : null);
            return Result.success(null);
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    @DeleteMapping("/sessions/{id}")
    @Operation(summary = "删除会话")
    public Result<Void> deleteSession(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable long id) {
        try {
            User user = requireStaffUser(authorization);
            chatService.deleteSession(user.getId(), id);
            return Result.success(null);
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    @PostMapping(value = "/sessions/{id}/messages/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @Operation(summary = "发送消息并流式回复（SSE：thinking / delta / done / error）")
    public SseEmitter streamMessage(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable long id,
            @RequestBody Map<String, Object> body) {
        try {
            User user = requireStaffUser(authorization);
            String content = body != null ? (String) body.get("content") : null;
            boolean refreshContext = body != null && Boolean.TRUE.equals(body.get("refreshContext"));
            return chatService.streamReply(user.getId(), id, content, refreshContext);
        } catch (IllegalArgumentException e) {
            SseEmitter err = new SseEmitter(0L);
            err.completeWithError(e);
            return err;
        }
    }

    private User requireStaffUser(String authorization) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null) {
            throw new IllegalArgumentException("未登录");
        }
        RoleEnum role = user.getRole() != null ? user.getRole() : RoleEnum.STUDENT;
        if (role.getLevel() < RoleEnum.STAFF.getLevel()) {
            throw new IllegalArgumentException("需要教职工及以上权限");
        }
        return user;
    }
}
