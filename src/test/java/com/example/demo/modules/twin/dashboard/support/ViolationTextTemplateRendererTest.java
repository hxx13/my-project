package com.example.demo.modules.twin.dashboard.support;

import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

class ViolationTextTemplateRendererTest {

    @Test
    void rendersStandardVariables() {
        String out = ViolationTextTemplateRenderer.render(
                "${name}(${dept}) @ ${date}", "张三", "药理", "2026-08-21");
        assertEquals("张三(药理) @ 2026-08-21", out);
    }

    @Test
    void rendersExtrasAfterStandard() {
        String out = ViolationTextTemplateRenderer.render(
                "${name} ${status} @ ${cage}",
                "李四",
                "A",
                "2026-08-21",
                Map.of("status", "COHABITATION", "cage", "B-2"));
        assertEquals("李四 COHABITATION @ B-2", out);
    }

    @Test
    void blankTemplateSafe() {
        assertEquals("", ViolationTextTemplateRenderer.render(null, "a", "b", "c"));
        assertFalse(ViolationTextTemplateRenderer.DEFAULT_STRANDED_TPL.isBlank());
    }
}
