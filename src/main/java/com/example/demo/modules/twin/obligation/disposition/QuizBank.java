package com.example.demo.modules.twin.obligation.disposition;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;

/**
 * 期 3 · 内置题库 + 抽题。完整题库管理可后续换持久化；本期垂直切片用内置默认库。
 */
public final class QuizBank {

    public record Question(String id, String prompt, List<String> options, int correctIndex) {
    }

    public static final String DEFAULT_BANK_ID = "default";

    private static final Map<String, List<Question>> BANKS = Map.of(
            DEFAULT_BANK_ID, List.of(
                    new Question("q1", "进入动物房前必须佩戴什么？",
                            List.of("口罩与隔离衣", "拖鞋即可", "无需防护", "随意着装"), 0),
                    new Question("q2", "一人一卡的含义是？",
                            List.of("每人只用自己的门禁卡", "可共用一张卡", "卡坏了可借同事的", "访客卡可转借"), 0),
                    new Question("q3", "发现笼位异常应首先？",
                            List.of("按规程上报并记录", "自行挪笼不登记", "忽略", "私下处理"), 0),
                    new Question("q4", "滞留未签退的正确做法？",
                            List.of("及时签退并说明原因", "第二天再说", "让同学代签", "不用管"), 0),
                    new Question("q5", "扫码弹窗要求确认时？",
                            List.of("按提示完成确认后再进入", "关掉弹窗强行进入", "让别人代答", "截图即可"), 0)
            )
    );

    private QuizBank() {
    }

    public static List<Question> questionsOf(String bankId) {
        String id = (bankId == null || bankId.isBlank()) ? DEFAULT_BANK_ID : bankId.trim();
        List<Question> bank = BANKS.getOrDefault(id, BANKS.get(DEFAULT_BANK_ID));
        return List.copyOf(bank);
    }

    /** 内置默认题库（表不可用时的回落，且与 DB 种子逐字一致）。 */
    public static List<Question> builtinQuestions() {
        return List.copyOf(BANKS.get(DEFAULT_BANK_ID));
    }

    /**
     * 抽题（不含正确答案索引，供客户端展示）。
     *
     * @param bank 题目来源——现在由 {@code QuizBankService} 从库里取，取不到才用 {@link #builtinQuestions()}
     */
    public static List<Map<String, Object>> drawPublic(List<Question> bank, int drawCount) {
        List<Question> pool = new ArrayList<>(bank == null ? List.of() : bank);
        if (pool.isEmpty()) {
            return List.of();
        }
        Collections.shuffle(pool, ThreadLocalRandom.current());
        int n = Math.max(1, Math.min(drawCount <= 0 ? 3 : drawCount, pool.size()));
        List<Map<String, Object>> out = new ArrayList<>(n);
        for (int i = 0; i < n; i++) {
            Question q = pool.get(i);
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", q.id());
            m.put("prompt", q.prompt());
            m.put("options", q.options());
            out.add(m);
        }
        return out;
    }

    /** 内置题库抽题（无 Spring 上下文/表不可用时的入口）。 */
    public static List<Map<String, Object>> drawPublic(String bankId, int drawCount) {
        return drawPublic(questionsOf(bankId), drawCount);
    }

    /**
     * 批改：answers 为 questionId → selectedIndex。
     *
     * @return 答对题数
     */
    public static int grade(List<Question> bank, Map<String, Integer> answers) {
        if (answers == null || answers.isEmpty()) {
            return 0;
        }
        Map<String, Question> byId = new LinkedHashMap<>();
        for (Question q : bank == null ? List.<Question>of() : bank) {
            byId.put(q.id(), q);
        }
        int correct = 0;
        for (Map.Entry<String, Integer> e : answers.entrySet()) {
            Question q = byId.get(e.getKey());
            if (q != null && e.getValue() != null && e.getValue() == q.correctIndex()) {
                correct++;
            }
        }
        return correct;
    }

    /** 内置题库判分（无 Spring 上下文/表不可用时的入口）。 */
    public static int grade(String bankId, Map<String, Integer> answers) {
        return grade(questionsOf(bankId), answers);
    }
}
