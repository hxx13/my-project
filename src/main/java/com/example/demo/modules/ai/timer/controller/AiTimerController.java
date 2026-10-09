package com.example.demo.modules.ai.timer.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.ai.timer.entity.AiTimer;
import com.example.demo.modules.ai.timer.service.AiTimerService;
import com.example.demo.modules.auth.entity.User;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 计时器接口层 —— 给「AI 计时器」页面用（不是给模型的；模型走 {@code TimerToolPack}）。
 *
 * <p>身份一律来自 JWT（不变量 I1）。归属判定在 {@link AiTimerService}（本人 ∨ ≥SUPER_ADMIN）。
 * 路径落在 {@code /api/v1/**}，已被 {@code apiAuthInterceptor} 覆盖，**不需要改 WebMvcConfig**。
 */
@RestController
@RequestMapping("/api/v1/ai/timers")
@Tag(name = "AI 计时器", description = "大模型定时执行的计时器：谁开的、何时触发、执行了什么")
public class AiTimerController {

    private static final DateTimeFormatter TS = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final AuthContextService authContextService;
    private final AiTimerService timerService;

    public AiTimerController(AuthContextService authContextService, AiTimerService timerService) {
        this.authContextService = authContextService;
        this.timerService = timerService;
    }

    @GetMapping
    @Operation(summary = "计时器列表（响应带 serverNow，前端据此对表算倒计时）")
    public Result<Map<String, Object>> list(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam(defaultValue = "mine") String scope,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String owner) {
        User user = currentUser(authorization);
        if (user == null) {
            return Result.error("未登录");
        }
        boolean allScope = "all".equalsIgnoreCase(scope);
        List<AiTimer> timers;
        try {
            timers = timerService.list(user, allScope, owner, status);
        } catch (IllegalStateException e) {
            // 越权看全部是明确拒绝，不是静默回落成「只看自己的」
            return Result.error(e.getMessage());
        }
        List<Map<String, Object>> rows = new ArrayList<>();
        for (AiTimer t : timers) {
            rows.add(view(t));
        }
        Map<String, Object> data = new LinkedHashMap<>();
        // 倒计时以这两个值为锚：fire_at 是绝对时刻，serverNow 用来修本地时钟差
        data.put("serverNowMillis", System.currentTimeMillis());
        data.put("serverNow", LocalDateTime.now().format(TS));
        data.put("scope", allScope ? "all" : "mine");
        data.put("openCount", timerService.countOpen(user, allScope));
        data.put("list", rows);
        return Result.success(data);
    }

    @PostMapping("/{id}/cancel")
    @Operation(summary = "停掉一条计时器")
    public Result<?> cancel(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable Long id) {
        User user = currentUser(authorization);
        if (user == null) {
            return Result.error("未登录");
        }
        try {
            int n = timerService.cancel(user, List.of(id), false);
            return n > 0 ? Result.success(true) : Result.error("这条已经不在倒计时了（可能已经执行完或被停过）");
        } catch (IllegalStateException e) {
            return Result.error(e.getMessage());
        }
    }

    @PostMapping("/cancel-all")
    @Operation(summary = "停掉全部在跑的计时器（超管及以上含全部人的）")
    public Result<?> cancelAll(
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        User user = currentUser(authorization);
        if (user == null) {
            return Result.error("未登录");
        }
        return Result.success(timerService.cancel(user, null, true));
    }

    @PostMapping("/{id}/confirm")
    @Operation(summary = "确认执行一个到点等人确认的写类计时器")
    public Result<?> confirm(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable Long id) {
        User user = currentUser(authorization);
        if (user == null) {
            return Result.error("未登录");
        }
        try {
            return Result.success(view(timerService.confirm(user, id)));
        } catch (IllegalStateException e) {
            return Result.error(e.getMessage());
        }
    }

    @PostMapping("/{id}/skip")
    @Operation(summary = "放弃一个到点等人确认的写类计时器")
    public Result<?> skip(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable Long id) {
        User user = currentUser(authorization);
        if (user == null) {
            return Result.error("未登录");
        }
        try {
            return Result.success(view(timerService.skip(user, id)));
        } catch (IllegalStateException e) {
            return Result.error(e.getMessage());
        }
    }

    /**
     * 一行的对外形状。
     *
     * <p>时间给两种：`*Millis`（绝对时刻，倒计时与排序用它）与格式化串（给人看）。
     * 前端**不要**用格式化串算倒计时 —— 那是按服务器时区写的字面量，跨时区就偏。
     */
    private Map<String, Object> view(AiTimer t) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", t.getId());
        m.put("label", t.getLabel());
        m.put("toolName", t.getToolName());
        m.put("argsJson", t.getArgsJson());
        m.put("status", t.getStatus());
        m.put("statusZh", AiTimerService.statusZh(t.getStatus()));
        m.put("ownerUserId", t.getOwnerUserId());
        m.put("ownerName", t.getOwnerNameSnapshot());
        m.put("ownerRole", t.getOwnerRoleSnapshot());
        m.put("fireAt", t.getFireAt() == null ? null : t.getFireAt().format(TS));
        m.put("fireAtMillis", millis(t.getFireAt()));
        m.put("createdAt", t.getCreatedAt() == null ? null : t.getCreatedAt().format(TS));
        m.put("createdAtMillis", millis(t.getCreatedAt()));
        m.put("firedAt", t.getFiredAt() == null ? null : t.getFiredAt().format(TS));
        m.put("cancelledAt", t.getCancelledAt() == null ? null : t.getCancelledAt().format(TS));
        m.put("confirmedBy", t.getConfirmedBy());
        m.put("ok", t.getOk());
        m.put("result", t.getResultText());
        m.put("error", t.getErrorMessage());
        m.put("sessionId", t.getSessionId());
        return m;
    }

    private static Long millis(LocalDateTime t) {
        return t == null ? null : t.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli();
    }

    private User currentUser(String authorization) {
        return authContextService.resolveUserFromBearer(authorization);
    }
}
