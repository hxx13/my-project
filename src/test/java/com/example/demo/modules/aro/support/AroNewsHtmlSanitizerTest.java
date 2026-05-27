package com.example.demo.modules.aro.support;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AroNewsHtmlSanitizerTest {

    @Test
    void qowtHtml_becomesRenderableParagraphs() {
        String qowt = """
                <div id="contentsContainer"><div id="contents">
                <qowt-section qowt-eid="E152">
                <p is="qowt-word-para" qowt-eid="E153">
                <span is="qowt-word-run" qowt-eid="E154">关于实验动物科学部通知</span>
                </p></qowt-section></motion.div></motion.div>
                """;
        String out = AroNewsHtmlSanitizer.forMiniProgramRichText(qowt);
        assertFalse(out.isBlank(), () -> "sanitized: " + out);
        assertTrue(out.contains("关于实验动物科学部通知"), () -> "sanitized: " + out);
    }

    @Test
    void nestedQowt_notDuplicated() {
        String qowt = """
                <qowt-section><p is="qowt-word-para"><span is="qowt-word-run">同一段正文</span></p></qowt-section>
                """;
        String out = AroNewsHtmlSanitizer.forMiniProgramRichText(qowt);
        assertTrue(out.contains("同一段正文"));
        int count = out.split("同一段正文", -1).length - 1;
        assertTrue(count == 1, () -> "expected once, got " + count + ": " + out);
    }

    @Test
    void qowtSectionHeadings_useStrong() {
        String qowt = """
                <p is="qowt-word-para" class="qowt-stl-3"><span>一、首次登记</span></p>
                <p is="qowt-word-para" class="qowt-stl-5"><span>正文说明</span></p>
                """;
        String out = AroNewsHtmlSanitizer.forMiniProgramRichText(qowt);
        assertTrue(out.contains("<strong>一、首次登记</strong>"), () -> out);
        assertTrue(out.contains("<p>正文说明</p>") || out.contains("正文说明</p>"), () -> out);
        assertFalse(out.contains("一、首次登记</strong></strong>"), () -> out);
    }

    @Test
    void msoHtml_unchangedWhenNoQowt() {
        String mso = "<p class=\"MsoNormal\">人员进出通知</p>";
        assertFalse(AroNewsHtmlSanitizer.needsRichTextSanitize(mso));
        assertTrue(AroNewsHtmlSanitizer.forMiniProgramRichText(mso).contains("人员进出通知"));
    }
}
