package com.example.demo.modules.llm.service;

import com.example.demo.modules.llm.entity.LlmConversationMessage;
import com.example.demo.modules.llm.entity.LlmConversationSession;
import com.example.demo.modules.llm.mapper.LlmConversationMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class LlmConversationService {

    private static final Logger log = LoggerFactory.getLogger(LlmConversationService.class);
    private static final int DEFAULT_CONTEXT_MESSAGE_LIMIT = 20;

    private final LlmConversationMapper mapper;

    public LlmConversationService(LlmConversationMapper mapper) {
        this.mapper = mapper;
    }

    /**
     * Create a new conversation session.
     */
    public LlmConversationSession createSession(String sessionType, String title) {
        LlmConversationSession session = new LlmConversationSession();
        session.setSessionType(sessionType);
        session.setTitle(StringUtils.hasText(title) ? title.trim() : "");
        session.setStatus("active");
        session.setTokenCountTotal(0);
        mapper.insertSession(session);
        log.debug("[llm-conv] created session id={} type={}", session.getId(), sessionType);
        return session;
    }

    /**
     * Add a message to a session and update the session token count.
     */
    public LlmConversationMessage addMessage(Long sessionId, String role, String content, int tokenCount) {
        LlmConversationSession session = requireSession(sessionId);
        LlmConversationMessage message = new LlmConversationMessage();
        message.setSessionId(sessionId);
        message.setRole(role);
        message.setContent(content);
        message.setTokenCount(tokenCount);
        message.setIsCompressed(0);
        mapper.insertMessage(message);

        int newTotal = session.getTokenCountTotal() + tokenCount;
        mapper.updateSessionTokenCount(sessionId, newTotal);

        return message;
    }

    /**
     * Get the most recent active session of the given type,
     * or create a new one if none exists.
     */
    public LlmConversationSession getActiveSession(String sessionType) {
        List<LlmConversationSession> sessions = mapper.findActiveSessionByType(sessionType);
        if (sessions != null && !sessions.isEmpty()) {
            return sessions.get(0);
        }
        return createSession(sessionType, "");
    }

    /**
     * Get all messages for a session, ordered by creation time.
     */
    public List<LlmConversationMessage> getMessages(Long sessionId) {
        requireSession(sessionId);
        return mapper.findMessagesBySessionId(sessionId);
    }

    /**
     * Archive a session.
     */
    public void archiveSession(Long sessionId) {
        requireSession(sessionId);
        mapper.updateSessionStatus(sessionId, "archived");
        log.debug("[llm-conv] archived session id={}", sessionId);
    }

    /**
     * Compress old messages into a context summary.
     * <p>
     * Current simple implementation: takes the oldest non-compressed messages up to
     * maxTokens worth of content (approximated via tokenCount), concatenates them
     * into a plain-text summary stored in context_summary, and marks them as compressed.
     * A future version can replace this with LLM-powered summarization.
     */
    public void compressSession(Long sessionId, int maxTokens) {
        requireSession(sessionId);

        List<LlmConversationMessage> allMessages = mapper.findMessagesBySessionId(sessionId);
        if (allMessages == null || allMessages.isEmpty()) {
            return;
        }

        // Find the cut-off: accumulate oldest non-compressed messages up to maxTokens
        int accumulatedTokens = 0;
        Long lastCompressedId = null;
        List<LlmConversationMessage> toCompress = new ArrayList<>();

        for (LlmConversationMessage msg : allMessages) {
            if (msg.getIsCompressed() != null && msg.getIsCompressed() == 1) {
                continue;
            }
            int msgTokens = msg.getTokenCount() != null ? msg.getTokenCount() : 0;
            if (accumulatedTokens + msgTokens <= maxTokens) {
                accumulatedTokens += msgTokens;
                toCompress.add(msg);
                lastCompressedId = msg.getId();
            } else {
                break;
            }
        }

        if (toCompress.isEmpty()) {
            return;
        }

        // Build a simple concatenated summary
        StringBuilder summary = new StringBuilder();
        for (LlmConversationMessage msg : toCompress) {
            if (summary.length() > 0) {
                summary.append("\n---\n");
            }
            summary.append("[").append(msg.getRole()).append("]: ");
            String content = msg.getContent();
            if (content != null) {
                // Truncate very long individual messages in summary
                if (content.length() > 500) {
                    content = content.substring(0, 500) + "...";
                }
                summary.append(content);
            }
        }

        // Update session summary and mark messages compressed
        mapper.updateSessionSummary(sessionId, summary.toString(), accumulatedTokens);
        if (lastCompressedId != null) {
            mapper.markMessagesCompressed(sessionId, lastCompressedId);
        }

        log.debug("[llm-conv] compressed session id={} messages={} tokens={}",
                sessionId, toCompress.size(), accumulatedTokens);
    }

    /**
     * Get the effective context for sending to an LLM.
     * <p>
     * Returns the context_summary (if any) plus recent non-compressed messages,
     * limited to maxTokens total. The returned map contains:
     * <ul>
     *   <li>{@code summary} - the context_summary string (maybe null)</li>
     *   <li>{@code messages} - list of recent non-compressed messages</li>
     * </ul>
     */
    public Map<String, Object> getSessionContext(Long sessionId, int maxTokens) {
        LlmConversationSession session = requireSession(sessionId);

        int limit = maxTokens > 0 ? Math.max(DEFAULT_CONTEXT_MESSAGE_LIMIT, maxTokens / 50)
                : DEFAULT_CONTEXT_MESSAGE_LIMIT;

        List<LlmConversationMessage> recentMessages =
                mapper.findNonCompressedMessagesBySessionId(sessionId, limit);

        Map<String, Object> context = new LinkedHashMap<>();
        context.put("summary", session.getContextSummary());
        context.put("messages", recentMessages != null ? recentMessages : List.of());
        context.put("sessionType", session.getSessionType());
        context.put("model", session.getModel());

        return context;
    }

    private LlmConversationSession requireSession(Long sessionId) {
        LlmConversationSession session = mapper.findSessionById(sessionId);
        if (session == null) {
            throw new IllegalArgumentException("会话不存在: " + sessionId);
        }
        return session;
    }
}
