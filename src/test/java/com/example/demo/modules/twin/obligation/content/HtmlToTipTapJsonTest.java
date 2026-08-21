package com.example.demo.modules.twin.obligation.content;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class HtmlToTipTapJsonTest {

    private final ObjectMapper om = new ObjectMapper();

    @Test
    void convertsParagraphAndBold() {
        String json = HtmlToTipTapJson.convert(om, "<p>你好<strong>世界</strong></p>");
        assertNotNull(json);
        assertTrue(json.contains("\"type\":\"doc\""));
        assertTrue(json.contains("你好"));
        assertTrue(json.contains("bold") || json.contains("世界"));
        String html = TipTapJsonHtmlDeriver.derive(om, json);
        assertTrue(html.contains("你好"));
        assertTrue(html.contains("世界"));
    }

    @Test
    void blankReturnsNull() {
        org.junit.jupiter.api.Assertions.assertNull(HtmlToTipTapJson.convert(om, "  "));
    }

    @Test
    void resolvePrefersJson() {
        String json = "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"A\"}]}]}";
        ContentJsonSupport.Resolved r = ContentJsonSupport.resolve(om, json, "<p>B</p>", false);
        assertTrue(r.contentHtml().contains("A"));
        assertTrue(r.contentJson().contains("A"));
    }
}
