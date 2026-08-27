package com.example.demo.modules.cageshelf.support;

import com.example.demo.modules.cageshelf.support.SpecialStatusComputer.SpecialStatusEntry;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 合笼 0/1 综合判定（closingdate + rescindDatetime）口径校验。
 * 覆盖两个消费方：aro_field_mapping.json 的 cohabitationActive 计算规则（经 applyPull）
 * 与 SpecialStatusComputer 网格合笼标记。两处逻辑必须一致。
 */
class CohabitationActiveMappingTest {

    private final CageFieldMappingService mapping = new CageFieldMappingService();

    private Map<String, Object> cage(String closing, String rescind) {
        Map<String, Object> raw = new LinkedHashMap<>();
        raw.put("id", 1001L);
        Map<String, Object> cvo = new LinkedHashMap<>();
        if (closing != null) cvo.put("closingdate", closing);
        if (rescind != null) cvo.put("rescindDatetime", rescind);
        raw.put("cageBoxVo", cvo);
        return raw;
    }

    @Test
    void mapping_loadsVersion6() {
        mapping.load();
        assertEquals("6", mapping.getVersion());
    }

    @Test
    void closingOnly_cohabitationActive() {
        mapping.load();
        Map<String, Object> mapped = mapping.applyPull("list", cage("2026-07-10 00:00:00", null));
        assertEquals(Boolean.TRUE, mapped.get("needs_cohabitation"));
    }

    @Test
    void rescindAfterClosing_cancelled() {
        mapping.load();
        Map<String, Object> mapped = mapping.applyPull("list",
                cage("2026-03-07 00:00:00", "2026-03-10 00:00:00"));
        assertEquals(Boolean.FALSE, mapped.get("needs_cohabitation"));
    }

    @Test
    void rescindBeforeClosing_reEstablishedActive() {
        mapping.load();
        Map<String, Object> mapped = mapping.applyPull("list",
                cage("2026-03-07 00:00:00", "2026-02-25 00:00:00"));
        assertEquals(Boolean.TRUE, mapped.get("needs_cohabitation"));
    }

    @Test
    void noClosing_notActive() {
        mapping.load();
        Map<String, Object> mapped = mapping.applyPull("list", cage(null, null));
        assertEquals(Boolean.FALSE, mapped.get("needs_cohabitation"));
    }

    @Test
    void noCageBoxVo_skipNotWrite() {
        mapping.load();
        Map<String, Object> raw = new LinkedHashMap<>();
        raw.put("id", 1002L);
        Map<String, Object> mapped = mapping.applyPull("list", raw);
        assertFalse(mapped.containsKey("needs_cohabitation"), "cageBoxVo 缺失不应写入，保留旧值");
    }

    @Test
    void bookEndpoint_noCageBoxVo_skipNotWrite() {
        mapping.load();
        Map<String, Object> raw = new LinkedHashMap<>();
        raw.put("id", 1003L);
        Map<String, Object> mapped = mapping.applyPull("book", raw);
        assertFalse(mapped.containsKey("needs_cohabitation"), "/book 无 cageBoxVo，不应判定合笼");
    }

    // ── SpecialStatusComputer 网格合笼标记（口径一致）──

    @Test
    void statusComputer_closingOnly_cohabitation() {
        List<SpecialStatusEntry> statuses = SpecialStatusComputer.compute(cageBoxOf("2026-07-10 00:00:00", null));
        assertTrue(hasCode(statuses, SpecialStatusComputer.CODE_COHABITATION));
    }

    @Test
    void statusComputer_rescindAfterClosing_notCohabitation() {
        List<SpecialStatusEntry> statuses = SpecialStatusComputer.compute(
                cageBoxOf("2026-03-07 00:00:00", "2026-03-10 00:00:00"));
        assertFalse(hasCode(statuses, SpecialStatusComputer.CODE_COHABITATION));
    }

    @Test
    void statusComputer_rescindBeforeClosing_cohabitation() {
        List<SpecialStatusEntry> statuses = SpecialStatusComputer.compute(
                cageBoxOf("2026-03-07 00:00:00", "2026-02-25 00:00:00"));
        assertTrue(hasCode(statuses, SpecialStatusComputer.CODE_COHABITATION));
    }

    private Map<String, Object> cageBoxOf(String closing, String rescind) {
        Map<String, Object> cvo = new LinkedHashMap<>();
        if (closing != null) cvo.put("closingdate", closing);
        if (rescind != null) cvo.put("rescindDatetime", rescind);
        return cvo;
    }

    private boolean hasCode(List<SpecialStatusEntry> statuses, String code) {
        return statuses.stream().anyMatch(s -> code.equals(s.getCode()));
    }
}
