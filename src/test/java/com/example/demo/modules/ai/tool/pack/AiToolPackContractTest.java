package com.example.demo.modules.ai.tool.pack;

import com.example.demo.modules.ai.tool.AiTool;
import com.example.demo.modules.ai.tool.AiToolPack;
import com.example.demo.modules.ai.tool.SideEffect;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 工具包的契约口径，都不需要 Spring 就能钉住。
 *
 * <p>能力码必须声明齐（闸门 fail-closed，漏声明 = 这个工具永远用不了）；
 * 工具名不重名；写操作必过确认；确认问句只能取 description 首句 —— 写给模型的那半句不进弹窗。
 */
class AiToolPackContractTest {

    /** 构造只需要服务依赖，而 tools()/capabilities() 不碰它们 —— 传 null 即可。 */
    private static final AiToolPack REVIEW_PACK = new StudentReviewToolPack(null, null);

    @Test
    @DisplayName("每个工具都必须声明在 capabilities() 里，否则闸门 fail-closed 让它永远调不动")
    void everyToolCapabilityIsDeclared() {
        Set<String> declared = REVIEW_PACK.capabilities().keySet();
        for (AiTool tool : REVIEW_PACK.tools()) {
            assertTrue(declared.contains(tool.capability()),
                    "工具 " + tool.name() + " 的能力码 " + tool.capability() + " 没在 capabilities() 里声明");
        }
    }

    @Test
    @DisplayName("工具名不重名、不空 —— 重名会让模型无法区分（注册表启动时会直接失败）")
    void toolNamesAreUniqueAndNonBlank() {
        Set<String> seen = new HashSet<>();
        for (AiTool tool : REVIEW_PACK.tools()) {
            assertFalse(tool.name().isBlank(), "工具名不能为空");
            assertTrue(seen.add(tool.name()), "工具名重复: " + tool.name());
        }
    }

    @Test
    @DisplayName("写操作一律标成需要确认 —— 审核是会推通知、动硬件的动作，绝不能无确认直接跑")
    void writesRequireConfirm() {
        for (AiTool tool : REVIEW_PACK.tools()) {
            boolean isWrite = tool.name().startsWith("approve") || tool.name().startsWith("reject");
            if (isWrite) {
                assertTrue(tool.requiresConfirm(), tool.name() + " 是写操作，必须过确认");
            }
        }
    }

    @Test
    @DisplayName("没声明能力码的工具构造不出来 —— 这是「工具漏判权限」的编译期防线")
    void toolWithoutCapabilityIsRejected() {
        assertThrows(IllegalArgumentException.class,
                () -> new AiTool("x", "只在测试里出现", "{}", null, SideEffect.READ, (ctx, args) -> null));
    }

    @Test
    @DisplayName("确认问句只取首句：写给模型的指令（「不要…」）绝不能出现在给用户看的弹窗上")
    void confirmPhraseIsHumanFacing() {
        AiTool write = new AiTool("t",
                "通过一张物资申领单。调用它会先挂起等你点确认，所以**不要**在正文里说已经办好了。",
                "{}", "cap", SideEffect.EXTERNAL_WRITE, (ctx, args) -> null);

        assertEquals("通过一张物资申领单。", write.confirmPhrase());
        assertFalse(write.confirmPhrase().contains("不要"), "给模型的指令不能进确认弹窗");
    }

    @Test
    @DisplayName("真实工具包：每个要确认的写工具，问句都不含模型指令口吻")
    void realPackConfirmPhrasesAreClean() {
        for (AiTool tool : REVIEW_PACK.tools()) {
            if (!tool.requiresConfirm()) continue;
            String phrase = tool.confirmPhrase();
            assertFalse(phrase.isBlank(), tool.name() + " 的确认问句不能为空");
            for (String banned : List.of("不要", "别自己", "必须先", "一律用")) {
                assertFalse(phrase.contains(banned),
                        tool.name() + " 的确认问句含模型指令「" + banned + "」，用户会看到一段在跟他讲规矩的话");
            }
        }
    }
}
