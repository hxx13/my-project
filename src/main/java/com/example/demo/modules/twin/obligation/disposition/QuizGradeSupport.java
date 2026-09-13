package com.example.demo.modules.twin.obligation.disposition;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

/** 从策略 config + 用户 answer JSON 判定是否及格。 */
public final class QuizGradeSupport {

    private QuizGradeSupport() {
    }

    /** 只有内置题库可用时的入口（无 Spring 上下文/表不可用）。 */
    public static boolean passed(ObjectMapper om, String configJson, String answerRaw) {
        return passed(om, configJson, answerRaw, QuizBank::questionsOf);
    }

    /**
     * 按策略 config + 用户 answer JSON 判定是否及格。
     *
     * @param bankResolver 题库来源：生产走 {@code QuizBankService::questionsOf}（读库带回落），
     *                     无 Spring 时回落内置
     */
    public static boolean passed(ObjectMapper om, String configJson, String answerRaw,
                                 Function<String, List<QuizBank.Question>> bankResolver) {
        if (answerRaw == null || answerRaw.isBlank() || om == null) {
            return false;
        }
        try {
            JsonNode answer = om.readTree(answerRaw);
            // 兼容旧垂直切片：显式 passed=true 且无 answers 时放行
            if (answer.path("passed").asBoolean(false) && !answer.has("answers")) {
                return true;
            }
            String bankId = QuizBank.DEFAULT_BANK_ID;
            int passCount = 2;
            if (configJson != null && !configJson.isBlank()) {
                JsonNode cfg = om.readTree(configJson);
                if (cfg.hasNonNull("questionBankId")) {
                    bankId = cfg.get("questionBankId").asText(QuizBank.DEFAULT_BANK_ID);
                }
                if (cfg.has("passCount")) {
                    passCount = Math.max(1, cfg.get("passCount").asInt(2));
                }
            }
            Map<String, Integer> answers = new HashMap<>();
            JsonNode ansNode = answer.get("answers");
            if (ansNode != null && ansNode.isObject()) {
                Iterator<String> names = ansNode.fieldNames();
                while (names.hasNext()) {
                    String id = names.next();
                    answers.put(id, ansNode.get(id).asInt(-1));
                }
            }
            List<QuizBank.Question> bank = bankResolver == null ? null : bankResolver.apply(bankId);
            int correct = QuizBank.grade(bank, answers);
            return correct >= passCount;
        } catch (Exception e) {
            return false;
        }
    }
}
