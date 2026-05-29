package com.example.demo.modules.student.service;

import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.student.dto.StudentStatsResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.Collections;

@Service
public class StudentStatsService {

    private static final Logger log = LoggerFactory.getLogger(StudentStatsService.class);

    public StudentStatsResponse buildStats(User user, String period) {
        StudentStatsResponse resp = new StudentStatsResponse();

        // period info
        StudentStatsResponse.PeriodInfo periodInfo = new StudentStatsResponse.PeriodInfo();
        periodInfo.setDays(0);
        resp.setPeriod(periodInfo);

        // summary — all zeros placeholder
        StudentStatsResponse.SummaryInfo summary = new StudentStatsResponse.SummaryInfo();
        summary.setTotalAccess(0);
        summary.setDailyAvg(0.0);
        summary.setAttendanceDays(0);
        summary.setRoomCount(0);
        summary.setViolationCount(0);
        resp.setSummary(summary);

        // empty lists
        resp.setDailyTrend(Collections.emptyList());
        resp.setHourlyDistribution(Collections.emptyList());
        resp.setRoomDistribution(Collections.emptyList());
        resp.setAvgStayDuration(Collections.emptyList());

        return resp;
    }
}
