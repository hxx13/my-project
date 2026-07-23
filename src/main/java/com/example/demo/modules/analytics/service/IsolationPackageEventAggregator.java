package com.example.demo.modules.analytics.service;

import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

/**
 * 清洗包主口径：每条纳入记录计 1 次进出事件（不做进→出配对）。
 * <p>{@code uniqueGroups} 为本口径课题组数（ARO {@code project_group_name} 逗号拆分，与 {@code byProjectGroup} 一致）。
 * {@code uniqueUsers} 由 {@link AccessCleanPackageAnalyticsService} 以 SQL 全量去重覆盖（含无 mapping 的兜底键）。</p>
 */
@Component
public class IsolationPackageEventAggregator {

    private static final DateTimeFormatter DAY_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    private static final String UNLABELED_GROUP = "未标注课题组";
    private static final String[] FLOOR_ZONE_PREFIXES = {
        "地下E11C", "E11A", "E11B", "E11C", "1", "2", "3", "4"
    };

    public Map<String, Object> aggregate(
            List<Map<String, Object>> logs,
            long totalEvents,
            long studentEvents,
            long staffEvents,
            String dataSourceLabel) {
        return aggregate(logs, totalEvents, studentEvents, staffEvents, dataSourceLabel, false);
    }

    /**
     * @param studentOnly 为 true 时课题组/uniqueGroups 仅统计 audienceType=STUDENT 的行
     */
    public Map<String, Object> aggregate(
            List<Map<String, Object>> logs,
            long totalEvents,
            long studentEvents,
            long staffEvents,
            String dataSourceLabel,
            boolean studentOnly) {
        Map<String, Object> out = new LinkedHashMap<>();
        if (logs == null || logs.isEmpty()) {
            out.put("summary", eventSummary(0, studentEvents, staffEvents, 0, 0, 0, 0, dataSourceLabel));
            out.put("byRegion", List.of());
            out.put("byProjectGroup", List.of());
            out.put("byRoom", List.of());
            out.put("byDay", List.of());
            return out;
        }

        Set<String> uniqueUsers = new HashSet<>();
        Set<String> scopedRooms = new HashSet<>();
        Map<String, RegionAgg> regionAgg = new HashMap<>();
        Map<String, RoomAgg> roomAgg = new HashMap<>();
        Map<String, GroupAgg> groupAgg = new HashMap<>();
        Map<String, Long> dayEvents = new TreeMap<>();

        for (Map<String, Object> log : logs) {
            String userId = str(log.get("userId"));
            if (StringUtils.hasText(userId)) {
                uniqueUsers.add(userId);
            }
            String roomKey = IsolationRoundAggregator.resolveRoomKey(log);
            if (StringUtils.hasText(roomKey)) {
                scopedRooms.add(roomKey);
            }

            String regionKey = regionBucket(log);
            RegionAgg ra = regionAgg.computeIfAbsent(regionKey, k -> new RegionAgg());
            ra.events++;

            if (StringUtils.hasText(roomKey)) {
                String roomLabel = str(log.get("roomName"));
                String roomId = str(log.get("roomId"));
                RoomAgg ro = roomAgg.computeIfAbsent(roomKey, k -> new RoomAgg(roomId, roomLabel, regionKey));
                ro.events++;
            }

            for (String g : resolveGroups(log)) {
                // studentOnly 时仅统计 audienceType=STUDENT 的行
                if (studentOnly && !"STUDENT".equalsIgnoreCase(str(log.get("audienceType")))) {
                    continue;
                }
                GroupAgg ga = groupAgg.computeIfAbsent(g, k -> new GroupAgg());
                ga.events++;
            }

            String day = dayKey(str(log.get("createTime")));
            if (day != null) {
                dayEvents.merge(day, 1L, Long::sum);
            }
        }

        out.put(
                "summary",
                eventSummary(
                        totalEvents,
                        studentEvents,
                        staffEvents,
                        uniqueUsers.size(),
                        groupAgg.size(),
                        scopedRooms.size(),
                        logs.size(),
                        dataSourceLabel));
        out.put("byRegion", toRegionRows(regionAgg));
        out.put("byProjectGroup", toGroupRows(groupAgg));
        out.put("byRoom", toRoomRows(roomAgg));
        out.put("byDay", toDayRows(dayEvents));
        return out;
    }

    private static Map<String, Object> eventSummary(
            long totalEvents,
            long studentEvents,
            long staffEvents,
            int uniqueUsers,
            int uniqueGroups,
            int uniqueRooms,
            int rawLogCount,
            String dataSourceLabel) {
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("totalEvents", totalEvents);
        summary.put("studentEvents", studentEvents);
        summary.put("staffEvents", staffEvents);
        summary.put("totalPersonTimes", totalEvents);
        summary.put("totalSets", totalEvents);
        summary.put("studentSets", studentEvents);
        summary.put("staffSets", staffEvents);
        summary.put("totalRounds", 0);
        summary.put("totalEnter", totalEvents);
        summary.put("totalExit", 0);
        summary.put("uniqueUsers", uniqueUsers);
        summary.put("uniqueRooms", uniqueRooms);
        summary.put("uniqueGroups", uniqueGroups);
        summary.put("scopedRoomCount", uniqueRooms);
        summary.put("rawLogCount", rawLogCount);
        summary.put("truncated", rawLogCount >= 500000);
        if (StringUtils.hasText(dataSourceLabel)) {
            summary.put("dataSource", dataSourceLabel);
        }
        return summary;
    }

    private static List<Map<String, Object>> toRegionRows(Map<String, RegionAgg> regionAgg) {
        return regionAgg.entrySet().stream()
                .sorted((a, b) -> Long.compare(b.getValue().events, a.getValue().events))
                .map(
                        en -> {
                            Map<String, Object> row = new LinkedHashMap<>();
                            row.put("regionName", en.getKey());
                            row.put("personTimes", en.getValue().events);
                            row.put("eventCount", en.getValue().events);
                            return row;
                        })
                .toList();
    }

    private static List<Map<String, Object>> toRoomRows(Map<String, RoomAgg> roomAgg) {
        return roomAgg.values().stream()
                .sorted((a, b) -> Long.compare(b.events, a.events))
                .map(
                        ro -> {
                            Map<String, Object> row = new LinkedHashMap<>();
                            row.put("roomId", ro.roomId);
                            row.put("roomName", ro.roomLabel);
                            row.put("regionName", ro.regionKey);
                            row.put("personTimes", ro.events);
                            row.put("eventCount", ro.events);
                            return row;
                        })
                .toList();
    }

    private static List<Map<String, Object>> toGroupRows(Map<String, GroupAgg> groupAgg) {
        return groupAgg.entrySet().stream()
                .sorted((a, b) -> Long.compare(b.getValue().events, a.getValue().events))
                .map(
                        en -> {
                            Map<String, Object> row = new LinkedHashMap<>();
                            row.put("groupName", en.getKey());
                            row.put("personTimes", en.getValue().events);
                            row.put("eventCount", en.getValue().events);
                            return row;
                        })
                .toList();
    }

    private static List<Map<String, Object>> toDayRows(Map<String, Long> dayEvents) {
        return dayEvents.entrySet().stream()
                .map(
                        en -> {
                            Map<String, Object> row = new LinkedHashMap<>();
                            row.put("date", en.getKey());
                            row.put("rounds", en.getValue());
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

    private static String regionBucket(Map<String, Object> log) {
        String area = str(log.get("areaName"));
        if (!StringUtils.hasText(area)) {
            area = "未知校区";
        }
        String zone = detectFloorZone(str(log.get("roomName")));
        if (StringUtils.hasText(zone)) {
            return area + " · " + zone;
        }
        return area;
    }

    private static String detectFloorZone(String roomName) {
        if (!StringUtils.hasText(roomName)) {
            return "";
        }
        for (String prefix : FLOOR_ZONE_PREFIXES) {
            if (roomName.startsWith(prefix)) {
                return prefix;
            }
        }
        return "";
    }

    private static String dayKey(String createTime) {
        if (!StringUtils.hasText(createTime) || createTime.length() < 10) {
            return null;
        }
        try {
            return LocalDate.parse(createTime.substring(0, 10)).format(DAY_FMT);
        } catch (Exception e) {
            return createTime.substring(0, 10);
        }
    }

    private static String str(Object o) {
        return o == null ? "" : String.valueOf(o).trim();
    }

    private static class RegionAgg {
        long events;
    }

    private static class RoomAgg {
        final String roomId;
        final String roomLabel;
        final String regionKey;
        long events;

        RoomAgg(String roomId, String roomLabel, String regionKey) {
            this.roomId = roomId;
            this.roomLabel = roomLabel;
            this.regionKey = regionKey;
        }
    }

    private static class GroupAgg {
        long events;
    }
}
