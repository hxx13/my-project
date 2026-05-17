package com.example.demo.modules.analytics.service;

import com.example.demo.modules.analytics.entity.AnalyticsChatMessage;
import com.example.demo.modules.analytics.entity.AnalyticsChatSession;
import com.example.demo.modules.analytics.entity.AnalyticsUserView;
import com.example.demo.modules.analytics.mapper.AnalyticsChatMessageMapper;
import com.example.demo.modules.analytics.mapper.AnalyticsChatSessionMapper;
import com.example.demo.modules.analytics.mapper.AnalyticsUserViewMapper;
import com.example.demo.modules.llm.service.DashScopeChatClient;
import com.example.demo.modules.llm.service.LlmConfigService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executor;
import java.util.concurrent.atomic.AtomicReference;

@Service
public class AnalyticsChatService {

    private static final Logger log = LoggerFactory.getLogger(AnalyticsChatService.class);
    private static final long SSE_TIMEOUT_MS = 300_000L;
    private static final int SESSION_LIST_LIMIT = 50;
    private static final int MESSAGE_LIMIT = 200;

    private static final String SYSTEM_PROMPT =
            """
            你是实验室隔离服使用统计的分析助手。用户会基于已封箱数据提问：可能含多条统计配置（views[]），每条配置下有各期清算（periods[]），含轮次、环比、课题组/地区房间汇总。
            要求：
            1. 用中文回答，结构清晰，可用小标题与列表。
            2. 必须基于提供的 JSON 推断，不得编造；跨配置对比时写明 viewName。
            3. 回答异常月份、耗量峰值、地区/房间/课题组等问题时，引用 viewName（若适用）、periodLabel 与字段名。
            4. 不要输出 JSON，除非用户明确要求。
            """;

    private final AnalyticsChatSessionMapper sessionMapper;
    private final AnalyticsChatMessageMapper messageMapper;
    private final AnalyticsUserViewMapper viewMapper;
    private final AnalyticsChatContextService contextService;
    private final DashScopeChatClient chatClient;
    private final LlmConfigService llmConfigService;
    private final ObjectMapper objectMapper;
    private final Executor heavyCalcExecutor;

    public AnalyticsChatService(
            AnalyticsChatSessionMapper sessionMapper,
            AnalyticsChatMessageMapper messageMapper,
            AnalyticsUserViewMapper viewMapper,
            AnalyticsChatContextService contextService,
            DashScopeChatClient chatClient,
            LlmConfigService llmConfigService,
            ObjectMapper objectMapper,
            @Qualifier("heavyCalcExecutor") Executor heavyCalcExecutor) {
        this.sessionMapper = sessionMapper;
        this.messageMapper = messageMapper;
        this.viewMapper = viewMapper;
        this.contextService = contextService;
        this.chatClient = chatClient;
        this.llmConfigService = llmConfigService;
        this.objectMapper = objectMapper;
        this.heavyCalcExecutor = heavyCalcExecutor;
    }

    public List<Map<String, Object>> listSessions(String userId, String reportKey, long viewId) {
        return sessionMapper.selectByUserReportView(userId, reportKey, viewId, SESSION_LIST_LIMIT).stream()
                .map(this::toSessionSummary)
                .toList();
    }

    public Map<String, Object> createSession(String userId, String reportKey, long viewId, String title) {
        String contextJson = contextService.buildContextJson(userId, viewId, reportKey);
        String viewName = resolveSessionViewName(userId, viewId, reportKey);
        AnalyticsChatSession row = new AnalyticsChatSession();
        row.setUserId(userId);
        row.setReportKey(reportKey);
        row.setViewId(viewId);
        row.setViewName(viewName);
        row.setTitle(StringUtils.hasText(title) ? title.trim() : "新对话");
        row.setContextJson(contextJson);
        sessionMapper.insert(row);
        return toSessionSummary(row);
    }

    private String resolveSessionViewName(String userId, long viewId, String reportKey) {
        if (contextService.isReportScope(viewId)) {
            int n = viewMapper.selectByUserAndReport(userId, reportKey).size();
            return "全部统计配置（" + n + "）";
        }
        AnalyticsUserView view = viewMapper.selectByIdAndUser(viewId, userId);
        if (view == null) {
            throw new IllegalArgumentException("配置不存在");
        }
        return view.getName();
    }

    public List<Map<String, Object>> listMessages(String userId, long sessionId) {
        requireSession(userId, sessionId);
        return messageMapper.selectBySession(sessionId, MESSAGE_LIMIT).stream()
                .map(this::toMessageDto)
                .toList();
    }

    public void renameSession(String userId, long sessionId, String title) {
        if (!StringUtils.hasText(title)) {
            throw new IllegalArgumentException("标题不能为空");
        }
        if (sessionMapper.updateTitle(sessionId, userId, title.trim()) == 0) {
            throw new IllegalArgumentException("会话不存在");
        }
    }

    public void deleteSession(String userId, long sessionId) {
        if (sessionMapper.deleteByIdAndUser(sessionId, userId) == 0) {
            throw new IllegalArgumentException("会话不存在");
        }
    }

    public SseEmitter streamReply(String userId, long sessionId, String userContent, boolean refreshContext) {
        AnalyticsChatSession session = requireSession(userId, sessionId);
        if (!StringUtils.hasText(userContent)) {
            throw new IllegalArgumentException("消息不能为空");
        }
        llmConfigService.assertReady();

        if (refreshContext) {
            String fresh = contextService.buildContextJson(userId, session.getViewId(), session.getReportKey());
            sessionMapper.updateContext(sessionId, userId, fresh);
            session.setContextJson(fresh);
        }

        AnalyticsChatMessage userMsg = new AnalyticsChatMessage();
        userMsg.setSessionId(sessionId);
        userMsg.setRole("user");
        userMsg.setContent(userContent.trim());
        messageMapper.insert(userMsg);
        sessionMapper.touchUpdated(sessionId);

        if (messageMapper.countBySession(sessionId) == 1) {
            String autoTitle = userContent.trim();
            if (autoTitle.length() > 40) {
                autoTitle = autoTitle.substring(0, 40) + "…";
            }
            sessionMapper.updateTitle(sessionId, userId, autoTitle);
        }

        SseEmitter emitter = new SseEmitter(SSE_TIMEOUT_MS);
        heavyCalcExecutor.execute(() -> runStream(session, userContent.trim(), emitter));
        return emitter;
    }

    private void runStream(AnalyticsChatSession session, String userContent, SseEmitter emitter) {
        StringBuilder thinking = new StringBuilder();
        StringBuilder answer = new StringBuilder();
        AtomicReference<String> modelUsed = new AtomicReference<>();
        try {
            emitThinkingSteps(emitter, thinking, userContent, session);
            List<Map<String, String>> messages = buildLlmMessages(session, userContent);
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
                            modelUsed.set(model);
                        }
                    });

            AnalyticsChatMessage assistant = new AnalyticsChatMessage();
            assistant.setSessionId(session.getId());
            assistant.setRole("assistant");
            assistant.setContent(answer.toString());
            assistant.setThinkingText(thinking.length() > 0 ? thinking.toString() : null);
            assistant.setModel(modelUsed.get());
            messageMapper.insert(assistant);
            sessionMapper.touchUpdated(session.getId());

            Map<String, Object> done = new LinkedHashMap<>();
            done.put("messageId", assistant.getId());
            done.put("model", modelUsed.get());
            sendEvent(emitter, "done", done);
            emitter.complete();
        } catch (Exception e) {
            log.warn("[analytics-chat] stream failed session={}: {}", session.getId(), e.getMessage());
            try {
                sendEvent(emitter, "error", Map.of("message", e.getMessage() != null ? e.getMessage() : "生成失败"));
            } catch (IllegalStateException ignored) {
                // ignore
            }
            emitter.completeWithError(e);
        }
    }

    private void emitThinkingSteps(
            SseEmitter emitter, StringBuilder thinking, String userContent, AnalyticsChatSession session)
            throws InterruptedException {
        boolean allViews = contextService.isReportScope(session.getViewId());
        String[] steps = {
            allViews
                    ? "正在封箱全部统计配置下的多期清算数据…"
                    : "正在加载封箱统计数据（配置：" + session.getViewName() + "）…",
            "解析用户问题：" + abbreviate(userContent, 60),
            allViews
                    ? "横向比对各配置、各期 currentRounds / deltaPct，定位异常与峰值…"
                    : "横向比对各期 currentRounds / deltaPct，定位异常与峰值月份…",
            "汇总 byProjectGroup（课题组）与 byRegion（地区/房间）排名…",
            "组织结论与可操作建议…"
        };
        for (String step : steps) {
            if (thinking.length() > 0) {
                thinking.append("\n");
            }
            thinking.append(step);
            sendEvent(emitter, "thinking", Map.of("text", step, "append", true));
            Thread.sleep(280);
        }
    }

    private List<Map<String, String>> buildLlmMessages(AnalyticsChatSession session, String userContent) {
        List<Map<String, String>> messages = new ArrayList<>();
        messages.add(Map.of("role", "system", "content", SYSTEM_PROMPT));
        messages.add(Map.of(
                "role", "system",
                "content",
                "以下为封箱的统计数据 JSON（仅作分析依据）：\n" + session.getContextJson()));

        List<AnalyticsChatMessage> history =
                messageMapper.selectBySession(session.getId(), MESSAGE_LIMIT);
        int start = Math.max(0, history.size() - 12);
        for (int i = start; i < history.size(); i++) {
            AnalyticsChatMessage m = history.get(i);
            if ("system".equals(m.getRole())) {
                continue;
            }
            if ("assistant".equals(m.getRole()) && !StringUtils.hasText(m.getContent())) {
                continue;
            }
            messages.add(Map.of("role", m.getRole(), "content", m.getContent()));
        }
        return messages;
    }

    private AnalyticsChatSession requireSession(String userId, long sessionId) {
        AnalyticsChatSession session = sessionMapper.selectByIdAndUser(sessionId, userId);
        if (session == null) {
            throw new IllegalArgumentException("会话不存在");
        }
        return session;
    }

    private void sendEvent(SseEmitter emitter, String name, Object data) {
        try {
            emitter.send(SseEmitter.event().name(name).data(data));
        } catch (IOException e) {
            throw new IllegalStateException("SSE 发送失败: " + e.getMessage(), e);
        }
    }

    private Map<String, Object> toSessionSummary(AnalyticsChatSession row) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", row.getId());
        m.put("reportKey", row.getReportKey());
        m.put("viewId", row.getViewId());
        m.put("viewName", row.getViewName());
        m.put("title", row.getTitle());
        m.put("createdAt", row.getCreatedAt());
        m.put("updatedAt", row.getUpdatedAt());
        return m;
    }

    private Map<String, Object> toMessageDto(AnalyticsChatMessage row) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", row.getId());
        m.put("role", row.getRole());
        m.put("content", row.getContent());
        m.put("thinkingText", row.getThinkingText());
        m.put("model", row.getModel());
        m.put("createdAt", row.getCreatedAt());
        return m;
    }

    private static String abbreviate(String s, int max) {
        if (s == null) {
            return "";
        }
        return s.length() <= max ? s : s.substring(0, max) + "…";
    }
}
