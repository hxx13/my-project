package com.example.demo.common.text;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class BlockTitleTest {

    @Test
    @DisplayName("render('TWIN') 输出 6 行等宽字形")
    void renderTwinGivesSixEqualWidthRows() {
        List<String> lines = BlockTitle.render("TWIN");
        assertEquals(BlockTitle.HEIGHT, lines.size());
        int width = lines.get(0).length();
        for (String line : lines) {
            assertEquals(width, line.length(), "每行列数必须一致，否则框线对不齐: [" + line + "]");
        }
    }

    @Test
    @DisplayName("未收录字符回退为单行原文（调用方据此走纯文本分支）")
    void unknownCharFallsBackToSingleLine() {
        List<String> lines = BlockTitle.render("TWIN🎉");
        assertEquals(1, lines.size());
        assertEquals("TWIN🎉", lines.get(0));
    }

    @Test
    @DisplayName("空串/null 返回空列表")
    void emptyInputGivesEmptyList() {
        assertTrue(BlockTitle.render("").isEmpty());
        assertTrue(BlockTitle.render(null).isEmpty());
    }
}
