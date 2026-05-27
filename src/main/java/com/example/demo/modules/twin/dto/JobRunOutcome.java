package com.example.demo.modules.twin.dto;

import java.util.LinkedHashMap;
import java.util.Map;

/** 定时/手动任务执行结果，供 API 与自动化日志使用 */
public class JobRunOutcome {
    private final String jobKey;
    private final String summary;
    private final Map<String, Object> metrics;
    private final boolean noop;

    private JobRunOutcome(String jobKey, String summary, Map<String, Object> metrics, boolean noop) {
        this.jobKey = jobKey;
        this.summary = summary == null ? "" : summary;
        this.metrics = metrics == null ? Map.of() : Map.copyOf(metrics);
        this.noop = noop;
    }

    public static JobRunOutcome ok(String jobKey, String summary) {
        return new JobRunOutcome(jobKey, summary, Map.of(), false);
    }

    public static JobRunOutcome ok(String jobKey, String summary, Map<String, Object> metrics) {
        return new JobRunOutcome(jobKey, summary, metrics, false);
    }

    public static JobRunOutcome noop(String jobKey, String summary, Map<String, Object> metrics) {
        return new JobRunOutcome(jobKey, summary, metrics, true);
    }

    public String getJobKey() {
        return jobKey;
    }

    public String getSummary() {
        return summary;
    }

    public Map<String, Object> getMetrics() {
        return metrics;
    }

    public boolean isNoop() {
        return noop;
    }

    public Map<String, Object> toMap() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("jobKey", jobKey);
        m.put("summary", summary);
        m.put("metrics", metrics);
        m.put("noop", noop);
        return m;
    }
}
