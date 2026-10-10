package com.example.demo.modules.ai.core;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Web 端的 {@link AiEventSink} 实现：把事件写成 SSE。
 *
 * 客户端断连后所有发送都变 no-op —— 用户关掉面板不该让一次已经跑了一半的循环抛异常。
 */
public class SseEventSink implements AiEventSink {

    private static final Logger log = LoggerFactory.getLogger(SseEventSink.class);

    /** 只用于把 download 事件的 JSON 串转成结构化载荷（前端按字段用，不是当文本看）。 */
    private static final com.fasterxml.jackson.databind.ObjectMapper objectMapper =
            new com.fasterxml.jackson.databind.ObjectMapper();

    private final SseEmitter emitter;
    private volatile boolean closed = false;

    public SseEventSink(SseEmitter emitter) {
        this.emitter = emitter;
    }

    @Override
    public void delta(String text) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("text", text);
        send("delta", data);
    }

    @Override
    public void tool(String name, String status) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("name", name);
        data.put("status", status);
        send("tool", data);
    }

    @Override
    public void interaction(String token, String kind, String question, List<Option> options, boolean multiSelect) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("token", token);
        data.put("kind", kind);
        data.put("question", question);
        data.put("options", options);
        data.put("multiSelect", multiSelect);
        send("interaction", data);
    }

    @Override
    public void usage(AiTurnStats stats) {
        send("usage", statsPayload(stats, null));
    }

    @Override
    public void done(AiTurnStats stats) {
        send("done", statsPayload(stats, stats == null ? null : stats.messageId()));
    }

    @Override
    public void download(String payloadJson) {
        try {
            send("download", objectMapper.readTree(payloadJson));
        } catch (Exception e) {
            // payload 是后端自己拼的，坏不了；真坏了也不能因此中断这一轮
            log.warn("[ai-sse] download 事件载荷不是合法 JSON，已丢弃: {}", e.getMessage());
        }
    }

    @Override
    public void navigate(String path, String label) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("path", path);
        data.put("label", label == null ? "" : label);
        send("navigate", data);
    }

    @Override
    public void image(Long exportId, String label, String path) {
        Map<String, Object> data = new LinkedHashMap<>();
        if (exportId != null) {
            data.put("exportId", exportId);
        }
        data.put("label", label == null ? "" : label);
        // 有 path = 让载体自己去截这个页面；没有 = 图已经产好，载体去产物接口取字节
        if (path != null && !path.isBlank()) {
            data.put("path", path);
        }
        send("image", data);
    }

    private static Map<String, Object> statsPayload(AiTurnStats stats, Long messageId) {
        Map<String, Object> data = new LinkedHashMap<>();
        if (messageId != null) {
            data.put("messageId", messageId);
        }
        if (stats != null) {
            data.put("latencyMs", stats.latencyMs());
            data.put("promptTokens", stats.promptTokens());
            data.put("completionTokens", stats.completionTokens());
            data.put("totalTokens", stats.totalTokens());
            data.put("turns", stats.turns());
            data.put("model", stats.model() == null ? "" : stats.model());
        }
        return data;
    }

    @Override
    public void error(String code, String message) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("code", code);
        data.put("message", message);
        send("error", data);
    }

    private void send(String name, Object data) {
        if (closed) {
            return;
        }
        try {
            emitter.send(SseEmitter.event().name(name).data(data));
        } catch (Exception e) {
            closed = true;
            log.debug("[ai-sse] 事件 {} 发送失败（多为客户端已断开）: {}", name, e.getMessage());
        }
    }
}
