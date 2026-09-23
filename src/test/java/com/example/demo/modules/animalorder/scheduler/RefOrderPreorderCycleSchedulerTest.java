package com.example.demo.modules.animalorder.scheduler;

import com.example.demo.modules.animalorder.service.CageOrderReservationService;
import com.example.demo.modules.notification.push.dispatch.PushService;
import com.example.demo.modules.referencedata.entity.CageOrderReservation;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import java.time.LocalDate;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 预约单周期推进调度器：到期扫描 + 结构幂等。
 *
 * <p>幂等不靠任何标记：扫的只是 status='LOCKED' 的预定，而 promote → markConsumed 会把该行翻成
 * CONSUMED（mapper 里 WHERE status='LOCKED' 兜底），所以同一笼位本轮推进一次，下一轮扫描自然不再命中。
 * 见 {@code RefOrderPreorderCycleScheduler} 类注释。
 */
class RefOrderPreorderCycleSchedulerTest {

    private static RefOrderPreorderCycleScheduler.DueReservation due(long orderId, long reservationId, long cageId) {
        return new RefOrderPreorderCycleScheduler.DueReservation(
                orderId, "STAFF_1", "组A", LocalDate.of(2026, 9, 23), reservationId, cageId,
                "{\"animal_sex\":\"雌性\"}");
    }

    @Test
    void 扫描SQL只捞LOCKED且已到期的预约单() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        RefOrderPreorderCycleScheduler scheduler = new RefOrderPreorderCycleScheduler(
                jdbc, mock(CageOrderReservationService.class), mock(PushService.class));
        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        when(jdbc.query(sql.capture(), any(RowMapper.class), any(Object[].class))).thenReturn(List.of());

        scheduler.scanDue(LocalDate.of(2026, 9, 23));

        String s = sql.getValue();
        assertTrue(s.contains("r.status = 'LOCKED'"), "只扫仍 LOCKED 的预定 → 已 CONSUMED 的永不命中（幂等）");
        assertTrue(s.contains("o.is_preorder = 1"));
        assertTrue(s.contains("o.status = 'APPROVED'"));
        assertTrue(s.contains("o.estimated_delivery_date <= ?"), "只扫已到期的 → 未到到货周期的跳过");
    }

    @Test
    void 跑两轮每笼只推进一次() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        CageOrderReservationService svc = mock(CageOrderReservationService.class);
        PushService push = mock(PushService.class);
        RefOrderPreorderCycleScheduler scheduler = new RefOrderPreorderCycleScheduler(jdbc, svc, push);

        // 第一轮扫描命中；markConsumed 已把该行翻成 CONSUMED，第二轮扫描为空 —— 这就是结构幂等
        AtomicInteger scans = new AtomicInteger();
        when(jdbc.query(anyString(), any(RowMapper.class), any(Object[].class)))
                .thenAnswer(inv -> scans.getAndIncrement() == 0 ? List.of(due(1L, 9L, 200L)) : List.of());

        scheduler.advanceCycles();
        scheduler.advanceCycles();

        verify(svc, times(1)).promote(any(CageOrderReservation.class), anyString());
        verify(push, times(1)).send(eq("REF_ORDER_PREORDER_CYCLE"), any(), any());
    }

    @Test
    void 无到期预约单时不动作() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        CageOrderReservationService svc = mock(CageOrderReservationService.class);
        PushService push = mock(PushService.class);
        RefOrderPreorderCycleScheduler scheduler = new RefOrderPreorderCycleScheduler(jdbc, svc, push);
        when(jdbc.query(anyString(), any(RowMapper.class), any(Object[].class))).thenReturn(List.of());

        scheduler.advanceCycles();

        verify(svc, never()).promote(any(), anyString());
        verify(push, never()).send(anyString(), any(), any());
    }

    @Test
    void 一单多笼位_每笼推进一次但只推一条通知() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        CageOrderReservationService svc = mock(CageOrderReservationService.class);
        PushService push = mock(PushService.class);
        RefOrderPreorderCycleScheduler scheduler = new RefOrderPreorderCycleScheduler(jdbc, svc, push);
        when(jdbc.query(anyString(), any(RowMapper.class), any(Object[].class)))
                .thenReturn(List.of(due(1L, 9L, 200L), due(1L, 10L, 201L)));

        scheduler.advanceCycles();

        verify(svc, times(2)).promote(any(CageOrderReservation.class), anyString());
        verify(push, times(1)).send(eq("REF_ORDER_PREORDER_CYCLE"), any(), any());
    }
}
