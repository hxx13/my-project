package com.example.demo.modules.telemetry.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.telemetry.dto.archive.TelemetryArchiveSeriesBatchDto;
import com.example.demo.modules.telemetry.dto.archive.TelemetryArchiveSeriesDto;
import com.example.demo.modules.telemetry.dto.archive.TelemetryFleetMatrixDto;
import com.example.demo.modules.telemetry.dto.archive.TelemetryPartitionSummaryDto;
import com.example.demo.modules.telemetry.service.TelemetryArchiveService;
import com.example.demo.modules.telemetry.support.TelemetryInsightsDebugSupport;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;

@RestController
@RequestMapping("/api/v1/telemetry/archive")
@Tag(name = "遥测归档", description = "时序查询（降采样）")
public class TelemetryArchiveV1Controller {

    private final TelemetryArchiveService archiveService;

    public TelemetryArchiveV1Controller(TelemetryArchiveService archiveService) {
        this.archiveService = archiveService;
    }

    @GetMapping("/series")
    @Operation(summary = "归档序列：支持 displayProfile(STANDARD|PRESENTATION)、fromRollup 长窗走 L1")
    public Result<TelemetryArchiveSeriesDto> series(
            @RequestParam("variableName") String variableName,
            @RequestParam(value = "from", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime from,
            @RequestParam(value = "to", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime to,
            @RequestParam(value = "maxPoints", defaultValue = "120") int maxPoints,
            @RequestParam(value = "seriesScope", required = false) String seriesScope,
            @RequestParam(value = "windowHours", required = false) Integer windowHours,
            @RequestParam(value = "displayProfile", required = false, defaultValue = "STANDARD") String displayProfile,
            @RequestParam(value = "fromRollup", required = false) Boolean fromRollup) {
        return Result.success(archiveService.querySeries(
                variableName, from, to, maxPoints, seriesScope, windowHours, displayProfile, fromRollup));
    }

    @GetMapping("/series/batch")
    @Operation(summary = "多变量批量序列（对比组）")
    public Result<TelemetryArchiveSeriesBatchDto> seriesBatch(
            @RequestParam("variableNames") String variableNames,
            @RequestParam(value = "from", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime from,
            @RequestParam(value = "to", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime to,
            @RequestParam(value = "maxPoints", defaultValue = "120") int maxPoints,
            @RequestParam(value = "seriesScope", required = false) String seriesScope,
            @RequestParam(value = "windowHours", required = false) Integer windowHours,
            @RequestParam(value = "displayProfile", required = false, defaultValue = "STANDARD") String displayProfile,
            @RequestParam(value = "fromRollup", required = false) Boolean fromRollup) {
        List<String> names = Arrays.stream(variableNames.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toList();
        return Result.success(archiveService.querySeriesBatch(
                names, from, to, maxPoints, seriesScope, windowHours, displayProfile, fromRollup));
    }

    @GetMapping("/fleet-matrix")
    @Operation(summary = "Fleet 热力矩阵：room×metric 合规/最新值/偏差")
    public Result<TelemetryFleetMatrixDto> fleetMatrix(
            @RequestParam("from") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime from,
            @RequestParam("to") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime to,
            @RequestParam(value = "metricKindCode", required = false) String metricKindCode,
            @RequestParam(value = "floorFilter", required = false) String floorFilter,
            HttpServletRequest request) {
        boolean debug = TelemetryInsightsDebugSupport.enabled(request);
        return Result.success(archiveService.queryFleetMatrix(from, to, metricKindCode, floorFilter, debug));
    }

    @GetMapping("/partition-summary")
    @Operation(summary = "分区汇总 sparkline（median/p90）")
    public Result<List<TelemetryPartitionSummaryDto>> partitionSummary(
            @RequestParam("from") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime from,
            @RequestParam("to") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime to,
            @RequestParam(value = "metricKindCode", required = false) String metricKindCode,
            @RequestParam(value = "floorFilter", required = false) String floorFilter,
            @RequestParam(value = "displayProfile", required = false, defaultValue = "STANDARD") String displayProfile) {
        return Result.success(archiveService.queryPartitionSummary(from, to, metricKindCode, floorFilter, displayProfile));
    }
}
