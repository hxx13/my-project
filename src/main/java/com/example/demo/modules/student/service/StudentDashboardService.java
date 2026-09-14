package com.example.demo.modules.student.service;

import com.example.demo.modules.analytics.service.StudentActivityService;
import com.example.demo.modules.aro.dto.AroPersonnel;
import com.example.demo.modules.aro.mapper.AroDatabaseMapper;
import com.example.demo.modules.aro.mapper.AroPersonnelMapper;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.entity.UserAroBinding;
import com.example.demo.modules.auth.mapper.UserAroBindingMapper;
import com.example.demo.modules.cageshelf.mapper.CageQuotaMapper;
import com.example.demo.modules.identity.dto.IdentityTagVO;
import com.example.demo.modules.identity.service.PersonIdentityService;
import com.example.demo.modules.notification.dto.NotificationView;
import com.example.demo.modules.notification.mapper.StudentNotificationMapper;
import com.example.demo.modules.notification.service.NotificationService;
import com.example.demo.modules.personnel.entity.Personnel;
import com.example.demo.modules.personnel.service.PersonnelService;
import com.example.demo.modules.student.dto.StudentActivityResponse;
import com.example.demo.modules.student.dto.StudentDashboardResponse;
import com.example.demo.modules.student.dto.StudentProfilePersonnelInfo;
import com.example.demo.modules.student.dto.StudentProfileResponse;
import com.example.demo.modules.student.mapper.StudentRoomPinMapper;
import com.example.demo.modules.student.service.StudentRoomService;
import com.example.demo.modules.twin.common.dto.RoomDashboardRenderDTO;
import com.example.demo.modules.twin.common.util.PersonnelProjectGroupUtil;
import com.example.demo.modules.twin.common.util.RoomFloorPrefixUtil;
import com.example.demo.modules.twin.common.mapper.TwinDashboardMapper;
import com.example.demo.modules.twin.dashboard.entity.TwinStudentViolation;
import com.example.demo.modules.twin.dashboard.mapper.TwinStudentViolationMapper;
import com.example.demo.modules.twin.dashboard.service.TwinDashboardAggregationService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

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
    private final StudentCageShelfService studentCageShelfService;
    private final PersonnelService personnelService;
    private final UserAroBindingMapper userAroBindingMapper;
    private final PersonIdentityService personIdentityService;
    private final CageQuotaMapper quotaMapper;
    private final JdbcTemplate jdbcTemplate;

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
                                   StudentRoomService studentRoomService,
                                   StudentCageShelfService studentCageShelfService,
                                   PersonnelService personnelService,
                                   UserAroBindingMapper userAroBindingMapper,
                                   PersonIdentityService personIdentityService,
                                   CageQuotaMapper quotaMapper,
                                   JdbcTemplate jdbcTemplate) {
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
        this.studentCageShelfService = studentCageShelfService;
        this.personnelService = personnelService;
        this.userAroBindingMapper = userAroBindingMapper;
        this.personIdentityService = personIdentityService;
        this.quotaMapper = quotaMapper;
        this.jdbcTemplate = jdbcTemplate;
    }

    public StudentDashboardResponse buildDashboard(User user) {
        StudentDashboardResponse resp = new StudentDashboardResponse();

        // 1. ProfileSummary — full profile from personnel database
        resp.setProfile(buildProfileSummary(user));

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
     * 轻量版：档案摘要 + 授权状态 + 首页指标汇总，供 Web 学生首页（/api/student/dashboard）使用。
     * Web 首页其余数据（出入统计/活跃度/特殊状态）各自有独立接口加载，
     * 避免整页阻塞在外部 ARO 调用与房间聚合重查询上。
     */
    public StudentDashboardResponse buildDashboardProfile(User user) {
        StudentDashboardResponse resp = new StudentDashboardResponse();
        resp.setProfile(buildProfileSummary(user));
        resp.setHomeSummary(buildHomeSummary(user));
        return resp;
    }

    /**
     * 构建档案摘要 + 授权状态（buildDashboard 与 buildDashboardProfile 共用）。
     *
     * <p>数据源为**本地统一人员表 personnel**（用户 2026-09-14 口径：首页人员卡不再读 ARO 侧字段）。
     * 该表缺失此行（历史账号未回填）时回退 aro_personnel 旧口径，避免整张卡空掉。
     */
    private StudentDashboardResponse.ProfileSummary buildProfileSummary(User user) {
        StudentDashboardResponse.ProfileSummary profileSummary = new StudentDashboardResponse.ProfileSummary();

        Personnel me = resolveLocalPersonnel(user);
        // 身份标识统一取自本地身份标识系统（person_identity_tag），不再用 ARO 侧 user_type_names
        profileSummary.setIdentityLabels(identityLabelsOf(user, me));
        if (me != null) {
            profileSummary.setName(me.getName());
            profileSummary.setJobNumber(me.getJobNumber());
            profileSummary.setDepartmentName(me.getDepartmentName());
            profileSummary.setProjectGroupName(me.getProjectGroupName());
            profileSummary.setHead(me.getHead());
            profileSummary.setGender(me.getGender());
            profileSummary.setMobilePhone(me.getMobilePhone());
            profileSummary.setEmail(me.getEmail());
            profileSummary.setIsSchool(me.getIsSchool());
            profileSummary.setAllowedRoomsDisplayZh(me.getAllowedRoomsDisplayZh());
            Integer perm = me.getHasOfficialRoomPermission();
            profileSummary.setAuthStatus(perm != null && perm == 1 ? "已授权" : "待授权");
            return profileSummary;
        }

        // 回退：aro_personnel（与移动端 /student/profile 同源）
        StudentProfileResponse profile = studentProfileService.buildProfile(user);
        if (profile.getPersonnel() != null) {
            StudentProfilePersonnelInfo personnel = profile.getPersonnel();
            profileSummary.setName(personnel.getName());
            profileSummary.setDepartmentName(personnel.getDepartmentName());
            profileSummary.setProjectGroupName(personnel.getProjectGroupName());
            profileSummary.setHead(personnel.getHead());
            profileSummary.setGender(personnel.getGender());
            profileSummary.setMobilePhone(personnel.getMobilePhone());
            profileSummary.setEmail(personnel.getEmail());
            profileSummary.setAllowedRoomsDisplayZh(personnel.getAllowedRoomsDisplayZh());
        }
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
        return profileSummary;
    }

    /**
     * 统一人员表查当前账号（staff_id / aro_user_id 任一命中）。
     *
     * <p>STAFF_* 账号在 personnel.staff_id 未回填时查不到，须经 user_aro_binding 展开成
     * aro_user_id 再查一次 —— 与课题组解析同一套展开规则，否则「有课题组无档案」。
     */
    private Personnel resolveLocalPersonnel(User user) {
        if (user == null || !StringUtils.hasText(user.getId())) {
            return null;
        }
        try {
            Personnel me = personnelService.resolveByAccount(user.getId());
            if (me != null) {
                return me;
            }
            if (user.getId().startsWith("STAFF_")) {
                UserAroBinding binding = userAroBindingMapper.selectByUserId(user.getId());
                if (binding != null && StringUtils.hasText(binding.getAroUserId())) {
                    return personnelService.resolveByAccount(binding.getAroUserId());
                }
            }
        } catch (Exception e) {
            log.warn("Failed to resolve local personnel for user {}", user.getId(), e);
        }
        return null;
    }

    /**
     * 本地身份标识系统的标签名（person_identity_tag.label）。
     *
     * <p>注意 person_identity.user_id 存的是 **personnel.id**（不是账号 id），
     * 所以必须先 resolveByAccount 落成统一人员再查标签 —— 直接拿账号 id 查会永远空。
     */
    private List<String> identityLabelsOf(User user, Personnel me) {
        try {
            String personnelId = me != null ? String.valueOf(me.getId()) : personnelService.resolveIdByAccount(user.getId());
            if (personnelId == null) {
                return List.of();
            }
            return personIdentityService.getByUser(personnelId).stream()
                    .map(IdentityTagVO::getLabel)
                    .filter(StringUtils::hasText)
                    .toList();
        } catch (Exception e) {
            log.warn("Failed to query identity labels for user {}", user.getId(), e);
            return List.of();
        }
    }

    /**
     * 首页指标卡片汇总 —— 全部按**本课题组**口径：
     * 课题组人员数、AUP 计划书数、剩余笼位（跨房间跨 AUP 合并）。
     */
    private StudentDashboardResponse.HomeSummary buildHomeSummary(User user) {
        StudentDashboardResponse.HomeSummary summary = new StudentDashboardResponse.HomeSummary();
        List<String> groups = studentCageShelfService.resolveUserGroupNames(user.getId());
        if (groups.isEmpty()) {
            summary.setRemainingByRoom(List.of());
            return summary;
        }
        try {
            // ① 课题组人数：先 LIKE 取候选再 sameGroup 精确复核。
            //    **只出人数，不出名单**（用户 2026-09-14 口径：首页不提供课题组成员名单的查看入口）。
            //    名字/工号/身份一律不查 —— 免得又拼出一份旧版身份（user_type_names）的名单。
            List<Map<String, Object>> memberRows = jdbcTemplate.queryForList(
                    "SELECT project_group_name FROM personnel WHERE " + likeClause(groups), likeArgsOf(groups));
            int memberCount = 0;
            for (Map<String, Object> row : memberRows) {
                String groupName = trim(row.get("project_group_name"));
                if (groups.stream().anyMatch(g -> PersonnelProjectGroupUtil.sameGroup(g, groupName))) {
                    memberCount++;
                }
            }
            summary.setGroupMemberCount(memberCount);

            // ② AUP：与 /student/aup 同口径（project_group_name IN 本人课题组）；草稿没有注册号也算数
            List<Object> aupArgs = new ArrayList<>(groups);
            String aupWhere = "project_group_name IN " + placeholders(groups.size());
            Map<String, Object> aupCounts = jdbcTemplate.queryForMap(
                    "SELECT COUNT(*) AS total, SUM(CASE WHEN is_demo <> 1 THEN 1 ELSE 0 END) AS real_count "
                            + "FROM aup_record WHERE " + aupWhere, aupArgs.toArray());
            int total = intVal(aupCounts.get("total"));
            int real = intVal(aupCounts.get("real_count"));
            summary.setAupCount(real > 0 ? real : total);

            // ③ 剩余笼位：本课题组各 AUP 在预约表里的「预约数量 − 已使用」，跨房间跨 AUP 相加。
            //
            //    「已使用」**必须走 CageQuotaMapper.countAupUsedInRoom**（= 预约模式同一个口径：
            //    cage_cell_detail.aup_number 命中的实际笼位数），而不是预约表里的 used_animal_cage_number
            //    列 —— 那一列是同步快照，会过期（实测 201A 快照 0、实际 36），
            //    CageBookingLocalService 展示时也是显式覆盖它的。用快照列会把剩余算虚高。
            //
            //    注册号两段式查询（先取本组注册号再 IN），不做表对表 JOIN —— 生产库新旧表排序规则有分拨，
            //    列对列比较会抛 1267 且常被上层吃掉。
            List<Map<String, Object>> regRows = jdbcTemplate.queryForList(
                    "SELECT register_no FROM aup_record WHERE " + aupWhere
                            + " AND register_no IS NOT NULL AND register_no <> ''", aupArgs.toArray());
            List<String> registers = regRows.stream()
                    .map(r -> trim(r.get("register_no")))
                    .filter(StringUtils::hasText)
                    .distinct()
                    .toList();
            if (!registers.isEmpty()) {
                List<Object> bookingArgs = new ArrayList<>(registers);
                // 按 (房间, 注册号) 取配额行；同一对出现多行时取 MAX(rent_number)，
                // 与 CageQuotaMapper.selectRentNumber 的 LIMIT 1 口径一致，避免重复行把配额算两遍
                List<Map<String, Object>> bookingRows = jdbcTemplate.queryForList(
                        "SELECT b.room_id, b.register_number, MAX(r.name) AS room_name, "
                                + "MAX(COALESCE(b.rent_number, 0)) AS rent "
                                + "FROM cage_booking_room_aup b "
                                + "LEFT JOIN cage_booking_room r ON r.room_id = b.room_id "
                                + "WHERE b.deleted = 0 AND b.register_number IN " + placeholders(registers.size())
                                + " GROUP BY b.room_id, b.register_number",
                        bookingArgs.toArray());

                Map<String, StudentDashboardResponse.RoomRemaining> roomMap = new LinkedHashMap<>();
                for (Map<String, Object> row : bookingRows) {
                    Long roomId = toLongSafe(trim(row.get("room_id")));
                    String registerNo = trim(row.get("register_number"));
                    int rent = intVal(row.get("rent"));
                    int used = roomId == null ? 0 : quotaMapper.countAupUsedInRoom(roomId, registerNo);
                    String key = trim(row.get("room_id"));
                    StudentDashboardResponse.RoomRemaining rr = roomMap.get(key);
                    if (rr == null) {
                        rr = new StudentDashboardResponse.RoomRemaining();
                        String roomName = trim(row.get("room_name"));
                        rr.setRoomName(StringUtils.hasText(roomName) ? roomName : key);
                        rr.setRentNumber(0);
                        rr.setUsedNumber(0);
                        roomMap.put(key, rr);
                    }
                    rr.setRentNumber(rr.getRentNumber() + rent);
                    rr.setUsedNumber(rr.getUsedNumber() + used);
                }
                List<StudentDashboardResponse.RoomRemaining> byRoom = new ArrayList<>();
                int remaining = 0;
                for (StudentDashboardResponse.RoomRemaining rr : roomMap.values()) {
                    rr.setRemaining(rr.getRentNumber() - rr.getUsedNumber());
                    remaining += rr.getRemaining();
                    byRoom.add(rr);
                }
                byRoom.sort(Comparator.comparingInt(StudentDashboardResponse.RoomRemaining::getRemaining).reversed());
                summary.setCageRemaining(remaining);
                summary.setRemainingByRoom(byRoom);
            } else {
                summary.setRemainingByRoom(List.of());
            }
        } catch (Exception e) {
            log.warn("Failed to build homeSummary for user {}", user.getId(), e);
        }
        return summary;
    }

    private static String placeholders(int n) {
        return "(" + String.join(",", Collections.nCopies(n, "?")) + ")";
    }

    /** 候选用宽松 LIKE（本人组名可能是成员行组名串的子串，反之亦然）。 */
    private static String likeClause(List<String> groups) {
        return groups.stream()
                .map(g -> "(project_group_name = ? OR project_group_name LIKE CONCAT('%', ?, '%'))")
                .collect(Collectors.joining(" OR "));
    }

    private static Object[] likeArgsOf(List<String> groups) {
        List<Object> args = new ArrayList<>();
        for (String g : groups) {
            args.add(g);
            args.add(g);
        }
        return args.toArray();
    }

    private static String trim(Object v) {
        return v == null ? "" : String.valueOf(v).trim();
    }

    private static int intVal(Object v) {
        return v instanceof Number n ? n.intValue() : 0;
    }

    private static Long toLongSafe(String text) {
        if (!StringUtils.hasText(text)) {
            return null;
        }
        try {
            return Long.parseLong(text.trim());
        } catch (NumberFormatException e) {
            return null;
        }
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
