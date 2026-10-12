package com.example.demo.modules.ai.tool.pack;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 会话级临时参数记忆 —— 防「条件丢了，静默按全量办事」的那道闸。
 *
 * <p>真机现场：点完「郑俊克的课题组」，导出那次调用里课题组没了，导出来是全表。
 * 这里钉住三件事：显式优先、空串=清掉、**能打包回给模型**（用户 2026-10-12 定调）。
 */
class AiSessionFilterMemoTest {

    private static final Map<String, String> LABELS = Map.of(
            "projectGroup", "课题组", "from", "起始", "to", "截止");

    @Test
    @DisplayName("本轮没提 → 沿用记忆（这就是「模型漏带」那一处）")
    void remembersAcrossCalls() {
        AiSessionFilterMemo memo = new AiSessionFilterMemo();
        Map<String, String> first = new LinkedHashMap<>();
        first.put("projectGroup", "郑俊克的课题组");
        memo.remember(1L, first);

        // 下一轮模型只提了时间，课题组一个字没提
        Map<String, String> explicit = new LinkedHashMap<>();
        explicit.put("projectGroup", null);      // 没提
        explicit.put("from", "2026-09-01");

        Map<String, String> eff = memo.merge(1L, explicit);
        assertEquals("郑俊克的课题组", eff.get("projectGroup"), "漏带的课题组要从记忆里补回来");
        assertEquals("2026-09-01", eff.get("from"));
    }

    @Test
    @DisplayName("本轮显式给了新值 → 以新的为准（换了个组就得听新的）")
    void explicitWins() {
        AiSessionFilterMemo memo = new AiSessionFilterMemo();
        memo.remember(1L, Map.of("projectGroup", "郑俊克的课题组"));
        Map<String, String> eff = memo.merge(1L, Map.of("projectGroup", "卢今的课题组"));
        assertEquals("卢今的课题组", eff.get("projectGroup"));
    }

    @Test
    @DisplayName("显式给空串 = **明确清掉这一维**，并从记忆里删掉（模型唯一能表达「不筛了」的方式）")
    void blankClears() {
        AiSessionFilterMemo memo = new AiSessionFilterMemo();
        memo.remember(1L, Map.of("projectGroup", "郑俊克的课题组", "from", "2026-09-01"));

        Map<String, String> eff = memo.merge(1L, Map.of("projectGroup", ""));
        assertNull(eff.get("projectGroup"), "清掉的那一维不该还在");
        assertEquals("2026-09-01", eff.get("from"), "别的维度不该被连累");

        memo.remember(1L, eff);
        assertNull(memo.get(1L, "projectGroup"), "记忆里也要删干净，否则下一轮又填回来");
    }

    @Test
    @DisplayName("打包回给模型：写出人话，且维度名换成中文")
    void describeForModel() {
        AiSessionFilterMemo memo = new AiSessionFilterMemo();
        memo.remember(7L, new LinkedHashMap<>(Map.of("projectGroup", "郑俊克的课题组", "from", "2026-09-01")));
        String s = memo.describe(7L, LABELS);
        assertNotNull(s);
        assertTrue(s.contains("课题组=郑俊克的课题组"), s);
        assertTrue(s.contains("起始=2026-09-01"), s);
    }

    @Test
    @DisplayName("过期即忘（这条决定了「早上筛过的组」不会在几小时后的导全部里悄悄生效）")
    void expires() {
        AiSessionFilterMemo memo = new AiSessionFilterMemo(1L);   // 1ms TTL
        memo.remember(1L, Map.of("projectGroup", "郑俊克的课题组"));
        try {
            Thread.sleep(5);
        } catch (InterruptedException ignored) {
            Thread.currentThread().interrupt();
        }
        assertTrue(memo.values(1L).isEmpty(), "过期后应当什么都不记得");
        assertNull(memo.describe(1L, LABELS), "过期后也没什么可回显的");
    }

    @Test
    @DisplayName("会话之间互不干扰，没记过的会话是干净的")
    void sessionsAreIsolated() {
        AiSessionFilterMemo memo = new AiSessionFilterMemo();
        memo.remember(1L, Map.of("projectGroup", "郑俊克的课题组"));
        assertTrue(memo.values(2L).isEmpty());
        assertEquals("郑俊克的课题组", memo.get(1L, "projectGroup"));
    }
}
