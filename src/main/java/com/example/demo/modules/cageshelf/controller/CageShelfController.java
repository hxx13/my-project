package com.example.demo.modules.cageshelf.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.cageshelf.entity.CageEventLog;
import com.example.demo.modules.cageshelf.mapper.CageEventLogMapper;
import com.example.demo.modules.cageshelf.mapper.CageSpecialStatusSnapshotMapper;
import com.example.demo.modules.cageshelf.mapper.UserCageColorConfigMapper;
import com.example.demo.modules.cageshelf.service.CageAlertService;
import com.example.demo.modules.cageshelf.service.CageScanProgressService;
import com.example.demo.modules.cageshelf.service.CageShelfService;
import com.example.demo.modules.student.service.StudentCageShelfService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/cage-shelves")
@Tag(name = "笼架信息", description = "笼架索引导入与详情查询")
public class CageShelfController {
    private final AuthContextService authContextService;
    private final CageShelfService cageShelfService;
    private final StudentCageShelfService studentCageShelfService;
    private final CageScanProgressService cageScanProgressService;
    private final UserCageColorConfigMapper colorConfigMapper;
    private final CageEventLogMapper eventLogMapper;
    private final CageAlertService cageAlertService;
    private final CageSpecialStatusSnapshotMapper snapshotMapper;
    private final com.example.demo.modules.aro.service.AroService aroService;
    private final com.example.demo.modules.aro.AroPersonalTokenClient aroPersonalTokenClient;
    private final com.example.demo.modules.cageshelf.service.CageShelfRealtimeCooldown cooldown;

    public CageShelfController(AuthContextService authContextService,
                               CageShelfService cageShelfService,
                               StudentCageShelfService studentCageShelfService,
                               CageScanProgressService cageScanProgressService,
                               UserCageColorConfigMapper colorConfigMapper,
                               CageEventLogMapper eventLogMapper,
                               CageAlertService cageAlertService,
                               CageSpecialStatusSnapshotMapper snapshotMapper,
                               com.example.demo.modules.aro.service.AroService aroService,
                               com.example.demo.modules.aro.AroPersonalTokenClient aroPersonalTokenClient,
                               com.example.demo.modules.cageshelf.service.CageShelfRealtimeCooldown cooldown) {
        this.authContextService = authContextService;
        this.cageShelfService = cageShelfService;
        this.studentCageShelfService = studentCageShelfService;
        this.cageScanProgressService = cageScanProgressService;
        this.colorConfigMapper = colorConfigMapper;
        this.eventLogMapper = eventLogMapper;
        this.cageAlertService = cageAlertService;
        this.snapshotMapper = snapshotMapper;
        this.aroService = aroService;
        this.aroPersonalTokenClient = aroPersonalTokenClient;
        this.cooldown = cooldown;
    }

    @PostMapping("/import")
    @Operation(summary = "导入笼架 CSV")
    public Result<?> importCsv(@RequestHeader(value = "Authorization", required = false) String authorization,
                               @RequestParam("file") MultipartFile file) {
        User user = resolveUser(authorization);
        Result<?> denied = requireMinRole(user, RoleEnum.STAFF);
        if (denied != null) {
            return denied;
        }
        try {
            return Result.success(cageShelfService.importFromCsv(user.getId(), file));
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }

    @GetMapping("/filter-options")
    @Operation(summary = "笼架筛选项")
    public Result<?> filterOptions(@RequestHeader(value = "Authorization", required = false) String authorization,
                                   @RequestParam(required = false) Integer campusId,
                                   @RequestParam(required = false) String areaId,
                                   @RequestParam(required = false) String areaName,
                                   @RequestParam(required = false) String floorId,
                                   @RequestParam(required = false) String floorName,
                                   @RequestParam(required = false) String roomId,
                                   @RequestParam(required = false) String roomName) {
        User user = resolveUser(authorization);
        Result<?> denied = requireMinRole(user, RoleEnum.STAFF);
        if (denied != null) {
            return denied;
        }
        if (user.getRole().getLevel() >= RoleEnum.ADMIN.getLevel()) {
            return Result.success(cageShelfService.filterOptions(campusId, areaId, areaName, floorId, floorName, roomId, roomName));
        }
        Integer campusIdParam = campusId;
        return Result.success(studentCageShelfService.getFilterOptions(user, campusIdParam, areaId, floorId, roomId));
    }

    @GetMapping("/{shelveId}/detail")
    @Operation(summary = "获取笼架详情（优先缓存，缓存未命中时实时拉取 ARO）")
    public Result<?> detail(@RequestHeader(value = "Authorization", required = false) String authorization,
                            @PathVariable String shelveId,
                            @RequestParam(required = false) String batchId) {
        User user = resolveUser(authorization);
        Result<?> denied = requireMinRole(user, RoleEnum.STAFF);
        if (denied != null) {
            return denied;
        }
        try {
            return Result.success(cageShelfService.fetchShelfDetail(shelveId, batchId));
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }

    @PostMapping("/{shelveId}/refresh")
    @Operation(summary = "强制刷新笼架详情（调用 ARO 实时拉取并更新缓存）")
    public Result<?> refreshShelf(@RequestHeader(value = "Authorization", required = false) String authorization,
                                   @PathVariable String shelveId) {
        User user = resolveUser(authorization);
        Result<?> denied = requireMinRole(user, RoleEnum.STAFF);
        if (denied != null) {
            return denied;
        }
        try {
            return Result.success(cageShelfService.refreshShelfDetail(shelveId));
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }

    @GetMapping("/{shelveId}/cells/{x}/{y}/refresh")
    @Operation(summary = "手动刷新单个笼位数据（调用 /back + /book/ 获取最新状态）")
    public Result<?> refreshCell(@RequestHeader(value = "Authorization", required = false) String authorization,
                                  @PathVariable String shelveId,
                                  @PathVariable int x,
                                  @PathVariable int y) {
        User user = resolveUser(authorization);
        Result<?> denied = requireMinRole(user, RoleEnum.STAFF);
        if (denied != null) {
            return denied;
        }
        try {
            return Result.success(cageShelfService.refreshCell(shelveId, x, y));
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }

    @GetMapping("/scan-progress")
    @Operation(summary = "获取笼位数据同步进度")
    public Result<?> scanProgress(@RequestHeader(value = "Authorization", required = false) String authorization) {
        User user = resolveUser(authorization);
        Result<?> denied = requireMinRole(user, RoleEnum.STAFF);
        if (denied != null) {
            return denied;
        }
        return Result.success(cageScanProgressService.getProgress());
    }

    @GetMapping("/special-status-overview")
    @Operation(summary = "特殊状态总览（支持指定快照批次，默认最新）")
    public Result<?> specialStatusOverview(@RequestHeader(value = "Authorization", required = false) String authorization,
                                           @RequestParam(required = false) String batchId) {
        User user = resolveUser(authorization);
        Result<?> denied = requireMinRole(user, RoleEnum.STAFF);
        if (denied != null) {
            return denied;
        }
        try {
            return Result.success(cageShelfService.getSpecialStatusOverview(batchId));
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }

    @GetMapping("/indexes")
    @Operation(summary = "笼架索引表可视化查询")
    public Result<?> indexes(@RequestHeader(value = "Authorization", required = false) String authorization,
                             @RequestParam(required = false) Integer campusId,
                             @RequestParam(required = false) String areaId,
                             @RequestParam(required = false) String floorId,
                             @RequestParam(required = false) String roomId,
                             @RequestParam(defaultValue = "1") int page,
                             @RequestParam(defaultValue = "50") int size) {
        User user = resolveUser(authorization);
        Result<?> denied = requireMinRole(user, RoleEnum.STAFF);
        if (denied != null) {
            return denied;
        }
        return Result.success(cageShelfService.listIndexRows(campusId, areaId, floorId, roomId, page, size));
    }

    // ---- 用户笼位颜色偏好 ----

    @GetMapping("/user-colors")
    @Operation(summary = "获取当前用户的笼位颜色配置")
    public Result<?> getUserColors(@RequestHeader(value = "Authorization", required = false) String authorization) {
        User user = resolveUser(authorization);
        if (user == null) return Result.error("未登录");
        colorConfigMapper.ensureTable();
        List<Map<String, Object>> rows = colorConfigMapper.selectByUserId(user.getId());
        Map<String, Object> out = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            out.put(String.valueOf(row.get("statusCode")), Map.of(
                "bg", String.valueOf(row.getOrDefault("bgColor", "")),
                "border", String.valueOf(row.getOrDefault("borderColor", ""))
            ));
        }
        return Result.success(out);
    }

    @SuppressWarnings("unchecked")
    @PostMapping("/user-colors")
    @Operation(summary = "保存当前用户的笼位颜色配置")
    public Result<?> saveUserColors(@RequestHeader(value = "Authorization", required = false) String authorization,
                                     @RequestBody Map<String, Object> body) {
        User user = resolveUser(authorization);
        if (user == null) return Result.error("未登录");
        colorConfigMapper.ensureTable();
        Map<String, Object> configs = (Map<String, Object>) body.get("colors");
        if (configs != null && !configs.isEmpty()) {
            List<Map<String, Object>> rows = new ArrayList<>();
            for (Map.Entry<String, Object> entry : configs.entrySet()) {
                Map<String, Object> val = (Map<String, Object>) entry.getValue();
                if (val != null) {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("statusCode", entry.getKey());
                    row.put("bgColor", String.valueOf(val.getOrDefault("bg", "")));
                    row.put("borderColor", String.valueOf(val.getOrDefault("border", "")));
                    rows.add(row);
                }
            }
            if (!rows.isEmpty()) {
                colorConfigMapper.deleteByUserId(user.getId());
                colorConfigMapper.batchUpsert(user.getId(), rows);
            }
        }
        return Result.success();
    }

    private User resolveUser(String authorization) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null) {
            return null;
        }
        if (user.getRole() == null) {
            user.setRole(RoleEnum.MEMBER);
        }
        return user;
    }

    private Result<?> requireMinRole(User user, RoleEnum minRole) {
        if (user == null) {
            return Result.error("未登录或Token无效");
        }
        if (user.getStatus() != null && user.getStatus() == 0) {
            return Result.error("账号已禁用");
        }
        if (user.getRole().getLevel() < minRole.getLevel()) {
            return Result.error("无权限访问");
        }
        return null;
    }

    // ---- 笼位事件日志查询 ----

    @GetMapping("/event-logs")
    @Operation(summary = "查询笼位事件日志（支持筛选）")
    public Result<?> searchEventLogs(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam(required = false) String eventType,
            @RequestParam(required = false) String campusName,
            @RequestParam(required = false) String searchText,
            @RequestParam(required = false) String startTime,
            @RequestParam(required = false) String endTime,
            @RequestParam(defaultValue = "0") int offset,
            @RequestParam(defaultValue = "50") int limit) {
        User user = resolveUser(authorization);
        Result<?> denied = requireMinRole(user, RoleEnum.STAFF);
        if (denied != null) return denied;
        eventLogMapper.ensureTable();
        List<CageEventLog> rows = eventLogMapper.search(eventType, campusName, searchText, startTime, endTime, offset, limit);
        int total = eventLogMapper.countSearch(eventType, campusName, searchText, startTime, endTime);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("rows", rows);
        out.put("total", total);
        out.put("offset", offset);
        out.put("limit", limit);
        return Result.success(out);
    }

    @GetMapping("/event-logs/timeline/{cageBoxQrCode}")
    @Operation(summary = "按笼盒卡号查询事件时间线")
    public Result<?> timelineByBox(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable String cageBoxQrCode,
            @RequestParam(defaultValue = "100") int limit) {
        User user = resolveUser(authorization);
        Result<?> denied = requireMinRole(user, RoleEnum.STAFF);
        if (denied != null) return denied;
        eventLogMapper.ensureTable();
        return Result.success(eventLogMapper.timelineByBox(cageBoxQrCode, limit));
    }

    // ---- 笼位特殊状态持续告警 ----

    @GetMapping("/persisted-alerts")
    @Operation(summary = "基于快照对比查询持续告警")
    public Result<?> persistedAlerts(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam(required = false) String currentBatchId,
            @RequestParam(required = false) String baselineBatchId,
            @RequestParam(defaultValue = "auto") String mode) {
        User user = resolveUser(authorization);
        Result<?> denied = requireMinRole(user, RoleEnum.STAFF);
        if (denied != null) return denied;
        return Result.success(cageAlertService.getPersistedAlerts(currentBatchId, baselineBatchId, mode));
    }

    @GetMapping("/alert-config")
    @Operation(summary = "获取指定模式的告警配置")
    public Result<?> getAlertConfig(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam(defaultValue = "auto") String mode) {
        User user = resolveUser(authorization);
        Result<?> denied = requireMinRole(user, RoleEnum.STAFF);
        if (denied != null) return denied;
        return Result.success(cageAlertService.getConfig(mode));
    }

    @PutMapping("/alert-config")
    @Operation(summary = "保存指定模式的告警配置（全量替换）")
    public Result<?> saveAlertConfig(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody List<Map<String, Object>> body,
            @RequestParam(defaultValue = "auto") String mode) {
        User user = resolveUser(authorization);
        Result<?> denied = requireMinRole(user, RoleEnum.STAFF);
        if (denied != null) return denied;
        List<com.example.demo.modules.cageshelf.entity.CageAlertConfig> configs = new ArrayList<>();
        for (Map<String, Object> item : body) {
            com.example.demo.modules.cageshelf.entity.CageAlertConfig cfg = new com.example.demo.modules.cageshelf.entity.CageAlertConfig();
            cfg.setStatusCode(String.valueOf(item.getOrDefault("statusCode", "")));
            cfg.setStatusLabel(String.valueOf(item.getOrDefault("statusLabel", "")));
            Object td = item.get("thresholdDays");
            cfg.setThresholdDays(td instanceof Number n ? n.intValue() : 7);
            Object en = item.get("enabled");
            cfg.setEnabled(en instanceof Boolean b ? (b ? 1 : 0) : (en instanceof Number n && n.intValue() != 0 ? 1 : 0));
            configs.add(cfg);
        }
        cageAlertService.saveConfig(configs, mode);
        return Result.success();
    }

    // ---- 快照批次管理 ----

    @DeleteMapping("/snapshot-batches/{scanBatchId}")
    @Operation(summary = "删除指定快照批次及其关联事件日志")
    @Transactional
    public Result<?> deleteSnapshotBatch(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable String scanBatchId) {
        User user = resolveUser(authorization);
        Result<?> denied = requireMinRole(user, RoleEnum.STAFF);
        if (denied != null) return denied;
        int eventsDeleted = eventLogMapper.deleteByScanBatchId(scanBatchId);
        int snapshotsDeleted = snapshotMapper.deleteByScanBatchId(scanBatchId);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("deletedBatch", scanBatchId);
        out.put("eventsDeleted", eventsDeleted);
        out.put("snapshotsDeleted", snapshotsDeleted);
        return Result.success(out);
    }

    /** 一次性：从 cage_shelf_grid_cache 的 grid_json 解析 animalCageType 回填 cage_shelf_cell_snapshot */
    @PostMapping("/seed-cell-snapshot")
    @Operation(summary = "从 grid_cache 回填 cell_snapshot（一次性）")
    public Result<?> seedCellSnapshot() {
        return Result.success(cageShelfService.seedCellSnapshotFromGridCache());
    }

    // ==========================================================================
    // 🔧 实时数据源 + 笼位分配（2026-07-27 新增）
    // ==========================================================================

    @PostMapping("/realtime/refresh")
    @Operation(summary = "实时拉取笼架数据（含 5min 冷却）")
    public Result<?> refreshRealtime(@RequestHeader(value = "Authorization", required = false) String authorization,
                                      @RequestBody Map<String, Object> body) {
        User user = resolveUser(authorization);
        Result<?> denied = requireMinRole(user, RoleEnum.STAFF);
        if (denied != null) return denied;
        Long roomId = toLong(body.get("roomId"));
        if (roomId == null) return Result.error("请提供 roomId");
        String shelveId = body.get("shelveId") != null ? String.valueOf(body.get("shelveId")) : null;
        return Result.success(cageShelfService.refreshRoomRealtime(roomId, shelveId));
    }

    @GetMapping("/realtime/cooldown")
    @Operation(summary = "查询冷却剩余时间")
    public Result<?> cooldownRemaining(@RequestHeader(value = "Authorization", required = false) String authorization,
                                        @RequestParam("roomId") Long roomId,
                                        @RequestParam(value = "shelveId", required = false) String shelveId) {
        User user = resolveUser(authorization);
        Result<?> denied = requireMinRole(user, RoleEnum.STAFF);
        if (denied != null) return denied;
        String key = (shelveId == null || shelveId.isBlank()) ? (roomId + ":*") : (roomId + ":" + shelveId);
        long remainingMs = cooldown.remainingCooldownMs(key);
        return Result.success(Map.of("cooldownRemainingMs", remainingMs, "inCooldown", remainingMs > 0));
    }

    @GetMapping("/allocation/aups")
    @Operation(summary = "查分配用 AUP 列表")
    public Result<?> allocationAups(@RequestHeader(value = "Authorization", required = false) String authorization) {
        User user = resolveUser(authorization);
        Result<?> denied = requireMinRole(user, RoleEnum.STAFF);
        if (denied != null) return denied;
        return Result.success(aroService.fetchAupListForAllocation());
    }

    @SuppressWarnings("unchecked")
    @PostMapping("/allocation/assign")
    @Operation(summary = "执行笼位分配")
    public Result<?> allocationAssign(@RequestHeader(value = "Authorization", required = false) String authorization,
                                       @RequestBody Map<String, Object> body) {
        User user = resolveUser(authorization);
        Result<?> denied = requireMinRole(user, RoleEnum.ADMIN);
        if (denied != null) return denied;
        Long roomId = toLong(body.get("roomId"));
        Long shelveId = toLong(body.get("shelveId"));
        Long aupId = toLong(body.get("aupId"));
        List<Long> cageIds = new ArrayList<>();
        Object idsObj = body.get("cageIds");
        if (idsObj instanceof List<?> list) {
            for (Object item : list) cageIds.add(toLong(item));
        }
        if (roomId == null || aupId == null || cageIds.isEmpty()) {
            return Result.error("roomId/aupId/cageIds 不能为空");
        }
        boolean ok = aroPersonalTokenClient.execute(token ->
            aroService.bookCagesWithToken(roomId, shelveId, cageIds, aupId, token));
        if (ok) {
            // 分配成功后强制刷新（绕过冷却）
            cageShelfService.forceRefreshAfterMutation(roomId);
            return Result.success(Map.of("ok", true));
        }
        return Result.error("ARO 分配失败，请查看日志");
    }

    @SuppressWarnings("unchecked")
    @PostMapping("/allocation/cancel")
    @Operation(summary = "取消笼位分配")
    public Result<?> allocationCancel(@RequestHeader(value = "Authorization", required = false) String authorization,
                                       @RequestBody Map<String, Object> body) {
        User user = resolveUser(authorization);
        Result<?> denied = requireMinRole(user, RoleEnum.ADMIN);
        if (denied != null) return denied;
        List<Long> cageIds = new ArrayList<>();
        Object idsObj = body.get("cageIds");
        if (idsObj instanceof List<?> list) {
            for (Object item : list) cageIds.add(toLong(item));
        }
        if (cageIds.isEmpty()) {
            return Result.error("cageIds 不能为空");
        }
        boolean ok = aroPersonalTokenClient.execute(token ->
            aroService.cancelBookCagesWithToken(cageIds, token));
        if (ok) {
            Long cancelRoomId = toLong(body.get("roomId"));
            if (cancelRoomId != null) {
                cageShelfService.forceRefreshAfterMutation(cancelRoomId);
            }
            return Result.success(Map.of("ok", true));
        }
        return Result.error("ARO 取消分配失败，请查看日志");
    }

    private static Long toLong(Object v) {
        if (v == null) return null;
        if (v instanceof Number n) return n.longValue();
        try { return Long.parseLong(String.valueOf(v)); } catch (NumberFormatException e) { return null; }
    }
}
