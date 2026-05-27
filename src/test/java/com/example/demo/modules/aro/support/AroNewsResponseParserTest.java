package com.example.demo.modules.aro.support;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AroNewsResponseParserTest {

    @Test
    void extractList_fromDataRecords() {
        Map<String, Object> root = Map.of(
                "data", Map.of(
                        "records", List.of(
                                Map.of("id", "1", "title", "标题A", "createTime", "2026-01-01")
                        )
                )
        );
        List<Map<String, Object>> list = AroNewsResponseParser.extractListMaps(root);
        assertEquals(1, list.size());
        assertEquals("标题A", AroNewsResponseParser.pickTitle(list.get(0)));
    }

    @Test
    void extractList_dataIsArray() {
        Map<String, Object> root = Map.of(
                "data", List.of(
                        Map.of("newsId", "2", "newsName", "标题B")
                )
        );
        List<Map<String, Object>> list = AroNewsResponseParser.extractListMaps(root);
        assertEquals(1, list.size());
        assertEquals("2", AroNewsResponseParser.pickId(list.get(0), ""));
    }

    @Test
    void pickTitle_skipsBlankNewsNameUsesTitle() {
        Map<String, Object> row = Map.of(
                "newsName", "",
                "title", "真实标题"
        );
        assertEquals("真实标题", AroNewsResponseParser.pickTitle(row));
    }

    @Test
    void pickNewsContent_skipsBlankNewsContentUsesHtml() {
        Map<String, Object> row = Map.of(
                "newsContent", "",
                "contentHtml", "<p>正文</p>"
        );
        assertEquals("<p>正文</p>", AroNewsResponseParser.pickNewsContent(row));
    }

    @Test
    void pickNewsContent_nestedMapHtml() {
        Map<String, Object> row = Map.of(
                "newsContent", Map.of("html", "<p>嵌套</p>")
        );
        assertEquals("<p>嵌套</p>", AroNewsResponseParser.pickNewsContent(row));
    }

    @Test
    void pickNewsContent_richTextArrayJson() {
        Map<String, Object> row = Map.of(
                "newsContent", List.of(
                        Map.of("name", "p", "children", List.of(Map.of("type", "text", "text", "hi")))
                )
        );
        String content = AroNewsResponseParser.pickNewsContent(row);
        assertTrue(content.startsWith("["));
        assertTrue(content.contains("name"));
    }

    @Test
    void extractDetail_rootLevelItem() {
        Map<String, Object> root = Map.of(
                "id", "9",
                "newsName", "详情",
                "newsContent", "<p>x</p>"
        );
        Map<String, Object> detail = AroNewsResponseParser.extractDetailMap(root, "9");
        assertEquals("详情", AroNewsResponseParser.pickTitle(detail));
        assertFalse(AroNewsResponseParser.pickNewsContent(detail).isEmpty());
    }
}
