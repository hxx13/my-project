package com.example.demo.modules.twin.scan.support;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;

/**
 * {@code GET /api/v1/twin/scan/analyze} 全链路分段耗时：仅输出 ARO 与慢步骤，避免低耗时 MySQL 刷屏。
 * <p>异步线程（如并行 ARO）须使用 {@link #stepForTrace(String, String, long, String)}。</p>
 */
@Component
public class ScanAnalyzeTimingTrace {

    private static final Logger log = LoggerFactory.getLogger(ScanAnalyzeTimingTrace.class);

    @Value("${app.scan.analyze-timing-console:true}")
    private boolean consoleEnabled;

    /** 非 ARO 步骤低于此毫秒不打印分段/汇总行 */
    @Value("${app.scan.analyze-timing-console-min-ms:300}")
    private long segmentMinMs;

    private final ConcurrentHashMap<String, Ctx> activeTraces = new ConcurrentHashMap<>();
    private final ThreadLocal<String> currentTraceId = new ThreadLocal<>();

    public void open(String traceId, String inputKey) {
        String tid = traceId == null ? "?" : traceId;
        Ctx c = new Ctx();
        c.traceId = tid;
        c.inputKey = inputKey == null ? "" : inputKey.trim();
        c.startMs = System.currentTimeMillis();
        activeTraces.put(tid, c);
        currentTraceId.set(tid);
    }

    public boolean isActive() {
        return currentTraceId.get() != null;
    }

    public void step(String phase, long costMs, String detail) {
        String tid = currentTraceId.get();
        if (tid != null) {
            stepForTrace(tid, phase, costMs, detail);
        }
    }

    /** 供 {@code CompletableFuture} 等子线程写入，避免 ThreadLocal 丢失。 */
    public void stepForTrace(String traceId, String phase, long costMs, String detail) {
        if (traceId == null || traceId.isBlank()) {
            return;
        }
        Ctx c = activeTraces.get(traceId);
        if (c == null) {
            return;
        }
        String det = detail == null ? "" : detail.trim();
        c.steps.add(new Step(phase, costMs, det));
        if (shouldEmitSegment(phase, costMs)) {
            emit(formatLine(c.traceId, phase, costMs, det));
        }
    }

    public <T> T timed(String phase, Supplier<T> action) {
        long t0 = System.currentTimeMillis();
        try {
            return action.get();
        } finally {
            step(phase, System.currentTimeMillis() - t0, "");
        }
    }

    public void close(long totalMs) {
        String tid = currentTraceId.get();
        if (tid == null) {
            return;
        }
        Ctx c = activeTraces.remove(tid);
        currentTraceId.remove();
        if (c == null) {
            return;
        }
        List<Step> report = c.steps.stream()
                .filter(s -> shouldEmitSegment(s.phase, s.costMs))
                .sorted(Comparator.comparingLong((Step s) -> s.costMs).reversed())
                .toList();
        if (!consoleEnabled || report.isEmpty()) {
            return;
        }
        String header = String.format(
                "========== [扫码·analyze 耗时汇总] trace=%s input=%s total=%dms 慢步骤=%d (阈值非ARO>=%dms) ==========",
                c.traceId, abbrev(c.inputKey, 40), totalMs, report.size(), segmentMinMs);
        emit(header);
        int rank = 1;
        for (Step s : report) {
            emit(String.format("  #%d  %6d ms  %-52s %s",
                    rank++, s.costMs, s.phase, s.detail.isEmpty() ? "" : s.detail));
        }
        emit("======================================================================");
    }

    private boolean shouldEmitSegment(String phase, long costMs) {
        if (!consoleEnabled) {
            return false;
        }
        if (isAroPhase(phase)) {
            return true;
        }
        return costMs >= segmentMinMs;
    }

    private static boolean isAroPhase(String phase) {
        if (phase == null) {
            return false;
        }
        return phase.startsWith("aro.")
                || phase.contains("aro.GET")
                || phase.contains("aro.POST")
                || phase.contains("aroParallel");
    }

    private void emit(String line) {
        // 使用 log.debug 输出 timing trace
        log.debug(line);
    }

    private static String formatLine(String traceId, String phase, long costMs, String detail) {
        String d = detail == null || detail.isBlank() ? "" : " " + detail.trim();
        return String.format("[扫码·analyze·分段] trace=%s ms=%d phase=%s%s", traceId, costMs, phase, d);
    }

    private static String abbrev(String s, int max) {
        if (s == null || s.isBlank()) {
            return "—";
        }
        String t = s.trim();
        return t.length() <= max ? t : t.substring(0, max - 1) + "…";
    }

    private static final class Ctx {
        String traceId;
        String inputKey;
        long startMs;
        final List<Step> steps = new ArrayList<>();
    }

    private static final class Step {
        final String phase;
        final long costMs;
        final String detail;

        Step(String phase, long costMs, String detail) {
            this.phase = phase;
            this.costMs = costMs;
            this.detail = detail;
        }
    }
}
