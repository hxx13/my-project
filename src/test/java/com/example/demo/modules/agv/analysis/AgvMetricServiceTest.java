package com.example.demo.modules.agv.analysis;

import com.example.demo.modules.agv.mapper.AgvStatsMapper;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * 每日封存口径：
 * <ol>
 *   <li>笼盒 = 当天叉臂行程数 × 80（扫轨迹用同一个识别器算，不数事件 —— 历史天根本没有事件）；</li>
 *   <li>里程 = 六台车各一条 + 合计一条；</li>
 *   <li>回填幂等：当天已有行就跳过，不覆盖。</li>
 * </ol>
 */
class AgvMetricServiceTest {

    /** 抓某天写入的某个指标值 */
    private static Double dailyValue(List<Map<String, Object>> calls, String date, String key) {
        for (Map<String, Object> c : calls) {
            if (date.equals(c.get("statDate")) && key.equals(c.get("metricKey"))) {
                return (Double) c.get("metricValue");
            }
        }
        return null;
    }

    @Test
    void freezeDay_writesCagesAndDistance() {
        AgvStatsMapper mapper = mock(AgvStatsMapper.class);
        when(mapper.selectForkHeights(eq("172.22.159.16"), any(), any())).thenReturn(List.of(
            0.0, 0.059, 0.004, 0.0, 0.0, 0.059, 0.004, 0.0));
        when(mapper.selectOdoDelta(anyString(), any(), any())).thenReturn(1000.0);

        new AgvMetricService(mapper).freezeDay(LocalDate.of(2026, 10, 8), "BACKFILL");

        ArgumentCaptor<String> date = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> key = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<Double> val = ArgumentCaptor.forClass(Double.class);
        verify(mapper, times(8)).upsertDailyMetric(date.capture(), key.capture(), val.capture(), anyString());

        List<Map<String, Object>> written = new ArrayList<>();
        for (int i = 0; i < date.getAllValues().size(); i++) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("statDate", date.getAllValues().get(i));
            m.put("metricKey", key.getAllValues().get(i));
            m.put("metricValue", val.getAllValues().get(i));
            written.add(m);
        }

        assertEquals(160.0, dailyValue(written, "2026-10-08", "CAGE_WASH_TOTAL"), 0.0001);
        assertEquals(6000.0, dailyValue(written, "2026-10-08", "ODO_TOTAL"), 0.0001);
        assertEquals(1000.0, dailyValue(written, "2026-10-08", "ODO_BY_ROBOT:172.22.159.16"), 0.0001);
        assertEquals(1000.0, dailyValue(written, "2026-10-08", "ODO_BY_ROBOT:172.22.159.115"), 0.0001);
    }

    @Test
    void freezeDay_skipsWhenDayAlreadyFrozen() {
        AgvStatsMapper mapper = mock(AgvStatsMapper.class);
        when(mapper.countDailyMetricsForDate("2026-10-08")).thenReturn(8);

        new AgvMetricService(mapper).freezeDay(LocalDate.of(2026, 10, 8), "BACKFILL");

        verify(mapper, never()).upsertDailyMetric(anyString(), anyString(), anyDouble(), anyString());
    }

    @Test
    void beijingDayBounds_areUtcWallClock() {
        // 北京日 D 的数据落在 UTC 墙钟 [D-1 16:00, D 16:00)
        LocalDateTime[] b = AgvMetricService.beijingDayUtcBounds(LocalDate.of(2026, 10, 8));
        assertEquals(LocalDateTime.of(2026, 10, 7, 16, 0), b[0]);
        assertEquals(LocalDateTime.of(2026, 10, 8, 16, 0), b[1]);
    }
}
