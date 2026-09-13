package com.example.demo.modules.cageshelf.service;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * {@link CageAlertViolationService#matchesGroupWhitelist} 的空白名单口径回归。
 *
 * <p>前端 {@code serializeCageFields} 把空数组序列化成 {@code "[]"} 入库，此前该方法只把 null/blank
 * 当「不限课题组」，{@code "[]"} 一路落到逗号兜底后恒返回 false——告警照建但 violation_id 恒 NULL、
 * 自动发违规整条链静默断掉。这里钉死：所有「空的白名单」形态都必须返回 true。
 */
class CageAlertViolationServiceTest {

    private static final String LUJIN = "卢今";

    @Test
    void emptyArrayMeansUnrestricted() {
        assertTrue(CageAlertViolationService.matchesGroupWhitelist("[]", LUJIN));
    }

    @Test
    void blankStringMeansUnrestricted() {
        assertTrue(CageAlertViolationService.matchesGroupWhitelist("", LUJIN));
    }

    @Test
    void nullJsonMeansUnrestricted() {
        assertTrue(CageAlertViolationService.matchesGroupWhitelist(null, LUJIN));
    }

    @Test
    void literalNullStringMeansUnrestricted() {
        assertTrue(CageAlertViolationService.matchesGroupWhitelist("null", LUJIN));
    }

    @Test
    void whitespaceArrayMeansUnrestricted() {
        assertTrue(CageAlertViolationService.matchesGroupWhitelist("[ ]", LUJIN));
    }

    @Test
    void onlyWhitespaceTokensMeansUnrestricted() {
        assertTrue(CageAlertViolationService.matchesGroupWhitelist(" , ", LUJIN));
    }

    @Test
    void singleEntryHit() {
        assertTrue(CageAlertViolationService.matchesGroupWhitelist("[\"卢今\"]", LUJIN));
    }

    @Test
    void singleEntryMiss() {
        assertFalse(CageAlertViolationService.matchesGroupWhitelist("[\"张三\"]", LUJIN));
    }

    @Test
    void multiEntryHit() {
        assertTrue(CageAlertViolationService.matchesGroupWhitelist("[\"张三\",\"卢今\"]", LUJIN));
    }

    @Test
    void commaSeparatedHit() {
        assertTrue(CageAlertViolationService.matchesGroupWhitelist("张三,卢今", LUJIN));
    }

    @Test
    void commaSeparatedMiss() {
        assertFalse(CageAlertViolationService.matchesGroupWhitelist("张三", LUJIN));
    }
}
