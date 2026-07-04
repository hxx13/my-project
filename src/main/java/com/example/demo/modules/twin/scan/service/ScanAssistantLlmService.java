package com.example.demo.modules.twin.scan.service;

import com.example.demo.common.exception.SseClientDisconnectedException;
import com.example.demo.modules.llm.entity.LlmConversationMessage;
import com.example.demo.modules.llm.entity.LlmConversationSession;
import com.example.demo.modules.llm.service.DashScopeChatClient;
import com.example.demo.modules.llm.service.LlmConfigService;
import com.example.demo.modules.llm.service.LlmConversationService;
import com.example.demo.modules.twin.scan.dto.ScanAssistantContextPackage;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class ScanAssistantLlmService {

    private static final Logger log = LoggerFactory.getLogger(ScanAssistantLlmService.class);
    private static final String SESSION_TYPE = "scan_live"; // 每人一个实时对话会话，与 per_user（预生成）隔离
    private static final int COMPRESS_THRESHOLD_TOKENS = 4000;
    private static final int RECENT_MESSAGE_LIMIT = 10;

    private final LlmConfigService llmConfigService;
    private final DashScopeChatClient chatClient;
    private final LlmConversationService conversationService;
    private final ScanAssistantContextService contextService;
    private final PreGeneratedConversationService preGenService;
    private final ObjectMapper objectMapper;
    private final java.util.concurrent.Executor heavyCalcExecutor;
    private final JdbcTemplate jdbcTemplate;

    public ScanAssistantLlmService(
            LlmConfigService llmConfigService,
            DashScopeChatClient chatClient,
            LlmConversationService conversationService,
            ScanAssistantContextService contextService,
            PreGeneratedConversationService preGenService,
            ObjectMapper objectMapper,
            @org.springframework.beans.factory.annotation.Qualifier("heavyCalcExecutor") java.util.concurrent.Executor heavyCalcExecutor,
            JdbcTemplate jdbcTemplate) {
        this.llmConfigService = llmConfigService;
        this.chatClient = chatClient;
        this.conversationService = conversationService;
        this.contextService = contextService;
        this.preGenService = preGenService;
        this.objectMapper = objectMapper;
        this.heavyCalcExecutor = heavyCalcExecutor;
        this.jdbcTemplate = jdbcTemplate;
    }

    /** 只读 per_user 存档对话；不调 LLM 批量预生成，无存档则 hasWelcome:false */
    public Map<String, Object> ensureAndLoadArchivedWelcome(String userId, String name) {
        if (!StringUtils.hasText(userId)) {
            return Map.of("hasWelcome", false);
        }
        return preGenService.ensureWelcomeReady(userId, name);
    }

    /** @deprecated 只读路径请用 {@link #ensureAndLoadArchivedWelcome} */
    public Map<String, Object> loadArchivedWelcome(String userId) {
        return ensureAndLoadArchivedWelcome(userId, null);
    }

    /** 智能载体使用标记：auto 10 分钟合并，click 每次计数。标记成功后触发后台重新生成。 */
    public Map<String, Object> markConversationUsed(String userId, String source) {
        Map<String, Object> result = preGenService.markConversationUsed(userId, source);
        // 存档命中路径也触发后台再生（与 streamSpeak 内部的 markArchiveUsageIfPresent 行为一致）
        if (Boolean.TRUE.equals(result.get("marked")) && Boolean.TRUE.equals(result.get("shouldRegenerate"))) {
            scheduleBackgroundRegeneration(userId);
        }
        return result;
    }

    private void markArchiveUsageIfPresent(String userId, String usageSource) {
        if (!StringUtils.hasText(userId)) return;
        try {
            Map<String, Object> result = preGenService.markConversationUsed(userId, usageSource);
            // 标记成功后，若需重新生成 → 异步后台生成新对话（尊重限流：每小时最多3次）
            if (Boolean.TRUE.equals(result.get("marked")) && Boolean.TRUE.equals(result.get("shouldRegenerate"))) {
                scheduleBackgroundRegeneration(userId);
            }
        } catch (Exception ex) {
            log.warn("[scan-assistant] mark-used failed userId={}: {}", userId, ex.getMessage());
        }
    }

    /** 对话被使用后异步后台重新生成，确保下次刷卡有新对话可用。10 分钟防抖由 markConversationUsed 保证。 */
    private void scheduleBackgroundRegeneration(String userId) {
        if (!StringUtils.hasText(userId)) return;
        if (!preGenService.needsGeneration(userId)) {
            log.debug("[scan-assistant] bg regen skipped userId={}: not needed", userId);
            return;
        }
        heavyCalcExecutor.execute(() -> {
            try {
                if (!canUseLlm()) {
                    log.debug("[scan-assistant] bg regen skipped userId={}: LLM disabled", userId);
                    return;
                }
                String name = preGenService.resolvePersonnelName(userId);
                preGenService.generateArchiveEntry(userId, name);
                log.warn("[scan-assistant] bg regen OK userId={}", userId);
            } catch (Exception ex) {
                log.warn("[scan-assistant] bg regen failed userId={}: {}", userId, ex.getMessage());
            }
        });
    }

    public boolean canUseLlm() {
        if (!llmConfigService.isAssistantEnabled()) return false;
        try {
            llmConfigService.assertReady();
            return StringUtils.hasText(llmConfigService.getApiKey());
        } catch (Exception e) { return false; }
    }

    public String ruleBasedFallback(String kind, Map<String, Object> context) {
        String name = stringVal(context.get("name"));
        String state = stringVal(context.get("currentState"));
        boolean enterLocked = Boolean.TRUE.equals(context.get("enterLocked"));
        String violationTitle = stringVal(context.get("violationTitle"));
        return switch (normalizeKind(kind)) {
            case "alert" -> {
                if (StringUtils.hasText(violationTitle)) yield violationTitle;
                if (enterLocked) yield StringUtils.hasText(name) ? name + "，当前暂不可进入" : "当前暂不可进入";
                yield StringUtils.hasText(name) ? name + "，请注意门禁提示" : "请注意门禁提示";
            }
            case "info" -> {
                if ("INSIDE".equalsIgnoreCase(state)) yield StringUtils.hasText(name) ? name + "，您已在场内" : "您已在场内";
                yield StringUtils.hasText(name) ? "已识别 " + name : "识别成功";
            }
            default -> "";
        };
    }

    /**
     * 每人一个持久会话。系统提示词仅首次或提示词变更时发送；
     * 后续刷卡只附加新的实时数据包，LLM 可看到完整历史。
     */
    public void streamSpeak(String kind, Map<String, Object> context, SseEmitter emitter) {
        String normalizedKind = normalizeKind(kind);
        Map<String, Object> compact = compactContext(context);
        String userId = stringVal(context.get("userId"));
        String name = stringVal(context.get("name"));

        boolean llmEnabled = llmConfigService.isEnabled();
        boolean assistantEnabled = llmConfigService.isAssistantEnabled();
        boolean hasApiKey = false;
        try { llmConfigService.assertReady(); hasApiKey = StringUtils.hasText(llmConfigService.getApiKey()); } catch (Exception ignored) {}
        log.warn("[scan-assistant] streamSpeak kind={} userId={} name={} llmEnabled={} assistantEnabled={} hasApiKey={} canUseLlm={}",
                normalizedKind, userId, name, llmEnabled, assistantEnabled, hasApiKey, canUseLlm());

        if (!canUseLlm()) {
            String fallback = ruleBasedFallback(normalizedKind, compact);
            sendFallbackAndComplete(emitter, fallback, "rule");
            if (StringUtils.hasText(userId) && StringUtils.hasText(fallback)) {
                try {
                    ScanAssistantContextPackage dataPacket = contextService.build(normalizedKind, compact);
                    String userContent = contextService.resolveScenarioUserPrompt(normalizedKind, dataPacket);
                    preGenService.persistScanWelcomeToArchive(userId, name, userContent, fallback, "rule");
                    markArchiveUsageIfPresent(userId, "auto");
                } catch (Exception ex) {
                    log.debug("[scan-assistant] archive persist (fallback) failed: {}", ex.getMessage());
                }
            }
            return;
        }

        ScanAssistantContextPackage dataPacket = contextService.build(normalizedKind, compact);

        try { sendEvent(emitter, "started", Map.of("kind", normalizedKind)); }
        catch (SseClientDisconnectedException e) { return; }

        // 加载 per_user 存档最新 assistant，作为 scan_live LLM 持久画像上下文（非批量预生成）
        String preGeneratedGreeting = null;
        if (StringUtils.hasText(userId)) {
            try {
                preGeneratedGreeting = preGenService.loadPreGeneratedGreeting(userId);
                if (preGeneratedGreeting == null)
                    log.warn("[scan-assistant] preGen MISS userId={} reason={}", userId, preGenService.getLastRejectReason());
                else
                    log.info("[scan-assistant] preGen HIT userId={} chars={}", userId, preGeneratedGreeting.length());
            } catch (Exception e) { log.warn("[scan-assistant] preGen load error: {}", e.getMessage()); }
        }

        // 获取该用户的持久会话（每人一个，不复用全局 session）
        LlmConversationSession session = getOrCreateUserSession(userId, name);
        Long sessionId = session.getId();

        // 每次刷卡都是独立交互，必须发送系统提示词 + 最新数据包 + 持久画像，确保 LLM 每次都有完整上下文
        boolean sendSystemPrompts = true;

        // 压缩检查
        if (session.getTokenCountTotal() != null && session.getTokenCountTotal() > COMPRESS_THRESHOLD_TOKENS) {
            try { conversationService.compressSession(sessionId, COMPRESS_THRESHOLD_TOKENS / 2); }
            catch (Exception e) { log.debug("[scan-assistant] compress skipped: {}", e.getMessage()); }
        }

        Map<String, Object> sessionCtx = conversationService.getSessionContext(sessionId, 2000);

        StringBuilder answer = new StringBuilder();
        String userContent = contextService.resolveScenarioUserPrompt(normalizedKind, dataPacket);
        try {
            List<Map<String, String>> messages = buildMessages(normalizedKind, dataPacket, sessionCtx,
                    preGeneratedGreeting, sendSystemPrompts);

            log.warn("[scan-assistant] → LLM sessionId={} sendSys=true preGenChars={} historyMsgs={} totalMsgs={}",
                    sessionId,
                    preGeneratedGreeting != null ? preGeneratedGreeting.length() : 0,
                    ((List<?>) sessionCtx.getOrDefault("messages", List.of())).size(),
                    messages.size());

            conversationService.addMessage(sessionId, "user", userContent, estimateTokens(userContent));

            // 更新 promptHash 到会话 metadata
            if (sendSystemPrompts) {
                updateSessionPromptHash(sessionId, preGenService.computePromptHash());
            }

            chatClient.streamChatWithFallback(
                    messages,
                    new DashScopeChatClient.StreamConsumer() {
                        @Override
                        public void onDelta(String text) {
                            answer.append(text);
                            sendEvent(emitter, "delta", Map.of("text", text));
                        }
                        @Override
                        public void onComplete(String model) {
                            String finalText = answer.toString().trim();
                            if (!StringUtils.hasText(finalText)) {
                                finalText = ruleBasedFallback(normalizedKind, compact);
                                if (StringUtils.hasText(finalText)) {
                                    sendEvent(emitter, "delta", Map.of("text", finalText, "fallback", true));
                                }
                            }
                            try { conversationService.addMessage(sessionId, "assistant", finalText, estimateTokens(finalText)); }
                            catch (Exception e) { log.debug("[scan-assistant] save msg failed: {}", e.getMessage()); }

                            // 流式完成后写入 per_user 存档，供 conversation-archive 管理页展示
                            if (StringUtils.hasText(userId)) {
                                try {
                                    preGenService.persistScanWelcomeToArchive(userId, name, userContent, finalText, model);
                                } catch (Exception ex) {
                                    log.debug("[scan-assistant] archive persist failed: {}", ex.getMessage());
                                }
                                markArchiveUsageIfPresent(userId, "auto");
                            }

                            sendEvent(emitter, "done", Map.of("model", model != null ? model : "", "text", finalText, "sessionId", sessionId));
                            emitter.complete();
                        }
                    },
                    llmConfigService.getAssistantMaxTokens(),
                    llmConfigService.getAssistantTemperature());
        } catch (SseClientDisconnectedException e) {
            log.debug("[scan-assistant] SSE disconnected kind={}", normalizedKind);
        } catch (Exception e) {
            if (SseClientDisconnectedException.isClientDisconnect(e)) return;
            log.warn("[scan-assistant] LLM failed kind={}: {}", normalizedKind, e.getMessage());
            String fallback = ruleBasedFallback(normalizedKind, compact);
            sendFallbackAndComplete(emitter, fallback, "rule");
            if (StringUtils.hasText(userId) && StringUtils.hasText(fallback)) {
                try {
                    preGenService.persistScanWelcomeToArchive(userId, name, userContent, fallback, "rule");
                    markArchiveUsageIfPresent(userId, "auto");
                } catch (Exception ex) {
                    log.debug("[scan-assistant] archive persist (error fallback) failed: {}", ex.getMessage());
                }
            }
        }
    }

    // ---- per-user session management ----

    private LlmConversationSession getOrCreateUserSession(String userId, String name) {
        if (!StringUtils.hasText(userId)) {
            return conversationService.getActiveSession("scan_assistant"); // fallback
        }
        // 查找该用户最近的活跃 scan_live session（使用 JSON_EXTRACT 替代 LIKE，避免 JSON 格式差异导致匹配失败）
        try {
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                    "SELECT id FROM llm_conversation_session WHERE session_type = ? AND status = 'active'"
                            + " AND JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.userId')) = ?"
                            + " ORDER BY create_time DESC LIMIT 1",
                    SESSION_TYPE, userId);
            if (!rows.isEmpty()) {
                Long id = ((Number) rows.get(0).get("id")).longValue();
                try { return findSessionById(id); } catch (Exception ignored) {}
            }
        } catch (Exception e) { log.warn("[scan-assistant] session lookup failed userId={}: {}", userId, e.getMessage()); }

        // 创建新会话 — 使用 Jackson 序列化 metadata JSON（与 PreGeneratedConversationService 一致）
        String title = StringUtils.hasText(name) ? name : userId;
        LlmConversationSession s = conversationService.createSession(SESSION_TYPE, title);
        try {
            Map<String, String> meta = new LinkedHashMap<>();
            meta.put("userId", userId);
            meta.put("source", "live");
            meta.put("promptHash", "");
            jdbcTemplate.update("UPDATE llm_conversation_session SET metadata_json = ? WHERE id = ?",
                    objectMapper.writeValueAsString(meta), s.getId());
        } catch (Exception e) {
            // fallback: minimal valid JSON（Jackson 序列化失败时兜底）
            jdbcTemplate.update("UPDATE llm_conversation_session SET metadata_json = ? WHERE id = ?",
                    "{\"userId\":\"" + userId.replace("\"", "\\\"") + "\",\"source\":\"live\",\"promptHash\":\"\"}", s.getId());
        }
        log.warn("[scan-assistant] NEW user session userId={} sessionId={}", userId, s.getId());
        return s;
    }

    private LlmConversationSession findSessionById(Long id) {
        return jdbcTemplate.query(
                "SELECT id, session_type, title, status, context_summary, model, token_count_total, metadata_json, create_time, update_time FROM llm_conversation_session WHERE id = ?",
                rs -> {
                    if (!rs.next()) return null;
                    LlmConversationSession s = new LlmConversationSession();
                    s.setId(rs.getLong("id"));
                    s.setSessionType(rs.getString("session_type"));
                    s.setTitle(rs.getString("title"));
                    s.setStatus(rs.getString("status"));
                    s.setContextSummary(rs.getString("context_summary"));
                    s.setModel(rs.getString("model"));
                    s.setTokenCountTotal(rs.getObject("token_count_total") instanceof Number n ? n.intValue() : null);
                    s.setMetadataJson(rs.getString("metadata_json"));
                    return s;
                }, id);
    }

    private String getStoredPromptHash(LlmConversationSession s) {
        String meta = s.getMetadataJson();
        if (meta != null && meta.contains("promptHash")) {
            try {
                Map<?, ?> m = objectMapper.readValue(meta, Map.class);
                Object h = m.get("promptHash");
                return h != null ? h.toString() : "";
            } catch (Exception ignored) {}
        }
        return "";
    }

    private void updateSessionPromptHash(Long sessionId, String hash) {
        jdbcTemplate.update(
                "UPDATE llm_conversation_session SET metadata_json = JSON_SET(COALESCE(metadata_json, '{}'), '$.promptHash', ?) WHERE id = ?",
                hash, sessionId);
    }

    // ---- message building ----

    /**
     * @param sendSystemPrompts 仅首次对话或提示词变更时为 true；否则省略 system prompt，只发数据包+历史
     */
    private List<Map<String, String>> buildMessages(
            String kind, ScanAssistantContextPackage dataPacket, Map<String, Object> sessionCtx,
            String preGeneratedGreeting, boolean sendSystemPrompts) {
        List<Map<String, String>> messages = new ArrayList<>();

        if (sendSystemPrompts) {
            // 基础行为规范
            messages.add(Map.of("role", "system", "content", llmConfigService.getAssistantSystemPrompt()));
            // 持久画像
            if (StringUtils.hasText(preGeneratedGreeting)) {
                String personName = dataPacket.getPerson() != null
                        ? String.valueOf(dataPacket.getPerson().getName() != null ? dataPacket.getPerson().getName() : "").trim()
                        : "";
                messages.add(Map.of("role", "system",
                        "content", "【持久画像 — 播报主体】\n" + preGeneratedGreeting
                                + "\n\n以上是 " + (StringUtils.hasText(personName) ? personName : "该用户") + " 的持久人物侧写。请在 welcome 播报中以这份画像为主体展开，"
                                + "用户消息中的实时快照数据仅作点缀（如时段、排名），不要喧宾夺主。"));
            }
        }

        // 压缩摘要
        String summary = (String) sessionCtx.getOrDefault("summary", null);
        if (StringUtils.hasText(summary)) {
            messages.add(Map.of("role", "system", "content", "【历史摘要】" + summary));
        }

        // 近期历史消息
        @SuppressWarnings("unchecked")
        List<LlmConversationMessage> recent = (List<LlmConversationMessage>) sessionCtx.getOrDefault("messages", List.of());
        int limit = Math.min(recent.size(), RECENT_MESSAGE_LIMIT);
        for (int i = recent.size() - limit; i < recent.size(); i++) {
            LlmConversationMessage msg = recent.get(i);
            messages.add(Map.of("role", "assistant".equals(msg.getRole()) ? "assistant" : "user",
                    "content", msg.getContent()));
        }

        // 当前实时数据包
        String userContent = contextService.resolveScenarioUserPrompt(kind, dataPacket);
        messages.add(Map.of("role", "user", "content", userContent));

        return messages;
    }

    // ---- helpers (unchanged) ----

    public String proactiveBroadcast() {
        if (!canUseLlm()) return null;
        Map<String, Object> packet = contextService.toPromptMap(contextService.buildProactive());
        if (packet.isEmpty() || (packet.size() <= 2 && !packet.containsKey("facility"))) return null;
        try {
            LlmConversationSession session = conversationService.getActiveSession("scan_assistant");
            List<Map<String, String>> messages = new ArrayList<>();
            messages.add(Map.of("role", "system", "content", "你是实验室智能助手。根据数据生成一句简短主动播报（20-40字）。只输出正文。"));
            messages.add(Map.of("role", "user", "content", "当前数据：\n" + toJson(packet) + "\n请生成一句主动播报。"));
            conversationService.addMessage(session.getId(), "user", "主动播报: " + toJson(packet), estimateTokens(toJson(packet)));
            DashScopeChatClient.ChatResult result = chatClient.chatWithFallback(messages);
            String text = result.content().trim();
            if (StringUtils.hasText(text)) {
                conversationService.addMessage(session.getId(), "assistant", text, estimateTokens(text));
                return text;
            }
            return null;
        } catch (Exception e) { log.warn("[scan-assistant] proactive failed: {}", e.getMessage()); return null; }
    }

    public Long getActiveSessionId() {
        try { return conversationService.getActiveSession("scan_assistant").getId(); }
        catch (Exception e) { return null; }
    }

    public void resetConversation() {
        try {
            LlmConversationSession s = conversationService.getActiveSession("scan_assistant");
            conversationService.archiveSession(s.getId());
            conversationService.createSession("scan_assistant", "");
        } catch (Exception e) { log.warn("[scan-assistant] reset failed: {}", e.getMessage()); }
    }

    @SuppressWarnings("unchecked")
    public Map<String, Object> compactContext(Map<String, Object> raw) {
        Map<String, Object> out = new LinkedHashMap<>();
        if (raw == null) return out;
        putIfText(out, "name", raw.get("name"));
        putIfText(out, "userId", raw.get("userId"));
        putIfText(out, "group", raw.get("group"));
        putIfText(out, "currentState", raw.get("currentState"));
        putIfText(out, "primaryRoom", raw.get("primaryRoom"));
        putIfText(out, "roomNames", raw.get("roomNames"));
        putIfText(out, "violationTitle", raw.get("violationTitle"));
        putIfText(out, "unboundNotice", raw.get("unboundNotice"));
        if (raw.get("enterLocked") != null) out.put("enterLocked", raw.get("enterLocked"));
        if (raw.get("globalUserState") != null) out.put("globalUserState", raw.get("globalUserState"));
        if (raw.get("hasPhysicalCardMapping") != null) out.put("hasPhysicalCardMapping", raw.get("hasPhysicalCardMapping"));
        if (raw.get("scanPopupEntryAllowedNow") != null) out.put("scanPopupEntryAllowedNow", raw.get("scanPopupEntryAllowedNow"));
        return out;
    }

    private void sendFallbackAndComplete(SseEmitter emitter, String text, String model) {
        try {
            if (StringUtils.hasText(text)) {
                sendEvent(emitter, "delta", Map.of("text", text, "fallback", true));
            }
            sendEvent(emitter, "done", Map.of("model", model, "text", text != null ? text : ""));
            emitter.complete();
        } catch (SseClientDisconnectedException e) { /* client gone */ }
        catch (Exception e) { emitter.completeWithError(e); }
    }

    private void sendEvent(SseEmitter emitter, String name, Object data) {
        try { emitter.send(SseEmitter.event().name(name).data(data)); }
        catch (IOException e) { throw new SseClientDisconnectedException("SSE 客户端已断开: " + e.getMessage(), e); }
    }

    private static void putIfText(Map<String, Object> t, String key, Object value) {
        String s = stringVal(value); if (StringUtils.hasText(s)) t.put(key, s);
    }

    private static String stringVal(Object value) { return value == null ? "" : String.valueOf(value).trim(); }

    private static String normalizeKind(String kind) {
        if (!StringUtils.hasText(kind)) return "welcome";
        return switch (kind.trim().toLowerCase()) { case "alert", "info" -> kind.trim().toLowerCase(); default -> "welcome"; };
    }

    private String toJson(Object obj) { try { return objectMapper.writeValueAsString(obj); } catch (Exception e) { return String.valueOf(obj); } }

    private int estimateTokens(String text) {
        if (!StringUtils.hasText(text)) return 0;
        return Math.max(1, (int) (text.length() * 0.5));
    }
}
