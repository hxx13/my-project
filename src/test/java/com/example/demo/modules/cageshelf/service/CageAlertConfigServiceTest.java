package com.example.demo.modules.cageshelf.service;

import com.example.demo.modules.cageshelf.entity.CageRegionGrant;
import com.example.demo.modules.cageshelf.mapper.CageAlertRuleMapper;
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

    private CageAlertConfigService service;

    @BeforeEach
    void setUp() {
        service = new CageAlertConfigService(ruleMapper, regionGrantService, permissionService, shelfMapper);
    }

    private static CageAlertConfigService.Rule rule(String code, int threshold, String action, boolean enabled) {
        return new CageAlertConfigService.Rule(code, threshold, action, enabled);
    }

    private static List<CageAlertConfigService.Rule> fiveRules() {
        return List.of(
                rule("NEED_DIVIDE", 7, "HIGHLIGHT", true),
                rule("SPECIAL_FEEDING", 7, "HIGHLIGHT", false),
                rule("ANIMAL_TRANSFER", 3, "VIOLATION", true),
                rule("HEALTH_ABNORMAL", 9, "BOTH", true),
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
        service.replaceRegion("ROOM", "100", fiveRules(), "STAFF_A", false);
        verify(ruleMapper).deleteRegionRules("ROOM", "100", "STAFF_A");
        verify(ruleMapper, never()).deleteAllRegionRules(anyString(), anyString());
        verify(ruleMapper, times(5)).insertRegionRule(anyString(), anyString(), anyString(),
                anyInt(), anyString(), anyInt(), eq("STAFF_A"));
    }

    /** 超管保存 = 清掉该区域所有人的行再写自己的。 */
    @Test
    void adminSaveResetsWholeRegion() {
        service.replaceRegion("ROOM", "100", fiveRules(), "STAFF_ROOT", true);
        verify(ruleMapper).deleteAllRegionRules("ROOM", "100");
        verify(ruleMapper, never()).deleteRegionRules(anyString(), anyString(), anyString());
        verify(ruleMapper, times(5)).insertRegionRule(anyString(), anyString(), anyString(),
                anyInt(), anyString(), anyInt(), eq("STAFF_ROOT"));
    }

    /** 关闭的行也要落（enabled=0），否则「配过但全关」变成零行 = 从未配置，组长永远关不掉。 */
    @Test
    void replaceWritesClosedRowsToo() {
        when(permissionService.hasCapability("STAFF_A", CageAlertConfigService.CAP_ALERT_VIOLATION)).thenReturn(true);
        service.replaceRegion("ROOM", "100", fiveRules(), "STAFF_A", false);
        verify(ruleMapper).insertRegionRule("ROOM", "100", "SPECIAL_FEEDING", 7, "HIGHLIGHT", 0, "STAFF_A");
        verify(ruleMapper).insertRegionRule("ROOM", "100", "COHABITATION", 5, "HIGHLIGHT", 0, "STAFF_A");
    }

    /**
     * 核心回归：动作含 VIOLATION/BOTH 但操作人没有 cage.alert.violation → 拒绝，且在删行之前拒，
     * 不能先删光再报错留下半残。
     */
    @Test
    void violationActionWithoutCapabilityIsDenied() {
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> service.replaceRegion("ROOM", "100", fiveRules(), "STAFF_A", false));
        assertTrue(e.getMessage().contains("违规联动"));
        verify(ruleMapper, never()).deleteRegionRules(anyString(), anyString(), anyString());
        verify(ruleMapper, never()).deleteAllRegionRules(anyString(), anyString());
    }

    // ── 写入门槛 ──

    @Test
    void adminBypassesRegionGate() {
        assertNull(service.manageRegionAlertError("STAFF_ROOT", true, "ROOM", "100"));
    }

    @Test
    void leaderWithCapabilityPasses() {
        when(regionGrantService.leaderRegions("STAFF_A")).thenReturn(List.of(grant("ROOM", "100")));
        when(permissionService.hasCapability("STAFF_A", CageAlertConfigService.CAP_ALERT_CONFIG)).thenReturn(true);
        assertNull(service.manageRegionAlertError("STAFF_A", false, "ROOM", "100"));
    }

    /**
     * 核心回归：只判 LEADER 行不判能力，cage.alert.config 就成了摆设——
     * 矩阵收窄不了「哪些身份能配告警」。这里组长无能力必须被拒。
     */
    @Test
    void leaderWithoutCapabilityIsDenied() {
        when(regionGrantService.leaderRegions("STAFF_A")).thenReturn(List.of(grant("ROOM", "100")));
        when(permissionService.hasCapability("STAFF_A", CageAlertConfigService.CAP_ALERT_CONFIG)).thenReturn(false);
        String denied = service.manageRegionAlertError("STAFF_A", false, "ROOM", "100");
        assertTrue(denied != null && denied.contains("权限"));
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

    @Test
    void missingStatusIsRejected() {
        List<CageAlertConfigService.Rule> four = fiveRules().subList(0, 4);
        assertThrows(IllegalArgumentException.class, () -> service.replaceGlobal(four));
    }

    @Test
    void invalidActionIsRejected() {
        List<CageAlertConfigService.Rule> bad = List.of(
                rule("NEED_DIVIDE", 7, "HIGHLIGHT", true),
                rule("SPECIAL_FEEDING", 7, "NOPE", true),
                rule("ANIMAL_TRANSFER", 7, "HIGHLIGHT", true),
                rule("HEALTH_ABNORMAL", 7, "HIGHLIGHT", true),
                rule("COHABITATION", 7, "HIGHLIGHT", true));
        assertThrows(IllegalArgumentException.class, () -> service.replaceGlobal(bad));
    }

    @Test
    void negativeThresholdIsRejected() {
        List<CageAlertConfigService.Rule> bad = List.of(
                rule("NEED_DIVIDE", -1, "HIGHLIGHT", true),
                rule("SPECIAL_FEEDING", 7, "HIGHLIGHT", true),
                rule("ANIMAL_TRANSFER", 7, "HIGHLIGHT", true),
                rule("HEALTH_ABNORMAL", 7, "HIGHLIGHT", true),
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
        assertTrue(campus.locationOnly());
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

    /** 组长被分到具体房间：只回该房间 + 两级祖先定位链，不带任何兄弟。 */
    @Test
    void leaderAssignedRoomShowsAncestorChainOnly() {
        when(permissionService.hasCapability("STAFF_A", CageAlertConfigService.CAP_ALERT_CONFIG)).thenReturn(true);
        when(regionGrantService.leaderRegions("STAFF_A")).thenReturn(List.of(grant("ROOM", "102")));
        when(shelfMapper.listRoomTreeRows()).thenReturn(treeRows());
        when(ruleMapper.listConfiguredRegionKeys()).thenReturn(List.of(cfgKey("ROOM", "102")));

        List<CageAlertConfigService.RegionTreeNode> tree = service.configurableRegions("STAFF_A", false);

        assertEquals(1, tree.size());
        var campus = tree.get(0);
        assertTrue(campus.locationOnly());
        assertEquals(1, campus.children().size());
        var floor = campus.children().get(0);
        assertTrue(floor.locationOnly());
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
