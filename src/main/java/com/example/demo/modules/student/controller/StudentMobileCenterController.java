package com.example.demo.modules.student.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.analytics.service.StudentActivityService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.mapper.UserMapper;
import com.example.demo.modules.student.dto.StudentDashboardResponse;
import com.example.demo.modules.student.entity.StudentMobileToken;
import com.example.demo.modules.student.service.MobileCenterAlertService;
import com.example.demo.modules.student.service.StudentDashboardService;
import com.example.demo.modules.student.service.StudentMobileTokenService;
import com.example.demo.modules.student.service.StudentViolationService;
import com.example.demo.modules.aro.dto.AroPersonnel;
import com.example.demo.modules.aro.mapper.AroPersonnelMapper;
import com.example.demo.modules.student.service.StudentNotificationService;
import com.example.demo.modules.student.service.StudentRoomService;
import com.example.demo.modules.twin.common.dto.RoomDashboardRenderDTO;
import com.example.demo.modules.twin.common.util.RoomFloorPrefixUtil;
import com.example.demo.modules.twin.common.mapper.TwinDashboardMapper;
import com.example.demo.modules.twin.dashboard.entity.TwinScanPopupAnnouncement;
import com.example.demo.modules.aro.mapper.AroDatabaseMapper;
import com.example.demo.modules.material.dto.CreateMaterialRequestReq;
import com.example.demo.modules.material.dto.MaterialRequestView;
import com.example.demo.modules.material.service.MaterialService;
import com.example.demo.modules.student.service.StudentCageShelfService;
import com.example.demo.modules.student.support.StudentMobileHtml5Privilege;
import com.example.demo.modules.twin.dashboard.service.TwinDashboardAggregationService;
import com.example.demo.modules.twin.scan.delay.service.ScanDelayRequestService;
import com.example.demo.modules.twin.scan.dto.ScanAnalyzeResponseDTO;
import com.example.demo.modules.twin.scan.service.TwinScanAppService;
import com.example.demo.modules.twin.dashboard.entity.TwinStudentViolation;
import com.example.demo.modules.twin.dashboard.mapper.TwinScanPopupAnnouncementMapper;
import com.example.demo.modules.twin.dashboard.mapper.TwinStudentViolationMapper;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletRequest;
import java.time.LocalDateTime;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@RestController
@Tag(name = "学生手机端直达", description = "扫码直达学生中心（手机版）v2")
public class StudentMobileCenterController {

    private static final Logger log = LoggerFactory.getLogger(StudentMobileCenterController.class);

    private final StudentMobileTokenService tokenService;
    private final StudentDashboardService dashboardService;
    private final StudentRoomService studentRoomService;
    private final TwinScanPopupAnnouncementMapper announcementMapper;
    private final TwinStudentViolationMapper violationMapper;
    private final AroPersonnelMapper aroPersonnelMapper;
    private final TwinDashboardAggregationService aggregationService;
    private final TwinDashboardMapper dashboardMapper;
    private final AroDatabaseMapper aroDatabaseMapper;
    private final MaterialService materialService;
    private final StudentCageShelfService cageShelfService;
    private final UserMapper userMapper;
    private final AuthContextService authContextService;
    private final TwinScanAppService twinScanAppService;
    private final StudentViolationService studentViolationService;
    private final MobileCenterAlertService mobileCenterAlertService;
    private final StudentActivityService studentActivityService;
    private final StudentNotificationService studentNotificationService;
    private final ScanDelayRequestService scanDelayRequestService;

    public StudentMobileCenterController(StudentMobileTokenService tokenService,
                                         StudentDashboardService dashboardService,
                                         StudentRoomService studentRoomService,
                                         TwinScanPopupAnnouncementMapper announcementMapper,
                                         TwinStudentViolationMapper violationMapper,
                                         AroPersonnelMapper aroPersonnelMapper,
                                         TwinDashboardAggregationService aggregationService,
                                         TwinDashboardMapper dashboardMapper,
                                         AroDatabaseMapper aroDatabaseMapper,
                                         MaterialService materialService,
                                         StudentCageShelfService cageShelfService,
                                         UserMapper userMapper,
                                         AuthContextService authContextService,
                                         TwinScanAppService twinScanAppService,
                                         StudentViolationService studentViolationService,
                                         MobileCenterAlertService mobileCenterAlertService,
                                         StudentActivityService studentActivityService,
                                         StudentNotificationService studentNotificationService,
                                         ScanDelayRequestService scanDelayRequestService) {
        this.tokenService = tokenService;
        this.dashboardService = dashboardService;
        this.studentRoomService = studentRoomService;
        this.announcementMapper = announcementMapper;
        this.violationMapper = violationMapper;
        this.aroPersonnelMapper = aroPersonnelMapper;
        this.aggregationService = aggregationService;
        this.dashboardMapper = dashboardMapper;
        this.aroDatabaseMapper = aroDatabaseMapper;
        this.materialService = materialService;
        this.cageShelfService = cageShelfService;
        this.userMapper = userMapper;
        this.authContextService = authContextService;
        this.twinScanAppService = twinScanAppService;
        this.studentViolationService = studentViolationService;
        this.mobileCenterAlertService = mobileCenterAlertService;
        this.studentActivityService = studentActivityService;
        this.studentNotificationService = studentNotificationService;
        this.scanDelayRequestService = scanDelayRequestService;
    }

    /** ======== 公开接口：token 直达学生中心（无需登录） ======== */
    @GetMapping("/api/public/mobile-center/{token}")
    @Operation(summary = "通过 token 获取学生中心数据（手机版，无需登录，含反分享检测）")
    public Result<Map<String, Object>> getMobileCenter(@PathVariable String token,
                                                       HttpServletRequest request) {
        String clientIp = getClientIp(request);
        String userId = tokenService.validateToken(token, clientIp);
        User user = userMapper.findById(userId);
        if (user == null) {
            return Result.fail(404, "用户不存在");
        }
        StudentDashboardResponse dashboard = dashboardService.buildDashboard(user);

        // 返回 token 过期时间，供手机端展示
        StudentMobileToken record = tokenService.getActiveToken(userId);
        String expiresAt = record != null && record.getExpiresAt() != null
                ? record.getExpiresAt().toString()
                : null;

        boolean html5Privilege = StudentMobileHtml5Privilege.isPrivileged(user);
        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("dashboard", dashboard);
        resp.put("expiresAt", expiresAt);
        resp.put("userId", userId);
        resp.put("html5PrivilegeBypass", html5Privilege);
        return Result.success(resp);
    }

    /**
     * 房间 Tab 全量数据：与小程序房间页同源
     * {@code GET /api/v1/twin/dashboard/wechat-overview} + {@code GET /api/v1/twin/scan/analyze}
     */
    @GetMapping("/api/public/mobile-center/{token}/room-dashboard")
    @Operation(summary = "房间页数据（wechat-overview + scan/analyze，手机版 token）")
    public Result<Map<String, Object>> getMobileRoomDashboard(@PathVariable String token,
                                                               HttpServletRequest request) {
        String clientIp = getClientIp(request);
        String userId = tokenService.validateToken(token, clientIp);
        User user = userMapper.findById(userId);
        if (user == null) {
            return Result.fail(404, "用户不存在");
        }

        List<RoomDashboardRenderDTO> overview = aggregationService.getWechatMiniProgramData(null);
        ScanAnalyzeResponseDTO analyze;
        try {
            analyze = twinScanAppService.analyzeScan(userId, null, null);
        } catch (Exception e) {
            log.warn("[MobileRoomDashboard] scan/analyze failed for userId={}: {}", userId, e.getMessage());
            analyze = new ScanAnalyzeResponseDTO();
            analyze.setSuccess(false);
            analyze.setMessage(e.getMessage());
        }

        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("overview", overview != null ? overview : List.of());
        resp.put("analyze", analyze);
        resp.put("userId", userId);
        return Result.success(resp);
    }

    /** ======== 公开接口：手机 token 提交延迟免冻结申请（与扫码弹窗同源） ======== */
    @PostMapping("/api/public/mobile-center/{token}/scan-delay/request")
    @Operation(summary = "手机 token 提交延迟免冻结申请")
    public Result<Map<String, Object>> submitScanDelayRequest(@PathVariable String token,
                                                               @RequestBody Map<String, Object> body,
                                                               HttpServletRequest request) {
        String clientIp = getClientIp(request);
        String userId = tokenService.validateToken(token, clientIp);
        User user = userMapper.findById(userId);
        if (user == null) {
            return Result.fail(404, "用户不存在");
        }
        try {
            String subjectUserId = body.get("subjectUserId") != null ? body.get("subjectUserId").toString() : null;
            String roomId = body.get("roomId") != null ? body.get("roomId").toString() : null;
            Long optionId = body.get("optionId") != null ? Long.parseLong(body.get("optionId").toString()) : null;
            String reviewerUserId = body.get("reviewerUserId") != null ? body.get("reviewerUserId").toString() : null;
            Map<String, Object> out = scanDelayRequestService.submitRequest(
                    subjectUserId, roomId, optionId, reviewerUserId, user.getId());
            return Result.success(out);
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        } catch (Exception e) {
            return Result.error("提交失败: " + e.getMessage());
        }
    }

    /** ======== 公开接口：获取学生房间列表（按 campus/floors 分组） ======== */
    @GetMapping("/api/public/mobile-center/{token}/rooms")
    @Operation(summary = "获取学生房间列表（按校区/楼层分组，手机版）")
    public Result<Map<String, Object>> getMobileRooms(@PathVariable String token,
                                                      @RequestParam(defaultValue = "all") String mode,
                                                      HttpServletRequest request) {
        String clientIp = getClientIp(request);
        String userId = tokenService.validateToken(token, clientIp);
        User user = userMapper.findById(userId);
        if (user == null) {
            return Result.fail(404, "用户不存在");
        }

        List<Map<String, Object>> flatList = new ArrayList<>();

        if ("mine".equals(mode)) {
            // 仅我的房间：ARO 权限匹配
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
                                flatList.add(buildMobileRoomItem(room, userId));
                                break;
                            }
                        }
                    }
                    log.info("[MobileRooms] ARO-matched {} rooms for userId={}", flatList.size(), userId);
                }
            } catch (Exception e) {
                log.warn("[MobileRooms] ARO room matching failed for userId={}: {}", userId, e.getMessage());
            }

            // 若 ARO 匹配为空，回退到 StudentRoomService
            if (flatList.isEmpty()) {
                try {
                    Map<String, Object> roomsResult = studentRoomService.getRooms(user, "1", null, null, null, 1, 200);
                    @SuppressWarnings("unchecked")
                    List<Map<String, Object>> svcList = (List<Map<String, Object>>) roomsResult.get("data");
                    if (svcList != null) flatList = svcList;
                    log.info("[MobileRooms] StudentRoomService returned {} rooms for userId={}", flatList.size(), userId);
                } catch (Exception e) {
                    log.warn("[MobileRooms] StudentRoomService failed for userId={}: {}", userId, e.getMessage());
                }
            }
        } else {
            // mode=all: 返回全部房间（浦东+浦西所有房间）
            try {
                List<RoomDashboardRenderDTO> allRooms = aggregationService.getWechatMiniProgramData(null);
                for (RoomDashboardRenderDTO room : allRooms) {
                    if (room.getRoomName() == null || room.getRoomName().isBlank()) continue;
                    flatList.add(buildMobileRoomItem(room, userId));
                }
                log.info("[MobileRooms] All rooms: {} total for userId={}", flatList.size(), userId);
            } catch (Exception e) {
                log.warn("[MobileRooms] All rooms query failed: {}", e.getMessage());
            }
        }

        // 按 campus → floor 分组
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

    /** 从 dashboard 数据构建手机端房间条目（与 debug-cards 页同源） */
    private Map<String, Object> buildMobileRoomItem(RoomDashboardRenderDTO room, String userId) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("roomId", String.valueOf(room.getRoomId()));
        item.put("roomName", room.getRoomName() != null ? room.getRoomName() : "");
        // 楼层标签：RoomFloorPrefixUtil（B1F 优先于 1F）
        item.put("floor", RoomFloorPrefixUtil.deriveFloorLabel(room.getRoomName()));
        // campus 与 debug-cards 页面的 activeTab 同源
        item.put("zone", room.getCampus() != null ? room.getCampus() : "其他");

        // 在馆人数 = 自带卡 + 公卡领借（与 debug-cards 页 totalOccupants 同源）
        int own = room.getCampusUserCount() != null ? room.getCampusUserCount() : 0;
        int borrowed = room.getBorrowedCardCount() != null ? room.getBorrowedCardCount() : 0;
        int occupants = own + borrowed;
        // 容量优先用 room_config.capacity，其次用 totalCapacity
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

    private int getRoomCapacity(String roomId) {
        try {
            Integer cap = dashboardMapper.getRoomCapacityByRoomId(roomId);
            return cap != null && cap > 0 ? cap : 20;
        } catch (Exception e) {
            return 20;
        }
    }

    /** ======== 公开接口：出入记录 ======== */
    @GetMapping("/api/public/mobile-center/{token}/access-records")
    @Operation(summary = "获取学生出入记录（分页）")
    public Result<Map<String, Object>> getMobileAccessRecords(@PathVariable String token,
                                                               @RequestParam(defaultValue = "1") int page,
                                                               @RequestParam(defaultValue = "20") int size,
                                                               HttpServletRequest request) {
        String clientIp = getClientIp(request);
        String userId = tokenService.validateToken(token, clientIp);
        User user = userMapper.findById(userId);
        if (user == null) return Result.fail(404, "用户不存在");

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

    /** ======== 公开接口：申领物品目录 + 我的申领记录 ======== */
    @GetMapping("/api/public/mobile-center/{token}/materials")
    @Operation(summary = "获取申领物品目录与学生申领记录")
    public Result<Map<String, Object>> getMobileMaterials(@PathVariable String token,
                                                           HttpServletRequest request) {
        String clientIp = getClientIp(request);
        String userId = tokenService.validateToken(token, clientIp);
        User user = userMapper.findById(userId);
        if (user == null) return Result.fail(404, "用户不存在");

        Map<String, Object> resp = new LinkedHashMap<>();
        try {
            // 物品分类
            var categories = materialService.listCategoriesForStudent();
            resp.put("categories", categories != null ? categories : List.of());
        } catch (Exception e) {
            log.warn("[MobileMaterials] categories failed: {}", e.getMessage());
            resp.put("categories", List.of());
        }
        try {
            // 全部物品（categoryId=null 返回全部）
            var items = materialService.listItemsForStudent(null);
            resp.put("items", items != null ? items : List.of());
        } catch (Exception e) {
            log.warn("[MobileMaterials] items failed: {}", e.getMessage());
            resp.put("items", List.of());
        }
        try {
            // 我的申领记录（最近20条）
            var mine = materialService.listMine(user, null, 1, 20);
            resp.put("myRequests", mine != null && mine.getData() != null ? mine.getData().getOrDefault("data", List.of()) : List.of());
        } catch (Exception e) {
            log.warn("[MobileMaterials] myRequests failed: {}", e.getMessage());
            resp.put("myRequests", List.of());
        }
        return Result.success(resp);
    }

    /** ======== 公开接口：提交物资申领（HTML5 学生中心 token，非 JWT） ======== */
    @PostMapping("/api/public/mobile-center/{token}/material/requests")
    @Operation(summary = "手机 token 提交物资申领")
    public Result<List<MaterialRequestView>> createMobileMaterialRequest(@PathVariable String token,
                                                                        @RequestBody CreateMaterialRequestReq req,
                                                                        HttpServletRequest request) {
        User user = resolveMobileUser(token, request);
        if (user == null) return Result.fail(404, "用户不存在");
        return materialService.createRequest(user, req);
    }

    /** ======== 公开接口：笼架管理 ======== */
    @GetMapping("/api/public/mobile-center/{token}/cage-shelves/filter-options")
    @Operation(summary = "笼架级联筛选选项")
    public Result<Map<String, Object>> getMobileCageFilterOptions(@PathVariable String token,
                                                                   @RequestParam(required = false) Integer campusId,
                                                                   @RequestParam(required = false) String areaId,
                                                                   @RequestParam(required = false) String floorId,
                                                                   @RequestParam(required = false) String roomId,
                                                                   HttpServletRequest request) {
        String clientIp = getClientIp(request);
        String userId = tokenService.validateToken(token, clientIp);
        User user = userMapper.findById(userId);
        if (user == null) return Result.fail(404, "用户不存在");
        return Result.success(cageShelfService.getFilterOptions(user, campusId, areaId, floorId, roomId));
    }

    @GetMapping("/api/public/mobile-center/{token}/cage-shelves/{shelveId}/detail")
    @Operation(summary = "笼架网格详情")
    public Result<Map<String, Object>> getMobileCageShelfDetail(@PathVariable String token,
                                                                  @PathVariable String shelveId,
                                                                  HttpServletRequest request) {
        String clientIp = getClientIp(request);
        String userId = tokenService.validateToken(token, clientIp);
        User user = userMapper.findById(userId);
        if (user == null) return Result.fail(404, "用户不存在");
        boolean html5Privilege = StudentMobileHtml5Privilege.isPrivileged(user);
        return Result.success(cageShelfService.getShelfDetail(user, shelveId, html5Privilege));
    }

    @GetMapping("/api/public/mobile-center/{token}/cage-shelves/special-status-overview")
    @Operation(summary = "特殊状态总览（手机 token：学生按课题组过滤，教职工 STAFF+ 全量）")
    public Result<Map<String, Object>> getMobileCageSpecialStatusOverview(@PathVariable String token,
                                                                             HttpServletRequest request) {
        String clientIp = getClientIp(request);
        String userId = tokenService.validateToken(token, clientIp);
        User user = userMapper.findById(userId);
        if (user == null) return Result.fail(404, "用户不存在");
        boolean html5Privilege = StudentMobileHtml5Privilege.isPrivileged(user);
        return Result.success(cageShelfService.getSpecialStatusOverview(user, html5Privilege));
    }

    @GetMapping("/api/public/mobile-center/{token}/cage-shelves/{shelveId}/cells/{x}/{y}/annotation")
    @Operation(summary = "获取笼位标注（手机 token）")
    public Result<Map<String, Object>> getMobileCellAnnotation(@PathVariable String token,
                                                                 @PathVariable String shelveId,
                                                                 @PathVariable int x,
                                                                 @PathVariable int y,
                                                                 HttpServletRequest request) {
        String clientIp = getClientIp(request);
        String userId = tokenService.validateToken(token, clientIp);
        User user = userMapper.findById(userId);
        if (user == null) return Result.fail(404, "用户不存在");
        try {
            return Result.success(cageShelfService.getAnnotation(user, shelveId, x, y));
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }

    @PutMapping("/api/public/mobile-center/{token}/cage-shelves/{shelveId}/cells/{x}/{y}/annotation")
    @Operation(summary = "保存笼位标注（手机 token）")
    public Result<?> saveMobileCellAnnotation(@PathVariable String token,
                                              @PathVariable String shelveId,
                                              @PathVariable int x,
                                              @PathVariable int y,
                                              @RequestBody Map<String, String> body,
                                              HttpServletRequest request) {
        String clientIp = getClientIp(request);
        String userId = tokenService.validateToken(token, clientIp);
        User user = userMapper.findById(userId);
        if (user == null) return Result.fail(404, "用户不存在");
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

    @GetMapping("/api/public/mobile-center/{token}/violations")
    @Operation(summary = "获取学生违规记录（手机版 token）")
    public Result<Map<String, Object>> getMobileViolations(@PathVariable String token,
                                                           @RequestParam(defaultValue = "1") int page,
                                                           @RequestParam(defaultValue = "20") int size,
                                                           HttpServletRequest request) {
        String clientIp = getClientIp(request);
        String userId = tokenService.validateToken(token, clientIp);
        User user = userMapper.findById(userId);
        if (user == null) {
            return Result.fail(404, "用户不存在");
        }
        Map<String, Object> data = studentViolationService.getViolations(user, page, size, "", "");
        return Result.success(data);
    }

    @GetMapping("/api/public/mobile-center/{token}/cage-shelves/all")
    @Operation(summary = "获取课题组全部笼架（无需筛选）")
    public Result<Map<String, Object>> getMobileCageAllShelves(@PathVariable String token,
                                                                HttpServletRequest request) {
        String clientIp = getClientIp(request);
        String userId = tokenService.validateToken(token, clientIp);
        User user = userMapper.findById(userId);
        if (user == null) return Result.fail(404, "用户不存在");

        boolean html5Privilege = StudentMobileHtml5Privilege.isPrivileged(user);
        List<Map<String, Object>> allShelves = cageShelfService.listAllShelvesForMobile(user, html5Privilege);

        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("shelves", allShelves);
        resp.put("totalCount", allShelves.size());
        try {
            String scannedAt = cageShelfService.getLatestSnapshotScannedAt();
            if (scannedAt != null && !scannedAt.isBlank()) {
                resp.put("scannedAt", scannedAt);
            }
        } catch (Exception ignored) { /* 非关键 */ }
        return Result.success(resp);
    }

    @GetMapping("/api/public/mobile-center/{token}/cage-shelves/pinned")
    @Operation(summary = "笼架收藏列表")
    public Result<List<Map<String, Object>>> getMobileCagePinned(@PathVariable String token,
                                                                   HttpServletRequest request) {
        String clientIp = getClientIp(request);
        String userId = tokenService.validateToken(token, clientIp);
        User user = userMapper.findById(userId);
        if (user == null) return Result.fail(404, "用户不存在");
        return Result.success(cageShelfService.getPinnedShelves(user));
    }

    /** ======== 公开接口：获取公告 + 违规提醒（扫码弹窗公告源） ======== */
    @GetMapping("/api/public/mobile-center/{token}/alerts")
    @Operation(summary = "获取公告与违规提醒（手机版，含交互式验证限制提示）")
    public Result<Map<String, Object>> getMobileAlerts(@PathVariable String token,
                                                       HttpServletRequest request) {
        String clientIp = getClientIp(request);
        String userId = tokenService.validateToken(token, clientIp);
        User user = userMapper.findById(userId);
        if (user == null) {
            return Result.fail(404, "用户不存在");
        }

        boolean html5Privilege = StudentMobileHtml5Privilege.isPrivileged(user);
        Map<String, Object> resp = mobileCenterAlertService.buildAlerts(userId, html5Privilege);
        resolveAnnouncementImages(resp.get("announcements"));
        resolveAnnouncementImages(resp.get("items"));
        return Result.success(resp);
    }

    @PostMapping("/api/public/mobile-center/{token}/alerts/read-all")
    @Operation(summary = "将所有反馈类通知标记为已读（手机版 token）")
    public Result<Void> markAlertsReadAll(@PathVariable String token,
                                           HttpServletRequest request) {
        String clientIp = getClientIp(request);
        String userId = tokenService.validateToken(token, clientIp);
        User user = userMapper.findById(userId);
        if (user == null) {
            return Result.fail(404, "用户不存在");
        }
        studentNotificationService.markAllRead(user);
        return Result.success(null);
    }

    @PostMapping("/api/public/mobile-center/{token}/notice-auto-suppress")
    @Operation(summary = "手机 H5：下次不再自动弹出（与扫码弹窗 suppress 同源）")
    public Result<Map<String, Object>> suppressMobileNoticeAutoOpen(@PathVariable String token,
                                                                     @RequestBody Map<String, Object> body,
                                                                     HttpServletRequest request) {
        String clientIp = getClientIp(request);
        String userId = tokenService.validateToken(token, clientIp);
        User user = userMapper.findById(userId);
        if (user == null) {
            return Result.fail(404, "用户不存在");
        }
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
            return Result.success(mobileCenterAlertService.suppressNoticeAutoOpen(userId, noticeKind, recordId));
        } catch (IllegalArgumentException e) {
            return Result.fail(400, e.getMessage());
        } catch (Exception e) {
            log.warn("[MobileCenter] notice-auto-suppress failed userId={}: {}", userId, e.getMessage());
            return Result.error("保存失败: " + e.getMessage());
        }
    }

    @SuppressWarnings("unchecked")
    private void resolveAnnouncementImages(Object listObj) {
        if (!(listObj instanceof List<?> list)) {
            return;
        }
        for (Object row : list) {
            if (row instanceof Map<?, ?> item) {
                if ("announcement".equals(item.get("kind")) && item.get("contentHtml") instanceof String html) {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> mutable = (Map<String, Object>) item;
                    mutable.put("contentHtml", resolveContentImageUrls(html));
                }
            }
        }
    }

    /** ======== 公开接口：课题组活跃度（与学生中心 home 同源） ======== */
    @GetMapping("/api/public/mobile-center/{token}/group-activity/summary")
    @Operation(summary = "课题组活跃度 KPI（手机 token）")
    public Result<Map<String, Object>> getMobileGroupActivitySummary(@PathVariable String token,
                                                                      @RequestParam(required = false) String groupName,
                                                                      @RequestParam String startTime,
                                                                      @RequestParam String endTime,
                                                                      @RequestParam(defaultValue = "all") String campus,
                                                                      HttpServletRequest request) {
        User user = resolveMobileUser(token, request);
        if (user == null) return Result.fail(404, "用户不存在");
        String resolvedGroup = resolveProjectGroupName(user, groupName);
        return Result.success(studentActivityService.summary(resolvedGroup, startTime, endTime, campus));
    }

    @GetMapping("/api/public/mobile-center/{token}/group-activity/members")
    @Operation(summary = "课题组成员活跃度（手机 token）")
    public Result<Map<String, Object>> getMobileGroupActivityMembers(@PathVariable String token,
                                                                      @RequestParam(required = false) String groupName,
                                                                      @RequestParam String startTime,
                                                                      @RequestParam String endTime,
                                                                      @RequestParam(defaultValue = "entries") String sortBy,
                                                                      @RequestParam(defaultValue = "desc") String order,
                                                                      @RequestParam(defaultValue = "1") int page,
                                                                      @RequestParam(defaultValue = "10") int size,
                                                                      HttpServletRequest request) {
        User user = resolveMobileUser(token, request);
        if (user == null) return Result.fail(404, "用户不存在");
        String resolvedGroup = resolveProjectGroupName(user, groupName);
        return Result.success(studentActivityService.queryMemberActivity(
                resolvedGroup, startTime, endTime, sortBy, order, page, size));
    }

    @GetMapping("/api/public/mobile-center/{token}/group-activity/heatmap")
    @Operation(summary = "课题组进出时段热力图（手机 token）")
    public Result<List<Map<String, Object>>> getMobileGroupActivityHeatmap(@PathVariable String token,
                                                                            @RequestParam(required = false) String groupName,
                                                                            @RequestParam String startTime,
                                                                            @RequestParam String endTime,
                                                                            HttpServletRequest request) {
        User user = resolveMobileUser(token, request);
        if (user == null) return Result.fail(404, "用户不存在");
        String resolvedGroup = resolveProjectGroupName(user, groupName);
        return Result.success(studentActivityService.heatmap(resolvedGroup, startTime, endTime));
    }

    @GetMapping("/api/public/mobile-center/{token}/group-activity/room-usage")
    @Operation(summary = "课题组喜好进出房间排行（手机 token）")
    public Result<List<Map<String, Object>>> getMobileGroupActivityRoomUsage(@PathVariable String token,
                                                                              @RequestParam(required = false) String groupName,
                                                                              @RequestParam String startTime,
                                                                              @RequestParam String endTime,
                                                                              HttpServletRequest request) {
        User user = resolveMobileUser(token, request);
        if (user == null) return Result.fail(404, "用户不存在");
        String resolvedGroup = resolveProjectGroupName(user, groupName);
        return Result.success(studentActivityService.roomUsage(resolvedGroup, startTime, endTime));
    }

    /** ======== 获取当前活跃 token 信息（管理端 / 人员库） ======== */
    @GetMapping("/api/admin/student-mobile-token/{userId}")
    @Operation(summary = "获取学生当前活跃 token 信息（含过期时间）")
    public Result<Map<String, Object>> getTokenInfo(@PathVariable String userId,
                                                    HttpServletRequest request) {
        return getTokenInfoForUser(userId, request);
    }

    /** ======== 扫码弹窗：任意已登录账号可为被扫学生生成/查看直达 token ======== */
    @GetMapping("/api/scan/student-mobile-token/{userId}")
    @Operation(summary = "扫码端获取学生手机直达 token（任意已登录用户）")
    public Result<Map<String, Object>> getScanTokenInfo(@PathVariable String userId,
                                                        HttpServletRequest request) {
        return getTokenInfoForUser(userId, request);
    }

    /** ======== 生成/刷新 token（管理端） ======== */
    @PostMapping("/api/admin/student-mobile-token/generate")
    @Operation(summary = "生成或刷新学生的手机端直达 token（旧 token 全部失效）")
    public Result<Map<String, Object>> generateToken(@RequestBody Map<String, Object> body,
                                                     HttpServletRequest request) {
        return generateTokenForUser(body, request);
    }

    @PostMapping("/api/scan/student-mobile-token/generate")
    @Operation(summary = "扫码端生成/刷新学生手机直达 token（任意已登录用户）")
    public Result<Map<String, Object>> generateScanToken(@RequestBody Map<String, Object> body,
                                                         HttpServletRequest request) {
        return generateTokenForUser(body, request);
    }

    private Result<Map<String, Object>> getTokenInfoForUser(String userId, HttpServletRequest request) {
        User currentUser = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (currentUser == null) {
            return Result.fail(401, "未登录");
        }
        StudentMobileToken record = tokenService.getActiveToken(userId);
        if (record == null) {
            return Result.success(Map.of("hasToken", false));
        }
        Map<String, Object> info = new LinkedHashMap<>();
        info.put("hasToken", true);
        info.put("token", record.getToken());
        info.put("expiresAt", record.getExpiresAt() != null ? record.getExpiresAt().toString() : null);
        info.put("createdAt", record.getCreatedAt() != null ? record.getCreatedAt().toString() : null);
        return Result.success(info);
    }

    private Result<Map<String, Object>> generateTokenForUser(Map<String, Object> body,
                                                            HttpServletRequest request) {
        User currentUser = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (currentUser == null) {
            return Result.fail(401, "未登录");
        }
        Object rawUserId = body.get("userId");
        if (rawUserId == null) {
            return Result.fail(400, "userId 不能为空");
        }
        String userId = rawUserId.toString();

        int durationDays = 3;
        if (body.get("durationDays") instanceof Number n) {
            durationDays = Math.max(1, n.intValue());
        }

        String token = tokenService.generateToken(userId, durationDays);
        LocalDateTime expiresAt = LocalDateTime.now().plusDays(durationDays);

        log.info("User {} generated mobile token for userId={}, expiresAt={}",
                currentUser.getId(), userId, expiresAt);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("token", token);
        result.put("userId", userId);
        result.put("expiresAt", expiresAt.toString());
        result.put("durationDays", durationDays);
        return Result.success(result);
    }

    @Value("${app.public-base-url:}")
    private String appPublicBaseUrl;

    // ---- 图片 URL 解析 ----

    private static final Pattern IMG_SRC = Pattern.compile("<img\\s+[^>]*src\\s*=\\s*[\"']([^\"']+)[\"']", Pattern.CASE_INSENSITIVE);

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
        // 已经是绝对 URL 或 cloud:// 协议（浏览器无法加载，保留原样）
        if (u.matches("(?i)^https?://.*") || u.startsWith("cloud://") || u.startsWith("data:")) {
            return u;
        }
        // 相对路径补全
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

    // ---- 工具 ----

    private User resolveMobileUser(String token, HttpServletRequest request) {
        String clientIp = getClientIp(request);
        String userId = tokenService.validateToken(token, clientIp);
        return userMapper.findById(userId);
    }

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
            log.warn("[MobileGroupActivity] resolve group failed for userId={}: {}", user.getId(), e.getMessage());
        }
        return requestedGroup != null ? requestedGroup.trim() : "";
    }

    private String getClientIp(HttpServletRequest request) {
        String ip = request.getHeader("X-Forwarded-For");
        if (ip != null && !ip.isBlank()) {
            return ip.split(",")[0].trim();
        }
        ip = request.getHeader("X-Real-IP");
        if (ip != null && !ip.isBlank()) {
            return ip.trim();
        }
        return request.getRemoteAddr();
    }
}
