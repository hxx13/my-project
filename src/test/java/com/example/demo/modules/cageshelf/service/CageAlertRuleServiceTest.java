package com.example.demo.modules.cageshelf.service;

import com.example.demo.modules.cageshelf.entity.CageInfoCodelist;
import com.example.demo.modules.cageshelf.entity.CageInfoCodelistItem;
import com.example.demo.modules.cageshelf.mapper.CageAlertRuleMapper;
import com.example.demo.modules.cageshelf.mapper.CageInfoCodelistItemMapper;
import com.example.demo.modules.cageshelf.mapper.CageInfoCodelistMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/**
 * 阈值解析的核心回归：回答「某笼位某状态现在生效的告警规则是什么」。
 *
 * ① 层级就近 ROOM &gt; FLOOR &gt; CAMPUS &gt; 全局默认，命中最近一级即用；
 * ② 「配过」= 该级有该 (区域,状态) 的行（哪怕全是 enabled=0），不回落；
 * ③ 同一区域多个饲养组长：并集取向（enabled 任一开即开、阈值取最小、动作取并集）。
 */
@ExtendWith(MockitoExtension.class)
class CageAlertRuleServiceTest {

    private static final String DIVIDE = "NEED_DIVIDE";

    @Mock private CageAlertRuleMapper mapper;
    @Mock private CageRegionCapabilityService regionCapabilityService;
    @Mock private CageInfoCodelistMapper codelistMapper;
    @Mock private CageInfoCodelistItemMapper codelistItemMapper;

    private CageAlertRuleService service;

    @BeforeEach
    void setUp() {
        service = new CageAlertRuleService(mapper, regionCapabilityService, codelistMapper, codelistItemMapper);
    }

    /** 标准三级区域键（ROOM 100 / FLOOR 10 / CAMPUS 1）。 */
    private static List<Map<String, String>> trio() {
        return List.of(
                Map.of("regionType", "ROOM", "regionId", "100"),
                Map.of("regionType", "FLOOR", "regionId", "10"),
                Map.of("regionType", "CAMPUS", "regionId", "1"));
    }

    private static Map<String, Object> rule(String type, String id, String status,
                                            int threshold, String action, int enabled) {
        return Map.of("regionType", type, "regionId", id, "statusCode", status,
                "thresholdDays", threshold, "action", action, "enabled", enabled);
    }

    private static Map<String, Object> def(String status, int threshold, String action, int enabled) {
        return Map.of("statusCode", status, "thresholdDays", threshold, "action", action, "enabled", enabled);
    }

    private static Map<String, Map<String, Object>> defaults(Map<String, Object>... rows) {
        Map<String, Map<String, Object>> out = new java.util.LinkedHashMap<>();
        for (Map<String, Object> r : rows) out.put((String) r.get("statusCode"), r);
        return out;
    }

    private CageAlertRuleService.EffectiveAlertRule resolve(List<Map<String, String>> keys, String status,
                                                            List<Map<String, Object>> regionRules,
                                                            Map<String, Map<String, Object>> defaults) {
        return CageAlertRuleService.resolveOne(keys, status, regionRules, defaults);
    }

    /** 带计时起点的区域行（不带方向的 rule(...) 走「缺项回落 1」那条，正好拿来验证默认）。 */
    private static Map<String, Object> ruleWithDir(String type, String id, String status,
                                                   int threshold, String action, int enabled, int startValue) {
        Map<String, Object> m = new java.util.LinkedHashMap<>();
        m.put("regionType", type);
        m.put("regionId", id);
        m.put("statusCode", status);
        m.put("thresholdDays", threshold);
        m.put("action", action);
        m.put("enabled", enabled);
        m.put("startValue", startValue);
        return m;
    }

    // ── 计时起点（方向）──

    /** 区域行带 startValue=0 → 生效规则的方向就是反向（区域覆盖全局的一部分）。 */
    @Test
    void regionStartValueFlowsIntoEffectiveRule() {
        CageAlertRuleService.EffectiveAlertRule r = resolve(trio(), "NEED_DIVIDE",
                List.of(ruleWithDir("ROOM", "100", "NEED_DIVIDE", 7, "HIGHLIGHT", 1, 0)),
                defaults(def("NEED_DIVIDE", 7, "HIGHLIGHT", 1)));

        assertTrue(r.enabled());
        assertFalse(r.startValue(), "区域配成 0 → 起点是出现 0");
    }

    /** 没配过任何一级 → 取全局默认的方向；行里**缺** startValue（老数据）也回落 1，绝不翻成反向。 */
    @Test
    void missingStartValueFallsBackToOne() {
        CageAlertRuleService.EffectiveAlertRule r = resolve(trio(), "NEED_DIVIDE", List.of(),
                defaults(def("NEED_DIVIDE", 7, "HIGHLIGHT", 1)));

        assertTrue(r.startValue(), "缺 startValue 一律按 1（出现 1 开始 = 现状语义）");
    }

    /** 同级多行方向一致 → 取该值；阈值仍按并集取最小。 */
    @Test
    void multiLeaderSameStartValueIsUsed() {
        CageAlertRuleService.EffectiveAlertRule r = resolve(trio(), "NEED_DIVIDE",
                List.of(ruleWithDir("ROOM", "100", "NEED_DIVIDE", 7, "HIGHLIGHT", 1, 0),
                        ruleWithDir("ROOM", "100", "NEED_DIVIDE", 9, "BOTH", 1, 0)),
                defaults(def("NEED_DIVIDE", 7, "HIGHLIGHT", 1)));

        assertFalse(r.startValue());
        assertEquals(7, r.thresholdDays(), "阈值仍取最小");
    }

    /** 同级方向真出现分歧（保存链本应拦住）：取先出现的那个并打 warn，不做「取最小/取或」。 */
    @Test
    void multiLeaderConflictingStartValueTakesFirst() {
        CageAlertRuleService.EffectiveAlertRule r = resolve(trio(), "NEED_DIVIDE",
                List.of(ruleWithDir("ROOM", "100", "NEED_DIVIDE", 7, "HIGHLIGHT", 1, 0),
                        ruleWithDir("ROOM", "100", "NEED_DIVIDE", 9, "BOTH", 1, 1)),
                defaults(def("NEED_DIVIDE", 7, "HIGHLIGHT", 1)));

        assertFalse(r.startValue(), "取先出现那行（0）");
    }

    // ── 层级就近 ──

    @Test
    void roomLevelConfiguredWinsOverFloorAndCampus() {
        var r = resolve(trio(), DIVIDE,
                List.of(rule("ROOM", "100", DIVIDE, 2, "HIGHLIGHT", 1),
                        rule("FLOOR", "10", DIVIDE, 5, "VIOLATION", 1),
                        rule("CAMPUS", "1", DIVIDE, 9, "BOTH", 1)),
                defaults(def(DIVIDE, 7, "HIGHLIGHT", 1)));
        assertTrue(r.enabled());
        assertEquals(2, r.thresholdDays());
        assertTrue(r.highlight());
        assertFalse(r.violation());
    }

    @Test
    void floorLevelConfiguredUsedWhenNoRoom() {
        var r = resolve(trio(), DIVIDE,
                List.of(rule("FLOOR", "10", DIVIDE, 4, "HIGHLIGHT", 1)),
                defaults(def(DIVIDE, 7, "HIGHLIGHT", 1)));
        assertTrue(r.enabled());
        assertEquals(4, r.thresholdDays());
    }

    @Test
    void campusLevelConfiguredUsedWhenNoRoomOrFloor() {
        var r = resolve(trio(), DIVIDE,
                List.of(rule("CAMPUS", "1", DIVIDE, 6, "VIOLATION", 1)),
                defaults(def(DIVIDE, 7, "HIGHLIGHT", 1)));
        assertTrue(r.enabled());
        assertEquals(6, r.thresholdDays());
        assertTrue(r.violation());
    }

    @Test
    void allThreeConfiguredRoomWins() {
        var r = resolve(trio(), DIVIDE,
                List.of(rule("ROOM", "100", DIVIDE, 1, "HIGHLIGHT", 1),
                        rule("FLOOR", "10", DIVIDE, 3, "VIOLATION", 1),
                        rule("CAMPUS", "1", DIVIDE, 5, "BOTH", 1)),
                defaults(def(DIVIDE, 7, "HIGHLIGHT", 1)));
        assertEquals(1, r.thresholdDays(), "三级都配 → 房间级胜出");
    }

    // ── 回落与 fail-closed ──

    @Test
    void nothingConfiguredFallsBackToGlobalDefault() {
        var r = resolve(trio(), DIVIDE, List.of(),
                defaults(def(DIVIDE, 7, "HIGHLIGHT", 1)));
        assertTrue(r.enabled());
        assertEquals(7, r.thresholdDays());
        assertTrue(r.highlight());
        assertFalse(r.violation());
    }

    @Test
    void globalDefaultDisabledMeansNoAlert() {
        var r = resolve(trio(), DIVIDE, List.of(),
                defaults(def(DIVIDE, 7, "HIGHLIGHT", 0)));
        assertFalse(r.enabled());
    }

    @Test
    void missingGlobalDefaultFailsClosed() {
        var r = resolve(trio(), DIVIDE, List.of(), Map.of());
        assertFalse(r.enabled(), "全局默认缺该状态 → fail-closed 不告警");
        assertEquals(0, r.thresholdDays());
        assertFalse(r.highlight());
        assertFalse(r.violation());
    }

    // ── 多组长并集 ──

    @Test
    void multiLeaderThresholdTakesMin() {
        var r = resolve(trio(), DIVIDE,
                List.of(rule("ROOM", "100", DIVIDE, 3, "HIGHLIGHT", 1),
                        rule("ROOM", "100", DIVIDE, 5, "HIGHLIGHT", 1)),
                defaults(def(DIVIDE, 7, "HIGHLIGHT", 1)));
        assertTrue(r.enabled());
        assertEquals(3, r.thresholdDays(), "同一区域多组长阈值 3 和 5 → 取更早告警的 3");
    }

    @Test
    void multiLeaderOneDisabledOneEnabledIsOn() {
        var r = resolve(trio(), DIVIDE,
                List.of(rule("ROOM", "100", DIVIDE, 5, "HIGHLIGHT", 0),
                        rule("ROOM", "100", DIVIDE, 3, "HIGHLIGHT", 1)),
                defaults(def(DIVIDE, 7, "HIGHLIGHT", 1)));
        assertTrue(r.enabled(), "任一行 enabled=1 即为开");
        assertEquals(3, r.thresholdDays(), "关闭行不参与阈值并集，取开着那行的 3");
    }

    @Test
    void multiLeaderActionUnionHighlightPlusViolation() {
        var r = resolve(trio(), DIVIDE,
                List.of(rule("ROOM", "100", DIVIDE, 3, "HIGHLIGHT", 1),
                        rule("ROOM", "100", DIVIDE, 5, "VIOLATION", 1)),
                defaults(def(DIVIDE, 7, "HIGHLIGHT", 1)));
        assertTrue(r.highlight());
        assertTrue(r.violation(), "一行 HIGHLIGHT 一行 VIOLATION → 动作取并集");
    }

    @Test
    void configuredButAllDisabledDoesNotFallBackToDefault() {
        // 全局默认是开的，但房间级「配过且全关」必须仍是不告警——否则组长永远关不掉。
        var r = resolve(trio(), DIVIDE,
                List.of(rule("ROOM", "100", DIVIDE, 5, "HIGHLIGHT", 0),
                        rule("ROOM", "100", DIVIDE, 9, "VIOLATION", 0)),
                defaults(def(DIVIDE, 7, "HIGHLIGHT", 1)));
        assertFalse(r.enabled(), "配过但全关 = 本区不告警，不能回落全局默认");
        assertFalse(r.highlight());
        assertFalse(r.violation());
    }

    // ── 批量入口 ──

    @Test
    void resolveForCagesReturnsFiveStatusesPerCage() {
        when(regionCapabilityService.regionsOfCages(List.of(1L, 2L))).thenReturn(Map.of(
                1L, trio(),
                2L, trio()));
        when(mapper.listRegionRules(any())).thenReturn(List.of(
                rule("ROOM", "100", DIVIDE, 2, "HIGHLIGHT", 1)));
        when(mapper.listDefaultRules()).thenReturn(List.of(
                def("NEED_DIVIDE", 7, "HIGHLIGHT", 1),
                def("SPECIAL_FEEDING", 7, "HIGHLIGHT", 1),
                def("ANIMAL_TRANSFER", 7, "HIGHLIGHT", 1),
                def("HEALTH_ABNORMAL", 7, "HIGHLIGHT", 1),
                def("COHABITATION", 7, "HIGHLIGHT", 1)));

        Map<Long, List<CageAlertRuleService.EffectiveAlertRule>> out = service.resolveForCages(List.of(1L, 2L));

        assertEquals(2, out.size());
        assertEquals(5, out.get(1L).size(), "每个笼位都必须回五个状态");
        assertEquals(5, out.get(2L).size());
        assertEquals(CageAlertRuleService.STATUS_CODES.size(), out.get(1L).size());
    }

    // ── 中文名 ──

    @Test
    void labelOfDetailStatusResolvesFromCodelist() {
        CageInfoCodelist cl = new CageInfoCodelist();
        cl.setId(9L);
        CageInfoCodelistItem feed = new CageInfoCodelistItem();
        feed.setItemCode("FEED");
        feed.setItemLabel("需喂食");
        when(codelistMapper.selectByCode(CageStatusIntervalService.DETAIL_DICT_CODE)).thenReturn(cl);
        when(codelistItemMapper.selectByCodelistId(9L)).thenReturn(List.of(feed));

        assertEquals("需分笼", service.labelOf("NEED_DIVIDE"), "五个状态仍走静态表");
        assertEquals("需喂食", service.labelOf("SF_FEED"), "明细码查码表");
        assertEquals("SF_NOPE", service.labelOf("SF_NOPE"), "码表里没有就退回码本身，不静默成空串");
    }
}
