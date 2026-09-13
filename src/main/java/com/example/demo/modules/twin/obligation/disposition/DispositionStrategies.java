package com.example.demo.modules.twin.obligation.disposition;

import com.example.demo.modules.twin.dashboard.support.InteractiveChallengeVerifier;
import com.example.demo.modules.twin.obligation.support.ObligationSupport;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

/** 仅展示：无需交互，任意渠道直接可视为送达即可。 */
@Component
class ShowOnlyDispositionStrategy implements DispositionStrategy {
    @Override
    public String type() {
        return ObligationSupport.DISPOSITION_SHOW_ONLY;
    }

    @Override
    public boolean requiresInteraction() {
        return false;
    }

    @Override
    public Map<String, String> configSchema() {
        return Map.of();
    }

    @Override
    public boolean verify(String configJson, String answerRaw) {
        return true;
    }
}

/**
 * 确认阅读：需交互渠道点确认。
 * <p>可配「最短停留秒数」与「是否需滚到底」——两者都在服务端校验，
 * 客户端提交 {@code {"dwellSeconds":N,"scrolledToBottom":bool}}。
 * <p>不配门控时（两项皆空/0/false）恒通过，与旧行为一致；一旦配了就必须满足，
 * 否则「确认阅读」与「仅展示」没有区别。
 */
@Component
class AckReadDispositionStrategy implements DispositionStrategy {
    private final ObjectMapper objectMapper;

    AckReadDispositionStrategy(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @Override
    public String type() {
        return ObligationSupport.DISPOSITION_ACK_READ;
    }

    @Override
    public boolean requiresInteraction() {
        return true;
    }

    @Override
    public Map<String, String> configSchema() {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("minDwellSeconds", "最短停留秒数（0=不限时）");
        m.put("requireScrollToBottom", "是否需滚到底（true/false）");
        return m;
    }

    @Override
    public boolean verify(String configJson, String answerRaw) {
        int minDwell = 0;
        boolean requireBottom = false;
        try {
            if (configJson != null && !configJson.isBlank()) {
                JsonNode cfg = objectMapper.readTree(configJson);
                minDwell = Math.max(0, cfg.path("minDwellSeconds").asInt(0));
                requireBottom = cfg.path("requireScrollToBottom").asBoolean(false);
            }
        } catch (Exception e) {
            return false;
        }
        // 未配门控：视为「点一下即可」，保持老数据可用
        if (minDwell <= 0 && !requireBottom) {
            return true;
        }
        try {
            JsonNode answer = objectMapper.readTree(answerRaw == null || answerRaw.isBlank() ? "{}" : answerRaw);
            if (requireBottom && !answer.path("scrolledToBottom").asBoolean(false)) {
                return false;
            }
            if (minDwell > 0 && answer.path("dwellSeconds").asDouble(0) < minDwell) {
                return false;
            }
            return true;
        } catch (Exception e) {
            return false;
        }
    }
}

/** 拼图短语：复用 InteractiveChallengeVerifier。 */
@Component
class AckPuzzleDispositionStrategy implements DispositionStrategy {
    private final ObjectMapper objectMapper;

    AckPuzzleDispositionStrategy(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @Override
    public String type() {
        return ObligationSupport.DISPOSITION_ACK_PUZZLE;
    }

    @Override
    public boolean requiresInteraction() {
        return true;
    }

    @Override
    public Map<String, String> configSchema() {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("phrase", "目标短语（必填）");
        m.put("maxAttempts", "重试上限（可选）");
        return m;
    }

    @Override
    public boolean verify(String configJson, String answerRaw) {
        String phrase = extractPhrase(configJson);
        return InteractiveChallengeVerifier.matches(phrase, answerRaw);
    }

    private String extractPhrase(String configJson) {
        if (configJson == null || configJson.isBlank()) {
            return "";
        }
        try {
            JsonNode node = objectMapper.readTree(configJson);
            JsonNode phrase = node.get("phrase");
            return phrase != null && !phrase.isNull() ? phrase.asText("") : "";
        } catch (Exception e) {
            return "";
        }
    }
}

/**
 * 答题策略：题库 + 抽题数 + 及格线；校验走 {@link QuizGradeSupport}。
 */
@Component
class QuizDispositionStrategy implements DispositionStrategy {
    private final ObjectMapper objectMapper;

    QuizDispositionStrategy(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @Override
    public String type() {
        return ObligationSupport.DISPOSITION_QUIZ;
    }

    @Override
    public boolean requiresInteraction() {
        return true;
    }

    @Override
    public Map<String, String> configSchema() {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("questionBankId", "题库 ID（默认 default）");
        m.put("drawCount", "抽题数");
        m.put("passCount", "及格题数");
        m.put("maxAttempts", "重试上限");
        return m;
    }

    @Override
    public boolean verify(String configJson, String answerRaw) {
        return QuizGradeSupport.passed(objectMapper, configJson, answerRaw);
    }
}

/** 签名确认：垂直切片校验器要求 answer 含非空 signature 字段。 */
@Component
class SignatureDispositionStrategy implements DispositionStrategy {
    private final ObjectMapper objectMapper;

    SignatureDispositionStrategy(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @Override
    public String type() {
        return ObligationSupport.DISPOSITION_SIGNATURE;
    }

    @Override
    public boolean requiresInteraction() {
        return true;
    }

    @Override
    public Map<String, String> configSchema() {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("preamble", "签名前声明");
        m.put("retainImage", "是否留档（true/false）");
        return m;
    }

    @Override
    public boolean verify(String configJson, String answerRaw) {
        if (answerRaw == null || answerRaw.isBlank()) {
            return false;
        }
        try {
            JsonNode node = objectMapper.readTree(answerRaw);
            String sig = node.path("signature").asText("").trim();
            return !sig.isEmpty();
        } catch (Exception e) {
            return answerRaw.trim().length() >= 2;
        }
    }
}
