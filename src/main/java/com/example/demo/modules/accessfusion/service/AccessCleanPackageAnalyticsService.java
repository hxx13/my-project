package com.example.demo.modules.accessfusion.service;

import com.example.demo.modules.accessfusion.mapper.AccessCleanChannelScopeMapper;
import com.example.demo.modules.accessfusion.mapper.AccessCleanPackageItemMapper;
import com.example.demo.modules.analytics.service.IsolationPackageEventAggregator;
import com.example.demo.modules.analytics.service.IsolationPackageFilter;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 隔离服主口径：清洗总库 {@code access_clean_package_item}。
 * 按通道 + 进出方向 + 时间筛选；每条纳入记录计 1 次事件；学生/工作人员按 audience_type 标签。
 */
@Service
public class AccessCleanPackageAnalyticsService {

    public static final String DATA_SOURCE = "access_package";

    private final AccessCleanPackageItemMapper packageItemMapper;
    private final AccessCleanChannelScopeMapper channelScopeMapper;
    private final IsolationPackageEventAggregator eventAggregator;

    public AccessCleanPackageAnalyticsService(
            AccessCleanPackageItemMapper packageItemMapper,
            AccessCleanChannelScopeMapper channelScopeMapper,
            IsolationPackageEventAggregator eventAggregator) {
        this.packageItemMapper = packageItemMapper;
        this.channelScopeMapper = channelScopeMapper;
        this.eventAggregator = eventAggregator;
    }

    public Map<String, Object> buildReport(IsolationPackageFilter pkg, String startTime, String endTime) {
        ChannelScope scope = resolveChannelScope(pkg);
        if (scope.emptyBecauseNoEnabledChannels()) {
            Map<String, Object> empty = new LinkedHashMap<>();
            empty.put("summary", Map.of("dataSource", DATA_SOURCE, "totalEvents", 0));
            empty.put("byRegion", List.of());
            empty.put("byProjectGroup", List.of());
            empty.put("byRoom", List.of());
            empty.put("byDay", List.of());
            enrichPackageSummary(
                    empty, 0, 0, 0, scope.label(), scope.codes().size(), startTime, endTime, 0L, 0L, false);
            return empty;
        }

        long t0 = System.currentTimeMillis();
        List<String> channelCodes = scope.codes().isEmpty() ? null : scope.codes();
        // 主口径不按进出筛门禁记录；进出仅用于 ARO 流水辅助（IsolationFlowFilter）

        Map<String, Object> counts =
                packageItemMapper.countAudienceSets(startTime, endTime, channelCodes, null);
        Map<String, Object> scopeMetrics =
                packageItemMapper.countScopeMetrics(startTime, endTime, channelCodes, null);
        List<Map<String, Object>> byChannel =
                packageItemMapper.countEventsByChannel(startTime, endTime, channelCodes, null);

        List<Map<String, Object>> logs =
                packageItemMapper.listForAggregation(startTime, endTime, channelCodes, null);
        long queryMs = System.currentTimeMillis() - t0;
        long rowsScanned = logs != null ? logs.size() : 0L;

        long totalEvents = longVal(counts.get("totalEvents"));
        if (totalEvents == 0) {
            totalEvents = longVal(counts.get("totalSets"));
        }
        long studentEvents = longVal(counts.get("studentEvents"));
        if (studentEvents == 0) {
            studentEvents = longVal(counts.get("studentSets"));
        }
        long staffEvents = longVal(counts.get("staffEvents"));
        if (staffEvents == 0) {
            staffEvents = longVal(counts.get("staffSets"));
        }

        Map<String, Object> main =
                eventAggregator.aggregate(logs, totalEvents, studentEvents, staffEvents, DATA_SOURCE);
        @SuppressWarnings("unchecked")
        Map<String, Object> summary =
                main.get("summary") instanceof Map<?, ?> m
                        ? (Map<String, Object>) m
                        : new LinkedHashMap<>();
        // 涉及人数：全量 SQL（mapping / person_code / record_id 兜底）
        summary.put("uniqueUsers", longVal(scopeMetrics.get("uniqueUsers")));
        // 课题组：与 byProjectGroup 同源（ARO 档案 GROUP_CONCAT 后按逗号拆分），禁止用 countScopeMetrics 覆盖
        summary.put("allEnabledChannels", pkg.isAllEnabledChannels());
        summary.put("resolvedChannelCodes", new ArrayList<>(scope.codes()));
        if (byChannel != null && !byChannel.isEmpty()) {
            summary.put("eventsByChannel", byChannel);
        }
        boolean truncated = rowsScanned < totalEvents || rowsScanned >= 500_000L;
        summary.put("truncated", truncated);
        main.put("summary", summary);
        enrichPackageSummary(
                main,
                totalEvents,
                studentEvents,
                staffEvents,
                scope.label(),
                scope.codes().size(),
                startTime,
                endTime,
                queryMs,
                rowsScanned,
                truncated);
        return main;
    }

    private void enrichPackageSummary(
            Map<String, Object> report,
            long totalEvents,
            long studentEvents,
            long staffEvents,
            String channelScopeLabel,
            int channelCount,
            String startTime,
            String endTime,
            long queryMs,
            long rowsScanned,
            boolean truncated) {
        @SuppressWarnings("unchecked")
        Map<String, Object> summary =
                report.get("summary") instanceof Map<?, ?> m
                        ? (Map<String, Object>) m
                        : new LinkedHashMap<>();
        summary.put("totalEvents", totalEvents);
        summary.put("studentEvents", studentEvents);
        summary.put("staffEvents", staffEvents);
        summary.put("totalSets", totalEvents);
        summary.put("studentSets", studentEvents);
        summary.put("staffSets", staffEvents);
        summary.put("dataSource", DATA_SOURCE);
        summary.put("channelScope", channelScopeLabel);
        summary.put("directionScope", "不按进出筛选门禁记录");
        summary.put("enabledChannelCount", channelCount);
        String metricNote =
                "条数/涉及人数=清洗总库；课题组/涉及学生人数由 ARO 流水口径在报表编排层合并；学生/工作人员按 audience_type；学生部门ID="
                        + AccessAudienceConstants.studentRuleLabel();
        if (truncated) {
            metricNote += "；明细抽样 " + rowsScanned + "/" + totalEvents + "，分布图可能不完整";
        }
        summary.put("metricNote", metricNote);
        if (!summary.containsKey("truncated")) {
            summary.put("truncated", truncated);
        }
        Map<String, Object> trace = new LinkedHashMap<>();
        trace.put("layer", "main");
        trace.put("table", "access_clean_package_item");
        trace.put("disposition", "INCLUDED");
        trace.put("directionFilter", "无");
        trace.put("channelScope", channelScopeLabel);
        trace.put("channelCount", channelCount);
        trace.put("startTime", startTime);
        trace.put("endTime", endTime);
        trace.put("queryMs", queryMs);
        trace.put("rowsScanned", rowsScanned);
        trace.put("includedEvents", totalEvents);
        summary.put("queryTrace", trace);
        report.put("summary", summary);
    }

    private ChannelScope resolveChannelScope(IsolationPackageFilter pkg) {
        if (!pkg.isAllEnabledChannels()) {
            return new ChannelScope(pkg.channelCodes(), String.join("、", pkg.channelCodes()), false);
        }
        List<String> enabled = listEnabledChannelCodes();
        if (enabled.isEmpty()) {
            return new ChannelScope(List.of(), "未配置已启用清洗通道", true);
        }
        return new ChannelScope(enabled, "全部已启用清洗通道（" + enabled.size() + " 个）", false);
    }

    private List<String> listEnabledChannelCodes() {
        List<Map<String, Object>> rows = channelScopeMapper.selectDistinctEnabledChannels();
        List<String> codes = new ArrayList<>();
        if (rows == null) {
            return codes;
        }
        for (Map<String, Object> row : rows) {
            String code = row.get("channelCode") != null ? String.valueOf(row.get("channelCode")).trim() : "";
            if (StringUtils.hasText(code)) {
                codes.add(code);
            }
        }
        return codes;
    }

    private static long longVal(Object v) {
        if (v instanceof Number n) {
            return n.longValue();
        }
        try {
            return Long.parseLong(String.valueOf(v));
        } catch (Exception e) {
            return 0L;
        }
    }

    private record ChannelScope(List<String> codes, String label, boolean emptyBecauseNoEnabledChannels) {}
}
