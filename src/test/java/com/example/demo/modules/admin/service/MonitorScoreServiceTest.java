package com.example.demo.modules.admin.service;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * 健康度评分的闸门。
 *
 * <p>为什么要它：评分是「100 起只扣不加」，权重一旦被误改，页面上的分数会**看起来依然合理**
 * 但已经不对了。而且恶化路径没法在真机上安全复现（不能为了测试去停 MySQL / 打满磁盘），
 * 所以用构造入参直接验证扣分模型 —— 打分是纯函数，这样验得更准也更安全。
 */
class MonitorScoreServiceTest {

    private final MonitorScoreService service = new MonitorScoreService();

    private static MonitorScoreService.Inputs healthy() {
        return new MonitorScoreService.Inputs(
                0, 0,            // healthDown, healthDegraded
                20.0, 30.0, 40.0, 5.0,   // heap, sysMem, disk, cpu 百分比
                0,               // hikariPending
                -1,              // fullGcPerMinute：-1 = 还没基线
                0,               // failedJobs
                1000, 0);        // totalRequests, error5xx
    }

    private static int score(Map<String, Object> r) {
        return ((Number) r.get("score")).intValue();
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> factor(Map<String, Object> r, String key) {
        return ((List<Map<String, Object>>) r.get("factors")).stream()
                .filter(m -> key.equals(m.get("key")))
                .findFirst()
                .orElseThrow(() -> new AssertionError("没有这个因子: " + key));
    }

    /** 全绿：100 分、ok。GC 没有基线时不扣分，也不假装是 0。 */
    @Test
    void allHealthyScoresHundred() {
        Map<String, Object> r = service.compute(healthy());
        assertEquals(100, score(r));
        assertEquals("ok", r.get("level"));
        assertEquals("ok", factor(r, "fullGc").get("level"), "没有基线时不应扣分");
        assertEquals(0, ((Number) factor(r, "fullGc").get("deduction")).intValue());
    }

    /** warn 只扣一半（至少 1）：堆 70% → warn → W_HEAP(20)/2 = 10。 */
    @Test
    void warnLevelCostsHalfWeight() {
        Map<String, Object> r = service.compute(new MonitorScoreService.Inputs(
                0, 0, 70.0, 30.0, 40.0, 5.0, 0, -1, 0, 1000, 0));
        assertEquals("warn", factor(r, "heap").get("level"));
        assertEquals(10, ((Number) factor(r, "heap").get("deduction")).intValue());
        assertEquals(90, score(r));
    }

    /** DEGRADED 扣 15（不走「warn 减半」的通用规则）—— 这条专门锁住那个显式权重。 */
    @Test
    void degradedHealthCostsFifteenNotHalfOfDown() {
        Map<String, Object> r = service.compute(new MonitorScoreService.Inputs(
                0, 1, 20.0, 30.0, 40.0, 5.0, 0, -1, 0, 1000, 0));
        assertEquals("warn", factor(r, "health").get("level"));
        assertEquals(15, ((Number) factor(r, "health").get("deduction")).intValue());
        assertEquals(85, score(r));
    }

    /** 多项同时恶化要能叠加：MySQL DOWN(40) + 磁盘 90%(20) + 5xx 10%(15) = 75 → 25 分、crit。 */
    @Test
    void multipleProblemsAccumulate() {
        Map<String, Object> r = service.compute(new MonitorScoreService.Inputs(
                1, 0,                 // 一个服务 DOWN
                20.0, 30.0, 90.0, 5.0, // 磁盘 90%
                0, -1, 0,
                1000, 100));          // 1000 次请求里 100 个 5xx = 10%
        assertEquals(40, ((Number) factor(r, "health").get("deduction")).intValue());
        assertEquals(20, ((Number) factor(r, "disk").get("deduction")).intValue());
        assertEquals(15, ((Number) factor(r, "errorRate").get("deduction")).intValue());
        assertEquals(25, score(r));
        assertEquals("crit", r.get("level"));
    }

    /** 连接池排队与失败任务：有人等连接(>=5)算严重，失败任务 >=3 算严重。 */
    @Test
    void hikariAndJobFailuresEscalate() {
        Map<String, Object> r = service.compute(new MonitorScoreService.Inputs(
                0, 0, 20.0, 30.0, 40.0, 5.0,
                7,          // 7 个线程在等连接
                -1,
                3,          // 3 个任务失败
                1000, 0));
        assertEquals("crit", factor(r, "hikari").get("level"));
        assertEquals(10, ((Number) factor(r, "hikari").get("deduction")).intValue());
        assertEquals("crit", factor(r, "jobs").get("level"));
        assertEquals(10, ((Number) factor(r, "jobs").get("deduction")).intValue());
        assertEquals(80, score(r));
    }

    /** 分数不会为负：把所有项都打到最差。 */
    @Test
    void scoreNeverGoesNegative() {
        Map<String, Object> r = service.compute(new MonitorScoreService.Inputs(
                5, 5, 99.0, 99.0, 99.0, 99.0, 50, 10.0, 10, 100, 100));
        assertEquals(0, score(r));
        assertEquals("crit", r.get("level"));
    }

    /** FULL GC 频率用 rateLevel 判级，两个采样点之间才算得出频率。 */
    @Test
    void fullGcRateIsLevelled() {
        Map<String, Object> r = service.compute(new MonitorScoreService.Inputs(
                0, 0, 20.0, 30.0, 40.0, 5.0, 0, 10.0, 0, 1000, 0));
        assertEquals("crit", factor(r, "fullGc").get("level"));
        assertEquals(5, ((Number) factor(r, "fullGc").get("deduction")).intValue());
    }
}
