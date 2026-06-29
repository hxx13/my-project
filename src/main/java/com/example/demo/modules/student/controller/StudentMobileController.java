package com.example.demo.modules.student.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.analytics.service.StudentActivityService;
import com.example.demo.modules.aro.dto.AroPersonnel;
import com.example.demo.modules.aro.mapper.AroDatabaseMapper;
import com.example.demo.modules.aro.mapper.AroPersonnelMapper;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.mapper.UserMapper;
import com.example.demo.modules.material.dto.CreateMaterialRequestReq;
import com.example.demo.modules.material.dto.MaterialRequestView;
import com.example.demo.modules.material.service.MaterialService;
import com.example.demo.modules.student.dto.StudentDashboardResponse;
import com.example.demo.modules.student.dto.StudentDashboardResponse.ProfileSummary;
import com.example.demo.modules.student.dto.StudentDashboardResponse.StatsSummary;
import com.example.demo.modules.student.dto.StudentDashboardResponse.PinnedRoom;
import com.example.demo.modules.student.dto.StudentDashboardResponse.RecentRecord;
import com.example.demo.modules.student.dto.StudentDashboardResponse.RecentNotice;
import com.example.demo.modules.student.service.MobileCenterAlertService;
import com.example.demo.modules.student.service.StudentCageShelfService;
import com.example.demo.modules.student.service.StudentDashboardService;
import com.example.demo.modules.student.service.StudentNotificationService;
import com.example.demo.modules.student.service.StudentRoomService;
import com.example.demo.modules.student.service.StudentViolationService;
import com.example.demo.modules.student.support.StudentMobileHtml5Privilege;
import com.example.demo.modules.twin.common.dto.RoomDashboardRenderDTO;
import com.example.demo.modules.twin.common.mapper.TwinDashboardMapper;
import com.example.demo.modules.twin.common.util.RoomFloorPrefixUtil;
import com.example.demo.modules.twin.dashboard.service.TwinDashboardAggregationService;
import com.example.demo.modules.twin.scan.dto.ExemptStatusDTO;
import com.example.demo.modules.twin.scan.dto.ScanAnalyzeResponseDTO;
import com.example.demo.modules.twin.scan.service.TwinScanAppService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletRequest;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@RestController
@RequestMapping("/api/student/mobile")
@Tag(name = "学生手机端（JWT）", description = "学生手机端 API，使用 JWT Bearer 认证")
public class StudentMobileController {

    private static final Logger log = LoggerFactory.getLogger(StudentMobileController.class);

    private final AuthContextService authContextService;
    private final UserMapper userMapper;
    private final StudentDashboardService dashboardService;
    private final StudentRoomService studentRoomService;
    private final TwinDashboardAggregationService aggregationService;
    private final TwinScanAppService twinScanAppService;
    private final TwinDashboardMapper dashboardMapper;
    private final AroPersonnelMapper aroPersonnelMapper;
    private final AroDatabaseMapper aroDatabaseMapper;
    private final MaterialService materialService;
    private final StudentCageShelfService cageShelfService;
    private final StudentViolationService studentViolationService;
    private final MobileCenterAlertService mobileCenterAlertService;
    private final StudentActivityService studentActivityService;
    private final StudentNotificationService studentNotificationService;

    public StudentMobileController(AuthContextService authContextService,
                                   UserMapper userMapper,
                                   StudentDashboardService dashboardService,
                                   StudentRoomService studentRoomService,
                                   TwinDashboardAggregationService aggregationService,
                                   TwinScanAppService twinScanAppService,
                                   TwinDashboardMapper dashboardMapper,
                                   AroPersonnelMapper aroPersonnelMapper,
                                   AroDatabaseMapper aroDatabaseMapper,
                                   MaterialService materialService,
                                   StudentCageShelfService cageShelfService,
                                   StudentViolationService studentViolationService,
                                   MobileCenterAlertService mobileCenterAlertService,
                                   StudentActivityService studentActivityService,
                                   StudentNotificationService studentNotificationService) {
        this.authContextService = authContextService;
        this.userMapper = userMapper;
        this.dashboardService = dashboardService;
        this.studentRoomService = studentRoomService;
        this.aggregationService = aggregationService;
        this.twinScanAppService = twinScanAppService;
        this.dashboardMapper = dashboardMapper;
        this.aroPersonnelMapper = aroPersonnelMapper;
        this.aroDatabaseMapper = aroDatabaseMapper;
        this.materialService = materialService;
        this.cageShelfService = cageShelfService;
        this.studentViolationService = studentViolationService;
        this.mobileCenterAlertService = mobileCenterAlertService;
        this.studentActivityService = studentActivityService;
        this.studentNotificationService = studentNotificationService;
    }

    // ============================================================
    // Shared
    // ============================================================

    @GetMapping("/profile")
    @Operation(summary = "获取当前学生档案信息（JWT）")
    public Result<ProfileSummary> getProfile(HttpServletRequest request) {
        User user = requireCurrentUser(request);
        StudentDashboardResponse dashboard = dashboardService.buildDashboard(user);
        return Result.success(dashboard.getProfile());
    }

    // ============================================================
    // Home
    // ============================================================

    @GetMapping("/home")
    @Operation(summary = "获取学生首页数据（统计、收藏房间、最近记录、最近通知）")
    public Result<Map<String, Object>> getHome(HttpServletRequest request) {
        User user = requireCurrentUser(request);
        StudentDashboardResponse dashboard = dashboardService.buildDashboard(user);

        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("stats", buildStatsMap(dashboard.getStats()));
        resp.put("pinnedRooms", buildPinnedRoomsList(dashboard.getPinnedRooms()));
        resp.put("recentRecords", buildRecentRecordsList(dashboard.getRecentRecords()));
        resp.put("recentNotices", buildRecentNoticesList(dashboard.getRecentNotices()));
        return Result.success(resp);
    }

    // ============================================================
    // Rooms
    // ============================================================

    @GetMapping("/room-dashboard")
    @Operation(summary = "房间页数据（wechat-overview + scan/analyze，JWT）")
    public Result<Map<String, Object>> getRoomDashboard(HttpServletRequest request) {
        User user = requireCurrentUser(request);

        List<RoomDashboardRenderDTO> overview = aggregationService.getWechatMiniProgramData(null);
        ScanAnalyzeResponseDTO analyze;
        try {
            analyze = twinScanAppService.analyzeScan(user.getId(), null, null);
        } catch (Exception e) {
            log.warn("[StudentMobile] room-dashboard scan/analyze failed for userId={}: {}", user.getId(), e.getMessage());
            analyze = new ScanAnalyzeResponseDTO();
            analyze.setSuccess(false);
            analyze.setMessage(e.getMessage());
        }

        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("overview", overview != null ? overview : List.of());
        resp.put("analyze", analyze);
        resp.put("userId", user.getId());
        return Result.success(resp);
    }

    @GetMapping("/exempt-status")
    @Operation(summary = "获取当前学生豁免/延迟授权状态（轻量接口，JWT）")
    public Result<ExemptStatusDTO> getExemptStatus(HttpServletRequest request) {
        User user = requireCurrentUser(request);
        try {
            ExemptStatusDTO status = twinScanAppService.buildExemptStatusForUser(user.getId());
            return Result.success(status);
        } catch (Exception e) {
            log.warn("[StudentMobile] exempt-status failed for userId={}: {}", user.getId(), e.getMessage());
            return Result.success(null);
        }
    }

    @GetMapping("/rooms")
    @Operation(summary = "获取学生房间列表（按校区/楼层分组，JWT）")
    public Result<Map<String, Object>> getRooms(@RequestParam(defaultValue = "all") String mode,
                                                HttpServletRequest request) {
        User user = requireCurrentUser(request);

        List<Map<String, Object>> flatList = new ArrayList<>();

        if ("mine".equals(mode)) {
            try {
                AroPersonnel aro = aroPersonnelMapper.findByUserId(user.getId());
                if (aro != null && aro.getAllowedRoomsDisplayZh() != null
                        && !aro.getAllowedRoomsDisplayZh().isBlank()) {
                    String[] roomNames = aro.getAllowedRoomsDisplayZh().split("[,，]");
                    List<RoomDashboardRenderDTO> allRooms = aggregationService.getWechatMiniProgramData(null);
                    for (RoomDashboardRenderDTO room : allRooms) {
                        if (room.getRoomName() == null) continue;
                        for (String allowedName : roomNames) {
                            String an = allowedName.trim();
                            if (room.getRoomName().contains(an) || an.contains(room.getRoomName())) {
                                flatList.add(buildMobileRoomItem(room));
                                break;
                            }
                        }
                    }
                    log.info("[StudentMobile] ARO-matched {} rooms for userId={}", flatList.size(), user.getId());
                }
            } catch (Exception e) {
                log.warn("[StudentMobile] ARO room matching failed for userId={}: {}", user.getId(), e.getMessage());
            }

            if (flatList.isEmpty()) {
                try {
                    Map<String, Object> roomsResult = studentRoomService.getRooms(user, "1", null, null, null, 1, 200);
                    @SuppressWarnings("unchecked")
                    List<Map<String, Object>> svcList = (List<Map<String, Object>>) roomsResult.get("data");
                    if (svcList != null) flatList = svcList;
                    log.info("[StudentMobile] StudentRoomService returned {} rooms for userId={}", flatList.size(), user.getId());
                } catch (Exception e) {
                    log.warn("[StudentMobile] StudentRoomService failed for userId={}: {}", user.getId(), e.getMessage());
                }
            }
        } else {
            try {
                List<RoomDashboardRenderDTO> allRooms = aggregationService.getWechatMiniProgramData(null);
                for (RoomDashboardRenderDTO room : allRooms) {
                    if (room.getRoomName() == null || room.getRoomName().isBlank()) continue;
                    flatList.add(buildMobileRoomItem(room));
                }
                log.info("[StudentMobile] All rooms: {} total for userId={}", flatList.size(), user.getId());
            } catch (Exception e) {
                log.warn("[StudentMobile] All rooms query failed: {}", e.getMessage());
            }
        }

        Map<String, Map<String, List<Map<String, Object>>>> grouped = new LinkedHashMap<>();
        for (Map<String, Object> room : flatList) {
            String zone = String.valueOf(room.getOrDefault("zone", "其他"));
            String floor = String.valueOf(room.getOrDefault("floor", "未知楼层"));
            grouped.computeIfAbsent(zone, k -> new LinkedHashMap<>())
                   .computeIfAbsent(floor, k -> new ArrayList<>())
                   .add(room);
        }

        List<Map<String, Object>> campusGroups = new ArrayList<>();
        for (var campusEntry : grouped.entrySet()) {
            Map<String, Object> campus = new LinkedHashMap<>();
            campus.put("campus", campusEntry.getKey());
            List<Map<String, Object>> floorGroups = new ArrayList<>();
            for (var floorEntry : campusEntry.getValue().entrySet()) {
                Map<String, Object> fg = new LinkedHashMap<>();
                fg.put("floor", floorEntry.getKey());
                fg.put("rooms", floorEntry.getValue());
                floorGroups.add(fg);
            }
            campus.put("floors", floorGroups);
            campusGroups.add(campus);
        }

        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("campusGroups", campusGroups);
        resp.put("totalCount", flatList.size());
        return Result.success(resp);
    }

    // ============================================================
    // Access Records
    // ============================================================

    @GetMapping("/access-records")
    @Operation(summary = "获取学生出入记录（分页，JWT）")
    public Result<Map<String, Object>> getAccessRecords(@RequestParam(defaultValue = "1") int page,
                                                         @RequestParam(defaultValue = "20") int size,
                                                         HttpServletRequest request) {
        User user = requireCurrentUser(request);

        int offset = (page - 1) * size;
        List<Map<String, Object>> raw = aroDatabaseMapper.selectAccessRecordsByUserId(user.getId(), offset, size);
        int total = aroDatabaseMapper.countAccessRecordsByUserId(user.getId());

        List<Map<String, Object>> data = new ArrayList<>();
        if (raw != null) {
            for (Map<String, Object> row : raw) {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("id", String.valueOf(row.getOrDefault("id", "")));
                item.put("eventTime", String.valueOf(row.getOrDefault("event_time", "")));
                item.put("eventType", String.valueOf(row.getOrDefault("event_type", "")));
                item.put("roomName", String.valueOf(row.getOrDefault("room_name", "")));
                item.put("personName", String.valueOf(row.getOrDefault("person_name", "")));
                data.add(item);
            }
        }
        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("data", data);
        resp.put("total", total);
        resp.put("page", page);
        resp.put("size", size);
        return Result.success(resp);
    }

    // ============================================================
    // Materials
    // ============================================================

    @GetMapping("/materials")
    @Operation(summary = "获取申领物品目录与学生申领记录（JWT）")
    public Result<Map<String, Object>> getMaterials(HttpServletRequest request) {
        User user = requireCurrentUser(request);

        Map<String, Object> resp = new LinkedHashMap<>();
        try {
            var categories = materialService.listCategoriesForStudent();
            resp.put("categories", categories != null ? categories : List.of());
        } catch (Exception e) {
            log.warn("[StudentMobile] materials categories failed: {}", e.getMessage());
            resp.put("categories", List.of());
        }
        try {
            var items = materialService.listItemsForStudent(null);
            resp.put("items", items != null ? items : List.of());
        } catch (Exception e) {
            log.warn("[StudentMobile] materials items failed: {}", e.getMessage());
            resp.put("items", List.of());
        }
        try {
            var mine = materialService.listMine(user, null, 1, 20);
            resp.put("myRequests", mine != null && mine.getData() != null
                    ? mine.getData().getOrDefault("data", List.of()) : List.of());
        } catch (Exception e) {
            log.warn("[StudentMobile] materials myRequests failed: {}", e.getMessage());
            resp.put("myRequests", List.of());
        }
        return Result.success(resp);
    }

    @PostMapping("/material/requests")
    @Operation(summary = "提交物资申领（JWT）")
    public Result<List<MaterialRequestView>> createMaterialRequest(@RequestBody CreateMaterialRequestReq req,
                                                                   HttpServletRequest request) {
        User user = requireCurrentUser(request);
        return materialService.createRequest(user, req);
    }

    // ============================================================
    // Cage Shelves
    // ============================================================

    @GetMapping("/cage-shelves/all")
    @Operation(summary = "获取课题组全部笼架（JWT）")
    public Result<Map<String, Object>> getCageAllShelves(HttpServletRequest request) {
        User user = requireCurrentUser(request);
        boolean html5Privilege = StudentMobileHtml5Privilege.isPrivileged(user);
        List<Map<String, Object>> allShelves = cageShelfService.listAllShelvesForMobile(user, html5Privilege);

        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("shelves", allShelves);
        resp.put("totalCount", allShelves.size());
        return Result.success(resp);
    }

    @GetMapping("/cage-shelves/{shelveId}/detail")
    @Operation(summary = "笼架网格详情（JWT）")
    public Result<Map<String, Object>> getCageShelfDetail(@PathVariable String shelveId,
                                                           HttpServletRequest request) {
        User user = requireCurrentUser(request);
        boolean html5Privilege = StudentMobileHtml5Privilege.isPrivileged(user);
        return Result.success(cageShelfService.getShelfDetail(user, shelveId, html5Privilege));
    }

    @GetMapping("/cage-shelves/{shelveId}/cells/{x}/{y}/annotation")
    @Operation(summary = "获取笼位标注（JWT）")
    public Result<Map<String, Object>> getCellAnnotation(@PathVariable String shelveId,
                                                          @PathVariable int x,
                                                          @PathVariable int y,
                                                          HttpServletRequest request) {
        User user = requireCurrentUser(request);
        try {
            return Result.success(cageShelfService.getAnnotation(user, shelveId, x, y));
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }

    @PutMapping("/cage-shelves/{shelveId}/cells/{x}/{y}/annotation")
    @Operation(summary = "保存笼位标注（JWT）")
    public Result<?> saveCellAnnotation(@PathVariable String shelveId,
                                         @PathVariable int x,
                                         @PathVariable int y,
                                         @RequestBody Map<String, String> body,
                                         HttpServletRequest request) {
        User user = requireCurrentUser(request);
        try {
            String position = body.getOrDefault("position", x + "-" + y);
            String richText = body.getOrDefault("richText", null);
            String images = body.getOrDefault("images", null);
            String aroRawData = body.getOrDefault("aroRawData", null);
            cageShelfService.upsertAnnotation(user, shelveId, x, y, position, richText, images, aroRawData);
            return Result.success();
        } catch (IllegalStateException e) {
            return Result.fail(403, e.getMessage());
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }

    // ============================================================
    // Violations
    // ============================================================

    @GetMapping("/violations")
    @Operation(summary = "获取学生违规记录（JWT）")
    public Result<Map<String, Object>> getViolations(@RequestParam(defaultValue = "1") int page,
                                                      @RequestParam(defaultValue = "20") int size,
                                                      HttpServletRequest request) {
        User user = requireCurrentUser(request);
        Map<String, Object> data = studentViolationService.getViolations(user, page, size, "", "");
        return Result.success(data);
    }

    // ============================================================
    // Alerts
    // ============================================================

    @GetMapping("/alerts")
    @Operation(summary = "获取公告与违规提醒（JWT）")
    public Result<Map<String, Object>> getAlerts(HttpServletRequest request) {
        User user = requireCurrentUser(request);
        boolean html5Privilege = StudentMobileHtml5Privilege.isPrivileged(user);
        Map<String, Object> resp = mobileCenterAlertService.buildAlerts(user.getId(), html5Privilege);
        resolveAnnouncementImages(resp.get("announcements"));
        resolveAnnouncementImages(resp.get("items"));
        return Result.success(resp);
    }

    @PostMapping("/alerts/read-all")
    @Operation(summary = "将所有反馈类通知标记为已读（JWT）")
    public Result<Void> markAlertsReadAll(HttpServletRequest request) {
        User user = requireCurrentUser(request);
        studentNotificationService.markAllRead(user);
        return Result.success(null);
    }

    @PostMapping("/notice-auto-suppress")
    @Operation(summary = "下次不再自动弹出（JWT）")
    public Result<Map<String, Object>> suppressNoticeAutoOpen(@RequestBody Map<String, Object> body,
                                                               HttpServletRequest request) {
        User user = requireCurrentUser(request);
        if (body == null) {
            return Result.fail(400, "缺少请求体");
        }
        Object kindObj = body.get("noticeKind");
        Object recordObj = body.get("recordId");
        if (kindObj == null || recordObj == null) {
            return Result.fail(400, "缺少 noticeKind 或 recordId");
        }
        String noticeKind = String.valueOf(kindObj).trim();
        long recordId;
        try {
            recordId = Long.parseLong(String.valueOf(recordObj).trim());
        } catch (NumberFormatException e) {
            return Result.fail(400, "recordId 无效");
        }
        if (recordId <= 0) {
            return Result.fail(400, "recordId 无效");
        }
        try {
            return Result.success(mobileCenterAlertService.suppressNoticeAutoOpen(user.getId(), noticeKind, recordId));
        } catch (IllegalArgumentException e) {
            return Result.fail(400, e.getMessage());
        } catch (Exception e) {
            log.warn("[StudentMobile] notice-auto-suppress failed userId={}: {}", user.getId(), e.getMessage());
            return Result.error("保存失败: " + e.getMessage());
        }
    }

    // ============================================================
    // Group Activity
    // ============================================================

    @GetMapping("/group-activity/summary")
    @Operation(summary = "课题组活跃度 KPI（JWT）")
    public Result<Map<String, Object>> getGroupActivitySummary(@RequestParam(required = false) String groupName,
                                                                @RequestParam String startTime,
                                                                @RequestParam String endTime,
                                                                @RequestParam(defaultValue = "all") String campus,
                                                                HttpServletRequest request) {
        User user = requireCurrentUser(request);
        String resolvedGroup = resolveProjectGroupName(user, groupName);
        return Result.success(studentActivityService.summary(resolvedGroup, startTime, endTime, campus));
    }

    @GetMapping("/group-activity/members")
    @Operation(summary = "课题组成员活跃度（JWT）")
    public Result<Map<String, Object>> getGroupActivityMembers(@RequestParam(required = false) String groupName,
                                                                @RequestParam String startTime,
                                                                @RequestParam String endTime,
                                                                @RequestParam(defaultValue = "entries") String sortBy,
                                                                @RequestParam(defaultValue = "desc") String order,
                                                                @RequestParam(defaultValue = "1") int page,
                                                                @RequestParam(defaultValue = "10") int size,
                                                                HttpServletRequest request) {
        User user = requireCurrentUser(request);
        String resolvedGroup = resolveProjectGroupName(user, groupName);
        return Result.success(studentActivityService.queryMemberActivity(
                resolvedGroup, startTime, endTime, sortBy, order, page, size));
    }

    @GetMapping("/group-activity/heatmap")
    @Operation(summary = "课题组进出时段热力图（JWT）")
    public Result<List<Map<String, Object>>> getGroupActivityHeatmap(@RequestParam(required = false) String groupName,
                                                                      @RequestParam String startTime,
                                                                      @RequestParam String endTime,
                                                                      HttpServletRequest request) {
        User user = requireCurrentUser(request);
        String resolvedGroup = resolveProjectGroupName(user, groupName);
        return Result.success(studentActivityService.heatmap(resolvedGroup, startTime, endTime));
    }

    @GetMapping("/group-activity/room-usage")
    @Operation(summary = "课题组喜好进出房间排行（JWT）")
    public Result<List<Map<String, Object>>> getGroupActivityRoomUsage(@RequestParam(required = false) String groupName,
                                                                        @RequestParam String startTime,
                                                                        @RequestParam String endTime,
                                                                        HttpServletRequest request) {
        User user = requireCurrentUser(request);
        String resolvedGroup = resolveProjectGroupName(user, groupName);
        return Result.success(studentActivityService.roomUsage(resolvedGroup, startTime, endTime));
    }

    // ============================================================
    // Helper Methods
    // ============================================================

    /** 从 JWT Bearer header 解析当前用户，未登录则抛出异常 */
    private User requireCurrentUser(HttpServletRequest request) {
        User user = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (user == null) {
            throw new RuntimeException("未登录");
        }
        return user;
    }

    /** 将 RoomDashboardRenderDTO 构建为手机端房间条目 Map */
    private Map<String, Object> buildMobileRoomItem(RoomDashboardRenderDTO room) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("roomId", String.valueOf(room.getRoomId()));
        item.put("roomName", room.getRoomName() != null ? room.getRoomName() : "");
        item.put("floor", RoomFloorPrefixUtil.deriveFloorLabel(room.getRoomName()));
        item.put("zone", room.getCampus() != null ? room.getCampus() : "其他");

        int own = room.getCampusUserCount() != null ? room.getCampusUserCount() : 0;
        int borrowed = room.getBorrowedCardCount() != null ? room.getBorrowedCardCount() : 0;
        int occupants = own + borrowed;
        int capacity = room.getTotalCapacity() != null && room.getTotalCapacity() > 0
                ? room.getTotalCapacity()
                : 20;
        double rate = capacity > 0 ? (occupants * 100.0 / capacity) : 0;

        item.put("occupantCount", occupants);
        item.put("campusUserCount", own);
        item.put("borrowedCardCount", borrowed);
        item.put("capacity", capacity);
        item.put("occupancyRate", (int) Math.round(rate));

        String status;
        if (rate > 90) status = "full";
        else if (rate >= 50) status = "busy";
        else status = "idle";
        item.put("status", status);
        item.put("isPinned", false);
        return item;
    }

    /** 解析课题组名：仅从 ARO 人员库解析，不回退到用户传入值（防止跨组数据泄露） */
    private String resolveProjectGroupName(User user, String requestedGroup) {
        try {
            AroPersonnel personnel = aroPersonnelMapper.findByUserId(user.getId());
            if (personnel != null) {
                String resolved = personnel.getResolvedProjectGroupNames();
                if (resolved != null && !resolved.isBlank()) {
                    return resolved;
                }
            }
        } catch (Exception e) {
            log.warn("[StudentMobile] resolve group failed for userId={}: {}", user.getId(), e.getMessage());
        }
        // 无 ARO 人员记录或课题组为空时返回空串，不使用用户传入值
        log.warn("[StudentMobile] No ARO group resolved for userId={}, blocking arbitrary groupName access", user.getId());
        return "";
    }

    /** 将 StatsSummary 转为 Map */
    private Map<String, Object> buildStatsMap(StatsSummary s) {
        Map<String, Object> map = new LinkedHashMap<>();
        if (s == null) return map;
        map.put("todayAccessCount", s.getTodayAccessCount());
        map.put("violationCount", s.getViolationCount());
        map.put("unreadNoticeCount", s.getUnreadNoticeCount());
        map.put("accessibleRoomCount", s.getAccessibleRoomCount());
        return map;
    }

    /** 将收藏房间列表转为 List<Map> */
    private List<Map<String, Object>> buildPinnedRoomsList(List<PinnedRoom> rooms) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (rooms == null) return out;
        for (PinnedRoom r : rooms) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("roomId", r.getRoomId());
            m.put("roomName", r.getRoomName());
            m.put("floor", r.getFloor());
            m.put("zone", r.getZone());
            m.put("occupantCount", r.getOccupantCount());
            m.put("capacity", r.getCapacity());
            m.put("occupancyRate", r.getOccupancyRate());
            m.put("status", r.getStatus());
            m.put("isPinned", r.isPinned());
            out.add(m);
        }
        return out;
    }

    /** 将最近出入记录列表转为 List<Map> */
    private List<Map<String, Object>> buildRecentRecordsList(List<RecentRecord> records) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (records == null) return out;
        for (RecentRecord r : records) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("time", r.getTime());
            m.put("type", r.getType());
            m.put("roomName", r.getRoomName());
            out.add(m);
        }
        return out;
    }

    /** 将最近通知列表转为 List<Map> */
    private List<Map<String, Object>> buildRecentNoticesList(List<RecentNotice> notices) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (notices == null) return out;
        for (RecentNotice n : notices) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("title", n.getTitle());
            m.put("type", n.getType());
            m.put("publishDate", n.getPublishDate());
            out.add(m);
        }
        return out;
    }

    // ---- 图片 URL 解析（与 StudentMobileCenterController 同源） ----

    @Value("${app.public-base-url:}")
    private String appPublicBaseUrl;

    private static final Pattern IMG_SRC = Pattern.compile(
            "<img\\s+[^>]*src\\s*=\\s*[\"']([^\"']+)[\"']", Pattern.CASE_INSENSITIVE);

    /** 将 contentHtml 中的相对路径 img src 解析为绝对 HTTPS URL */
    private String resolveContentImageUrls(String html) {
        if (html == null || html.isBlank()) return html;
        String origin = resolvePublicOrigin();
        if (origin == null || origin.isBlank()) return html;

        Matcher m = IMG_SRC.matcher(html);
        StringBuilder sb = new StringBuilder();
        while (m.find()) {
            String src = m.group(1);
            String resolved = resolveSingleUrl(src, origin);
            m.appendReplacement(sb, m.group().replace(src, resolved));
        }
        m.appendTail(sb);
        return sb.toString();
    }

    private String resolveSingleUrl(String raw, String origin) {
        if (raw == null || raw.isBlank()) return raw;
        String u = raw.trim();
        if (u.matches("(?i)^https?://.*") || u.startsWith("cloud://") || u.startsWith("data:")) {
            return u;
        }
        String path = u.startsWith("/") ? u : "/" + u;
        return origin + path;
    }

    private String resolvePublicOrigin() {
        if (appPublicBaseUrl != null && !appPublicBaseUrl.isBlank()
                && appPublicBaseUrl.matches("(?i)^https?://.*")) {
            return appPublicBaseUrl.replaceAll("/+$", "");
        }
        return null;
    }

    @SuppressWarnings("unchecked")
    private void resolveAnnouncementImages(Object listObj) {
        if (!(listObj instanceof List<?> list)) {
            return;
        }
        for (Object row : list) {
            if (row instanceof Map<?, ?> item) {
                if ("announcement".equals(item.get("kind")) && item.get("contentHtml") instanceof String html) {
                    Map<String, Object> mutable = (Map<String, Object>) item;
                    mutable.put("contentHtml", resolveContentImageUrls(html));
                }
            }
        }
    }
}
