package com.example.demo.modules.telemetry.service;

import com.example.demo.modules.telemetry.dto.longterm.TelemetryLongtermMatrixDto;
import com.example.demo.modules.telemetry.entity.TelemetryLongtermSampleRow;
import com.example.demo.modules.telemetry.entity.TelemetryLongtermVariableRow;
import com.example.demo.modules.telemetry.mapper.TelemetryLongtermSampleLogMapper;
import com.example.demo.modules.telemetry.mapper.TelemetryLongtermSampleMapper;
import com.example.demo.modules.telemetry.mapper.TelemetryLongtermVariableMapper;
import com.example.demo.modules.twin.common.mapper.TwinJobScheduleConfigMapper;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 按天矩阵：一天一张表、**行=变量、列=平分槽位**。
 *
 * <p>三条口径：
 * <ol>
 *   <li><b>列是槽位不是实际时刻</b>——实际采样会晚几秒到几分钟（要等采集），
 *       若拿实际时刻当列名，不同天/不同变量就对不齐（用户原话：时间错位）。
 *       所以归到最近的平分点，**但列头必须标出该槽的名义时间**。</li>
 *   <li>只列当天有数据的槽（不铺满全部槽位）；</li>
 *   <li>行只取当天有数据的变量，行序跟配置顺序（宽表列序也靠它）。</li>
 * </ol>
 */
class TelemetryLongtermMatrixTest {

    private static TelemetryLongtermSampleRow row(String var, LocalDateTime at, String raw) {
        TelemetryLongtermSampleRow r = new TelemetryLongtermSampleRow();
        r.setVariableName(var);
        r.setSampleAt(at);
        r.setRawValue(raw);
        r.setRoomCanonical("2F-201");
        r.setMetricKindCode("HUM");
        return r;
    }

    private static TelemetryLongtermVariableRow cfg(String var, int order, String label, String unit) {
        TelemetryLongtermVariableRow v = new TelemetryLongtermVariableRow();
        v.setWinccVariableName(var);
        v.setSortOrder(order);
        v.setDisplayLabel(label);
        v.setUnit(unit);
        v.setEnabled(true);
        return v;
    }

    private static TelemetryLongtermArchiveService service(List<TelemetryLongtermSampleRow> rows,
                                                          List<TelemetryLongtermVariableRow> vars) {
        TelemetryLongtermSampleMapper sm = mock(TelemetryLongtermSampleMapper.class);
        // mock 必须**尊重时间区间**：忽略它的话，「给了 day 只取那一天」的断言会假红（拿全部行来分组）
        when(sm.selectForExport(any(), any(), any(), anyInt())).thenAnswer(inv -> {
            LocalDateTime from = inv.getArgument(1);
            LocalDateTime to = inv.getArgument(2);
            return rows.stream()
                    .filter(r -> from == null || !r.getSampleAt().isBefore(from))
                    .filter(r -> to == null || !r.getSampleAt().isAfter(to))
                    .toList();
        });
        TelemetryLongtermVariableMapper vm = mock(TelemetryLongtermVariableMapper.class);
        when(vm.selectAllOrdered()).thenReturn(vars);
        // 调度行取不到 → 走策略默认值（本任务默认 7200 秒 = 一天 12 个槽）
        TwinJobScheduleConfigMapper scheduleMapper = mock(TwinJobScheduleConfigMapper.class);
        when(scheduleMapper.selectByJobKey(anyString())).thenReturn(null);
        return new TelemetryLongtermArchiveService(vm,
                mock(TelemetryLongtermSampleLogMapper.class),
                mock(TelemetryWatchlistDbService.class),
                scheduleMapper,
                sm,
                mock(TelemetrySnapshotService.class));
    }

    @Test
    void slotsAbsorbSamplingLatencyAndColumnsCarryNominalTime() {
        // 刻意采样在非整点：08:00:07 与 10:03，都要归到 08:00 / 10:00 这两个槽
        LocalDateTime d1a = LocalDateTime.of(2026, 10, 10, 8, 0, 7);
        LocalDateTime d1b = LocalDateTime.of(2026, 10, 10, 10, 3);
        LocalDateTime d2 = LocalDateTime.of(2026, 10, 9, 8, 0);
        TelemetryLongtermArchiveService svc = service(
                List.of(row("VAR_B", d1a, "2"), row("VAR_A", d1a, "1"),
                        row("VAR_A", d1b, "3"), row("VAR_A", d2, "9")),
                List.of(cfg("VAR_A", 0, "A 标签", "C"), cfg("VAR_B", 1, null, null)));

        TelemetryLongtermMatrixDto m = svc.queryMatrix(null, "2026-10", null, null);

        assertEquals(List.of("2026-10-10", "2026-10-09"), m.getDays(), "日期新的在前");

        var day1 = m.getDayTables().get(0);
        assertEquals(12, day1.getSlotCount(), "2 小时间隔 → 一天平分 12 个槽");
        assertEquals(2, day1.getColumns().size());
        assertEquals(4, day1.getColumns().get(0).getSlot());
        assertEquals("08:00", day1.getColumns().get(0).getTime(), "列头必须是该槽的名义时间点");
        assertEquals(5, day1.getColumns().get(1).getSlot(), "10:03 晚 3 分钟，仍归到 10:00 这个槽");
        assertEquals("10:00", day1.getColumns().get(1).getTime());

        assertEquals(2, day1.getRows().size());
        assertEquals("VAR_A", day1.getRows().get(0).getVariableName(), "行序跟配置顺序，不是插入顺序");
        assertEquals("A 标签", day1.getRows().get(0).getDisplayLabel());
        assertEquals("C", day1.getRows().get(0).getUnit());
        assertEquals("2F-201", day1.getRows().get(0).getRoomCanonical(),
                "房间要从样本带出来：表格第一列显示的是房间名，不是变量名");
        assertEquals("HUM", day1.getRows().get(0).getMetricKindCode());
        assertEquals(List.of("1", "3"), day1.getRows().get(0).getValues());
        // 注意用 Arrays.asList：List.of 不允许 null，而这个断言里就有一个空采样格
        assertEquals(java.util.Arrays.asList("2", null), day1.getRows().get(1).getValues(),
                "该槽没采到就是 null，不是「—」也不是 0");

        var day2 = m.getDayTables().get(1);
        assertEquals(1, day2.getColumns().size(), "不同天各自只列有数据的槽");
        assertEquals(4, day2.getColumns().get(0).getSlot(), "同一天同一时刻 → 同一个槽号（跨天可比）");
        assertEquals("9", day2.getRows().get(0).getValues().get(0));
    }

    @Test
    void skipsVariablesWithoutDataThatDay() {
        LocalDateTime t = LocalDateTime.of(2026, 10, 10, 8, 0);
        TelemetryLongtermArchiveService svc = service(List.of(row("VAR_A", t, "1")),
                List.of(cfg("VAR_A", 0, null, null), cfg("VAR_B", 1, null, null)));

        var day = svc.queryMatrix(null, "2026-10", null, null).getDayTables().get(0);

        assertEquals(1, day.getRows().size(), "当天一条都没有的变量不出行，否则整行都是空");
        assertEquals("VAR_A", day.getRows().get(0).getVariableName());
    }

    @Test
    void fallsBackToNumericValueWhenRawMissing() {
        LocalDateTime t = LocalDateTime.of(2026, 10, 10, 8, 0);
        TelemetryLongtermSampleRow r = row("VAR_A", t, null);
        r.setNumericValue(23.5);
        TelemetryLongtermArchiveService svc = service(List.of(r), List.of(cfg("VAR_A", 0, null, null)));

        var day = svc.queryMatrix(null, "2026-10", null, null).getDayTables().get(0);

        assertEquals("23.5", day.getRows().get(0).getValues().get(0));
    }

    @Test
    void dayParamLimitsToOneDay() {
        LocalDateTime d1 = LocalDateTime.of(2026, 10, 10, 8, 0);
        LocalDateTime d2 = LocalDateTime.of(2026, 10, 9, 8, 0);
        TelemetryLongtermArchiveService svc = service(
                List.of(row("VAR_A", d1, "1"), row("VAR_A", d2, "9")),
                List.of(cfg("VAR_A", 0, null, null)));

        var only9th = svc.queryMatrix("2026-10-09", null, null, null);

        assertEquals(List.of("2026-10-09"), only9th.getDays(), "给了 day 就只回那一天");
        assertEquals(1, only9th.getDayTables().size());
        assertEquals("9", only9th.getDayTables().get(0).getRows().get(0).getValues().get(0));
    }

    @Test
    void emptyWhenNoSamples() {
        TelemetryLongtermArchiveService svc = service(List.of(), List.of(cfg("VAR_A", 0, null, null)));

        TelemetryLongtermMatrixDto m = svc.queryMatrix(null, "2026-10", null, null);

        assertTrue(m.getDays().isEmpty());
        assertTrue(m.getDayTables().isEmpty());
    }
}
