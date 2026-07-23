package com.example.demo.modules.analytics.service;

import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** 笼架占用统计筛选：校区—区域—楼层—房间，各级支持多选（ID 列表） */
public record CageAnalyticsFilterParams(
        List<Integer> campusIds,
        List<String> areaIds,
        List<String> floorIds,
        List<String> roomIds,
        List<String> legacyCampusNames,
        List<String> legacyFloorNames,
        String legacyRoomName,
        List<String> auditCycles) {

    public static CageAnalyticsFilterParams fromMap(Map<String, Object> filter) {
        if (filter == null) {
            return empty();
        }

        List<Integer> campusIds = parseCampusIds(filter.get("campusIds"));
        if (campusIds.isEmpty()) {
            Integer single = parseCampusId(filter.get("campusId"));
            if (single != null) {
                campusIds = List.of(single);
            }
        }

        List<String> areaIds = parseList(filter.get("areaIds"));
        if (areaIds.isEmpty()) {
            String single = emptyToNull(trim(filter.get("areaId")));
            if (single != null) {
                areaIds = List.of(single);
            }
        }

        List<String> floorIds = parseList(filter.get("floorIds"));
        if (floorIds.isEmpty()) {
            String single = emptyToNull(trim(filter.get("floorId")));
            if (single != null) {
                floorIds = List.of(single);
            }
        }

        List<String> roomIds = parseList(filter.get("roomIds"));
        if (roomIds.isEmpty()) {
            String single = emptyToNull(trim(filter.get("roomId")));
            if (single != null) {
                roomIds = List.of(single);
            }
        }

        List<String> legacyCampusNames = parseList(filter.get("campuses"));
        String legacyCampus = trim(filter.get("campus"));
        if (legacyCampusNames.isEmpty() && StringUtils.hasText(legacyCampus)) {
            legacyCampusNames = List.of(legacyCampus);
        }
        List<String> legacyFloorNames = parseList(filter.get("floors"));
        String legacyFloor = trim(filter.get("floor"));
        if (!StringUtils.hasText(legacyFloor)) {
            legacyFloor = trim(filter.get("floorName"));
        }
        if (legacyFloorNames.isEmpty() && StringUtils.hasText(legacyFloor)) {
            legacyFloorNames = List.of(legacyFloor);
        }
        String legacyRoomName = trim(filter.get("roomName"));

        List<String> auditCycles = parseAuditCycles(filter.get("compareCycles"));
        if (auditCycles.isEmpty()) {
            auditCycles = parseAuditCycles(filter.get("auditCycles"));
        }
        if (auditCycles.isEmpty()) {
            auditCycles = List.of("day");
        }

        return new CageAnalyticsFilterParams(
                campusIds,
                areaIds,
                floorIds,
                roomIds,
                legacyCampusNames,
                legacyFloorNames,
                emptyToNull(legacyRoomName),
                auditCycles);
    }

    private static CageAnalyticsFilterParams empty() {
        return new CageAnalyticsFilterParams(
                List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), null, List.of("day"));
    }

    private static List<Integer> parseCampusIds(Object raw) {
        List<String> ids = parseList(raw);
        List<Integer> out = new ArrayList<>();
        for (String s : ids) {
            Integer id = parseCampusId(s);
            if (id != null) {
                out.add(id);
            }
        }
        return dedupeInt(out);
    }

    private static List<Integer> dedupeInt(List<Integer> list) {
        Set<Integer> set = new LinkedHashSet<>(list);
        return new ArrayList<>(set);
    }

    private static List<String> dedupeStr(List<String> list) {
        Set<String> set = new LinkedHashSet<>();
        for (String s : list) {
            if (StringUtils.hasText(s)) {
                set.add(s.trim());
            }
        }
        return new ArrayList<>(set);
    }

    private static Integer parseCampusId(Object raw) {
        if (raw == null) {
            return null;
        }
        String s = String.valueOf(raw).trim();
        if (!StringUtils.hasText(s)) {
            return null;
        }
        try {
            return Integer.parseInt(s);
        } catch (NumberFormatException e) {
            return null;
        }
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
            return dedupeStr(out);
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
            return dedupeStr(out);
        }
        return List.of(s);
    }

    private static String trim(Object o) {
        return o == null ? "" : String.valueOf(o).trim();
    }

    private static String emptyToNull(String s) {
        return StringUtils.hasText(s) ? s.trim() : null;
    }
}
