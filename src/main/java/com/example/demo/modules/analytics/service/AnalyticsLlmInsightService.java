package com.example.demo.modules.analytics.service;

import com.example.demo.modules.analytics.entity.AnalyticsAuditLog;
import com.example.demo.modules.analytics.entity.AnalyticsLlmInsight;
import com.example.demo.modules.analytics.mapper.AnalyticsAuditLogMapper;
import com.example.demo.modules.analytics.mapper.AnalyticsLlmInsightMapper;
import com.example.demo.modules.llm.LlmInsightModules;
import com.example.demo.modules.llm.service.DashScopeChatClient;
import com.example.demo.modules.llm.service.LlmConfigService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class AnalyticsLlmInsightService {

    private static final Logger log = LoggerFactory.getLogger(AnalyticsLlmInsightService.class);
    private static final Pattern JSON_BLOCK = Pattern.compile("```(?:json)?\\s*([\\s\\S]*?)```", Pattern.CASE_INSENSITIVE);

    private final AnalyticsAuditService auditService;
    private final AnalyticsAuditLogMapper auditLogMapper;
    private final AnalyticsLlmInsightMapper insightMapper;
    private final DashScopeChatClient chatClient;
    private final LlmConfigService llmConfigService;
    private final ObjectMapper objectMapper;

    public AnalyticsLlmInsightService(
            AnalyticsAuditService auditService,
            AnalyticsAuditLogMapper auditLogMapper,
            AnalyticsLlmInsightMapper insightMapper,
            DashScopeChatClient chatClient,
            LlmConfigService llmConfigService,
            ObjectMapper objectMapper) {
        this.auditService = auditService;
        this.auditLogMapper = auditLogMapper;
        this.insightMapper = insightMapper;
        this.chatClient = chatClient;
        this.llmConfigService = llmConfigService;
        this.objectMapper = objectMapper;
    }

    public Map<String, Object> getInsightPrompt(String reportKey) {
        return llmConfigService.getInsightPromptBundle(reportKey);
    }

    public Map<String, Object> getInsight(String userId, long auditLogId) {
        auditService.getDetailForUser(userId, auditLogId);
        AnalyticsLlmInsight row = insightMapper.selectByAuditLogId(auditLogId);
        if (row == null) {
            Map<String, Object> empty = new LinkedHashMap<>();
            empty.put("auditLogId", auditLogId);
            empty.put("exists", false);
            empty.put("autoInsightOnOpen", llmConfigService.isAutoInsightOnOpen());
            return empty;
        }
        return toResponse(row);
    }

    public Map<String, Object> getOrGenerateInsight(String userId, long auditLogId, boolean forceRefresh) {
        if (!forceRefresh) {
            AnalyticsLlmInsight cached = insightMapper.selectByAuditLogId(auditLogId);
            if (cached != null) {
                return toResponse(cached);
            }
            if (!llmConfigService.isAutoInsightOnOpen() || !llmConfigService.isEnabled()) {
                return getInsight(userId, auditLogId);
            }
        }
        return generateInsight(userId, auditLogId, forceRefresh, null);
    }

    public Map<String, Object> generateBatchForView(
            String userId, String reportKey, long viewId, int limit, boolean forceRefresh) {
        List<AnalyticsAuditLog> logs = auditLogMapper.selectByUserAndReport(userId, reportKey, viewId, 1);
        if (logs.isEmpty()) {
            throw new IllegalArgumentException("当前视图暂无清算记录");
        }
        int cap = Math.min(Math.max(limit, 1), 20);
        List<AnalyticsAuditLog> targets = forceRefresh
                ? auditLogMapper.selectByUserAndReport(userId, reportKey, viewId, cap)
                : auditLogMapper.selectRecentWithoutInsight(userId, reportKey, viewId, cap);
        List<Map<String, Object>> results = new ArrayList<>();
        int ok = 0;
        for (AnalyticsAuditLog logRow : targets) {
            try {
                results.add(generateInsight(userId, logRow.getId(), forceRefresh, null));
                ok++;
            } catch (Exception e) {
                Map<String, Object> err = new LinkedHashMap<>();
                err.put("auditLogId", logRow.getId());
                err.put("periodLabel", logRow.getPeriodLabel());
                err.put("exists", false);
                err.put("error", e.getMessage());
                results.add(err);
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("total", targets.size());
        out.put("success", ok);
        out.put("items", results);
        return out;
    }

    public int runAutoInsightBatchGlobal(String reportKey, int limit) {
        if (!llmConfigService.isEnabled()) {
            return 0;
        }
        int cap = Math.min(Math.max(limit, 1), 20);
        List<AnalyticsAuditLog> targets = auditLogMapper.selectRecentWithoutInsightGlobal(reportKey, cap);
        int ok = 0;
        for (AnalyticsAuditLog row : targets) {
            try {
                generateInsight(row.getUserId(), row.getId(), false, null);
                ok++;
            } catch (Exception e) {
                log.warn("[analytics-llm] 日批跳过 auditLogId={}: {}", row.getId(), e.getMessage());
            }
        }
        return ok;
    }

    public Map<String, Object> generateInsight(String userId, long auditLogId, boolean forceRefresh, String userPromptOverride) {
        AnalyticsAuditLog auditRow = auditLogMapper.selectById(auditLogId);
        if (auditRow == null || !userId.equals(auditRow.getUserId())) {
            throw new IllegalArgumentException("记录不存在");
        }
        String reportKey = auditRow.getReportKey() != null ? auditRow.getReportKey() : LlmInsightModules.ISOLATION_USAGE;
        Map<String, Object> detail = auditService.getDetailForUser(userId, auditLogId);
        if (!forceRefresh) {
            AnalyticsLlmInsight cached = insightMapper.selectByAuditLogId(auditLogId);
            if (cached != null) {
                return toResponse(cached);
            }
        }
        llmConfigService.assertReady();
        String payloadJson = buildCompactPayload(detail);
        String userInstruction = StringUtils.hasText(userPromptOverride)
                ? userPromptOverride.trim()
                : llmConfigService.getInsightUserPrompt(reportKey);
        String userContent = userInstruction + "\n\n以下是统计快照 JSON：\n" + payloadJson;
        String systemContent = llmConfigService.getInsightSystemPrompt(reportKey);
        List<Map<String, String>> messages = List.of(
                Map.of("role", "system", "content", systemContent),
                Map.of("role", "user", "content", userContent));

        DashScopeChatClient.ChatResult chat = chatClient.chatWithFallback(messages);
        Map<String, Object> insight = parseInsightJson(chat.content());
        persistInsight(userId, auditLogId, insight, chat);
        Map<String, Object> out = new LinkedHashMap<>(insight);
        out.put("auditLogId", auditLogId);
        out.put("exists", true);
        out.put("model", chat.model() != null ? chat.model() : llmConfigService.getModel());
        out.put("promptTokens", chat.promptTokens());
        out.put("completionTokens", chat.completionTokens());
        out.put("generatedAt", java.time.LocalDateTime.now().toString());
        return out;
    }

    private void persistInsight(String userId, long auditLogId, Map<String, Object> insight, DashScopeChatClient.ChatResult chat) {
        try {
            String json = objectMapper.writeValueAsString(insight);
            AnalyticsLlmInsight existing = insightMapper.selectByAuditLogId(auditLogId);
            AnalyticsLlmInsight row = new AnalyticsLlmInsight();
            row.setAuditLogId(auditLogId);
            row.setUserId(userId);
            row.setModel(chat.model() != null ? chat.model() : llmConfigService.getModel());
            row.setPromptTokens(chat.promptTokens());
            row.setCompletionTokens(chat.completionTokens());
            row.setInsightJson(json);
            if (existing == null) {
                insightMapper.insert(row);
            } else {
                insightMapper.updateByAuditLogId(row);
            }
        } catch (Exception e) {
            log.warn("[analytics-llm] 解读落库失败 auditLogId={}: {}", auditLogId, e.getMessage());
        }
    }

    private Map<String, Object> toResponse(AnalyticsLlmInsight row) {
        try {
            Map<String, Object> insight = objectMapper.readValue(
                    row.getInsightJson(), new TypeReference<Map<String, Object>>() {});
            Map<String, Object> out = new LinkedHashMap<>(insight);
            out.put("auditLogId", row.getAuditLogId());
            out.put("exists", true);
            out.put("model", row.getModel());
            out.put("promptTokens", row.getPromptTokens());
            out.put("completionTokens", row.getCompletionTokens());
            out.put("generatedAt", row.getUpdatedAt() != null ? row.getUpdatedAt().toString() : null);
            return out;
        } catch (Exception e) {
            throw new IllegalStateException("解读缓存损坏: " + e.getMessage());
        }
    }

    private String buildCompactPayload(Map<String, Object> detail) {
        try {
            Map<String, Object> compact = new LinkedHashMap<>();
            compact.put("periodLabel", detail.get("periodLabel"));
            compact.put("periodType", detail.get("periodType"));
            compact.put("viewName", detail.get("viewName"));
            compact.put("currentRounds", detail.get("currentRounds"));
            compact.put("previousRounds", detail.get("previousRounds"));
            compact.put("deltaRounds", detail.get("deltaRounds"));
            compact.put("deltaPct", detail.get("deltaPct"));
            compact.put("summary", detail.get("summary"));
            compact.put("byProjectGroup", topN(detail.get("byProjectGroup"), 15));
            compact.put("byRegion", topN(detail.get("byRegion"), 10));
            return objectMapper.writeValueAsString(compact);
        } catch (Exception e) {
            throw new IllegalStateException("构建分析载荷失败: " + e.getMessage());
        }
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> topN(Object raw, int limit) {
        if (!(raw instanceof List<?> list)) {
            return List.of();
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (Object item : list) {
            if (item instanceof Map<?, ?> m) {
                out.add((Map<String, Object>) m);
            }
            if (out.size() >= limit) break;
        }
        return out;
    }

    private Map<String, Object> parseInsightJson(String raw) {
        if (!StringUtils.hasText(raw)) {
            throw new IllegalStateException("大模型返回为空");
        }
        String trimmed = raw.trim();
        Matcher m = JSON_BLOCK.matcher(trimmed);
        if (m.find()) {
            trimmed = m.group(1).trim();
        }
        try {
            JsonNode node = objectMapper.readTree(trimmed);
            if (node.isObject()) {
                return objectMapper.convertValue(node, new TypeReference<Map<String, Object>>() {});
            }
        } catch (Exception ignored) {
            // fall through
        }
        int start = trimmed.indexOf('{');
        int end = trimmed.lastIndexOf('}');
        if (start >= 0 && end > start) {
            try {
                return objectMapper.readValue(trimmed.substring(start, end + 1), new TypeReference<Map<String, Object>>() {});
            } catch (Exception e) {
                throw new IllegalStateException("无法解析大模型 JSON: " + e.getMessage());
            }
        }
        Map<String, Object> fallback = new LinkedHashMap<>();
        fallback.put("headline", "AI 解读（原始文本）");
        fallback.put("executiveSummary", List.of(trimmed.length() > 500 ? trimmed.substring(0, 500) + "…" : trimmed));
        fallback.put("meetingTalkingPoints", List.of());
        fallback.put("risksOrAnomalies", List.of());
        fallback.put("chartSuggestions", List.of());
        fallback.put("periodComparison", Map.of("narrative", trimmed, "highlights", List.of()));
        fallback.put("topDrivers", List.of());
        fallback.put("regionInsights", List.of());
        return fallback;
    }
}
