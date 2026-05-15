package com.example.demo.modules.telemetry.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.telemetry.dto.archive.TelemetryArchiveSeriesDto;
import com.example.demo.modules.telemetry.service.TelemetryArchiveService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;

/**
 * 动物房详情趋势等：归档序列（与 WinCC 快照同源鉴权策略）。
 */
@RestController
@RequestMapping("/api/v1/telemetry/archive")
@CrossOrigin(origins = "*")
@Tag(name = "遥测归档", description = "时序查询（降采样）")
public class TelemetryArchiveV1Controller {

    private final TelemetryArchiveService archiveService;

    public TelemetryArchiveV1Controller(TelemetryArchiveService archiveService) {
        this.archiveService = archiveService;
    }

    @GetMapping("/series")
    @Operation(summary = "归档序列：RANGE 用 from/to；ROLLING 由服务端定窗（windowHours，默认 6h）并降采样 maxPoints")
    public Result<TelemetryArchiveSeriesDto> series(
            @RequestParam("variableName") String variableName,
            @RequestParam(value = "from", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime from,
            @RequestParam(value = "to", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime to,
            @RequestParam(value = "maxPoints", defaultValue = "120") int maxPoints,
            @RequestParam(value = "seriesScope", required = false) String seriesScope,
            @RequestParam(value = "windowHours", required = false) Integer windowHours) {
        return Result.success(archiveService.querySeries(variableName, from, to, maxPoints, seriesScope, windowHours));
    }
}
