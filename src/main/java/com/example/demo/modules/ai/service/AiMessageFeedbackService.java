package com.example.demo.modules.ai.service;

import com.example.demo.modules.ai.entity.AiMessage;
import com.example.demo.modules.ai.entity.AiMessageFeedback;
import com.example.demo.modules.ai.mapper.AiMessageFeedbackMapper;
import com.example.demo.modules.auth.entity.User;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * 回复级反馈（赞 / 踩）。
 *
 * <p>两条硬规矩，都写在下面方法里：
 * <ul>
 *   <li>**只能评自己会话里的助手回复** —— 归属判据复用 {@link AiSessionService#requireOwned}，
 *       不另写一套（「同一动作四处权限口径」是本仓库的高发坑）；</li>
 *   <li>**同一人对同一回复只有一票** —— 由表上唯一键保证，重复投就是改那一票。</li>
 * </ul>
 */
@Service
public class AiMessageFeedbackService {

    public static final String UP = "up";
    public static final String DOWN = "down";

    private final AiMessageFeedbackMapper mapper;
    private final AiSessionService sessionService;

    public AiMessageFeedbackService(AiMessageFeedbackMapper mapper, AiSessionService sessionService) {
        this.mapper = mapper;
        this.sessionService = sessionService;
    }

    /** 投一票（赞/踩）。同一条回复重复投 = 改那一票，不堆行。 */
    public void vote(User actor, Long messageId, String vote, String reason) {
        String v = vote == null ? "" : vote.trim().toLowerCase(Locale.ROOT);
        if (!UP.equals(v) && !DOWN.equals(v)) {
            throw new IllegalArgumentException("vote 只认 up / down");
        }
        AiMessage msg = requireOwnAssistantMessage(actor, messageId);

        AiMessageFeedback f = new AiMessageFeedback();
        f.setMessageId(messageId);
        f.setSessionId(msg.getSessionId());
        f.setUserId(actor.getId());
        f.setVote(v);
        f.setReason(reason == null ? "" : reason.trim());
        mapper.upsert(f);
    }

    /**
     * **撤掉**这一票 —— 用户再点一次同一个图标。
     *
     * <p>与 {@link #vote} 的区别：那个是「我要投 up/down」，这个是「我不投了」，所以整行删掉。
     * 归属判据两者**同一套**（{@link #requireOwnAssistantMessage}），不各写一份。
     */
    public void cancelVote(User actor, Long messageId) {
        requireOwnAssistantMessage(actor, messageId);
        mapper.delete(messageId, actor.getId());
    }

    /**
     * 投票/撤票共用的前置校验：**只能碰自己会话里的助手回复**。校验通过就把那条消息返回，
     * 免得调用方再查一遍。
     *
     * <p>归属判据复用 {@link AiSessionService#requireOwned} —— 与读历史同一套，
     * 不另写（「同一动作四处权限口径」是本仓库的高发坑）。
     */
    private AiMessage requireOwnAssistantMessage(User actor, Long messageId) {
        if (actor == null) {
            throw new IllegalStateException("未登录");
        }
        if (messageId == null) {
            throw new IllegalArgumentException("缺少消息 id");
        }
        AiMessage msg = sessionService.message(messageId);
        if (msg == null) {
            throw new IllegalStateException("消息不存在");
        }
        sessionService.requireOwned(msg.getSessionId(), actor.getId());
        if (!"assistant".equals(msg.getRole())) {
            throw new IllegalArgumentException("只能对助手的回复投票");
        }
        return msg;
    }

    /** 某个会话里**这个人自己**投过的票（界面用来回填「我点过哪条」）。 */
    public List<Map<String, Object>> myVotes(User actor, Long sessionId) {
        if (actor == null) {
            throw new IllegalStateException("未登录");
        }
        sessionService.requireOwned(sessionId, actor.getId());
        return mapper.myVotesInSession(sessionId, actor.getId());
    }

    /** 某个会话的票数汇总（赞/踩各多少）。判据与后台看用。 */
    public List<Map<String, Object>> counts(Long sessionId) {
        return mapper.countsInSession(sessionId);
    }
}
