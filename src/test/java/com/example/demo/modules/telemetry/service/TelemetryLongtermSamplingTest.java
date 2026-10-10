package com.example.demo.modules.telemetry.service;

import com.example.demo.modules.telemetry.dto.TelemetrySnapshotDto;
import com.example.demo.modules.telemetry.dto.TelemetryTagItemDto;
import com.example.demo.modules.telemetry.entity.TelemetryLongtermSampleLogRow;
import com.example.demo.modules.telemetry.entity.TelemetryLongtermSampleRow;
import com.example.demo.modules.telemetry.entity.TelemetryLongtermVariableRow;
import com.example.demo.modules.telemetry.mapper.TelemetryLongtermSampleLogMapper;
import com.example.demo.modules.telemetry.mapper.TelemetryLongtermSampleMapper;
import com.example.demo.modules.telemetry.mapper.TelemetryLongtermVariableMapper;
import com.example.demo.modules.twin.common.mapper.TwinJobScheduleConfigMapper;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 采集一轮的结局。D6 口径：快照不可用**跳过并留痕**，绝不写假值。
 */
class TelemetryLongtermSamplingTest {

    private static final class Capture {
        List<TelemetryLongtermSampleRow> written = new ArrayList<>();
        List<TelemetryLongtermSampleLogRow> logs = new ArrayList<>();
    }

    private static TelemetryLongtermVariableMapper variableMapper(List<String> names) {
        TelemetryLongtermVariableMapper m = mock(TelemetryLongtermVariableMapper.class);
        List<TelemetryLongtermVariableRow> rows = new ArrayList<>();
        int i = 0;
        for (String n : names) {
            TelemetryLongtermVariableRow r = new TelemetryLongtermVariableRow();
            r.setWinccVariableName(n);
            r.setSortOrder(i++);
            r.setEnabled(true);
            rows.add(r);
        }
        when(m.selectAllOrdered()).thenReturn(rows);
        return m;
    }

    private static TelemetryLongtermArchiveService service(TelemetryLongtermVariableMapper vm,
                                                          TelemetrySnapshotDto snap,
                                                          Capture cap,
                                                          int staleMinutes) {
        TelemetryLongtermSampleMapper sm = mock(TelemetryLongtermSampleMapper.class);
        when(sm.insertBatch(any())).thenAnswer(inv -> {
            List<TelemetryLongtermSampleRow> list = inv.getArgument(0);
            cap.written.addAll(list);
            return list.size();
        });
        TelemetryLongtermSampleLogMapper lm = mock(TelemetryLongtermSampleLogMapper.class);
        when(lm.insert(any())).thenAnswer(inv -> {
            cap.logs.add(inv.getArgument(0));
            return 1;
        });
        TelemetrySnapshotService snapshotService = mock(TelemetrySnapshotService.class);
        when(snapshotService.getSnapshot()).thenReturn(snap);
        TelemetryLongtermArchiveService svc = new TelemetryLongtermArchiveService(vm, lm,
                mock(TelemetryWatchlistDbService.class), mock(TwinJobScheduleConfigMapper.class), sm, snapshotService);
        ReflectionTestUtils.setField(svc, "staleMinutes", staleMinutes);
        return svc;
    }

    private static TelemetryTagItemDto item(String name, String value, String room, String kind) {
        TelemetryTagItemDto it = new TelemetryTagItemDto();
        it.setVariableName(name);
        it.setValue(value);
        it.setRoomCanonical(room);
        it.setMetricKindCode(kind);
        it.setFloorCode("2F");
        it.setBundleCode("wincc-2f");
        return it;
    }

    private static TelemetrySnapshotDto snapshot(Instant fetchedAt, boolean reachable, TelemetryTagItemDto... items) {
        TelemetrySnapshotDto s = new TelemetrySnapshotDto();
        s.setFetchedAt(fetchedAt);
        s.setWinccReachable(reachable);
        s.setItems(List.of(items));
        return s;
    }

    @Test
    void writesOneRowPerSelectedVariableWithParsedValue() {
        Capture cap = new Capture();
        TelemetrySnapshotDto snap = snapshot(Instant.now(), true,
                item("VAR_A", "23.5 C", "2F-201", "TEMP"),
                item("VAR_B", "OFF", "2F-202", "TEMP"));
        TelemetryLongtermArchiveService svc = service(variableMapper(List.of("VAR_A", "VAR_B")), snap, cap, 30);

        var result = svc.runSamplingRound();

        assertEquals("OK", result.outcome());
        assertEquals(2, cap.written.size(), "两个变量各写一行");
        assertEquals(23.5, cap.written.get(0).getNumericValue(), 1e-9);
        assertEquals("OFF", cap.written.get(1).getRawValue());
        assertNull(cap.written.get(1).getNumericValue(), "不是数字就存原始串、数值留空");
        assertEquals(cap.written.get(0).getTickBatchId(), cap.written.get(1).getTickBatchId(), "同一轮共用一个批次号");
        assertEquals(1, cap.logs.size());
        assertEquals("OK", cap.logs.get(0).getOutcome());
    }

    @Test
    void skipsAndLogsWhenSnapshotTooOld() {
        Capture cap = new Capture();
        TelemetrySnapshotDto snap = snapshot(Instant.now().minusSeconds(3600), true, item("VAR_A", "1", "2F", "TEMP"));
        TelemetryLongtermArchiveService svc = service(variableMapper(List.of("VAR_A")), snap, cap, 30);

        var result = svc.runSamplingRound();

        assertEquals("SKIPPED", result.outcome());
        assertTrue(cap.written.isEmpty(), "过旧的快照不能写值行");
        assertEquals(1, cap.logs.size());
        assertEquals("SKIPPED", cap.logs.get(0).getOutcome());
        assertTrue(cap.logs.get(0).getReason().contains("过旧"));
    }

    @Test
    void skipsAndLogsWhenNotReachable() {
        Capture cap = new Capture();
        TelemetryLongtermArchiveService svc = service(variableMapper(List.of("VAR_A")),
                snapshot(Instant.now(), false, item("VAR_A", "1", "2F", "TEMP")), cap, 30);

        var result = svc.runSamplingRound();

        assertEquals("SKIPPED", result.outcome());
        assertTrue(cap.logs.get(0).getReason().contains("不可达"));
    }

    @Test
    void recordsMissingVariablesWithoutWritingNullRows() {
        Capture cap = new Capture();
        TelemetrySnapshotDto snap = snapshot(Instant.now(), true,
                item("VAR_A", "1", "2F", "TEMP"), item("VAR_B", "2", "2F", "TEMP"));
        TelemetryLongtermArchiveService svc = service(variableMapper(List.of("VAR_A", "VAR_B", "VAR_GONE")), snap, cap, 30);

        var result = svc.runSamplingRound();

        assertEquals(2, cap.written.size(), "缺的那个不写空行");
        assertEquals("OK", result.outcome());
        assertTrue(cap.logs.get(0).getReason().contains("1"), "缺几个要写进留痕原因");
    }

    @Test
    void skipsWhenNoVariableSelected() {
        Capture cap = new Capture();
        TelemetryLongtermArchiveService svc = service(variableMapper(List.of()),
                snapshot(Instant.now(), true), cap, 30);

        var result = svc.runSamplingRound();

        assertEquals("SKIPPED", result.outcome());
        assertTrue(cap.written.isEmpty());
    }
}
