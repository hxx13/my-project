package com.example.demo.modules.cageshelf.service;

import com.example.demo.modules.aro.service.AroService;
import com.example.demo.modules.cageshelf.entity.CageCellDetail;
import com.example.demo.modules.cageshelf.entity.CageStatusAlert;
import com.example.demo.modules.cageshelf.mapper.CageCellDetailMapper;
import com.example.demo.modules.cageshelf.mapper.CageCellIndexMapper;
import com.example.demo.modules.cageshelf.mapper.CageStatusAlertMapper;
import com.example.demo.modules.notification.push.dispatch.PushService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 「特殊饲养 / 合笼」超时提醒的核心回归（用户 2026-09-14 口径：这两个状态不是违规行为）。
 *
 * <p>钉两件事：① 通知变量按笼位上下文拼全（状态名 / 笼位 / 课题组 / 已持续天数）；
 * ② 收件人 = 该笼位课题组成员（与原先违规通知同一批人），且通知失败**绝不影响告警本体**。
 */
@ExtendWith(MockitoExtension.class)
class CageStatusNotifyServiceTest {

    @Mock private PushService pushService;
    @Mock private CageStatusAlertMapper alertMapper;
    @Mock private CageCellIndexMapper cellIndexMapper;
    @Mock private CageCellDetailMapper cellDetailMapper;
    @Mock private AroService aroService;
    @Mock private CageAlertRuleService alertRuleService;
    @Mock private CageOperationService cageOperationService;
    @Mock private CageRegionVetService regionVetService;
    @Mock private CageInfoValueService infoValueService;
    @Mock private CageVetService vetService;

    private CageStatusNotifyService service;

    @BeforeEach
    void setUp() {
        service = new CageStatusNotifyService(pushService, alertMapper, cellIndexMapper, cellDetailMapper,
                aroService, alertRuleService, cageOperationService, regionVetService, infoValueService, vetService);
    }

    private static CageStatusAlert alert(String statusCode, LocalDateTime startedAt, LocalDateTime firedAt,
                                         int thresholdDays) {
        return alert(statusCode, "DEFAULT", startedAt, firedAt, thresholdDays);
    }

    private static CageStatusAlert alert(String statusCode, String notifyTarget,
                                         LocalDateTime startedAt, LocalDateTime firedAt, int thresholdDays) {
        CageStatusAlert a = new CageStatusAlert();
        a.setId(9L);
        a.setAnimalCageId(123L);
        a.setStatusCode(statusCode);
        a.setNotifyTarget(notifyTarget);
        a.setStartedAt(startedAt);
        a.setFiredAt(firedAt);
        a.setThresholdDays(thresholdDays);
        return a;
    }

    /** 收件人 = **该笼位所属人**（不是整个课题组）：认领人/实验员解析出来是谁就发谁。 */
    @Test
    void notifiesOccupantWithFullCageContext() {
        LocalDateTime fired = LocalDateTime.now();
        when(alertMapper.selectById(9L))
                .thenReturn(alert("SPECIAL_FEEDING", fired.minusDays(9), fired, 7));
        when(cellIndexMapper.lookupByAnimalCageId(123L)).thenReturn(Map.of(
                "shelveName", "201A-1", "positionX", 1, "positionY", 2,
                "roomName", "201A", "campusName", "浦东"));
        CageCellDetail detail = new CageCellDetail();
        detail.setProjectPiName("徐楠杰");
        detail.setExperimenterName("林安顺");
        when(cellDetailMapper.selectByAnimalCageId(123L)).thenReturn(detail);
        when(cageOperationService.occupantAccountIds(123L)).thenReturn(Set.of("STAFF_LIN"));
        when(alertRuleService.labelOf("SPECIAL_FEEDING")).thenReturn("需特殊饲养");

        service.notifyFired(9L);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, String>> vars = ArgumentCaptor.forClass(Map.class);
        @SuppressWarnings("unchecked")
        ArgumentCaptor<Set<String>> ids = ArgumentCaptor.forClass(Set.class);
        verify(pushService).send(eq(CageStatusNotifyService.SOURCE_SPECIAL_STATUS), vars.capture(), ids.capture());

        assertEquals("需特殊饲养", vars.getValue().get("statusLabel"));
        // 位号走**映射**口径（列转字母、行翻转）：x=1,y=2 → A-9（与前端 displayPosition 同源）
        assertEquals("201A-1 A-9", vars.getValue().get("cageLabel"));
        assertEquals("201A", vars.getValue().get("roomName"));
        assertEquals("徐楠杰", vars.getValue().get("projectPiName"));
        assertEquals("林安顺", vars.getValue().get("experimenterName"));
        assertEquals("9", vars.getValue().get("persistedDays"));
        assertEquals("7", vars.getValue().get("thresholdDays"));
        assertEquals(Set.of("STAFF_LIN"), ids.getValue(), "发所属人本人，不是整个课题组");
        verify(aroService, never()).findUserIdsByProjectGroup(anyString());
    }

    /** 所属人解析不出来（没认领 + 实验员没进统一人员表）→ 退回课题组，别让通知凭空消失。 */
    @Test
    void fallsBackToGroupWhenOccupantUnknown() {
        LocalDateTime fired = LocalDateTime.now();
        when(alertMapper.selectById(9L)).thenReturn(alert("COHABITATION", fired.minusDays(9), fired, 7));
        when(cellIndexMapper.lookupByAnimalCageId(123L)).thenReturn(Map.of());
        CageCellDetail detail = new CageCellDetail();
        detail.setProjectPiName("徐楠杰");
        when(cellDetailMapper.selectByAnimalCageId(123L)).thenReturn(detail);
        when(cageOperationService.occupantAccountIds(123L)).thenReturn(Set.of());
        when(aroService.findUserIdsByProjectGroup("徐楠杰")).thenReturn(List.of("ARO_1"));
        when(alertRuleService.labelOf("COHABITATION")).thenReturn("合笼");

        service.notifyFired(9L);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Set<String>> ids = ArgumentCaptor.forClass(Set.class);
        verify(pushService).send(eq(CageStatusNotifyService.SOURCE_SPECIAL_STATUS), org.mockito.ArgumentMatchers.any(), ids.capture());
        assertEquals(Set.of("ARO_1"), ids.getValue());
    }

    /** 明细项（SF_*）也走这一个源，状态名取码表中文名。 */
    @Test
    void detailItemUsesThisSameSource() {
        LocalDateTime fired = LocalDateTime.now();
        when(alertMapper.selectById(9L)).thenReturn(alert("SF_NEED_FEED", fired.minusDays(2), fired, 2));
        when(cellIndexMapper.lookupByAnimalCageId(123L)).thenReturn(Map.of("shelveName", "202A-1"));
        when(cellDetailMapper.selectByAnimalCageId(123L)).thenReturn(null);
        when(alertRuleService.labelOf("SF_NEED_FEED")).thenReturn("需加食");

        service.notifyFired(9L);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, String>> vars = ArgumentCaptor.forClass(Map.class);
        @SuppressWarnings("unchecked")
        ArgumentCaptor<Set<String>> ids = ArgumentCaptor.forClass(Set.class);
        verify(pushService).send(eq(CageStatusNotifyService.SOURCE_SPECIAL_STATUS), vars.capture(), ids.capture());
        assertEquals("需加食", vars.getValue().get("statusLabel"));
        assertEquals("202A-1", vars.getValue().get("cageLabel"), "没坐标就只给架子名");
        assertEquals(Set.of(), ids.getValue(), "取不到课题组 → 交回引擎按配置的收件人发");
    }

    /** 缺起算时刻（历史行）→ 退回阈值天数，不报「0 天」这种假值。 */
    @Test
    void missingStartedAtFallsBackToThreshold() {
        when(alertMapper.selectById(9L)).thenReturn(alert("COHABITATION", null, LocalDateTime.now(), 5));
        when(cellIndexMapper.lookupByAnimalCageId(123L)).thenReturn(Map.of());
        when(cellDetailMapper.selectByAnimalCageId(123L)).thenReturn(null);
        when(alertRuleService.labelOf("COHABITATION")).thenReturn("合笼");

        service.notifyFired(9L);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, String>> vars = ArgumentCaptor.forClass(Map.class);
        verify(pushService).send(eq(CageStatusNotifyService.SOURCE_SPECIAL_STATUS), vars.capture(), org.mockito.ArgumentMatchers.any());
        assertEquals("5", vars.getValue().get("persistedDays"));
    }

    /** 通知失败（数据库/推送异常）绝不能把告警引擎带崩 —— 只吞掉打日志。 */
    @Test
    void pushFailureNeverThrows() {
        when(alertMapper.selectById(anyLong())).thenThrow(new RuntimeException("db down"));

        assertDoesNotThrow(() -> service.notifyFired(1L));
        verify(pushService, never()).send(org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
    }

    // ── 健康异常：按 (状态码, 通知对象) 分两个通道 ──

    /**
     * 核心回归（用户 2026-09-17 口径）：同一条健康异常告警，VET 走「通知兽医」源、
     * 收件人是**该区域指定的兽医**（不是笼位所属人，也不夹带课题组）。
     */
    @Test
    void healthVetAlertGoesToVetSourceWithRegionVets() {
        LocalDateTime fired = LocalDateTime.now();
        when(alertMapper.selectById(9L))
                .thenReturn(alert("HEALTH_ABNORMAL", "VET", fired.minusDays(1), fired, 0));
        when(cellIndexMapper.lookupByAnimalCageId(123L)).thenReturn(Map.of("shelveName", "201A-1"));
        CageCellDetail detail = new CageCellDetail();
        detail.setProjectPiName("徐楠杰");
        detail.setExperimenterName("林安顺");
        when(cellDetailMapper.selectByAnimalCageId(123L)).thenReturn(detail);
        when(alertRuleService.labelOf("HEALTH_ABNORMAL")).thenReturn("健康异常");
        when(regionVetService.resolveVetsForCage(123L)).thenReturn(Set.of("STAFF_VET"));
        when(infoValueService.healthSeverityLabel(123L)).thenReturn("中度");

        service.notifyFired(9L);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, String>> vars = ArgumentCaptor.forClass(Map.class);
        @SuppressWarnings("unchecked")
        ArgumentCaptor<Set<String>> ids = ArgumentCaptor.forClass(Set.class);
        verify(pushService).send(eq(CageStatusNotifyService.SOURCE_HEALTH_VET), vars.capture(), ids.capture());
        assertEquals("健康异常", vars.getValue().get("statusLabel"));
        assertEquals("中度", vars.getValue().get("severityLabel"));
        assertEquals(Set.of("STAFF_VET"), ids.getValue(), "只发区域指定兽医，不夹带所属人");
        verify(cageOperationService, never()).occupantAccountIds(anyLong());
    }

    /** 所有者通道：收件人仍是笼位所属人，源换成「通知笼位所有者」，与兽医通道互不夹带。 */
    @Test
    void healthOccupantAlertGoesToOwnerSourceWithOccupant() {
        LocalDateTime fired = LocalDateTime.now();
        when(alertMapper.selectById(9L))
                .thenReturn(alert("HEALTH_ABNORMAL", "OCCUPANT", fired.minusDays(8), fired, 7));
        when(cellIndexMapper.lookupByAnimalCageId(123L)).thenReturn(Map.of("shelveName", "201A-1"));
        CageCellDetail detail = new CageCellDetail();
        detail.setProjectPiName("徐楠杰");
        when(cellDetailMapper.selectByAnimalCageId(123L)).thenReturn(detail);
        when(alertRuleService.labelOf("HEALTH_ABNORMAL")).thenReturn("健康异常");
        when(cageOperationService.occupantAccountIds(123L)).thenReturn(Set.of("STAFF_LIN"));
        when(infoValueService.healthSeverityLabel(123L)).thenReturn("严重");

        service.notifyFired(9L);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, String>> vars = ArgumentCaptor.forClass(Map.class);
        @SuppressWarnings("unchecked")
        ArgumentCaptor<Set<String>> ids = ArgumentCaptor.forClass(Set.class);
        verify(pushService).send(eq(CageStatusNotifyService.SOURCE_HEALTH_OWNER), vars.capture(), ids.capture());
        assertEquals("严重", vars.getValue().get("severityLabel"));
        assertEquals(Set.of("STAFF_LIN"), ids.getValue());
        verify(regionVetService, never()).resolveVetsForCage(anyLong());
    }

    /** 没指定区域兽医 → 空集交回引擎（走 push-config 配的接收人），不是静默丢掉。 */
    @Test
    void healthVetWithoutConfiguredVetYieldsEmptySet() {
        LocalDateTime fired = LocalDateTime.now();
        when(alertMapper.selectById(9L))
                .thenReturn(alert("HEALTH_ABNORMAL", "VET", fired, fired, 0));
        when(cellIndexMapper.lookupByAnimalCageId(123L)).thenReturn(Map.of());
        when(cellDetailMapper.selectByAnimalCageId(123L)).thenReturn(null);
        when(alertRuleService.labelOf("HEALTH_ABNORMAL")).thenReturn("健康异常");
        when(regionVetService.resolveVetsForCage(123L)).thenReturn(Set.of());
        when(infoValueService.healthSeverityLabel(123L)).thenReturn("");

        service.notifyFired(9L);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Set<String>> ids = ArgumentCaptor.forClass(Set.class);
        verify(pushService).send(eq(CageStatusNotifyService.SOURCE_HEALTH_VET),
                org.mockito.ArgumentMatchers.any(), ids.capture());
        assertEquals(Set.of(), ids.getValue());
    }

    /** 源选择是静态映射：非健康异常的状态（含特殊饲养明细）永远走默认源。 */
    @Test
    void sourceSelectionIsStaticMapping() {
        assertEquals(CageStatusNotifyService.SOURCE_SPECIAL_STATUS,
                CageStatusNotifyService.sourceOf("SPECIAL_FEEDING", "DEFAULT"));
        assertEquals(CageStatusNotifyService.SOURCE_SPECIAL_STATUS,
                CageStatusNotifyService.sourceOf("SF_NEED_FEED", "DEFAULT"));
        assertEquals(CageStatusNotifyService.SOURCE_HEALTH_VET,
                CageStatusNotifyService.sourceOf("HEALTH_ABNORMAL", "VET"));
        assertEquals(CageStatusNotifyService.SOURCE_HEALTH_OWNER,
                CageStatusNotifyService.sourceOf("HEALTH_ABNORMAL", "OCCUPANT"));
        // 空/未知对象落在所有者那条，永不落到兽医那条 —— 宁可发宽也不漏
        assertEquals(CageStatusNotifyService.SOURCE_HEALTH_OWNER,
                CageStatusNotifyService.sourceOf("HEALTH_ABNORMAL", null));
    }
}
