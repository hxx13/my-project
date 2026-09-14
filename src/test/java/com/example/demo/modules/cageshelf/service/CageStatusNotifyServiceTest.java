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

    private CageStatusNotifyService service;

    @BeforeEach
    void setUp() {
        service = new CageStatusNotifyService(pushService, alertMapper, cellIndexMapper, cellDetailMapper,
                aroService, alertRuleService, cageOperationService);
    }

    private static CageStatusAlert alert(String statusCode, LocalDateTime startedAt, LocalDateTime firedAt,
                                         int thresholdDays) {
        CageStatusAlert a = new CageStatusAlert();
        a.setId(9L);
        a.setAnimalCageId(123L);
        a.setStatusCode(statusCode);
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
        verify(pushService).send(eq(CageStatusNotifyService.SOURCE_CODE), vars.capture(), ids.capture());

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
        verify(pushService).send(eq(CageStatusNotifyService.SOURCE_CODE), org.mockito.ArgumentMatchers.any(), ids.capture());
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
        verify(pushService).send(eq(CageStatusNotifyService.SOURCE_CODE), vars.capture(), ids.capture());
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
        verify(pushService).send(eq(CageStatusNotifyService.SOURCE_CODE), vars.capture(), org.mockito.ArgumentMatchers.any());
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
}
