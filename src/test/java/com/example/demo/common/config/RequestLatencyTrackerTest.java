package com.example.demo.common.config;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 请求延迟统计的闸门。
 *
 * <p>为什么要它有：{@link RequestLatencyTracker} 的百分位是 **nearest-rank 近似**，而且环形缓冲
 * 会覆写旧样本 —— 这两处一旦写错，监控页给出的就是**看起来合理但错的数字**。
 * 「数字错了」比「没有数字」更危险，因为它会让人照着错的方向去优化。
 *
 * <p>不启动 Spring，直接 new；纯逻辑、毫秒级。
 */
class RequestLatencyTrackerTest {

    private static Map<String, Object> latencyOf(RequestLatencyTracker t, String path) {
        return t.snapshot(200).endpoints().stream()
                .filter(m -> path.equals(m.get("path")))
                .findFirst()
                .orElseThrow(() -> new AssertionError("端点未出现在快照里: " + path));
    }

    private static long num(Map<String, Object> m, String k) {
        return ((Number) m.get(k)).longValue();
    }

    /** 1..100 毫秒各一次：nearest-rank 下 p50=50、p95=95、p99=99、max=100、avg=50。 */
    @Test
    void percentileIsNearestRank() {
        RequestLatencyTracker t = new RequestLatencyTracker();
        for (int i = 1; i <= 100; i++) {
            t.record("/api/x", 200, i);
        }

        Map<String, Object> e = latencyOf(t, "/api/x");
        assertEquals(100L, num(e, "count"), "计数");
        assertEquals(50L, num(e, "p50"), "p50");
        assertEquals(95L, num(e, "p95"), "p95");
        assertEquals(99L, num(e, "p99"), "p99");
        assertEquals(100L, num(e, "max"), "max");
        assertEquals(50L, num(e, "avg"), "avg = 5050/100");
    }

    /**
     * 容量 512 的环形缓冲写 600 次后，只应保留**最后 512 次**（值 89..600），count 仍是 600。
     * 这条专门锁住「覆写旧样本」的语义 —— 写成保留最早 512 次的话 p50 会是另一个数。
     */
    @Test
    void ringBufferKeepsMostRecentSamples() {
        RequestLatencyTracker t = new RequestLatencyTracker();
        for (int i = 1; i <= 600; i++) {
            t.record("/api/y", 200, i);
        }

        Map<String, Object> e = latencyOf(t, "/api/y");
        assertEquals(600L, num(e, "count"), "count 记总次数");
        assertEquals(600L, num(e, "max"), "max 取历史最大");
        // 有效样本 = 89..600（512 个），p50 → rank=256 → sorted[255] = 89+255 = 344
        assertEquals(344L, num(e, "p50"), "p50 只反映最近 512 次");
    }

    /** 慢请求阈值 1000ms：只有 >1000 才进列表，且最新在前、总数有上限。 */
    @Test
    void slowRequestsOnlyOverThresholdNewestFirst() {
        RequestLatencyTracker t = new RequestLatencyTracker();
        t.record("/api/fast", 200, 999);      // 不算慢
        t.record("/api/slow-a", 500, 1500);
        t.record("/api/slow-b", 500, 2000);

        List<Map<String, Object>> slow = t.snapshot(200).slowRequests();
        assertEquals(2, slow.size(), "999ms 不该入列");
        assertEquals("/api/slow-b", slow.get(0).get("path"), "最新的一条在最前");
        assertEquals(2000L, num(slow.get(0), "ms"));
        assertEquals(500L, num(slow.get(0), "status"), "慢请求要带状态码");
    }

    /** 端点数有硬上限：超限后新端点不再计入（内存有界），已见过的端点继续统计。 */
    @Test
    void endpointCountIsCapped() {
        RequestLatencyTracker t = new RequestLatencyTracker();
        for (int i = 0; i < 260; i++) {
            t.record("/api/ep/" + i, 200, 10);
        }
        for (int i = 0; i < 260; i++) {
            t.record("/api/ep/" + i, 200, 20);   // 复访：已见过的仍应被统计
        }

        List<Map<String, Object>> eps = t.snapshot(1000).endpoints();
        assertTrue(eps.size() <= 200, "端点数应被 MAX_ENDPOINTS 封顶，实际 " + eps.size());
    }

    /** 全局序列跨端点聚合；端点列表按 p95 降序（监控页默认就看最慢的）。 */
    @Test
    void globalAggregatesAndEndpointsSortedByP95Desc() {
        RequestLatencyTracker t = new RequestLatencyTracker();
        for (int i = 0; i < 10; i++) {
            t.record("/api/fast2", 200, 5);
        }
        for (int i = 0; i < 10; i++) {
            t.record("/api/slow2", 200, 900);
        }

        var snap = t.snapshot(200);
        assertEquals(20L, num(snap.global(), "count"), "全局计数 = 两端点之和");
        assertEquals("/api/slow2", snap.endpoints().get(0).get("path"), "按 p95 降序，慢的在前");
        assertEquals("/api/fast2", snap.endpoints().get(1).get("path"));
    }
}
