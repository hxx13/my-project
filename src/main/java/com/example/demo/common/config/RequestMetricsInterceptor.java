package com.example.demo.common.config;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.time.LocalDate;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.atomic.LongAdder;

@Component
public class RequestMetricsInterceptor implements HandlerInterceptor {

    private static final Logger log = LoggerFactory.getLogger(RequestMetricsInterceptor.class);
    private static final int MAX_URL_ENTRIES = 10000;
    private static final int MAX_UA_ENTRIES = 5000;
    private static final int MAX_UNIQUE_VISITORS = 100000;
    private static final int MAX_URL404_ENTRIES = 5000;  // 404 paths are a small subset

    private final ConcurrentHashMap<String, LongAdder> statusCounts = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, LongAdder> urlCounts = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, LongAdder> url404Counts = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, LongAdder> responseTimeBuckets = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, LongAdder> uaCounts = new ConcurrentHashMap<>();
    private final LongAdder totalRequests = new LongAdder();
    private final ConcurrentHashMap<String, LocalDate> uniqueVisitors = new ConcurrentHashMap<>();

    /**
     * 今日独立访客计数。原来在 {@link #afterCompletion} 里用
     * {@code uniqueVisitors.values().stream().filter(...).count()} 求「今日已有多少」，
     * 那是**每个请求**一次 O(上限 10 万) 的全表扫描。改成计数器 + 跨日重置。
     */
    private final LongAdder todayVisitors = new LongAdder();
    private volatile LocalDate visitorDay = LocalDate.now();

    /** 延迟百分位统计；见 {@link RequestLatencyTracker} 的注释。 */
    private final RequestLatencyTracker latencyTracker;

    public RequestMetricsInterceptor(RequestLatencyTracker latencyTracker) {
        this.latencyTracker = latencyTracker;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        request.setAttribute("req.startTime", System.nanoTime());
        return true;
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response,
                                Object handler, Exception ex) {
        try {
            String uri = request.getRequestURI();
            int status = response.getStatus();
            String remoteAddr = request.getRemoteAddr();

            totalRequests.increment();

            // status distribution
            statusCounts.computeIfAbsent(String.valueOf(status), k -> new LongAdder()).increment();

            // URL counts (normalized)
            String normalized = normalizeUrl(uri);
            if (urlCounts.size() < MAX_URL_ENTRIES || urlCounts.containsKey(normalized)) {
                urlCounts.computeIfAbsent(normalized, k -> new LongAdder()).increment();
            } else {
                log.warn("[Metrics] urlCounts reached MAX_URL_ENTRIES={}, skipping", MAX_URL_ENTRIES);
            }

            // 404 URL tracking (separate from general URL counts, with capacity cap)
            if (status == 404) {
                if (url404Counts.size() < MAX_URL404_ENTRIES || url404Counts.containsKey(normalized)) {
                    url404Counts.computeIfAbsent(normalized, k -> new LongAdder()).increment();
                }
            }

            // response time bucket + 延迟百分位统计
            Long startNs = (Long) request.getAttribute("req.startTime");
            if (startNs != null) {
                long ms = (System.nanoTime() - startNs) / 1_000_000;
                responseTimeBuckets.computeIfAbsent(bucketFor(ms), k -> new LongAdder()).increment();
                // 复用上面已经算好的 normalized，不要再调一次 normalizeUrl
                latencyTracker.record(normalized, status, ms);
            }

            // User-Agent (truncated to 80 chars, no PII)
            String ua = request.getHeader("User-Agent");
            if (ua != null && !ua.isEmpty()) {
                String truncated = ua.length() > 80 ? ua.substring(0, 80) : ua;
                if (uaCounts.size() < MAX_UA_ENTRIES || uaCounts.containsKey(truncated)) {
                    uaCounts.computeIfAbsent(truncated, k -> new LongAdder()).increment();
                }
            }

            // unique visitors（按 IP+日期去重，只统计今日）。O(1)，不再全表扫。
            if (remoteAddr != null && !remoteAddr.isEmpty()) {
                LocalDate today = rollVisitorDay();
                LocalDate prev = uniqueVisitors.get(remoteAddr);
                if (!today.equals(prev) && todayVisitors.sum() < MAX_UNIQUE_VISITORS) {
                    uniqueVisitors.put(remoteAddr, today);
                    todayVisitors.increment();
                }
            }
        } catch (Throwable t) {
            log.error("[Metrics] afterCompletion failed for uri={}", request.getRequestURI(), t);
        }
    }

    public Snapshot getSnapshot() {
        return new Snapshot(
            totalRequests.sum(),
            uniqueVisitorCount(),
            copyStatusDistribution(),
            copyResponseTimeBuckets(),
            topNUrls(urlCounts, 10, "path"),
            topNUrls(url404Counts, 10, "path"),
            topNUrls(uaCounts, 5, "ua")
        );
    }

    // -- helpers --

    private String normalizeUrl(String requestUri) {
        int q = requestUri.indexOf('?');
        String path = q >= 0 ? requestUri.substring(0, q) : requestUri;
        return path
            .replaceAll("/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", "/{uuid}")
            .replaceAll("/[0-9a-f]{24}", "/{objectId}")
            .replaceAll("/\\d{10,}", "/{timestamp}")
            .replaceAll("/\\d+", "/{id}");
    }

    private String bucketFor(long ms) {
        if (ms <= 10) return "0-10";
        if (ms <= 50) return "10-50";
        if (ms <= 100) return "50-100";
        if (ms <= 200) return "100-200";
        if (ms <= 500) return "200-500";
        if (ms <= 1000) return "500-1000";
        if (ms <= 3000) return "1000-3000";
        return "3000+";
    }

    /** 跨日则重置今日访客计数；返回今天。请求路径与取快照都先调它。 */
    private LocalDate rollVisitorDay() {
        LocalDate today = LocalDate.now();
        if (!today.equals(visitorDay)) {
            visitorDay = today;
            todayVisitors.reset();
        }
        return today;
    }

    private long uniqueVisitorCount() {
        rollVisitorDay();
        return todayVisitors.sum();
    }

    private Map<String, Long> copyStatusDistribution() {
        Map<String, Long> m = new LinkedHashMap<>();
        statusCounts.forEach((k, v) -> m.put(k, v.sum()));
        return m;
    }

    private Map<String, Long> copyResponseTimeBuckets() {
        Map<String, Long> m = new LinkedHashMap<>();
        String[] keys = {"0-10","10-50","50-100","100-200","200-500","500-1000","1000-3000","3000+"};
        for (String key : keys) {
            LongAdder adder = responseTimeBuckets.get(key);
            m.put(key, adder != null ? adder.sum() : 0L);
        }
        return m;
    }

    private List<Map<String, Object>> topNUrls(ConcurrentMap<String, LongAdder> map, int n, String keyField) {
        return map.entrySet().stream()
            .sorted((a, b) -> Long.compare(b.getValue().sum(), a.getValue().sum()))
            .limit(n)
            .map(e -> {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put(keyField, e.getKey());
                m.put("count", e.getValue().sum());
                return m;
            })
            .collect(java.util.stream.Collectors.toList());
    }

    @Scheduled(cron = "0 3 3 * * ?")  // 3:03 AM daily
    public void cleanupOldVisitors() {
        try {
            LocalDate today = LocalDate.now();
            uniqueVisitors.entrySet().removeIf(e -> !today.equals(e.getValue()));
            log.debug("[Metrics] uniqueVisitors cleanup done, remaining={}", uniqueVisitors.size());
        } catch (Throwable t) {
            log.error("[Metrics] cleanupOldVisitors failed", t);
        }
    }

    public record Snapshot(
        long totalRequests,
        long uniqueVisitors,
        Map<String, Long> statusDistribution,
        Map<String, Long> responseTimeBuckets,
        List<Map<String, Object>> topUrls,
        List<Map<String, Object>> top404Urls,
        List<Map<String, Object>> topUserAgents
    ) {}
}
