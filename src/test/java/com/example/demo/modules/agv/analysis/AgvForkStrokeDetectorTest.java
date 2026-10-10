package com.example.demo.modules.agv.analysis;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 叉臂「抬臂行程」口径。
 *
 * <p>真实取值形状（2026-10-10 实测 1 号车 108 万行）：低位集中在 -0.0001 / 0.0，
 * 高位集中在 0.059 / 0.067，中间是连续 0.0001 步进的过渡帧。
 */
class AgvForkStrokeDetectorTest {

    private static final String AGV1 = "172.22.159.16";
    private static final String AGV2 = "172.22.159.18";

    private static int count(AgvForkStrokeDetector d, String ip, double... heights) {
        int n = 0;
        for (double h : heights) {
            if (d.feed(ip, h)) n++;
        }
        return n;
    }

    @Test
    void oneLiftCountsOnce_transitionFramesDoNot() {
        AgvForkStrokeDetector d = new AgvForkStrokeDetector();
        // 0 → 0.059 的完整抬臂，中间几十个过渡帧只算一次
        assertEquals(1, count(d, AGV1, 0.0, -0.0001, 0.004, 0.016, 0.033, 0.051, 0.059, 0.059));
    }

    @Test
    void highPlateauJitterDoesNotRecount() {
        AgvForkStrokeDetector d = new AgvForkStrokeDetector();
        // 高位平台上下的正常抖动（0.059 ↔ 0.0588 / 0.0592）不能来回穿越
        assertEquals(1, count(d, AGV1, 0.0, 0.059, 0.0588, 0.0592, 0.0589, 0.0591, 0.059));
    }

    @Test
    void lowNoiseDoesNotCount() {
        AgvForkStrokeDetector d = new AgvForkStrokeDetector();
        // 低位噪声（-0.0001 / 0 / 0.0001）不该被当成抬臂
        assertEquals(0, count(d, AGV1, 0.0, -0.0001, 0.0001, 0.0, -0.0001, 0.0002, 0.0));
    }

    @Test
    void valueInsideHysteresisBandFromLowSideDoesNotCount() {
        AgvForkStrokeDetector d = new AgvForkStrokeDetector();
        // 0.01 落在迟滞带 (LOW=0.005, HIGH=0.02) 内部：从低位出发不该算抬臂。
        // 这条专门钉死迟滞带的两端 —— 没有它，把两个阈值常量互换也能全绿。
        assertEquals(0, count(d, AGV1, 0.0, 0.01, 0.0, 0.01, 0.0));
    }

    @Test
    void twoFullLiftsCountTwice() {
        AgvForkStrokeDetector d = new AgvForkStrokeDetector();
        assertEquals(2, count(d, AGV1,
            0.0, 0.059, 0.059, 0.030, 0.004, 0.0,      // 第一次：抬到位 → 落回低位
            0.0, 0.059, 0.059, 0.030, 0.004, 0.0));    // 第二次
    }

    @Test
    void continuedRiseAboveHighPlateauStillCountsOnce() {
        AgvForkStrokeDetector d = new AgvForkStrokeDetector();
        // 升到 0.059 没停又升到 0.067，中间不回落 → 仍是同一次行程
        assertEquals(1, count(d, AGV1, 0.0, 0.059, 0.061, 0.065, 0.067, 0.0694));
    }

    @Test
    void robotsAreTrackedIndependently() {
        AgvForkStrokeDetector d = new AgvForkStrokeDetector();
        assertTrue(d.feed(AGV1, 0.059));   // 1 号车首次抬到高位 → 计一次
        assertTrue(d.feed(AGV2, 0.059));   // 2 号车首次抬到高位 → 也计一次（状态按车隔离，没被 1 号车带跑）
        assertFalse(d.feed(AGV2, 0.059));  // 2 号车仍处高位 → 不再计
        assertFalse(d.feed(AGV1, 0.058));  // 1 号车仍处高位 → 不再计（1 号车也没被 2 号车带跑）
    }

    @Test
    void nullAndNonFiniteIgnored() {
        AgvForkStrokeDetector d = new AgvForkStrokeDetector();
        assertFalse(d.feed(AGV1, null));
        assertFalse(d.feed(null, 0.059));
        assertFalse(d.feed(AGV1, Double.NaN));
        assertFalse(d.feed(AGV1, Double.POSITIVE_INFINITY));
    }
}
