package com.example.demo.modules.twin.obligation.disposition;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 确认阅读的门控校验。
 *
 * <p>此前 {@code configSchema} 声明了 minDwellSeconds / requireScrollToBottom，但 {@code verify} 恒返回 true，
 * 后端从不看这两个配置——「确认阅读」与「仅展示」没有区别，学生点一下就能过。
 * 本测试锁住：配了门控就必须满足，没配则保持旧行为。
 *
 * <p>不加载 Spring 上下文、不连库。
 */
class AckReadDispositionStrategyTest {

    private final AckReadDispositionStrategy strategy =
            new AckReadDispositionStrategy(new ObjectMapper());

    @Test
    void noGateConfigured_alwaysPasses() {
        assertTrue(strategy.verify(null, "{}"));
        assertTrue(strategy.verify("", null));
        assertTrue(strategy.verify("{}", "{}"));
        assertTrue(strategy.verify("{\"minDwellSeconds\":0,\"requireScrollToBottom\":false}", "{}"));
    }

    @Test
    void minDwellSeconds_enforced() {
        String cfg = "{\"minDwellSeconds\":5}";
        assertFalse(strategy.verify(cfg, "{\"dwellSeconds\":3}"), "停留不足不得通过");
        assertTrue(strategy.verify(cfg, "{\"dwellSeconds\":5}"), "刚好达标应通过");
        assertFalse(strategy.verify(cfg, "{}"), "没上报停留时间＝未满足");
        assertFalse(strategy.verify(cfg, null), "空答案＝未满足");
    }

    @Test
    void requireScrollToBottom_enforced() {
        String cfg = "{\"requireScrollToBottom\":true}";
        assertFalse(strategy.verify(cfg, "{\"scrolledToBottom\":false}"));
        assertFalse(strategy.verify(cfg, "{}"), "没上报滚动状态＝未满足");
        assertTrue(strategy.verify(cfg, "{\"scrolledToBottom\":true}"));
    }

    @Test
    void bothGates_mustBothHold() {
        String cfg = "{\"minDwellSeconds\":3,\"requireScrollToBottom\":true}";
        assertFalse(strategy.verify(cfg, "{\"dwellSeconds\":9,\"scrolledToBottom\":false}"));
        assertFalse(strategy.verify(cfg, "{\"dwellSeconds\":1,\"scrolledToBottom\":true}"));
        assertTrue(strategy.verify(cfg, "{\"dwellSeconds\":3,\"scrolledToBottom\":true}"));
    }

    @Test
    void invalidAnswerJsonWithGateConfigured_rejected() {
        assertFalse(strategy.verify("{\"minDwellSeconds\":1}", "not-json"));
    }
}
