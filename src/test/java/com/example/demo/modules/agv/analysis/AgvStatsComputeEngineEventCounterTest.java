package com.example.demo.modules.agv.analysis;

import com.example.demo.modules.agv.mapper.AgvStatsMapper;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import javax.sql.DataSource;
import java.time.LocalDateTime;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * 新增的 EVENT_COUNTER 类型：按事件类型计数、可限定车号、可带换算倍率。
 * 现有 COUNTER（站点访问）行为必须一点不变。
 */
class AgvStatsComputeEngineEventCounterTest {

    private static final String AGV1 = "172.22.159.16";
    private static final String AGV2 = "172.22.159.18";

    /** 笼盒清洗配置：只认 1 号车的抬臂行程，一次 = 80 个笼盒 */
    private static Map<String, Object> cageWashConfig() {
        Map<String, Object> cfg = new LinkedHashMap<>();
        cfg.put("id", 900L);
        cfg.put("config_type", "EVENT_COUNTER");
        cfg.put("pipeline_slug", "cage-wash");
        cfg.put("definition_json",
            "{\"eventTypes\":[\"FORK_RAISE_STROKE\"],\"robotIps\":[\"" + AGV1 + "\"],\"weight\":80}");
        return cfg;
    }

    private static Map<String, Object> event(long id, String type, String ip) {
        Map<String, Object> e = new LinkedHashMap<>();
        e.put("id", id);
        e.put("event_type", type);
        e.put("event_target", ip);
        e.put("robot_ip", ip);
        e.put("event_at", LocalDateTime.of(2026, 10, 8, 1, 0, (int) (id % 60)));
        return e;
    }

    /** 跑一次 tick，返回快照 upsert 收到的参数（按调用顺序）；没有 upsert 时返回空列表 */
    private static List<Map<String, Object>> runTick(AgvStatsMapper mapper, List<Map<String, Object>> events) {
        when(mapper.selectAllActiveConfigs()).thenReturn(List.of(cageWashConfig()));
        when(mapper.selectUnconsumedEvents(anyInt())).thenReturn(events);
        AgvStatsComputeEngine engine = new AgvStatsComputeEngine(
            mapper, mock(AgvStatsSseService.class), mock(DataSource.class));
        engine.tick();
        ArgumentCaptor<Map<String, Object>> cap = ArgumentCaptor.forClass(Map.class);
        verify(mapper, atMost(10)).upsertSnapshot(cap.capture());
        return cap.getAllValues();
    }

    @Test
    void strokeFromTargetRobot_addsWeight() {
        AgvStatsMapper mapper = mock(AgvStatsMapper.class);
        when(mapper.selectSnapshotsByConfigId(eq(900L))).thenReturn(Collections.emptyList());
        when(mapper.selectSnapshot(anyLong(), anyString())).thenReturn(null);

        List<Map<String, Object>> ups = runTick(mapper, List.of(event(1, "FORK_RAISE_STROKE", AGV1)));

        assertEquals(1, ups.size());
        assertEquals(80.0, (double) ups.get(0).get("currentValue"), 0.0001);
        assertEquals(AGV1, ups.get(0).get("metricKey"));
    }

    @Test
    void strokeFromOtherRobot_notCounted() {
        AgvStatsMapper mapper = mock(AgvStatsMapper.class);
        when(mapper.selectSnapshotsByConfigId(eq(900L))).thenReturn(Collections.emptyList());
        when(mapper.selectSnapshot(anyLong(), anyString())).thenReturn(null);

        runTick(mapper, List.of(event(2, "FORK_RAISE_STROKE", AGV2)));

        verify(mapper, never()).upsertSnapshot(any());
    }

    @Test
    void otherEventType_notCounted() {
        AgvStatsMapper mapper = mock(AgvStatsMapper.class);
        when(mapper.selectSnapshotsByConfigId(eq(900L))).thenReturn(Collections.emptyList());
        when(mapper.selectSnapshot(anyLong(), anyString())).thenReturn(null);

        runTick(mapper, List.of(event(3, "STATION_ENTER", AGV1)));

        verify(mapper, never()).upsertSnapshot(any());
    }

    /**
     * 没人认领的事件也必须被标成已消费。
     *
     * <p>引擎取事件是「未消费 + 按时间正序 + LIMIT 500」。若某类事件没有任何激活配置认领，
     * 它会一直堆在队首，把 500 条窗口占满，让站点/任务统计**静默永久停摆**
     * （本仓已踩过同类坑：过滤必须在 LIMIT 之前）。
     *
     * <p>本用例同时覆盖两种漏法：① 类型不对（STATION_ENTER 不属于笼盒清洗配置）；
     * ② 类型对但车号被 robotIps 过滤掉（2 号车的抬臂）。实测全车抬臂约 33 条/天，
     * 不做这一步，约 15 天就会堆满窗口。
     */
    @Test
    void unmatchedEventIsStillMarkedConsumed() {
        AgvStatsMapper mapper = mock(AgvStatsMapper.class);
        when(mapper.selectSnapshotsByConfigId(eq(900L))).thenReturn(Collections.emptyList());
        when(mapper.selectSnapshot(anyLong(), anyString())).thenReturn(null);

        runTick(mapper, List.of(
            event(11, "STATION_ENTER", AGV2),
            event(12, "FORK_RAISE_STROKE", AGV2)));

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<Long>> cap = ArgumentCaptor.forClass(List.class);
        verify(mapper).markEventsConsumedByIds(cap.capture());
        assertTrue(cap.getValue().containsAll(List.of(11L, 12L)),
            "未被任何配置认领的事件没被标成已消费，会堆在队首饿死其它统计：" + cap.getValue());
        verify(mapper, never()).upsertSnapshot(any());
    }

    /**
     * 本方法的核心语义是「在**既有值**上累加」。上面几个用例都把既有值 mock 成 0，
     * 只证明了「从 0 加到 80」，没证明累加本身 —— 这条专门钉住它。
     */
    @Test
    void accumulatesOntoExistingValue() {
        AgvStatsMapper mapper = mock(AgvStatsMapper.class);
        when(mapper.selectAllActiveConfigs()).thenReturn(List.of(cageWashConfig()));
        when(mapper.selectUnconsumedEvents(anyInt())).thenReturn(List.of(
            event(21, "FORK_RAISE_STROKE", AGV1)));
        when(mapper.selectSnapshotsByConfigId(eq(900L))).thenReturn(Collections.emptyList());
        Map<String, Object> existing = new LinkedHashMap<>();
        existing.put("current_value", 50.0);
        when(mapper.selectSnapshot(eq(900L), eq(AGV1))).thenReturn(existing);

        new AgvStatsComputeEngine(mapper, mock(AgvStatsSseService.class), mock(DataSource.class)).tick();

        ArgumentCaptor<Map<String, Object>> cap = ArgumentCaptor.forClass(Map.class);
        verify(mapper, times(1)).upsertSnapshot(cap.capture());
        assertEquals(130.0, (double) cap.getValue().get("currentValue"), 0.0001);
        assertEquals(50.0, (double) cap.getValue().get("lastValue"), 0.0001);
    }

    /**
     * **一个激活配置都没有时也必须排空队列**。
     *
     * <p>`tick()` 开头原本有一句「配置为空就直接 return」，位置在取事件**之前** ——
     * 于是零配置时事件照旧堆积，上面那条修复够不着。更糟的是配置一旦重新启用，
     * 积压的旧事件会被第一个 tick 一次性认领计数，`current_value` 出现与真实节律无关的突跳。
     */
    @Test
    void zeroActiveConfigs_stillDrainsEventQueue() {
        AgvStatsMapper mapper = mock(AgvStatsMapper.class);
        when(mapper.selectAllActiveConfigs()).thenReturn(Collections.emptyList());
        when(mapper.selectUnconsumedEvents(anyInt())).thenReturn(List.of(
            event(31, "STATION_ENTER", AGV1),
            event(32, "FORK_RAISE_STROKE", AGV1)));

        new AgvStatsComputeEngine(mapper, mock(AgvStatsSseService.class), mock(DataSource.class)).tick();

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<Long>> cap = ArgumentCaptor.forClass(List.class);
        verify(mapper).markEventsConsumedByIds(cap.capture());
        assertTrue(cap.getValue().containsAll(List.of(31L, 32L)),
            "没有激活配置时事件没被排空：" + cap.getValue());
        verify(mapper, never()).upsertSnapshot(any());
    }
}
