package com.example.demo.modules.cageshelf.service;

import com.example.demo.modules.cageshelf.mapper.CageRegionVetMapper;
import com.example.demo.modules.identity.service.PersonIdentityService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 区域指定兽医的核心回归：**就近命中 + 同级并集**，以及写入侧「必须是持兽医身份的人」的校验。
 *
 * <p>口径（用户 2026-09-17）：一个区域一般一位兽医，同一兽医可覆盖多个区域（多行）；
 * 房间配过就不看楼层/校区；同级多组长各配各的 → 都通知，不做互斥拒绝。
 */
@ExtendWith(MockitoExtension.class)
class CageRegionVetServiceTest {

    private static final long CAGE = 1L;

    @Mock private CageRegionVetMapper mapper;
    @Mock private CageRegionCapabilityService regionCapabilityService;
    @Mock private PersonIdentityService personIdentityService;

    private CageRegionVetService service;

    @BeforeEach
    void setUp() {
        service = new CageRegionVetService(mapper, regionCapabilityService, personIdentityService);
    }

    private void stubCageRegions() {
        when(regionCapabilityService.regionsOfCages(any())).thenReturn(Map.of(CAGE,
                List.of(region("ROOM", "100"), region("FLOOR", "10"), region("CAMPUS", "1"))));
    }

    private static Map<String, String> region(String type, String id) {
        Map<String, String> m = new HashMap<>();
        m.put("regionType", type);
        m.put("regionId", id);
        return m;
    }

    private static Map<String, Object> vetRow(String type, String id, String vet, String by) {
        Map<String, Object> m = new HashMap<>();
        m.put("regionType", type);
        m.put("regionId", id);
        m.put("vetAccountId", vet);
        m.put("configuredBy", by);
        return m;
    }

    /** 房间配过 → 只用房间的兽医，楼层/校区的**不生效**（就近命中即止）。 */
    @Test
    void roomVetsWinOverFloorAndCampus() {
        stubCageRegions();
        when(mapper.listByRegions(any())).thenReturn(List.of(
                vetRow("ROOM", "100", "STAFF_ROOM_VET", "LEADER_A"),
                vetRow("FLOOR", "10", "STAFF_FLOOR_VET", "LEADER_B"),
                vetRow("CAMPUS", "1", "STAFF_CAMPUS_VET", "LEADER_B")));

        assertEquals(Set.of("STAFF_ROOM_VET"), service.resolveVetsForCage(CAGE));
    }

    /** 房间没配 → 回落到楼层；楼层也没有 → 校区；都没有 → 空集（交回 push-config 的接收人）。 */
    @Test
    void fallsBackToFloorThenCampusThenEmpty() {
        stubCageRegions();
        when(mapper.listByRegions(any())).thenReturn(List.of(
                vetRow("FLOOR", "10", "STAFF_FLOOR_VET", "LEADER_B"),
                vetRow("CAMPUS", "1", "STAFF_CAMPUS_VET", "LEADER_B")));
        assertEquals(Set.of("STAFF_FLOOR_VET"), service.resolveVetsForCage(CAGE));

        when(mapper.listByRegions(any())).thenReturn(List.of(
                vetRow("CAMPUS", "1", "STAFF_CAMPUS_VET", "LEADER_B")));
        assertEquals(Set.of("STAFF_CAMPUS_VET"), service.resolveVetsForCage(CAGE));

        when(mapper.listByRegions(any())).thenReturn(List.of());
        assertEquals(Set.of(), service.resolveVetsForCage(CAGE));
    }

    /** 同一区域多个饲养组长各配一位 → **并集**（都通知），不互斥拒绝。 */
    @Test
    void sameLevelMultipleLeadersUnion() {
        stubCageRegions();
        when(mapper.listByRegions(any())).thenReturn(List.of(
                vetRow("ROOM", "100", "STAFF_VET_A", "LEADER_A"),
                vetRow("ROOM", "100", "STAFF_VET_B", "LEADER_B")));

        assertEquals(Set.of("STAFF_VET_A", "STAFF_VET_B"), service.resolveVetsForCage(CAGE));
    }

    /** 笼位区域解析不出来 → 空集，不抛异常（通知侧会打 warn 并交回 push-config）。 */
    @Test
    void unresolvedRegionYieldsEmptyWithoutThrowing() {
        when(regionCapabilityService.regionsOfCages(any())).thenThrow(new RuntimeException("boom"));
        assertEquals(Set.of(), service.resolveVetsForCage(CAGE));
    }

    /** 写入：非兽医身份的人被拒，且在**删行之前**拒（先删后拒会把本区既有配置删光又没写回）。 */
    @Test
    void replacingWithNonVetIsRejectedBeforeDelete() {
        when(personIdentityService.isVeterinarian("STAFF_NOT_VET")).thenReturn(false);

        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> service.replaceRegionVets("ROOM", "100", List.of("STAFF_NOT_VET"), "LEADER_A", false));

        assertTrue(e.getMessage().contains("兽医"), e.getMessage());
        verify(mapper, never()).deleteRegionVets(anyString(), anyString(), anyString());
        verify(mapper, never()).insertRegionVet(anyString(), anyString(), anyString(), anyString());
    }

    /** 写入：兽医身份校验通过 → 先删自己的行再插；非超管只删自己的。 */
    @Test
    void replacingWithVetsDeletesOwnRowsThenInserts() {
        when(personIdentityService.isVeterinarian("STAFF_VET")).thenReturn(true);

        service.replaceRegionVets("ROOM", "100", List.of("STAFF_VET"), "LEADER_A", false);

        verify(mapper).deleteRegionVets("ROOM", "100", "LEADER_A");
        verify(mapper, never()).deleteAllRegionVets(anyString(), anyString());
        verify(mapper).insertRegionVet("ROOM", "100", "STAFF_VET", "LEADER_A");
    }

    /** 超管保存 = 本区重置：清掉所有人的行再写。空列表是合法输入（本区不指定兽医）。 */
    @Test
    void adminSaveResetsWholeRegionAndEmptyListIsAllowed() {
        service.replaceRegionVets("ROOM", "100", List.of(), "STAFF_ROOT", true);

        verify(mapper).deleteAllRegionVets("ROOM", "100");
        verify(mapper, never()).deleteRegionVets(anyString(), anyString(), anyString());
        verify(mapper, never()).insertRegionVet(anyString(), anyString(), anyString(), anyString());
    }

    /** 读视图：超管视角 mine 回该区域全部行、others 空（超管保存即重置本区）。 */
    @Test
    void adminViewReturnsEverythingAsMine() {
        when(mapper.listByRegion("ROOM", "100")).thenReturn(List.of(
                vetRow("ROOM", "100", "STAFF_VET_A", "LEADER_A"),
                vetRow("ROOM", "100", "STAFF_VET_B", "LEADER_B")));

        Map<String, Object> view = service.regionVets("ROOM", "100", "STAFF_ROOT", true);

        assertEquals(List.of("STAFF_VET_A", "STAFF_VET_B"), view.get("mine"));
        assertEquals(List.of(), view.get("others"));
    }

    /** 读视图：组长视角 mine = 自己配的，others = 别人的（只读展示）。 */
    @Test
    void leaderViewSeparatesMineFromOthers() {
        when(mapper.listByRegion("ROOM", "100")).thenReturn(List.of(
                vetRow("ROOM", "100", "STAFF_VET_A", "LEADER_A"),
                vetRow("ROOM", "100", "STAFF_VET_B", "LEADER_B")));

        Map<String, Object> view = service.regionVets("ROOM", "100", "LEADER_A", false);

        assertEquals(List.of("STAFF_VET_A"), view.get("mine"));
        assertEquals(List.of("STAFF_VET_B"), view.get("others"));
    }

    /** 区域类型/id 缺失 → 400 级拒绝，别静默写出一条没有区域的脏行。 */
    @Test
    void blankRegionIsRejected() {
        assertThrows(IllegalArgumentException.class,
                () -> service.replaceRegionVets("", "100", List.of(), "LEADER_A", false));
        verify(mapper, never()).insertRegionVet(anyString(), anyString(), anyString(), anyString());
    }

    /** 单值化：`new ArrayList<>(List.of(cageId))` 那一层只是为了绕开不可变集合，语义仍是单笼位。 */
    @Test
    void singleCageLookupPassesExactlyOneId() {
        stubCageRegions();
        when(mapper.listByRegions(any())).thenReturn(List.of());
        service.resolveVetsForCage(CAGE);
        verify(regionCapabilityService).regionsOfCages(eq(new ArrayList<>(List.of(CAGE))));
    }
}
