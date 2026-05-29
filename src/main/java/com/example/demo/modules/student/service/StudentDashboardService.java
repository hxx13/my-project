package com.example.demo.modules.student.service;

import com.example.demo.modules.aro.dto.AroPersonnel;
import com.example.demo.modules.aro.mapper.AroDatabaseMapper;
import com.example.demo.modules.aro.mapper.AroPersonnelMapper;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.notification.dto.NotificationView;
import com.example.demo.modules.notification.service.NotificationService;
import com.example.demo.modules.student.dto.StudentDashboardResponse;
import com.example.demo.modules.student.dto.StudentProfileResponse;
import com.example.demo.modules.twin.dashboard.entity.TwinStudentViolation;
import com.example.demo.modules.twin.dashboard.mapper.TwinStudentViolationMapper;
import com.example.demo.modules.twin.common.mapper.TwinDashboardMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

@Service
public class StudentDashboardService {

    private static final Logger log = LoggerFactory.getLogger(StudentDashboardService.class);

    private final StudentProfileService studentProfileService;
    private final AroDatabaseMapper aroDatabaseMapper;
    private final TwinStudentViolationMapper twinStudentViolationMapper;
    private final NotificationService notificationService;
    private final AroPersonnelMapper aroPersonnelMapper;
    private final TwinDashboardMapper twinDashboardMapper;

    public StudentDashboardService(StudentProfileService studentProfileService,
                                   AroDatabaseMapper aroDatabaseMapper,
                                   TwinStudentViolationMapper twinStudentViolationMapper,
                                   NotificationService notificationService,
                                   AroPersonnelMapper aroPersonnelMapper,
                                   TwinDashboardMapper twinDashboardMapper) {
        this.studentProfileService = studentProfileService;
        this.aroDatabaseMapper = aroDatabaseMapper;
        this.twinStudentViolationMapper = twinStudentViolationMapper;
        this.notificationService = notificationService;
        this.aroPersonnelMapper = aroPersonnelMapper;
        this.twinDashboardMapper = twinDashboardMapper;
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

        // 2. StatsSummary — real data from DB
        String todayStart = LocalDate.now().toString();
        List<Map<String, Object>> todayRecords = null; // preserved for recentRecords

        StudentDashboardResponse.StatsSummary stats = new StudentDashboardResponse.StatsSummary();

        // todayAccessCount
        try {
            todayRecords = aroDatabaseMapper.getTodayRecords(user.getId(), todayStart);
            stats.setTodayAccessCount(todayRecords != null ? todayRecords.size() : 0);
        } catch (Exception e) {
            log.warn("Failed to query todayAccessCount for user {}", user.getId(), e);
            stats.setTodayAccessCount(0);
        }

        // violationCount
        try {
            TwinStudentViolation activeViolation = twinStudentViolationMapper.selectActiveByTargetUserId(user.getId());
            stats.setViolationCount(activeViolation != null ? 1 : 0);
        } catch (Exception e) {
            log.warn("Failed to query violationCount for user {}", user.getId(), e);
            stats.setViolationCount(0);
        }

        // unreadNoticeCount
        try {
            Map<String, Object> unreadResult = notificationService.listForUser(user.getId(), 1, 1, true, null, null, null);
            int unreadTotal = 0;
            if (unreadResult != null && unreadResult.get("total") instanceof Integer) {
                unreadTotal = (Integer) unreadResult.get("total");
            }
            stats.setUnreadNoticeCount(unreadTotal);
        } catch (Exception e) {
            log.warn("Failed to query unreadNoticeCount for user {}", user.getId(), e);
            stats.setUnreadNoticeCount(0);
        }

        // accessibleRoomCount
        try {
            int roomCount = 0;
            AroPersonnel personnel = aroPersonnelMapper.findByUserId(user.getId());
            if (personnel != null && personnel.getAllowedRoomsDisplayZh() != null
                    && !personnel.getAllowedRoomsDisplayZh().isBlank()) {
                roomCount = personnel.getAllowedRoomsDisplayZh().split("[,，]").length;
            }
            stats.setAccessibleRoomCount(roomCount);
        } catch (Exception e) {
            log.warn("Failed to query accessibleRoomCount for user {}", user.getId(), e);
            stats.setAccessibleRoomCount(0);
        }
        resp.setStats(stats);

        // 3. pinnedRooms — empty for now
        resp.setPinnedRooms(Collections.emptyList());

        // 4. recentRecords — last 5 today access records
        List<StudentDashboardResponse.RecentRecord> recentRecords = new ArrayList<>();
        if (todayRecords != null) {
            try {
                for (Map<String, Object> row : todayRecords) {
                    if (recentRecords.size() >= 5) break;
                    StudentDashboardResponse.RecentRecord rec = new StudentDashboardResponse.RecentRecord();
                    Object eventTime = row.get("event_time");
                    Object eventType = row.get("event_type");
                    Object roomName = row.get("room_name");
                    rec.setTime(eventTime != null ? eventTime.toString() : "");
                    rec.setType(eventType != null ? eventType.toString() : "");
                    rec.setRoomName(roomName != null ? roomName.toString() : "");
                    recentRecords.add(rec);
                }
            } catch (Exception e) {
                log.warn("Failed to build recentRecords for user {}", user.getId(), e);
            }
        }
        resp.setRecentRecords(recentRecords);

        // 5. recentNotices — last 3 notifications
        List<StudentDashboardResponse.RecentNotice> recentNotices = new ArrayList<>();
        try {
            Map<String, Object> noticeResult = notificationService.listForUser(user.getId(), 1, 3, false, null, null, null);
            if (noticeResult != null && noticeResult.get("data") instanceof List) {
                List<?> noticeList = (List<?>) noticeResult.get("data");
                for (Object item : noticeList) {
                    if (recentNotices.size() >= 3) break;
                    if (!(item instanceof NotificationView nv)) continue;
                    StudentDashboardResponse.RecentNotice notice = new StudentDashboardResponse.RecentNotice();
                    notice.setTitle(nv.getTitle() != null ? nv.getTitle() : "");
                    notice.setType("PLATFORM");
                    notice.setPublishDate(nv.getCreateTime() != null ? nv.getCreateTime().toString() : "");
                    recentNotices.add(notice);
                }
            }
        } catch (Exception e) {
            log.warn("Failed to query recentNotices for user {}", user.getId(), e);
        }
        resp.setRecentNotices(recentNotices);

        return resp;
    }

    /**
     * 获取当前学生的 AI 行为预测数据（按房间聚合）
     */
    public java.util.List<java.util.Map<String, Object>> getAiPredictions(String userId) {
        if (userId == null || userId.isBlank()) {
            return java.util.Collections.emptyList();
        }
        try {
            return twinDashboardMapper.getDebugPredictionByUserIds(java.util.List.of(userId));
        } catch (Exception e) {
            log.warn("Failed to query AI predictions for user {}", userId, e);
            return java.util.Collections.emptyList();
        }
    }
}
