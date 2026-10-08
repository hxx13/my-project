package com.example.demo.modules.ai.service;

import com.example.demo.modules.ai.tool.AiTool;
import com.example.demo.modules.ai.tool.AiToolPack;
import com.example.demo.modules.ai.tool.SideEffect;
import com.example.demo.modules.notification.entity.SystemConfigItem;
import com.example.demo.modules.notification.service.NotificationSettingsService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 约束拼装的层序闸。
 *
 * <p>顺序是**载荷性**的，不是可读性偏好：
 * ① 稳定内容在前才让 prompt 缓存前缀命中（每轮都变的运行时上下文若排在最前，等于每轮都让缓存失效）；
 * ② 全局约束必须在包级口径之前，否则域特有规则会盖掉平台级规则。
 * 拼错了不会报错，只会让模型行为变怪 —— 所以用测试钉住。
 */
class AiPromptServiceTest {

    private NotificationSettingsService settings;
    private AiPromptService service;

    @BeforeEach
    void setUp() {
        settings = mock(NotificationSettingsService.class);
        when(settings.listConfigs(AiPromptService.MODULE)).thenReturn(List.of());
        service = new AiPromptService(settings);
    }

    private static SystemConfigItem cfg(String key, String value) {
        SystemConfigItem item = new SystemConfigItem();
        item.setModule(AiPromptService.MODULE);
        item.setConfigKey(key);
        item.setConfigValue(value);
        return item;
    }

    private static AiToolPack pack(String key, String display, String prompt) {
        return new AiToolPack() {
            @Override public String packKey() { return key; }
            @Override public String displayName() { return display; }
            @Override public String defaultPrompt() { return prompt; }
            @Override public List<AiTool> tools() { return List.of(); }
        };
    }

    @Test
    @DisplayName("库为空时用代码内置默认，且层序为 全局 → 包(按key序) → 当前情况")
    void assemblesInStableOrderUsingCodeDefaults() {
        String out = service.assemble(
                List.of(pack("zeta", "Z包", "Z口径"), pack("alpha", "A包", "A口径")),
                "用户=张三；页面=笼架");

        int global = out.indexOf("## 全局约束");
        int alpha = out.indexOf("## A包 · 专属口径");
        int zeta = out.indexOf("## Z包 · 专属口径");
        int runtime = out.indexOf("## 当前情况");

        assertTrue(global >= 0, "缺全局层");
        assertTrue(outputOrdered(global, alpha, zeta, runtime),
                "层序不对，实际顺序: global=%d alpha=%d zeta=%d runtime=%d".formatted(global, alpha, zeta, runtime));
        assertTrue(out.contains(AiPromptService.DEFAULT_GLOBAL_PROMPT.split("\n")[0]), "未使用内置全局默认");
        assertTrue(out.contains("Z口径") && out.contains("A口径"));
        assertTrue(out.contains("用户=张三；页面=笼架"), "运行时上下文缺失");
    }

    @Test
    @DisplayName("后台有值时覆盖代码内置默认")
    void dbValueOverridesCodeDefault() {
        when(settings.listConfigs(AiPromptService.MODULE))
                .thenReturn(List.of(cfg(AiPromptService.GLOBAL_PROMPT_KEY, "后台改过的全局约束")));

        String out = service.assemble(List.of(), null);

        assertTrue(out.contains("后台改过的全局约束"));
        assertFalse(out.contains("你是实验动物房管理系统的操作助手"));
    }

    @Test
    @DisplayName("空的层被跳过，不留下空标题")
    void blankLayersAreSkipped() {
        String out = service.assemble(List.of(pack("empty", "空包", "   ")), "   ");

        assertFalse(out.contains("空包"), "空白包层不应出现");
        assertFalse(out.contains("当前情况"), "空白运行时层不应出现");
        assertTrue(out.startsWith("## 全局约束"));
    }

    @Test
    @DisplayName("预览标注每层来源，且 finalPrompt 等于正式拼装结果")
    void previewLabelsSourcesAndMatchesAssembly() {
        when(settings.listConfigs(AiPromptService.MODULE))
                .thenReturn(List.of(cfg(AiPromptService.packPromptKey("alpha"), "后台改过的A口径")));

        List<AiToolPack> packs = List.of(pack("alpha", "A包", "内置A口径"));
        AiPromptService.PromptPreview preview = service.preview(packs, "上下文");

        assertEquals(service.assemble(packs, "上下文"), preview.finalPrompt());
        assertEquals("代码内置默认", preview.layers().get(0).source(), "全局层应为内置默认");
        assertEquals("后台配置", preview.layers().get(1).source(), "A包层应标为后台配置");
        assertTrue(preview.layers().get(1).content().contains("后台改过的A口径"));
        assertEquals("运行时拼装", preview.layers().get(2).source());
    }

    private static boolean outputOrdered(int... positions) {
        for (int i = 1; i < positions.length; i++) {
            if (positions[i - 1] < 0 || positions[i] < positions[i - 1]) {
                return false;
            }
        }
        return true;
    }
}
