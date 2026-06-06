package com.example.demo.modules.analytics.service;

import com.example.demo.modules.analytics.mapper.StudentActivitySnapshotMapper;
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
    private final StudentActivitySnapshotMapper snapshotMapper;

    public StudentActivityService(TwinDashboardMapper dashboardMapper,
                                   AroPersonnelMapper aroPersonnelMapper,
                                   StudentActivitySnapshotMapper snapshotMapper) {
        this.dashboardMapper = dashboardMapper;
        this.aroPersonnelMapper = aroPersonnelMapper;
        this.snapshotMapper = snapshotMapper;
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

    /** 课题组分页列表 — 从快照表读取，排序按总进出次数，活跃度指标固定用本月窗口 */
    public Map<String, Object> listGroupsPaged(String keyword, String startTime, String endTime, int page, int size, String campus) {
        if (page < 1) page = 1;
        if (size < 1) size = 1;

        LocalDate rangeStart = LocalDate.parse(startTime.substring(0, 10));
        LocalDate rangeEnd = LocalDate.parse(endTime.substring(0, 10));

        // Month window for perCapitaWeeklyFreq and activeSharePct (fixed: 1st→yesterday)
        LocalDate today = LocalDate.now();
        LocalDate monthStart = today.withDayOfMonth(1);
        LocalDate monthEnd = today.minusDays(1);
        long monthDays = Math.max(1, ChronoUnit.DAYS.between(monthStart, monthEnd) + 1);
        double monthWeeks = Math.max(1.0, Math.ceil(monthDays / 7.0));

        // 1. Get groups active in selected time range (for listing + sorting)
        List<Map<String, Object>> rangeRows = snapshotMapper.aggregateByDateRange(rangeStart, rangeEnd, keyword, campus);

        // 2. Get month-window data for perCapitaWeeklyFreq and activeSharePct
        List<Map<String, Object>> monthRows = snapshotMapper.aggregateByDateRange(monthStart, monthEnd,
                keyword != null && !keyword.isEmpty() ? keyword : null, campus);
        Map<String, double[]> monthMetrics = new HashMap<>(); // groupName -> {perCapitaWeeklyFreq, activeSharePct}

        // Build campus sums for month window (per-capita weighted)
        Map<String, Double> campusMonthSums = new HashMap<>();
        Map<String, Double> groupMonthPerCapita = new LinkedHashMap<>();
        Map<String, String> groupCampus = new HashMap<>();
        for (Map<String, Object> row : monthRows) {
            String name = String.valueOf(row.get("groupName"));
            String rowCampus = String.valueOf(row.getOrDefault("campus", "unknown"));
            int mc = ((Number) row.getOrDefault("memberCount", 0)).intValue();
            int te = ((Number) row.getOrDefault("totalEntries", 0)).intValue();
            double pf = mc > 0 ? (double) te / mc / monthWeeks : 0;
            groupMonthPerCapita.put(name, pf);
            campusMonthSums.merge(rowCampus, pf, Double::sum);
            groupCampus.put(name, rowCampus);
        }
        // Fill activeSharePct
        for (String name : groupMonthPerCapita.keySet()) {
            double pf = groupMonthPerCapita.get(name);
            String entryCampus = groupCampus.getOrDefault(name, "unknown");
            double campusSum = campusMonthSums.getOrDefault(entryCampus, 1.0);
            double share = campusSum > 0 ? Math.round(pf / campusSum * 1000.0) / 10.0 : 0;
            monthMetrics.put(name, new double[]{Math.round(pf * 10.0) / 10.0, share});
        }

        if (rangeRows.isEmpty()) {
            Map<String, Object> empty = new HashMap<>();
            empty.put("groups", List.of());
            empty.put("total", 0);
            empty.put("page", page);
            empty.put("size", size);
            return empty;
        }

        // Build group rows with range data + month metrics
        long rangeDays = Math.max(1, ChronoUnit.DAYS.between(rangeStart, rangeEnd) + 1);
        double rangeWeeks = Math.max(1.0, Math.ceil(rangeDays / 7.0));

        List<GroupActivityRow> groupRows = new ArrayList<>();
        for (Map<String, Object> row : rangeRows) {
            String name = String.valueOf(row.get("groupName"));
            String rowCampus = String.valueOf(row.getOrDefault("campus", "unknown"));
            int memberCount = ((Number) row.getOrDefault("memberCount", 0)).intValue();
            int totalEntries = ((Number) row.getOrDefault("totalEntries", 0)).intValue();

            // Month metrics (or fallback to range if no month data)
            double[] mm = monthMetrics.getOrDefault(name, new double[]{0, 0});
            double perCapitaWeeklyFreq = mm[0] > 0 ? mm[0]
                    : (memberCount > 0 ? Math.round((double) totalEntries / memberCount / rangeWeeks * 10.0) / 10.0 : 0);
            double activeSharePct = mm[1];

            GroupActivityRow gr = new GroupActivityRow();
            gr.setName(name);
            gr.setCampus(rowCampus);
            gr.setMemberCount(memberCount);
            gr.setTotalEntries(totalEntries);
            gr.setPerCapitaWeeklyFreq(perCapitaWeeklyFreq);
            gr.setActiveSharePct(activeSharePct);
            groupRows.add(gr);
        }

        // Sort by totalEntries descending
        groupRows.sort(Comparator.comparingInt(GroupActivityRow::getTotalEntries).reversed());

        int total = groupRows.size();
        int offset = (page - 1) * size;
        List<GroupActivityRow> paged = groupRows.stream().skip(offset).limit(size).toList();

        Map<String, Object> result = new HashMap<>();
        result.put("groups", paged.stream().map(this::groupRowToMap).toList());
        result.put("total", total);
        result.put("page", page);
        result.put("size", size);
        return result;
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

        // Get activeSharePct and campus from summary (snapshot-based)
        Map<String, Object> summaryData = summary(groupName, startTime, endTime, "all");
        double activeSharePct = ((Number) summaryData.getOrDefault("activeSharePct", 0)).doubleValue();
        String campus = String.valueOf(summaryData.getOrDefault("campus", "未知校区"));

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

    /** 单个课题组 KPI 汇总 — perCapitaWeeklyFreq/activeSharePct 固定用本月窗口 */
    public Map<String, Object> summary(String groupName, String startTime, String endTime, String campus) {
        if (groupName == null || groupName.isBlank()) {
            Map<String, Object> empty = new HashMap<>();
            empty.put("memberCount", 0);
            empty.put("totalEntries", 0);
            empty.put("perCapitaWeeklyFreq", 0);
            empty.put("activeSharePct", 0);
            empty.put("campus", "-");
            empty.put("timeLabel", deriveTimeLabel(startTime, endTime));
            empty.put("rateLabel", "本月");
            return empty;
        }

        LocalDate rangeStart = LocalDate.parse(startTime.substring(0, 10));
        LocalDate rangeEnd = LocalDate.parse(endTime.substring(0, 10));

        // Month window (fixed: 1st→yesterday) for perCapitaWeeklyFreq and activeSharePct
        LocalDate today = LocalDate.now();
        LocalDate monthStart = today.withDayOfMonth(1);
        LocalDate monthEnd = today.minusDays(1);
        long monthDays = Math.max(1, ChronoUnit.DAYS.between(monthStart, monthEnd) + 1);
        double monthWeeks = Math.max(1.0, Math.ceil(monthDays / 7.0));

        // Get range data for memberCount + totalEntries
        List<Map<String, Object>> rangeRows = snapshotMapper.aggregateByDateRange(rangeStart, rangeEnd, groupName, campus);
        int memberCount = 0, totalEntries = 0;
        String groupCampus = "unknown";
        for (Map<String, Object> r : rangeRows) {
            if (groupName.equalsIgnoreCase(String.valueOf(r.get("groupName")))) {
                memberCount = ((Number) r.getOrDefault("memberCount", 0)).intValue();
                totalEntries = ((Number) r.getOrDefault("totalEntries", 0)).intValue();
                groupCampus = String.valueOf(r.getOrDefault("campus", "unknown"));
            }
        }

        // Get month data for perCapitaWeeklyFreq + activeSharePct
        List<Map<String, Object>> monthRows = snapshotMapper.aggregateByDateRange(monthStart, monthEnd, null, campus);
        Map<String, Double> campusMonthSums = new HashMap<>();
        double targetPF = 0;
        for (Map<String, Object> r : monthRows) {
            String nm = String.valueOf(r.get("groupName"));
            String cm = String.valueOf(r.getOrDefault("campus", "unknown"));
            int mc = ((Number) r.getOrDefault("memberCount", 0)).intValue();
            int te = ((Number) r.getOrDefault("totalEntries", 0)).intValue();
            double pf = mc > 0 ? (double) te / mc / monthWeeks : 0;
            campusMonthSums.merge(cm, pf, Double::sum);
            if (groupName.equalsIgnoreCase(nm)) {
                targetPF = pf;
                if (!"unknown".equals(cm)) groupCampus = cm;
            }
        }
        double campusSum = campusMonthSums.getOrDefault(groupCampus, 1.0);
        double activeSharePct = campusSum > 0 ? Math.round(targetPF / campusSum * 1000.0) / 10.0 : 0;
        double perCapitaWeeklyFreq = Math.round(targetPF * 10.0) / 10.0;

        // rateLabel for KPI cards: 人均频次/近期活跃度占比 always computed from month window
        String rateLabel = "本月";
        if (rangeStart.getDayOfMonth() == 1) {
            if (rangeStart.getMonth() == today.getMonth() && rangeStart.getYear() == today.getYear()) {
                rateLabel = "本月";
            } else {
                rateLabel = rangeStart.getMonthValue() + "月";
            }
        }

        Map<String, Object> m = new HashMap<>();
        m.put("memberCount", memberCount);
        m.put("totalEntries", totalEntries);
        m.put("perCapitaWeeklyFreq", perCapitaWeeklyFreq);
        m.put("activeSharePct", activeSharePct);
        m.put("campus", groupCampus);
        m.put("timeLabel", deriveTimeLabel(startTime, endTime));
        m.put("rateLabel", rateLabel);
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
        if (start == null || start.length() < 10 || end == null || end.length() < 10) {
            return "";
        }
        LocalDate s = LocalDate.parse(start.substring(0, 10));
        LocalDate e = LocalDate.parse(end.substring(0, 10));
        LocalDate today = LocalDate.now();
        LocalDate yesterday = today.minusDays(1);

        if (s.equals(yesterday) && e.equals(yesterday)) return "昨日";

        // 本周: Monday to yesterday
        LocalDate monday = today.with(java.time.DayOfWeek.MONDAY);
        if (s.equals(monday) && e.equals(yesterday)) return "本周";

        // 本月: 1st to yesterday
        LocalDate firstOfMonth = today.withDayOfMonth(1);
        if (s.equals(firstOfMonth) && e.equals(yesterday)) return "本月";

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

    /** 学生端：获取单个学生在课题组内的活跃度数据 */
    public Map<String, Object> getStudentOwnActivity(String userId, String groupName,
                                                      String startTime, String endTime) {
        Map<String, Object> result = new HashMap<>();

        // 课题组汇总（复用现有 summary）
        Map<String, Object> summary = summary(groupName, startTime, endTime, "all");
        result.put("groupName", groupName);
        result.put("groupSummary", summary);

        // 个人活跃度：拉取该用户个人的进出流水并计算指标
        if (userId == null || userId.isBlank() || groupName == null || groupName.isBlank()) {
            result.put("myActivity", emptyMyActivity());
            return result;
        }

        List<String> singleUser = List.of(userId);
        List<Map<String, Object>> rawLogs = dashboardMapper.listAccessLogsByUserIds(
                singleUser, startTime, endTime);

        MemberActivityRow row = computeMemberRow(userId, rawLogs, startTime, endTime);

        Map<String, Object> my = new LinkedHashMap<>();
        if (row != null) {
            my.put("totalEntries", row.getEntryCount());
            my.put("weeklyAvgFreq", row.getWeeklyAvgFreq());
            my.put("totalDurationMinutes", row.getTotalDurationMinutes());
            my.put("lastActiveDate", row.getLastActiveDate() != null ? row.getLastActiveDate() : "-");
        } else {
            my.put("totalEntries", 0);
            my.put("weeklyAvgFreq", 0);
            my.put("totalDurationMinutes", 0);
            my.put("lastActiveDate", "-");
        }
        result.put("myActivity", my);
        return result;
    }

    private Map<String, Object> emptyMyActivity() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("totalEntries", 0);
        m.put("weeklyAvgFreq", 0);
        m.put("totalDurationMinutes", 0);
        m.put("lastActiveDate", "-");
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
