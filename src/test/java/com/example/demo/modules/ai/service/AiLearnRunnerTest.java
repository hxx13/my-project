package com.example.demo.modules.ai.service;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 触发判据的单测。
 *
 * <p>它只有一行代码，但**语义是用户明确定的**（2026-10-11）：不是死板定期，而是
 * 「够格的新说法够数」**且**「冷却期满」两条同时成立。所以把这条规则锁住 ——
 * 将来有人图省事改成只看时间、或只看数量，这里会红。
 */
class AiLearnRunnerTest {

    @Test
    @DisplayName("两条都满足才学")
    void dueNeedsBothConditions() {
        int threshold = 5;
        long cooldown = 1000L;

        assertTrue(AiLearnRunner.due(5, 1000, threshold, cooldown), "刚好到线：学");
        assertTrue(AiLearnRunner.due(9, 9999, threshold, cooldown), "都超了：学");
    }

    @Test
    @DisplayName("缺任一条都不学 —— 老话重说时一次都不学")
    void skipsWhenEitherConditionFails() {
        int threshold = 5;
        long cooldown = 1000L;

        // 新说法不够：某天涌进来 500 轮、全是同一批老说法，这一轮学习纯属白跑
        assertFalse(AiLearnRunner.due(4, 9999, threshold, cooldown), "新候选不够数：不学");
        // 冷却期没到：兜住「一天涌进来就反复学」
        assertFalse(AiLearnRunner.due(9, 999, threshold, cooldown), "冷却期没满：不学");
        assertFalse(AiLearnRunner.due(0, 0, threshold, cooldown), "什么都没有：不学");
    }
}
