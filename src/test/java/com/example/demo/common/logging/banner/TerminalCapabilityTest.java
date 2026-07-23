package com.example.demo.common.logging.banner;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class TerminalCapabilityTest {

    @Test
    @DisplayName("isTty/hasAnsi/hasUnicode 返回 boolean")
    void allQueriesReturnBoolean() {
        assertDoesNotThrow(TerminalCapability::isTty);
        assertDoesNotThrow(TerminalCapability::hasAnsi);
        assertDoesNotThrow(TerminalCapability::hasUnicode);
    }

    @Test
    @DisplayName("detectedCharset() 返回非空字符串")
    void detectedCharsetReturnsNonEmpty() {
        String cs = TerminalCapability.detectedCharset();
        assertNotNull(cs);
        assertFalse(cs.isEmpty());
        assertNotEquals("unknown", cs);
    }

    @Test
    @DisplayName("静态字段多次调用一致")
    void staticFieldsAreConsistent() {
        assertEquals(TerminalCapability.isTty(), TerminalCapability.isTty());
        assertEquals(TerminalCapability.hasAnsi(), TerminalCapability.hasAnsi());
        assertEquals(TerminalCapability.hasUnicode(), TerminalCapability.hasUnicode());
        assertEquals(TerminalCapability.detectedCharset(), TerminalCapability.detectedCharset());
    }

    @Test
    @DisplayName("CyberColor 委托与 TerminalCapability 一致")
    void cyberColorDelegatesCorrectly() {
        assertEquals(TerminalCapability.isTty(), CyberColor.isTty());
        assertEquals(TerminalCapability.hasAnsi(), CyberColor.hasAnsi());
        assertEquals(TerminalCapability.hasUnicode(), CyberColor.hasUnicode());
    }

    @Test
    @DisplayName("CyberColor 颜色常量非 null")
    void cyberColorConstantsAreNonNull() {
        assertNotNull(CyberColor.RESET);
        assertNotNull(CyberColor.GREEN);
        assertNotNull(CyberColor.CYAN);
        assertNotNull(CyberColor.MAGENTA);
        assertNotNull(CyberColor.RED);
        assertNotNull(CyberColor.AMBER);
        assertNotNull(CyberColor.GRAY);
        assertNotNull(CyberColor.WHITE);
    }

    @Test
    @DisplayName("CyberColor.green() 含原始文本")
    void greenModifierWrapsContent() {
        String result = CyberColor.green("hello");
        assertTrue(result.contains("hello"));
    }
}
