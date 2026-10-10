package com.example.demo.modules.telemetry.util;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * 与 telemetry_value_archive 同一套解析语义：取原始串**前缀数字**，取不到返回 null。
 * 别改成 Double.valueOf —— 采上来的值常带单位后缀（"23.5 C"、"-1.2Pa"），
 * Double.valueOf 会抛异常，等于把整轮采样带崩。
 */
class TelemetryNumericParseUtilTest {

    @Test
    void parsesLeadingNumber() {
        assertEquals(23.5, TelemetryNumericParseUtil.parseNumeric("23.5 C"), 1e-9);
        assertEquals(-1.2, TelemetryNumericParseUtil.parseNumeric("-1.2Pa"), 1e-9);
        assertEquals(50.0, TelemetryNumericParseUtil.parseNumeric("50"), 1e-9);
        assertEquals(7.0, TelemetryNumericParseUtil.parseNumeric("7."), 1e-9);
    }

    /** 现网归档链会先把逗号归一成小数点，别把这条语义弄丢。 */
    @Test
    void normalizesCommaDecimal() {
        assertEquals(1.5, TelemetryNumericParseUtil.parseNumeric("1,5"), 1e-9);
    }

    /** 正则只认「数字开头」；纯小数（.5）走 parseDouble 兜底，别当成 null。 */
    @Test
    void fallsBackToPlainParseDouble() {
        assertEquals(0.5, TelemetryNumericParseUtil.parseNumeric(".5"), 1e-9);
    }

    @Test
    void returnsNullWhenNoLeadingNumber() {
        assertNull(TelemetryNumericParseUtil.parseNumeric(null));
        assertNull(TelemetryNumericParseUtil.parseNumeric(""));
        assertNull(TelemetryNumericParseUtil.parseNumeric("OFF"));
        assertNull(TelemetryNumericParseUtil.parseNumeric("   "));
    }
}
