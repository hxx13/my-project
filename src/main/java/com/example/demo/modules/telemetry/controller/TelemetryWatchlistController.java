package com.example.demo.modules.telemetry.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.telemetry.dto.watchlist.TelemetryWatchlistBundleDto;
import com.example.demo.modules.telemetry.dto.watchlist.TelemetryMetricKindDto;
import com.example.demo.modules.telemetry.dto.watchlist.TelemetryMetricKindWriteDto;
import com.example.demo.modules.telemetry.dto.watchlist.TelemetryWatchlistCreateRequest;
import com.example.demo.modules.telemetry.dto.watchlist.TelemetryWatchlistImportRequest;
import com.example.demo.modules.telemetry.dto.watchlist.TelemetryWatchlistPollPatchRequest;
import com.example.demo.modules.telemetry.dto.watchlist.TelemetryWatchlistTagDto;
import com.example.demo.modules.telemetry.dto.watchlist.TelemetryWatchlistTagPageDto;
import com.example.demo.modules.telemetry.dto.watchlist.TelemetryGlobalAlarmLimitsDto;
import com.example.demo.modules.telemetry.dto.watchlist.TelemetryWatchlistTagAlarmOverridePatchDto;
import com.example.demo.modules.telemetry.dto.watchlist.TelemetryWatchlistTagWriteDto;
import com.example.demo.modules.telemetry.dto.watchlist.TelemetryWatchlistZoneAdminDto;
import com.example.demo.modules.telemetry.service.TelemetryGlobalAlarmLimitsService;
import com.example.demo.modules.telemetry.service.TelemetryMetricKindService;
import com.example.demo.modules.telemetry.service.TelemetrySnapshotService;
import com.example.demo.modules.telemetry.service.TelemetryWatchlistDbService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/telemetry/watchlists")
@CrossOrigin(origins = "*")
@Tag(name = "WinCC变量清单", description = "CSV 导入入库、按文件名命名、整表替换与激活")
public class TelemetryWatchlistController {

    private final TelemetryWatchlistDbService watchlistDbService;
    private final TelemetryMetricKindService metricKindService;
    private final TelemetrySnapshotService telemetrySnapshotService;
    private final TelemetryGlobalAlarmLimitsService globalAlarmLimitsService;

    public TelemetryWatchlistController(TelemetryWatchlistDbService watchlistDbService,
                                        TelemetryMetricKindService metricKindService,
                                        TelemetrySnapshotService telemetrySnapshotService,
                                        TelemetryGlobalAlarmLimitsService globalAlarmLimitsService) {
        this.watchlistDbService = watchlistDbService;
        this.metricKindService = metricKindService;
        this.telemetrySnapshotService = telemetrySnapshotService;
        this.globalAlarmLimitsService = globalAlarmLimitsService;
    }

    @GetMapping("/global-alarm-limits")
    @Operation(summary = "全局报警限（温度/湿度/压强各一对上下限）")
    public Result<TelemetryGlobalAlarmLimitsDto> getGlobalAlarmLimits() {
        return Result.success(globalAlarmLimitsService.load());
    }

    @PutMapping("/global-alarm-limits")
    @Operation(summary = "保存全局报警限（动物房所有同类测点共用）")
    public Result<TelemetryGlobalAlarmLimitsDto> putGlobalAlarmLimits(@RequestBody TelemetryGlobalAlarmLimitsDto body) {
        return Result.success(globalAlarmLimitsService.save(body));
    }

    @GetMapping("/metric-kinds")
    @Operation(summary = "指标类型字典（动物房下拉）")
    public Result<List<TelemetryMetricKindDto>> listMetricKinds() {
        return Result.success(metricKindService.listAll());
    }

    @PostMapping("/metric-kinds")
    @Operation(summary = "新增指标类型")
    public Result<TelemetryMetricKindDto> createMetricKind(@RequestBody TelemetryMetricKindWriteDto body) {
        return Result.success(metricKindService.create(body));
    }

    @PutMapping("/metric-kinds/{code}")
    @Operation(summary = "更新指标类型")
    public Result<TelemetryMetricKindDto> updateMetricKind(
            @PathVariable String code,
            @RequestBody TelemetryMetricKindWriteDto body) {
        return Result.success(metricKindService.update(code, body));
    }

    @DeleteMapping("/metric-kinds/{code}")
    @Operation(summary = "删除指标类型（内置不可删）")
    public Result<Void> deleteMetricKind(@PathVariable String code) {
        metricKindService.delete(code);
        return Result.success();
    }

    @GetMapping
    @Operation(summary = "列出所有分区（按文件名建档）")
    public Result<List<TelemetryWatchlistBundleDto>> list() {
        return Result.success(watchlistDbService.listBundles());
    }

    @GetMapping("/admin/zones-with-tags")
    @Operation(summary = "管理端：按分区返回变量表（多表展示）")
    public Result<List<TelemetryWatchlistZoneAdminDto>> zonesWithTags() {
        return Result.success(watchlistDbService.listZonesWithTagsForAdmin());
    }

    @PostMapping(value = "/quick-import-file", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary = "上传 CSV：按文件名命名清单、整表写入变量并设为当前 WinCC 使用")
    public Result<Map<String, Object>> quickImportFile(@RequestParam("file") MultipartFile file) throws java.io.IOException {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("请选择 CSV 文件");
        }
        String fn = file.getOriginalFilename();
        String text = new String(file.getBytes(), StandardCharsets.UTF_8);
        Map<String, Object> out = watchlistDbService.importCsvFromUploadedFile(fn, text);
        telemetrySnapshotService.reapplyWatchlistEnrichmentToCachedSnapshot();
        return Result.success(out);
    }

    @PostMapping
    @Operation(summary = "新建测点套（code 小写 slug）")
    public Result<TelemetryWatchlistBundleDto> create(@RequestBody TelemetryWatchlistCreateRequest body) {
        return Result.success(watchlistDbService.createBundle(body.getCode(), body.getDisplayName()));
    }

    @DeleteMapping("/{code}")
    @Operation(summary = "删除测点套（级联删除变量行）")
    public Result<Void> delete(@PathVariable String code) {
        watchlistDbService.deleteBundle(code);
        return Result.success();
    }

    @PostMapping("/{code}/activate")
    @Operation(summary = "设为当前 WinCC 拉取套（database 模式且 is_active=1）")
    public Result<Void> activate(@PathVariable String code) {
        watchlistDbService.activateBundle(code);
        return Result.success();
    }

    @PatchMapping("/{code}/poll-enabled")
    @Operation(summary = "分区开关：是否参与 WinCC 合并拉数（大量变量时可关闭部分分区）")
    public Result<Void> setPollEnabled(@PathVariable String code, @RequestBody TelemetryWatchlistPollPatchRequest body) {
        if (body.getIncludeInWinccPoll() == null) {
            throw new IllegalArgumentException("includeInWinccPoll 不能为空");
        }
        watchlistDbService.setBundleIncludeInWinccPoll(code, body.getIncludeInWinccPoll());
        return Result.success();
    }

    @GetMapping("/{code}/tags/all")
    @Operation(summary = "列出套内全部变量行（管理端表格，建议 &lt; 5000 行）")
    public Result<List<TelemetryWatchlistTagDto>> listAllTags(@PathVariable String code) {
        return Result.success(watchlistDbService.listAllTagsForAdmin(code));
    }

    @GetMapping("/{code}/tags")
    @Operation(summary = "分页查询变量行（筛选 q 匹配点名或展示名）")
    public Result<TelemetryWatchlistTagPageDto> pageTags(
            @PathVariable String code,
            @RequestParam(value = "page", defaultValue = "1") int page,
            @RequestParam(value = "size", defaultValue = "50") int size,
            @RequestParam(value = "q", required = false) String q) {
        return Result.success(watchlistDbService.pageTags(code, page, size, q));
    }

    @PatchMapping("/{code}/tags/{id}/alarm-overrides")
    @Operation(summary = "PATCH 单点报警上下限覆盖（覆盖全局限后再评估越界）")
    public Result<TelemetryWatchlistTagDto> patchTagAlarmOverrides(
            @PathVariable String code,
            @PathVariable long id,
            @RequestBody TelemetryWatchlistTagAlarmOverridePatchDto body) {
        TelemetryWatchlistTagDto saved = watchlistDbService.updateTagAlarmOverrides(code, id, body);
        telemetrySnapshotService.reapplyWatchlistEnrichmentToCachedSnapshot();
        return Result.success(saved);
    }

    @PutMapping("/{code}/tags")
    @Operation(summary = "整表替换变量行（适合前端表格保存）")
    public Result<Map<String, Object>> replaceTags(
            @PathVariable String code,
            @RequestParam(value = "sourceFilename", required = false) String sourceFilename,
            @RequestBody List<TelemetryWatchlistTagWriteDto> body) {
        int n = watchlistDbService.replaceAllTags(code, body, sourceFilename);
        telemetrySnapshotService.reapplyWatchlistEnrichmentToCachedSnapshot();
        return Result.success(Map.of("saved", n));
    }

    @PostMapping("/{code}/import")
    @Operation(summary = "从 CSV 文本导入并替换（JSON 体，适合小文件）")
    public Result<Map<String, Object>> importCsv(
            @PathVariable String code,
            @RequestBody TelemetryWatchlistImportRequest body) {
        int n = watchlistDbService.importCsvText(code, body.getSourceFilename(), body.getCsvText());
        telemetrySnapshotService.reapplyWatchlistEnrichmentToCachedSnapshot();
        return Result.success(Map.of("imported", n));
    }

    @PostMapping(value = "/{code}/import-file", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary = "一键上传 CSV 文件导入（不入库工程目录，推荐）")
    public Result<Map<String, Object>> importCsvFile(
            @PathVariable String code,
            @RequestParam("file") MultipartFile file) throws java.io.IOException {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("请选择 CSV 文件");
        }
        String fn = file.getOriginalFilename();
        String text = new String(file.getBytes(), StandardCharsets.UTF_8);
        int n = watchlistDbService.importCsvText(code, fn, text);
        telemetrySnapshotService.reapplyWatchlistEnrichmentToCachedSnapshot();
        return Result.success(Map.of("imported", n));
    }
}
