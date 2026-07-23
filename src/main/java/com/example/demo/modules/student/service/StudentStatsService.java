package com.example.demo.modules.student.service;

import com.example.demo.modules.aro.mapper.AroDatabaseMapper;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.student.dto.StudentStatsResponse;
import com.example.demo.modules.twin.dashboard.entity.TwinStudentViolation;
import com.example.demo.modules.twin.dashboard.mapper.TwinStudentViolationMapper;
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
public class StudentStatsService {

    private static final Logger log = LoggerFactory.getLogger(StudentStatsService.class);

    private final AroDatabaseMapper aroDatabaseMapper;
    private final TwinStudentViolationMapper violationMapper;

    public StudentStatsService(AroDatabaseMapper aroDatabaseMapper,
                                TwinStudentViolationMapper violationMapper) {
        this.aroDatabaseMapper = aroDatabaseMapper;
        this.violationMapper = violationMapper;
    }

    public StudentStatsResponse buildStats(User user, String period) {
        StudentStatsResponse resp = new StudentStatsResponse();

        // Resolve date range
        int days = switch (period) {
            case "7d" -> 7;
            case "30d" -> 30;
            case "90d" -> 90;
            default -> 30;
        };

        LocalDate endDate = LocalDate.now();
        LocalDate startDate = endDate.minusDays(days - 1);

        // Period info
        StudentStatsResponse.PeriodInfo periodInfo = new StudentStatsResponse.PeriodInfo();
        periodInfo.setStart(startDate);
        periodInfo.setEnd(endDate);
        periodInfo.setDays((int) ChronoUnit.DAYS.between(startDate, endDate) + 1);
        resp.setPeriod(periodInfo);

        // Query records in date range
        String startStr = startDate.atStartOfDay().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        String endStr = endDate.atTime(23, 59, 59).format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));

        List<Map<String, Object>> records;
        try {
            records = aroDatabaseMapper.selectAccessLogsByUserAndDateRange(user.getId(), startStr, endStr);
        } catch (Exception e) {
            log.warn("Failed to query access logs for stats, user={}", user.getId(), e);
            records = Collections.emptyList();
        }

        // Summary
        StudentStatsResponse.SummaryInfo summary = new StudentStatsResponse.SummaryInfo();
        summary.setTotalAccess(records != null ? records.size() : 0);

        Set<String> distinctDates = new LinkedHashSet<>();
        Set<String> distinctRooms = new LinkedHashSet<>();
        for (Map<String, Object> r : records) {
            String eventTime = String.valueOf(r.getOrDefault("event_time", ""));
            if (!eventTime.isEmpty()) {
                distinctDates.add(eventTime.substring(0, 10)); // yyyy-MM-dd
            }
            String roomName = String.valueOf(r.getOrDefault("room_name", ""));
            if (!roomName.isEmpty() && !"null".equals(roomName)) {
                distinctRooms.add(roomName);
            }
        }
        summary.setAttendanceDays(distinctDates.size());
        summary.setRoomCount(distinctRooms.size());
        summary.setDailyAvg(distinctDates.size() > 0
                ? Math.round(((double) summary.getTotalAccess() / distinctDates.size()) * 10.0) / 10.0
                : 0.0);

        // Violation count in period
        int violationCount = 0;
        try {
            List<TwinStudentViolation> allViolations = violationMapper.selectRecent(user.getId(), 10000);
            if (allViolations != null) {
                for (TwinStudentViolation v : allViolations) {
                    if (v.getCreatedAt() == null) continue;
                    String t = v.getCreatedAt().toString();
                    if (t.compareTo(startStr) >= 0 && t.compareTo(endStr) <= 0) {
                        violationCount++;
                    }
                }
            }
        } catch (Exception e) {
            log.warn("Failed to query violations for stats, user={}", user.getId(), e);
        }
        summary.setViolationCount(violationCount);
        resp.setSummary(summary);

        // Daily trend — group by date
        Map<String, Integer> dailyMap = new LinkedHashMap<>();
        for (LocalDate d = startDate; !d.isAfter(endDate); d = d.plusDays(1)) {
            dailyMap.put(d.toString(), 0);
        }
        for (Map<String, Object> r : records) {
            String eventTime = String.valueOf(r.getOrDefault("event_time", ""));
            if (!eventTime.isEmpty()) {
                String dateKey = eventTime.substring(0, 10);
                dailyMap.merge(dateKey, 1, Integer::sum);
            }
        }
        List<StudentStatsResponse.DailyTrend> dailyTrend = new ArrayList<>();
        for (Map.Entry<String, Integer> e : dailyMap.entrySet()) {
            StudentStatsResponse.DailyTrend dt = new StudentStatsResponse.DailyTrend();
            dt.setDate(LocalDate.parse(e.getKey()));
            dt.setCount(e.getValue());
            dailyTrend.add(dt);
        }
        resp.setDailyTrend(dailyTrend);

        // Hourly distribution
        int[] hourBuckets = new int[24];
        for (Map<String, Object> r : records) {
            String eventTime = String.valueOf(r.getOrDefault("event_time", ""));
            if (eventTime.length() >= 13) {
                try {
                    int hour = Integer.parseInt(eventTime.substring(11, 13));
                    if (hour >= 0 && hour < 24) {
                        hourBuckets[hour]++;
                    }
                } catch (NumberFormatException ignored) {
                }
            }
        }
        List<StudentStatsResponse.HourlyDist> hourlyList = new ArrayList<>();
        for (int h = 0; h < 24; h++) {
            StudentStatsResponse.HourlyDist hd = new StudentStatsResponse.HourlyDist();
            hd.setBucket(String.format("%02d:00-%02d:00", h, (h + 1) % 24));
            hd.setCount(hourBuckets[h]);
            hourlyList.add(hd);
        }
        resp.setHourlyDistribution(hourlyList);

        // Room distribution
        Map<String, Integer> roomCounts = new LinkedHashMap<>();
        for (Map<String, Object> r : records) {
            String roomName = String.valueOf(r.getOrDefault("room_name", ""));
            if (!roomName.isEmpty() && !"null".equals(roomName)) {
                roomCounts.merge(roomName, 1, Integer::sum);
            }
        }
        int total = records != null ? records.size() : 0;
        List<StudentStatsResponse.RoomDist> roomDist = roomCounts.entrySet().stream()
                .sorted(Map.Entry.<String, Integer>comparingByValue().reversed())
                .limit(10)
                .map(e -> {
                    StudentStatsResponse.RoomDist rd = new StudentStatsResponse.RoomDist();
                    rd.setRoomName(e.getKey());
                    rd.setCount(e.getValue());
                    rd.setPercentage(total > 0 ? (int) Math.round(e.getValue() * 100.0 / total) : 0);
                    return rd;
                })
                .collect(Collectors.toList());
        resp.setRoomDistribution(roomDist);

        // Avg stay duration — empty for now, requires enter/exit pairing
        resp.setAvgStayDuration(Collections.emptyList());

        return resp;
    }
}
