package com.example.demo.modules.llm.service;

import com.example.demo.common.exception.SseClientDisconnectedException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestTemplate;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

/**
 * LLM 对话客户端（OpenAI 兼容协议）。
 * 注：类名保留 "DashScope" 仅为历史兼容，当前实现为纯 DeepSeek + OpenAI 兼容协议，
 * 与阿里云 DashScope 无关。
 *
 * <h2>为什么不发 {@code max_tokens}（2026-10-11 定）</h2>
 * 这个字段管的是「这次生成总共能产出多少 token」，而**思考正文和最终正文是同一份额度**。
 * 它是**我们自己**在请求里带的（不发时服务端用自己的默认值，实测正常收尾），原本是为了
 * 让播报短一点。但在思考模型上它起的是反作用：额度被思考吃光后不是「输出短一点」，
 * 而是**正文一个字都出不来**——表现为「模型没有返回正文」，看着像故障。
 *
 * <p>实测（同一份真实播报提示词）：上限 80 → 生成 80、其中思考 80、**正文 0 字**、
 * 结束原因就是「打满上限」；**不发上限** → 生成 838（思考 775）、正文 88 字、正常收尾。
 * 注意思考要 775，**比旧代码允许的最大值还高**——所以调大这条路走不通，只能不发。
 *
 * <p>长度该由提示词管（播报那条本来就写着 80～150 字）。配置里的几个上限键保留只为兼容，
 * **已不再影响请求**。
 *
 * <p>这条坑不是第一次撞：2026-10-09 就有一条 3.3 万 token 的编排轮，生成数正好卡在 2048 的上限、
 * 正文长度 0。当时的处置是**给工具路径单独开一个更大的额度**（8192）——那只把症状往后推了，
 * 根源（思考与正文共用一份额度）没动。现在整个字段不发，才算修到根上。
 */
@Component
public class DashScopeChatClient {

    private static final Logger log = LoggerFactory.getLogger(DashScopeChatClient.class);

    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;
    private final LlmConfigService llmConfigService;

    public DashScopeChatClient(RestTemplate restTemplate, ObjectMapper objectMapper, LlmConfigService llmConfigService) {
        this.restTemplate = restTemplate;
        this.objectMapper = objectMapper;
        this.llmConfigService = llmConfigService;
    }

    public ChatResult chat(List<Map<String, String>> messages) {
        return chatWithFallback(messages);
    }

    /**
     * 按配置的主模型与备用模型依次尝试，直至成功或全部失败。
     */
    public ChatResult chatWithFallback(List<Map<String, String>> messages) {
        llmConfigService.assertReady();
        List<String> models = llmConfigService.getModelCandidates();
        String baseUrl = llmConfigService.getBaseUrl();
        String apiKey = llmConfigService.getApiKey();
        String maskedKey = maskKey(apiKey);
        log.info("[llm] baseUrl={} models={} apiKey={}", baseUrl, models, maskedKey);
        IllegalStateException lastError = null;
        for (String model : models) {
            try {
                return chatWithModel(model, messages);
            } catch (IllegalStateException e) {
                lastError = e;
                if (!isRetriableModelError(e)) {
                    throw e;
                }
                log.warn("[llm] 模型 {} 调用失败，等待 {}ms 后尝试下一个: {}", model, 500L * (models.indexOf(model) + 1), e.getMessage());
                sleepMs(500L * (models.indexOf(model) + 1));
            }
        }
        if (lastError != null) {
            throw new IllegalStateException(
                    "所有候选模型均失败（已尝试: " + String.join(", ", models) + "）: " + lastError.getMessage());
        }
        throw new IllegalStateException("未配置可用模型");
    }

    public ChatResult chatWithModel(String model, List<Map<String, String>> messages) {
        llmConfigService.assertReady();
        String url = llmConfigService.getBaseUrl() + "/chat/completions";
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", model);
        body.put("messages", messages);
        body.put("temperature", llmConfigService.getTemperature());

        log.info("[llm] → REQ model={} temp={} msgs={} preview={}",
                model, llmConfigService.getTemperature(),
                messages.size(), summarizeMessages(messages));

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(llmConfigService.getApiKey());
        headers.set("User-Agent", "TwinSystem/1.0");
        headers.set("Accept", "application/json");

        try {
            ResponseEntity<String> resp = restTemplate.postForEntity(url, new HttpEntity<>(body, headers), String.class);
            ChatResult parsed = parseResponse(resp.getBody());
            log.info("[llm] ← RESP model={} tokens(in={} out={}) content={}",
                    model, parsed.promptTokens(), parsed.completionTokens(),
                    truncate(parsed.content(), 200));
            return new ChatResult(parsed.content(), parsed.promptTokens(), parsed.completionTokens(), model);
        } catch (HttpStatusCodeException e) {
            String detail = e.getResponseBodyAsString();
            throw new IllegalStateException("大模型调用失败(" + model + "): " + e.getStatusCode() + " " + shorten(detail));
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException("大模型调用失败(" + model + "): " + e.getMessage());
        }
    }

    /**
     * 带工具调用的对话（OpenAI 兼容 function calling）。**非流式** —— 一轮拿全 tool_calls，
     * 由调用方决定执行与否，再回灌结果开下一轮。
     *
     * 与 {@link #chatWithFallback} 的区别在消息结构：这里用 {@code Map<String,Object>}，
     * 因为 assistant 轮要装 {@code tool_calls} 数组、tool 轮要装 {@code tool_call_id}，
     * 都不是纯字符串能表达的。
     */
    public ToolChatResult chatWithTools(List<Map<String, Object>> messages, List<Map<String, Object>> tools) {
        llmConfigService.assertReady();
        List<String> models = llmConfigService.getModelCandidates();
        IllegalStateException lastError = null;
        for (String model : models) {
            try {
                return chatWithToolsWithModel(model, messages, tools);
            } catch (IllegalStateException e) {
                lastError = e;
                if (!isRetriableModelError(e)) {
                    throw e;
                }
                log.warn("[llm] 工具调用模型 {} 失败，等待后尝试下一个: {}", model, e.getMessage());
                sleepMs(500L * (models.indexOf(model) + 1));
            }
        }
        if (lastError != null) {
            throw new IllegalStateException("所有候选模型均失败（工具调用）: " + lastError.getMessage());
        }
        throw new IllegalStateException("未配置可用模型");
    }

    public ToolChatResult chatWithToolsWithModel(
            String model, List<Map<String, Object>> messages, List<Map<String, Object>> tools) {
        llmConfigService.assertReady();
        String url = llmConfigService.getBaseUrl() + "/chat/completions";
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", model);
        body.put("messages", messages);
        if (tools != null && !tools.isEmpty()) {
            body.put("tools", tools);
            body.put("tool_choice", "auto");
        }
        body.put("temperature", llmConfigService.getTemperature());
        // **走流式**（2026-10-11 定）。不是为了逐字显示，而是为了量出「思考了多久」——
        // 整包返回没有「思考结束」这个时刻，流式才有。理由与代价见 streamToolCall 的注释。
        body.put("stream", true);

        log.info("[llm] → TOOLS REQ(stream) model={} tools={} msgs={}",
                model, tools == null ? 0 : tools.size(), messages.size());

        return streamToolCall(url, body, model);
    }

    /**
     * 带工具的**流式**调用，顺带量出**思考时长**。
     *
     * <h2>为什么非得流式</h2>
     * 非流式只回一个整包，**没有「思考结束」这个时刻** —— 于是界面上那个「用时」只能拿墙钟冒充，
     * 而墙钟里大半是工具在查数据，不是思考。流式增量天然把两段分开：先是 {@code reasoning_content}
     * 一串，然后才轮到正文或工具调用。**第一个非思考增量到达的那一刻，就是思考结束的时刻**，
     * 从请求发出到那一刻的时长就是真正的思考用时。
     *
     * <h2>改成流式不会丢数字（实测 2026-10-11）</h2>
     * 最后一块里照样给**全套用量**：输入、输出、思考 token、缓存命中/未命中。所以刚接好的那些数
     * 一个都不会少。实测同时确认分片形状：{@code role} → {@code reasoning_content}×N →
     * {@code tool_calls}（按 {@code index} 分片，首片带 id 与函数名、后续片只带参数片段）。
     */
    private ToolChatResult streamToolCall(String url, Map<String, Object> body, String model) {
        long startedAt = System.currentTimeMillis();
        /** 思考结束的时刻（相对请求发出）。**-1 = 这一轮没出现非思考增量**，别当成 0 秒。 */
        long thinkingMs = -1;
        StringBuilder content = new StringBuilder();
        StringBuilder reasoning = new StringBuilder();
        // index → [id, 函数名, 参数片段拼接]。参数是**分片**给的，必须按 index 拼回去。
        Map<Integer, String[]> callParts = new LinkedHashMap<>();
        int promptTokens = 0, completionTokens = 0, reasoningTokens = 0, cacheHit = 0, cacheMiss = 0;

        HttpURLConnection conn = null;
        try {
            String json = objectMapper.writeValueAsString(body);
            conn = (HttpURLConnection) URI.create(url).toURL().openConnection();
            conn.setRequestMethod("POST");
            conn.setDoOutput(true);
            conn.setConnectTimeout(30_000);
            conn.setReadTimeout(300_000);
            conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            conn.setRequestProperty("Accept", "text/event-stream");
            conn.setRequestProperty("User-Agent", "TwinSystem/1.0");
            conn.setRequestProperty("Authorization", "Bearer " + llmConfigService.getApiKey());
            try (OutputStream os = conn.getOutputStream()) {
                os.write(json.getBytes(StandardCharsets.UTF_8));
            }
            int code = conn.getResponseCode();
            if (code < 200 || code >= 300) {
                String err = readAll(conn.getErrorStream());
                throw new IllegalStateException("大模型工具调用失败(" + model + "): " + code + " " + shorten(err));
            }
            try (BufferedReader reader =
                    new BufferedReader(new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    if (!line.startsWith("data:")) {
                        continue; // 夹在流里的 `: keep-alive` 注释行走这里，无害
                    }
                    String data = line.substring(5).trim();
                    if ("[DONE]".equals(data)) {
                        break;
                    }
                    if (data.isEmpty()) {
                        continue;
                    }
                    JsonNode root = objectMapper.readTree(data);
                    JsonNode err = root.path("error");
                    if (!err.isMissingNode() && err.has("message")) {
                        throw new IllegalStateException(err.path("message").asText("未知错误"));
                    }
                    JsonNode u = root.path("usage");
                    if (!u.isMissingNode()) {
                        promptTokens = u.path("prompt_tokens").asInt(0);
                        completionTokens = u.path("completion_tokens").asInt(0);
                        reasoningTokens = u.path("completion_tokens_details").path("reasoning_tokens").asInt(0);
                        cacheHit = u.path("prompt_cache_hit_tokens").asInt(0);
                        cacheMiss = u.path("prompt_cache_miss_tokens").asInt(0);
                    }
                    JsonNode delta = root.path("choices").path(0).path("delta");
                    String r = delta.path("reasoning_content").asText("");
                    String c = delta.path("content").asText("");
                    JsonNode tcs = delta.path("tool_calls");
                    boolean nonThinking = StringUtils.hasText(c) || (tcs.isArray() && !tcs.isEmpty());
                    // **思考结束的第一时间**：这一段之前是思考，之后是正文/工具调用
                    if (thinkingMs < 0 && nonThinking) {
                        thinkingMs = System.currentTimeMillis() - startedAt;
                    }
                    if (StringUtils.hasText(r)) {
                        reasoning.append(r);
                    }
                    if (StringUtils.hasText(c)) {
                        content.append(c);
                    }
                    if (tcs.isArray()) {
                        for (JsonNode tc : tcs) {
                            int idx = tc.path("index").asInt(0);
                            String[] parts = callParts.computeIfAbsent(idx, k -> new String[]{"", "", ""});
                            if (tc.hasNonNull("id")) {
                                parts[0] = tc.path("id").asText("");
                            }
                            String fn = tc.path("function").path("name").asText("");
                            if (StringUtils.hasText(fn)) {
                                parts[1] = fn;
                            }
                            parts[2] = parts[2] + tc.path("function").path("arguments").asText("");
                        }
                    }
                }
            }
            List<ToolCall> calls = new ArrayList<>();
            for (String[] p : callParts.values()) {
                if (StringUtils.hasText(p[1])) {
                    calls.add(new ToolCall(p[0], p[1], StringUtils.hasText(p[2]) ? p[2] : "{}"));
                }
            }
            log.info("[llm] ← TOOLS RESP(stream) model={} tokens(in={} out={} reason={} cache={}/{}) toolCalls={} thinkMs={} content={}",
                    model, promptTokens, completionTokens, reasoningTokens, cacheHit, cacheMiss,
                    calls.size(), thinkingMs, truncate(content.toString(), 120));
            return new ToolChatResult(content.toString(), calls, promptTokens, completionTokens, model,
                    reasoning.toString(), reasoningTokens, cacheHit, cacheMiss, thinkingMs);
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            if (SseClientDisconnectedException.isClientDisconnect(e)) {
                if (e instanceof RuntimeException runtimeEx) {
                    throw runtimeEx;
                }
                throw new SseClientDisconnectedException(e.getMessage(), e);
            }
            throw new IllegalStateException("大模型工具调用失败(" + model + "): " + e.getMessage());
        } finally {
            if (conn != null) {
                conn.disconnect();
            }
        }
    }

    private ToolChatResult parseToolResponse(String raw, String model) {
        return parseToolResponse(raw, model, objectMapper);
    }

    /**
     * 纯解析：从上游响应原文里抽出**正文 / 思考正文 / 思考token / 工具调用 / 用量**。
     *
     * <p><b>静态无状态</b>（objectMapper 由调用方传入）只为让它可单测——不必为测一段解析去构造
     * 整个客户端（它还要 RestTemplate 与配置服务）。
     *
     * <p><b>思考那两项一直存在、此前一直没读</b>（2026-10-11 真实调用实测）：带工具那一轮
     * {@code content} 是空串而 {@code reasoning_content} 有内容——用户干等的那几秒里，
     * 模型其实「说」了话，只是被丢弃了。详见设计文档 §10。
     */
    static ToolChatResult parseToolResponse(String raw, String model, ObjectMapper mapper) {
        try {
            JsonNode root = mapper.readTree(raw == null ? "{}" : raw);
            JsonNode err = root.path("error");
            if (!err.isMissingNode() && err.has("message")) {
                throw new IllegalStateException(err.path("message").asText("未知错误"));
            }
            JsonNode message = root.path("choices").path(0).path("message");
            String content = message.path("content").asText("");
            // 思考正文：模型在决定「调哪个工具」之前会先想一段，实测那一段有 129 字。
            String reasoning = message.path("reasoning_content").asText("");
            List<ToolCall> calls = new ArrayList<>();
            for (JsonNode tc : message.path("tool_calls")) {
                calls.add(new ToolCall(
                        tc.path("id").asText(""),
                        tc.path("function").path("name").asText(""),
                        tc.path("function").path("arguments").asText("{}")));
            }
            int prompt = root.path("usage").path("prompt_tokens").asInt(0);
            int completion = root.path("usage").path("completion_tokens").asInt(0);
            // 思考 token 是**精确值**，不是估的——用来显示「思考了多少」，比拿墙钟冒充可靠。
            int reasoningTokens = root.path("usage").path("completion_tokens_details")
                    .path("reasoning_tokens").asInt(0);
            // 缓存命中/未命中：上游**分开给**。落进结果里是为了**入库后实测命中率**——
            // 设计文档 §1.1 那套「缓存命中比未命中便宜约 50 倍 → 拼装顺序必须共享在前」的论证，
            // 到今天一直缺一个真实数字。**同会话内第二轮起命中应显著大于 0；恒为 0 就是拼装顺序出了问题。**
            int cacheHit = root.path("usage").path("prompt_cache_hit_tokens").asInt(0);
            int cacheMiss = root.path("usage").path("prompt_cache_miss_tokens").asInt(0);
            log.info("[llm] ← TOOLS RESP model={} tokens(in={} out={} reason={} cache={}/{}) toolCalls={} content={}",
                    model, prompt, completion, reasoningTokens, cacheHit, cacheMiss,
                    calls.size(), truncate(content, 120));
            // 这条是**非流式**的解析，只有整包、没有「思考结束」那一刻 —— 思考用时给 -1（= 没测到），
            // 不是 0。真正量思考时长的是 streamToolCall。
            return new ToolChatResult(content, calls, prompt, completion, model, reasoning, reasoningTokens,
                    cacheHit, cacheMiss, -1L);
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException("解析大模型工具响应失败: " + e.getMessage());
        }
    }

    public String ping() {
        ChatResult result = chatWithFallback(List.of(Map.of("role", "user", "content", "请只回复：连接成功")));
        return result.content() + " [" + result.model() + "]";
    }

    /**
     * 流式对话（OpenAI SSE 兼容）；onDelta 收到增量文本，完成后 onComplete 携带模型名。
     */
    public void streamChatWithFallback(List<Map<String, String>> messages, StreamConsumer consumer) {
        streamChatWithFallback(messages, consumer, llmConfigService.getTemperature());
    }

    /**
     * 流式对话（OpenAI SSE 兼容）；可指定温度（扫码助手那类场景用助手自己的温度）。
     *
     * <p>**没有 maxTokens 参数**（2026-10-11 去掉）：生成上限已改为不发，见类注释。
     * 留着这个参数比去掉更糟 —— 它会让调用方以为「播报长度是这里控制的」。
     */
    public void streamChatWithFallback(
            List<Map<String, String>> messages,
            StreamConsumer consumer,
            double temperature) {
        llmConfigService.assertReady();
        List<String> models = llmConfigService.getModelCandidates();
        log.info("[llm] stream baseUrl={} models={} apiKey={}",
                llmConfigService.getBaseUrl(), models, maskKey(llmConfigService.getApiKey()));
        IllegalStateException lastError = null;
        for (String model : models) {
            try {
                streamChatWithModel(model, messages, consumer, temperature);
                return;
            } catch (IllegalStateException e) {
                lastError = e;
                if (!isRetriableModelError(e)) {
                    throw e;
                }
                log.warn("[llm] 流式模型 {} 失败，尝试下一个: {}", model, e.getMessage());
            }
        }
        if (lastError != null) {
            throw new IllegalStateException(
                    "流式调用均失败（已尝试: " + String.join(", ", models) + "）: " + lastError.getMessage());
        }
        throw new IllegalStateException("未配置可用模型");
    }

    private void streamChatWithModel(String model, List<Map<String, String>> messages, StreamConsumer consumer) {
        streamChatWithModel(model, messages, consumer, llmConfigService.getTemperature());
    }

    private void streamChatWithModel(
            String model,
            List<Map<String, String>> messages,
            StreamConsumer consumer,
            double temperature) {
        String url = llmConfigService.getBaseUrl() + "/chat/completions";
        log.info("[llm] → SSE model={} temp={} msgs={} preview={}",
                model, temperature, messages.size(), summarizeMessages(messages));
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", model);
        body.put("messages", messages);
        body.put("stream", true);
        body.put("temperature", temperature);

        HttpURLConnection conn = null;
        try {
            String json = objectMapper.writeValueAsString(body);
            conn = (HttpURLConnection) URI.create(url).toURL().openConnection();
            conn.setRequestMethod("POST");
            conn.setDoOutput(true);
            conn.setConnectTimeout(30_000);
            conn.setReadTimeout(300_000);
            conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            conn.setRequestProperty("Accept", "text/event-stream");
            conn.setRequestProperty("User-Agent", "TwinSystem/1.0");
            conn.setRequestProperty("Authorization", "Bearer " + llmConfigService.getApiKey());
            try (OutputStream os = conn.getOutputStream()) {
                os.write(json.getBytes(StandardCharsets.UTF_8));
            }
            int code = conn.getResponseCode();
            if (code < 200 || code >= 300) {
                String err = readAll(conn.getErrorStream());
                throw new IllegalStateException("大模型流式调用失败(" + model + "): " + code + " " + shorten(err));
            }
            try (BufferedReader reader =
                    new BufferedReader(new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    if (!line.startsWith("data:")) {
                        continue;
                    }
                    String data = line.substring(5).trim();
                    if ("[DONE]".equals(data)) {
                        break;
                    }
                    if (data.isEmpty()) {
                        continue;
                    }
                    JsonNode root = objectMapper.readTree(data);
                    JsonNode err = root.path("error");
                    if (!err.isMissingNode() && err.has("message")) {
                        throw new IllegalStateException(err.path("message").asText("未知错误"));
                    }
                    String delta = root.path("choices").path(0).path("delta").path("content").asText("");
                    if (StringUtils.hasText(delta)) {
                        invokeStreamConsumer(() -> consumer.onDelta(delta), model);
                    }
                }
            }
            invokeStreamConsumer(() -> consumer.onComplete(model), model);
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            if (SseClientDisconnectedException.isClientDisconnect(e)) {
                if (e instanceof RuntimeException runtimeEx) {
                    throw runtimeEx;
                }
                throw new SseClientDisconnectedException(e.getMessage(), e);
            }
            throw new IllegalStateException("大模型流式调用失败(" + model + "): " + e.getMessage());
        } finally {
            if (conn != null) {
                conn.disconnect();
            }
        }
    }

    private static void invokeStreamConsumer(Runnable action, String model) {
        try {
            action.run();
        } catch (RuntimeException e) {
            if (SseClientDisconnectedException.isClientDisconnect(e)) {
                throw e;
            }
            throw new IllegalStateException("大模型流式调用失败(" + model + "): " + e.getMessage(), e);
        }
    }

    private static String readAll(java.io.InputStream in) {
        if (in == null) {
            return "";
        }
        try (BufferedReader br = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = br.readLine()) != null) {
                sb.append(line);
            }
            return sb.toString();
        } catch (Exception e) {
            return "";
        }
    }

    public interface StreamConsumer {
        void onDelta(String text);

        void onComplete(String model);
    }

    private static boolean isRetriableModelError(IllegalStateException e) {
        String msg = (e.getMessage() == null ? "" : e.getMessage()).toLowerCase();
        return msg.contains("429")
                || msg.contains("503")
                || msg.contains("502")
                || msg.contains("500")
                || msg.contains("rate")
                || msg.contains("quota")
                || msg.contains("limit")
                || msg.contains("throttl")
                || msg.contains("model")
                || msg.contains("not found")
                || msg.contains("accessdenied")
                || msg.contains("invalid")
                || msg.contains("不存在")
                || msg.contains("无权限")
                || msg.contains("额度");
    }

    private ChatResult parseResponse(String raw) {
        try {
            JsonNode root = objectMapper.readTree(raw == null ? "{}" : raw);
            JsonNode err = root.path("error");
            if (!err.isMissingNode() && err.has("message")) {
                throw new IllegalStateException(err.path("message").asText("未知错误"));
            }
            String content = root.path("choices").path(0).path("message").path("content").asText("");
            int prompt = root.path("usage").path("prompt_tokens").asInt(0);
            int completion = root.path("usage").path("completion_tokens").asInt(0);
            return new ChatResult(content, prompt, completion, null);
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException("解析大模型响应失败: " + e.getMessage());
        }
    }

    private static void sleepMs(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    /** 摘要消息列表：显示每条消息的 role + 前80字内容 */
    private static String summarizeMessages(List<Map<String, String>> messages) {
        if (messages == null || messages.isEmpty()) return "[]";
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < messages.size(); i++) {
            if (i > 0) sb.append(", ");
            Map<String, String> m = messages.get(i);
            String role = m.getOrDefault("role", "?");
            String content = m.getOrDefault("content", "");
            sb.append(role).append(":");
            sb.append(truncate(content.replace("\n", "\\n"), 80));
        }
        sb.append("]");
        return sb.toString();
    }

    private static String maskKey(String key) {
        if (key == null || key.isBlank()) {
            return "<未配置>";
        }
        if (key.length() <= 8) {
            return key.substring(0, 2) + "***";
        }
        return key.substring(0, 8) + "***";
    }

    private static String truncate(String s, int maxLen) {
        if (s == null) return "";
        return s.length() <= maxLen ? s : s.substring(0, maxLen) + "…";
    }

    private static String shorten(String s) {
        if (s == null) return "";
        return s.length() > 200 ? s.substring(0, 200) + "…" : s;
    }

    public record ChatResult(String content, int promptTokens, int completionTokens, String model) {}

    /** 模型产出的一次工具调用请求。argumentsJson 是**原样**的 JSON 字符串，审计要的就是原文。 */
    public record ToolCall(String id, String name, String argumentsJson) {}

    /** 工具调用轮的响应：可能只有文本，也可能只有 toolCalls，也可能两者都有。 */
    public record ToolChatResult(String content, List<ToolCall> toolCalls,
                                 int promptTokens, int completionTokens, String model,
                                 /** 思考正文，无则空串。此前一直被丢弃（见设计文档 §10）。 */
                                 String reasoningContent,
                                 /** 思考消耗的 token，无则 0。上游精确给出，不是估的。 */
                                 int reasoningTokens,
                                 /** 输入里**命中缓存**的 token 数。用于实测拼装顺序的收益（设计 §1.1）。 */
                                 int promptCacheHitTokens,
                                 /** 输入里**未命中缓存**的 token 数。与上者成对，两者一起才算得出命中率。 */
                                 int promptCacheMissTokens,
                                 /**
                                  * **真正的思考用时**：从请求发出到「第一个非思考增量」到达的毫秒数。
                                  *
                                  * <p>这是走流式的唯一目的（见 streamToolCall）。**-1 = 这一轮没出现非思考增量**
                                  * —— 别当成 0 秒显示。
                                  */
                                 long thinkingMs) {

        /** 便捷构造：缓存两项与思考时长缺省为 0。测试用，读法与旧签名一致。 */
        public ToolChatResult(String content, List<ToolCall> toolCalls, int promptTokens, int completionTokens,
                              String model, String reasoningContent, int reasoningTokens) {
            this(content, toolCalls, promptTokens, completionTokens, model, reasoningContent,
                    reasoningTokens, 0, 0, 0);
        }
    }
}
