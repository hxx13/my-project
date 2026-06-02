package com.example.demo.modules.analytics.service;

import com.example.demo.modules.aro.dto.AroPersonnel;
import com.example.demo.modules.aro.mapper.AroPersonnelMapper;
import com.example.demo.modules.twin.common.mapper.TwinDashboardMapper;
import com.example.demo.modules.twin.common.util.PersonnelProjectGroupUtil;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
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
    private final AroPersonnelMapper aroPersonnelMapper;

    public StudentActivityService(TwinDashboardMapper dashboardMapper, AroPersonnelMapper aroPersonnelMapper) {
        this.dashboardMapper = dashboardMapper;
        this.aroPersonnelMapper = aroPersonnelMapper;
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

    /** 课题组分页列表：按同校区人均周频次占比降序 */
    public Map<String, Object> listGroupsPaged(String keyword, String startTime, String endTime, int page, int size) {
        if (page < 1) page = 1;
        if (size < 1) size = 1;

        // 1. 拉取所有课题组名（含 keyword 过滤）
        List<String> allGroups = PersonnelProjectGroupUtil.distinctGroupsMatchingKeyword(
                dashboardMapper.searchPersonnelProjectGroupFields(
                        keyword != null ? keyword.trim() : "", 500),
                keyword, 500);

        // 2. 计算每个组的指标
        List<GroupActivityRow> rows = new ArrayList<>();
        for (String groupName : allGroups) {
            GroupActivityRow row = computeGroupRow(groupName, startTime, endTime);
            if (row != null) rows.add(row);
        }

        // 2.5 填充同校区活跃度占比
        fillActiveSharePct(rows);

        // 3. 按 activeSharePct 降序
        rows.sort(Comparator.comparingDouble(GroupActivityRow::getActiveSharePct).reversed());

        // 4. 分页
        int total = rows.size();
        int offset = (page - 1) * size;
        List<GroupActivityRow> paged = rows.stream().skip(offset).limit(size).toList();

        Map<String, Object> result = new HashMap<>();
        result.put("groups", paged.stream().map(this::groupRowToMap).toList());
        result.put("total", total);
        result.put("page", page);
        result.put("size", size);
        return result;
    }

    private GroupActivityRow computeGroupRow(String groupName, String startTime, String endTime) {
        List<String> userIds = dashboardMapper.listUserIdsByProjectGroup(groupName.trim(), MAX_USER_IDS);
        if (userIds.isEmpty()) return null;

        List<Map<String, Object>> rawLogs = dashboardMapper.listAccessLogsByUserIds(userIds, startTime, endTime);

        int totalEntries = 0;
        Map<String, String> userCampus = new LinkedHashMap<>();
        for (String uid : userIds) {
            List<Map<String, Object>> userLogs = rawLogs.stream()
                    .filter(l -> uid.equals(String.valueOf(l.getOrDefault("user_id", ""))))
                    .toList();
            int userPairs = countPairedEntries(userLogs);
            totalEntries += userPairs;
            if (!userCampus.containsKey(uid)) {
                String campus = resolveCampusForUser(uid, userLogs);
                userCampus.put(uid, campus != null ? campus : "未知校区");
            }
        }

        int memberCount = userIds.size();
        long days = Math.max(1, ChronoUnit.DAYS.between(
                LocalDateTime.parse(startTime.replace(" ", "T"), DateTimeFormatter.ISO_LOCAL_DATE_TIME).toLocalDate(),
                LocalDateTime.parse(endTime.replace(" ", "T"), DateTimeFormatter.ISO_LOCAL_DATE_TIME).toLocalDate()) + 1);
        double weeks = Math.max(1.0, Math.ceil(days / 7.0));
        double perCapitaWeeklyFreq = memberCount > 0 ? (double) totalEntries / memberCount / weeks : 0;

        String majorityCampus = userCampus.values().stream()
                .collect(Collectors.groupingBy(c -> c, Collectors.counting()))
                .entrySet().stream().max(Map.Entry.comparingByValue())
                .map(Map.Entry::getKey).orElse("未知校区");

        GroupActivityRow row = new GroupActivityRow();
        row.setName(groupName);
        row.setCampus(majorityCampus);
        row.setMemberCount(memberCount);
        row.setTotalEntries(totalEntries);
        row.setPerCapitaWeeklyFreq(Math.round(perCapitaWeeklyFreq * 10.0) / 10.0);
        row.setActiveSharePct(0);
        return row;
    }

    /** Fill activeSharePct for all rows (same-campus sum division) */
    private void fillActiveSharePct(List<GroupActivityRow> allRows) {
        Map<String, Double> campusSums = new HashMap<>();
        for (GroupActivityRow r : allRows) {
            campusSums.merge(r.getCampus(), r.getPerCapitaWeeklyFreq(), Double::sum);
        }
        for (GroupActivityRow r : allRows) {
            double campusSum = campusSums.getOrDefault(r.getCampus(), 1.0);
            if (campusSum > 0) {
                r.setActiveSharePct(Math.round(r.getPerCapitaWeeklyFreq() / campusSum * 1000.0) / 10.0);
            }
        }
    }

    /** Determine campus from user's access logs (area_name contains 浦东/浦西) */
    private String resolveCampusForUser(String userId, List<Map<String, Object>> userLogs) {
        long pudong = userLogs.stream()
                .filter(l -> {
                    String a = String.valueOf(l.getOrDefault("area_name", ""));
                    return a.contains("浦东");
                }).count();
        long puxi = userLogs.stream()
                .filter(l -> {
                    String a = String.valueOf(l.getOrDefault("area_name", ""));
                    return a.contains("浦西");
                }).count();
        if (pudong > puxi) return "浦东";
        if (puxi > pudong) return "浦西";
        return "未知校区";
    }

    /** Count entry-exit pairs from user's access logs */
    private int countPairedEntries(List<Map<String, Object>> userLogs) {
        List<LocalDateTime> entries = new ArrayList<>();
        List<LocalDateTime> exits = new ArrayList<>();
        for (Map<String, Object> log : userLogs) {
            int accessType = parseAccessType(log);
            String ts = String.valueOf(log.getOrDefault("create_time", ""));
            LocalDateTime dt = parseTime(ts);
            if (dt == null) continue;
            if (accessType == 1) entries.add(dt);
            else if (accessType == 2) exits.add(dt);
        }
        int pairCount = 0;
        int exitIdx = 0;
        for (LocalDateTime entry : entries) {
            while (exitIdx < exits.size() && !exits.get(exitIdx).isAfter(entry)) exitIdx++;
            if (exitIdx < exits.size()) {
                long diffMin = ChronoUnit.MINUTES.between(entry, exits.get(exitIdx));
                if (diffMin <= 24 * 60) { pairCount++; exitIdx++; }
            }
        }
        return pairCount;
    }

    /** 成员活跃度查询 */
    public Map<String, Object> queryMemberActivity(
            String groupName, String startTime, String endTime,
            String sortBy, String order, int page, int size) {

        if (groupName == null || groupName.isBlank()) {
            Map<String, Object> empty = new HashMap<>();
            empty.put("summary", summaryMap(0, 0, 0, 0, 0, "未知校区", ""));
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
            empty.put("summary", summaryMap(0, 0, 0, 0, 0, "未知校区", ""));
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
            MemberActivityRow row = computeMemberRow(uid, userLogs, startTime, endTime);
            if (row != null) rows.add(row);
        }

        // 5. 排序
        Comparator<MemberActivityRow> cmp = switch (sortBy != null ? sortBy : "entries") {
            case "totalDurationMinutes" -> Comparator.comparingLong(MemberActivityRow::getTotalDurationMinutes);
            case "weeklyAvgFreq" -> Comparator.comparingDouble(MemberActivityRow::getWeeklyAvgFreq);
            case "lastActiveDate" -> Comparator.comparing(r -> r.getLastActiveDate() != null ? r.getLastActiveDate() : "0000");
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
        double avgWeekly = rows.stream().mapToDouble(MemberActivityRow::getWeeklyAvgFreq).average().orElse(0);

        // Get activeSharePct and campus from computeGroupRow (added in Task 1)
        double activeSharePct = 0;
        String campus = "未知校区";
        GroupActivityRow groupRow = computeGroupRow(groupName, startTime, endTime);
        if (groupRow != null) {
            activeSharePct = groupRow.getActiveSharePct();
            campus = groupRow.getCampus();
        }

        String timeLabel = deriveTimeLabel(startTime, endTime);

        // 7. 分页
        int offset = (page - 1) * size;
        List<MemberActivityRow> paged = rows.stream().skip(offset).limit(size).toList();

        Map<String, Object> result = new HashMap<>();
        result.put("summary", summaryMap(total, totalEntries, totalDuration, avgWeekly, activeSharePct, campus, timeLabel));
        result.put("members", paged.stream().map(this::rowToMap).toList());
        result.put("total", total);
        return result;
    }

    /** 进出配对 + 指标计算 */
    private MemberActivityRow computeMemberRow(String userId, List<Map<String, Object>> userLogs,
                                                String startTime, String endTime) {
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

        // Calculate weekly frequency (replaces daily)
        long days = Math.max(1, ChronoUnit.DAYS.between(
                LocalDateTime.parse(startTime.replace(" ", "T"), DateTimeFormatter.ISO_LOCAL_DATE_TIME).toLocalDate(),
                LocalDateTime.parse(endTime.replace(" ", "T"), DateTimeFormatter.ISO_LOCAL_DATE_TIME).toLocalDate()) + 1);
        double weeks = Math.max(1.0, Math.ceil(days / 7.0));
        double weeklyAvgFreq = weeks > 0 ? (double) pairCount / weeks : 0;

        // Get experience level from personnel database
        String experienceLevel = resolveExperienceLevel(userId);

        MemberActivityRow row = new MemberActivityRow();
        row.setUserId(userId);
        row.setUserName(userName);
        row.setEntryCount(pairCount);
        row.setTotalDurationMinutes(totalDurationMinutes);
        row.setDailyAvgFreq(Math.round(dailyAvgFreq * 10.0) / 10.0);
        row.setWeeklyAvgFreq(Math.round(weeklyAvgFreq * 10.0) / 10.0);
        row.setExperienceLevel(experienceLevel != null ? experienceLevel : "-");
        row.setLastActiveDate(lastActiveDate);
        row.setDaysSinceLastActive(daysSinceLastActive);
        return row;
    }

    private String resolveExperienceLevel(String userId) {
        try {
            AroPersonnel p = aroPersonnelMapper.findByUserId(userId);
            if (p != null && p.getTotalExp() != null) {
                int level = (int) Math.floor(Math.sqrt(p.getTotalExp() / 50.0)) + 1;
                return "Lv." + level;
            }
        } catch (Exception e) { /* ignore */ }
        return "-";
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

    /** 课题组房间进出频次排行 */
    public List<Map<String, Object>> roomUsage(String groupName, String startTime, String endTime) {
        if (groupName == null || groupName.isBlank()) return List.of();

        List<String> userIds = dashboardMapper.listUserIdsByProjectGroup(groupName.trim(), MAX_USER_IDS);
        if (userIds.isEmpty()) return List.of();

        List<Map<String, Object>> rawLogs = dashboardMapper.listAccessLogsByUserIds(userIds, startTime, endTime);

        Map<String, Integer> roomCounts = new LinkedHashMap<>();
        for (Map<String, Object> log : rawLogs) {
            String room = String.valueOf(log.getOrDefault("room_name", ""));
            if (room.isEmpty() || "null".equals(room)) continue;
            roomCounts.merge(room, 1, Integer::sum);
        }

        return roomCounts.entrySet().stream()
                .sorted(Map.Entry.<String, Integer>comparingByValue().reversed())
                .map(e -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("roomName", e.getKey());
                    m.put("entryCount", e.getValue());
                    return m;
                })
                .collect(Collectors.toList());
    }

    /** 单个课题组 KPI 汇总（正确计算同校区活跃度占比） */
    public Map<String, Object> summary(String groupName, String startTime, String endTime) {
        if (groupName == null || groupName.isBlank()) {
            Map<String, Object> empty = new HashMap<>();
            empty.put("memberCount", 0);
            empty.put("totalEntries", 0);
            empty.put("perCapitaWeeklyFreq", 0);
            empty.put("activeSharePct", 0);
            empty.put("campus", "-");
            empty.put("timeLabel", deriveTimeLabel(startTime, endTime));
            return empty;
        }
        GroupActivityRow row = computeGroupRow(groupName, startTime, endTime);
        if (row == null) {
            Map<String, Object> empty = new HashMap<>();
            empty.put("memberCount", 0);
            empty.put("totalEntries", 0);
            empty.put("perCapitaWeeklyFreq", 0);
            empty.put("activeSharePct", 0);
            empty.put("campus", "-");
            empty.put("timeLabel", deriveTimeLabel(startTime, endTime));
            return empty;
        }
        // Load all groups to compute proper activeSharePct (same-campus normalization)
        List<String> allGroups = PersonnelProjectGroupUtil.distinctGroupsMatchingKeyword(
                dashboardMapper.searchPersonnelProjectGroupFields("", 500), "", 500);
        List<GroupActivityRow> allRows = new ArrayList<>();
        allRows.add(row);
        for (String g : allGroups) {
            if (g.equalsIgnoreCase(groupName)) continue;
            GroupActivityRow gr = computeGroupRow(g, startTime, endTime);
            if (gr != null) allRows.add(gr);
        }
        fillActiveSharePct(allRows);
        GroupActivityRow updated = allRows.stream()
                .filter(r -> r.getName().equalsIgnoreCase(groupName)).findFirst().orElse(row);

        Map<String, Object> m = new HashMap<>();
        m.put("memberCount", updated.getMemberCount());
        m.put("totalEntries", updated.getTotalEntries());
        m.put("perCapitaWeeklyFreq", updated.getPerCapitaWeeklyFreq());
        m.put("activeSharePct", updated.getActiveSharePct());
        m.put("campus", updated.getCampus());
        m.put("timeLabel", deriveTimeLabel(startTime, endTime));
        return m;
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

    private Map<String, Object> summaryMap(int total, int entries, long duration,
                                            double avgWeekly, double activeSharePct,
                                            String campus, String timeLabel) {
        Map<String, Object> m = new HashMap<>();
        m.put("memberCount", total);
        m.put("totalEntries", entries);
        m.put("totalDurationMinutes", duration);
        m.put("perCapitaWeeklyFreq", Math.round(avgWeekly * 10.0) / 10.0);
        m.put("activeSharePct", activeSharePct);
        m.put("campus", campus);
        m.put("timeLabel", timeLabel);
        return m;
    }

    private String deriveTimeLabel(String start, String end) {
        LocalDate s = LocalDate.parse(start.substring(0, 10));
        LocalDate e = LocalDate.parse(end.substring(0, 10));
        LocalDate today = LocalDate.now();
        if (s.equals(today) && e.equals(today)) return "今日";
        if (s.equals(today.minusDays(6)) && e.equals(today)) return "本周";
        if (s.equals(today.minusMonths(1)) && e.equals(today)) return "本月";
        return s.toString().substring(5) + "-" + e.toString().substring(5);
    }

    private Map<String, Object> rowToMap(MemberActivityRow row) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("userId", row.getUserId());
        m.put("userName", row.getUserName());
        m.put("entryCount", row.getEntryCount());
        m.put("totalDurationMinutes", row.getTotalDurationMinutes());
        m.put("dailyAvgFreq", row.getDailyAvgFreq());
        m.put("weeklyAvgFreq", row.getWeeklyAvgFreq());
        m.put("experienceLevel", row.getExperienceLevel());
        m.put("lastActiveDate", row.getLastActiveDate());
        m.put("daysSinceLastActive", row.getDaysSinceLastActive());
        return m;
    }

    private Map<String, Object> groupRowToMap(GroupActivityRow row) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("name", row.getName());
        m.put("campus", row.getCampus());
        m.put("memberCount", row.getMemberCount());
        m.put("totalEntries", row.getTotalEntries());
        m.put("perCapitaWeeklyFreq", row.getPerCapitaWeeklyFreq());
        m.put("activeSharePct", row.getActiveSharePct());
        return m;
    }

    public static class GroupActivityRow {
        private String name;
        private String campus;
        private int memberCount;
        private int totalEntries;
        private double perCapitaWeeklyFreq;
        private double activeSharePct;
        public String getName() { return name; }
        public void setName(String v) { this.name = v; }
        public String getCampus() { return campus; }
        public void setCampus(String v) { this.campus = v; }
        public int getMemberCount() { return memberCount; }
        public void setMemberCount(int v) { this.memberCount = v; }
        public int getTotalEntries() { return totalEntries; }
        public void setTotalEntries(int v) { this.totalEntries = v; }
        public double getPerCapitaWeeklyFreq() { return perCapitaWeeklyFreq; }
        public void setPerCapitaWeeklyFreq(double v) { this.perCapitaWeeklyFreq = v; }
        public double getActiveSharePct() { return activeSharePct; }
        public void setActiveSharePct(double v) { this.activeSharePct = v; }
    }

    public static class MemberActivityRow {
        private String userId;
        private String userName;
        private int entryCount;
        private long totalDurationMinutes;
        private double dailyAvgFreq;
        private double weeklyAvgFreq;
        private String experienceLevel;
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
        public double getWeeklyAvgFreq() { return weeklyAvgFreq; }
        public void setWeeklyAvgFreq(double v) { this.weeklyAvgFreq = v; }
        public String getExperienceLevel() { return experienceLevel; }
        public void setExperienceLevel(String v) { this.experienceLevel = v; }
        public String getLastActiveDate() { return lastActiveDate; }
        public void setLastActiveDate(String v) { this.lastActiveDate = v; }
        public long getDaysSinceLastActive() { return daysSinceLastActive; }
        public void setDaysSinceLastActive(long v) { this.daysSinceLastActive = v; }
    }
}
