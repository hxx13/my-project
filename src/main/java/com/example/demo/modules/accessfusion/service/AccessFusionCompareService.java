package com.example.demo.modules.accessfusion.service;

import com.example.demo.modules.analytics.service.AnalyticsFilterParams;
import com.example.demo.modules.analytics.service.IsolationUsageReportService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.Map;

@Service
public class AccessFusionCompareService {

    private final IsolationUsageReportService isolationUsageReportService;

    @Value("${app.analytics.isolation.data-source:cleaned}")
    private String configuredSource;

    public AccessFusionCompareService(IsolationUsageReportService isolationUsageReportService) {
        this.isolationUsageReportService = isolationUsageReportService;
    }

    public Map<String, Object> compareSevenDays(AnalyticsFilterParams params) {
        LocalDate end = LocalDate.now().minusDays(1);
        LocalDate start = end.minusDays(6);
        String startTime = start + " 00:00:00";
        String endTime = end + " 23:59:59";

        Map<String, Object> aro = isolationUsageReportService.queryWithFilterForcedSource(params, startTime, endTime, "aro");
        Map<String, Object> cleaned =
                isolationUsageReportService.queryWithFilterForcedSource(params, startTime, endTime, "cleaned");

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("windowStart", start.toString());
        out.put("windowEnd", end.toString());
        out.put("configuredSource", configuredSource);
        out.put("aro", summarize(aro));
        out.put("cleaned", summarize(cleaned));
        out.put("delta", delta(summarize(aro), summarize(cleaned)));
        return out;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> summarize(Map<String, Object> report) {
        Object s = report.get("summary");
        if (s instanceof Map<?, ?> m) {
            return (Map<String, Object>) m;
        }
        return Map.of();
    }

    private static Map<String, Object> delta(Map<String, Object> aro, Map<String, Object> cleaned) {
        Map<String, Object> d = new LinkedHashMap<>();
        d.put("totalRoundsDelta", toLong(cleaned.get("totalRounds")) - toLong(aro.get("totalRounds")));
        d.put("totalEnterDelta", toLong(cleaned.get("totalEnter")) - toLong(aro.get("totalEnter")));
        d.put("uniqueUsersDelta", toLong(cleaned.get("uniqueUsers")) - toLong(aro.get("uniqueUsers")));
        return d;
    }

    private static long toLong(Object o) {
        if (o instanceof Number n) {
            return n.longValue();
        }
        return 0L;
    }
}
