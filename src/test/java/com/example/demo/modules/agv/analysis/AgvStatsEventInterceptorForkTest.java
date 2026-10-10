package com.example.demo.modules.agv.analysis;

import com.example.demo.modules.agv.mapper.AgvStatsMapper;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * 拦截器识别叉臂行程：低位跨到高位发一条 FORK_RAISE_STROKE，回落再抬再发一条。
 */
class AgvStatsEventInterceptorForkTest {

    private static final String AGV1 = "172.22.159.16";

    private static Map<String, Object> row(double forkHeight, int second) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("robot_ip", AGV1);
        m.put("recorded_at", LocalDateTime.of(2026, 10, 8, 1, 0, second));
        m.put("station", null);
        m.put("task_status", 4);
        m.put("odo", 0.0);
        m.put("fork_height", forkHeight);
        return m;
    }

    private static List<Map<String, Object>> eventsOfType(AgvStatsMapper mapper, String type) {
        ArgumentCaptor<Map<String, Object>> cap = ArgumentCaptor.forClass(Map.class);
        verify(mapper, atLeastOnce()).insertEvent(cap.capture());
        List<Map<String, Object>> hits = new ArrayList<>();
        for (Map<String, Object> e : cap.getAllValues()) {
            if (type.equals(e.get("eventType"))) hits.add(e);
        }
        return hits;
    }

    @Test
    void oneLiftEmitsOneStrokeEvent() {
        AgvStatsMapper mapper = mock(AgvStatsMapper.class);
        when(mapper.selectActiveRobotIps(any())).thenReturn(List.of(AGV1));
        when(mapper.selectTrajectoryAfter(eq(AGV1), any(), anyInt())).thenReturn(List.of(
            row(0.0, 0), row(0.016, 1), row(0.051, 2), row(0.059, 3), row(0.059, 4)));

        new AgvStatsEventInterceptor(mapper).pollAndEmit();

        List<Map<String, Object>> strokes = eventsOfType(mapper, "FORK_RAISE_STROKE");
        assertEquals(1, strokes.size());
        assertEquals(AGV1, strokes.get(0).get("robotIp"));
    }

    @Test
    void twoLiftsEmitTwoStrokeEvents() {
        AgvStatsMapper mapper = mock(AgvStatsMapper.class);
        when(mapper.selectActiveRobotIps(any())).thenReturn(List.of(AGV1));
        when(mapper.selectTrajectoryAfter(eq(AGV1), any(), anyInt())).thenReturn(List.of(
            row(0.0, 0), row(0.059, 1), row(0.004, 2), row(0.0, 3),
            row(0.059, 4), row(0.004, 5), row(0.0, 6)));

        new AgvStatsEventInterceptor(mapper).pollAndEmit();

        assertEquals(2, eventsOfType(mapper, "FORK_RAISE_STROKE").size());
    }

    @Test
    void noLiftEmitsNoStrokeEvent() {
        AgvStatsMapper mapper = mock(AgvStatsMapper.class);
        when(mapper.selectActiveRobotIps(any())).thenReturn(List.of(AGV1));
        when(mapper.selectTrajectoryAfter(eq(AGV1), any(), anyInt())).thenReturn(List.of(
            row(0.0, 0), row(-0.0001, 1), row(0.0001, 2), row(0.0, 3)));

        new AgvStatsEventInterceptor(mapper).pollAndEmit();

        assertEquals(0, eventsOfType(mapper, "FORK_RAISE_STROKE").size());
    }

    /**
     * 增量起点必须是 **UTC 墙钟**。
     *
     * <p>轨迹里的 recorded_at 存的是 UTC 墙钟，而 JVM 默认时区被设成了 Asia/Shanghai；
     * 若这里用 LocalDateTime.now()（北京墙钟），查询条件会比库里所有时间戳快 8 小时、
     * 一行都查不出来，站点/任务/叉臂事件会全部静默停止产出。
     * 这条用例把口径钉死：断言传给 mapper 的 since 应当接近「UTC 现在 − 5 分钟」。
     */
    @Test
    void catchUpSinceUsesUtcWallClock() {
        AgvStatsMapper mapper = mock(AgvStatsMapper.class);
        when(mapper.selectActiveRobotIps(any())).thenReturn(List.of(AGV1));
        when(mapper.selectTrajectoryAfter(eq(AGV1), any(), anyInt())).thenReturn(Collections.emptyList());

        new AgvStatsEventInterceptor(mapper).pollAndEmit();

        ArgumentCaptor<LocalDateTime> cap = ArgumentCaptor.forClass(LocalDateTime.class);
        verify(mapper).selectTrajectoryAfter(eq(AGV1), cap.capture(), anyInt());

        LocalDateTime expected = LocalDateTime.now(ZoneOffset.UTC).minusMinutes(5);
        long offMinutes = Math.abs(Duration.between(expected, cap.getValue()).toMinutes());
        assertTrue(offMinutes <= 1,
            "增量起点不是 UTC 墙钟（与「UTC 现在 − 5 分钟」差了 " + offMinutes + " 分钟）：" + cap.getValue());
    }
}
