package com.example.demo.common.support;

/**
 * 监控指标的**唯一**阈值来源。
 *
 * <p>为什么要有这个类：阈值原先散在两处 —— 前端 {@code MonitorResourceGauges.barColor} 硬编码
 * {@code >60 警告 / >80 危险}，后端只算百分比不判级 —— 两边必然漂移，而且前端一改就与后端不一致。
 * 现在由后端判级、随接口把 {@code level} 一起下发，前端只负责渲染颜色。
 *
 * <p>评分权重是**任意但固定**的：它们不代表物理规律，只代表「我们希望运维先看什么」。
 * 要调评分口径就改这里，别在别处再写一份。
 */
public final class Thresholds {

    public static final String OK = "ok";
    public static final String WARN = "warn";
    public static final String CRIT = "crit";

    // ── 资源指标（百分比）──
    public static final double WARN_PERCENT = 60.0;
    public static final double CRIT_PERCENT = 80.0;

    // ── 5xx 错误率 ──
    public static final double ERROR_RATE_WARN = 0.01;   // 1%
    public static final double ERROR_RATE_CRIT = 0.05;   // 5%

    // ── FULL GC 频率（次/分钟，取两次采样之间的增量）──
    public static final double FULL_GC_WARN_PER_MIN = 0.5;
    public static final double FULL_GC_CRIT_PER_MIN = 3.0;

    // ── 健康度评分权重（满分 100，只扣不加）──
    public static final int W_HEALTH_DOWN = 40;
    public static final int W_HEALTH_DEGRADED = 15;
    public static final int W_DISK = 20;
    public static final int W_HEAP = 20;
    public static final int W_SYS_MEM = 10;
    public static final int W_CPU = 10;
    public static final int W_HIKARI_PENDING = 10;
    public static final int W_FULL_GC = 5;
    public static final int W_ERROR_RATE = 15;
    public static final int W_JOB_FAILED = 10;

    // ── 评分 → 等级 ──
    public static final int SCORE_OK_MIN = 90;
    public static final int SCORE_WARN_MIN = 70;

    private Thresholds() {
    }

    /** 百分比 → 等级。 */
    public static String percentLevel(double percent) {
        return rateLevel(percent, WARN_PERCENT, CRIT_PERCENT);
    }

    /** 统一的分级：{@code <warn} 为 ok，{@code <crit} 为 warn，否则 crit。 */
    public static String rateLevel(double value, double warnAt, double critAt) {
        if (value >= critAt) {
            return CRIT;
        }
        if (value >= warnAt) {
            return WARN;
        }
        return OK;
    }

    /** 按等级取扣分：ok 不扣，warn 扣一半（至少 1），crit 扣满。 */
    public static int deduction(String level, int weight) {
        return switch (level) {
            case CRIT -> weight;
            case WARN -> Math.max(1, weight / 2);
            default -> 0;
        };
    }

    /** 总分 → 等级。 */
    public static String scoreLevel(int score) {
        if (score >= SCORE_OK_MIN) {
            return OK;
        }
        return score >= SCORE_WARN_MIN ? WARN : CRIT;
    }
}
