package com.example.demo.common.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedDeque;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.LongAdder;

/**
 * 请求延迟统计：全局与「按端点」的响应时间百分位、以及最近慢请求。
 *
 * <p>为什么要它：原来只有 8 档固定分桶（{@link RequestMetricsInterceptor#getSnapshot()} 的
 * responseTimeBuckets），既没有百分位也没有端点维度 —— 结果是「哪个接口慢」必须靠翻 nginx
 * 访问日志和慢查询日志人工查。这个类是给监控页回答那个问题的。
 *
 * <p>算法取舍：每端点一条 <b>固定容量环形缓冲</b>（存 int 毫秒），而不是每端点一套分桶。
 * 环形缓冲的尾部（p95/p99）精度远好于粗分桶，而「最近 N 次」的天然时效性对运维页正合适。
 * 代价是内存：{@code MAX_ENDPOINTS × SAMPLE_CAPACITY × 4B}，默认 200×512×4 ≈ 410 KB，有界。
 *
 * <p>热路径（{@code afterCompletion}，每个请求都走）：一次 {@code computeIfAbsent}（首次之后
 * 退化为一次 get）、一次原子自增、一次数组写入 —— <b>O(1) 且首次之后零分配</b>。
 * 百分位只在 {@link #snapshot(int)} 时算（监控页 300 秒轮询一次），绝不排在请求路径上：
 * 200 条 × 排序 512 个 int，是毫秒级。
 *
 * <p>并发：允许轻微的精度损失 —— 并发覆写同一个槽位会得到一个「撕裂」样本，
 * 读取时边写边复制也可能读到重复值。对监控页可接受，换取的是热路径上无锁。
 */
@Component
public class RequestLatencyTracker {

    private static final Logger log = LoggerFactory.getLogger(RequestLatencyTracker.class);

    /** 跟踪的端点数上限；超限后只继续统计已见过的端点（与拦截器 MAX_URL_ENTRIES 同一套做法）。 */
    private static final int MAX_ENDPOINTS = 200;
    /** 每端点环形缓冲容量，必须是 2 的幂（用 & (CAP-1) 取模）。 */
    private static final int SAMPLE_CAPACITY = 512;
    /** 全局环形缓冲容量，同样是 2 的幂。全局只留一条，不按端点。 */
    private static final int GLOBAL_CAPACITY = 4096;
    /** 慢请求列表上限。 */
    private static final int MAX_SLOW = 50;
    /** 超过这个毫秒数才算「慢请求」，进 {@code slowRequests}。 */
    private static final long SLOW_MS = 1000;

    private final ConcurrentHashMap<String, Series> endpoints = new ConcurrentHashMap<>();
    private final Series global = new Series(GLOBAL_CAPACITY);
    private final ConcurrentLinkedDeque<Map<String, Object>> slow = new ConcurrentLinkedDeque<>();
    private volatile boolean capWarned;

    /**
     * 记录一次请求的耗时。{@code path} 必须是<b>已归一化</b>的路径
     * （即 RequestMetricsInterceptor.normalizeUrl 的结果），否则端点会爆炸式增长。
     */
    public void record(String path, int status, long ms) {
        if (path == null || path.isEmpty()) {
            return;
        }
        int clamped = ms < 0 ? 0 : (ms > Integer.MAX_VALUE ? Integer.MAX_VALUE : (int) ms);
        global.record(clamped);

        Series series;
        if (endpoints.size() >= MAX_ENDPOINTS) {
            series = endpoints.get(path);           // 只继续统计已见过的端点
            if (series == null && !capWarned) {
                capWarned = true;
                log.warn("[latency] 已跟踪端点数达到上限 {}, 新端点不再计入延迟统计", MAX_ENDPOINTS);
            }
        } else {
            series = endpoints.computeIfAbsent(path, k -> new Series(SAMPLE_CAPACITY));
        }
        if (series != null) {
            series.record(clamped);
        }

        if (ms > SLOW_MS) {
            addSlow(path, status, clamped);
        }
    }

    private void addSlow(String path, int status, int ms) {
        Map<String, Object> e = new LinkedHashMap<>();
        e.put("path", path);
        e.put("status", status);
        e.put("ms", ms);
        e.put("ts", System.currentTimeMillis());
        slow.addFirst(e);                            // 最新在前
        while (slow.size() > MAX_SLOW) {
            slow.pollLast();
        }
    }

    /** 取快照；{@code topN} 为按 p95 降序返回的端点数。 */
    public LatencySnapshot snapshot(int topN) {
        List<Map<String, Object>> eps = new ArrayList<>();
        for (Map.Entry<String, Series> e : endpoints.entrySet()) {
            eps.add(e.getValue().stats(e.getKey()));
        }
        eps.sort(Comparator.comparingLong((Map<String, Object> m) -> asLong(m.get("p95"))).reversed());
        if (eps.size() > topN) {
            eps = new ArrayList<>(eps.subList(0, topN));
        }
        return new LatencySnapshot(global.stats(null), eps, new ArrayList<>(slow));
    }

    private static long asLong(Object o) {
        return o instanceof Number n ? n.longValue() : 0L;
    }

    /** 一个环形缓冲序列（全局一条，每端点一条）。 */
    private static final class Series {
        private final int[] samples;
        private final int mask;
        private final AtomicLong cursor = new AtomicLong();
        private final LongAdder count = new LongAdder();
        private final LongAdder sumMs = new LongAdder();
        private final AtomicLong maxMs = new AtomicLong();

        Series(int capacity) {
            this.samples = new int[capacity];
            this.mask = capacity - 1;
        }

        void record(int ms) {
            long seq = cursor.getAndIncrement();
            samples[(int) (seq & mask)] = ms;        // 并发覆写会产生撕裂样本，监控场景可接受
            count.increment();
            sumMs.add(ms);
            maxMs.accumulateAndGet(ms, Math::max);
        }

        /**
         * 计算统计量。{@code label} 非空时结果里带 {@code path} 键（端点用），为空则不带（全局用）。
         * 只在取快照时调用。
         */
        Map<String, Object> stats(String label) {
            long n = count.sum();
            Map<String, Object> m = new LinkedHashMap<>();
            if (label != null) {
                m.put("path", label);
            }
            m.put("count", n);
            m.put("p50", percentile(50));
            m.put("p95", percentile(95));
            m.put("p99", percentile(99));
            m.put("avg", n > 0 ? sumMs.sum() / n : 0L);
            m.put("max", maxMs.get());
            return m;
        }

        /**
         * nearest-rank 百分位。只复制「已写入的槽位」：游标从 0 顺序递增，故 count &lt; 容量时
         * 有效区间就是 [0, count)，容量用满后整条数组都有效。
         */
        private long percentile(int p) {
            long n = count.sum();
            if (n <= 0) {
                return 0L;
            }
            int valid = (int) Math.min(n, samples.length);
            int[] copy = Arrays.copyOf(samples, valid);
            Arrays.sort(copy);
            int rank = (int) Math.ceil(p / 100.0 * valid);
            int idx = Math.min(Math.max(rank - 1, 0), valid - 1);
            return copy[idx];
        }
    }

    /** 监控页读的快照。{@code global} 与 {@code endpoints} 的每个元素都含 count/p50/p95/p99/avg/max。 */
    public record LatencySnapshot(
            Map<String, Object> global,
            List<Map<String, Object>> endpoints,
            List<Map<String, Object>> slowRequests
    ) {}
}
