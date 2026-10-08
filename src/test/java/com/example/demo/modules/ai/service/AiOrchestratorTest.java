package com.example.demo.modules.ai.service;

import com.example.demo.modules.ai.tool.AiPackRouter;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

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
                new AiPackRouter(), null);
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
