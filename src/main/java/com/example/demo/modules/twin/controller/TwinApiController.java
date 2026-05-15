package com.example.demo.modules.twin.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.aro.service.AroPersonnelDatabaseService;
import com.example.demo.modules.twin.dto.GroupedOrderAdminResponseDTO;
import com.example.demo.modules.twin.dto.ListMapDataResponseDTO;
import com.example.demo.modules.twin.dto.MapDataResponseDTO;
import com.example.demo.modules.twin.dto.PagedDataResponseDTO;
import com.example.demo.modules.twin.dto.SimpleMessageResponseDTO;
import com.example.demo.modules.aro.service.AroService;
import com.example.demo.modules.twin.service.TwinDashboardService;
import com.example.demo.modules.twin.service.TwinPredictionEngineService;
import com.example.demo.modules.twin.service.TwinAsyncTaskService;
import com.example.demo.modules.twin.service.TwinScanService;
import com.example.demo.modules.twin.service.PersonnelAvatarProxyService;
import com.example.demo.modules.twin.service.TwinAutomationLogService;
import com.example.demo.modules.twin.entity.TwinAutomationLog;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import com.example.demo.modules.twin.mapper.TwinDashboardMapper;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/twin/dashboard")
@CrossOrigin("*")
public class TwinApiController {

    private static final Logger log = LoggerFactory.getLogger(TwinApiController.class);

    @Autowired
    private TwinDashboardService dashboardService;

    @Autowired
    private TwinDashboardMapper dashboardMapper;

    @Autowired
    private TwinAutomationLogService twinAutomationLogService;

    @Autowired
    private AroService aroService;

    @Autowired
    private AroPersonnelDatabaseService personnelDbService;

    @Autowired
    private com.example.demo.modules.twin.service.RpgEngineService rpgEngineService;

    @Autowired private TwinPredictionEngineService predictionEngineService;
    @Autowired private TwinAsyncTaskService twinAsyncTaskService;

    @Autowired
    private PersonnelAvatarProxyService personnelAvatarProxyService;

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
            @RequestParam(defaultValue = "浦东") String areaName) { // 🟢 1. 核心修改：增加 areaName 参数，默认值为“浦东”
        // 2. 🟢 核心修改：将 areaName 传给 Mapper 进行数据库过滤
        List<Map<String, Object>> rawWarnings = dashboardMapper.getActiveRetentionWarnings(limit, areaName);
        List<Map<String, Object>> processedData = new ArrayList<>();
        DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
        for (Map<String, Object> warning : rawWarnings) {
            try {
                // A. 解析入场时间
                String enterTimeStr = (String) warning.get("enterTime");
                LocalDateTime realEntryTime = LocalDateTime.parse(enterTimeStr.substring(0, 19), formatter);
                // B. 获取当前服务器绝对时间
                LocalDateTime currentNow = LocalDateTime.now();
                // 从 SQL 中提取预估画像数据
                Object medianObj = warning.get("aiDurationMins");
                Object probObj = warning.get("aiOvertimeProb");
                int medianMins = medianObj != null ? ((Number) medianObj).intValue() : 120;
                double prob = probObj != null ? ((Number) probObj).doubleValue() : 0.0;
                // C. 喂给引擎计算智能离开时间
                // 引擎内部的“软天花板”逻辑对全校区通用
                LocalDateTime smartExitTime = predictionEngineService.calculateSmartExitTime(
                        realEntryTime, medianMins, prob, currentNow
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

    // 🌀 接口 4：获取混合实时流 (前端大屏初始化专用)
    @GetMapping("/realtime-feed")
    public Result<ListMapDataResponseDTO> getRealtimeFeed(@RequestParam(defaultValue = "15") int limit) {
        return Result.success(new ListMapDataResponseDTO(dashboardMapper.getRealtimeFeed(limit)));
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

    // 💥 人员专用：人员档案专属搜索 API (这里完美保留了原来的名字 searchPersonnel，并加入了动态限流！)
    @GetMapping("/personnel/search")
    public Result<ListMapDataResponseDTO> searchPersonnel(@RequestParam String keyword,
                                                          @RequestParam(defaultValue = "20") int limit) {
        try {
            // 先查本地 aro_personnel（快）；若为空则回源 ARO 官方兜底，避免“预检框空列表”。
            List<Map<String, Object>> local = dashboardMapper.searchPersonnel(keyword, limit);
            if (local != null && !local.isEmpty()) {
                return Result.success(new ListMapDataResponseDTO(local));
            }
            List<Map<String, Object>> remote = aroService.searchPersonnelLite(keyword, limit);
            return Result.success(new ListMapDataResponseDTO(remote));
        } catch (Exception e) {
            return Result.error("人员搜索失败: " + e.getMessage());
        }
    }

    @GetMapping("/user-status")
    public Result<?> getUserStatus(@RequestParam String userId) {
        // 💥 加上这一行探针
        System.out.println("🚨 滴滴滴！前端成功呼叫风控接口，拿到的 userId 是: " + userId);

        Map<String, Object> data = aroService.getUserDetailAndDisciplinary(userId);
        return Result.success(data);
    }

    // 💥 核武器：全量洗刷并重算所有人的经验值！(已极致解耦)
    @GetMapping("/debug/recalc-exp")
    public Result<MapDataResponseDTO> recalculateAllExp() {
        // Controller 恢复纯净，只做一件事：接化发！
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
}