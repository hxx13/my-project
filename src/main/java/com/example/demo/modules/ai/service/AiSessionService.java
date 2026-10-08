package com.example.demo.modules.ai.service;

import com.example.demo.modules.ai.entity.AiMessage;
import com.example.demo.modules.ai.entity.AiSession;
import com.example.demo.modules.ai.mapper.AiGatewayMapper;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * 会话与消息的读写。
 *
 * 消息 append-only；seq 由本类统一分配（取当前最大 +1），调用方不要自己算。
 */
@Service
public class AiSessionService {

    /** 发给模型时保留的最近消息条数（约 10 轮）。存全量、发窗口 —— 见设计文档 §9。 */
    public static final int MODEL_WINDOW_MESSAGES = 20;

    private static final int TITLE_MAX = 40;

    private final AiGatewayMapper mapper;

    public AiSessionService(AiGatewayMapper mapper) {
        this.mapper = mapper;
    }

    public AiSession create(String userId, String source, String contextPage) {
        AiSession session = new AiSession();
        session.setUserId(userId);
        session.setSource(source);
        session.setContextPage(contextPage);
        session.setTitle("新对话");
        mapper.insertSession(session);
        return session;
    }

    /**
     * 取会话并校验归属。**跨用户访问一律拒绝** —— 会话 id 是自增的，不校验就等于任何人都能读别人的对话。
     */
    public AiSession requireOwned(Long sessionId, String userId) {
        if (sessionId == null || userId == null) {
            throw new IllegalStateException("会话不存在");
        }
        AiSession session = mapper.selectSessionById(sessionId);
        if (session == null || !userId.equals(session.getUserId())) {
            throw new IllegalStateException("会话不存在或不属于当前用户");
        }
        return session;
    }

    public List<AiSession> list(String userId, int page, int size) {
        int safeSize = Math.min(Math.max(size, 1), 100);
        int offset = Math.max(page, 0) * safeSize;
        return mapper.selectSessionsByUser(userId, offset, safeSize);
    }

    public int count(String userId) {
        return mapper.countSessionsByUser(userId);
    }

    /** 前端展示用：全量。 */
    /**
     * 用户删除自己的一条对话。
     *
     * <p>**软删**，不是真删：审计页是 `JOIN ai_session` 取发起人与标题的，硬删会把那条对话上
     * 所有工具调用留痕一起抹掉 —— 用户删自己的聊天记录，不该顺带把审计也删了。
     * 软删之后：列表/续聊/归属校验都看不到它（{@code selectSessionById} 也带过滤，
     * 所以拿着旧 id 再发消息会被拒），审计那侧照旧。
     */
    public void delete(Long sessionId, String userId) {
        requireOwned(sessionId, userId);
        mapper.markSessionDeleted(sessionId);
    }

    public List<AiMessage> history(Long sessionId) {
        return mapper.selectMessagesBySession(sessionId);
    }

    /** 按 id 取一条消息 —— 挂起续跑时用它取回那条带 tool_calls 的 assistant 轮。 */
    public AiMessage message(Long id) {
        return id == null ? null : mapper.selectMessageById(id);
    }

    /** 本会话里已经有应答的 tool_call_id 集合 —— 续跑时用它跳过已经办过的调用。 */
    public Set<String> answeredToolCallIds(Long sessionId) {
        List<String> ids = mapper.selectAnsweredToolCallIds(sessionId);
        return ids == null ? Set.of() : new HashSet<>(ids);
    }
    /** 发模型用：窗口截断。 */
    public List<AiMessage> window(Long sessionId) {
        return mapper.selectRecentMessages(sessionId, MODEL_WINDOW_MESSAGES);
    }

    /**
     * 取（或建）某载体的常驻会话 —— 智能精灵球这类「一个球 = 一条持续对话」的载体用。
     *
     * 球球面板本身是无会话概念的历史缓存（localStorage），这里在服务端给它一个稳定的落点，
     * 让它的每一次提问都进网关、走工具白名单与审计。
     */
    public AiSession findOrCreateBySource(String userId, String source) {
        AiSession existing = mapper.selectLatestSessionByUserAndSource(userId, source);
        return existing != null ? existing : create(userId, source, null);
    }

    /**
     * 追加一条消息。返回带 id 与 seq 的实体。
     *
     * 首条用户消息顺带把会话标题从「新对话」换成它的摘要 —— 只换一次，不覆盖用户后来改的名字。
     */
    public AiMessage append(Long sessionId, String role, String content, AiMessage extra) {
        AiMessage msg = extra != null ? extra : new AiMessage();
        msg.setSessionId(sessionId);
        msg.setRole(role);
        msg.setContent(content);
        msg.setSeq(nextSeq(sessionId));
        mapper.insertMessage(msg);
        mapper.touchSession(sessionId);

        if ("user".equals(role) && StringUtils.hasText(content)) {
            AiSession session = mapper.selectSessionById(sessionId);
            if (session != null && "新对话".equals(session.getTitle())) {
                mapper.updateSessionTitle(sessionId, summarize(content));
            }
        }
        return msg;
    }

    private int nextSeq(Long sessionId) {
        Integer max = mapper.selectMaxSeq(sessionId);
        return (max == null ? 0 : max) + 1;
    }

    private static String summarize(String text) {
        String flat = text.replaceAll("\\s+", " ").strip();
        return flat.length() <= TITLE_MAX ? flat : flat.substring(0, TITLE_MAX) + "…";
    }
}
