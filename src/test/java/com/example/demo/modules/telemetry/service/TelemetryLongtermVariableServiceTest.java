package com.example.demo.modules.telemetry.service;

import com.example.demo.modules.telemetry.dto.longterm.TelemetryLongtermPlanDto;
import com.example.demo.modules.telemetry.dto.longterm.TelemetryLongtermVariableDto;
import com.example.demo.modules.telemetry.entity.TelemetryLongtermVariableRow;
import com.example.demo.modules.telemetry.mapper.TelemetryLongtermSampleLogMapper;
import com.example.demo.modules.telemetry.mapper.TelemetryLongtermSampleMapper;
import com.example.demo.modules.telemetry.mapper.TelemetryLongtermVariableMapper;
import com.example.demo.modules.twin.common.mapper.TwinJobScheduleConfigMapper;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 变量保存：整份替换 + sortOrder 按提交顺序重排。
 * 造行用**真实返回类型**（TelemetryLongtermVariableRow），别用 Map —— 用 Map 会把
 * 「取值方式的类型假设」一起盖住，测试全绿、真机 ClassCastException（踩过）。
 */
class TelemetryLongtermVariableServiceTest {

    /** 记录 insertBatch 收到了什么。 */
    private static final class CapturingMapper implements TelemetryLongtermVariableMapper {
        List<TelemetryLongtermVariableRow> captured = new ArrayList<>();
        int deleteCount = 0;
        List<TelemetryLongtermVariableRow> current = new ArrayList<>();

        @Override
        public List<TelemetryLongtermVariableRow> selectAllOrdered() {
            return current;
        }

        @Override
        public int deleteAll() {
            deleteCount++;
            return 0;
        }

        @Override
        public int insertBatch(List<TelemetryLongtermVariableRow> list) {
            captured = new ArrayList<>(list);
            return list.size();
        }
    }

    private static TelemetryLongtermArchiveService service(CapturingMapper mapper) {
        return new TelemetryLongtermArchiveService(mapper, Mockito.mock(TelemetryLongtermSampleLogMapper.class),
                Mockito.mock(TelemetryWatchlistDbService.class),
                Mockito.mock(TwinJobScheduleConfigMapper.class),
                Mockito.mock(TelemetryLongtermSampleMapper.class),
                Mockito.mock(TelemetrySnapshotService.class));
    }

    @Test
    void saveVariablesRenumbersSortOrderAndReplacesAll() {
        CapturingMapper mapper = new CapturingMapper();
        TelemetryLongtermArchiveService svc = service(mapper);

        TelemetryLongtermVariableDto a = new TelemetryLongtermVariableDto();
        a.setWinccVariableName("VAR_A");
        a.setSortOrder(99); // 提交里带了乱七八糟的顺序，应以数组顺序为准
        a.setEnabled(true);
        TelemetryLongtermVariableDto b = new TelemetryLongtermVariableDto();
        b.setWinccVariableName("VAR_B");
        b.setEnabled(false);

        svc.saveVariables(List.of(a, b));

        assertEquals(1, mapper.deleteCount, "整份替换必须先清空");
        assertEquals(2, mapper.captured.size());
        assertEquals("VAR_A", mapper.captured.get(0).getWinccVariableName());
        assertEquals(0, mapper.captured.get(0).getSortOrder());
        assertEquals("VAR_B", mapper.captured.get(1).getWinccVariableName());
        assertEquals(1, mapper.captured.get(1).getSortOrder());
        assertEquals(Boolean.FALSE, mapper.captured.get(1).getEnabled());
    }

    @Test
    void saveVariablesSkipsBlankNames() {
        CapturingMapper mapper = new CapturingMapper();
        TelemetryLongtermArchiveService svc = service(mapper);

        TelemetryLongtermVariableDto blank = new TelemetryLongtermVariableDto();
        blank.setWinccVariableName("  ");
        TelemetryLongtermVariableDto ok = new TelemetryLongtermVariableDto();
        ok.setWinccVariableName("VAR_C");

        svc.saveVariables(List.of(blank, ok));

        assertEquals(1, mapper.captured.size());
        assertEquals("VAR_C", mapper.captured.get(0).getWinccVariableName());
        assertTrue(mapper.deleteCount == 1);
    }

    @Test
    void getPlanViewDoesNotThrowWhenScheduleMissing() {
        CapturingMapper mapper = new CapturingMapper();
        TelemetryLongtermSampleLogMapper logMapper = Mockito.mock(TelemetryLongtermSampleLogMapper.class);
        Mockito.when(logMapper.selectRecent(Mockito.anyInt())).thenReturn(List.of());
        TwinJobScheduleConfigMapper scheduleMapper = Mockito.mock(TwinJobScheduleConfigMapper.class);
        Mockito.when(scheduleMapper.selectByJobKey(Mockito.anyString())).thenReturn(null);
        TelemetryLongtermSampleMapper sampleMapper = Mockito.mock(TelemetryLongtermSampleMapper.class);
        Mockito.when(sampleMapper.countByFilter(null, null, null)).thenReturn(7L);
        TelemetryLongtermArchiveService svc = new TelemetryLongtermArchiveService(
                mapper, logMapper, Mockito.mock(TelemetryWatchlistDbService.class), scheduleMapper,
                sampleMapper, Mockito.mock(TelemetrySnapshotService.class));

        TelemetryLongtermPlanDto plan = svc.getPlanView();

        assertFalse(plan.isScheduleEnabled(), "定时管理没有那一行时应视为未启用");
        assertEquals(0, plan.getVariableCount());
        assertEquals(7L, plan.getSampleRows(), "累计样本行数应从 sampleMapper 计数回填，而不是恒为 0");
        assertTrue(plan.getRecentRuns().isEmpty());
    }
}
