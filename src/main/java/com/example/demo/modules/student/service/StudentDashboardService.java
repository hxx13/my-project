package com.example.demo.modules.student.service;

import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.student.dto.StudentDashboardResponse;
import com.example.demo.modules.student.dto.StudentProfileResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.Collections;

@Service
public class StudentDashboardService {

    private static final Logger log = LoggerFactory.getLogger(StudentDashboardService.class);

    private final StudentProfileService studentProfileService;

    public StudentDashboardService(StudentProfileService studentProfileService) {
        this.studentProfileService = studentProfileService;
    }

    public StudentDashboardResponse buildDashboard(User user) {
        StudentDashboardResponse resp = new StudentDashboardResponse();

        // 1. ProfileSummary — reuse existing profile service
        StudentProfileResponse profile = studentProfileService.buildProfile(user);
        StudentDashboardResponse.ProfileSummary profileSummary = new StudentDashboardResponse.ProfileSummary();
        if (profile.getPersonnel() != null) {
            StudentProfileResponse.PersonnelInfo personnel = profile.getPersonnel();
            profileSummary.setName(personnel.getName());
            profileSummary.setDepartmentName(personnel.getDepartmentName());
            profileSummary.setProjectGroupName(personnel.getProjectGroupName());
            profileSummary.setRoleLabel(personnel.getUserTypeNames());
        }
        profileSummary.setAuthStatus("已授权");
        resp.setProfile(profileSummary);

        // 2. StatsSummary — placeholder values, to be connected later
        StudentDashboardResponse.StatsSummary stats = new StudentDashboardResponse.StatsSummary();
        stats.setTodayAccessCount(0);
        stats.setViolationCount(0);
        stats.setUnreadNoticeCount(0);
        stats.setAccessibleRoomCount(0);
        resp.setStats(stats);

        // 3. pinnedRooms — empty for now
        resp.setPinnedRooms(Collections.emptyList());

        // 4. recentRecords — empty for now
        resp.setRecentRecords(Collections.emptyList());

        // 5. recentNotices — empty for now
        resp.setRecentNotices(Collections.emptyList());

        return resp;
    }
}
