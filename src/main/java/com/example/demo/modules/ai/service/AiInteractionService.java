package com.example.demo.modules.ai.service;

import com.example.demo.modules.ai.core.AiEventSink;
import com.example.demo.modules.ai.entity.AiInteraction;
import com.example.demo.modules.ai.mapper.AiGatewayMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * 挂起（确认）的落库与取回 —— 设计文档 §8。
 *
 * <p>挂起态**只存服务端**（不变量 I4）：前端拿到的只是一个 token，点选后回传的也只是**选择值**。
 * 前端回传整个挂起对象是不接受的 —— 那样待执行的调用就成了前端可篡改的输入。
 *
 * <p>确认（confirm）与澄清（clarify）是同一套机制，这里只实现确认侧；
 * 澄清目前仍走「工具返回 choices → 用户点选 → 作为下一条消息发出」的老路（无挂起态），
 * 它本来就不改变任何状态，不需要凭证。
 */
@Service
public class AiInteractionService {

    private static final Logger log = LoggerFactory.getLogger(AiInteractionService.class);

    /** 确认选项。value 是**稳定词表**，服务端据此判断执行还是放弃，不解析 label。 */
    public static final String VALUE_CONFIRM = "confirm";
    public static final String VALUE_CANCEL = "cancel";

    public static final List<AiEventSink.Option> CONFIRM_OPTIONS = List.of(
            new AiEventSink.Option("确认执行", VALUE_CONFIRM),
            new AiEventSink.Option("取消", VALUE_CANCEL));

    /**
     * 挂起有效期。
     *
     * <p>token 是一张**写入凭证**：不过期的话，几十天前挂起的那次调用点一下照样会执行。
     * 工具侧虽然会重新校验参数与状态，但那是在「用户此刻确实点了确认」之外的另一回事 ——
     * 一个早被忘掉的确认不该还能生效。
     */
    private static final Duration TTL = Duration.ofMinutes(30);

    private final AiGatewayMapper mapper;
    private final ObjectMapper objectMapper;

    public AiInteractionService(AiGatewayMapper mapper, ObjectMapper objectMapper) {
        this.mapper = mapper;
        this.objectMapper = objectMapper;
    }

    /** 挂起一次确认，返回带 token 的记录。 */
    public AiInteraction suspendConfirm(Long sessionId, Long messageId, String toolCallId,
                                        String question, List<AiEventSink.Option> options) {
        AiInteraction it = new AiInteraction();
        it.setSessionId(sessionId);
        it.setMessageId(messageId);
        it.setToolCallId(toolCallId);
        it.setToken(UUID.randomUUID().toString().replace("-", ""));
        it.setKind(AiInteraction.KIND_CONFIRM);
        it.setQuestion(question);
        it.setOptionsJson(writeOptions(options));
        it.setStatus(AiInteraction.STATUS_PENDING);
        mapper.insertInteraction(it);
        log.info("[ai-interaction] 已挂起确认 session={} tool={} token={}", sessionId, toolCallId, it.getToken());
        return it;
    }

    /**
     * 取回并落定一次挂起。校验顺序：存在 → 属于本会话 → 仍是 PENDING → 未过期。
     *
     * <p>用 {@code resolveInteraction} 的单向 UPDATE 兜底并发双击：第二次点击影响 0 行，
     * 于是这里会抛「已被处理」，不会执行两遍。
     */
    public AiInteraction resolve(Long sessionId, String token, String chosenValue) {
        if (token == null || token.isBlank()) {
            throw new IllegalStateException("挂起凭证为空");
        }
        AiInteraction it = mapper.selectInteractionByToken(token);
        if (it == null || !sessionId.equals(it.getSessionId())) {
            throw new IllegalStateException("这次确认已失效，请重新发起");
        }
        if (!AiInteraction.STATUS_PENDING.equals(it.getStatus())) {
            throw new IllegalStateException("这次确认已经处理过了");
        }
        if (it.getCreatedAt() != null && it.getCreatedAt().plus(TTL).isBefore(LocalDateTime.now())) {
            mapper.resolveInteraction(token, chosenValue, AiInteraction.STATUS_EXPIRED);
            throw new IllegalStateException("这次确认已超过 30 分钟，请重新发起");
        }
        if (mapper.resolveInteraction(token, chosenValue, AiInteraction.STATUS_RESOLVED) == 0) {
            throw new IllegalStateException("这次确认已经处理过了");
        }
        it.setChosenValue(chosenValue);
        it.setStatus(AiInteraction.STATUS_RESOLVED);
        return it;
    }

    /** 用户点了某个选项吗？只认稳定词表，不猜 label。 */
    public static boolean isConfirm(String chosenValue) {
        return VALUE_CONFIRM.equals(chosenValue);
    }

    private String writeOptions(List<AiEventSink.Option> options) {
        List<Map<String, Object>> arr = new ArrayList<>();
        for (AiEventSink.Option o : options) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("label", o.label());
            m.put("value", o.value());
            arr.add(m);
        }
        try {
            return objectMapper.writeValueAsString(arr);
        } catch (Exception e) {
            return "[]";
        }
    }
}
