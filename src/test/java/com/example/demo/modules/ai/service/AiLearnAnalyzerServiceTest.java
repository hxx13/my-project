package com.example.demo.modules.ai.service;

import com.example.demo.modules.ai.service.AiLearnAnalyzerService.Candidate;
import com.example.demo.modules.ai.service.AiLearnAnalyzerService.TurnObservation;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 分析器捞候选的三条筛法 + 一个分隔符回归。
 *
 * <p>没测 {@code absorb}：那只是一层「拼对象 + 调 mapper」的搬运，没有分支。
 */
class AiLearnAnalyzerServiceTest {

    private static TurnObservation obs(String text, String... tools) {
        return new TurnObservation(text, false, Set.of(tools));
    }

    @Test
    @DisplayName("同一句话反复对上同一条工具 → 攒成一个候选，次数累计")
    void countsByPhraseAndTool() {
        List<Candidate> out = AiLearnAnalyzerService.candidates(List.of(
                obs("查一下张鹏的工号", "searchPerson"),
                obs("查一下张鹏的工号", "searchPerson"),
                obs("查一下张鹏的工号", "searchPerson"),
                obs("看看商城有什么", "listSupplyItems")), 1);

        assertEquals(2, out.size());
        assertEquals("查一下张鹏的工号", out.get(0).phrase());
        assertEquals("searchPerson", out.get(0).target());
        assertEquals(3, out.get(0).hits(), "次数要累计");
    }

    @Test
    @DisplayName("点选的句子不学 —— 那是我们给的选项文案，不是用户自己的说法")
    void skipsPickedTexts() {
        List<Candidate> out = AiLearnAnalyzerService.candidates(List.of(
                new TurnObservation("按常规导出", true, Set.of("prepareAnimalOrderExport")),
                new TurnObservation("按常规导出", true, Set.of("prepareAnimalOrderExport"))), 1);

        assertTrue(out.isEmpty(), "点选的一句话都不该进池子");
    }

    @Test
    @DisplayName("一轮跑通了「不止一条」工具的不学 —— 说不清这句话对上哪条")
    void skipsAmbiguousAttribution() {
        List<Candidate> out = AiLearnAnalyzerService.candidates(List.of(
                obs("帮我看看情况", "searchPerson", "listSupplyItems"),
                obs("帮我看看情况", "searchPerson", "listSupplyItems")), 1);

        assertTrue(out.isEmpty(), "对上多条工具时归因不可靠，宁可不学");
    }

    @Test
    @DisplayName("太短/太长的都不学；一轮什么都没跑通的也不学")
    void skipsBadLengthsAndEmptyTools() {
        List<Candidate> out = AiLearnAnalyzerService.candidates(List.of(
                obs("好", "searchPerson"),                                  // 太短
                obs("把这张单子出库并且顺便把它的明细导出来发我一份然后再把结果同步给课题组的其他成员看看", "x"), // 41 字，太长
                obs("看看这个", new String[0])), 1);                          // 没跑通任何工具

        assertTrue(out.isEmpty(), out.toString());
    }

    @Test
    @DisplayName("minHits 过滤：只出现一次的默认不收")
    void respectsMinHits() {
        List<TurnObservation> once = List.of(obs("查一下李四", "searchPerson"));

        assertTrue(AiLearnAnalyzerService.candidates(once, 2).isEmpty(), "只出现一次，门槛 2 时不该收");
        assertEquals(1, AiLearnAnalyzerService.candidates(once, 1).size(), "门槛 1 时该收");
    }

    @Test
    @DisplayName("回归：说法里带空格时不能被切坏（分隔符是控制字符，不是空格）")
    void phraseWithSpacesIsNotSplit() {
        List<Candidate> out = AiLearnAnalyzerService.candidates(List.of(
                obs("把动物订购单导出成 Excel", "prepareAnimalOrderExport")), 1);

        assertEquals(1, out.size());
        assertEquals("把动物订购单导出成 Excel", out.get(0).phrase(), "整句要完整，不能被空格切开");
        assertEquals("prepareAnimalOrderExport", out.get(0).target(), "工具名不能被当成「导出成」");
    }
}
