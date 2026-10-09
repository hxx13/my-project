package com.example.demo.modules.ai.service;

import com.example.demo.modules.ai.core.AiEventSink;
import com.example.demo.modules.ai.core.AiTurnStats;
import com.example.demo.modules.ai.tool.AiPackRouter;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 台账 {@code ok} 的口径：**业务成败**，不是「调用有没有抛异常」。
 *
 * <p>真机踩过：工具用 {@code {"ok":false}} 表达业务拒绝（越界房间、要用户先挑一个），
 * 执行体正常返回，台账一律记成成功 —— 审计页于是把「被拦住没做事」显示成「成功」。
 */
class AiOrchestratorTest {

    @Test
    @DisplayName("孤立的 tool 应答会被删掉（窗口截断后头一条是 tool → 上游 400）")
    void orphanToolMessagesAreDropped() throws Exception {
        AiOrchestrator orch = new AiOrchestrator(null, null, null, null, null, null, null, null, null,
                new AiPackRouter(), null, null);
        // 真机形状：窗口从一条 tool 开始（它上面的 assistant(tool_calls) 被截掉了）
        List<Map<String, Object>> messages = new ArrayList<>(List.of(
                Map.of("role", "system", "content", "S"),
                msg("tool", "call_cut"),                       // 孤儿：应删
                Map.of("role", "user", "content", "在吗"),
                assistantWithCalls("call_ok"),
                msg("tool", "call_ok"),                        // 配对：应留
                msg("tool", "call_other")));                   // 孤儿：应删
        orch.dropOrphanToolMessages(messages);

        List<String> roles = messages.stream().map(m -> String.valueOf(m.get("role"))).toList();
        assertEquals(List.of("system", "user", "assistant", "tool"), roles);
        assertEquals("call_ok", messages.get(3).get("tool_call_id"), "留下的必须是配上的那条");
    }

    private static Map<String, Object> msg(String role, String content) {
        Map<String, Object> m = new HashMap<>();
        m.put("role", role);
        m.put("tool_call_id", content);
        return m;
    }

    private static Map<String, Object> text(String role, String content) {
        Map<String, Object> m = new HashMap<>();
        m.put("role", role);
        m.put("content", content);
        return m;
    }

    /**
     * 真机形状（2026-10-09 小程序会话）：一长串工具轮里夹着**两种**残缺 ——
     * ①窗口开头截到一条 tool（它上面的 assistant 在窗口外）；
     * ②历史中断留下的、没人应答的 assistant(tool_calls)，以及它后面那条配不上的 tool。
     * 清洗之后整段必须是**上游能接受的合法序列**，否则就是 400「role 'tool' must be a response…」。
     */
    @Test
    @DisplayName("长会话里的两种残缺一起洗，洗完是合法序列")
    void mixedOrphansAreCleaned() {
        AiOrchestrator orch = new AiOrchestrator(null, null, null, null, null, null, null, null, null,
                new AiPackRouter(), null, null);
        List<Map<String, Object>> messages = new ArrayList<>(List.of(
                text("system", "S"),
                msg("tool", "call_cut"),            // ① 窗口开头的孤儿
                assistantWithCalls("a1"),
                msg("tool", "a1"),                  // 配对
                text("assistant", "答一句"),
                text("user", "再问"),
                text("assistant", "又答一句"),
                text("user", "还问"),
                assistantWithCalls("b1"),
                msg("tool", "b1"),                  // 配对
                assistantWithCalls("c1"),           // ② 没人应答（下一句是 user）
                text("user", "插进来一句"),
                text("assistant", "答"),
                msg("tool", "orphan_x"),            // ② 前面那个 assistant 没有 tool_calls
                text("user", "继续"),
                assistantWithCalls("d1"),           // ② 没人应答
                text("user", "第四次问"),
                assistantWithCalls("e1", "e2"),
                msg("tool", "e1"),                  // 配对
                msg("tool", "e2"),                  // 配对
                text("user", "最后一句")));

        orch.dropOrphanToolMessages(messages);
        orch.dropOrphanToolCalls(messages);

        assertToolMessagesPaired(messages);
        assertFalse(messages.stream().anyMatch(m -> "call_cut".equals(m.get("tool_call_id"))),
                "开头的孤儿 tool 必须没了");
        assertFalse(messages.stream().anyMatch(m -> "orphan_x".equals(m.get("tool_call_id"))),
                "配不上的 tool 也必须没了");
        assertTrue(messages.stream().anyMatch(m -> "e2".equals(m.get("tool_call_id"))),
                "配上的那两条不能被误删");
    }

    /**
     * 一轮发了两个调用、只答回来一个：**答过的那个必须留下**。
     *
     * <p>真机形状（2026-10-09）：截断/中断让一轮工具只落了一半应答。旧实现「只要有没答的就把
     * 整条 tool_calls 删掉」，于是答过的那条 tool 消息也失去配对 → 上游 400。
     */
    @Test
    @DisplayName("只答一半的工具轮：裁到已答的那几个，别把答过的变孤儿")
    void partiallyAnsweredToolCallsAreTrimmed() {
        AiOrchestrator orch = new AiOrchestrator(null, null, null, null, null, null, null, null, null,
                new AiPackRouter(), null, null);
        List<Map<String, Object>> messages = new ArrayList<>(List.of(
                text("system", "S"),
                assistantWithCalls("x1", "y1"),
                msg("tool", "x1"),                  // 答了
                text("user", "接着问")));             // y1 永远没答

        orch.dropOrphanToolMessages(messages);
        orch.dropOrphanToolCalls(messages);

        assertToolMessagesPaired(messages);
        assertTrue(messages.stream().anyMatch(m -> "x1".equals(m.get("tool_call_id"))),
                "答过的那条不能被误删");
        assertEquals(1, ((List<?>) messages.get(1).get("tool_calls")).size(),
                "tool_calls 应裁到只剩已答的那一个");
    }

    /**
     * 「又在重复提问」：这枚候选值不值得摆给用户。
     *
     * <p>真机形状（2026-10-09）：用户打完「郑俊克课题组」，模型拿它当关键字查了一遍候选
     * （listMaterialAuditOptions kind=groups），工具的返回值里带着 choices，
     * 于是界面又弹一道「哪个课题组？」，唯一选项正是那个组。
     */
    @Test
    @DisplayName("只剩一个候选 → 不问；有得挑才问")
    void singleOptionIsNeverAQuestion() {
        AiOrchestrator.ChoiceGroup one = new AiOrchestrator.ChoiceGroup(
                "哪个课题组？",
                List.of(new AiEventSink.Option("郑俊克的课题组", "郑俊克的课题组")),
                false);

        assertFalse(AiOrchestrator.worthAsking(one, "郑俊克的课题组"), "只有一个候选，没得挑");
        // 用户打的少了个「的」——字面比对漏得过去，但一个候选就是没得挑
        assertFalse(AiOrchestrator.worthAsking(one, "把郑俊克课题组6月的领用记录导出"), "近似写法同样不算有得挑");
        assertFalse(AiOrchestrator.worthAsking(one, ""), "没得挑与用户说了什么无关");

        // 多选题例外：可多选时一个候选仍然是个「要 / 不要」的选择
        assertTrue(AiOrchestrator.worthAsking(
                new AiOrchestrator.ChoiceGroup("按哪些层级小计？",
                        List.of(new AiEventSink.Option("总计", "total")), true),
                "导出"), "多选题不适用「一个候选」这条");
    }

    @Test
    @DisplayName("候选用户已说全 → 不再追问；还差一个 → 照问")
    void choiceAlreadySaidByUserIsNotAskedAgain() {
        AiOrchestrator.ChoiceGroup two = new AiOrchestrator.ChoiceGroup("哪个人？",
                List.of(new AiEventSink.Option("张三", "张三"), new AiEventSink.Option("李四", "李四")), false);

        assertFalse(AiOrchestrator.worthAsking(two, "张三和李四都看一下"), "两个都提过，没得挑");
        assertTrue(AiOrchestrator.worthAsking(two, "张三"), "李四他没提过，这题还有东西可问");
        assertTrue(AiOrchestrator.worthAsking(two, ""), "没有原话可比时不可误杀");

        // 真机那两枚问题：四选一的维度、二选一的小计配置，都得照问
        assertTrue(AiOrchestrator.worthAsking(
                new AiOrchestrator.ChoiceGroup("按哪个维度导？", List.of(
                        new AiEventSink.Option("个人审计", "personal"),
                        new AiEventSink.Option("课题组审计", "group")), false),
                "导出物资领用审计"), "维度还没选过，要问");
        assertTrue(AiOrchestrator.worthAsking(
                new AiOrchestrator.ChoiceGroup("小计怎么配？", List.of(
                        new AiEventSink.Option("用上次的小计配置直接导出", "last"),
                        new AiEventSink.Option("我要自己配一下小计", "custom")), false),
                "last"), "小计配置没配过，要问");
    }

    @Test
    @DisplayName("同一道题只问一遍 —— 模型同一轮里把查候选的工具调两次是常态")
    void identicalQuestionsAreAskedOnce() {
        AiOrchestrator orch = new AiOrchestrator(null, null, null, null, null, null, null, null, null,
                new AiPackRouter(), null, null);
        AiOrchestrator.ChoiceGroup sites = new AiOrchestrator.ChoiceGroup("是哪个机房（地点）？",
                List.of(new AiEventSink.Option("1F机房", "FM_S_1"),
                        new AiEventSink.Option("2F机房", "FM_S_2")), false);
        AiOrchestrator.ChoiceGroup other = new AiOrchestrator.ChoiceGroup("换了哪些级别？",
                List.of(new AiEventSink.Option("初效", "初效"),
                        new AiEventSink.Option("中效", "中效")), false);
        // 真机形状：同一个工具被调了两次 → 两组一模一样的候选进了队
        RecordingSink sink = new RecordingSink();
        orch.emitClarifyGroups(sink, List.of(sites, sites, other), "记录今天消耗半桶阻垢剂");

        assertEquals(List.of("是哪个机房（地点）？", "换了哪些级别？"), sink.asked,
                "重复的那道要并掉；不同的题各问一次");
    }

    /** 只记「问过哪些题」的假载体。 */
    private static final class RecordingSink implements AiEventSink {
        final List<String> asked = new ArrayList<>();

        @Override
        public void interaction(String token, String kind, String question,
                                List<Option> options, boolean multiSelect) {
            asked.add(question);
        }

        @Override
        public void delta(String text) {
        }

        @Override
        public void tool(String name, String status) {
        }

        @Override
        public void usage(AiTurnStats stats) {
        }

        @Override
        public void done(AiTurnStats stats) {
        }

        @Override
        public void error(String code, String message) {
        }
    }

    /** 上游的校验规则：每条 tool 都必须回应它紧邻前面那条 assistant 声明的某个 tool_call。 */
    private static void assertToolMessagesPaired(List<Map<String, Object>> messages) {
        Set<String> pending = new HashSet<>();
        for (Map<String, Object> m : messages) {
            String role = String.valueOf(m.get("role"));
            if ("assistant".equals(role)) {
                pending.clear();
                if (m.get("tool_calls") instanceof List<?> calls) {
                    for (Object c : calls) {
                        if (c instanceof Map<?, ?> cm) {
                            pending.add(String.valueOf(cm.get("id")));
                        }
                    }
                }
            } else if ("tool".equals(role)) {
                assertTrue(pending.remove(String.valueOf(m.get("tool_call_id"))),
                        "洗完之后仍有配不上的 tool：" + m.get("tool_call_id"));
            } else {
                pending.clear();
            }
        }
    }

    private static Map<String, Object> assistantWithCalls(String... ids) {
        List<Map<String, Object>> calls = new ArrayList<>();
        for (String id : ids) {
            calls.add(Map.of("id", id, "type", "function"));
        }
        Map<String, Object> m = new HashMap<>();
        m.put("role", "assistant");
        m.put("content", "");
        m.put("tool_calls", calls);
        return m;
    }
    void auditOkFollowsBusinessResult() {
        assertFalse(AiOrchestrator.businessOk(Map.of("ok", false, "reason", "越界房间")));
        assertTrue(AiOrchestrator.businessOk(Map.of("ok", true, "cardNo", "1AB38E4B")));
        assertTrue(AiOrchestrator.businessOk("纯文本结果"));
        assertTrue(AiOrchestrator.businessOk(List.of("没有 ok 键")));
        assertTrue(AiOrchestrator.businessOk(null));
    }
}
