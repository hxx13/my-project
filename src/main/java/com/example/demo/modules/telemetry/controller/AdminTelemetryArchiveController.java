package com.example.demo.modules.telemetry.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.telemetry.dto.archive.TelemetryArchiveQueryPageDto;
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
 * 管理端：温湿度归档查询（需 Bearer + /api/admin 拦截）。
 */
@RestController
@RequestMapping("/api/admin/telemetry/archive")
@CrossOrigin(origins = "*")
@Tag(name = "遥测归档(管理)", description = "telemetry_value_archive 分页查询")
public class AdminTelemetryArchiveController {

    private final TelemetryArchiveService archiveService;

    public AdminTelemetryArchiveController(TelemetryArchiveService archiveService) {
        this.archiveService = archiveService;
    }

    @GetMapping("/query")
    @Operation(summary = "分页查询归档样本")
    public Result<TelemetryArchiveQueryPageDto> query(
            @RequestParam(value = "page", defaultValue = "1") int page,
            @RequestParam(value = "size", defaultValue = "50") int size,
            @RequestParam(value = "variableName", required = false) String variableName,
            @RequestParam(value = "from", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime from,
            @RequestParam(value = "to", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime to) {
        return Result.success(archiveService.queryPage(page, size, variableName, from, to));
    }
}
