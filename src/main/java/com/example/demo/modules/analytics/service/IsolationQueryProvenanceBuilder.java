package com.example.demo.modules.analytics.service;

import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 隔离服统计查询溯源（主口径 + 流水辅助），供前端展示。 */
public final class IsolationQueryProvenanceBuilder {

    private IsolationQueryProvenanceBuilder() {}

    public static Map<String, Object> buildFilterSnapshots(AnalyticsFilterParams params) {
        Map<String, Object> snap = new LinkedHashMap<>();
        snap.put("filterSchemaVersion", 2);
        if (params == null) {
            return snap;
        }
        Map<String, Object> pkg = new LinkedHashMap<>();
        pkg.put("channelCodes", params.channelCodes());
        pkg.put("allEnabledChannels", params.allEnabledChannels());
        pkg.put("note", "主口径：不按进出筛门禁记录");
        snap.put("packageFilter", pkg);

        Map<String, Object> flow = new LinkedHashMap<>();
        flow.put("actionType", params.actionType());
        flow.put("actionTypeLabel", flowActionLabel(params.actionType()));
        flow.put("campuses", params.campuses());
        flow.put("floors", params.floors());
        flow.put("roomName", params.roomName());
        flow.put("excludeBlacklist", params.excludeBlacklist());
        flow.put("note", "作用于 ARO 流水：本期规模课题组、涉及学生人数及课题组分布");
        snap.put("flowFilter", flow);
        return snap;
    }

    @SuppressWarnings("unchecked")
    public static Map<String, Object> assembleReportTrace(
            Map<String, Object> mainReport,
            Map<String, Object> auxiliaryFlow,
            long totalMs,
            String startTime,
            String endTime) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("startTime", startTime);
        out.put("endTime", endTime);
        out.put("totalMs", totalMs);

        List<Map<String, Object>> steps = new ArrayList<>();
        if (mainReport != null && mainReport.get("summary") instanceof Map<?, ?> sm) {
            Map<String, Object> summary = (Map<String, Object>) sm;
            if (summary.get("queryTrace") instanceof Map<?, ?> qt) {
                Map<String, Object> step = new LinkedHashMap<>((Map<String, Object>) qt);
                step.put("name", "清洗总库（主口径）");
                step.put("status", "done");
                steps.add(step);
            }
        }
        if (auxiliaryFlow != null && !auxiliaryFlow.isEmpty()) {
            Map<String, Object> step = new LinkedHashMap<>();
            step.put("layer", "auxiliary");
            step.put("name", "ARO 流水（本期规模）");
            step.put("table", "aro_access_log");
            step.put("dataSource", auxiliaryFlow.get("dataSource"));
            step.put("rawLogCount", auxiliaryFlow.get("rawLogCount"));
            step.put("uniqueGroups", auxiliaryFlow.get("uniqueGroups"));
            step.put("uniqueStudentUsers", auxiliaryFlow.get("uniqueStudentUsers"));
            step.put("flowScope", auxiliaryFlow.get("flowScope"));
            step.put("note", auxiliaryFlow.get("note"));
            step.put("status", "done");
            steps.add(step);
        }
        out.put("steps", steps);
        return out;
    }

    /** 将 buildReport 解析后的实查通道写入 filterSnapshot（供快照溯源）。 */
    @SuppressWarnings("unchecked")
    public static void enrichPackageFilterSnapshot(
            Map<String, Object> filterSnapshot, Map<String, Object> summary) {
        if (filterSnapshot == null || summary == null) {
            return;
        }
        Object pkgRaw = filterSnapshot.get("packageFilter");
        if (!(pkgRaw instanceof Map<?, ?>)) {
            return;
        }
        Map<String, Object> pkg = (Map<String, Object>) pkgRaw;
        if (summary.get("resolvedChannelCodes") != null) {
            pkg.put("resolvedChannelCodes", summary.get("resolvedChannelCodes"));
        }
        if (summary.get("allEnabledChannels") != null) {
            pkg.put("allEnabledChannels", summary.get("allEnabledChannels"));
        }
        if (summary.get("channelScope") != null) {
            pkg.put("channelScopeLabel", summary.get("channelScope"));
        }
        if (summary.get("eventsByChannel") != null) {
            pkg.put("eventsByChannel", summary.get("eventsByChannel"));
        }
    }

    private static String flowActionLabel(Integer actionType) {
        if (actionType == null) {
            return "全部进出";
        }
        return actionType == 1 ? "仅进入" : actionType == 2 ? "仅离开" : "全部进出";
    }
}
