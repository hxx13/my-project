package com.example.demo.modules.analytics.service;

import com.example.demo.modules.analytics.mapper.StudentActivitySnapshotMapper;
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

@Service
public class StudentActivitySnapshotService {

    private static final Logger log = LoggerFactory.getLogger(StudentActivitySnapshotService.class);
    private static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final int MAX_USER_IDS = 2000;

    private final StudentActivitySnapshotMapper snapshotMapper;
    private final TwinDashboardMapper dashboardMapper;

    public StudentActivitySnapshotService(StudentActivitySnapshotMapper snapshotMapper,
                                           TwinDashboardMapper dashboardMapper) {
        this.snapshotMapper = snapshotMapper;
        this.dashboardMapper = dashboardMapper;
    }

    /** 计算指定日期的快照（当日 00:00:00 ~ 23:59:59） */
    public void computeDate(LocalDate date) {
        String startTime = date + " 00:00:00";
        String endTime = date + " 23:59:59";

        // 1. 获取所有课题组名
        List<String> allGroups = PersonnelProjectGroupUtil.distinctGroupsMatchingKeyword(
                dashboardMapper.searchPersonnelProjectGroupFields("", 500), "", 500);

        if (allGroups.isEmpty()) {
            log.info("[snapshot] 无课题组数据，跳过 {}", date);
            return;
        }

        // 2. 删除已有快照（重算场景）
        snapshotMapper.deleteByDate(date);

        int done = 0;
        for (String groupName : allGroups) {
            try {
                List<String> userIds = dashboardMapper.listUserIdsByProjectGroup(groupName.trim(), MAX_USER_IDS);
                if (userIds.isEmpty()) continue;

                List<Map<String, Object>> rawLogs = dashboardMapper.listAccessLogsByUserIds(userIds, startTime, endTime);

                int totalEntries = 0;
                Map<String, String> userCampus = new LinkedHashMap<>();
                Set<String> activeUsers = new HashSet<>();

                for (String uid : userIds) {
                    List<Map<String, Object>> userLogs = new ArrayList<>();
                    for (Map<String, Object> l : rawLogs) {
                        if (uid.equals(String.valueOf(l.getOrDefault("user_id", "")))) {
                            userLogs.add(l);
                        }
                    }
                    if (userLogs.isEmpty()) continue;

                    int pairs = countPairedEntries(userLogs);
                    if (pairs > 0) {
                        totalEntries += pairs;
                        activeUsers.add(uid);
                    }

                    // 校区推断
                    if (!userCampus.containsKey(uid)) {
                        String campus = resolveCampus(userLogs);
                        userCampus.put(uid, campus);
                    }
                }

                if (totalEntries == 0) continue;

                String majorityCampus = userCampus.values().stream()
                        .filter(v -> !"未知校区".equals(v))
                        .reduce((a, b) -> b).orElse("未知校区");
                if (majorityCampus.equals("未知校区") && !userCampus.isEmpty()) {
                    majorityCampus = userCampus.values().iterator().next();
                }

                snapshotMapper.upsertSnapshot(date, groupName, majorityCampus, activeUsers.size(), totalEntries);
                done++;
            } catch (Exception e) {
                log.warn("[snapshot] 课题组 {} 快照失败: {}", groupName, e.getMessage());
            }
        }
        log.info("[snapshot] 日期 {} 快照完成，写入 {} 个课题组", date, done);
    }

    /** 全量重算指定日期范围 */
    public void recomputeRange(LocalDate from, LocalDate to) {
        LocalDate d = from;
        while (!d.isAfter(to)) {
            computeDate(d);
            d = d.plusDays(1);
        }
        log.info("[snapshot] 全量重算完成: {} ~ {}", from, to);
    }

    private int countPairedEntries(List<Map<String, Object>> userLogs) {
        List<LocalDateTime> entries = new ArrayList<>();
        List<LocalDateTime> exits = new ArrayList<>();
        for (Map<String, Object> log : userLogs) {
            int at = parseAccessType(log);
            String ts = String.valueOf(log.getOrDefault("create_time", ""));
            LocalDateTime dt = parseTime(ts);
            if (dt == null) continue;
            if (at == 1) entries.add(dt);
            else if (at == 2) exits.add(dt);
        }
        int pairCount = 0;
        int exitIdx = 0;
        for (LocalDateTime entry : entries) {
            while (exitIdx < exits.size() && !exits.get(exitIdx).isAfter(entry)) exitIdx++;
            if (exitIdx < exits.size()) {
                if (ChronoUnit.MINUTES.between(entry, exits.get(exitIdx)) <= 24 * 60) {
                    pairCount++; exitIdx++;
                }
            }
        }
        return pairCount;
    }

    private String resolveCampus(List<Map<String, Object>> userLogs) {
        long pudong = 0, puxi = 0;
        for (Map<String, Object> l : userLogs) {
            String a = String.valueOf(l.getOrDefault("area_name", ""));
            if (a.contains("浦东")) pudong++;
            else if (a.contains("浦西")) puxi++;
        }
        if (pudong > puxi) return "浦东";
        if (puxi > pudong) return "浦西";
        return "未知校区";
    }

    private int parseAccessType(Map<String, Object> log) {
        Object at = log.get("accessType");
        if (at instanceof Number n) return n.intValue();
        if (at != null) try { return Integer.parseInt(at.toString()); } catch (NumberFormatException e) { return 0; }
        return 0;
    }

    private LocalDateTime parseTime(String ts) {
        if (ts == null || ts.isEmpty()) return null;
        try {
            ts = ts.replace("T", " ");
            if (ts.length() >= 19) ts = ts.substring(0, 19);
            return LocalDateTime.parse(ts, FMT);
        } catch (Exception e) { return null; }
    }
}
