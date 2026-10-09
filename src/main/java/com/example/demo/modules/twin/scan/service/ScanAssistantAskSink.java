package com.example.demo.modules.twin.scan.service;

import com.example.demo.modules.ai.core.AiEventSink;
import com.example.demo.modules.ai.core.AiTurnStats;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 把编排层的事件翻译成**智能精灵球面板**认定的 SSE 协议（delta / done / error）。
 *
 * 这就是 {@link AiEventSink} 存在的意义：球球面板早于网关存在、协议是它自己那套，
 * 而网关只管发出载体无关的事件。适配放在这里，编排层与面板都不用改。
 */
public class ScanAssistantAskSink implements AiEventSink {

    private static final Logger log = LoggerFactory.getLogger(ScanAssistantAskSink.class);

    private final SseEmitter emitter;
    private final String fallbackText;
    private final StringBuilder buffer = new StringBuilder();
    private volatile boolean closed = false;
    /** 本轮推过待答问题（澄清候选 / 确认挂起）。推过就不补兜底文案 —— 面板上已经有一排选项了。 */
    private volatile boolean hadInteraction = false;
    /** 本轮推过跳转指令。同上：推过就不补兜底文案（这一轮的产出就是「跳过去了」）。 */
    private volatile boolean hadNavigate = false;
    /** 本轮落在哪条会话上：面板拿它去续跑挂起（确认）时要用。 */
    private volatile Long sessionId;

    public ScanAssistantAskSink(SseEmitter emitter, String fallbackText) {
        this.emitter = emitter;
        this.fallbackText = fallbackText;
    }

    /** 已经流出去的正文；调用方用它判断「本轮是否一句话都没说」。 */
    public String bufferedText() {
        return buffer.toString();
    }

    public void setSessionId(Long sessionId) {
        this.sessionId = sessionId;
    }

    @Override
    public void delta(String text) {
        buffer.append(text);
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("text", text);
        send("delta", data);
    }

    /** 球球面板目前没有「正在调用工具」的展示位；事件丢弃（保留钩子，将来加）。 */
    @Override
    public void tool(String name, String status) {
        log.debug("[scan-ask] tool {} -> {}", name, status);
    }

    /**
     * 把候选选项原样推给面板渲染成可点选控件。
     *
     * <p>以前这里是把「需要确认」当文字追加进正文 —— 那等于让用户照着正文手打。
     * 选项是**结构化数据**，就该走结构化的通道。
     */
    @Override
    public void interaction(String token, String kind, String question, List<Option> options, boolean multiSelect) {
        hadInteraction = true;
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("token", token == null ? "" : token);
        data.put("kind", kind == null ? "" : kind);
        data.put("question", question == null ? "" : question);
        data.put("options", options == null ? List.of() : options);
        data.put("multiSelect", multiSelect);
        send("interaction", data);
    }

    @Override
    public void usage(AiTurnStats stats) {
        send("usage", usagePayload(stats));
    }

    /**
     * 下载指令：把「导什么」原样交给面板，由面板用**它自己那份登录态**去拉文件。
     *
     * <p>后端不签发公开下载链接、也不在聊天里塞裸 URL（导出接口要 Authorization 头）。
     * 小程序侧那个导出弹层不记上次配置，所以小程序上这条多半用不上（见 MaterialAuditToolPack）。
     */
    @Override
    public void download(String payloadJson) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("payload", payloadJson == null ? "{}" : payloadJson);
        send("download", data);
    }

    /**
     * 跳转指令原样转给面板；**面板把它压到 done 之后再执行**。
     *
     * <p>收到就跳不行：模型常先说「我帮你打开…」再说别的，立刻切页会把正文和选项一起带走
     * （而且全屏壳子被卸载时会顺手掐断这条 SSE）。顺序交给前端。
     */
    @Override
    public void navigate(String path, String label) {
        hadNavigate = true;
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("path", path);
        data.put("label", label == null ? "" : label);
        send("navigate", data);
    }

    private static Map<String, Object> usagePayload(AiTurnStats stats) {
        Map<String, Object> data = new LinkedHashMap<>();
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
    public void done(AiTurnStats stats) {
        String text = buffer.toString().trim();
        if (text.isEmpty() && !hadInteraction) {
            // 一句话都没说出来、也没有待答问题（模型空回复 / 工具全被拒）——补兜底文案，
            // 否则面板上是空白气泡。必须赶在 done 之前发，顺序不能反。
            //
            // 推过选项时不补：那一排芯片就是「这轮说了什么」，补一句「联系不上」反而把确认界面盖成了故障。
            //
            // 推过跳转指令也不补：模型只调了工具没说话时，这一轮的结果就是「已经跳到那个页面了」，
            // 补一句「联系不上」会让人以为跳转是玄学。
            if (!hadNavigate) {
                text = fallbackText;
                Map<String, Object> fallback = new LinkedHashMap<>();
                fallback.put("text", text);
                fallback.put("fallback", true);
                send("delta", fallback);
            }
        }
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("text", text);
        if (sessionId != null) {
            data.put("sessionId", sessionId);
        }
        if (stats != null) {
            data.put("latencyMs", stats.latencyMs());
            data.put("promptTokens", stats.promptTokens());
            data.put("completionTokens", stats.completionTokens());
            data.put("totalTokens", stats.totalTokens());
            data.put("turns", stats.turns());
            data.put("model", stats.model() == null ? "" : stats.model());
        }
        send("done", data);
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
            log.debug("[scan-ask] 事件 {} 发送失败（多为客户端已断开）: {}", name, e.getMessage());
        }
    }
}
