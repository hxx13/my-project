package com.example.demo.modules.ai.service;

import com.example.demo.modules.ai.entity.AiLearnEntry;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * 影子期判定的闸。
 *
 * <p>它决定「学到的东西要不要真的挂给模型用」，判错的两个方向都不好：
 * 太松 → 歧义说法混进提示词，模型被带偏；太紧 → 学了半天一条也用不上，白学。
 * 所以三条边界都钉住。
 */
class AiLearnScorerTest {

    @Test
    @DisplayName("样本不够就不动它 —— 看过一两次分不出专一还是巧合")
    void belowMinSamplesStaysWatching() {
        AiLearnScorer.Verdict v = AiLearnScorer.decide(4, 4);
        assertEquals(AiLearnEntry.WATCHING, v.status());
        assertEquals(100, v.trust(), "分照算，只是不去留");
    }

    @Test
    @DisplayName("稳定对上同一条工具 → 转正")
    void consistentPromotes() {
        assertEquals(AiLearnEntry.ACTIVE, AiLearnScorer.decide(5, 5).status());
        assertEquals(AiLearnEntry.ACTIVE, AiLearnScorer.decide(8, 10).status(), "80% 正好到线");
    }

    @Test
    @DisplayName("同一个说法对上了好几条工具 → 淘汰（说明这说法本身有歧义）")
    void ambiguousDrops() {
        assertEquals(AiLearnEntry.DROPPED, AiLearnScorer.decide(5, 10).status(), "50% 正好到线");
        assertEquals(AiLearnEntry.DROPPED, AiLearnScorer.decide(1, 10).status());
    }

    @Test
    @DisplayName("中间地带继续观察 —— 不急着下结论")
    void inBetweenStaysWatching() {
        assertEquals(AiLearnEntry.WATCHING, AiLearnScorer.decide(7, 10).status());
        assertEquals(AiLearnEntry.WATCHING, AiLearnScorer.decide(6, 10).status());
    }

    @Test
    @DisplayName("分母为 0 不算崩 —— 返回 0 分而不是除零")
    void zeroTotalIsSafe() {
        assertEquals(0, AiLearnScorer.decide(0, 0).trust());
    }
}
