package com.example.demo.modules.twin.dashboard.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.aro.service.AroPersonnelDatabaseService;
import com.example.demo.modules.twin.common.dto.GroupedOrderAdminResponseDTO;
import com.example.demo.modules.twin.common.dto.ListMapDataResponseDTO;
import com.example.demo.modules.twin.common.dto.MapDataResponseDTO;
import com.example.demo.modules.twin.common.dto.PagedDataResponseDTO;
import com.example.demo.modules.twin.common.dto.SimpleMessageResponseDTO;
import com.example.demo.modules.aro.service.AroService;
import com.example.demo.modules.twin.dashboard.service.TwinDashboardService;
import com.example.demo.modules.twin.dashboard.service.TwinPredictionEngineService;
import com.example.demo.modules.twin.common.service.TwinAsyncTaskService;
import com.example.demo.modules.twin.scan.service.TwinScanService;
import com.example.demo.modules.twin.common.service.PersonnelAvatarProxyService;
import com.example.demo.modules.twin.common.service.TwinAutomationLogService;
import com.example.demo.modules.twin.common.entity.TwinAutomationLog;
import com.example.demo.modules.twin.dashboard.service.TwinDashboardAggregationService;
import com.example.demo.modules.twin.common.dto.RoomDashboardRenderDTO;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import com.example.demo.common.time.BusinessTimeWindow;
import com.example.demo.modules.twin.common.mapper.TwinDashboardMapper;
import com.example.demo.modules.auth.entity.UserAroBinding;
import com.example.demo.modules.auth.mapper.UserAroBindingMapper;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/twin/dashboard")

public class TwinApiController {

    private static final Logger log = LoggerFactory.getLogger(TwinApiController.class);

    @Autowired
    private TwinDashboardService dashboardService;

    @Autowired
    private TwinDashboardMapper dashboardMapper;

    @Autowired
    private BusinessTimeWindow businessTimeWindow;

    @Autowired
    private TwinAutomationLogService twinAutomationLogService;

    @Autowired
    private AroService aroService;

    @Autowired
    private UserAroBindingMapper userAroBindingMapper;

    @Autowired
    private AroPersonnelDatabaseService personnelDbService;

    @Autowired
    private com.example.demo.modules.twin.rpg.service.RpgEngineService rpgEngineService;

    @Autowired private TwinPredictionEngineService predictionEngineService;
    @Autowired private TwinAsyncTaskService twinAsyncTaskService;
    @Autowired private TwinDashboardAggregationService aggregationService;

    @Autowired
    private PersonnelAvatarProxyService personnelAvatarProxyService;

    @Autowired
    private com.example.demo.modules.twin.common.service.JobSchedulerService jobSchedulerService;

    @Autowired
    private com.example.demo.modules.twin.dashboard.service.RankingSnapshotService rankingSnapshotService;

    /**
     * 同源代理 ARO 人员头像。优先使用 {@code /h/{base64}}，避免超长 query。
     */
    @GetMapping("/proxy/personnel-avatar")
    public ResponseEntity<byte[]> proxyPersonnelAvatar(@RequestParam("url") String url) {
        return proxyPersonnelAvatarInternal(url);
    }

    @GetMapping("/proxy/personnel-avatar/h/{encoded:.+}")
    public ResponseEntity<byte[]> proxyPersonnelAvatarPath(@PathVariable("encoded") String encoded) {
        String url = PersonnelAvatarProxyService.decodeUrlFromPathSegment(encoded);
        if (url == null) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).build();
        }
        return proxyPersonnelAvatarInternal(url);
    }

    private ResponseEntity<byte[]> proxyPersonnelAvatarInternal(String url) {
        try {
            PersonnelAvatarProxyService.ProxiedImage out = personnelAvatarProxyService.fetchAllowed(url);
            if (out == null) {
                return ResponseEntity.status(HttpStatus.BAD_REQUEST).build();
            }
            MediaType mt = MediaType.parseMediaType(out.contentType());
            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_TYPE, mt.toString())
                    .cacheControl(CacheControl.maxAge(PersonnelAvatarProxyService.cacheMaxAgeSeconds(), java.util.concurrent.TimeUnit.SECONDS).cachePublic())
                    .body(out.bytes());
        } catch (Exception e) {
            log.warn("personnel-avatar proxy failed: {}", e.toString());
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY).build();
        }
    }

    // 💥 暴露 Debug 接口
    @GetMapping("/debug/logs")
    public Result<ListMapDataResponseDTO> getDebugLogs() {
        return Result.success(new ListMapDataResponseDTO(dashboardMapper.getDebugLogs()));
    }

    // 💥 添加这个测试接口
    @GetMapping("/debug/sync-personnel")
    public Result<SimpleMessageResponseDTO> manualSyncPersonnel() {
        twinAsyncTaskService.syncPersonnelAsync();
        return Result.success(new SimpleMessageResponseDTO("已在后台启动人员全量收割机，请查看 IDEA 控制台日志！"));
    }

    // 💥 分页查询人员档案库
    @GetMapping("/debug/personnel/list")
    public Result<PagedDataResponseDTO<Map<String, Object>>> getDebugPersonnelList(@RequestParam(defaultValue = "1") int page,
                                                                                    @RequestParam(defaultValue = "100") int size) {
        int offset = (page - 1) * size;
        List<Map<String, Object>> list = dashboardMapper.getDebugPersonnelList(size, offset);
        int total = dashboardMapper.getPersonnelTotalCount();
        return Result.success(new PagedDataResponseDTO<>(list, total));
    }

    // 💥 异常滞留追踪专线 API (已升级：支持浦东/浦西校区动态切换)
    @GetMapping("/retention-warnings")
    public Result<ListMapDataResponseDTO> getRetentionWarnings(
            @RequestParam(defaultValue = "15") int limit,
            @RequestParam(defaultValue = "浦东") String areaName) { // 🟢 1. 核心修改：增加 areaName 参数，默认值为"浦东"
        // 2. 🟢 核心修改：将 areaName 传给 Mapper 进行数据库过滤
        BusinessTimeWindow.Window day = businessTimeWindow.todayWindow();
        List<Map<String, Object>> rawWarnings = dashboardMapper.getActiveRetentionWarnings(
                limit, areaName, day.startInclusive(), day.endExclusive());
        List<Map<String, Object>> processedData = new ArrayList<>();
        DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
        java.time.ZoneId zone = businessTimeWindow.getZoneId();
        for (Map<String, Object> warning : rawWarnings) {
            try {
                // A. 解析入场时间
                String enterTimeStr = (String) warning.get("enterTime");
                LocalDateTime realEntryTime = LocalDateTime.parse(enterTimeStr.substring(0, 19), formatter);
                // B. 业务时区当前时刻（与流水日界一致）
                LocalDateTime currentNow = LocalDateTime.now(zone);
                // 从 SQL 中提取预估画像数据
                Object medianObj = warning.get("aiDurationMins");
                Object probObj = warning.get("aiOvertimeProb");
                int medianMins = medianObj != null ? ((Number) medianObj).intValue() : 120;
                double prob = probObj != null ? ((Number) probObj).doubleValue() : 0.0;
                // C. 喂给引擎计算智能离开时间
                // 引擎内部的"软天花板"逻辑对全校区通用
                boolean authorized = false;
                Object permObj = warning.get("hasOfficialRoomPermission");
                if (permObj == null) permObj = warning.get("has_official_room_permission");
                if (permObj instanceof Number) {
                    authorized = ((Number) permObj).intValue() == 1;
                } else if (permObj != null) {
                    String ps = String.valueOf(permObj);
                    authorized = "1".equals(ps) || "true".equalsIgnoreCase(ps);
                }
                if (!authorized && warning.get("userId") != null) {
                    authorized = predictionEngineService.isUserOfficialAuthorized(String.valueOf(warning.get("userId")));
                }
                LocalDateTime smartExitTime = predictionEngineService.calculateSmartExitTime(
                        realEntryTime, medianMins, prob, currentNow, authorized
                );
                // D. 算出被引力压缩或滑动延期后的最终分钟数
                long finalAiDurationMins = Duration.between(realEntryTime, smartExitTime).toMinutes();
                warning.put("aiDurationMins", (int) finalAiDurationMins);
                processedData.add(warning);
            } catch (Exception e) {
                processedData.add(warning);
            }
        }
        return Result.success(new ListMapDataResponseDTO(processedData));
    }

    /**
     * 🏆 API 1：多维度课题组排行榜
     * @param timeType "TODAY" (本日), "WEEK" (本周), "MONTH" (本月)
     * @param region "TOTAL" (总榜), "PUDONG" (浦东), "PUXI" (浦西)
     */
    @GetMapping("/ranking")
    public Result<ListMapDataResponseDTO> getGroupRanking(
            @RequestParam(defaultValue = "TODAY") String timeType,
            @RequestParam(defaultValue = "TOTAL") String region) {
        return Result.success(new ListMapDataResponseDTO(dashboardService.getGroupRanking(timeType, region)));
    }

    /**
     * ⏱ 大屏排行榜轮询间隔配置（公开接口，供前端读取定时管理中的 pollIntervalSeconds）
     */
    @GetMapping("/ranking-poll-config")
    public Result<Map<String, Object>> getRankingPollConfig() {
        Map<String, Object> config = new HashMap<>();
        config.put("activityIntervalSeconds",
                jobSchedulerService.getRankingPollIntervalSeconds(
                        com.example.demo.modules.twin.common.service.JobExecutionRegistry.JOB_DASHBOARD_RANKING_ACTIVITY, 300));
        config.put("animalIntervalSeconds",
                jobSchedulerService.getRankingPollIntervalSeconds(
                        com.example.demo.modules.twin.common.service.JobExecutionRegistry.JOB_DASHBOARD_RANKING_ANIMAL, 1800));
        return Result.success(config);
    }

    // ============================================================
    // 📸 排行榜趋势快照（每次刷新保存，用于计算 ▲/▼）
    // ============================================================

    @GetMapping("/ranking-snapshot")
    public Result<List<Map<String, Object>>> getRankingSnapshot(@RequestParam String key) {
        return Result.success(rankingSnapshotService.getSnapshot(key));
    }

    @PutMapping("/ranking-snapshot")
    public Result<Map<String, Object>> saveRankingSnapshot(@RequestParam String key,
                                                            @RequestBody List<Map<String, Object>> data) {
        if (!rankingSnapshotService.saveSnapshot(key, data)) {
            return Result.error("保存快照失败");
        }
        return Result.success(Map.of("ok", true));
    }

    /**
     * 确保当日凌晨基线可用：本月截至今日 00:00 前的排名；若快照缺失或类型不对则自动重建。
     */
    @PostMapping("/ranking-snapshot/ensure")
    public Result<List<Map<String, Object>>> ensureRankingSnapshot(@RequestParam String region) {
        return Result.success(rankingSnapshotService.ensureTodayActivityBaseline(region));
    }

    /**
     * 📊 API 2：今日房间活跃度饼图 & 区域总进出人次
     */
    @GetMapping("/pie-chart")
    public Result<MapDataResponseDTO> getPieChart() {
        return Result.success(new MapDataResponseDTO(dashboardService.getTodayRoomStats()));
    }

    /**
     * 📈 API 3：今日进出高峰 27 刻度折线图
     */
    @GetMapping("/line-chart")
    public Result<MapDataResponseDTO> getLineChart() {
        return Result.success(new MapDataResponseDTO(dashboardService.getTodayLineChart()));
    }

    // 💥 流水专用：大屏实时流水专属搜索 API (支持深水炸弹限流模式！)
    @GetMapping("/realtime-feed/search")
    public Result<ListMapDataResponseDTO> searchRealtimeFeed(@RequestParam String keyword,
                                                             @RequestParam(defaultValue = "20") int limit) {
        try {
            // 这里调用查询 access_log 的 Mapper 方法
            return Result.success(new ListMapDataResponseDTO(dashboardMapper.searchAccessLogs(keyword, limit)));
        } catch (Exception e) {
            return Result.error("流水搜索失败: " + e.getMessage());
        }
    }

    @GetMapping("/stats")
    public Result<MapDataResponseDTO> getDashboardStats() {
        return Result.success(new MapDataResponseDTO(dashboardService.generateRealDashboardStats()));
    }

    @GetMapping("/debug/logs/list")
    public Result<PagedDataResponseDTO<Map<String, Object>>> getDebugLogList(@RequestParam(defaultValue = "1") int page,
                                                                              @RequestParam(defaultValue = "100") int size) {
        int offset = (page - 1) * size;
        List<Map<String, Object>> list = dashboardMapper.getDebugLogList(size, offset);
        int total = dashboardMapper.getLogTotalCount();
        return Result.success(new PagedDataResponseDTO<>(list, total));
    }

    // 🌀 接口 4：获取混合实时流（含待签退中间态 PENDING_EXIT 注入）
    @GetMapping("/realtime-feed")
    public Result<ListMapDataResponseDTO> getRealtimeFeed(@RequestParam(defaultValue = "50") int limit) {
        List<Map<String, Object>> feed = new ArrayList<>(dashboardMapper.getRealtimeFeed(limit));

        // 注入 PENDING_EXIT 中间态：待签退倒计时中但尚未实际签退的人员
        try {
            List<Map<String, Object>> countdowns = dashboardMapper.getActiveSignoutCountdowns();
            if (countdowns != null && !countdowns.isEmpty()) {
                // 构建今日 ENTER 快照 lookup（用 BusinessTimeWindow 对齐滞留监控口径）
                List<String> userIds = new ArrayList<>();
                for (Map<String, Object> cd : countdowns) {
                    String uid = String.valueOf(cd.getOrDefault("userId", ""));
                    if (!uid.isBlank()) userIds.add(uid);
                }
                Map<String, Map<String, Object>> snapshotByUser = new HashMap<>();
                if (!userIds.isEmpty()) {
                    BusinessTimeWindow.Window day = businessTimeWindow.todayWindow();
                    List<Map<String, Object>> snaps = dashboardMapper.getTodayEnterSnapshotsByUserIds(
                            userIds, day.startInclusive(), day.endExclusive());
                    if (snaps != null) {
                        for (Map<String, Object> snap : snaps) {
                            String uid = String.valueOf(snap.getOrDefault("userId", ""));
                            if (!uid.isBlank()) {
                                snapshotByUser.putIfAbsent(uid, snap);
                            }
                        }
                    }
                }

                LocalDateTime now = LocalDateTime.now();
                DateTimeFormatter dtf = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
                for (Map<String, Object> cd : countdowns) {
                    String userId = String.valueOf(cd.getOrDefault("userId", ""));
                    if (userId.isBlank()) continue;

                    // 计算剩余秒数
                    String scheduledStr = String.valueOf(cd.getOrDefault("scheduledExitAt", ""));
                    long remainingSeconds = 0;
                    try {
                        String normalized = scheduledStr.length() >= 19 ? scheduledStr.substring(0, 19) : scheduledStr;
                        LocalDateTime scheduled = LocalDateTime.parse(normalized, dtf);
                        remainingSeconds = Duration.between(now, scheduled).getSeconds();
                    } catch (Exception ignored) {
                        // 日期解析失败则剩余秒数为 0
                    }

                    Map<String, Object> snap = snapshotByUser.get(userId);

                    Map<String, Object> entry = new LinkedHashMap<>();
                    entry.put("eventId", "pending-" + userId);
                    entry.put("action", "PENDING_EXIT");
                    entry.put("userId", userId);
                    entry.put("userName", snap != null ? snap.getOrDefault("userName", "") : "");
                    entry.put("groupName", snap != null ? snap.getOrDefault("groupName", "") : "");
                    entry.put("areaName", snap != null ? snap.getOrDefault("areaName", "") : "");
                    entry.put("roomName", snap != null ? snap.getOrDefault("roomName", "") : "");
                    entry.put("roomId", snap != null ? snap.getOrDefault("roomId", "") : "");
                    entry.put("scheduledExitAt", scheduledStr);
                    entry.put("countdownSeconds", Math.max(0, (int) remainingSeconds));
                    entry.put("timestamp", "");
                    entry.put("create_time", "");

                    feed.add(0, entry);
                }
            }
        } catch (Exception e) {
            log.warn("注入待签退中间态条目失败: {}", e.getMessage());
        }

        return Result.success(new ListMapDataResponseDTO(feed));
    }

    private static final DateTimeFormatter ANCHOR_TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    /**
     * 进出流水详情弹窗：按用户与刷卡时间拉取附近自动化审计（与 twin_automation_log 联动）。
     */
    @GetMapping("/automation-logs-near")
    public Result<List<TwinAutomationLog>> automationLogsNear(
            @RequestParam String userId,
            @RequestParam String anchorTime,
            @RequestParam(defaultValue = "25") int windowMinutes,
            @RequestParam(defaultValue = "12") int limit,
            @RequestParam(defaultValue = "true") boolean excludePenetrationPoll
    ) {
        if (userId == null || userId.isBlank()) {
            return Result.error("userId 不能为空");
        }
        if (anchorTime == null || anchorTime.isBlank()) {
            return Result.error("anchorTime 不能为空");
        }
        try {
            LocalDateTime anchor = LocalDateTime.parse(anchorTime.trim(), ANCHOR_TIME);
            return Result.success(twinAutomationLogService.listNearForUser(
                    userId.trim(), anchor, windowMinutes, limit, excludePenetrationPoll));
        } catch (DateTimeParseException e) {
            return Result.error("anchorTime 须为 yyyy-MM-dd HH:mm:ss");
        }
    }

    // 💥 人员专用：人员档案专属搜索 API (支持分页)
    @GetMapping("/personnel/search")
    public Result<Map<String, Object>> searchPersonnel(
            @RequestParam String keyword,
            @RequestParam(defaultValue = "20") int limit,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size) {
        try {
            int offset = (page - 1) * size;
            List<Map<String, Object>> local = dashboardMapper.searchPersonnelPaged(keyword, size, offset);
            int total = dashboardMapper.countPersonnel(keyword);

            // 先查本地 aro_personnel（快）；若为空则回源 ARO 官方兜底
            if (total == 0) {
                List<Map<String, Object>> remote = aroService.searchPersonnelLite(keyword, limit);
                Map<String, Object> result = new HashMap<>();
                if (remote == null || remote.isEmpty()) {
                    result.put("data", List.of());
                    result.put("total", 0);
                } else {
                    int remoteTotal = remote.size();
                    int fromIndex = Math.min(offset, remoteTotal);
                    int toIndex = Math.min(offset + size, remoteTotal);
                    List<Map<String, Object>> pagedRemote = remote.subList(fromIndex, toIndex);
                    result.put("data", pagedRemote);
                    result.put("total", remoteTotal);
                }
                result.put("page", page);
                result.put("size", size);
                return Result.success(result);
            }

            Map<String, Object> result = new HashMap<>();
            result.put("data", local);
            result.put("total", total);
            result.put("page", page);
            result.put("size", size);
            return Result.success(result);
        } catch (Exception e) {
            return Result.error("人员搜索失败: " + e.getMessage());
        }
    }

    @GetMapping("/user-status")
    public Result<?> getUserStatus(@RequestParam String userId) {
        // 💥 加上这一行探针
        log.info("前端成功呼叫风控接口，拿到的 userId 是: {}", userId);

        Map<String, Object> data = aroService.getUserDetailAndDisciplinary(resolveAroUserId(userId));
        return Result.success(data);
    }

    /** 教职工（STAFF_ 前缀）转成 aro_user_id（ARO 接口只认 19 位数字）；学生/无绑定则原样返回。 */
    private String resolveAroUserId(String userId) {
        if (userId == null || userId.isBlank()) return userId;
        String uid = userId.trim();
        if (!uid.startsWith("STAFF_")) return uid;
        try {
            UserAroBinding binding = userAroBindingMapper.selectByUserId(uid);
            if (binding != null && binding.getAroUserId() != null && !binding.getAroUserId().isBlank()) {
                return binding.getAroUserId();
            }
        } catch (Exception e) {
            log.warn("[dashboard] staff_id→aro 转换失败 id={} err={}", uid, e.getMessage());
        }
        return uid;
    }

    // 💥 核武器：已废弃，请使用 GET /api/v1/twin/rpg/recalculate-all
    @Deprecated
    @GetMapping("/debug/recalc-exp")
    public Result<MapDataResponseDTO> recalculateAllExp() {
        return Result.success(new MapDataResponseDTO(rpgEngineService.recalculateAllExp()));
    }

    // =====================================================================
    // 📊 BI 数据指挥中心：多维过滤流水列表
    // =====================================================================
    @GetMapping("/debug/logs/filter")
    public Result<PagedDataResponseDTO<Map<String, Object>>> getFilteredDebugLogs(
            @RequestParam(required = false) String campus, // 💥 新增
            @RequestParam(required = false) String floor,  // 💥 新增
            @RequestParam(required = false) String keyword, // 💥 新增接收 keyword
            @RequestParam(required = false) String startTime,
            @RequestParam(required = false) String endTime,
            @RequestParam(required = false) Integer actionType,
            @RequestParam(required = false) String roomName,
            @RequestParam(defaultValue = "true") Boolean excludeBlacklist,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "100") int size) {

        int offset = (page - 1) * size;

        // 💥 2. 补齐 8 个参数，传给 Mapper
        List<Map<String, Object>> list = dashboardMapper.getFilteredDebugLogs(campus,floor,
                keyword, startTime, endTime, actionType, roomName, excludeBlacklist, size, offset);

        // 💥 3. 补齐 6 个参数，传给 Mapper (就是这里报的错！)
        Map<String, Object> stats = dashboardMapper.getFilteredDebugStats(campus,floor,
                keyword, startTime, endTime, actionType, roomName, excludeBlacklist);

        long total = stats != null && stats.get("totalLogs") != null
                ? Long.parseLong(stats.get("totalLogs").toString()) : 0;

        return Result.success(new PagedDataResponseDTO<>(list, total));
    }

    // =====================================================================
    // 📊 BI 数据指挥中心：大盘聚合指标 (KPI Cards)
    // =====================================================================
    @GetMapping("/debug/stats")
    public Result<MapDataResponseDTO> getFilteredDebugStats(
            @RequestParam(required = false) String campus, // 💥 新增
            @RequestParam(required = false) String floor,  // 💥 新增
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String startTime,
            @RequestParam(required = false) String endTime,
            @RequestParam(required = false) Integer actionType,
            @RequestParam(required = false) String roomName,
            @RequestParam(defaultValue = "true") Boolean excludeBlacklist) {

        // 💥 2. 补齐 6 个参数，传给 Mapper (就是这里报的错！)
        Map<String, Object> stats = dashboardMapper.getFilteredDebugStats(campus,floor
                ,keyword, startTime, endTime, actionType, roomName, excludeBlacklist);

        return Result.success(new MapDataResponseDTO(stats != null ? stats : java.util.Collections.emptyMap()));
    }

    // =====================================================================
    // 🛡️ 黑名单风控中枢 API
    // =====================================================================
    @GetMapping("/debug/blacklist")
    public Result<ListMapDataResponseDTO> getBlacklist() {
        return Result.success(new ListMapDataResponseDTO(dashboardMapper.getBlacklist()));
    }

    @PostMapping("/debug/blacklist")
    public Result<SimpleMessageResponseDTO> addBlacklist(@RequestBody Map<String, String> payload) {
        dashboardMapper.addBlacklist(payload.get("userId"), payload.get("name"), payload.get("reason"));
        return Result.success(new SimpleMessageResponseDTO("添加黑名单成功"));
    }

    @DeleteMapping("/debug/blacklist/{userId}")
    public Result<SimpleMessageResponseDTO> removeBlacklist(@PathVariable String userId) {
        dashboardMapper.removeBlacklist(userId);
        return Result.success(new SimpleMessageResponseDTO("移除黑名单成功"));
    }

    @GetMapping("/wechat-overview")
    public Result<List<RoomDashboardRenderDTO>> getWechatOverview(
            @RequestParam(required = false) String campus) {
        return Result.success(aggregationService.getWechatMiniProgramData(campus));
    }
}