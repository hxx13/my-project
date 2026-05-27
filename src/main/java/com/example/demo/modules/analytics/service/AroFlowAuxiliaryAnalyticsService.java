package com.example.demo.modules.analytics.service;

import com.example.demo.modules.accessfusion.mapper.AccessCleanedEventMapper;
import com.example.demo.modules.accessfusion.service.AccessAudienceConstants;
import com.example.demo.modules.twin.mapper.TwinDashboardMapper;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * ARO 流水辅助统计（课题组/房间维度），与清洗包主口径解耦。
 */
@Service
public class AroFlowAuxiliaryAnalyticsService {

    public static final String DATA_SOURCE = "aro";

    private final TwinDashboardMapper dashboardMapper;
    private final AccessCleanedEventMapper accessCleanedEventMapper;
    private final IsolationRoundAggregator roundAggregator;
    private final AroFlowEventAggregator eventAggregator;

    public AroFlowAuxiliaryAnalyticsService(
            TwinDashboardMapper dashboardMapper,
            AccessCleanedEventMapper accessCleanedEventMapper,
            IsolationRoundAggregator roundAggregator,
            AroFlowEventAggregator eventAggregator) {
        this.dashboardMapper = dashboardMapper;
        this.accessCleanedEventMapper = accessCleanedEventMapper;
        this.roundAggregator = roundAggregator;
        this.eventAggregator = eventAggregator;
    }

    /**
     * 本期规模口径：ARO 流水 + 订阅筛选；课题组按流水条、涉及学生人数按 userId 去重（不进出配对）。
     */
    public Map<String, Object> buildScopeReport(IsolationFlowFilter flow, String startTime, String endTime) {
        List<Map<String, Object>> logs = listFlowLogs(flow, startTime, endTime, DATA_SOURCE);
        Map<String, Object> report = eventAggregator.aggregate(logs, DATA_SOURCE);
        Map<String, Object> aux = new LinkedHashMap<>();
        aux.put("dataSource", DATA_SOURCE);
        aux.put("note", "ARO 流水（本期规模：课题组 + 涉及学生人数）");
        aux.put("byProjectGroup", report.get("byProjectGroup"));
        aux.put("rawLogCount", logs != null ? logs.size() : 0);
        aux.put("periodStart", startTime);
        aux.put("periodEnd", endTime);
        if (report.get("summary") instanceof Map<?, ?> sm) {
            aux.put("uniqueGroups", sm.get("uniqueGroups"));
            aux.put("uniqueStudentUsers", sm.get("uniqueStudentUsers"));
        }
        putFlowScopeLabel(aux, flow);
        report.put("auxiliaryFlow", aux);
        return report;
    }

    /** 仅学生部门，供隔离服快照辅助块展示。 */
    public Map<String, Object> buildStudentAuxiliary(IsolationFlowFilter flow, String startTime, String endTime) {
        List<Map<String, Object>> logs = listFlowLogs(flow, startTime, endTime, DATA_SOURCE);
        List<Map<String, Object>> studentOnly =
                logs.stream()
                        .filter(
                                l ->
                                        AccessAudienceConstants.isStudentPersonnel(
                                                str(l.get("departmentId")),
                                                str(l.get("departmentName")),
                                                str(l.get("userTypeNames"))))
                        .toList();
        Map<String, Object> agg = roundAggregator.aggregate(studentOnly, DATA_SOURCE);
        Map<String, Object> aux = new LinkedHashMap<>();
        aux.put("dataSource", DATA_SOURCE);
        aux.put("note", "ARO 流水辅助（仅学生部门），与清洗主口径条数独立；按校区/楼层/进出筛选");
        aux.put("byProjectGroup", agg.get("byProjectGroup"));
        aux.put("byRoom", agg.get("byRoom"));
        aux.put("rawLogCount", studentOnly.size());
        aux.put("periodStart", startTime);
        aux.put("periodEnd", endTime);
        putFlowScopeLabel(aux, flow);
        return aux;
    }

    public List<Map<String, Object>> listFlowLogs(
            IsolationFlowFilter flow, String startTime, String endTime, String source) {
        List<String> campusList =
                flow.campuses() != null
                        ? flow.campuses().stream().filter(StringUtils::hasText).map(String::trim).toList()
                        : List.of();
        List<String> floorList =
                flow.floors() != null
                        ? flow.floors().stream().filter(StringUtils::hasText).map(String::trim).toList()
                        : List.of();
        String legacyCampus = campusList.size() == 1 ? campusList.get(0) : null;
        String legacyFloor = floorList.size() == 1 ? floorList.get(0) : null;

        if ("cleaned".equalsIgnoreCase(source)) {
            return accessCleanedEventMapper.listForAggregation(
                    campusList.isEmpty() ? null : campusList,
                    floorList.isEmpty() ? null : floorList,
                    emptyToNull(flow.roomName()),
                    emptyToNull(startTime),
                    emptyToNull(endTime),
                    flow.actionType(),
                    flow.excludeBlacklist());
        }
        return dashboardMapper.listFilteredDebugLogsForAggregation(
                legacyCampus,
                legacyFloor,
                campusList.isEmpty() ? null : campusList,
                floorList.isEmpty() ? null : floorList,
                null,
                emptyToNull(startTime),
                emptyToNull(endTime),
                flow.actionType(),
                emptyToNull(flow.roomName()),
                flow.excludeBlacklist());
    }

    public Map<String, Object> buildFullFlowReport(
            IsolationFlowFilter flow, String startTime, String endTime, String source) {
        return roundAggregator.aggregate(listFlowLogs(flow, startTime, endTime, source), source);
    }

    private static void putFlowScopeLabel(Map<String, Object> aux, IsolationFlowFilter flow) {
        List<String> parts = new java.util.ArrayList<>();
        if (flow.campuses() != null && !flow.campuses().isEmpty()) {
            parts.add("校区:" + String.join("、", flow.campuses()));
        }
        if (flow.floors() != null && !flow.floors().isEmpty()) {
            parts.add("楼层:" + String.join("、", flow.floors()));
        }
        if (StringUtils.hasText(flow.roomName())) {
            parts.add("房间:" + flow.roomName());
        }
        if (flow.actionType() != null) {
            parts.add(
                    flow.actionType() == 1
                            ? "进出:仅进入"
                            : flow.actionType() == 2 ? "进出:仅离开" : "进出:全部");
        }
        if (!parts.isEmpty()) {
            aux.put("flowScope", String.join(" · ", parts));
        }
    }

    private static String str(Object o) {
        return o == null ? "" : String.valueOf(o).trim();
    }

    private static String emptyToNull(String s) {
        return StringUtils.hasText(s) ? s.trim() : null;
    }
}
