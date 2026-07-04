package com.example.demo.modules.twin.scan.service;

import com.example.demo.common.time.BusinessTimeWindow;
import com.example.demo.modules.llm.entity.LlmConversationMessage;
import com.example.demo.modules.llm.entity.LlmConversationSession;
import com.example.demo.modules.llm.service.DashScopeChatClient;
import com.example.demo.modules.llm.service.LlmConfigService;
import com.example.demo.modules.llm.service.LlmConversationService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.time.format.TextStyle;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class PreGeneratedConversationService {

    private static final Logger log = LoggerFactory.getLogger(PreGeneratedConversationService.class);
    private static final String SESSION_TYPE = "per_user";
    private static final DateTimeFormatter DATETIME_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    /** 同一人弹窗内自动展示对话：10 分钟内合并为一次「已使用」标记 */
    private static final int USAGE_WINDOW_MINUTES = 10;

    private final JdbcTemplate jdbcTemplate;
    private final LlmConversationService llmConversationService;
    private final LlmConfigService llmConfigService;
    private final BusinessTimeWindow businessTimeWindow;
    private final ObjectMapper objectMapper;
    private final DashScopeChatClient dashScopeChatClient;

    public PreGeneratedConversationService(
            JdbcTemplate jdbcTemplate,
            LlmConversationService llmConversationService,
            LlmConfigService llmConfigService,
            BusinessTimeWindow businessTimeWindow,
            ObjectMapper objectMapper,
            DashScopeChatClient dashScopeChatClient) {
        this.jdbcTemplate = jdbcTemplate;
        this.llmConversationService = llmConversationService;
        this.llmConfigService = llmConfigService;
        this.businessTimeWindow = businessTimeWindow;
        this.objectMapper = objectMapper;
        this.dashScopeChatClient = dashScopeChatClient;
    }

    // ============================================================
    // Public API
    // ============================================================

    /**
     * 查找符合条件的用户：aro_personnel 中有校园卡绑定 + 最近 N 天有刷卡记录，
     * 以及已手动注册生成过对话的用户（即使无卡绑定）。N 由 llm.pre_gen.data_window_days 控制。
     * 返回字段对齐前端 ArchiveUser 类型。
     */
    public List<Map<String, Object>> findEligibleUsers() {
        int windowDays = llmConfigService.getPreGenDataWindowDays();
        String windowStart = LocalDate.now(businessTimeWindow.getZoneId())
                .minusDays(windowDays).atStartOfDay().format(DATETIME_FMT);

        String sql = """
                SELECT
                    p.user_id AS userId,
                    p.name AS name,
                    p.department_name AS department,
                    p.project_group_name AS projectGroup,
                    p.total_exp AS totalExp,
                    tcm.card_no AS cardNo,
                    latest.last_scan_time AS lastScanTime
                FROM aro_personnel p
                LEFT JOIN twin_card_mapping tcm
                    ON tcm.aro_user_id = p.user_id AND tcm.card_status = 'NORMAL'
                LEFT JOIN (
                    SELECT user_id, MAX(create_time) AS last_scan_time
                    FROM aro_access_log
                    WHERE create_time >= ?
                    GROUP BY user_id
                ) latest ON latest.user_id = p.user_id
                WHERE p.user_id IS NOT NULL AND p.user_id != ''
                  AND (
                    -- 原有逻辑：有卡绑定 + 近期扫码
                    (tcm.aro_user_id IS NOT NULL AND latest.user_id IS NOT NULL)
                    OR
                    -- 手动注册：已有活跃对话的用户
                    EXISTS (
                        SELECT 1 FROM llm_conversation_session s
                        WHERE JSON_UNQUOTE(JSON_EXTRACT(s.metadata_json, '$.userId')) = p.user_id
                          AND s.session_type IN ('per_user', 'scan_live') AND s.status = 'active'
                    )
                  )
                ORDER BY COALESCE(latest.last_scan_time, '1970-01-01') DESC
                """;

        try {
            return jdbcTemplate.queryForList(sql, windowStart);
        } catch (Exception e) {
            log.warn("[pre-gen] findEligibleUsers failed: {}", e.getMessage());
            return List.of();
        }
    }

    /**
     * 判断单个用户是否符合自动预生成条件：校园卡 NORMAL + 最近 N 天有进出流水。N 由 llm.pre_gen.data_window_days 控制。
     */
    public boolean isUserEligibleForAutoGeneration(String userId) {
        if (!StringUtils.hasText(userId)) return false;
        int windowDays = llmConfigService.getPreGenDataWindowDays();
        String windowStart = LocalDate.now(businessTimeWindow.getZoneId())
                .minusDays(windowDays).atStartOfDay().format(DATETIME_FMT);
        try {
            Integer count = jdbcTemplate.queryForObject(
                    """
                            SELECT COUNT(1) FROM aro_personnel p
                            INNER JOIN twin_card_mapping tcm
                                ON tcm.aro_user_id = p.user_id AND tcm.card_status = 'NORMAL'
                            INNER JOIN aro_access_log al
                                ON al.user_id = p.user_id AND al.create_time >= ?
                            WHERE p.user_id = ?
                            """,
                    Integer.class, windowStart, userId);
            return count != null && count > 0;
        } catch (Exception e) {
            log.debug("[pre-gen] isUserEligible failed userId={}: {}", userId, e.getMessage());
            return false;
        }
    }

    public String resolvePersonnelName(String userId) {
        if (!StringUtils.hasText(userId)) return userId;
        try {
            String name = jdbcTemplate.queryForObject(
                    "SELECT name FROM aro_personnel WHERE user_id = ? LIMIT 1",
                    String.class, userId);
            return StringUtils.hasText(name) ? name.trim() : userId;
        } catch (Exception e) {
            return userId;
        }
    }

    /**
     * 确保用户有可用对话：优先读存档，无存档时现场同步生成持久画像（仅首次，约 3-5s）。
     * 生成成功返回 hasWelcome=true + justGenerated=true，前端直接展示不再流式播报。
     */
    public Map<String, Object> ensureWelcomeReady(String userId, String name) {
        if (!StringUtils.hasText(userId)) {
            return Map.of("hasWelcome", false, "reason", "no_user");
        }
        // 快速路径：已有存档直接返回
        Map<String, Object> welcome = getLatestAssistantWelcome(userId);
        if (welcome != null && Boolean.TRUE.equals(welcome.get("hasWelcome"))) {
            return welcome;
        }
        // 慢路径：无存档 → 现场同步生成持久画像
        if (!StringUtils.hasText(name)) name = resolvePersonnelName(userId);
        try {
            Map<String, Object> entry = generateArchiveEntry(userId, name);
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("hasWelcome", true);
            out.put("justGenerated", true);
            out.put("source", "per_user");
            out.put("sessionId", entry.get("sessionId"));
            // 提取最新 assistant 文本
            Object msgsRaw = entry.get("messages");
            if (msgsRaw instanceof List<?> msgs) {
                for (int i = msgs.size() - 1; i >= 0; i--) {
                    Object item = msgs.get(i);
                    if (item instanceof LlmConversationMessage msg && "assistant".equals(msg.getRole()) && StringUtils.hasText(msg.getContent())) {
                        out.put("text", msg.getContent());
                        out.put("updateTime", msg.getCreateTime() != null ? msg.getCreateTime().toString() : null);
                        break;
                    }
                }
            }
            if (!out.containsKey("text")) out.put("text", "");
            log.warn("[archive] on-site generated for welcome userId={}", userId);
            return out;
        } catch (Exception e) {
            log.warn("[archive] on-site generate failed userId={}: {}", userId, e.getMessage());
            return Map.of("hasWelcome", false, "reason", "generate_failed");
        }
    }

    /** 已停用：进出流水不再触发后台人格预生成 LLM，存档仅由扫码实时写入 */
    public void scheduleEnsureWelcomeAsync(String userId) {
        // no-op
    }

    /**
     * 管理端手动将人员加入存档列表（仅创建 per_user 会话元数据，不调 LLM）。
     * 实际 user/assistant 消息在用户下次刷卡 streamSpeak 后写入。
     */
    public void enrollUserForArchive(String userId, String name) {
        if (!StringUtils.hasText(userId)) throw new IllegalArgumentException("userId required");
        if (!StringUtils.hasText(name)) name = resolvePersonnelName(userId);
        if (findActivePerUserSession(userId) != null) return;

        LlmConversationSession session = llmConversationService.createSession(SESSION_TYPE, name);
        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("userId", userId);
        metadata.put("generatedFor", name);
        metadata.put("enrolledAt", LocalDateTime.now().format(DATETIME_FMT));
        metadata.put("source", "admin_enroll");
        updateSessionMetadata(session.getId(), toJson(metadata), "");
        log.warn("[archive] ENROLLED userId={} sessionId={} (no LLM, awaiting live scan)", userId, session.getId());
    }

    /**
     * @deprecated 人格批量预生成已停用；per_user 存档仅由 scan_live 持久化写入。
     */
    @Deprecated
    public LlmConversationSession generateForUser(String userId, String name) {
        throw new UnsupportedOperationException(
                "人格预生成已停用：存档仅由扫码助手 streamSpeak → persistScanWelcomeToArchive 写入");
    }

    /**
     * 定时批量人格预生成已停用；存档仅随用户刷卡实时追加。
     */
    public Map<String, Object> regenerateAll() {
        log.info("[archive] regenerateAll skipped: batch personality LLM disabled");
        return Map.of(
                "total", 0, "success", 0, "failed", 0, "skipped", 0,
                "errors", List.of(), "disabled", true,
                "message", "存档仅由扫码实时助手写入，不支持批量人格预生成");
    }

    /**
     * 模糊搜索所有人员（无卡绑定/近期扫码限制），用于手动添加对话用户。
     */
    public List<Map<String, Object>> searchAllPersonnel(String keyword, int limit) {
        String like = "%" + (StringUtils.hasText(keyword) ? keyword.trim() : "") + "%";
        String sql = """
                SELECT user_id AS userId, name, department_name AS department,
                       project_group_name AS projectGroup
                FROM aro_personnel
                WHERE user_id IS NOT NULL AND user_id != ''
                  AND (name LIKE ? OR user_id LIKE ? OR department_name LIKE ? OR project_group_name LIKE ?)
                ORDER BY name
                LIMIT ?
                """;
        try {
            return jdbcTemplate.queryForList(sql, like, like, like, like, limit);
        } catch (Exception e) {
            log.warn("[pre-gen] searchAllPersonnel failed: {}", e.getMessage());
            return List.of();
        }
    }

    public Map<String, Object> getUserConversation(String userId) {
        LlmConversationSession session = findActivePerUserSession(userId);
        if (session == null) return null;

        List<LlmConversationMessage> messages = llmConversationService.getMessages(session.getId());
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("sessionId", session.getId());
        r.put("title", session.getTitle());
        r.put("status", session.getStatus());
        r.put("model", session.getModel());
        r.put("tokenCountTotal", session.getTokenCountTotal());
        r.put("createTime", session.getCreateTime() != null ? session.getCreateTime().toString() : null);
        r.put("updateTime", session.getUpdateTime() != null ? session.getUpdateTime().toString() : null);
        r.put("messages", messages != null ? messages : List.of());
        r.put("messageCount", messages != null ? messages.size() : 0);

        // 解析 consumed / 载体使用元数据（供 conversation-archive 管理端展示）
        Map<String, Object> usageMeta = readUsageMetadata(session.getMetadataJson());
        r.putAll(usageMeta);

        return r;
    }

    /** 从 session metadata 提取载体使用状态。consumed 从 lastUsedAt + 10min 窗口推导。 */
    public Map<String, Object> readUsageMetadata(String metadataJson) {
        Map<String, Object> metadata = readMetadataMap(metadataJson);
        Map<String, Object> out = new LinkedHashMap<>();
        // 从 lastUsedAt 推导：10 分钟内 → 使用中（consumed-like）；超过 10 分钟 → 待更新
        Object lastUsedRaw = metadata.get("lastUsedAt");
        boolean inWindow = false;
        if (lastUsedRaw != null) {
            try {
                LocalDateTime lastUsed = LocalDateTime.parse(String.valueOf(lastUsedRaw).trim(), DATETIME_FMT);
                inWindow = lastUsed.plusMinutes(USAGE_WINDOW_MINUTES).isAfter(LocalDateTime.now());
            } catch (Exception ignored) {}
        }
        out.put("consumed", inWindow); // 10min 窗口内视为"使用中"
        out.put("consumedAt", lastUsedRaw);
        out.put("lastUsageSource", metadata.getOrDefault("lastUsageSource", null));
        out.put("usageWindowStartAt", lastUsedRaw);
        out.put("lastUsedAt", lastUsedRaw);
        return out;
    }

    /**
     * 读取该用户存档中最新一条助手对话（只读，不标记 consumed）。
     * per_user 存档由 scan_live persistScanWelcomeToArchive 写入；无存档时可回退 scan_live 会话。
     */
    public Map<String, Object> getLatestAssistantWelcome(String userId) {
        if (!StringUtils.hasText(userId)) return null;

        Map<String, Object> preGen = getUserConversation(userId);
        String preGenText = extractLatestAssistantText(preGen);
        if (StringUtils.hasText(preGenText)) {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("hasWelcome", true);
            out.put("text", preGenText);
            out.put("source", "per_user");
            out.put("sessionId", preGen.get("sessionId"));
            out.put("updateTime", preGen.get("updateTime"));
            return out;
        }

        Map<String, Object> live = getLatestLiveConversation(userId);
        String liveText = extractLatestAssistantText(live);
        if (StringUtils.hasText(liveText)) {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("hasWelcome", true);
            out.put("text", liveText);
            out.put("source", "scan_live");
            out.put("sessionId", live.get("sessionId"));
            out.put("updateTime", live.get("updateTime"));
            return out;
        }

        return Map.of("hasWelcome", false);
    }

    /**
     * scan_live 流式播报完成后，将 user/assistant 追加写入 per_user 存档（唯一写入来源，不调批量人格 LLM）。
     * 每次调用追加新消息，不清空历史记录。
     */
    public void persistScanWelcomeToArchive(String userId, String name, String userContent,
            String assistantText, String model) {
        if (!StringUtils.hasText(userId)) {
            log.warn("[archive] persistScanWelcomeToArchive SKIP: empty userId");
            return;
        }
        if (!StringUtils.hasText(assistantText)) {
            log.warn("[archive] persistScanWelcomeToArchive SKIP userId={}: empty assistantText (LLM returned nothing)", userId);
            return;
        }
        if (!StringUtils.hasText(name)) name = userId;

        try {
            LlmConversationSession session = findActivePerUserSession(userId);
            if (session == null) {
                Map<String, Object> metadata = new LinkedHashMap<>();
                metadata.put("userId", userId);
                metadata.put("generatedFor", name);
                metadata.put("generatedAt", LocalDateTime.now().format(DATETIME_FMT));
                metadata.put("dataFingerprint", computeDataFingerprint(userId));
                metadata.put("source", "live_scan");
                session = llmConversationService.createSession(SESSION_TYPE, name);
                updateSessionMetadata(session.getId(), toJson(metadata), StringUtils.hasText(model) ? model : "live");
                log.warn("[archive] CREATED per_user session from scan_live userId={} sessionId={} model={}",
                        userId, session.getId(), model);
            }

            if (StringUtils.hasText(userContent)) {
                llmConversationService.addMessage(session.getId(), "user", userContent, estimateTokens(userContent));
            }
            llmConversationService.addMessage(session.getId(), "assistant", assistantText, estimateTokens(assistantText));
            jdbcTemplate.update("UPDATE llm_conversation_session SET update_time = NOW() WHERE id = ?", session.getId());

            // 确认写入后的消息数
            int msgCount = 0;
            try {
                List<LlmConversationMessage> msgs = llmConversationService.getMessages(session.getId());
                msgCount = msgs != null ? msgs.size() : 0;
            } catch (Exception ignored) { /* count is best-effort */ }

            log.warn("[archive] APPENDED scan_live userId={} sessionId={} chars={} totalMsgs={}",
                    userId, session.getId(), assistantText.length(), msgCount);
        } catch (Exception e) {
            log.error("[archive] persistScanWelcomeToArchive FAILED userId={}: {}", userId, e.getMessage(), e);
        }
    }

    @SuppressWarnings("unchecked")
    private String extractLatestAssistantText(Map<String, Object> conv) {
        if (conv == null) return null;
        Object raw = conv.get("messages");
        if (!(raw instanceof List<?> list) || list.isEmpty()) return null;
        for (int i = list.size() - 1; i >= 0; i--) {
            Object item = list.get(i);
            if (item instanceof LlmConversationMessage msg
                    && "assistant".equals(msg.getRole())
                    && StringUtils.hasText(msg.getContent())) {
                return msg.getContent();
            }
            if (item instanceof Map<?, ?> map) {
                Object role = map.get("role");
                Object content = map.get("content");
                if ("assistant".equals(role) && content != null && StringUtils.hasText(String.valueOf(content))) {
                    return String.valueOf(content).trim();
                }
            }
        }
        return null;
    }

    /**
     * 标记预生成对话已被智能载体使用。
     *
     * @param source {@code auto} — 同一人 10 分钟内多次展示合并为一次；
     *               {@code click} — 载体点击展开，每次单独计数
     * @return {@code marked=true} 表示本次写入 consumed；不再触发后台人格预生成
     */
    public Map<String, Object> markConversationUsed(String userId, String source) {
        if (!StringUtils.hasText(userId)) {
            return Map.of("marked", false, "shouldRegenerate", false, "reason", "no_user");
        }
        LlmConversationSession session = findActivePerUserSession(userId);
        if (session == null) {
            return Map.of("marked", false, "shouldRegenerate", false, "reason", "no_session");
        }

        String normalized = "click".equalsIgnoreCase(String.valueOf(source).trim()) ? "click" : "auto";
        Map<String, Object> metadata = readMetadataMap(session.getMetadataJson());
        String now = LocalDateTime.now().format(DATETIME_FMT);

        if ("auto".equals(normalized)) {
            if (isWithinUsageWindow(metadata)) {
                log.debug("[pre-gen] mark-used SKIP auto userId={} within {}min window", userId, USAGE_WINDOW_MINUTES);
                return Map.of("marked", false, "shouldRegenerate", false, "reason", "within_window");
            }
            metadata.put("usageWindowStartAt", now);
        } else {
            metadata.put("usageWindowStartAt", now);
            int clickCount = metadata.get("carrierClickCount") instanceof Number n ? n.intValue() : 0;
            metadata.put("carrierClickCount", clickCount + 1);
        }

        // 记录使用时间，不立即设 consumed。10 分钟后由调度器检测 lastUsedAt 过期后触发重新生成。
        metadata.put("userId", userId);
        metadata.put("lastUsedAt", now);
        metadata.put("lastUsageSource", normalized);
        metadata.remove("consumed");
        metadata.remove("consumedAt");
        try {
            jdbcTemplate.update(
                    "UPDATE llm_conversation_session SET metadata_json = ?, update_time = NOW() WHERE id = ?",
                    toJson(metadata), session.getId());
            log.warn("[archive] mark-used (deferred 10min) userId={} source={} sessionId={} lastUsedAt={}",
                    userId, normalized, session.getId(), now);
            return Map.of("marked", true, "shouldRegenerate", false, "source", normalized,
                    "reason", "deferred_10min");
        } catch (Exception e) {
            log.warn("[archive] markConversationUsed failed userId={}: {}", userId, e.getMessage());
            return Map.of("marked", false, "shouldRegenerate", false, "reason", "error");
        }
    }

    private boolean isWithinUsageWindow(Map<String, Object> metadata) {
        Object raw = metadata.get("usageWindowStartAt");
        if (raw == null) return false;
        try {
            LocalDateTime start = LocalDateTime.parse(String.valueOf(raw).trim(), DATETIME_FMT);
            return start.plusMinutes(USAGE_WINDOW_MINUTES).isAfter(LocalDateTime.now());
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * 读取 per_user 存档最新 assistant 文本，作为 scan_live LLM 的「持久画像」上下文。
     * 自动检测源数据变更（行为预测 / 课题组 / 违规 / 经验值等）→ 失效旧对话 → 触发重新生成。
     */
    private String lastRejectReason = null;

    public String getLastRejectReason() { return lastRejectReason; }

    public String loadPreGeneratedGreeting(String userId) {
        if (!StringUtils.hasText(userId)) {
            lastRejectReason = "no_user";
            return null;
        }

        // 检查源数据是否变更（行为预测、课题组、违规、经验值等）
        LlmConversationSession session = findActivePerUserSession(userId);
        if (session != null) {
            String storedFingerprint = getStoredFingerprint(session);
            String currentFingerprint = computeDataFingerprint(userId);
            if (StringUtils.hasText(storedFingerprint) && StringUtils.hasText(currentFingerprint)
                    && !storedFingerprint.equals(currentFingerprint)) {
                // 数据变更 → 标记旧对话 consumed → 返回 null 触发重新生成
                log.warn("[archive] data changed userId={} storedFp={} currentFp={} → invalidating",
                        userId, storedFingerprint, currentFingerprint);
                markConsumed(session.getId(), userId);
                lastRejectReason = "data_changed";
                return null;
            }
        }

        Map<String, Object> welcome = getLatestAssistantWelcome(userId);
        if (welcome != null && Boolean.TRUE.equals(welcome.get("hasWelcome"))) {
            lastRejectReason = null;
            return String.valueOf(welcome.get("text"));
        }
        lastRejectReason = "no_archive";
        return null;
    }

    /** 从 session metadata 读取已存储的 dataFingerprint */
    private String getStoredFingerprint(LlmConversationSession session) {
        Map<String, Object> meta = readMetadataMap(session.getMetadataJson());
        Object fp = meta.get("dataFingerprint");
        return fp != null ? String.valueOf(fp) : "";
    }

    /** 标记会话已被使用/失效（合并 metadata 保留其余字段） */
    private void markConsumed(Long sessionId, String userId) {
        try {
            LlmConversationSession session = findSessionById(sessionId);
            Map<String, Object> metadata = readMetadataMap(session != null ? session.getMetadataJson() : null);
            metadata.put("userId", userId);
            metadata.put("consumed", true);
            metadata.put("consumedAt", LocalDateTime.now().format(DATETIME_FMT));
            jdbcTemplate.update(
                    "UPDATE llm_conversation_session SET metadata_json = ?, update_time = NOW() WHERE id = ?",
                    toJson(metadata), sessionId);
            log.warn("[archive] marked consumed userId={} sessionId={}", userId, sessionId);
        } catch (Exception e) {
            log.warn("[archive] markConsumed failed sessionId={}: {}", sessionId, e.getMessage());
        }
    }

    /** 获取用户最近的实时对话记录（scan_live），完整消息列表 */
    public Map<String, Object> getLatestLiveConversation(String userId) {
        if (!StringUtils.hasText(userId)) return null;
        try {
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                    "SELECT id FROM llm_conversation_session WHERE session_type = 'scan_live' AND status = 'active' AND " + USER_ID_JSON_CONDITION + " ORDER BY create_time DESC LIMIT 1",
                    userId);
            if (rows.isEmpty()) return null;
            Long id = ((Number) rows.get(0).get("id")).longValue();

            LlmConversationSession session = findSessionById(id);
            if (session == null) return null;

            List<LlmConversationMessage> msgs = llmConversationService.getMessages(id);
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("sessionId", session.getId());
            r.put("title", session.getTitle());
            r.put("status", session.getStatus());
            r.put("model", session.getModel());
            r.put("tokenCountTotal", session.getTokenCountTotal());
            r.put("createTime", session.getCreateTime() != null ? session.getCreateTime().toString() : null);
            r.put("updateTime", session.getUpdateTime() != null ? session.getUpdateTime().toString() : null);
            r.put("source", "live");
            r.put("messages", msgs != null ? msgs : List.of());
            r.put("messageCount", msgs != null ? msgs.size() : 0);
            return r;
        } catch (Exception e) {
            log.debug("[archive] getLatestLiveConversation failed userId={}: {}", userId, e.getMessage());
            return null;
        }
    }

    /** 清空对话内容但保留用户在列表中的位置（不归档 session）。仅删除消息 + 重置元数据。 */
    public void clearUserConversations(String userId) {
        if (!StringUtils.hasText(userId)) return;
        LlmConversationSession session = findActivePerUserSession(userId);
        if (session == null) return;

        // 删除该 session 的所有消息
        jdbcTemplate.update("DELETE FROM llm_conversation_message WHERE session_id = ?", session.getId());

        // 重置元数据（保留 userId 和 source，清除 consumed/指纹/时间戳）
        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("userId", userId);
        meta.put("source", "admin_cleared");
        meta.put("clearedAt", LocalDateTime.now().format(DATETIME_FMT));
        jdbcTemplate.update(
                "UPDATE llm_conversation_session SET metadata_json = ?, update_time = NOW(), token_count_total = 0 WHERE id = ?",
                toJson(meta), session.getId());

        log.warn("[archive] CLEARED messages userId={} sessionId={} (session kept active)", userId, session.getId());
    }

    // ============================================================
    // Manual generation (admin-triggered, respects env config)
    // ============================================================

    /**
     * 管理端手动触发单用户对话生成。尊重环境配置（llm.enabled / assistant.enabled / API key）。
     * 构建数据包 → LLM 生成个性化对话 → 追加到 per_user 存档。
     *
     * @return {@code {session, messages, ...}} 对齐前端 ConversationView
     * @throws IllegalStateException LLM 未启用或 API key 缺失
     */
    public Map<String, Object> generateArchiveEntry(String userId, String name) {
        if (!StringUtils.hasText(userId)) throw new IllegalArgumentException("userId required");
        if (!StringUtils.hasText(name)) name = resolvePersonnelName(userId);

        // 尊重环境配置
        if (!llmConfigService.isEnabled()) {
            throw new IllegalStateException("LLM 未启用（llm.enabled=false），无法生成对话");
        }
        if (!llmConfigService.isAssistantEnabled()) {
            throw new IllegalStateException("助手 LLM 未启用（llm.assistant.enabled=false），无法生成对话");
        }
        try { llmConfigService.assertReady(); } catch (Exception e) {
            throw new IllegalStateException("LLM 配置未就绪: " + e.getMessage());
        }
        if (!StringUtils.hasText(llmConfigService.getApiKey())) {
            throw new IllegalStateException("LLM API key 未配置，无法生成对话");
        }

        // 构建数据包
        Map<String, Object> dataPacket = buildArchiveDataPacket(userId, name);
        String systemPrompt = buildArchiveSystemPrompt(name);
        String userPrompt = buildArchiveUserPrompt(name, dataPacket);

        // 调用 LLM
        List<Map<String, String>> llmMessages = new ArrayList<>();
        llmMessages.add(Map.of("role", "system", "content", systemPrompt));
        llmMessages.add(Map.of("role", "user", "content", userPrompt));

        String greeting, model;
        try {
            DashScopeChatClient.ChatResult result = dashScopeChatClient.chatWithFallback(llmMessages);
            greeting = sanitizeLlmOutput(result.content(), name);
            model = result.model();
        } catch (Exception e) {
            log.error("[archive] LLM failed for userId={}: {}", userId, e.getMessage());
            greeting = buildArchiveFallbackGreeting(name, dataPacket);
            model = "fallback";
        }
        if (!StringUtils.hasText(greeting)) greeting = buildArchiveFallbackGreeting(name, dataPacket);

        // 追加到 per_user 存档
        LlmConversationSession session = findActivePerUserSession(userId);
        if (session == null) {
            Map<String, Object> metadata = new LinkedHashMap<>();
            metadata.put("userId", userId);
            metadata.put("generatedFor", name);
            metadata.put("generatedAt", LocalDateTime.now().format(DATETIME_FMT));
            metadata.put("dataFingerprint", computeDataFingerprint(userId));
            metadata.put("source", "admin_manual");
            session = llmConversationService.createSession(SESSION_TYPE, name);
            updateSessionMetadata(session.getId(), toJson(metadata), StringUtils.hasText(model) ? model : "manual");
            log.warn("[archive] CREATED per_user session via admin manual userId={} sessionId={}", userId, session.getId());
        }

        llmConversationService.addMessage(session.getId(), "system", systemPrompt, estimateTokens(systemPrompt));
        llmConversationService.addMessage(session.getId(), "user", userPrompt, estimateTokens(userPrompt));
        llmConversationService.addMessage(session.getId(), "assistant", greeting, estimateTokens(greeting));
        jdbcTemplate.update("UPDATE llm_conversation_session SET update_time = NOW() WHERE id = ?", session.getId());

        // 清除 consumed 标记（新生成的内容属于"未使用"）
        jdbcTemplate.update(
                "UPDATE llm_conversation_session SET metadata_json = JSON_REMOVE(COALESCE(metadata_json, '{}'), '$.consumed', '$.consumedAt', '$.lastUsedAt', '$.lastUsageSource', '$.usageWindowStartAt', '$.carrierClickCount') WHERE id = ?",
                session.getId());

        log.warn("[archive] GENERATED admin manual userId={} sessionId={} model={} chars={}",
                userId, session.getId(), model, greeting.length());

        return getUserConversation(userId);
    }

    /**
     * 判断用户是否需要生成对话（用于选择性批量加载 + 调度器巡检）。
     * 需要生成：无对话 / 无消息 / lastUsedAt 超过 10 分钟（防抖窗口已过）。
     */
    public boolean needsGeneration(String userId) {
        if (!StringUtils.hasText(userId)) return false;
        LlmConversationSession session = findActivePerUserSession(userId);
        if (session == null) return true;
        Map<String, Object> meta = readMetadataMap(session.getMetadataJson());
        // lastUsedAt + 10min < now → 防抖窗口已过，需要重新生成
        Object lastUsedRaw = meta.get("lastUsedAt");
        if (lastUsedRaw != null) {
            try {
                LocalDateTime lastUsed = LocalDateTime.parse(String.valueOf(lastUsedRaw).trim(), DATETIME_FMT);
                if (lastUsed.plusMinutes(USAGE_WINDOW_MINUTES).isBefore(LocalDateTime.now())) {
                    return true;
                }
                // 还在 10 分钟防抖窗口内 → 不需要生成
                return false;
            } catch (Exception ignored) { /* parse failed, fall through */ }
        }
        // 无 lastUsedAt → 检查 consumed（兼容旧数据）
        if (Boolean.TRUE.equals(meta.get("consumed"))) return true;
        // 检查是否有实际消息内容
        List<LlmConversationMessage> msgs = llmConversationService.getMessages(session.getId());
        return msgs == null || msgs.isEmpty();
    }

    // ---- archive generation helpers ----

    /** 构建全量数据包，与 streamSpeak 的 10 维度持久画像对齐 */
    private Map<String, Object> buildArchiveDataPacket(String userId, String name) {
        Map<String, Object> pkt = new LinkedHashMap<>();
        pkt.put("userId", userId);
        pkt.put("name", name);

        // 0. currentContext — 解决时间穿梭，让 LLM 知道「现在几点」
        LocalDateTime now = LocalDateTime.now();
        pkt.put("currentContext", Map.of(
                "now", now.format(DATETIME_FMT),
                "dayOfWeek", now.getDayOfWeek().getDisplayName(TextStyle.FULL, Locale.CHINESE),
                "timeOfDay", resolveTimeOfDay(now.toLocalTime()),
                "hour", now.getHour()));

        int fdWindow = llmConfigService.getPreGenDataWindowDays();
        String dataWindowStart = LocalDate.now(businessTimeWindow.getZoneId()).minusDays(fdWindow).atStartOfDay().format(DATETIME_FMT);

        // 1. personnel (full)
        try {
            Map<String, Object> row = jdbcTemplate.queryForMap(
                    "SELECT user_id, name, department_name, project_group_name, user_type_names, total_exp, is_school, state, allowed_rooms_display_zh, has_official_room_permission, update_time FROM aro_personnel WHERE user_id = ?", userId);
            Map<String, Object> clean = new LinkedHashMap<>();
            row.forEach((k, v) -> { if (v != null && !"".equals(String.valueOf(v).trim())) clean.put(k, v); });
            pkt.put("personnel", clean);
        } catch (Exception e) { pkt.put("personnel", Map.of("name", name)); }

        // 2. card
        try {
            Map<String, Object> card = jdbcTemplate.queryForMap(
                    "SELECT card_no, card_status, dahua_seq FROM twin_card_mapping WHERE aro_user_id = ? AND card_status = 'NORMAL' LIMIT 1", userId);
            pkt.put("card", card);
        } catch (Exception e) { pkt.put("card", Map.of("hasCard", false)); }

        // 3. account (sys_user)
        try {
            Map<String, Object> su = jdbcTemplate.queryForMap(
                    "SELECT id, username, role, status, auth_profile, account_source FROM sys_user WHERE id = ?", userId);
            Map<String, Object> clean = new LinkedHashMap<>();
            su.forEach((k, v) -> { if (v != null && !"".equals(String.valueOf(v).trim())) clean.put(k, v); });
            pkt.put("account", clean);
        } catch (Exception e) { pkt.put("account", Map.of("hasAccount", false)); }

        // 4. recent activity
        try {
            Integer entryCount = jdbcTemplate.queryForObject(
                    "SELECT COUNT(1) FROM aro_access_log WHERE user_id = ? AND accessType = 1 AND create_time >= ?", Integer.class, userId, dataWindowStart);
            Integer totalScans = jdbcTemplate.queryForObject(
                    "SELECT COUNT(1) FROM aro_access_log WHERE user_id = ? AND create_time >= ?", Integer.class, userId, dataWindowStart);
            String lastScan = jdbcTemplate.query(
                    "SELECT MAX(create_time) FROM aro_access_log WHERE user_id = ?", rs -> rs.next() ? rs.getString(1) : null, userId);
            long daysSince = 999;
            if (StringUtils.hasText(lastScan)) {
                try {
                    daysSince = ChronoUnit.DAYS.between(LocalDateTime.parse(lastScan, DATETIME_FMT).toLocalDate(), LocalDate.now());
                } catch (Exception ignored) {}
            }
            Map<String, Object> activity = new LinkedHashMap<>();
            activity.put("daysWindow", fdWindow);
            activity.put("entryCount", entryCount != null ? entryCount : 0);
            activity.put("totalScans", totalScans != null ? totalScans : 0);
            activity.put("lastScanTime", lastScan != null ? lastScan : "");
            activity.put("daysSinceLastVisit", daysSince);
            pkt.put("recentActivity", activity);
        } catch (Exception e) { log.debug("[archive] activity query failed: {}", e.getMessage()); }

        // 4.1 todayActivity
        try {
            String todayStart = LocalDate.now().atStartOfDay().format(DATETIME_FMT);
            List<Map<String, Object>> todayLogs = jdbcTemplate.query(
                    "SELECT accessType, room_name, create_time FROM aro_access_log WHERE user_id = ? AND create_time >= ? ORDER BY create_time",
                    (rs) -> { List<Map<String, Object>> l = new ArrayList<>(); while (rs.next()) l.add(Map.of("type", rs.getInt("accessType"), "room", rs.getString("room_name"), "time", rs.getString("create_time"))); return l; },
                    userId, todayStart);
            pkt.put("todayActivity", todayLogs != null ? todayLogs : List.of());
        } catch (Exception e) { log.debug("[archive] todayActivity failed: {}", e.getMessage()); pkt.put("todayActivity", List.of()); }

        // 5. rpgLevel
        try {
            Map<?, ?> personnel = (Map<?, ?>) pkt.getOrDefault("personnel", Map.of());
            Integer exp = personnel.get("total_exp") instanceof Number n ? n.intValue() : 0;
            pkt.put("rpgLevel", (int) Math.floor(Math.sqrt(Math.max(exp, 0) / 50.0)) + 1);
        } catch (Exception e) { pkt.put("rpgLevel", 1); }

        // 6. groupContext (课题组规模 + 活跃度)
        try {
            Map<?, ?> personnel = (Map<?, ?>) pkt.getOrDefault("personnel", Map.of());
            String group = personnel.get("project_group_name") instanceof String g ? g.split("[,，、;；]")[0].trim() : "";
            if (StringUtils.hasText(group)) {
                Integer groupSize = jdbcTemplate.queryForObject(
                        "SELECT COUNT(1) FROM aro_personnel WHERE project_group_name LIKE ?", Integer.class, "%" + group + "%");
                Integer activeMembers = jdbcTemplate.queryForObject(
                        "SELECT COUNT(DISTINCT al.user_id) FROM aro_access_log al INNER JOIN aro_personnel ap ON ap.user_id = al.user_id WHERE ap.project_group_name LIKE ? AND al.create_time >= ?",
                        Integer.class, "%" + group + "%", dataWindowStart);
                pkt.put("groupContext", Map.of("primaryGroup", group, "groupSize", groupSize != null ? groupSize : 0, "activeMembers30d", activeMembers != null ? activeMembers : 0));
            }
        } catch (Exception e) { log.debug("[archive] groupContext failed: {}", e.getMessage()); }

        // 7. behaviorPredictions
        try {
            List<Map<String, Object>> preds = jdbcTemplate.query(
                    "SELECT DISTINCT room_id, room_name, median_duration_mins, peak_entry_time, overtime_prob, next_room_prob_json, update_time FROM aro_behavior_prediction WHERE user_id = ?",
                    (rs) -> { List<Map<String, Object>> list = new ArrayList<>(); while (rs.next()) { Map<String, Object> p = new LinkedHashMap<>(); p.put("roomId", rs.getString("room_id")); p.put("roomName", rs.getString("room_name")); p.put("medianDurationMins", rs.getInt("median_duration_mins")); p.put("peakEntryTime", rs.getString("peak_entry_time")); p.put("overtimeProb", rs.getDouble("overtime_prob")); p.put("nextRoomProb", rs.getString("next_room_prob_json")); p.put("updateTime", rs.getString("update_time")); list.add(p); } return list; }, userId);
            if (preds != null && !preds.isEmpty()) {
                pkt.put("behaviorPredictions", preds);
                double avgDur = preds.stream().filter(p -> p.get("medianDurationMins") instanceof Number).mapToDouble(p -> ((Number) p.get("medianDurationMins")).doubleValue()).average().orElse(0);
                double maxOvertime = preds.stream().filter(p -> p.get("overtimeProb") instanceof Number).mapToDouble(p -> ((Number) p.get("overtimeProb")).doubleValue()).max().orElse(0);
                pkt.put("predictionSummary", Map.of("hasPredictions", true, "trackedRooms", preds.size(), "avgDurationMins", Math.round(avgDur), "maxOvertimeProb", Math.round(maxOvertime * 100) / 100.0));
            } else { pkt.put("predictionSummary", Map.of("hasPredictions", false)); }
        } catch (Exception e) { log.debug("[archive] predictions failed: {}", e.getMessage()); pkt.put("predictionSummary", Map.of("hasPredictions", false)); }

        // 8. violations
        try {
            List<Map<String, Object>> violations = jdbcTemplate.query(
                    "SELECT violation_text, forbid_enter, status, created_at, expire_at FROM twin_student_violation WHERE target_user_id = ? AND status = 'ACTIVE' ORDER BY id DESC LIMIT 3",
                    (rs) -> { List<Map<String, Object>> list = new ArrayList<>(); while (rs.next()) list.add(Map.of("text", rs.getString("violation_text"), "forbidEnter", rs.getBoolean("forbid_enter"), "status", rs.getString("status"), "createdAt", rs.getString("created_at"), "expireAt", rs.getString("expire_at"))); return list; }, userId);
            if (violations != null && !violations.isEmpty()) {
                pkt.put("activeViolations", violations);
                pkt.put("violationSummary", Map.of("hasActiveViolation", true, "count", violations.size(), "entryLocked", violations.get(0).get("forbidEnter")));
            } else { pkt.put("violationSummary", Map.of("hasActiveViolation", false)); }
        } catch (Exception e) { pkt.put("violationSummary", Map.of("hasActiveViolation", false)); }

        // 9. companions (同房间±5min + 同组活跃)
        try {
            Map<String, Object> lastEntry = jdbcTemplate.query(
                    "SELECT room_id, room_name, create_time FROM aro_access_log WHERE user_id = ? AND accessType = 1 ORDER BY create_time DESC LIMIT 1",
                    rs -> rs.next() ? Map.of("roomId", rs.getString("room_id"), "roomName", rs.getString("room_name"), "entryTime", rs.getString("create_time")) : null, userId);
            List<Map<String, Object>> sameRoom = List.of();
            List<Map<String, Object>> sameGroup = List.of();
            if (lastEntry != null && StringUtils.hasText((String) lastEntry.get("entryTime"))) {
                String et = (String) lastEntry.get("entryTime");
                String rid = (String) lastEntry.get("roomId");
                sameRoom = jdbcTemplate.query(
                        "SELECT al.user_id, ap.name, ap.project_group_name, al.create_time FROM aro_access_log al INNER JOIN aro_personnel ap ON ap.user_id = al.user_id WHERE al.room_id = ? AND al.accessType = 1 AND al.user_id != ? AND al.create_time >= DATE_SUB(?, INTERVAL 5 MINUTE) AND al.create_time <= DATE_ADD(?, INTERVAL 5 MINUTE) ORDER BY al.create_time LIMIT 5",
                        (rs) -> { List<Map<String, Object>> l = new ArrayList<>(); while (rs.next()) l.add(Map.of("userId", rs.getString("user_id"), "name", rs.getString("name"), "entryTime", rs.getString("create_time"))); return l; }, rid, userId, et, et);
            }
            Map<?, ?> personnel = (Map<?, ?>) pkt.getOrDefault("personnel", Map.of());
            String group = personnel.get("project_group_name") instanceof String g ? g.split("[,，、;；]")[0].trim() : "";
            if (StringUtils.hasText(group)) {
                sameGroup = jdbcTemplate.query(
                        "SELECT al.user_id, ap.name, MAX(al.create_time) AS last_seen FROM aro_access_log al INNER JOIN aro_personnel ap ON ap.user_id = al.user_id WHERE ap.project_group_name LIKE ? AND al.user_id != ? AND al.create_time >= ? GROUP BY al.user_id, ap.name ORDER BY last_seen DESC LIMIT 5",
                        (rs) -> { List<Map<String, Object>> l = new ArrayList<>(); while (rs.next()) l.add(Map.of("userId", rs.getString("user_id"), "name", rs.getString("name"), "lastSeen", rs.getString("last_seen"))); return l; }, "%" + group + "%", userId, dataWindowStart);
            }
            pkt.put("companions", Map.of("sameRoomNearby", sameRoom, "sameGroupActive", sameGroup));
        } catch (Exception e) { log.debug("[archive] companions failed: {}", e.getMessage()); pkt.put("companions", Map.of("sameRoomNearby", List.of(), "sameGroupActive", List.of())); }

        return pkt;
    }

    /** 持久画像系统提示词：优先读配置 llm.assistant.prompt.archive，兜底内置默认。{name}/{currentTime}/{dayOfWeek}/{timeOfDay} 占位符自动替换。 */
    private String buildArchiveSystemPrompt(String name) {
        String template = llmConfigService.getAssistantArchivePrompt();
        LocalDateTime now = LocalDateTime.now();
        return template
                .replace("{name}", name)
                .replace("{currentTime}", now.format(DATETIME_FMT))
                .replace("{dayOfWeek}", now.getDayOfWeek().getDisplayName(TextStyle.FULL, Locale.CHINESE))
                .replace("{timeOfDay}", resolveTimeOfDay(now.toLocalTime()));
    }

    private String buildArchiveUserPrompt(String name, Map<String, Object> pkt) {
        return "用户 " + name + " 的全量数据如下。请生成个性化对话。\n\n数据包 JSON：\n" + toJson(pkt);
    }

    private String buildArchiveFallbackGreeting(String name, Map<String, Object> pkt) {
        StringBuilder sb = new StringBuilder(name).append("，欢迎来到实验室。");
        try {
            Map<?, ?> recent = (Map<?, ?>) pkt.get("recentActivity");
            if (recent != null && recent.get("entryCount") instanceof Number n && n.intValue() > 0) {
                sb.append("最近").append(recent.get("daysWindow")).append("天你已访问").append(n.intValue()).append("次。");
            }
            Map<?, ?> personnel = (Map<?, ?>) pkt.get("personnel");
            if (personnel != null && personnel.get("project_group_name") instanceof String g && StringUtils.hasText(g)) {
                String primary = g.split("[,，、;；]")[0].trim();
                sb.append("课题组").append(primary).append("的伙伴们也在努力。");
            }
            sb.append("如需帮助随时呼叫我。");
        } catch (Exception e) { sb.append("如需帮助随时呼叫我。"); }
        return sb.toString();
    }

    /** 清洗 LLM 输出：去元前言、去多轮剧本、去 markdown */
    static String sanitizeLlmOutput(String raw, String userName) {
        if (!StringUtils.hasText(raw)) return raw;
        String text = raw.trim();
        text = text.replaceFirst("^(?:(?:好的|嗯|行)[，,。.!]?\\s*)*(?:以下(?:是)?[：:]?)?\\s*", "");
        Pattern speakerBlock = Pattern.compile("(?:\\*\\*|【)?(?:系统助手|AI助手|助手|Assistant)(?:\\*\\*|】)?[：:]\\s*([^\\n*【]+(?:\\n(?!(?:\\*\\*|【)?[^\\n：:]{1,12}[：:]).+)*)", Pattern.CASE_INSENSITIVE);
        Matcher m = speakerBlock.matcher(text);
        if (m.find()) text = m.group(1).trim();
        text = text.replaceAll("\\*\\*([^*]+)\\*\\*", "$1");
        text = text.replaceAll("【([^】]+)】", "$1");
        if (StringUtils.hasText(userName)) text = text.replaceAll("(?m)^\\s*" + Pattern.quote(userName) + "[：:]\\s*", "");
        text = text.replaceAll("(?m)^\\s*(?:系统助手|AI助手|助手|用户)[：:]\\s*", "");
        text = text.replaceAll("\\n{3,}", "\n\n").trim();
        return text;
    }

    // ============================================================
    // Session helpers
    // ============================================================

    /** JSON_EXTRACT 条件片段：避免 LIKE 拼接的 SQL 注入风险和 JSON 格式差异导致的匹配失败 */
    private static final String USER_ID_JSON_CONDITION =
            " JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.userId')) = ? ";

    private LlmConversationSession findActivePerUserSession(String userId) {
        try {
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                    "SELECT id FROM llm_conversation_session"
                            + " WHERE session_type = ? AND status = 'active' AND " + USER_ID_JSON_CONDITION
                            + " ORDER BY create_time DESC LIMIT 1",
                    SESSION_TYPE, userId);
            if (rows.isEmpty()) return null;
            Long id = ((Number) rows.get(0).get("id")).longValue();
            return findSessionById(id);
        } catch (Exception e) {
            log.warn("[archive] findActivePerUserSession failed userId={}: {}", userId, e.getMessage());
            return null;
        }
    }

    private LlmConversationSession findSessionById(Long id) {
        try {
            return jdbcTemplate.query(
                    "SELECT id, session_type, title, status, context_summary, model,"
                            + " token_count_total, metadata_json, create_time, update_time"
                            + " FROM llm_conversation_session WHERE id = ?",
                    rs -> {
                        if (!rs.next()) return null;
                        LlmConversationSession s = new LlmConversationSession();
                        s.setId(rs.getLong("id"));
                        s.setSessionType(rs.getString("session_type"));
                        s.setTitle(rs.getString("title"));
                        s.setStatus(rs.getString("status"));
                        s.setContextSummary(rs.getString("context_summary"));
                        s.setModel(rs.getString("model"));
                        s.setTokenCountTotal(rs.getObject("token_count_total") instanceof Number n
                                ? n.intValue() : null);
                        s.setMetadataJson(rs.getString("metadata_json"));
                        s.setCreateTime(rs.getTimestamp("create_time") != null
                                ? rs.getTimestamp("create_time").toLocalDateTime() : null);
                        s.setUpdateTime(rs.getTimestamp("update_time") != null
                                ? rs.getTimestamp("update_time").toLocalDateTime() : null);
                        return s;
                    }, id);
        } catch (Exception e) {
            return null;
        }
    }

    private void updateSessionMetadata(Long sessionId, String metadataJson, String model) {
        jdbcTemplate.update(
                "UPDATE llm_conversation_session SET metadata_json = ?, model = ?, update_time = NOW() WHERE id = ?",
                metadataJson, model, sessionId);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> readMetadataMap(String metadataJson) {
        Map<String, Object> out = new LinkedHashMap<>();
        if (!StringUtils.hasText(metadataJson)) return out;
        try {
            Map<?, ?> parsed = objectMapper.readValue(metadataJson, Map.class);
            parsed.forEach((k, v) -> {
                if (k != null) out.put(String.valueOf(k), v);
            });
        } catch (Exception ignored) {}
        return out;
    }

    /** 课题组活跃度指纹缓存：primaryGroup → {fingerprint, expireAt}，12h 过期 */
    private final ConcurrentHashMap<String, String> groupActivityFingerprintCache = new ConcurrentHashMap<>();
    private static final long GROUP_ACTIVITY_CACHE_MS = 12 * 3600_000L; // 12h

    /** 用户源数据指纹（存档 metadata 审计用，检测数据变更时触发重新生成）。不包含经验值。 */
    private String computeDataFingerprint(String userId) {
        StringBuilder fp = new StringBuilder();
        try {
            // 1. personnel update_time（含课题组、部门、身份等）
            String personnelTs = jdbcTemplate.query(
                    "SELECT update_time FROM aro_personnel WHERE user_id = ?",
                    rs -> rs.next() ? rs.getString(1) : "", userId);
            fp.append("p:").append(personnelTs).append("|");

            // 2. card mapping
            String cardInfo = jdbcTemplate.query(
                    "SELECT card_no, card_status FROM twin_card_mapping WHERE aro_user_id = ? LIMIT 1",
                    rs -> rs.next() ? rs.getString("card_no") + rs.getString("card_status") : "noc", userId);
            fp.append("c:").append(cardInfo).append("|");

            // 3. latest access log entry
            int fdWindow = llmConfigService.getPreGenDataWindowDays();
            String latestAccess = jdbcTemplate.query(
                    "SELECT MAX(create_time), COUNT(1) FROM aro_access_log WHERE user_id = ? AND create_time >= DATE_SUB(NOW(), INTERVAL " + fdWindow + " DAY)",
                    rs -> rs.next() ? rs.getString(1) + "x" + rs.getInt(2) : "0", userId);
            fp.append("a:").append(latestAccess).append("|");

            // 4. active violation (latest id + status)
            String violationInfo = jdbcTemplate.query(
                    "SELECT MAX(id), status FROM twin_student_violation WHERE target_user_id = ? AND status = 'ACTIVE'",
                    rs -> rs.next() ? rs.getString(1) + ":" + rs.getString(2) : "nov", userId);
            fp.append("v:").append(violationInfo).append("|");

            // 5. behavior prediction update_time
            String predTs = jdbcTemplate.query(
                    "SELECT MAX(update_time) FROM aro_behavior_prediction WHERE user_id = ?",
                    rs -> rs.next() ? rs.getString(1) : "", userId);
            fp.append("b:").append(predTs).append("|");

            // 6. 课题组活跃度（12h 缓存：组规模 + 活跃人数）
            String groupFp = computeGroupActivityFingerprint(userId);
            if (StringUtils.hasText(groupFp)) {
                fp.append("g:").append(groupFp);
            }

        } catch (Exception e) {
            log.debug("[archive] fingerprint partial fail userId={}: {}", userId, e.getMessage());
        }
        return String.valueOf(fp.toString().hashCode());
    }

    /** 课题组活跃度指纹：组人数 + 30天活跃人数，12h 缓存 */
    private String computeGroupActivityFingerprint(String userId) {
        try {
            // 查用户主课题组
            String primaryGroup = jdbcTemplate.query(
                    "SELECT project_group_name FROM aro_personnel WHERE user_id = ?",
                    rs -> rs.next() ? rs.getString(1) : null, userId);
            if (!StringUtils.hasText(primaryGroup)) return "";
            String group = primaryGroup.split("[,，、;；]")[0].trim();
            if (!StringUtils.hasText(group)) return "";

            // 12h 缓存 key = groupName
            String cacheKey = "grp:" + group;
            String cached = groupActivityFingerprintCache.get(cacheKey);
            if (cached != null) {
                // 格式: "fingerprint|expireTimeMillis"
                int sep = cached.lastIndexOf('|');
                if (sep > 0) {
                    long expireAt = Long.parseLong(cached.substring(sep + 1));
                    if (System.currentTimeMillis() < expireAt) {
                        return cached.substring(0, sep);
                    }
                }
            }

            // 缓存过期或不存在 → 重新查询
            int fdWindow = llmConfigService.getPreGenDataWindowDays();
            String dataWindowStart = LocalDate.now(businessTimeWindow.getZoneId())
                    .minusDays(fdWindow).atStartOfDay().format(DATETIME_FMT);

            Integer groupSize = jdbcTemplate.queryForObject(
                    "SELECT COUNT(1) FROM aro_personnel WHERE project_group_name LIKE ?",
                    Integer.class, "%" + group + "%");
            Integer activeMembers = jdbcTemplate.queryForObject(
                    "SELECT COUNT(DISTINCT al.user_id) FROM aro_access_log al"
                            + " INNER JOIN aro_personnel ap ON ap.user_id = al.user_id"
                            + " WHERE ap.project_group_name LIKE ? AND al.create_time >= ?",
                    Integer.class, "%" + group + "%", dataWindowStart);

            String fp = (groupSize != null ? groupSize : 0) + "m_" + (activeMembers != null ? activeMembers : 0) + "a";
            // 缓存：fingerprint|expireAt
            groupActivityFingerprintCache.put(cacheKey,
                    fp + "|" + (System.currentTimeMillis() + GROUP_ACTIVITY_CACHE_MS));
            return fp;
        } catch (Exception e) {
            log.debug("[archive] group activity fingerprint failed userId={}: {}", userId, e.getMessage());
            return "";
        }
    }

    /** 计算当前所有相关提示词的 hash，用于检测提示词更新 */
    public String computePromptHash() {
        String assistantPrompt = llmConfigService.getAssistantSystemPrompt();
        String welcomePrompt = llmConfigService.getAssistantPromptWelcome();
        String alertPrompt = llmConfigService.getAssistantPromptAlert();
        String infoPrompt = llmConfigService.getAssistantPromptInfo();
        String combined = (assistantPrompt != null ? assistantPrompt : "")
                + "|" + (welcomePrompt != null ? welcomePrompt : "")
                + "|" + (alertPrompt != null ? alertPrompt : "")
                + "|" + (infoPrompt != null ? infoPrompt : "");
        return String.valueOf(combined.hashCode());
    }

    // ============================================================
    // Util
    // ============================================================

    private String toJson(Object obj) {
        try { return objectMapper.writeValueAsString(obj); }
        catch (Exception e) { return String.valueOf(obj); }
    }

    private static int estimateTokens(String text) {
        if (text == null || text.isEmpty()) return 0;
        int ch = 0, other = 0;
        for (char c : text.toCharArray()) {
            Character.UnicodeBlock b = Character.UnicodeBlock.of(c);
            if (b == Character.UnicodeBlock.CJK_UNIFIED_IDEOGRAPHS
                    || b == Character.UnicodeBlock.CJK_UNIFIED_IDEOGRAPHS_EXTENSION_A
                    || b == Character.UnicodeBlock.CJK_SYMBOLS_AND_PUNCTUATION) ch++;
            else if (!Character.isWhitespace(c)) other++;
        }
        return ch + (other / 3);
    }

    private static String stringVal(Object v) {
        return v == null ? "" : String.valueOf(v).trim();
    }

    /** 将当前时间映射为中文时段，供提示词和 LLM 进行时间感知推理 */
    private static String resolveTimeOfDay(LocalTime t) {
        if (t.isBefore(LocalTime.of(6, 0))) return "凌晨";
        if (t.isBefore(LocalTime.of(9, 0))) return "早上";
        if (t.isBefore(LocalTime.of(12, 0))) return "上午";
        if (t.isBefore(LocalTime.of(14, 0))) return "中午";
        if (t.isBefore(LocalTime.of(18, 0))) return "下午";
        if (t.isBefore(LocalTime.of(22, 0))) return "晚上";
        return "深夜";
    }
}
