package com.example.demo.modules.agv.analysis;

import java.util.HashMap;
import java.util.Map;

/**
 * AGV 叉臂「抬臂行程」识别器 —— 纯逻辑、无 Spring、可单测。
 *
 * <h3>为什么不能按帧计数</h3>
 * 叉臂高度是连续浮点、逐帧上报的，一次抬臂会跨越几十帧。
 * 2026-10-10 用 1 号车实测：逐帧计数是行程数的 3.8～10.4 倍，**倍数随当天动作快慢变化**，
 * 除以固定系数修不回来（画成曲线会是锯齿）。所以按「低位 → 高位的跨越」计一次。
 *
 * <h3>阈值依据（实测，不是拍脑袋）</h3>
 * 1 号车 108 万行带叉臂高度的样本里只有两个平台：低位集中在 -0.0001 / 0.0，
 * 高位集中在 0.059 / 0.067。阈值取两个平台之间的空档 —— 高位 ≥ {@value #HIGH_THRESHOLD}、
 * 低位 ≤ {@value #LOW_THRESHOLD}，都不挨着平台，平台上的正常抖动不会来回穿越。
 *
 * <p>**区别于** {@code AgvPrimitiveDetector}：那个类按**帧增量**产出 FORK_RAISE / FORK_LOWER
 * （原始原语，服务于回放与分析），阈值 0.001；本类按**整段行程**计数，阈值 0.02 / 0.005。
 * 同包里两套口径并存是有意的，**不要合并**，改了任一边都别去动另一边。
 *
 * <p>线程模型：与 {@code AgvStatsEventInterceptor} 同线程使用，未做并发保护。
 */
public class AgvForkStrokeDetector {

    /** 判定「已抬到高位」的下沿 */
    public static final double HIGH_THRESHOLD = 0.02;
    /** 判定「已回到低位」的上沿。与高位阈值之间留出迟滞带，防平台抖动重复计 */
    public static final double LOW_THRESHOLD = 0.005;

    /** 每台车当前是否处于高位 */
    private final Map<String, Boolean> atHigh = new HashMap<>();

    /**
     * 喂一帧。
     *
     * @return true 表示这一帧完成了「低位 → 高位」的跨越，即**一次抬臂行程**
     */
    public boolean feed(String robotIp, Double forkHeight) {
        if (robotIp == null || forkHeight == null || !Double.isFinite(forkHeight)) {
            return false;
        }
        if (Boolean.TRUE.equals(atHigh.get(robotIp))) {
            if (forkHeight <= LOW_THRESHOLD) {
                atHigh.put(robotIp, false);
            }
            return false;
        }
        if (forkHeight >= HIGH_THRESHOLD) {
            atHigh.put(robotIp, true);
            return true;
        }
        return false;
    }
}
