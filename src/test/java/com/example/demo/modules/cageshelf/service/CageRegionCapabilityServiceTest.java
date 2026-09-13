package com.example.demo.modules.cageshelf.service;

import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.cageshelf.mapper.CageCellIndexMapper;
import com.example.demo.modules.cageshelf.mapper.CagePermissionMapper;
import com.example.demo.modules.cageshelf.mapper.CageShelfMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 区域级学生能力的核心回归。
 *
 * ① **区域是矩阵的收窄层**：矩阵是总开关（上限），区域只能在其范围内关闭，且**可以全关**；
 * ② **关闭只影响被关的那一块**：解析逐架做 —— 关了 201A 不能把该学生在别的房间的功能一起关掉，
 *    未被配置的楼层/校区也不能把已关的房间稀释回全开；
 * ③ 单人保存只删自己的行，超管保存则重置整个区域。
 */
@ExtendWith(MockitoExtension.class)
class CageRegionCapabilityServiceTest {

    private static final String CLAIM = "cage.student.mode.studentClaim";
    private static final String DIVISION = "cage.student.mode.division";
    private static final String CONFIRM = "cage.student.mode.confirm";

    @Mock private CagePermissionMapper mapper;
    @Mock private CagePermissionService permissionService;
    @Mock private CageShelfLocalAggCache localAggCache;
    @Mock private UserGroupNameResolver groupNameResolver;
    @Mock private CageCellIndexMapper cellIndexMapper;
    @Mock private CageShelfMapper cageShelfMapper;

    private CageRegionCapabilityService service;

    @BeforeEach
    void setUp() {
        service = new CageRegionCapabilityService(mapper, permissionService, localAggCache,
                groupNameResolver, cellIndexMapper, cageShelfMapper);
    }

    private User student() {
        User u = new User();
        u.setId("ARO_1");
        return u;
    }

    /** 配置行（enabled=1 开 / 0 关）。**有行就代表这个区域被配过**。 */
    private Map<String, Object> row(String type, String id, String cap, int enabled) {
        return Map.of("regionType", type, "regionId", id, "capabilityCode", cap, "enabled", enabled);
    }

    /** 该账号的课题组笼位落在一个房间（ROOM 100 / FLOOR 10 / CAMPUS 1）里。 */
    private void givenStudentCagesInRoom100() {
        when(groupNameResolver.resolve("ARO_1")).thenReturn(List.of("徐楠杰的课题组"));
        when(localAggCache.attribution()).thenReturn(List.of(
                Map.of("projectPiName", "徐楠杰", "departmentName", "",
                        "roomId", "100", "floorId", "10", "campusId", "1")));
    }

    /** 该学生的笼位横跨两个房间（100 和 200，校区都算 1）。 */
    private void givenStudentCagesInTwoRooms() {
        when(groupNameResolver.resolve("ARO_1")).thenReturn(List.of("徐楠杰的课题组"));
        when(localAggCache.attribution()).thenReturn(List.of(
                Map.of("projectPiName", "徐楠杰", "departmentName", "",
                        "roomId", "100", "floorId", "10", "campusId", "1"),
                Map.of("projectPiName", "徐楠杰", "departmentName", "",
                        "roomId", "200", "floorId", "20", "campusId", "1")));
    }

    private void givenStudentCeiling(String... codes) {
        when(permissionService.identityCeiling("ARO_1")).thenReturn(Set.of(codes));
    }

    // ── 回落与全关 ──

    @Test
    void neverConfiguredFallsBackToMatrixCeiling() {
        givenStudentCagesInRoom100();
        givenStudentCeiling(CLAIM, DIVISION, CONFIRM);
        when(mapper.listRegionCapabilityRows(any())).thenReturn(List.of());

        assertEquals(List.of("studentClaim", "division", "confirm"), service.studentModes(student()),
                "区域没被配过 → 回落矩阵上限（首日行为不变）");
    }

    @Test
    void configuredRegionNarrowsToListedOnly() {
        givenStudentCagesInRoom100();
        givenStudentCeiling(CLAIM, DIVISION, CONFIRM);
        when(mapper.listRegionCapabilityRows(any()))
                .thenReturn(List.of(row("ROOM", "100", CONFIRM, 1)));

        assertEquals(List.of("confirm"), service.studentModes(student()));
    }

    /**
     * **核心回归之一**：配过、但一项都没开（全是 enabled=0 的行）→ 本区**全部关闭**。
     * 早期规则「并集空就回落上限」会把这种情况变成「全部开放」，组长永远关不掉。
     */
    @Test
    void configuredButAllClosedStaysClosed() {
        givenStudentCagesInRoom100();
        givenStudentCeiling(CLAIM, DIVISION, CONFIRM);
        when(mapper.listRegionCapabilityRows(any())).thenReturn(List.of(
                row("ROOM", "100", CLAIM, 0), row("ROOM", "100", DIVISION, 0), row("ROOM", "100", CONFIRM, 0)));

        assertEquals(List.of(), service.studentModes(student()), "配过且全关 = 本区全关，不能回落成全开");
    }

    /**
     * **核心回归之二**：关了 100 房不影响该学生在 200 房的功能。
     * 200 自己开着「划分+确认」，100 全关 → 生效是两者并集 = 划分+确认。
     */
    @Test
    void closingOneRoomDoesNotCloseAnother() {
        givenStudentCagesInTwoRooms();
        givenStudentCeiling(CLAIM, DIVISION, CONFIRM);
        when(mapper.listRegionCapabilityRows(any())).thenReturn(List.of(
                row("ROOM", "100", CLAIM, 0), row("ROOM", "100", DIVISION, 0), row("ROOM", "100", CONFIRM, 0),
                row("ROOM", "200", DIVISION, 1), row("ROOM", "200", CONFIRM, 1)));

        assertEquals(List.of("division", "confirm"), service.studentModes(student()),
                "100 关了不该影响 200");
    }

    /** 一个区配过、另一个区**从未配过** → 没配过的那区按默认（不受影响）。 */
    @Test
    void unconfiguredRoomContributesItsDefault() {
        givenStudentCagesInTwoRooms();
        givenStudentCeiling(CLAIM, DIVISION, CONFIRM);
        when(mapper.listRegionCapabilityRows(any()))
                .thenReturn(List.of(row("ROOM", "200", CONFIRM, 1)));

        assertEquals(List.of("studentClaim", "division", "confirm"), service.studentModes(student()),
                "100 没配过 → 按默认全开，所以三样都在（不会因为 200 配过就少掉）");
    }

    /** 矩阵是上限：区域里配了矩阵没放开的能力，不生效。 */
    @Test
    void configuredIsIntersectedWithCeiling() {
        givenStudentCagesInRoom100();
        givenStudentCeiling(CLAIM, CONFIRM);
        when(mapper.listRegionCapabilityRows(any())).thenReturn(List.of(
                row("ROOM", "100", "cage.mode.allocate", 1),
                row("ROOM", "100", DIVISION, 1),
                row("ROOM", "100", CLAIM, 1)));

        assertEquals(List.of("studentClaim"), service.studentModes(student()),
                "教职工能力 cage.mode.allocate 不该从区域学生配置里漏出来");
    }

    /** 移动端只带 roomId：必须补齐楼层/校区，否则配在楼层级的关闭会查不到、被当成没配过而误放行。 */
    @Test
    void roomOnlyCallFillsFloorAndCampus() {
        when(permissionService.identityCeiling("ARO_1")).thenReturn(Set.of(CONFIRM));
        when(cageShelfMapper.lookupHierarchyByRoom("100")).thenReturn(Map.of("floorId", "10", "campusId", "1"));
        // 关闭配在**楼层**一级
        when(mapper.listRegionCapabilityRows(any()))
                .thenReturn(List.of(row("FLOOR", "10", CONFIRM, 0)));

        assertEquals(List.of(), service.studentModesForRegion(student(), "100", null, null),
                "只给 roomId 时也要带上楼层，否则楼层级的关闭查不到");
    }

    /** 反过来：只带 roomId、该房间/楼层/校区都没配过 → 回落矩阵上限。 */
    @Test
    void roomOnlyCallWithNothingConfiguredFallsBack() {
        when(permissionService.identityCeiling("ARO_1")).thenReturn(Set.of(CONFIRM));
        when(cageShelfMapper.lookupHierarchyByRoom("100")).thenReturn(Map.of("floorId", "10", "campusId", "1"));
        when(mapper.listRegionCapabilityRows(any())).thenReturn(List.of());

        assertEquals(List.of("confirm"), service.studentModesForRegion(student(), "100", null, null));
    }

    // ── 按笼位收口 ──

    @Test
    void perCageGateBlocksCapTheRegionDidNotOpen() {
        // 按笼位收口走「笼位→区域」，与「学生→课题组→区域」无关，所以不 stub 课题归属
        givenStudentCeiling(CLAIM, DIVISION, CONFIRM);
        when(cellIndexMapper.lookupByAnimalCageId(999L))
                .thenReturn(Map.of("roomId", 100, "floorId", 10, "campusId", 1));
        when(mapper.listRegionCapabilityRows(any()))
                .thenReturn(List.of(row("ROOM", "100", CONFIRM, 1)));

        User u = student();
        assertTrue(service.cageRegionEnabled(u, 999L, CONFIRM));
        assertFalse(service.cageRegionEnabled(u, 999L, DIVISION),
                "该笼位所在区域只开了确认，划分必须按笼位收口拒掉");
    }

    /** 只关**房间**级、楼层/校区没配过时，该笼位仍要判成关闭（不能被未配置的上级稀释回全开）。 */
    @Test
    void closedRoomIsNotDilutedByUnconfiguredFloorOrCampus() {
        givenStudentCeiling(CLAIM, DIVISION, CONFIRM);
        when(cellIndexMapper.lookupByAnimalCageId(999L))
                .thenReturn(Map.of("roomId", 100, "floorId", 10, "campusId", 1));
        when(mapper.listRegionCapabilityRows(any()))
                .thenReturn(List.of(row("ROOM", "100", CONFIRM, 0)));

        assertFalse(service.cageRegionEnabled(student(), 999L, CONFIRM),
                "房间被关了就是关了，上层没配过不等于放开");
    }

    /** 反过来：笼位所在区域从未配置 → 不限制（同回落规则）。 */
    @Test
    void perCageGateAllowsWhenThatCageRegionIsUnconfigured() {
        when(permissionService.identityCeiling("ARO_1")).thenReturn(Set.of(DIVISION));
        when(cellIndexMapper.lookupByAnimalCageId(888L))
                .thenReturn(Map.of("roomId", 200, "floorId", 20, "campusId", 1));
        when(mapper.listRegionCapabilityRows(any())).thenReturn(List.of());

        assertTrue(service.cageRegionEnabled(student(), 888L, DIVISION));
    }

    /**
     * 回归：状态动作的入参是**表单 canonical**（`needs_cohabitation`），不是动作码（`COHABITATION`）。
     * 方向拼反会得到一个永不存在的能力码，结果是把学生侧合笼对所有人锁死。
     */
    @Test
    void studentEditGateTakesFormCanonicalNotActionCode() {
        when(permissionService.identityCeiling("ARO_1")).thenReturn(Set.of("cage.student.edit.cohabitation"));
        when(cellIndexMapper.lookupByAnimalCageId(999L))
                .thenReturn(Map.of("roomId", 100, "floorId", 10, "campusId", 1));
        when(mapper.listRegionCapabilityRows(any())).thenReturn(List.of());

        assertTrue(service.studentEditEnabledOnCage(student(), 999L, "needs_cohabitation"),
                "canonical 必须能反查回动作码，否则拼出的能力码不存在");
    }

    // ── 写 ──

    @Test
    void replacingOutsideStudentCeilingIsRejected() {
        when(permissionService.studentCeiling()).thenReturn(Set.of(CLAIM, DIVISION, CONFIRM));

        assertThrows(IllegalArgumentException.class,
                () -> service.replaceRegionCapabilities("ROOM", "100", List.of(DIVISION, "cage.mode.allocate"), "op", false));
        verify(mapper, never()).deleteRegionCapabilities(anyString(), anyString(), anyString());
    }

    /** 保存时把**矩阵上限的每一项**都落一行：勾的 enabled=1、没勾的 enabled=0（这样才表达得出全关）。 */
    @Test
    void replacingWritesEveryCeilingCapWithItsFlag() {
        when(permissionService.studentCeiling()).thenReturn(Set.of(DIVISION, CONFIRM));

        service.replaceRegionCapabilities("ROOM", "100", List.of(DIVISION), "STAFF_A", false);
        verify(mapper).deleteRegionCapabilities("ROOM", "100", "STAFF_A");
        verify(mapper).insertRegionCapability("ROOM", "100", DIVISION, "STAFF_A", 1);
        verify(mapper).insertRegionCapability("ROOM", "100", CONFIRM, "STAFF_A", 0);
        verify(mapper, times(2)).insertRegionCapability(anyString(), anyString(), anyString(), anyString(), any(Integer.class));
    }

    /** 全不勾也要落行（全 0），否则「配过且全关」又变成零行 = 从未配置。 */
    @Test
    void replacingWithEmptyStillWritesClosedRows() {
        when(permissionService.studentCeiling()).thenReturn(Set.of(CONFIRM));

        service.replaceRegionCapabilities("ROOM", "100", List.of(), "STAFF_A", false);
        verify(mapper).insertRegionCapability("ROOM", "100", CONFIRM, "STAFF_A", 0);
    }

    /**
     * 回归：一个区域可以分给**多个**饲养组长，保存只删**自己**的行。
     * 早期按区域整片删，实测「A 配 3 项 → B 配 1 项 → A 的 3 项被静默抹掉」。
     */
    @Test
    void replaceOnlyTouchesOwnRows() {
        when(permissionService.studentCeiling()).thenReturn(Set.of(CLAIM, DIVISION, CONFIRM));

        service.replaceRegionCapabilities("ROOM", "100", List.of(DIVISION), "STAFF_A", false);
        verify(mapper, never()).deleteRegionCapabilities(eq("ROOM"), eq("100"), eq("STAFF_B"));
    }

    /** 界面把「我勾的」和「别人开的」分开回：并集生效时，别人开的项我不能取消，得看得见。 */
    @Test
    void regionViewSplitsMineFromOthers() {
        when(permissionService.studentCeiling()).thenReturn(Set.of(CLAIM, DIVISION, CONFIRM));
        when(mapper.listRegionCapabilitiesBy("ROOM", "100", "STAFF_A")).thenReturn(List.of(CONFIRM));
        when(mapper.listRegionCapabilities("ROOM", "100")).thenReturn(List.of(CONFIRM, DIVISION));
        when(mapper.countConfiguredRegions(any())).thenReturn(1);

        Map<String, Object> view = service.regionView("ROOM", "100", "STAFF_A", false);
        assertEquals(List.of(CONFIRM), view.get("configured"));
        assertEquals(List.of(DIVISION), view.get("others"));
        assertEquals(true, view.get("regionConfigured"));
    }

    /**
     * 超管保存 = **该区域重置**：清掉所有人的行再写自己的。
     * 没有这条路就成了死锁 —— 别人的行在组长/其他超管界面上都是只读的「其他组长开放」，谁都删不掉。
     */
    @Test
    void adminSaveResetsTheWholeRegion() {
        when(permissionService.studentCeiling()).thenReturn(Set.of(CLAIM, DIVISION, CONFIRM));

        service.replaceRegionCapabilities("ROOM", "100", List.of(CONFIRM), "STAFF_ROOT", true);
        verify(mapper).deleteAllRegionCapabilities("ROOM", "100");
        verify(mapper, never()).deleteRegionCapabilities(anyString(), anyString(), anyString());
    }

    /** 超管视角回该区域的完整并集（可编辑），别人的行不单独只读展示。 */
    @Test
    void adminViewSeesWholeUnion() {
        when(permissionService.studentCeiling()).thenReturn(Set.of(CLAIM, DIVISION, CONFIRM));
        when(mapper.listRegionCapabilities("ROOM", "100")).thenReturn(List.of(CONFIRM, DIVISION));
        when(mapper.countConfiguredRegions(any())).thenReturn(1);

        Map<String, Object> view = service.regionView("ROOM", "100", "STAFF_ROOT", true);
        assertEquals(List.of(CONFIRM, DIVISION), view.get("configured"));
        assertEquals(List.of(), view.get("others"));
    }

    /** 区域分配撤销时，该人留在这块区域的学生能力配置必须被清掉（否则仍生效且没人能清）。 */
    @Test
    void clearRegionForUserDropsThatPersonRows() {
        service.clearRegionForUser("ROOM", "100", "STAFF_A");
        verify(mapper).deleteRegionCapabilities("ROOM", "100", "STAFF_A");
    }
}
