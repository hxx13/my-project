package com.example.demo.modules.analytics.service;

import com.example.demo.modules.accessfusion.service.AccessAudienceConstants;
import com.example.demo.modules.accessfusion.service.AccessCleanPackageAnalyticsService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 隔离服使用统计编排：主口径（清洗包 / cleaned / aro）与 ARO 流水辅助分离。
 */
@Service
public class IsolationUsageReportService {

    private final AccessCleanPackageAnalyticsService packageAnalyticsService;
    private final com.example.demo.modules.accessfusion.service.AccessCleanLibraryQueryFacade libraryQueryFacade;
    private final AroFlowAuxiliaryAnalyticsService flowAuxiliaryService;

    @Value("${app.analytics.isolation.data-source:access_package}")
    private String isolationDataSource;

    public IsolationUsageReportService(
            AccessCleanPackageAnalyticsService packageAnalyticsService,
            com.example.demo.modules.accessfusion.service.AccessCleanLibraryQueryFacade libraryQueryFacade,
            AroFlowAuxiliaryAnalyticsService flowAuxiliaryService) {
        this.packageAnalyticsService = packageAnalyticsService;
        this.libraryQueryFacade = libraryQueryFacade;
        this.flowAuxiliaryService = flowAuxiliaryService;
    }

    public String currentDataSource() {
        return isolationDataSource != null ? isolationDataSource.trim() : "access_package";
    }

    public Map<String, Object> queryWithFilterForcedSource(
            AnalyticsFilterParams params, String startTime, String endTime, String source) {
        if (AccessCleanPackageAnalyticsService.DATA_SOURCE.equalsIgnoreCase(source)) {
            return composePackageWithAuxiliary(params, startTime, endTime);
        }
        IsolationFlowFilter flow = IsolationFlowFilter.fromAnalytics(params);
        return flowAuxiliaryService.buildFullFlowReport(flow, startTime, endTime, source);
    }

    public Map<String, Object> query(
            List<String> campuses,
            List<String> floors,
            String keyword,
            String startTime,
            String endTime,
            Integer actionType,
            String roomName,
            Boolean excludeBlacklist) {
        AnalyticsFilterParams params =
                new AnalyticsFilterParams(
                        campuses != null ? campuses : List.of(),
                        floors != null ? floors : List.of(),
                        roomName,
                        actionType,
                        excludeBlacklist == null || excludeBlacklist,
                        List.of("day"),
                        List.of(),
                        true);
        return queryWithFilter(params, startTime, endTime);
    }

    public Map<String, Object> queryWithFilter(AnalyticsFilterParams params, String startTime, String endTime) {
        if (AccessCleanPackageAnalyticsService.DATA_SOURCE.equalsIgnoreCase(currentDataSource())) {
            return composePackageWithAuxiliary(params, startTime, endTime);
        }
        IsolationFlowFilter flow = IsolationFlowFilter.fromAnalytics(params);
        return flowAuxiliaryService.buildFullFlowReport(
                flow, startTime, endTime, currentDataSource());
    }

    private Map<String, Object> composePackageWithAuxiliary(
            AnalyticsFilterParams params, String startTime, String endTime) {
        long t0 = System.currentTimeMillis();
        IsolationFlowFilter flow = IsolationFlowFilter.fromAnalytics(params);
        Map<String, Object> main = libraryQueryFacade.aggregateForIsolation(params, startTime, endTime);
        long t1 = System.currentTimeMillis();
        Map<String, Object> aroScope = flowAuxiliaryService.buildScopeReport(flow, startTime, endTime);
        long t2 = System.currentTimeMillis();
        mergeAroScopeIntoPackageReport(main, aroScope);
        @SuppressWarnings("unchecked")
        Map<String, Object> aux =
                aroScope.get("auxiliaryFlow") instanceof Map<?, ?> m
                        ? (Map<String, Object>) m
                        : Map.of();
        main.put("auxiliaryFlow", aux);
        main.put(
                "queryProvenance",
                IsolationQueryProvenanceBuilder.assembleReportTrace(main, aux, t2 - t0, startTime, endTime));
        return main;
    }

    @SuppressWarnings("unchecked")
    private static void mergeAroScopeIntoPackageReport(Map<String, Object> main, Map<String, Object> aroScope) {
        if (main == null || aroScope == null) {
            return;
        }
        Map<String, Object> summary =
                main.get("summary") instanceof Map<?, ?> sm
                        ? (Map<String, Object>) sm
                        : new LinkedHashMap<>();
        Map<String, Object> aroSummary =
                aroScope.get("summary") instanceof Map<?, ?> asm
                        ? (Map<String, Object>) asm
                        : Map.of();
        if (aroSummary.get("uniqueGroups") != null) {
            summary.put("uniqueGroups", aroSummary.get("uniqueGroups"));
        }
        if (aroSummary.get("uniqueStudentUsers") != null) {
            summary.put("uniqueStudentUsers", aroSummary.get("uniqueStudentUsers"));
        }
        if (aroSummary.get("rawLogCount") != null) {
            summary.put("aroFlowLogCount", aroSummary.get("rawLogCount"));
        }
        if (aroScope.get("byProjectGroup") != null) {
            main.put("byProjectGroup", aroScope.get("byProjectGroup"));
        }
        String metricNote =
                "条数/涉及人数=清洗总库；课题组/涉及学生人数=ARO 流水（与订阅校区楼层进出一致）；学生/工作人员条数按 audience_type；学生部门ID="
                        + AccessAudienceConstants.studentRuleLabel();
        summary.put("metricNote", metricNote);
        main.put("summary", summary);
    }

    /** 按当前订阅配置试算（不写快照），与清算同编排（主口径 + 流水辅助 + 溯源） */
    public Map<String, Object> previewWithFilter(AnalyticsFilterParams params, String startTime, String endTime) {
        return composePackageWithAuxiliary(params, startTime, endTime);
    }

    /** @deprecated 使用 {@link AroFlowAuxiliaryAnalyticsService#buildStudentAuxiliary} */
    public Map<String, Object> buildStudentFlowAuxiliary(
            AnalyticsFilterParams params, String startTime, String endTime) {
        return flowAuxiliaryService.buildStudentAuxiliary(
                IsolationFlowFilter.fromAnalytics(params), startTime, endTime);
    }

    @SuppressWarnings("unchecked")
    public Map<String, Object> summaryOnly(AnalyticsFilterParams params, String startTime, String endTime) {
        Map<String, Object> report = queryWithFilter(params, startTime, endTime);
        return (Map<String, Object>) report.get("summary");
    }

    public List<Map<String, Object>> topProjectGroups(Map<String, Object> report, int limit) {
        Object raw = report.get("byProjectGroup");
        if (!(raw instanceof List<?> list)) {
            return List.of();
        }
        return list.stream()
                .filter(Map.class::isInstance)
                .map(m -> (Map<String, Object>) m)
                .sorted(
                        (a, b) ->
                                Long.compare(
                                        toLong(b.get("personTimes")),
                                        toLong(a.get("personTimes"))))
                .limit(limit)
                .toList();
    }

    private static long toLong(Object o) {
        if (o instanceof Number n) {
            return n.longValue();
        }
        try {
            return Long.parseLong(String.valueOf(o));
        } catch (Exception e) {
            return 0L;
        }
    }
}
