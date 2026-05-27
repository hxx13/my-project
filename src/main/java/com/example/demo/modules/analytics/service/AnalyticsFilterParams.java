package com.example.demo.modules.analytics.service;

import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/** 从订阅/查询 JSON 解析筛选范围与审计周期 */
public record AnalyticsFilterParams(
        List<String> campuses,
        List<String> floors,
        String roomName,
        Integer actionType,
        boolean excludeBlacklist,
        List<String> auditCycles,
        /** 空=全部已启用清洗通道 */
        List<String> channelCodes,
        /** true 表示 channelCodes 为空时解析为全部已启用通道 */
        boolean allEnabledChannels) {

    public static AnalyticsFilterParams fromMap(Map<String, Object> filter) {
        if (filter == null) {
            return new AnalyticsFilterParams(List.of(), List.of(), null, null, true, List.of("day"), List.of(), true);
        }
        List<String> campuses = parseList(filter.get("campuses"));
        String legacyCampus = trim(filter.get("campus"));
        if (campuses.isEmpty() && StringUtils.hasText(legacyCampus)) {
            campuses = List.of(legacyCampus);
        }
        List<String> floors = parseList(filter.get("floors"));
        String legacyFloor = trim(filter.get("floor"));
        if (!StringUtils.hasText(legacyFloor)) {
            legacyFloor = trim(filter.get("floorName"));
        }
        if (floors.isEmpty() && StringUtils.hasText(legacyFloor)) {
            floors = List.of(legacyFloor);
        }
        String roomName = trim(filter.get("roomName"));
        Integer actionType = parseActionType(filter.get("actionType"));
        boolean excludeBlacklist =
                filter.get("excludeBlacklist") == null || !Boolean.FALSE.equals(filter.get("excludeBlacklist"));
        List<String> auditCycles = parseAuditCycles(filter.get("compareCycles"));
        if (auditCycles.isEmpty()) {
            auditCycles = parseAuditCycles(filter.get("auditCycles"));
        }
        if (auditCycles.isEmpty()) {
            auditCycles = List.of("day");
        }
        List<String> channelCodes = parseList(filter.get("channelCodes"));
        // 已选具体通道时不得再按「全部已启用」展开，防止 JSON 中 allEnabledChannels:true 与 channelCodes 并存
        boolean allEnabled =
                channelCodes.isEmpty()
                        && (Boolean.TRUE.equals(filter.get("allEnabledChannels"))
                                || filter.get("allEnabledChannels") != Boolean.FALSE);
        return new AnalyticsFilterParams(
                campuses,
                floors,
                emptyToNull(roomName),
                actionType,
                excludeBlacklist,
                auditCycles,
                channelCodes,
                allEnabled);
    }

    private static List<String> parseAuditCycles(Object raw) {
        List<String> list = parseList(raw);
        List<String> out = new ArrayList<>();
        for (String s : list) {
            if ("day".equals(s) || "week".equals(s) || "month".equals(s)) {
                out.add(s);
            }
        }
        return out;
    }

    private static List<String> parseList(Object raw) {
        if (raw == null) {
            return List.of();
        }
        if (raw instanceof List<?> list) {
            List<String> out = new ArrayList<>();
            for (Object o : list) {
                String s = trim(o);
                if (StringUtils.hasText(s)) {
                    out.add(s);
                }
            }
            return out;
        }
        String s = String.valueOf(raw).trim();
        if (!StringUtils.hasText(s)) {
            return List.of();
        }
        if (s.contains(",")) {
            List<String> out = new ArrayList<>();
            for (String part : s.split(",")) {
                String t = part.trim();
                if (StringUtils.hasText(t)) {
                    out.add(t);
                }
            }
            return out;
        }
        return List.of(s);
    }

    private static Integer parseActionType(Object at) {
        if (at == null || !StringUtils.hasText(String.valueOf(at))) {
            return null;
        }
        try {
            return Integer.parseInt(String.valueOf(at).trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static String trim(Object o) {
        return o == null ? "" : String.valueOf(o).trim();
    }

    private static String emptyToNull(String s) {
        return StringUtils.hasText(s) ? s.trim() : null;
    }
}
