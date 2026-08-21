package com.example.demo.modules.twin.obligation.content;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertTrue;

class TipTapJsonHtmlDeriverTest {

    private final ObjectMapper om = new ObjectMapper();

    @Test
    void derivesParagraphAndBold() {
        String json = """
                {"type":"doc","content":[{"type":"paragraph","content":[
                  {"type":"text","text":"你好"},
                  {"type":"text","marks":[{"type":"bold"}],"text":"世界"}
                ]}]}
                """;
        String html = TipTapJsonHtmlDeriver.derive(om, json);
        assertTrue(html.contains("<p>"));
        assertTrue(html.contains("你好"));
        assertTrue(html.contains("<strong>世界</strong>"));
    }
}
