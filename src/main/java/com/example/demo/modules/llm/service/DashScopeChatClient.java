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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

/**
 * LLM 对话客户端（OpenAI 兼容协议）。
 * 注：类名保留 "DashScope" 仅为历史兼容，当前实现为纯 DeepSeek + OpenAI 兼容协议，
 * 与阿里云 DashScope 无关。
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
        body.put("max_tokens", llmConfigService.getMaxTokens());
        body.put("temperature", llmConfigService.getTemperature());

        log.info("[llm] → REQ model={} max_tokens={} temp={} msgs={} preview={}",
                model, llmConfigService.getMaxTokens(), llmConfigService.getTemperature(),
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

    public String ping() {
        ChatResult result = chatWithFallback(List.of(Map.of("role", "user", "content", "请只回复：连接成功")));
        return result.content() + " [" + result.model() + "]";
    }

    /**
     * 流式对话（OpenAI SSE 兼容）；onDelta 收到增量文本，完成后 onComplete 携带模型名。
     */
    public void streamChatWithFallback(List<Map<String, String>> messages, StreamConsumer consumer) {
        streamChatWithFallback(messages, consumer, llmConfigService.getMaxTokens(), llmConfigService.getTemperature());
    }

    /**
     * 流式对话（OpenAI SSE 兼容）；可指定 maxTokens / temperature（扫码助手等场景）。
     */
    public void streamChatWithFallback(
            List<Map<String, String>> messages,
            StreamConsumer consumer,
            int maxTokens,
            double temperature) {
        llmConfigService.assertReady();
        List<String> models = llmConfigService.getModelCandidates();
        log.info("[llm] stream baseUrl={} models={} apiKey={}",
                llmConfigService.getBaseUrl(), models, maskKey(llmConfigService.getApiKey()));
        IllegalStateException lastError = null;
        for (String model : models) {
            try {
                streamChatWithModel(model, messages, consumer, maxTokens, temperature);
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
        streamChatWithModel(
                model, messages, consumer, llmConfigService.getMaxTokens(), llmConfigService.getTemperature());
    }

    private void streamChatWithModel(
            String model,
            List<Map<String, String>> messages,
            StreamConsumer consumer,
            int maxTokens,
            double temperature) {
        String url = llmConfigService.getBaseUrl() + "/chat/completions";
        log.info("[llm] → SSE model={} max_tokens={} temp={} msgs={} preview={}",
                model, maxTokens, temperature, messages.size(), summarizeMessages(messages));
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", model);
        body.put("messages", messages);
        body.put("stream", true);
        body.put("max_tokens", maxTokens);
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
}
