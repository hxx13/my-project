package com.example.demo.modules.cageshelf.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.cageshelf.entity.CageEventLog;
import com.example.demo.modules.cageshelf.mapper.CageEventLogMapper;
import com.example.demo.modules.cageshelf.mapper.UserCageColorConfigMapper;
import com.example.demo.modules.cageshelf.service.CageAlertService;
import com.example.demo.modules.cageshelf.service.CageScanProgressService;
import com.example.demo.modules.cageshelf.service.CageShelfService;
import com.example.demo.modules.student.service.StudentCageShelfService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
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

    public CageShelfController(AuthContextService authContextService,
                               CageShelfService cageShelfService,
                               StudentCageShelfService studentCageShelfService,
                               CageScanProgressService cageScanProgressService,
                               UserCageColorConfigMapper colorConfigMapper,
                               CageEventLogMapper eventLogMapper,
                               CageAlertService cageAlertService) {
        this.authContextService = authContextService;
        this.cageShelfService = cageShelfService;
        this.studentCageShelfService = studentCageShelfService;
        this.cageScanProgressService = cageScanProgressService;
        this.colorConfigMapper = colorConfigMapper;
        this.eventLogMapper = eventLogMapper;
        this.cageAlertService = cageAlertService;
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
            @RequestParam(required = false) String baselineBatchId,
            @RequestParam(defaultValue = "auto") String mode) {
        User user = resolveUser(authorization);
        Result<?> denied = requireMinRole(user, RoleEnum.STAFF);
        if (denied != null) return denied;
        return Result.success(cageAlertService.getPersistedAlerts(baselineBatchId, mode));
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

    /** 一次性：从 cage_shelf_grid_cache 的 grid_json 解析 animalCageType 回填 cage_shelf_cell_snapshot */
    @PostMapping("/seed-cell-snapshot")
    @Operation(summary = "从 grid_cache 回填 cell_snapshot（一次性）")
    public Result<?> seedCellSnapshot() {
        return Result.success(cageShelfService.seedCellSnapshotFromGridCache());
    }
}
