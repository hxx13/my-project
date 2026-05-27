package com.example.demo.modules.telemetry.controller;



import com.example.demo.common.dto.Result;

import com.example.demo.modules.telemetry.dto.archive.TelemetryArchivePurgeConfigDto;

import com.example.demo.modules.telemetry.dto.archive.TelemetryArchivePurgeProgressDto;
import com.example.demo.modules.telemetry.dto.archive.TelemetryArchivePurgeResultDto;

import com.example.demo.modules.telemetry.dto.archive.TelemetryArchiveQueryPageDto;

import com.example.demo.modules.telemetry.dto.archive.TelemetryArchiveStorageStatsDto;

import com.example.demo.modules.telemetry.service.TelemetryArchivePurgeConfigService;

import com.example.demo.modules.telemetry.service.TelemetryArchivePurgeRunner;

import com.example.demo.modules.telemetry.service.TelemetryArchiveService;

import io.swagger.v3.oas.annotations.Operation;

import io.swagger.v3.oas.annotations.tags.Tag;

import org.springframework.format.annotation.DateTimeFormat;

import org.springframework.web.bind.annotation.CrossOrigin;

import org.springframework.web.bind.annotation.GetMapping;

import org.springframework.web.bind.annotation.PostMapping;

import org.springframework.web.bind.annotation.PutMapping;

import org.springframework.web.bind.annotation.RequestBody;

import org.springframework.web.bind.annotation.RequestMapping;

import org.springframework.web.bind.annotation.RequestParam;

import org.springframework.web.bind.annotation.RestController;



import java.time.LocalDateTime;

import java.util.Map;



/**

 * 管理端：温湿度归档查询 + 自动清理配置。

 */

@RestController

@RequestMapping("/api/admin/telemetry/archive")

@CrossOrigin(origins = "*")

@Tag(name = "遥测归档(管理)", description = "telemetry_value_archive 查询与清理")

public class AdminTelemetryArchiveController {



    private final TelemetryArchiveService archiveService;

    private final TelemetryArchivePurgeConfigService purgeConfigService;

    private final TelemetryArchivePurgeRunner purgeRunner;



    public AdminTelemetryArchiveController(

            TelemetryArchiveService archiveService,

            TelemetryArchivePurgeConfigService purgeConfigService,

            TelemetryArchivePurgeRunner purgeRunner) {

        this.archiveService = archiveService;

        this.purgeConfigService = purgeConfigService;

        this.purgeRunner = purgeRunner;

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



    @GetMapping("/purge-config")

    @Operation(summary = "读取 WinCC 归档自动清理配置")

    public Result<TelemetryArchivePurgeConfigDto> getPurgeConfig() {

        return Result.success(purgeConfigService.getConfigDto());

    }



    @PutMapping("/purge-config")

    @Operation(summary = "保存 WinCC 归档自动清理配置（保留天数、分批大小等）")

    public Result<TelemetryArchivePurgeConfigDto> savePurgeConfig(@RequestBody TelemetryArchivePurgeConfigDto body) {

        purgeConfigService.saveConfig(body, "admin-ui");

        return Result.success(purgeConfigService.getConfigDto());

    }



    @GetMapping("/storage-stats")

    @Operation(summary = "归档表行数与占用空间统计")

    public Result<TelemetryArchiveStorageStatsDto> storageStats() {

        return Result.success(archiveService.getStorageStats());

    }



    @GetMapping("/purge-status")
    @Operation(summary = "归档清理进度（轮询）")
    public Result<TelemetryArchivePurgeProgressDto> purgeStatus() {
        return Result.success(purgeConfigService.getProgressDto());
    }



    @PostMapping("/purge-now")
    @Operation(summary = "后台异步清理（立即返回，避免 HTTP 占满连接池）")
    public Result<Map<String, Object>> purgeNow() {
        if (purgeConfigService.isPurgeInProgress()) {
            return Result.success(Map.of(
                    "accepted", false,
                    "inProgress", true,
                    "message", "清理任务已在后台运行"));
        }
        purgeRunner.runManualPurgeAsync();
        return Result.success(Map.of(
                "accepted", true,
                "inProgress", true,
                "message", "已在后台持续清理，可在下方查看进度"));
    }



    /** 同步清理（定时任务仍走 Service；管理端默认用 purge-now 异步） */

    @PostMapping("/purge-now-sync")

    @Operation(summary = "同步清理（仅调试，易超时）")

    public Result<TelemetryArchivePurgeResultDto> purgeNowSync() {

        return Result.success(archiveService.purgeExpiredBatched("admin-manual-sync"));

    }

}


