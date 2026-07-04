package com.example.demo.modules.twin.scan.controller;

import com.example.demo.common.config.AdminAuthInterceptor;
import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.exception.SseClientDisconnectedException;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.twin.scan.service.PreGeneratedConversationService;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.*;
import java.util.concurrent.Executor;

@RestController
@RequestMapping("/api/admin/conversation-archive")
@Tag(name = "用户对话存档")
public class UserConversationArchiveController {

    private static final Logger log = LoggerFactory.getLogger(UserConversationArchiveController.class);
    private static final long SSE_TIMEOUT_MS = 600_000L; // 10 min

    private final PreGeneratedConversationService preGenService;
    private final Executor heavyCalcExecutor;
    private final ObjectMapper objectMapper;

    public UserConversationArchiveController(
            PreGeneratedConversationService preGenService,
            @Qualifier("heavyCalcExecutor") Executor heavyCalcExecutor,
            ObjectMapper objectMapper) {
        this.preGenService = preGenService;
        this.heavyCalcExecutor = heavyCalcExecutor;
        this.objectMapper = objectMapper;
    }

    @GetMapping("/users")
    @Operation(summary = "获取符合条件的用户列表及对话状态")
    public Result<?> listUsers(HttpServletRequest request) {
        Result<?> denied = requireSuperAdmin(request);
        if (denied != null) return denied;

        List<Map<String, Object>> eligibleUsers = preGenService.findEligibleUsers();
        List<Map<String, Object>> enriched = new ArrayList<>();

        for (Map<String, Object> user : eligibleUsers) {
            String userId = stringVal(user.get("userId"));
            Map<String, Object> entry = new LinkedHashMap<>(user);
            try {
                Map<String, Object> conv = preGenService.getUserConversation(userId);
                if (conv == null) conv = preGenService.getLatestLiveConversation(userId);
                if (conv != null) {
                    entry.put("hasConversation", true);
                    entry.put("lastGeneratedAt", conv.get("updateTime") != null ? conv.get("updateTime") : conv.get("createTime"));
                    entry.put("messageCount", conv.get("messageCount"));
                    entry.put("conversationSource", conv.getOrDefault("source", "per_user"));
                    if (conv.get("consumed") != null) {
                        entry.put("consumed", conv.get("consumed"));
                        entry.put("consumedAt", conv.get("consumedAt"));
                        entry.put("lastUsageSource", conv.get("lastUsageSource"));
                    }
                } else {
                    entry.put("hasConversation", false);
                    entry.put("lastGeneratedAt", null);
                    entry.put("messageCount", 0);
                    entry.put("conversationSource", "");
                    entry.put("consumed", false);
                }
            } catch (Exception e) {
                entry.put("hasConversation", false);
                entry.put("lastGeneratedAt", null);
                entry.put("messageCount", 0);
                entry.put("conversationSource", "");
                entry.put("consumed", false);
            }
            enriched.add(entry);
        }

        long withConv = enriched.stream().filter(e -> Boolean.TRUE.equals(e.get("hasConversation"))).count();
        log.warn("[conv-archive] listUsers: total={} withConversation={}", enriched.size(), withConv);
        return Result.success(Map.of("total", enriched.size(), "users", enriched));
    }

    @GetMapping("/personnel/search")
    @Operation(summary = "模糊搜索所有人员（用于手动添加对话用户）")
    public Result<?> searchPersonnel(
            @RequestParam(defaultValue = "") String keyword,
            @RequestParam(defaultValue = "20") int limit,
            HttpServletRequest request) {
        Result<?> denied = requireSuperAdmin(request);
        if (denied != null) return denied;
        if (limit > 50) limit = 50;
        return Result.success(preGenService.searchAllPersonnel(keyword, limit));
    }

    @PostMapping("/users/{userId}/enroll")
    @Operation(summary = "手动将人员加入存档列表（仅注册元数据，不调 LLM；内容随下次刷卡写入）")
    public Result<?> enrollUser(@PathVariable String userId, HttpServletRequest request) {
        Result<?> denied = requireSuperAdmin(request);
        if (denied != null) return denied;
        if (userId == null || userId.isBlank()) return Result.error("userId 不能为空");

        try {
            String name = preGenService.resolvePersonnelName(userId);
            preGenService.enrollUserForArchive(userId, name);
            Map<String, Object> view = buildAdminConversationView(userId);
            if (view == null) {
                return Result.success(Map.of(
                        "userId", userId,
                        "hasConversation", false,
                        "session", null,
                        "messages", List.of(),
                        "message", "已加入列表，待用户刷卡后写入对话"));
            }
            return Result.success(view);
        } catch (Exception e) {
            return Result.error("注册失败: " + e.getMessage());
        }
    }

    @GetMapping("/users/{userId}/conversation")
    @Operation(summary = "获取指定用户的 per_user 预生成存档（含载体使用状态）")
    public Result<?> getConversation(@PathVariable String userId, HttpServletRequest request) {
        Result<?> denied = requireSuperAdmin(request);
        if (denied != null) return denied;

        Map<String, Object> view = buildAdminConversationView(userId);
        if (view == null) {
            Map<String, Object> empty = new LinkedHashMap<>();
            empty.put("userId", userId);
            empty.put("hasConversation", false);
            empty.put("session", null);
            empty.put("messages", List.of());
            return Result.success(empty);
        }
        return Result.success(view);
    }

    @PostMapping("/users/{userId}/generate")
    @Operation(summary = "管理端手动触发单用户对话生成（尊重环境配置 llm.enabled / api key；追加到存档，不清空历史）")
    public Result<?> generateForUser(@PathVariable String userId, HttpServletRequest request) {
        Result<?> denied = requireSuperAdmin(request);
        if (denied != null) return denied;
        if (userId == null || userId.isBlank()) return Result.error("userId 不能为空");

        try {
            String name = preGenService.resolvePersonnelName(userId);
            Map<String, Object> entry = preGenService.generateArchiveEntry(userId, name);
            Map<String, Object> view = buildAdminConversationView(userId);
            if (view == null) return Result.error("生成成功但读取存档失败");
            return Result.success(view);
        } catch (IllegalStateException e) {
            return Result.error(e.getMessage());
        } catch (Exception e) {
            log.error("[conv-archive] generate failed userId={}: {}", userId, e.getMessage());
            return Result.error("生成失败: " + e.getMessage());
        }
    }

    @DeleteMapping("/users/{userId}/conversation")
    @Operation(summary = "清除指定用户的对话")
    public Result<?> clearConversation(@PathVariable String userId, HttpServletRequest request) {
        Result<?> denied = requireSuperAdmin(request);
        if (denied != null) return denied;
        if (userId == null || userId.isBlank()) return Result.error("userId 不能为空");

        try {
            preGenService.clearUserConversations(userId);
            return Result.success(Map.of("userId", userId, "cleared", true));
        } catch (Exception e) {
            return Result.error("清除失败: " + e.getMessage());
        }
    }

    /**
     * SSE 流式批量生成对话。支持两种选择模式：
     * <ul>
     *   <li>{@code ignoreUnused = false}（默认）→ 仅为 consumed 或无对话的用户生成</li>
     *   <li>{@code ignoreUnused = true} → 为所有符合条件的用户生成</li>
     * </ul>
     * POST body 可含 {@code userIds: [...]} 限定用户范围；为空则全量。
     */
    @PostMapping(value = "/generate-batch", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @Operation(summary = "SSE 流式批量生成对话，根据 consumed 状态选择性加载，实时推送每用户进度")
    public SseEmitter generateBatch(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody(required = false) Map<String, Object> body,
            HttpServletRequest request) {
        Result<?> denied = requireSuperAdmin(request);
        if (denied != null) {
            SseEmitter err = new SseEmitter(0L);
            err.completeWithError(new IllegalAccessError("无权限"));
            return err;
        }

        SseEmitter emitter = new SseEmitter(SSE_TIMEOUT_MS);

        heavyCalcExecutor.execute(() -> {
            try {
                @SuppressWarnings("unchecked")
                List<String> specifiedUserIds = (body != null && body.get("userIds") instanceof List<?> list)
                        ? list.stream().filter(java.util.Objects::nonNull).map(Object::toString).toList()
                        : List.of();
                boolean ignoreUnused = body != null && Boolean.TRUE.equals(body.get("ignoreUnused"));

                List<Map<String, Object>> eligible;
                if (!specifiedUserIds.isEmpty()) {
                    eligible = new ArrayList<>();
                    for (String uid : specifiedUserIds) {
                        Map<String, Object> u = new LinkedHashMap<>();
                        u.put("userId", uid);
                        u.put("name", uid);
                        eligible.add(u);
                    }
                } else {
                    eligible = preGenService.findEligibleUsers();
                }

                // 选择性过滤：除非 ignoreUnused=true，否则只要 needsGeneration 的用户
                List<Map<String, Object>> targets = new ArrayList<>();
                int skippedByFilter = 0;
                for (Map<String, Object> user : eligible) {
                    String uid = stringVal(user.get("userId"));
                    if (ignoreUnused || preGenService.needsGeneration(uid)) {
                        targets.add(user);
                    } else {
                        skippedByFilter++;
                    }
                }

                log.warn("[conv-archive] generateBatch start: ignoreUnused={} eligible={} targets={} skipped={}",
                        ignoreUnused, eligible.size(), targets.size(), skippedByFilter);

                int total = targets.size();
                int success = 0;
                int failed = 0;

                for (int i = 0; i < targets.size(); i++) {
                    Map<String, Object> user = targets.get(i);
                    String uid = stringVal(user.get("userId"));
                    String uname = stringVal(user.get("name"));
                    if (!uid.isEmpty()) {
                        try {
                            preGenService.generateArchiveEntry(uid, uname);
                            success++;
                            sendEvent(emitter, "progress", Map.of(
                                    "userId", uid, "name", uname,
                                    "status", "ok", "current", i + 1, "total", total));
                        } catch (Exception e) {
                            failed++;
                            sendEvent(emitter, "progress", Map.of(
                                    "userId", uid, "name", uname,
                                    "status", "fail", "error", e.getMessage(),
                                    "current", i + 1, "total", total));
                        }
                    }
                    // 每处理 5 个用户短暂停顿，避免 LLM API 限流
                    if ((i + 1) % 5 == 0) {
                        try { Thread.sleep(2000); } catch (InterruptedException ignored) {}
                    }
                }

                sendEvent(emitter, "done", Map.of(
                        "total", total, "success", success, "failed", failed,
                        "skippedByFilter", skippedByFilter, "ignoreUnused", ignoreUnused));
                emitter.complete();
            } catch (Exception e) {
                log.error("[conv-archive] generateBatch failed: {}", e.getMessage(), e);
                try { sendEvent(emitter, "error", Map.of("message", e.getMessage())); }
                catch (Exception ignored) {}
                emitter.completeWithError(e);
            }
        });

        return emitter;
    }

    private void sendEvent(SseEmitter emitter, String name, Object data) {
        try {
            emitter.send(SseEmitter.event().name(name).data(objectMapper.writeValueAsString(data)));
        } catch (IOException e) {
            throw new SseClientDisconnectedException("SSE 客户端已断开: " + e.getMessage(), e);
        }
    }

    /**
     * 管理端统一对话视图：与前端 ConversationView 对齐，避免 regenerate/enroll 与 GET 结构不一致。
     */
    private Map<String, Object> buildAdminConversationView(String userId) {
        Map<String, Object> preGen = preGenService.getUserConversation(userId);
        if (preGen == null) {
            return null;
        }

        Map<String, Object> session = new LinkedHashMap<>();
        session.put("id", preGen.get("sessionId"));
        session.put("status", preGen.getOrDefault("status", "active"));
        session.put("model", preGen.getOrDefault("model", ""));
        session.put("tokenCountTotal", preGen.getOrDefault("tokenCountTotal", 0));
        session.put("createTime", preGen.getOrDefault("createTime", ""));
        session.put("updateTime", preGen.getOrDefault("updateTime", ""));
        session.put("consumed", preGen.getOrDefault("consumed", false));
        session.put("consumedAt", preGen.getOrDefault("consumedAt", null));
        session.put("lastUsageSource", preGen.getOrDefault("lastUsageSource", null));
        session.put("usageWindowStartAt", preGen.getOrDefault("usageWindowStartAt", null));

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("userId", userId);
        result.put("hasConversation", true);
        result.put("session", session);
        result.put("messages", preGen.getOrDefault("messages", List.of()));
        result.put("messageCount", preGen.getOrDefault("messageCount", 0));
        result.put("consumed", preGen.getOrDefault("consumed", false));
        result.put("consumedAt", preGen.getOrDefault("consumedAt", null));
        result.put("lastUsageSource", preGen.getOrDefault("lastUsageSource", null));
        result.put("usageWindowStartAt", preGen.getOrDefault("usageWindowStartAt", null));
        return result;
    }

    private Result<?> requireSuperAdmin(HttpServletRequest request) {
        Object attr = request.getAttribute(AdminAuthInterceptor.CURRENT_ADMIN_USER_ATTR);
        if (!(attr instanceof User currentUser)) return Result.error("当前登录信息无效");
        RoleEnum role = currentUser.getRole() == null ? RoleEnum.MEMBER : currentUser.getRole();
        if (role.getLevel() < RoleEnum.SUPER_ADMIN.getLevel()) return Result.error("无权限访问");
        return null;
    }

    private static String stringVal(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }
}
