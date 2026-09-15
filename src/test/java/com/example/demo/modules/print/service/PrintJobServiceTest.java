package com.example.demo.modules.print.service;

import com.example.demo.modules.print.entity.PrintJob;
import com.example.demo.modules.print.entity.PrintStation;
import com.example.demo.modules.print.mapper.PrintJobMapper;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 打印任务状态机的编排契约。
 *
 * 注意这里**测不到**「并发领取只有一个人赢」—— 那条保证写在 SQL 的
 * {@code WHERE status='PENDING'} 里，不在 Java 逻辑里，mock 掉 Mapper 就看不见它。
 * 该不变量另行用两个真实连接抢同一行验证过（见实施计划的验收记录）。
 * 本文件只钉住：候选顺序、抢不到继续往下试、状态映射、入参校验。
 */
class PrintJobServiceTest {

    private static PrintStation station(String id, boolean enabled) {
        PrintStation s = new PrintStation();
        s.setId(id);
        s.setName("station-" + id);
        s.setUserId("user-" + id);
        s.setEnabled(enabled);
        return s;
    }

    private static PrintJob pending(String id) {
        PrintJob j = new PrintJob();
        j.setId(id);
        j.setStationId("PS_1");
        j.setSourceType(PrintJob.SOURCE_ADMIN_FILE);
        j.setSourceId("AFT_1");
        j.setFileName("t.pdf");
        j.setStatus(PrintJob.STATUS_PENDING);
        return j;
    }

    /** 抢到第一条就返回，不再往下试。 */
    @Test
    void claimOneStopsAtFirstWin() {
        PrintJobMapper mapper = mock(PrintJobMapper.class);
        PrintStationService stations = mock(PrintStationService.class);
        when(mapper.findPendingIds("PS_1", 5)).thenReturn(List.of("PJ_1", "PJ_2"));
        when(mapper.claim("PJ_1", "PS_1")).thenReturn(1);
        when(mapper.findById("PJ_1")).thenReturn(Optional.of(pending("PJ_1")));

        PrintJob got = new PrintJobService(mapper, stations).claimOne("PS_1");

        assertEquals("PJ_1", got.getId());
        verify(mapper, never()).claim(eq("PJ_2"), any());
    }

    /** 第一条被别人抢走了，要继续试第二条 —— 否则任务会卡在 PENDING 没人领。 */
    @Test
    void claimOneSkipsLostCandidateAndTriesNext() {
        PrintJobMapper mapper = mock(PrintJobMapper.class);
        PrintStationService stations = mock(PrintStationService.class);
        when(mapper.findPendingIds("PS_1", 5)).thenReturn(List.of("PJ_1", "PJ_2"));
        when(mapper.claim("PJ_1", "PS_1")).thenReturn(0);
        when(mapper.claim("PJ_2", "PS_1")).thenReturn(1);
        when(mapper.findById("PJ_2")).thenReturn(Optional.of(pending("PJ_2")));

        PrintJob got = new PrintJobService(mapper, stations).claimOne("PS_1");

        assertEquals("PJ_2", got.getId());
    }

    /** 全被抢光返回 null，工位页据此结束本轮循环。 */
    @Test
    void claimOneReturnsNullWhenAllLost() {
        PrintJobMapper mapper = mock(PrintJobMapper.class);
        PrintStationService stations = mock(PrintStationService.class);
        when(mapper.findPendingIds("PS_1", 5)).thenReturn(List.of("PJ_1"));
        when(mapper.claim("PJ_1", "PS_1")).thenReturn(0);

        assertNull(new PrintJobService(mapper, stations).claimOne("PS_1"));
    }

    /** 成功回执落 PRINTED 且不写错误原因。 */
    @Test
    void acknowledgeOkMapsToPrinted() {
        PrintJobMapper mapper = mock(PrintJobMapper.class);
        when(mapper.acknowledge("PJ_1", "PS_1", PrintJob.STATUS_PRINTED, null)).thenReturn(1);

        assertTrue(new PrintJobService(mapper, mock(PrintStationService.class))
                .acknowledge("PJ_1", "PS_1", true, null));
    }

    /** 失败回执落 FAILED 并带上原因。 */
    @Test
    void acknowledgeFailureKeepsReason() {
        PrintJobMapper mapper = mock(PrintJobMapper.class);
        when(mapper.acknowledge("PJ_1", "PS_1", PrintJob.STATUS_FAILED, "卡纸")).thenReturn(1);

        assertTrue(new PrintJobService(mapper, mock(PrintStationService.class))
                .acknowledge("PJ_1", "PS_1", false, "卡纸"));
    }

    /** 失败但没给原因时要有兜底文案，不能落空。 */
    @Test
    void acknowledgeFailureWithoutReasonFallsBack() {
        PrintJobMapper mapper = mock(PrintJobMapper.class);
        when(mapper.acknowledge("PJ_1", "PS_1", PrintJob.STATUS_FAILED, "工位报告打印失败")).thenReturn(1);

        assertTrue(new PrintJobService(mapper, mock(PrintStationService.class))
                .acknowledge("PJ_1", "PS_1", false, "   "));
    }

    /** 状态已经变过（比如超时被标 FAILED）时回执返回 false，不重复改状态。 */
    @Test
    void acknowledgeReturnsFalseWhenNothingChanged() {
        PrintJobMapper mapper = mock(PrintJobMapper.class);
        when(mapper.acknowledge(any(), any(), any(), any())).thenReturn(0);

        assertFalse(new PrintJobService(mapper, mock(PrintStationService.class))
                .acknowledge("PJ_1", "PS_1", true, null));
    }

    /** 重推只在 FAILED 上生效。 */
    @Test
    void retryOnlySucceedsWhenRowChanged() {
        PrintJobMapper mapper = mock(PrintJobMapper.class);
        when(mapper.retry("PJ_1")).thenReturn(1);
        when(mapper.retry("PJ_2")).thenReturn(0);
        PrintJobService service = new PrintJobService(mapper, mock(PrintStationService.class));

        assertTrue(service.retry("PJ_1"));
        assertFalse(service.retry("PJ_2"));
    }

    /** 建单：工位不存在要拦，否则任务建了永远没人领。 */
    @Test
    void createRejectsUnknownStation() {
        PrintStationService stations = mock(PrintStationService.class);
        when(stations.findById("PS_NOPE")).thenReturn(Optional.empty());

        PrintJobService service = new PrintJobService(mock(PrintJobMapper.class), stations);
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class, () ->
                service.create("PS_NOPE", PrintJob.SOURCE_ADMIN_FILE, "AFT_1", "t.pdf", 1, "u1"));
        assertEquals("工位不存在", e.getMessage());
    }

    /** 建单：工位停用要拦。 */
    @Test
    void createRejectsDisabledStation() {
        PrintStationService stations = mock(PrintStationService.class);
        when(stations.findById("PS_1")).thenReturn(Optional.of(station("PS_1", false)));

        PrintJobService service = new PrintJobService(mock(PrintJobMapper.class), stations);
        assertThrows(IllegalArgumentException.class, () ->
                service.create("PS_1", PrintJob.SOURCE_ADMIN_FILE, "AFT_1", "t.pdf", 1, "u1"));
    }

    /** 建单：不认识的来源类型要拦。 */
    @Test
    void createRejectsUnknownSourceType() {
        PrintStationService stations = mock(PrintStationService.class);
        when(stations.findById("PS_1")).thenReturn(Optional.of(station("PS_1", true)));

        PrintJobService service = new PrintJobService(mock(PrintJobMapper.class), stations);
        assertThrows(IllegalArgumentException.class, () ->
                service.create("PS_1", "SOMETHING_ELSE", "AFT_1", "t.pdf", 1, "u1"));
    }

    /** 建单：份数夹到 1..99，状态从 PENDING 起步。 */
    @Test
    void createClampsCopiesAndStartsPending() {
        PrintJobMapper mapper = mock(PrintJobMapper.class);
        PrintStationService stations = mock(PrintStationService.class);
        when(stations.findById("PS_1")).thenReturn(Optional.of(station("PS_1", true)));
        PrintJobService service = new PrintJobService(mapper, stations);

        PrintJob a = service.create("PS_1", PrintJob.SOURCE_CARD_ARCHIVE, "77", "c.pdf", 0, "u1");
        PrintJob b = service.create("PS_1", PrintJob.SOURCE_CARD_ARCHIVE, "77", "c.pdf", 500, "u1");

        assertEquals(1, a.getCopies());
        assertEquals(99, b.getCopies());
        assertEquals(PrintJob.STATUS_PENDING, a.getStatus());
        assertEquals(0, a.getAttempts());
        assertEquals(0, b.getAttempts());
        assertTrue(a.getId().startsWith("PJ_"));
    }
}
