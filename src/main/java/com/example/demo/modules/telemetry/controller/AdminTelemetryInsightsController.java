package com.example.demo.modules.telemetry.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.telemetry.dto.archive.TelemetryChartGroupDto;
import com.example.demo.modules.telemetry.dto.archive.TelemetryDisplayProfileDto;
import com.example.demo.modules.telemetry.dto.archive.TelemetryViewSnapshotDto;
import com.example.demo.modules.telemetry.dto.archive.TelemetryViewSnapshotPageDto;
import com.example.demo.modules.telemetry.service.TelemetryChartGroupService;
import com.example.demo.modules.telemetry.service.TelemetryDisplayProfileService;
import com.example.demo.modules.telemetry.service.TelemetryViewSnapshotService;
import com.example.demo.modules.telemetry.support.TelemetryInsightsDebugSupport;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin/telemetry")
@Tag(name = "遥测历史可视化(管理)", description = "展示档、对比组、快照")
public class AdminTelemetryInsightsController {

    private final TelemetryDisplayProfileService displayProfileService;
    private final TelemetryChartGroupService chartGroupService;
    private final TelemetryViewSnapshotService viewSnapshotService;

    public AdminTelemetryInsightsController(
            TelemetryDisplayProfileService displayProfileService,
            TelemetryChartGroupService chartGroupService,
            TelemetryViewSnapshotService viewSnapshotService) {
        this.displayProfileService = displayProfileService;
        this.chartGroupService = chartGroupService;
        this.viewSnapshotService = viewSnapshotService;
    }

    @GetMapping("/display-profiles")
    @Operation(summary = "展示配置档列表")
    public Result<List<TelemetryDisplayProfileDto>> listDisplayProfiles() {
        return Result.success(displayProfileService.listAll());
    }

    @PutMapping("/display-profiles")
    @Operation(summary = "保存展示配置档")
    public Result<TelemetryDisplayProfileDto> saveDisplayProfile(@RequestBody TelemetryDisplayProfileDto body) {
        return Result.success(displayProfileService.save(body));
    }

    @GetMapping("/chart-groups")
    @Operation(summary = "对比组列表")
    public Result<List<TelemetryChartGroupDto>> listChartGroups(HttpServletRequest request) {
        return Result.success(chartGroupService.listAll(TelemetryInsightsDebugSupport.enabled(request)));
    }

    @PostMapping("/chart-groups")
    @Operation(summary = "新建对比组")
    public Result<TelemetryChartGroupDto> createChartGroup(@RequestBody TelemetryChartGroupDto body) {
        return Result.success(chartGroupService.create(body));
    }

    @PutMapping("/chart-groups/{id}")
    @Operation(summary = "更新对比组")
    public Result<TelemetryChartGroupDto> updateChartGroup(
            @PathVariable("id") long id,
            @RequestBody TelemetryChartGroupDto body) {
        return Result.success(chartGroupService.update(id, body));
    }

    @DeleteMapping("/chart-groups/{id}")
    @Operation(summary = "删除对比组")
    public Result<Void> deleteChartGroup(@PathVariable("id") long id) {
        chartGroupService.delete(id);
        return Result.success(null);
    }

    @GetMapping("/snapshots")
    @Operation(summary = "历史快照分页浏览")
    public Result<TelemetryViewSnapshotPageDto> listSnapshots(
            @RequestParam(value = "page", defaultValue = "1") int page,
            @RequestParam(value = "size", defaultValue = "20") int size,
            @RequestParam(value = "from", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime from,
            @RequestParam(value = "to", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime to,
            @RequestParam(value = "profileCode", required = false) String profileCode) {
        return Result.success(viewSnapshotService.listPage(page, size, from, to, profileCode));
    }

    @GetMapping("/snapshots/{id}")
    @Operation(summary = "快照详情（导出 JSON）")
    public Result<TelemetryViewSnapshotDto> getSnapshot(@PathVariable("id") long id) {
        return Result.success(viewSnapshotService.getById(id));
    }

    @PostMapping("/snapshots/capture")
    @Operation(summary = "手动捕获视图快照")
    public Result<Map<String, Object>> captureSnapshot(
            @RequestParam(value = "profileCode", defaultValue = "PRESENTATION") String profileCode,
            @RequestParam(value = "from", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime from,
            @RequestParam(value = "to", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime to,
            @RequestParam(value = "chartGroupId", required = false) Long chartGroupId) {
        return Result.success(viewSnapshotService.captureSnapshot(profileCode, from, to, chartGroupId));
    }
}
