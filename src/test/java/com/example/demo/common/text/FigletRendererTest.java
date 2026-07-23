package com.example.demo.common.text;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class FigletRendererTest {

    @Test
    @DisplayName("render('TWIN') 返回非空列表")
    void renderTwinShouldReturnNonEmpty() {
        List<String> result = FigletRenderer.render("TWIN");
        assertNotNull(result);
        assertFalse(result.isEmpty(), "应返回至少 1 行");
    }

    @Test
    @DisplayName("render('TWIN') 每行非空")
    void renderTwinAllLinesNonBlank() {
        List<String> result = FigletRenderer.render("TWIN");
        for (String line : result) {
            assertNotNull(line);
            assertFalse(line.isBlank(), "每行应非空");
        }
    }

    @Test
    @DisplayName("render('') 不抛异常")
    void renderEmptyShouldNotThrow() {
        assertDoesNotThrow(() -> FigletRenderer.render(""));
    }

    @Test
    @DisplayName("render(null) 不抛异常")
    void renderNullShouldNotThrow() {
        assertDoesNotThrow(() -> FigletRenderer.render(null));
    }

    @Test
    @DisplayName("widthOf('TWIN') 返回正数")
    void widthOfTwinShouldBePositive() {
        int width = FigletRenderer.widthOf("TWIN");
        assertTrue(width > 0, "widthOf 应返回正数");
    }

    @Test
    @DisplayName("两次 render 调用返回一致（字体缓存）")
    void renderShouldBeConsistent() {
        List<String> first = FigletRenderer.render("A");
        List<String> second = FigletRenderer.render("A");
        assertEquals(first.size(), second.size());
        for (int i = 0; i < first.size(); i++) {
            assertEquals(first.get(i), second.get(i));
        }
    }
}
