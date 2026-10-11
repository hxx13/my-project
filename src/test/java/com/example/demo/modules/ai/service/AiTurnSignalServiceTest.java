package com.example.demo.modules.ai.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 行为判据里**最容易写错的那两段**的单测：
 * ① 从工具结果里抠选项文案（两种 JSON 形状）；② 信号汇成分的权重。
 *
 * <p>没测整个 {@code signalsOfSession}：那要造一个二十多个方法的仓储替身，
 * 成本远大于收益 —— 而它剩下的部分全是「按 seq 切段、按 messageId 分桶」这种一眼可验的搬运。
 */
class AiTurnSignalServiceTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Test
    @DisplayName("选项文案：choices 与 questions 两种形状都要抠到，label 与 value 都收")
    void optionTextsOf_bothShapes() {
        // 单选形状：工具查出来的候选，label 与 value 不同 —— 只收一个会漏掉一半
        Set<String> single = AiTurnSignalService.optionTextsOf(
                "{\"ok\":true,\"choices\":[{\"label\":\"按常规导出\",\"value\":\"default\"},"
                        + "{\"label\":\"我自己挑\",\"value\":\"custom\"}],\"choicesTitle\":\"小计怎么配？\"}",
                MAPPER);
        assertTrue(single.contains("按常规导出"), "label 要收");
        assertTrue(single.contains("default"), "value 也要收 —— 界面发回来的是它");
        assertEquals(4, single.size(), "两条各收 label+value");

        // 多选形状：questions[].options
        Set<String> multi = AiTurnSignalService.optionTextsOf(
                "{\"ok\":true,\"questions\":[{\"title\":\"按哪些层级小计？\",\"multiSelect\":true,"
                        + "\"options\":[{\"label\":\"总计\",\"value\":\"total\"},{\"label\":\"课题组\",\"value\":\"lv1\"}]}]}",
                MAPPER);
        assertTrue(multi.contains("总计") && multi.contains("total"), multi.toString());
        assertEquals(4, multi.size());

        // 「猜你想问」那条通道：label 就等于 value，去重后只该有一条
        Set<String> free = AiTurnSignalService.optionTextsOf(
                "{\"choices\":[{\"label\":\"看看快没货的\",\"value\":\"看看快没货的\"}]}", MAPPER);
        assertEquals(1, free.size(), "label==value 时不该算成两条");
    }

    @Test
    @DisplayName("坏数据不炸：非 JSON / 空串 / 缺字段一律当没有选项")
    void optionTextsOf_toleratesGarbage() {
        assertTrue(AiTurnSignalService.optionTextsOf(null, MAPPER).isEmpty());
        assertTrue(AiTurnSignalService.optionTextsOf("", MAPPER).isEmpty());
        assertTrue(AiTurnSignalService.optionTextsOf("这不是 JSON", MAPPER).isEmpty());
        assertTrue(AiTurnSignalService.optionTextsOf("{\"ok\":true}", MAPPER).isEmpty(), "没有选项键");
        assertTrue(AiTurnSignalService.optionTextsOf("{\"choices\":[]}", MAPPER).isEmpty(), "空数组");
        // 缺 value 的项：label 还是该收（只认完整的会漏）
        Set<String> partial = AiTurnSignalService.optionTextsOf(
                "{\"choices\":[{\"label\":\"只有标签\"}]}", MAPPER);
        assertEquals(Set.of("只有标签"), partial);
    }

    @Test
    @DisplayName("行为分：认了为正、没听懂为负，且踩比赞重（错一次的代价大于对一次）")
    void score_weights() {
        AiTurnSignalService.TurnSignals good = new AiTurnSignalService.TurnSignals(
                1L, 1L, "把张鹏的免冻收回来", true, false, false, false, Set.of(), "up", false, Set.of("revokeFreezeExemption"));
        assertTrue(good.score() > 0, "办成事 + 赞 = 正");

        AiTurnSignalService.TurnSignals bad = new AiTurnSignalService.TurnSignals(
                1L, 2L, "我不是这个意思", false, true, false, false, Set.of(), "down", false, Set.of());
        assertTrue(bad.score() < 0, "没听懂 + 踩 = 负");
        assertTrue(Math.abs(bad.score()) > Math.abs(good.score()),
                "负向权重要比正向重 —— 错一次的代价大于对一次");

        AiTurnSignalService.TurnSignals picked = new AiTurnSignalService.TurnSignals(
                1L, 3L, "按常规导出", false, false, true, false, Set.of(), "", false, Set.of());
        assertTrue(picked.score() > 0, "点选是「选项有用」的正信号");
        assertFalse(picked.acknowledged());

        AiTurnSignalService.TurnSignals quiet = new AiTurnSignalService.TurnSignals(
                1L, 4L, "好", true, false, false, false, Set.of(), "", false, Set.of("searchPerson"));
        assertEquals(2, quiet.score(), "只办成事、没投票，就是认了那 2 分");
    }

    @Test
    @DisplayName("自定义回答是**最高**的正信号 —— 用户没用选项、自己说了，那正是要学的原件")
    void customAnswerIsTopSignal() {
        // 抛过选项、用户没用、自己说了一句 → 自定义回答
        AiTurnSignalService.TurnSignals custom = new AiTurnSignalService.TurnSignals(
                1L, 9L, "别按常规来，我要按二级小计导出", true, false, false, true, Set.of(), "", false, Set.of("prepareAnimalOrderExport"));

        assertTrue(custom.customAnswer());
        assertEquals(2 + 3, custom.score(), "认了 2 + 自定义回答 3");
        assertTrue(custom.score() > AiTurnSignalService.W_ACK + AiTurnSignalService.W_VOTE_UP,
                "它比「认了 + 赞」还值钱：那一轮里同时有用户自己的说法和最终办成的事");
    }

    @Test
    @DisplayName("弃聊不再扣分 —— 「试了一下、最后决定不执行」不是负面")
    void abandonedIsNotPunished() {
        AiTurnSignalService.TurnSignals triedThenLeft = new AiTurnSignalService.TurnSignals(
                1L, 10L, "算一下这个", true, false, false, false, Set.of(), "", true, Set.of("listSupplies"));

        assertEquals(0, AiTurnSignalService.W_ABANDONED, "弃聊权重应为 0");
        assertEquals(2, triedThenLeft.score(), "只按「认了」算，不因弃聊倒扣");
    }
}
