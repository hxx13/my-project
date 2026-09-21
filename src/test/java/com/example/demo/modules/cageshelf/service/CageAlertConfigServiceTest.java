package com.example.demo.modules.cageshelf.service;

import com.example.demo.modules.cageshelf.entity.CageInfoCodelist;
import com.example.demo.modules.cageshelf.entity.CageInfoCodelistItem;
import com.example.demo.modules.cageshelf.entity.CageRegionGrant;
import com.example.demo.modules.cageshelf.mapper.CageAlertRuleMapper;
import com.example.demo.modules.cageshelf.mapper.CageInfoCodelistItemMapper;
import com.example.demo.modules.cageshelf.mapper.CageInfoCodelistMapper;
import com.example.demo.modules.cageshelf.mapper.CageShelfMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 告警阈值配置读写的核心回归。
 *
 * ① 区域写 = 只删自己的行（多组长并集，整片删会抹掉别人）；超管写 = 清全区域再写自己的；
 * ② 写入门槛 = 超管 OR（该区域 LEADER 行 AND cage.alert.config 能力）——能力码必须被真正消费；
 * ③ 五个状态每个都落一行（勾的 enabled=1、没勾的 0），非法值报错不静默吞。
 */
@ExtendWith(MockitoExtension.class)
class CageAlertConfigServiceTest {

    @Mock private CageAlertRuleMapper ruleMapper;
    @Mock private CageRegionGrantService regionGrantService;
    @Mock private CagePermissionService permissionService;
    @Mock private CageShelfMapper shelfMapper;
    @Mock private CageRegionCapabilityService regionCapabilityService;
    @Mock private CageInfoCodelistMapper codelistMapper;
    @Mock private CageInfoCodelistItemMapper codelistItemMapper;

    private CageAlertRuleService alertRuleService;
    private CageAlertConfigService service;

    @BeforeEach
    void setUp() {
        // 真价实货的 CageAlertRuleService（只桩住码表，未桩时=没配明细）——配置侧的
        // 「可配置清单」就该由它说了算，测的是两者口径一致，不是各测各的。
        alertRuleService = new CageAlertRuleService(ruleMapper, regionCapabilityService,
                codelistMapper, codelistItemMapper);
        service = new CageAlertConfigService(ruleMapper, regionGrantService, permissionService, shelfMapper,
                alertRuleService);
    }

    private static CageAlertConfigService.Rule rule(String code, int threshold, String action, boolean enabled) {
        return rule(code, threshold, action, enabled, 1);
    }

    private static CageAlertConfigService.Rule rule(String code, int threshold, String action, boolean enabled,
                                                    int startValue) {
        return rule(code, "DEFAULT", threshold, action, enabled, startValue);
    }

    /** 带显式通知对象的规则（健康异常两行：通知兽医 / 通知笼位所有者，各自方向与阈值可不同）。 */
    private static CageAlertConfigService.Rule rule(String code, String notifyTarget, int threshold, String action,
                                                    boolean enabled, int startValue) {
        return new CageAlertConfigService.Rule(code, notifyTarget, threshold, action, enabled, startValue);
    }

    /**
     * 全部可配置组合各一条 —— 顺序必须与 {@code CageAlertRuleService.configurableRuleKeys()} 一致：
     * 五个固定状态按 STATUS_CODES 序，健康异常展开成 VET / OCCUPANT 两行。
     */
    private static List<CageAlertConfigService.Rule> allRules() {
        return List.of(
                rule("NEED_DIVIDE", 7, "HIGHLIGHT", true),
                rule("SPECIAL_FEEDING", 7, "HIGHLIGHT", false),
                rule("ANIMAL_TRANSFER", 3, "VIOLATION", true),
                rule("HEALTH_ABNORMAL", "VET", 0, "BOTH", true, 1),
                rule("HEALTH_ABNORMAL", "OCCUPANT", 9, "BOTH", true, 0),
                rule("COHABITATION", 5, "HIGHLIGHT", false));
    }

    private static CageRegionGrant grant(String type, String id) {
        CageRegionGrant g = new CageRegionGrant();
        g.setRegionType(type);
        g.setRegionId(id);
        return g;
    }

    // ── 写：全量替换只删自己的行 ──

    @Test
    void replaceOnlyTouchesOwnRows() {
        when(permissionService.hasCapability("STAFF_A", CageAlertConfigService.CAP_ALERT_VIOLATION)).thenReturn(true);
        service.replaceRegion("ROOM", "100", allRules(), "STAFF_A", false);
        verify(ruleMapper).deleteRegionRules("ROOM", "100", "STAFF_A");
        verify(ruleMapper, never()).deleteAllRegionRules(anyString(), anyString());
        verify(ruleMapper, times(6)).insertRegionRule(anyString(), anyString(), anyString(), anyString(),
                anyInt(), anyString(), anyInt(), anyInt(), eq("STAFF_A"));
    }

    /** 超管保存 = 清掉该区域所有人的行再写自己的。 */
    @Test
    void adminSaveResetsWholeRegion() {
        service.replaceRegion("ROOM", "100", allRules(), "STAFF_ROOT", true);
        verify(ruleMapper).deleteAllRegionRules("ROOM", "100");
        verify(ruleMapper, never()).deleteRegionRules(anyString(), anyString(), anyString());
        verify(ruleMapper, times(6)).insertRegionRule(anyString(), anyString(), anyString(), anyString(),
                anyInt(), anyString(), anyInt(), anyInt(), eq("STAFF_ROOT"));
    }

    /** 关闭的行也要落（enabled=0），否则「配过但全关」变成零行 = 从未配置，组长永远关不掉。 */
    @Test
    void replaceWritesClosedRowsToo() {
        when(permissionService.hasCapability("STAFF_A", CageAlertConfigService.CAP_ALERT_VIOLATION)).thenReturn(true);
        service.replaceRegion("ROOM", "100", allRules(), "STAFF_A", false);
        verify(ruleMapper).insertRegionRule("ROOM", "100", "SPECIAL_FEEDING", "DEFAULT", 7, "HIGHLIGHT", 0, 1, "STAFF_A");
        verify(ruleMapper).insertRegionRule("ROOM", "100", "COHABITATION", "DEFAULT", 5, "HIGHLIGHT", 0, 1, "STAFF_A");
    }

    /**
     * 核心回归：动作含 VIOLATION/BOTH 但操作人没有 cage.alert.violation → 拒绝，且在删行之前拒，
     * 不能先删光再报错留下半残。
     */
    @Test
    void violationActionWithoutCapabilityIsDenied() {
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> service.replaceRegion("ROOM", "100", allRules(), "STAFF_A", false));
        assertTrue(e.getMessage().contains("违规联动"));
        verify(ruleMapper, never()).deleteRegionRules(anyString(), anyString(), anyString());
        verify(ruleMapper, never()).deleteAllRegionRules(anyString(), anyString());
    }

    // ── 计时起点（方向）──

    /**
     * 核心回归：同区域**别人**已把该状态的计时起点配成另一个方向 → 拒绝保存，
     * 且必须在删除之前拒（先删后拒会把本区既有配置删光又没写回）。
     * 阈值能取 min、动作能取并集，方向没有可合并的语义，只能拒。
     */
    @Test
    void regionStartValueConflictWithOtherLeaderIsRejectedBeforeDelete() {
        when(permissionService.hasCapability("STAFF_A", CageAlertConfigService.CAP_ALERT_VIOLATION)).thenReturn(true);
        when(ruleMapper.listRegionRules(anyList())).thenReturn(List.of(
                otherRow("NEED_DIVIDE", 1)));

        List<CageAlertConfigService.Rule> rules = List.of(
                rule("NEED_DIVIDE", 7, "HIGHLIGHT", true, 0),   // 想配成反向，与别人冲突
                rule("SPECIAL_FEEDING", 7, "HIGHLIGHT", false),
                rule("ANIMAL_TRANSFER", 3, "VIOLATION", true),
                rule("HEALTH_ABNORMAL", "VET", 0, "BOTH", true, 1),
                rule("HEALTH_ABNORMAL", "OCCUPANT", 9, "BOTH", true, 0),
                rule("COHABITATION", 5, "HIGHLIGHT", false));

        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> service.replaceRegion("ROOM", "100", rules, "STAFF_A", false));

        assertTrue(e.getMessage().contains("计时起点"), e.getMessage());
        assertTrue(e.getMessage().contains("需分笼"), e.getMessage());
        verify(ruleMapper, never()).deleteRegionRules(anyString(), anyString(), anyString());
        verify(ruleMapper, never()).deleteAllRegionRules(anyString(), anyString());
        verify(ruleMapper, never()).insertRegionRule(anyString(), anyString(), anyString(), anyString(),
                anyInt(), anyString(), anyInt(), anyInt(), anyString());
    }

    /** 同区域别人配的是**同一个**方向 → 允许；而且区域与全局默认不一致是允许的（区域可覆盖全局）。 */
    @Test
    void regionStartValueMatchingOthersIsAllowedAndWritten() {
        when(permissionService.hasCapability("STAFF_A", CageAlertConfigService.CAP_ALERT_VIOLATION)).thenReturn(true);
        when(ruleMapper.listRegionRules(anyList())).thenReturn(List.of(
                otherRow("NEED_DIVIDE", 0)));

        service.replaceRegion("ROOM", "100",
                List.of(rule("NEED_DIVIDE", 7, "HIGHLIGHT", true, 0),
                        rule("SPECIAL_FEEDING", 7, "HIGHLIGHT", false),
                        rule("ANIMAL_TRANSFER", 3, "VIOLATION", true),
                        rule("HEALTH_ABNORMAL", "VET", 0, "BOTH", true, 1),
                rule("HEALTH_ABNORMAL", "OCCUPANT", 9, "BOTH", true, 0),
                        rule("COHABITATION", 5, "HIGHLIGHT", false)),
                "STAFF_A", false);

        // 方向随行落库（这里是 0 = 出现 0 开始），没有被真值覆盖成默认 1
        verify(ruleMapper).insertRegionRule("ROOM", "100", "NEED_DIVIDE", "DEFAULT", 7, "HIGHLIGHT", 1, 0, "STAFF_A");
    }

    /** 同区域另一人的一行（configuredBy=STAFF_B），用于方向冲突判定。 */
    private static Map<String, Object> otherRow(String statusCode, int startValue) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("regionType", "ROOM");
        m.put("regionId", "100");
        m.put("statusCode", statusCode);
        m.put("thresholdDays", 7);
        m.put("action", "HIGHLIGHT");
        m.put("enabled", 1);
        m.put("startValue", startValue);
        m.put("configuredBy", "STAFF_B");
        return m;
    }

    // ── 写入门槛 ──

    @Test
    void adminBypassesRegionGate() {
        assertNull(service.manageRegionAlertError("STAFF_ROOT", true, "ROOM", "100"));
    }

    @Test
    void leaderWithCapabilityPasses() {
        when(regionGrantService.leaderRegions("STAFF_A")).thenReturn(List.of(grant("ROOM", "101")));
        when(permissionService.hasCapability("STAFF_A", CageAlertConfigService.CAP_ALERT_CONFIG)).thenReturn(true);
        when(shelfMapper.listRoomTreeRows()).thenReturn(treeRows());
        assertNull(service.manageRegionAlertError("STAFF_A", false, "ROOM", "101"));
    }

    /**
     * 核心回归：只判 LEADER 行不判能力，cage.alert.config 就成了摆设——
     * 矩阵收窄不了「哪些身份能配告警」。这里组长无能力必须被拒。
     */
    @Test
    void leaderWithoutCapabilityIsDenied() {
        when(regionGrantService.leaderRegions("STAFF_A")).thenReturn(List.of(grant("ROOM", "101")));
        when(permissionService.hasCapability("STAFF_A", CageAlertConfigService.CAP_ALERT_CONFIG)).thenReturn(false);
        when(shelfMapper.listRoomTreeRows()).thenReturn(treeRows());
        String denied = service.manageRegionAlertError("STAFF_A", false, "ROOM", "101");
        assertTrue(denied != null && denied.contains("权限"));
    }

    /** 同层房间全归我 → 该层可配（配一次整层生效，且不会碰到别人的房间）。 */
    @Test
    void leaderOwningWholeFloorCanConfigureThatFloor() {
        when(regionGrantService.leaderRegions("STAFF_A"))
                .thenReturn(List.of(grant("ROOM", "101"), grant("ROOM", "102")));
        when(permissionService.hasCapability("STAFF_A", CageAlertConfigService.CAP_ALERT_CONFIG)).thenReturn(true);
        when(shelfMapper.listRoomTreeRows()).thenReturn(treeRows());

        assertNull(service.manageRegionAlertError("STAFF_A", false, "FLOOR", "10"),
                "楼层 10 的两间房全在我名下 → 整层可配");
    }

    /** 只占一层里的部分房间 → 该层仍不可配（否则会改到别人的房间）。 */
    @Test
    void leaderOwningPartOfFloorCannotConfigureTheFloor() {
        when(regionGrantService.leaderRegions("STAFF_A")).thenReturn(List.of(grant("ROOM", "101")));
        when(shelfMapper.listRoomTreeRows()).thenReturn(treeRows());

        String denied = service.manageRegionAlertError("STAFF_A", false, "FLOOR", "10");
        assertTrue(denied != null && denied.contains("不由你负责"));
    }

    /** 校区也一样：整个校区的房间全归我才放行。 */
    @Test
    void leaderOwningWholeCampusCanConfigureThatCampus() {
        when(regionGrantService.leaderRegions("STAFF_A"))
                .thenReturn(List.of(grant("ROOM", "101"), grant("ROOM", "102"), grant("ROOM", "201")));
        when(permissionService.hasCapability("STAFF_A", CageAlertConfigService.CAP_ALERT_CONFIG)).thenReturn(true);
        when(shelfMapper.listRoomTreeRows()).thenReturn(treeRows());

        assertNull(service.manageRegionAlertError("STAFF_A", false, "CAMPUS", "1"));
        assertTrue(service.manageRegionAlertError("STAFF_A", false, "CAMPUS", "2") != null,
                "浦西一间都不归我 → 不可配");
    }

    /**
     * 祖先节点（楼层/校区）在组长视角下也**可配** —— 它是「整层批量」入口，不是「仅定位」：
     * 点它 = 把本层**可见（归本人）的房间**一次改完，前端按房间键逐条下发，不写楼层键的行。
     * 这是 2026-09-14 定的口径（整层 = 当前可见的整层）；旧版要求「整层房间全归我」才放行，
     * 结果只拿到部分房间的组长连批量入口都点不到。
     */
    @Test
    void ancestorsAreBatchEntriesNotLocationOnly() {
        when(permissionService.hasCapability("STAFF_A", CageAlertConfigService.CAP_ALERT_CONFIG)).thenReturn(true);
        when(regionGrantService.leaderRegions("STAFF_A"))
                .thenReturn(List.of(grant("ROOM", "101"), grant("ROOM", "102")));
        when(shelfMapper.listRoomTreeRows()).thenReturn(treeRows());
        when(ruleMapper.listConfiguredRegionKeys()).thenReturn(List.of());

        List<CageAlertConfigService.RegionTreeNode> tree = service.configurableRegions("STAFF_A", false);

        var campus = tree.get(0);
        assertFalse(campus.locationOnly(), "校区是批量入口（改我可见的房间）");
        var floor10 = campus.children().get(0);
        assertFalse(floor10.locationOnly(), "楼层 10 两间全归我 → 可配");
    }

    /** 不是这块区域的组长：直接拒，且不该去查能力（先短路）。 */
    @Test
    void nonLeaderIsDeniedWithoutCapabilityLookup() {
        when(regionGrantService.leaderRegions("STAFF_A")).thenReturn(List.of(grant("ROOM", "200")));
        String denied = service.manageRegionAlertError("STAFF_A", false, "ROOM", "100");
        assertTrue(denied != null && denied.contains("不由你负责"));
        verify(permissionService, never()).hasCapability(anyString(), anyString());
    }

    // ── 校验 ──

    // ── 特殊饲养明细：明细项各算一个可配置状态 ──

    private static CageInfoCodelistItem item(String code, String label) {
        CageInfoCodelistItem it = new CageInfoCodelistItem();
        it.setItemCode(code);
        it.setItemLabel(label);
        return it;
    }

    /** 码表里每多一项，可配置清单就多一个 SF_ 码；中文名走码表，不是状态码本身。 */
    private void stubDetailCodelist() {
        CageInfoCodelist cl = new CageInfoCodelist();
        cl.setId(9L);
        when(codelistMapper.selectByCode(CageStatusIntervalService.DETAIL_DICT_CODE)).thenReturn(cl);
        when(codelistItemMapper.selectByCodelistId(9L))
                .thenReturn(List.of(item("NEED_FEED", "需加食"), item("NO_WATER", "勿加水")));
    }

    /**
     * 核心回归：需特殊饲养可能常驻，真正要盯的是每个细项各自的变化 ——
     * 明细项必须是**独立可配状态**（能出配置行、能保存、带码表中文名），写死五个就等于明细永远配不了。
     */
    @Test
    void detailItemsAreConfigurableRowsWithCodelistLabels() {
        stubDetailCodelist();
        when(ruleMapper.listDefaultRules()).thenReturn(List.of());

        assertEquals(
                List.of("NEED_DIVIDE", "SPECIAL_FEEDING", "ANIMAL_TRANSFER", "HEALTH_ABNORMAL", "COHABITATION",
                        "SF_NEED_FEED", "SF_NO_WATER"),
                alertRuleService.configurableStatusCodes());

        List<Map<String, Object>> view = service.globalView();
        assertEquals(8, view.size(), "五行固定（健康异常占两行：兽医 / 笼位所有者）+ 两个明细项");
        Map<String, Object> sfRow = view.stream()
                .filter(m -> "SF_NEED_FEED".equals(m.get("statusCode"))).findFirst().orElseThrow();
        assertEquals("需加食", sfRow.get("statusLabel"));
    }

    /** 明细行要能真的写进去：归一化清单含它，全量替换就落一行（否则明细永远停在全局默认）。 */
    @Test
    void savingDetailRowIsAccepted() {
        stubDetailCodelist();
        service.replaceGlobal(List.of(
                rule("NEED_DIVIDE", 7, "HIGHLIGHT", true),
                rule("SPECIAL_FEEDING", 7, "HIGHLIGHT", true),
                rule("ANIMAL_TRANSFER", 7, "HIGHLIGHT", true),
                rule("HEALTH_ABNORMAL", "VET", 0, "HIGHLIGHT", true, 1),
                rule("HEALTH_ABNORMAL", "OCCUPANT", 7, "HIGHLIGHT", true, 0),
                rule("COHABITATION", 7, "HIGHLIGHT", true),
                rule("SF_NEED_FEED", 2, "BOTH", true),
                rule("SF_NO_WATER", 3, "HIGHLIGHT", false)));

        verify(ruleMapper).upsertDefaultRule("SF_NEED_FEED", "DEFAULT", 2, "BOTH", 1, 1);
        verify(ruleMapper).upsertDefaultRule("SF_NO_WATER", "DEFAULT", 3, "HIGHLIGHT", 0, 1);
    }

    @Test
    void missingStatusIsRejected() {
        List<CageAlertConfigService.Rule> four = allRules().subList(0, 4);
        assertThrows(IllegalArgumentException.class, () -> service.replaceGlobal(four));
    }

    /** 明细项漏传同样算「缺少状态」——半套配置落库比报错糟得多。 */
    @Test
    void missingDetailRowIsRejected() {
        stubDetailCodelist();
        assertThrows(IllegalArgumentException.class, () -> service.replaceGlobal(allRules()));
    }

    @Test
    void invalidActionIsRejected() {
        List<CageAlertConfigService.Rule> bad = List.of(
                rule("NEED_DIVIDE", 7, "HIGHLIGHT", true),
                rule("SPECIAL_FEEDING", 7, "NOPE", true),
                rule("ANIMAL_TRANSFER", 7, "HIGHLIGHT", true),
                rule("HEALTH_ABNORMAL", "VET", 0, "HIGHLIGHT", true, 1),
                rule("HEALTH_ABNORMAL", "OCCUPANT", 7, "HIGHLIGHT", true, 0),
                rule("COHABITATION", 7, "HIGHLIGHT", true));
        assertThrows(IllegalArgumentException.class, () -> service.replaceGlobal(bad));
    }

    @Test
    void negativeThresholdIsRejected() {
        List<CageAlertConfigService.Rule> bad = List.of(
                rule("NEED_DIVIDE", -1, "HIGHLIGHT", true),
                rule("SPECIAL_FEEDING", 7, "HIGHLIGHT", true),
                rule("ANIMAL_TRANSFER", 7, "HIGHLIGHT", true),
                rule("HEALTH_ABNORMAL", "VET", 0, "HIGHLIGHT", true, 1),
                rule("HEALTH_ABNORMAL", "OCCUPANT", 7, "HIGHLIGHT", true, 0),
                rule("COHABITATION", 7, "HIGHLIGHT", true));
        assertThrows(IllegalArgumentException.class, () -> service.replaceGlobal(bad));
    }

    // ── 读：区域树 ──

    @Test
    void configurableRegionsFiltersLeaderByCapability() {
        when(permissionService.hasCapability("STAFF_A", CageAlertConfigService.CAP_ALERT_CONFIG)).thenReturn(false);
        assertEquals(List.of(), service.configurableRegions("STAFF_A", false));
        verify(regionGrantService, never()).leaderRegions(anyString());
        verify(shelfMapper, never()).listRoomTreeRows();
    }

    /** 超管 = 全量真实树，configured/descendantConfigured 就地聚合（不再回查逐区）。 */
    @Test
    void adminConfigurableRegionsReturnsFullTree() {
        when(shelfMapper.listRoomTreeRows()).thenReturn(treeRows());
        when(ruleMapper.listConfiguredRegionKeys()).thenReturn(List.of(cfgKey("FLOOR", "10"), cfgKey("ROOM", "102")));

        List<CageAlertConfigService.RegionTreeNode> tree = service.configurableRegions("STAFF_ROOT", true);

        assertEquals(2, tree.size());
        var c1 = tree.get(0);
        assertEquals("CAMPUS", c1.regionType());
        assertEquals("1", c1.regionId());
        assertEquals("浦东", c1.name());
        assertFalse(c1.configured());
        assertTrue(c1.descendantConfigured());
        assertFalse(c1.locationOnly());
        assertEquals(2, c1.children().size());

        var floor10 = c1.children().get(0);
        assertEquals("FLOOR", floor10.regionType());
        assertEquals("10", floor10.regionId());
        assertTrue(floor10.configured());
        assertTrue(floor10.descendantConfigured());
        assertEquals(2, floor10.children().size());
        assertFalse(floor10.children().get(0).configured());
        assertTrue(floor10.children().get(1).configured());
        assertEquals(0, floor10.children().get(0).children().size());

        var c2 = tree.get(1);
        assertFalse(c2.configured());
        assertFalse(c2.descendantConfigured());
        verify(permissionService, never()).hasCapability(anyString(), anyString());
    }

    /** 组长被分到整个楼层：只回该楼层的子树 + 祖先定位链，不含兄弟校区/楼层。 */
    @Test
    void leaderConfigurableRegionsPrunesToOwnSubtree() {
        when(permissionService.hasCapability("STAFF_A", CageAlertConfigService.CAP_ALERT_CONFIG)).thenReturn(true);
        when(regionGrantService.leaderRegions("STAFF_A")).thenReturn(List.of(grant("FLOOR", "10")));
        when(shelfMapper.listRoomTreeRows()).thenReturn(treeRows());
        when(ruleMapper.listConfiguredRegionKeys()).thenReturn(List.of(cfgKey("FLOOR", "10"), cfgKey("ROOM", "102")));

        List<CageAlertConfigService.RegionTreeNode> tree = service.configurableRegions("STAFF_A", false);

        assertEquals(1, tree.size());
        var campus = tree.get(0);
        assertEquals("CAMPUS", campus.regionType());
        assertFalse(campus.locationOnly(), "祖先=批量入口，不再是「仅定位」");
        assertEquals(1, campus.children().size());

        var floor = campus.children().get(0);
        assertEquals("FLOOR", floor.regionType());
        assertEquals("10", floor.regionId());
        assertFalse(floor.locationOnly());
        assertTrue(floor.configured());
        assertTrue(floor.descendantConfigured());
        assertEquals(2, floor.children().size());
        assertTrue(floor.children().get(1).configured()); // 102 有配
        assertFalse(floor.children().get(0).locationOnly()); // 房间后代不是「定位」，带真实配置态
    }

    /** 组长被分到具体房间：只回该房间 + 两级祖先（批量入口），不带任何兄弟。 */
    @Test
    void leaderAssignedRoomShowsAncestorChainOnly() {
        when(permissionService.hasCapability("STAFF_A", CageAlertConfigService.CAP_ALERT_CONFIG)).thenReturn(true);
        when(regionGrantService.leaderRegions("STAFF_A")).thenReturn(List.of(grant("ROOM", "102")));
        when(shelfMapper.listRoomTreeRows()).thenReturn(treeRows());
        when(ruleMapper.listConfiguredRegionKeys()).thenReturn(List.of(cfgKey("ROOM", "102")));

        List<CageAlertConfigService.RegionTreeNode> tree = service.configurableRegions("STAFF_A", false);

        assertEquals(1, tree.size());
        var campus = tree.get(0);
        assertFalse(campus.locationOnly(), "祖先=批量入口（本层只我这一间房 → 批量也只改这一间）");
        assertEquals(1, campus.children().size());
        var floor = campus.children().get(0);
        assertFalse(floor.locationOnly());
        assertEquals(1, floor.children().size());
        var room = floor.children().get(0);
        assertEquals("ROOM", room.regionType());
        assertEquals("102", room.regionId());
        assertFalse(room.locationOnly());
        assertTrue(room.configured());
        assertEquals(0, room.children().size());
    }

    private static Map<String, Object> treeRow(int campusId, String campusName, String floorId, String floorName,
                                               String roomId, String roomName) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("campusId", campusId);
        m.put("campusName", campusName);
        m.put("floorId", floorId);
        m.put("floorName", floorName);
        m.put("roomId", roomId);
        m.put("roomName", roomName);
        return m;
    }

    private static List<Map<String, Object>> treeRows() {
        return List.of(
                treeRow(1, "浦东", "10", "1号楼", "101", "101A"),
                treeRow(1, "浦东", "10", "1号楼", "102", "102A"),
                treeRow(1, "浦东", "11", "2号楼", "201", "201A"),
                treeRow(2, "浦西", "20", "3号楼", "301", "301A"));
    }

    private static Map<String, Object> cfgKey(String type, String id) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("regionType", type);
        m.put("regionId", id);
        return m;
    }

    // ── 读：mine/others 拆分 ──

    private static Map<String, Object> row(String code, String by, int threshold, String action, int enabled) {
        return Map.of("regionType", "ROOM", "regionId", "100", "statusCode", code,
                "configuredBy", by, "thresholdDays", threshold, "action", action, "enabled", enabled);
    }

    @Test
    void regionViewSplitsMineFromOthers() {
        when(ruleMapper.listRegionRules(any())).thenReturn(List.of(
                row("NEED_DIVIDE", "STAFF_A", 7, "HIGHLIGHT", 1),
                row("NEED_DIVIDE", "STAFF_B", 3, "VIOLATION", 1)));
        when(ruleMapper.listDefaultRules()).thenReturn(List.of());

        Map<String, Object> view = service.regionView("ROOM", "100", "STAFF_A", false);
        assertEquals(true, view.get("regionConfigured"));
        assertEquals(1, ((List<?>) view.get("mine")).size());
        assertEquals(1, ((List<?>) view.get("others")).size());
    }
}
