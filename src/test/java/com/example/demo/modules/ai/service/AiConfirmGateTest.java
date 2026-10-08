package com.example.demo.modules.ai.service;

import com.example.demo.modules.ai.tool.AiTool;
import com.example.demo.modules.ai.tool.SideEffect;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 写操作「挂起确认」的两处口径。都是判错就出事的：
 *
 * <p>一是**该不该挂起** —— 少判「已确认就放行」那半边，用户点一次确认、界面又弹回同一张卡（真机踩过）。
 * <p>二是**什么值才算确认** —— 只有精确的 confirm 才执行。
 */
class AiConfirmGateTest {

    private static AiTool tool(SideEffect effect) {
        return new AiTool("t", "说明", "{}", "cap", effect, (ctx, args) -> null);
    }

    @Test
    @DisplayName("写操作没确认过 → 挂起；已确认过（续跑）→ 放行；只读 → 从不挂起")
    void suspendOnlyForUnconfirmedWrites() {
        AiTool write = tool(SideEffect.EXTERNAL_WRITE);
        AiTool read = tool(SideEffect.READ);

        assertTrue(AiOrchestrator.mustSuspendForConfirm(write, null),
                "写操作首次出现必须挂起等用户点");
        assertFalse(AiOrchestrator.mustSuspendForConfirm(write, "STAFF_u1"),
                "从挂起记录走回来的这一次已经确认过了 —— 再挂一次就是无限确认循环");
        assertFalse(AiOrchestrator.mustSuspendForConfirm(read, null),
                "只读不需要确认");
    }

    @Test
    @DisplayName("只有精确的 confirm 才执行：其它值（含大小写变体、空、null）一律不执行")
    void onlyExactConfirmExecutes() {
        assertTrue(AiInteractionService.isConfirm("confirm"));
        assertFalse(AiInteractionService.isConfirm("cancel"));
        assertFalse(AiInteractionService.isConfirm("Confirm"), "词表比对不做大小写宽容 —— 前端只发这两个值");
        assertFalse(AiInteractionService.isConfirm(""));
        assertFalse(AiInteractionService.isConfirm(null));
    }
}
