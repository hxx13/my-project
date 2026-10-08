package com.example.demo.modules.admin.service;

import com.example.demo.common.support.Thresholds;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;

/**
 * 健康度评分：把分散的指标压成一个 0–100 的数，**并且给出扣分原因**。
 *
 * <p>设计取舍：只给一个分数而不给明细，是没用的 —— 看到 82 分你并不知道该去修什么。
 * 所以每个因子都带 {@code level / weight / deduction}，前端直接渲染，不重复判阈值。
 *
 * <p>评分是「100 分起、只扣不加」，权重集中在 {@link Thresholds}，属**任意但固定**：
 * 改权重就等于改口径，别在第二处再写一遍。
 *
 * <p>打分逻辑是**纯函数**（{@link #compute(Inputs)} 只依赖入参），唯一的状态是 FULL GC 的采样基线 ——
 * 累计值必须两次采样相减才是「频率」，所以调用方每次取分时喂入当前累计值即可。
 */
@Service
public class MonitorScoreService {

    /** 上次采样到的累计 FULL GC 次数与时刻。首次为 -1/0，表示还没有基线。 */
    private final AtomicLong lastFullGc = new AtomicLong(-1);
    private final AtomicLong lastFullGcAt = new AtomicLong(0);

    /**
     * 把累计 FULL GC 次数换算成「次/分钟」。首次调用没有基线，返回 -1 表示未知（不扣分、也不假装是 0）。
     */
    public double fullGcPerMinute(long currentFullGc) {
        long now = System.currentTimeMillis();
        long prev = lastFullGc.getAndSet(currentFullGc);
        long prevAt = lastFullGcAt.getAndSet(now);
        if (prev < 0 || prevAt <= 0 || now <= prevAt) {
            return -1;
        }
        long delta = currentFullGc - prev;
        if (delta < 0) {
            return -1;                    // 计数器回退（进程重启）→ 视为未知
        }
        return delta * 60_000.0 / (now - prevAt);
    }

    /** 打分的全部输入。由调用方从已有数据凑齐，便于单测直接构造。 */
    public record Inputs(
            int healthDown,
            int healthDegraded,
            double heapPercent,
            double sysMemPercent,
            double diskPercent,
            double cpuPercent,
            long hikariPending,
            double fullGcPerMinute,
            int failedJobs,
            long totalRequests,
            long error5xx
    ) {
    }

    public Map<String, Object> compute(Inputs in) {
        List<Map<String, Object>> factors = new ArrayList<>();
        int[] total = {0};

        // 1) 服务健康：DOWN 最重，DEGRADED 次之（两者权重不同，不走「warn 减半」的通用规则）
        String healthLevel = in.healthDown() > 0 ? Thresholds.CRIT
                : in.healthDegraded() > 0 ? Thresholds.WARN : Thresholds.OK;
        int healthWeight = Thresholds.W_HEALTH_DOWN;
        int healthDeduction = in.healthDown() > 0 ? Thresholds.W_HEALTH_DOWN
                : in.healthDegraded() > 0 ? Thresholds.W_HEALTH_DEGRADED : 0;
        addFactor(factors, total, "health", "服务健康",
                in.healthDown() + " DOWN / " + in.healthDegraded() + " DEGRADED",
                healthLevel, healthWeight, healthDeduction);

        // 2) 资源四项：统一百分比分级
        addPercent(factors, total, "disk", "磁盘", in.diskPercent(), Thresholds.W_DISK);
        addPercent(factors, total, "heap", "JVM 堆", in.heapPercent(), Thresholds.W_HEAP);
        addPercent(factors, total, "sysMem", "系统内存", in.sysMemPercent(), Thresholds.W_SYS_MEM);
        addPercent(factors, total, "cpu", "进程 CPU", in.cpuPercent(), Thresholds.W_CPU);

        // 3) 连接池排队：有人在等连接就是问题，等 5 个以上算严重
        String hikariLevel = in.hikariPending() >= 5 ? Thresholds.CRIT
                : in.hikariPending() > 0 ? Thresholds.WARN : Thresholds.OK;
        addFactor(factors, total, "hikari", "HikariCP 排队",
                in.hikariPending() + " 个线程等待连接",
                hikariLevel, Thresholds.W_HIKARI_PENDING,
                Thresholds.deduction(hikariLevel, Thresholds.W_HIKARI_PENDING));

        // 4) FULL GC 频率（-1 = 还没有基线）
        String gcLevel = in.fullGcPerMinute() < 0 ? Thresholds.OK
                : Thresholds.rateLevel(in.fullGcPerMinute(),
                        Thresholds.FULL_GC_WARN_PER_MIN, Thresholds.FULL_GC_CRIT_PER_MIN);
        addFactor(factors, total, "fullGc", "FULL GC 频率",
                in.fullGcPerMinute() < 0 ? "尚未取样" : String.format("%.2f 次/分钟", in.fullGcPerMinute()),
                gcLevel, Thresholds.W_FULL_GC,
                Thresholds.deduction(gcLevel, Thresholds.W_FULL_GC));

        // 5) 5xx 错误率（没有请求时无意义，跳过）
        double errorRate = in.totalRequests() > 0 ? (double) in.error5xx() / in.totalRequests() : 0;
        String errLevel = Thresholds.rateLevel(errorRate,
                Thresholds.ERROR_RATE_WARN, Thresholds.ERROR_RATE_CRIT);
        addFactor(factors, total, "errorRate", "5xx 错误率",
                String.format("%.2f%%（%d/%d）", errorRate * 100, in.error5xx(), in.totalRequests()),
                errLevel, Thresholds.W_ERROR_RATE,
                Thresholds.deduction(errLevel, Thresholds.W_ERROR_RATE));

        // 6) 定时任务失败
        String jobLevel = in.failedJobs() >= 3 ? Thresholds.CRIT
                : in.failedJobs() > 0 ? Thresholds.WARN : Thresholds.OK;
        addFactor(factors, total, "jobs", "定时任务失败",
                in.failedJobs() + " 个任务失败",
                jobLevel, Thresholds.W_JOB_FAILED,
                Thresholds.deduction(jobLevel, Thresholds.W_JOB_FAILED));

        int score = Math.max(0, 100 - total[0]);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("score", score);
        out.put("level", Thresholds.scoreLevel(score));
        out.put("factors", factors);
        return out;
    }

    private static void addPercent(List<Map<String, Object>> factors, int[] total,
                                   String key, String label, double percent, int weight) {
        String level = Thresholds.percentLevel(percent);
        addFactor(factors, total, key, label, String.format("%.1f%%", percent),
                level, weight, Thresholds.deduction(level, weight));
    }

    private static void addFactor(List<Map<String, Object>> out, int[] total,
                                  String key, String label, String value,
                                  String level, int weight, int deduction) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("key", key);
        m.put("label", label);
        m.put("value", value);
        m.put("level", level);
        m.put("weight", weight);
        m.put("deduction", deduction);
        out.add(m);
        total[0] += deduction;
    }
}
