package com.example.demo.modules.analytics.service;

import com.example.demo.modules.accessfusion.service.AccessAudienceConstants;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.Arrays;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

/**
 * ARO 流水事件口径：按流水条计数（不进出配对），用于统计页「本期规模」课题组 / 涉及学生人数（快照字段，前端可不展示）。
 */
@Component
public class AroFlowEventAggregator {

    private static final String UNLABELED_GROUP = "未标注课题组";

    public Map<String, Object> aggregate(List<Map<String, Object>> logs, String dataSourceLabel) {
        Map<String, Object> out = new LinkedHashMap<>();
        if (logs == null || logs.isEmpty()) {
            out.put("summary", emptySummary(dataSourceLabel));
            out.put("byProjectGroup", List.of());
            return out;
        }

        Set<String> uniqueGroups = new HashSet<>();
        Set<String> uniqueStudentUsers = new HashSet<>();
        Map<String, Long> groupEvents = new TreeMap<>();

        for (Map<String, Object> log : logs) {
            for (String g : resolveGroups(log)) {
                uniqueGroups.add(g);
                groupEvents.merge(g, 1L, Long::sum);
            }
            if (isStudentLog(log)) {
                String dedupeKey = studentDedupeKey(log);
                if (StringUtils.hasText(dedupeKey)) {
                    uniqueStudentUsers.add(dedupeKey);
                }
            }
        }

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("uniqueGroups", uniqueGroups.size());
        summary.put("uniqueStudentUsers", uniqueStudentUsers.size());
        summary.put("rawLogCount", logs.size());
        summary.put("truncated", logs.size() >= 300_000);
        if (StringUtils.hasText(dataSourceLabel)) {
            summary.put("dataSource", dataSourceLabel);
        }
        summary.put(
                "metricNote",
                "ARO 流水：课题组=期内有流水记录的课题组名去重；涉及学生人数=userId 去重（无 userId 时用姓名兜底，学生部门/人员类型）；与订阅校区/楼层/进出一致；仅进入/仅离开时不配对");

        out.put("summary", summary);
        out.put("byProjectGroup", toGroupRows(groupEvents));
        return out;
    }

    private static boolean isStudentLog(Map<String, Object> log) {
        String userType = str(log.get("userTypeNames"));
        if (!StringUtils.hasText(userType)) {
            userType = str(log.get("personnelUserTypeNames"));
        }
        String deptName = str(log.get("personnelDepartmentName"));
        return AccessAudienceConstants.isStudentPersonnel(str(log.get("departmentId")), deptName, userType);
    }

    /** 优先 userId；缺失时用 name 兜底 */
    private static String studentDedupeKey(Map<String, Object> log) {
        String userId = str(log.get("userId"));
        if (StringUtils.hasText(userId)) {
            return userId;
        }
        String name = str(log.get("name"));
        if (StringUtils.hasText(name)) {
            return "name:" + name;
        }
        return "";
    }

    private static List<Map<String, Object>> toGroupRows(Map<String, Long> groupEvents) {
        return groupEvents.entrySet().stream()
                .sorted((a, b) -> Long.compare(b.getValue(), a.getValue()))
                .map(
                        en -> {
                            Map<String, Object> row = new LinkedHashMap<>();
                            row.put("groupName", en.getKey());
                            row.put("personTimes", en.getValue());
                            row.put("eventCount", en.getValue());
                            return row;
                        })
                .toList();
    }

    private static List<String> resolveGroups(Map<String, Object> log) {
        String raw = str(log.get("projectGroupNames"));
        if (!StringUtils.hasText(raw)) {
            return List.of(UNLABELED_GROUP);
        }
        List<String> parts =
                Arrays.stream(raw.split("[,，、;；]"))
                        .map(String::trim)
                        .filter(StringUtils::hasText)
                        .distinct()
                        .toList();
        return parts.isEmpty() ? List.of(UNLABELED_GROUP) : parts;
    }

    private static Map<String, Object> emptySummary(String dataSourceLabel) {
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("uniqueGroups", 0);
        summary.put("uniqueStudentUsers", 0);
        summary.put("rawLogCount", 0);
        summary.put("truncated", false);
        if (StringUtils.hasText(dataSourceLabel)) {
            summary.put("dataSource", dataSourceLabel);
        }
        return summary;
    }

    private static String str(Object o) {
        return o == null ? "" : String.valueOf(o).trim();
    }
}
