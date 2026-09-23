package com.example.demo.modules.animalorder.service;

import com.example.demo.modules.cageshelf.entity.CageCellDetail;
import com.example.demo.modules.cageshelf.mapper.CageCellDetailMapper;
import com.example.demo.modules.cageshelf.service.CageFormAuditService;
import com.example.demo.modules.cageshelf.service.CageInfoValueService;
import com.example.demo.modules.referencedata.entity.CageOrderReservation;
import com.example.demo.modules.referencedata.entity.RefOrder;
import com.example.demo.modules.referencedata.mapper.CageOrderReservationMapper;
import com.example.demo.modules.referencedata.mapper.RefOrderMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 审核通过时「预约单不立刻转饲养中」的落地契约：
 * 预约单（is_preorder=1）通过后笼位维持 2、不写使用时间、预定保持 LOCKED，等周期推进任务再 promote；
 * 普通单走老路，行为逐字节不变。
 */
class CageOrderReservationSettlePreorderTest {

    private static final long ORDER = 1L;
    private static final long CAGE = 200L;
    private static final long RESERVATION = 100L;

    private static CageOrderReservationService service(CageCellDetailMapper detailMapper,
                                                       CageInfoValueService infoValue,
                                                       CageOrderReservationMapper reservationMapper,
                                                       RefOrderMapper orderMapper,
                                                       CageFormAuditService audit) {
        return new CageOrderReservationService(
                detailMapper, null, null, null, null, null, null, null,
                infoValue, audit, reservationMapper, orderMapper,
                null, null, null, null, new ObjectMapper());
    }

    private static CageOrderReservation reservation() {
        CageOrderReservation r = new CageOrderReservation();
        r.setId(RESERVATION);
        r.setAnimalCageId(CAGE);
        r.setWrittenJson("{\"animal_sex\":\"雌性\"}");
        return r;
    }

    @Test
    void 预约单通过_不转饲养中也不写使用时间() {
        CageCellDetailMapper detail = mock(CageCellDetailMapper.class);
        CageInfoValueService infoValue = mock(CageInfoValueService.class);
        CageOrderReservationMapper reservationMapper = mock(CageOrderReservationMapper.class);
        RefOrderMapper orderMapper = mock(RefOrderMapper.class);
        CageFormAuditService audit = mock(CageFormAuditService.class);

        RefOrder order = new RefOrder();
        order.setId(ORDER);
        order.setIsPreorder(1);
        when(orderMapper.findById(ORDER)).thenReturn(order);
        when(reservationMapper.listActiveByOrderId(ORDER)).thenReturn(List.of(reservation()));

        service(detail, infoValue, reservationMapper, orderMapper, audit)
                .settleForOrderStatus(ORDER, "APPROVED", "op");

        // occupyCage 的两个必然副作用都没发生 → 笼位保持 2、使用时间不写
        verify(reservationMapper, never()).markConsumed(any());
        verify(detail, never()).batchUpsert(any());
        verify(infoValue, never()).syncFromMapped(any(), any());
    }

    @Test
    void 普通单通过_照旧转饲养中并写使用时间() {
        CageCellDetailMapper detail = mock(CageCellDetailMapper.class);
        CageInfoValueService infoValue = mock(CageInfoValueService.class);
        CageOrderReservationMapper reservationMapper = mock(CageOrderReservationMapper.class);
        RefOrderMapper orderMapper = mock(RefOrderMapper.class);
        CageFormAuditService audit = mock(CageFormAuditService.class);

        RefOrder order = new RefOrder();
        order.setId(ORDER);
        order.setIsPreorder(0);
        when(orderMapper.findById(ORDER)).thenReturn(order);
        when(reservationMapper.listActiveByOrderId(ORDER)).thenReturn(List.of(reservation()));

        CageCellDetail d = new CageCellDetail();
        d.setAnimalCageId(CAGE);
        d.setCageTypeCode(2);
        when(detail.selectByAnimalCageId(CAGE)).thenReturn(d);

        service(detail, infoValue, reservationMapper, orderMapper, audit)
                .settleForOrderStatus(ORDER, "APPROVED", "op");

        verify(reservationMapper).markConsumed(RESERVATION);
        ArgumentCaptor<Map<String, Object>> cap = ArgumentCaptor.forClass(Map.class);
        verify(infoValue, times(2)).syncFromMapped(eq(CAGE), cap.capture());
        assertTrue(cap.getAllValues().stream().anyMatch(m -> m.containsKey("cage_use_time")),
                "普通单通过仍要写使用时间（无回归）");
    }
}
