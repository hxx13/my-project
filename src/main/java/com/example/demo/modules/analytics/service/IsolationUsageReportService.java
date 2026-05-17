package com.example.demo.modules.analytics.service;

import com.example.demo.modules.twin.mapper.TwinDashboardMapper;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

/**
 * 隔离服使用统计：筛选条件与 debug 流水一致（含黑名单）；支持课题组维度。
 */
@Service
public class IsolationUsageReportService {

    private static final DateTimeFormatter DAY_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    private static final String UNLABELED_GROUP = "未标注课题组";
    private static final String[] FLOOR_ZONE_PREFIXES = {
            "地下E11C", "E11A", "E11B", "E11C", "1", "2", "3", "4"
    };

    private final TwinDashboardMapper dashboardMapper;

    public IsolationUsageReportService(TwinDashboardMapper dashboardMapper) {
        this.dashboardMapper = dashboardMapper;
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
        List<Map<String, Object>> logs = fetchLogs(
                campuses, floors, keyword, startTime, endTime, actionType, roomName, excludeBlacklist);
        return aggregate(logs);
    }

    public Map<String, Object> queryWithFilter(AnalyticsFilterParams params, String startTime, String endTime) {
        List<Map<String, Object>> logs = fetchLogs(
                params.campuses(),
                params.floors(),
                null,
                startTime,
                endTime,
                params.actionType(),
                params.roomName(),
                params.excludeBlacklist());
        return aggregate(logs);
    }

    @SuppressWarnings("unchecked")
    public Map<String, Object> summaryOnly(AnalyticsFilterParams params, String startTime, String endTime) {
        Map<String, Object> report = queryWithFilter(params, startTime, endTime);
        return (Map<String, Object>) report.get("summary");
    }

    private List<Map<String, Object>> fetchLogs(
            List<String> campuses,
            List<String> floors,
            String keyword,
            String startTime,
            String endTime,
            Integer actionType,
            String roomName,
            Boolean excludeBlacklist) {
        List<String> campusList = campuses != null ? campuses.stream().filter(StringUtils::hasText).map(String::trim).toList() : List.of();
        List<String> floorList = floors != null ? floors.stream().filter(StringUtils::hasText).map(String::trim).toList() : List.of();
        String legacyCampus = campusList.size() == 1 ? campusList.get(0) : null;
        String legacyFloor = floorList.size() == 1 ? floorList.get(0) : null;
        return dashboardMapper.listFilteredDebugLogsForAggregation(
                legacyCampus,
                legacyFloor,
                campusList.isEmpty() ? null : campusList,
                floorList.isEmpty() ? null : floorList,
                emptyToNull(keyword),
                emptyToNull(startTime),
                emptyToNull(endTime),
                actionType,
                emptyToNull(roomName),
                excludeBlacklist == null || excludeBlacklist);
    }

    private Map<String, Object> aggregate(List<Map<String, Object>> logs) {
        if (logs == null || logs.isEmpty()) {
            return emptyReport();
        }

        Map<String, List<Map<String, Object>>> byUserRoom = new HashMap<>();
        Set<String> scopedRooms = new HashSet<>();

        for (Map<String, Object> log : logs) {
            String userId = str(log.get("userId"));
            if (!StringUtils.hasText(userId)) {
                continue;
            }
            String roomKey = resolveRoomKey(log);
            if (!StringUtils.hasText(roomKey)) {
                continue;
            }
            scopedRooms.add(roomKey);
            byUserRoom.computeIfAbsent(userId + "|" + roomKey, k -> new ArrayList<>()).add(log);
        }

        long totalRounds = 0;
        long totalEnter = 0;
        long totalExit = 0;
        Set<String> uniqueUsers = new HashSet<>();

        Map<String, RegionAgg> regionAgg = new HashMap<>();
        Map<String, RoomAgg> roomAgg = new HashMap<>();
        Map<String, GroupAgg> groupAgg = new HashMap<>();
        Map<String, Long> dayRounds = new TreeMap<>();

        for (Map.Entry<String, List<Map<String, Object>>> e : byUserRoom.entrySet()) {
            List<Map<String, Object>> events = new ArrayList<>(e.getValue());
            events.sort(Comparator.comparing(m -> str(m.get("createTime"))));
            String userId = str(events.get(0).get("userId"));
            uniqueUsers.add(userId);

            RoundCount rc = countRounds(events);
            totalRounds += rc.rounds;
            totalEnter += rc.enters;
            totalExit += rc.exits;

            Map<String, Object> sample = events.get(0);
            final String roomLabel = str(sample.get("roomName"));
            final String roomId = str(sample.get("roomId"));
            String roomKey = resolveRoomKey(sample);
            String regionKey = regionBucket(sample);
            List<String> groups = resolveGroups(sample);

            RegionAgg ra = regionAgg.computeIfAbsent(regionKey, k -> new RegionAgg());
            ra.rounds += rc.rounds;
            ra.enters += rc.enters;
            ra.exits += rc.exits;
            ra.users.add(userId);

            RoomAgg ro = roomAgg.computeIfAbsent(roomKey, k -> new RoomAgg(roomId, roomLabel, regionKey));
            ro.rounds += rc.rounds;
            ro.enters += rc.enters;
            ro.exits += rc.exits;
            ro.users.add(userId);

            for (String g : groups) {
                GroupAgg ga = groupAgg.computeIfAbsent(g, k -> new GroupAgg());
                ga.rounds += rc.rounds;
                ga.enters += rc.enters;
                ga.exits += rc.exits;
                ga.users.add(userId);
            }

            boolean inside = false;
            for (Map<String, Object> ev : events) {
                int at = toInt(ev.get("accessType"));
                if (at == 1) {
                    inside = true;
                } else if (at == 2 && inside) {
                    inside = false;
                    String day = dayKey(str(ev.get("createTime")));
                    if (day != null) {
                        dayRounds.merge(day, 1L, Long::sum);
                    }
                }
            }
        }

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("totalRounds", totalRounds);
        summary.put("totalPersonTimes", totalEnter);
        summary.put("totalEnter", totalEnter);
        summary.put("totalExit", totalExit);
        summary.put("uniqueUsers", uniqueUsers.size());
        summary.put("uniqueRooms", scopedRooms.size());
        summary.put("uniqueGroups", groupAgg.size());
        summary.put("scopedRoomCount", scopedRooms.size());
        summary.put("rawLogCount", logs.size());
        summary.put("truncated", logs.size() >= 300000);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("summary", summary);
        out.put("byRegion", toRegionRows(regionAgg));
        out.put("byProjectGroup", toGroupRows(groupAgg));
        out.put("byDay", toDayRows(dayRounds));
        return out;
    }

    public List<Map<String, Object>> topProjectGroups(Map<String, Object> report, int limit) {
        Object raw = report.get("byProjectGroup");
        if (!(raw instanceof List<?> list)) {
            return List.of();
        }
        return list.stream()
                .filter(Map.class::isInstance)
                .map(m -> (Map<String, Object>) m)
                .sorted((a, b) -> Long.compare(
                        toLong(b.get("personTimes")),
                        toLong(a.get("personTimes"))))
                .limit(limit)
                .toList();
    }

    private static List<Map<String, Object>> toRegionRows(Map<String, RegionAgg> regionAgg) {
        return regionAgg.entrySet().stream()
                .sorted((a, b) -> Long.compare(b.getValue().enters, a.getValue().enters))
                .map(en -> {
                    RegionAgg ra = en.getValue();
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("regionName", en.getKey());
                    row.put("personTimes", ra.enters);
                    return row;
                })
                .toList();
    }

    private static List<Map<String, Object>> toRoomRows(Map<String, RoomAgg> roomAgg) {
        return roomAgg.values().stream()
                .sorted((a, b) -> Long.compare(b.rounds, a.rounds))
                .map(ro -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("roomId", ro.roomId);
                    row.put("roomName", ro.roomLabel);
                    row.put("regionName", ro.regionKey);
                    row.put("floorName", ro.roomLabel);
                    row.put("rounds", ro.rounds);
                    row.put("enters", ro.enters);
                    row.put("exits", ro.exits);
                    row.put("uniqueUsers", ro.users.size());
                    return row;
                })
                .toList();
    }

    private static List<Map<String, Object>> toGroupRows(Map<String, GroupAgg> groupAgg) {
        return groupAgg.entrySet().stream()
                .sorted((a, b) -> Long.compare(b.getValue().enters, a.getValue().enters))
                .map(en -> {
                    GroupAgg ga = en.getValue();
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("groupName", en.getKey());
                    row.put("personTimes", ga.enters);
                    return row;
                })
                .toList();
    }

    private static List<Map<String, Object>> toDayRows(Map<String, Long> dayRounds) {
        return dayRounds.entrySet().stream()
                .map(en -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("date", en.getKey());
                    row.put("rounds", en.getValue());
                    return row;
                })
                .toList();
    }

    private static List<String> resolveGroups(Map<String, Object> log) {
        String raw = str(log.get("projectGroupNames"));
        if (!StringUtils.hasText(raw)) {
            return List.of(UNLABELED_GROUP);
        }
        List<String> parts = Arrays.stream(raw.split("[,，、;；]"))
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

    private static RoundCount countRounds(List<Map<String, Object>> events) {
        RoundCount rc = new RoundCount();
        boolean inside = false;
        for (Map<String, Object> ev : events) {
            int at = toInt(ev.get("accessType"));
            if (at == 1) {
                rc.enters++;
                if (!inside) {
                    inside = true;
                }
            } else if (at == 2) {
                rc.exits++;
                if (inside) {
                    rc.rounds++;
                    inside = false;
                }
            }
        }
        return rc;
    }

    private static String resolveRoomKey(Map<String, Object> log) {
        String rid = str(log.get("roomId"));
        if (StringUtils.hasText(rid)) {
            return "id:" + rid;
        }
        String rname = str(log.get("roomName"));
        return StringUtils.hasText(rname) ? "name:" + rname : "";
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

    private static Map<String, Object> emptyReport() {
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("totalRounds", 0);
        summary.put("totalPersonTimes", 0);
        summary.put("totalEnter", 0);
        summary.put("totalExit", 0);
        summary.put("uniqueUsers", 0);
        summary.put("uniqueRooms", 0);
        summary.put("uniqueGroups", 0);
        summary.put("scopedRoomCount", 0);
        summary.put("rawLogCount", 0);
        summary.put("truncated", false);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("summary", summary);
        out.put("byRegion", List.of());
        out.put("byProjectGroup", List.of());
        out.put("byDay", List.of());
        return out;
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

    private static String str(Object o) {
        return o == null ? "" : String.valueOf(o).trim();
    }

    private static int toInt(Object o) {
        if (o == null) {
            return 0;
        }
        if (o instanceof Number n) {
            return n.intValue();
        }
        try {
            return Integer.parseInt(String.valueOf(o).trim());
        } catch (Exception e) {
            return 0;
        }
    }

    private static String emptyToNull(String s) {
        return StringUtils.hasText(s) ? s.trim() : null;
    }

    private static class RoundCount {
        long rounds;
        long enters;
        long exits;
    }

    private static class RegionAgg {
        long rounds;
        long enters;
        long exits;
        final Set<String> users = new HashSet<>();
    }

    private static class RoomAgg {
        final String roomId;
        final String roomLabel;
        final String regionKey;
        long rounds;
        long enters;
        long exits;
        final Set<String> users = new HashSet<>();

        RoomAgg(String roomId, String roomLabel, String regionKey) {
            this.roomId = roomId;
            this.roomLabel = roomLabel;
            this.regionKey = regionKey;
        }
    }

    private static class GroupAgg {
        long rounds;
        long enters;
        long exits;
        final Set<String> users = new HashSet<>();
    }
}
