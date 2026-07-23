package com.example.demo.modules.student.service;

import com.example.demo.modules.analytics.service.StudentActivityService;
import com.example.demo.modules.aro.dto.AroPersonnel;
import com.example.demo.modules.aro.mapper.AroDatabaseMapper;
import com.example.demo.modules.aro.mapper.AroPersonnelMapper;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.notification.dto.NotificationView;
import com.example.demo.modules.notification.mapper.StudentNotificationMapper;
import com.example.demo.modules.notification.service.NotificationService;
import com.example.demo.modules.student.dto.StudentActivityResponse;
import com.example.demo.modules.student.dto.StudentDashboardResponse;
import com.example.demo.modules.student.dto.StudentProfilePersonnelInfo;
import com.example.demo.modules.student.dto.StudentProfileResponse;
import com.example.demo.modules.student.mapper.StudentRoomPinMapper;
import com.example.demo.modules.student.service.StudentRoomService;
import com.example.demo.modules.twin.common.dto.RoomDashboardRenderDTO;
import com.example.demo.modules.twin.common.util.RoomFloorPrefixUtil;
import com.example.demo.modules.twin.common.mapper.TwinDashboardMapper;
import com.example.demo.modules.twin.dashboard.entity.TwinStudentViolation;
import com.example.demo.modules.twin.dashboard.mapper.TwinStudentViolationMapper;
import com.example.demo.modules.twin.dashboard.service.TwinDashboardAggregationService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class StudentDashboardService {

    private static final Logger log = LoggerFactory.getLogger(StudentDashboardService.class);
    private static final int DEFAULT_CAPACITY = 20;

    private final StudentProfileService studentProfileService;
    private final AroDatabaseMapper aroDatabaseMapper;
    private final TwinStudentViolationMapper twinStudentViolationMapper;
    private final NotificationService notificationService;
    private final StudentNotificationMapper studentNotificationMapper;
    private final AroPersonnelMapper aroPersonnelMapper;
    private final StudentRoomPinMapper roomPinMapper;
    private final TwinDashboardAggregationService aggregationService;
    private final TwinDashboardMapper twinDashboardMapper;
    private final StudentActivityService studentActivityService;
    private final StudentRoomService studentRoomService;

    public StudentDashboardService(StudentProfileService studentProfileService,
                                   AroDatabaseMapper aroDatabaseMapper,
                                   TwinStudentViolationMapper twinStudentViolationMapper,
                                   NotificationService notificationService,
                                   StudentNotificationMapper studentNotificationMapper,
                                   AroPersonnelMapper aroPersonnelMapper,
                                   StudentRoomPinMapper roomPinMapper,
                                   TwinDashboardAggregationService aggregationService,
                                   TwinDashboardMapper twinDashboardMapper,
                                   StudentActivityService studentActivityService,
                                   StudentRoomService studentRoomService) {
        this.studentProfileService = studentProfileService;
        this.aroDatabaseMapper = aroDatabaseMapper;
        this.twinStudentViolationMapper = twinStudentViolationMapper;
        this.notificationService = notificationService;
        this.studentNotificationMapper = studentNotificationMapper;
        this.aroPersonnelMapper = aroPersonnelMapper;
        this.roomPinMapper = roomPinMapper;
        this.aggregationService = aggregationService;
        this.twinDashboardMapper = twinDashboardMapper;
        this.studentActivityService = studentActivityService;
        this.studentRoomService = studentRoomService;
    }

    public StudentDashboardResponse buildDashboard(User user) {
        StudentDashboardResponse resp = new StudentDashboardResponse();

        // 1. ProfileSummary — full profile from personnel database
        StudentProfileResponse profile = studentProfileService.buildProfile(user);
        StudentDashboardResponse.ProfileSummary profileSummary = new StudentDashboardResponse.ProfileSummary();
        if (profile.getPersonnel() != null) {
            StudentProfilePersonnelInfo personnel = profile.getPersonnel();
            profileSummary.setName(personnel.getName());
            profileSummary.setDepartmentName(personnel.getDepartmentName());
            profileSummary.setProjectGroupName(personnel.getProjectGroupName());
            profileSummary.setRoleLabel(personnel.getUserTypeNames());
            profileSummary.setHead(personnel.getHead());
            profileSummary.setGender(personnel.getGender());
            profileSummary.setMobilePhone(personnel.getMobilePhone());
            profileSummary.setEmail(personnel.getEmail());
            profileSummary.setTotalExp(personnel.getTotalExp());
            profileSummary.setAllowedRoomsDisplayZh(personnel.getAllowedRoomsDisplayZh());
        }
        // authStatus: check real official room permission
        AroPersonnel aroPersonnel = null;
        try {
            aroPersonnel = aroPersonnelMapper.findByUserId(user.getId());
        } catch (Exception e) {
            log.warn("Failed to query AroPersonnel for user {}", user.getId(), e);
        }
        boolean hasPerm = aroPersonnel != null
                && aroPersonnel.getHasOfficialRoomPermission() != null
                && aroPersonnel.getHasOfficialRoomPermission() == 1;
        profileSummary.setAuthStatus(hasPerm ? "已授权" : "待授权");
        resp.setProfile(profileSummary);

        // 2. StatsSummary — real data from DB
        String todayStart = LocalDate.now().toString();
        List<Map<String, Object>> todayRecords = null;

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

        // unreadNoticeCount — from student independent notification system
        try {
            stats.setUnreadNoticeCount(studentNotificationMapper.countUnread(user.getId()));
        } catch (Exception e) {
            log.warn("Failed to query unreadNoticeCount for user {}", user.getId(), e);
            stats.setUnreadNoticeCount(0);
        }

        // accessibleRoomCount — 与"我的房间"tab 同源：ARO API 匹配 capacityBindRoomId
        try {
            stats.setAccessibleRoomCount(studentRoomService.getMyRoomCount(user));
        } catch (Exception e) {
            log.warn("Failed to query accessibleRoomCount for user {}", user.getId(), e);
            stats.setAccessibleRoomCount(0);
        }
        resp.setStats(stats);

        // 3. pinnedRooms — real data from student_room_pin + dashboard aggregation
        resp.setPinnedRooms(buildPinnedRooms(user));

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

        // 5. recentNotices — last 3 from student notification system
        List<StudentDashboardResponse.RecentNotice> recentNotices = new ArrayList<>();
        try {
            var notices = studentNotificationMapper.listForUser(user.getId(), null, null, 0, 3);
            for (var sn : notices) {
                if (recentNotices.size() >= 3) break;
                StudentDashboardResponse.RecentNotice notice = new StudentDashboardResponse.RecentNotice();
                notice.setTitle(sn.getTitle() != null ? sn.getTitle() : "");
                notice.setType(sn.getType());
                notice.setPublishDate(sn.getCreateTime() != null ? sn.getCreateTime().toString() : "");
                recentNotices.add(notice);
            }
        } catch (Exception e) {
            log.warn("Failed to query recentNotices for user {}", user.getId(), e);
        }
        resp.setRecentNotices(recentNotices);

        return resp;
    }

    /**
     * Build pinned rooms from student_room_pin + dashboard aggregation data.
     */
    private List<StudentDashboardResponse.PinnedRoom> buildPinnedRooms(User user) {
        try {
            List<String> pinnedIds = roomPinMapper.selectPinnedRoomIds(user.getId());
            // Auto-pin: when no pinned rooms, auto-pin all accessible rooms
            if (pinnedIds.isEmpty()) {
                autoPinAccessibleRooms(user);
                pinnedIds = roomPinMapper.selectPinnedRoomIds(user.getId());
                if (pinnedIds.isEmpty()) {
                    return Collections.emptyList();
                }
            }
            Set<String> pinnedIdSet = new HashSet<>(pinnedIds);
            List<RoomDashboardRenderDTO> allRooms = aggregationService.getWechatMiniProgramData(null);
            List<StudentDashboardResponse.PinnedRoom> result = new ArrayList<>();
            for (RoomDashboardRenderDTO room : allRooms) {
                String roomId = String.valueOf(room.getRoomId());
                if (!pinnedIdSet.contains(roomId)) continue;

                StudentDashboardResponse.PinnedRoom pr = new StudentDashboardResponse.PinnedRoom();
                pr.setRoomId(roomId);
                pr.setRoomName(room.getRoomName() != null ? room.getRoomName() : "");
                pr.setFloor(RoomFloorPrefixUtil.deriveFloorLabel(room.getRoomName()));
                pr.setZone(room.getCampus() != null ? room.getCampus() : "");

                int occupants = room.getOccupants() != null ? room.getOccupants().size() : 0;
                int capacity = room.getTotalCapacity() > 0 ? room.getTotalCapacity() : DEFAULT_CAPACITY;
                double rate = capacity > 0 ? (occupants * 100.0 / capacity) : 0;

                pr.setOccupantCount(occupants);
                pr.setCapacity(capacity);
                pr.setOccupancyRate(Math.round(rate));

                if (rate > 90) pr.setStatus("full");
                else if (rate >= 50) pr.setStatus("busy");
                else pr.setStatus("idle");

                pr.setPinned(true);
                result.add(pr);
            }
            return result;
        } catch (Exception e) {
            log.warn("Failed to build pinnedRooms for user {}", user.getId(), e);
            return Collections.emptyList();
        }
    }

    /**
     * Auto-pin all user-accessible rooms when no pinned rooms exist (first visit).
     */
    private void autoPinAccessibleRooms(User user) {
        try {
            AroPersonnel aro = aroPersonnelMapper.findByUserId(user.getId());
            if (aro == null || aro.getAllowedRoomsDisplayZh() == null || aro.getAllowedRoomsDisplayZh().isBlank()) {
                return;
            }
            String[] roomNames = aro.getAllowedRoomsDisplayZh().split("[,，]");
            if (roomNames.length == 0) return;

            List<RoomDashboardRenderDTO> allRooms = aggregationService.getWechatMiniProgramData(null);
            int pinned = 0;
            for (RoomDashboardRenderDTO room : allRooms) {
                if (room.getRoomName() == null) continue;
                for (String allowedName : roomNames) {
                    if (room.getRoomName().contains(allowedName.trim()) || allowedName.trim().contains(room.getRoomName())) {
                        try {
                            roomPinMapper.insert(user.getId(), String.valueOf(room.getRoomId()));
                            pinned++;
                        } catch (Exception ignored) { /* duplicate OK */ }
                        break;
                    }
                }
            }
            log.info("Auto-pinned {} rooms for user {}", pinned, user.getId());
        } catch (Exception e) {
            log.warn("Failed to auto-pin rooms for user {}", user.getId(), e);
        }
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

    /** 学生端：获取所在课题组的活跃度概览 + 个人活跃度数据 */
    public StudentActivityResponse getStudentActivity(User user) {
        StudentActivityResponse resp = new StudentActivityResponse();

        // 获取学生所属课题组
        String groupName = null;
        try {
            AroPersonnel personnel = aroPersonnelMapper.findByUserId(user.getId());
            if (personnel != null) {
                groupName = personnel.getResolvedProjectGroupNames();
            }
        } catch (Exception e) {
            log.warn("Failed to resolve project group for user {}", user.getId(), e);
        }

        if (groupName == null || groupName.isBlank()) {
            resp.setGroupName("未分配课题组");
            StudentActivityResponse.GroupSummary gs = new StudentActivityResponse.GroupSummary();
            gs.setMemberCount(0);
            gs.setTotalEntries(0);
            gs.setPerCapitaWeeklyFreq(0);
            gs.setActiveSharePct(0);
            resp.setGroupSummary(gs);
            StudentActivityResponse.MyActivity ma = new StudentActivityResponse.MyActivity();
            ma.setTotalEntries(0);
            ma.setWeeklyAvgFreq(0);
            ma.setTotalDurationMinutes(0);
            ma.setLastActiveDate("-");
            resp.setMyActivity(ma);
            return resp;
        }

        // 最近 30 天窗口
        LocalDate today = LocalDate.now();
        LocalDate start = today.minusDays(29);
        String startTime = start.toString() + " 00:00:00";
        String endTime = today.plusDays(1).toString() + " 00:00:00";

        Map<String, Object> data = studentActivityService.getStudentOwnActivity(
                user.getId(), groupName, startTime, endTime);

        resp.setGroupName(groupName);

        @SuppressWarnings("unchecked")
        Map<String, Object> summaryMap = (Map<String, Object>) data.get("groupSummary");
        StudentActivityResponse.GroupSummary gs = new StudentActivityResponse.GroupSummary();
        gs.setMemberCount(((Number) summaryMap.getOrDefault("memberCount", 0)).intValue());
        gs.setTotalEntries(((Number) summaryMap.getOrDefault("totalEntries", 0)).intValue());
        gs.setPerCapitaWeeklyFreq(((Number) summaryMap.getOrDefault("perCapitaWeeklyFreq", 0)).doubleValue());
        gs.setActiveSharePct(((Number) summaryMap.getOrDefault("activeSharePct", 0)).doubleValue());
        resp.setGroupSummary(gs);

        @SuppressWarnings("unchecked")
        Map<String, Object> myMap = (Map<String, Object>) data.get("myActivity");
        StudentActivityResponse.MyActivity ma = new StudentActivityResponse.MyActivity();
        ma.setTotalEntries(((Number) myMap.getOrDefault("totalEntries", 0)).intValue());
        ma.setWeeklyAvgFreq(((Number) myMap.getOrDefault("weeklyAvgFreq", 0)).doubleValue());
        ma.setTotalDurationMinutes(((Number) myMap.getOrDefault("totalDurationMinutes", 0)).longValue());
        ma.setLastActiveDate(String.valueOf(myMap.getOrDefault("lastActiveDate", "-")));
        resp.setMyActivity(ma);

        return resp;
    }
}
