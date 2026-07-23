package com.example.demo.common.logging.banner;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class ProgressBarTest {

    @Test
    @DisplayName("render(0, 100, null) → 0%")
    void renderZeroPercent() {
        String result = ProgressBar.render(0, 100, null);
        assertNotNull(result);
        assertTrue(result.contains("0%"), result);
    }

    @Test
    @DisplayName("render(50, 100, null) → 50%")
    void renderFiftyPercent() {
        String result = ProgressBar.render(50, 100, null);
        assertTrue(result.contains("50%"), result);
    }

    @Test
    @DisplayName("render(100, 100, null) → 100%")
    void renderHundredPercent() {
        String result = ProgressBar.render(100, 100, null);
        assertTrue(result.contains("100%"), result);
    }

    @Test
    @DisplayName("render(1, 3, null) → ~33% 含百分比符号")
    void renderOneThird() {
        String result = ProgressBar.render(1, 3, null);
        assertTrue(result.contains("%"), result);
    }

    @Test
    @DisplayName("render 含 label")
    void renderWithLabel() {
        String result = ProgressBar.render(75, 100, "迁移");
        assertTrue(result.contains("迁移"), result);
        assertTrue(result.contains("75%"), result);
    }

    @Test
    @DisplayName("render(5, 100, null) → 5%")
    void renderSmallProgress() {
        String result = ProgressBar.render(5, 100, null);
        assertTrue(result.contains("5%"), result);
    }

    @Test
    @DisplayName("total=0 时不抛异常")
    void renderZeroTotalDoesNotThrow() {
        assertDoesNotThrow(() -> ProgressBar.render(0, 0, null));
    }

    @Test
    @DisplayName("负值 current 不抛异常")
    void renderNegativeCurrentDoesNotThrow() {
        assertDoesNotThrow(() -> ProgressBar.render(-1, 100, null));
    }
}
