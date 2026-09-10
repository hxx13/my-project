package com.example.demo.modules.cageshelf.service;

import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 字段候选能力的核心逻辑：候选合并规则 + 新增预设的落点决策。
 *
 * 这两个都是纯函数（不碰 IO），所以直接测，不需要起 Spring 或 mock 那一堆 Mapper。
 * 覆盖的关键风险：
 *  - restrictToAup 开/关时 AUP 白名单是「独占」还是「并集」
 *  - 白名单与码表都空时不能把候选变成空（全局兜底）
 */
class CageOperationServiceFieldOptionsTest {

    private static LinkedHashMap<String, String> items(String... names) {
        LinkedHashMap<String, String> m = new LinkedHashMap<>();
        for (String n : names) m.put(n, n);
        return m;
    }

    private static final CageOperationService.GlobalSupplier NO_GLOBAL = LinkedHashMap::new;

    private static List<String> valuesOf(CageOperationService.MergedOptions r) {
        return r.options().stream().map(o -> String.valueOf(o.get("value"))).toList();
    }

    // ══════════════ 候选合并 ══════════════

    @Test
    void 受AUP限制时_白名单独占_码表不并入() {
        var r = CageOperationService.mergeOptions(
                items("ICR", "C57BL/6"), items("码表里的别的"),
                NO_GLOBAL,
                new CageOperationService.FieldCfg("ANIMAL_STRAIN", true, true, true));
        assertEquals(List.of("ICR", "C57BL/6"), valuesOf(r));
        assertEquals("AUP_ALLOWLIST", r.source());
    }

    @Test
    void 不受AUP限制时_白名单与码表取并集() {
        var r = CageOperationService.mergeOptions(
                items("ICR"), items("C57BL/6"),
                NO_GLOBAL,
                new CageOperationService.FieldCfg("ANIMAL_STRAIN", false, true, true));
        assertEquals(List.of("ICR", "C57BL/6"), valuesOf(r));
        assertEquals("MERGED", r.source());
    }

    @Test
    void 受AUP限制但白名单为空_退回码表() {
        var r = CageOperationService.mergeOptions(
                items(), items("C57BL/6"),
                NO_GLOBAL,
                new CageOperationService.FieldCfg("ANIMAL_STRAIN", true, true, true));
        assertEquals(List.of("C57BL/6"), valuesOf(r));
        assertEquals("CODELIST", r.source());
    }

    @Test
    void 白名单与码表都空_走全局兜底_候选不为空() {
        var r = CageOperationService.mergeOptions(
                items(), items(),
                () -> items("默认品系"),
                new CageOperationService.FieldCfg("ANIMAL_STRAIN", true, true, true));
        assertEquals(List.of("默认品系"), valuesOf(r));
        assertEquals("GLOBAL", r.source());
    }

    @Test
    void 三个来源都空_候选为空且来源标记为NONE() {
        var r = CageOperationService.mergeOptions(
                items(), items(),
                NO_GLOBAL,
                new CageOperationService.FieldCfg("ANIMAL_STRAIN", true, true, true));
        assertTrue(valuesOf(r).isEmpty());
        assertEquals("NONE", r.source());
    }

    @Test
    void 全局兜底是懒查的_前两个来源非空时不该触发() {
        var r = CageOperationService.mergeOptions(
                items("ICR"), items(),
                () -> {
                    throw new AssertionError("前两个来源非空时不应查全局参考数据");
                },
                new CageOperationService.FieldCfg("ANIMAL_STRAIN", true, true, true));
        assertEquals(List.of("ICR"), valuesOf(r));
    }

    @Test
    void 同名的白名单项与码表项只出现一次() {
        var r = CageOperationService.mergeOptions(
                items("ICR"), items("ICR"),
                NO_GLOBAL,
                new CageOperationService.FieldCfg("ANIMAL_STRAIN", false, true, true));
        assertEquals(List.of("ICR"), valuesOf(r));
    }

    @Test
    void 每个选项都带value与label() {
        var r = CageOperationService.mergeOptions(
                items("ICR"), items(),
                NO_GLOBAL,
                new CageOperationService.FieldCfg("ANIMAL_STRAIN", true, true, true));
        for (Map<String, Object> o : r.options()) {
            assertEquals(o.get("value"), o.get("label"));
        }
    }

    // ══════════════ 新增预设的落点 ══════════════

    @Test
    void 受AUP限制且白名单非空_新增写到该AUP() {
        assertTrue(CageOperationService.writesToAup(
                new CageOperationService.FieldCfg("ANIMAL_STRAIN", true, true, true), true));
    }

    @Test
    void 受AUP限制但白名单为空_新增写到字段码表() {
        assertFalse(CageOperationService.writesToAup(
                new CageOperationService.FieldCfg("ANIMAL_STRAIN", true, true, true), false));
    }

    @Test
    void 不受AUP限制_新增一律写到字段码表() {
        assertFalse(CageOperationService.writesToAup(
                new CageOperationService.FieldCfg("ANIMAL_STRAIN", false, true, true), true));
    }

    // ══════════════ 字段 config 解析 ══════════════

    @Test
    void config为空_用安全默认值_且新增预设默认关闭() {
        var cfg = CageOperationService.parseFieldConfig(null);
        assertNull(cfg.refType());
        assertTrue(cfg.restrictToAup(), "默认保持既有语义：受 AUP 限制");
        assertFalse(cfg.allowManualInput());
        assertFalse(cfg.allowAddOption(), "新增预设是逐字段显式授权，必须默认关");
    }

    @Test
    void optionsSource按AUP_前缀推导refType() {
        var cfg = CageOperationService.parseFieldConfig("{\"optionsSource\":\"AUP_ANIMAL_STRAIN\"}");
        assertEquals("ANIMAL_STRAIN", cfg.refType());
    }

    @Test
    void 非AUP来源的optionsSource不推导refType() {
        var cfg = CageOperationService.parseFieldConfig("{\"optionsSource\":\"MY_CODELIST\"}");
        assertNull(cfg.refType());
    }

    @Test
    void 显式开关被读取() {
        var cfg = CageOperationService.parseFieldConfig(
                "{\"optionsSource\":\"AUP_ANIMAL_STRAIN\",\"restrictToAup\":false,\"allowManualInput\":true,\"allowAddOption\":true}");
        assertEquals("ANIMAL_STRAIN", cfg.refType());
        assertFalse(cfg.restrictToAup());
        assertTrue(cfg.allowManualInput());
        assertTrue(cfg.allowAddOption());
    }

    @Test
    void config是坏JSON_不抛异常_退回默认值() {
        var cfg = CageOperationService.parseFieldConfig("{不是 JSON");
        assertNull(cfg.refType());
        assertTrue(cfg.restrictToAup());
        assertFalse(cfg.allowAddOption());
    }
}
