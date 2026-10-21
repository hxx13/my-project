package com.example.demo.modules.mp.util;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertTrue;

class MpHtmlSanitizerTest {

    @Test
    void preservesTextColorAndHighlight() {
        String raw =
                "<p><span style=\"color: var(--app-color-accent)\">强调</span>"
                        + " <mark style=\"background-color: var(--app-color-accent-soft)\">色块</mark></p>";
        String out = MpHtmlSanitizer.sanitizeBodyHtml(raw);
        assertTrue(out.contains("color: var(--app-color-accent)"), () -> out);
        assertTrue(out.contains("background-color: var(--app-color-accent-soft)"), () -> out);
        assertTrue(out.contains("<mark"), () -> out);
    }

    @Test
    void stripsScript() {
        String raw = "<p>ok</p><script>alert(1)</script>";
        String out = MpHtmlSanitizer.sanitizeBodyHtml(raw);
        assertTrue(out.contains("ok"));
        assertTrue(!out.toLowerCase().contains("script"), () -> out);
    }

    @Test
    void preservesImageWidthPercentInlineStyle() {
        String raw =
                "<p><img src=\"/api/files/x.png\" alt=\"\" style=\"width: 45%; max-width: 100%; height: auto; display: inline-block; box-sizing: border-box;\"></p>";
        String out = MpHtmlSanitizer.sanitizeBodyHtml(raw);
        assertTrue(out.contains("width: 45%"), () -> out);
        assertTrue(out.contains("max-width: 100%"), () -> out);
    }

    @Test
    void preservesVideoWithControls() {
        String raw =
                "<p>演示</p><video src=\"https://host/api/upload/files/20261020/a.mp4\" controls preload=\"metadata\" playsinline></video>";
        String out = MpHtmlSanitizer.sanitizeBodyHtml(raw);
        assertTrue(out.contains("<video"), () -> out);
        assertTrue(out.contains("controls"), () -> out);
        assertTrue(out.contains("a.mp4"), () -> out);
    }

    @Test
    void dropsJavascriptVideoSrc() {
        String out = MpHtmlSanitizer.sanitizeBodyHtml("<video src=\"javascript:alert(1)\" controls></video>");
        assertTrue(!out.contains("javascript"), () -> out);
    }
}
