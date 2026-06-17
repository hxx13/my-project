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
}
