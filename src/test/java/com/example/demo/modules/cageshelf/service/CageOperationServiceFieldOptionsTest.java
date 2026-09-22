package com.example.demo.modules.cageshelf.service;

import com.example.demo.modules.cageshelf.entity.CageInfoField;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 字段候选能力的核心逻辑：候选合并规则 + 新增预设的落点键。
 *
 * 这两个都是纯函数（不碰 IO），所以直接测，不需要起 Spring 或 mock 那一堆 Mapper。
 * 覆盖的关键风险：
 *  - AUP 白名单与字段自己的码表**必须是并集**：新增预设只写码表，排除掉它「新增」就成了空话
 *  - 两条腿都空时不能把候选变成空（全局兜底）
 *  - 没绑 dict_key 的字段（动物品系）新增时得有个稳定的落点键
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

    private static CageInfoField field(String canonical, String dictKey) {
        CageInfoField f = new CageInfoField();
        f.setCanonical(canonical);
        f.setDictKey(dictKey);
        return f;
    }

    // ══════════════ 候选合并 ══════════════

    /** 白名单与码表是两条腿，缺一条都是错的：码表这腿装着用户自己新增的候选。 */
    @Test
    void 白名单与字段码表始终取并集() {
        var r = CageOperationService.mergeOptions(
                items("ICR", "C57BL/6"), items("我自己加的品系"), NO_GLOBAL);
        assertEquals(List.of("ICR", "C57BL/6", "我自己加的品系"), valuesOf(r));
        assertEquals("MERGED", r.source());
    }

    /** 用户报的那条：AUP 白名单为空时新增的候选必须看得见。 */
    @Test
    void 白名单为空_新增的候选仍然出现在候选里() {
        var r = CageOperationService.mergeOptions(
                items(), items("NK 小鼠"), NO_GLOBAL);
        assertEquals(List.of("NK 小鼠"), valuesOf(r));
        assertEquals("CODELIST", r.source());
    }

    @Test
    void 白名单与码表都空_走全局兜底_候选不为空() {
        var r = CageOperationService.mergeOptions(
                items(), items(), () -> items("默认品系"));
        assertEquals(List.of("默认品系"), valuesOf(r));
        assertEquals("GLOBAL", r.source());
    }

    @Test
    void 三个来源都空_候选为空且来源标记为NONE() {
        var r = CageOperationService.mergeOptions(items(), items(), NO_GLOBAL);
        assertTrue(valuesOf(r).isEmpty());
        assertEquals("NONE", r.source());
    }

    @Test
    void 全局兜底是懒查的_前两个来源非空时不该触发() {
        var r = CageOperationService.mergeOptions(
                items("ICR"), items(),
                () -> {
                    throw new AssertionError("前两个来源非空时不应查全局参考数据");
                });
        assertEquals(List.of("ICR"), valuesOf(r));
    }

    @Test
    void 同名的白名单项与码表项只出现一次() {
        var r = CageOperationService.mergeOptions(items("ICR"), items("ICR"), NO_GLOBAL);
        assertEquals(List.of("ICR"), valuesOf(r));
    }

    @Test
    void 每个选项都带value与label() {
        var r = CageOperationService.mergeOptions(items("ICR"), items("BALB/c"), NO_GLOBAL);
        for (Map<String, Object> o : r.options()) {
            assertEquals(o.get("value"), o.get("label"));
        }
    }

    // ══════════════ 新增预设的落点键 ══════════════

    @Test
    void 绑了dictKey_新增落到该码表() {
        assertEquals("special_feeding_detail", CageOperationService.codelistKeyOf(field("special_feeding_details", "special_feeding_detail")));
    }

    /** 动物品系 dict_key 一直是空的（候选原先只来自 AUP 白名单），新增得有地方落。 */
    @Test
    void 没绑dictKey_新增落到canonical同名码表() {
        assertEquals("animal_strain_name", CageOperationService.codelistKeyOf(field("animal_strain_name", null)));
    }

    @Test
    void dictKey是空白串_同样退回canonical() {
        assertEquals("animal_strain_name", CageOperationService.codelistKeyOf(field("animal_strain_name", "   ")));
    }

    @Test
    void dictKey带空白_去掉后再用() {
        assertEquals("special_feeding_detail", CageOperationService.codelistKeyOf(field("x", "  special_feeding_detail  ")));
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
