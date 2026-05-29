package com.example.demo.modules.analytics.service;

import com.example.demo.modules.twin.common.mapper.TwinDashboardMapper;
import com.example.demo.modules.twin.common.util.PersonnelProjectGroupUtil;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class StudentActivityService {

    private static final Logger log = LoggerFactory.getLogger(StudentActivityService.class);
    private static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final int MAX_USER_IDS = 2000;
    private static final int MAX_GROUP_SUGGESTIONS = 20;

    private final TwinDashboardMapper dashboardMapper;

    public StudentActivityService(TwinDashboardMapper dashboardMapper) {
        this.dashboardMapper = dashboardMapper;
    }

    /** 课题组搜索建议 */
    public List<Map<String, Object>> listGroups(String keyword) {
        List<String> rawFields = dashboardMapper.searchPersonnelProjectGroupFields(
                keyword != null ? keyword.trim() : "", MAX_GROUP_SUGGESTIONS * 2);
        List<String> groups = PersonnelProjectGroupUtil.distinctGroupsMatchingKeyword(
                rawFields, keyword, MAX_GROUP_SUGGESTIONS);
        return groups.stream().map(g -> {
            Map<String, Object> m = new HashMap<>();
            m.put("name", g);
            return m;
        }).collect(Collectors.toList());
    }

    /** 成员活跃度查询 */
    public Map<String, Object> queryMemberActivity(
            String groupName, String startTime, String endTime,
            String sortBy, String order, int page, int size) {

        if (groupName == null || groupName.isBlank()) {
            Map<String, Object> empty = new HashMap<>();
            empty.put("summary", summaryMap(0, 0, 0, 0, 0));
            empty.put("members", List.of());
            empty.put("total", 0);
            return empty;
        }

        if (page < 1) page = 1;
        if (size < 1) size = 20;

        // 1. 拉取该课题组所有 userId
        List<String> userIds = dashboardMapper.listUserIdsByProjectGroup(groupName.trim(), MAX_USER_IDS);
        if (userIds.isEmpty()) {
            Map<String, Object> empty = new HashMap<>();
            empty.put("summary", summaryMap(0, 0, 0, 0, 0));
            empty.put("members", List.of());
            empty.put("total", 0);
            return empty;
        }

        // 2. 拉取这些人在时间范围内的全部进出流水（按 userId + 时间升序）
        List<Map<String, Object>> rawLogs = dashboardMapper.listAccessLogsByUserIds(
                userIds, startTime, endTime);

        // 3. 按 userId 分组
        Map<String, List<Map<String, Object>>> logsByUser = new LinkedHashMap<>();
        for (Map<String, Object> log : rawLogs) {
            String uid = String.valueOf(log.getOrDefault("user_id", ""));
            logsByUser.computeIfAbsent(uid, k -> new ArrayList<>()).add(log);
        }

        // 4. 每人配对 + 聚合指标
        List<MemberActivityRow> rows = new ArrayList<>();
        for (String uid : userIds) {
            List<Map<String, Object>> userLogs = logsByUser.getOrDefault(uid, List.of());
            MemberActivityRow row = computeMemberRow(uid, userLogs);
            if (row != null) rows.add(row);
        }

        // 5. 排序
        Comparator<MemberActivityRow> cmp = switch (sortBy != null ? sortBy : "entries") {
            case "duration" -> Comparator.comparingLong(MemberActivityRow::getTotalDurationMinutes);
            case "dailyAvg" -> Comparator.comparingDouble(MemberActivityRow::getDailyAvgFreq);
            case "lastActive" -> Comparator.comparing(r -> r.getLastActiveDate() != null ? r.getLastActiveDate() : "0000");
            default -> Comparator.comparingInt(MemberActivityRow::getEntryCount);
        };
        if ("asc".equals(order)) {
            rows.sort(cmp);
        } else {
            rows.sort(cmp.reversed());
        }

        // 6. 汇总
        int total = rows.size();
        int totalEntries = rows.stream().mapToInt(MemberActivityRow::getEntryCount).sum();
        long totalDuration = rows.stream().mapToLong(MemberActivityRow::getTotalDurationMinutes).sum();
        double avgDaily = rows.stream().mapToDouble(MemberActivityRow::getDailyAvgFreq).average().orElse(0);
        long recent7d = rows.stream().filter(r -> r.getDaysSinceLastActive() <= 7).count();
        int activeRate = total > 0 ? (int) Math.round(100.0 * recent7d / total) : 0;

        // 7. 分页
        int offset = (page - 1) * size;
        List<MemberActivityRow> paged = rows.stream().skip(offset).limit(size).toList();

        Map<String, Object> result = new HashMap<>();
        result.put("summary", summaryMap(total, totalEntries, totalDuration, avgDaily, activeRate));
        result.put("members", paged.stream().map(this::rowToMap).toList());
        result.put("total", total);
        return result;
    }

    /** 进出配对 + 指标计算 */
    private MemberActivityRow computeMemberRow(String userId, List<Map<String, Object>> userLogs) {
        // 分离 entry(1) 和 exit(2)
        List<LocalDateTime> entries = new ArrayList<>();
        List<LocalDateTime> exits = new ArrayList<>();
        String userName = userId;

        for (Map<String, Object> log : userLogs) {
            int accessType = parseAccessType(log);
            String ts = String.valueOf(log.getOrDefault("create_time", ""));
            LocalDateTime dt = parseTime(ts);
            if (dt == null) continue;
            if (accessType == 1) entries.add(dt);
            else if (accessType == 2) exits.add(dt);
            String n = String.valueOf(log.getOrDefault("name", ""));
            if (!n.isEmpty() && !"null".equals(n)) userName = n;
        }

        // 配对：每条 entry 找其后最近的 exit（24h内）
        int pairCount = 0;
        long totalDurationMinutes = 0;
        Set<String> activeDates = new HashSet<>();
        LocalDateTime lastEntry = null;

        int exitIdx = 0;
        for (LocalDateTime entry : entries) {
            while (exitIdx < exits.size() && !exits.get(exitIdx).isAfter(entry)) {
                exitIdx++;
            }
            if (exitIdx < exits.size()) {
                LocalDateTime exit = exits.get(exitIdx);
                long diffMin = ChronoUnit.MINUTES.between(entry, exit);
                if (diffMin <= 24 * 60) {
                    pairCount++;
                    totalDurationMinutes += diffMin;
                    activeDates.add(entry.toLocalDate().toString());
                    lastEntry = entry;
                    exitIdx++; // 该 exit 已被消费
                }
            }
        }

        if (pairCount == 0) return null;

        int activeDays = activeDates.size();
        double dailyAvgFreq = activeDays > 0 ? (double) pairCount / activeDays : 0;
        String lastActiveDate = lastEntry != null ? lastEntry.toLocalDate().toString() : null;
        long daysSinceLastActive = lastActiveDate != null
                ? ChronoUnit.DAYS.between(lastEntry.toLocalDate(), LocalDateTime.now().toLocalDate())
                : 999;

        MemberActivityRow row = new MemberActivityRow();
        row.setUserId(userId);
        row.setUserName(userName);
        row.setEntryCount(pairCount);
        row.setTotalDurationMinutes(totalDurationMinutes);
        row.setDailyAvgFreq(Math.round(dailyAvgFreq * 10.0) / 10.0);
        row.setLastActiveDate(lastActiveDate);
        row.setDaysSinceLastActive(daysSinceLastActive);
        return row;
    }

    /** 时段热力图 */
    public List<Map<String, Object>> heatmap(String groupName, String startTime, String endTime) {
        if (groupName == null || groupName.isBlank()) {
            return List.of();
        }

        List<String> userIds = dashboardMapper.listUserIdsByProjectGroup(groupName.trim(), MAX_USER_IDS);
        if (userIds.isEmpty()) return List.of();

        List<Map<String, Object>> rawLogs = dashboardMapper.listAccessLogsByUserIds(userIds, startTime, endTime);

        Map<String, Integer> grid = new LinkedHashMap<>();
        for (Map<String, Object> log : rawLogs) {
            String ts = String.valueOf(log.getOrDefault("create_time", ""));
            LocalDateTime dt = parseTime(ts);
            if (dt == null) continue;
            String key = dt.getDayOfWeek().getValue() + ":" + dt.getHour();
            grid.merge(key, 1, Integer::sum);
        }

        List<Map<String, Object>> result = new ArrayList<>();
        for (int dow = 1; dow <= 7; dow++) {
            for (int h = 0; h < 24; h++) {
                int count = grid.getOrDefault(dow + ":" + h, 0);
                if (count > 0) {
                    Map<String, Object> cell = new HashMap<>();
                    cell.put("dayOfWeek", dow);
                    cell.put("hour", h);
                    cell.put("count", count);
                    result.add(cell);
                }
            }
        }
        return result;
    }

    /** 日趋势 */
    public List<Map<String, Object>> dailyTrend(String groupName, String startTime, String endTime) {
        if (groupName == null || groupName.isBlank()) {
            return List.of();
        }

        List<String> userIds = dashboardMapper.listUserIdsByProjectGroup(groupName.trim(), MAX_USER_IDS);
        if (userIds.isEmpty()) return List.of();

        List<Map<String, Object>> rawLogs = dashboardMapper.listAccessLogsByUserIds(userIds, startTime, endTime);

        Map<String, int[]> daily = new LinkedHashMap<>();
        for (Map<String, Object> log : rawLogs) {
            String ts = String.valueOf(log.getOrDefault("create_time", ""));
            LocalDateTime dt = parseTime(ts);
            if (dt == null) continue;
            String date = dt.toLocalDate().toString();
            int[] counts = daily.computeIfAbsent(date, k -> new int[2]);
            int accessType = parseAccessType(log);
            if (accessType == 1) counts[0]++;
            else if (accessType == 2) counts[1]++;
        }

        return daily.entrySet().stream()
                .sorted(Map.Entry.comparingByKey())
                .map(e -> {
                    Map<String, Object> m = new HashMap<>();
                    m.put("date", e.getKey());
                    m.put("entryCount", e.getValue()[0]);
                    m.put("exitCount", e.getValue()[1]);
                    return m;
                }).collect(Collectors.toList());
    }

    private int parseAccessType(Map<String, Object> log) {
        Object at = log.get("accessType");
        if (at instanceof Number n) return n.intValue();
        if (at != null) {
            try { return Integer.parseInt(at.toString()); } catch (NumberFormatException e) { return 0; }
        }
        return 0;
    }

    private LocalDateTime parseTime(String ts) {
        if (ts == null || ts.isEmpty()) return null;
        try {
            ts = ts.replace("T", " ");
            if (ts.length() >= 19) ts = ts.substring(0, 19);
            return LocalDateTime.parse(ts, FMT);
        } catch (Exception e) {
            return null;
        }
    }

    private Map<String, Object> summaryMap(int total, int entries, long duration, double avgDaily, int activeRate) {
        Map<String, Object> m = new HashMap<>();
        m.put("memberCount", total);
        m.put("totalEntries", entries);
        m.put("totalDurationMinutes", duration);
        m.put("avgDailyFreq", Math.round(avgDaily * 10.0) / 10.0);
        m.put("activeRate", activeRate);
        return m;
    }

    private Map<String, Object> rowToMap(MemberActivityRow row) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("userId", row.getUserId());
        m.put("userName", row.getUserName());
        m.put("entryCount", row.getEntryCount());
        m.put("totalDurationMinutes", row.getTotalDurationMinutes());
        m.put("dailyAvgFreq", row.getDailyAvgFreq());
        m.put("lastActiveDate", row.getLastActiveDate());
        m.put("daysSinceLastActive", row.getDaysSinceLastActive());
        return m;
    }

    public static class MemberActivityRow {
        private String userId;
        private String userName;
        private int entryCount;
        private long totalDurationMinutes;
        private double dailyAvgFreq;
        private String lastActiveDate;
        private long daysSinceLastActive;

        public String getUserId() { return userId; }
        public void setUserId(String v) { this.userId = v; }
        public String getUserName() { return userName; }
        public void setUserName(String v) { this.userName = v; }
        public int getEntryCount() { return entryCount; }
        public void setEntryCount(int v) { this.entryCount = v; }
        public long getTotalDurationMinutes() { return totalDurationMinutes; }
        public void setTotalDurationMinutes(long v) { this.totalDurationMinutes = v; }
        public double getDailyAvgFreq() { return dailyAvgFreq; }
        public void setDailyAvgFreq(double v) { this.dailyAvgFreq = v; }
        public String getLastActiveDate() { return lastActiveDate; }
        public void setLastActiveDate(String v) { this.lastActiveDate = v; }
        public long getDaysSinceLastActive() { return daysSinceLastActive; }
        public void setDaysSinceLastActive(long v) { this.daysSinceLastActive = v; }
    }
}
