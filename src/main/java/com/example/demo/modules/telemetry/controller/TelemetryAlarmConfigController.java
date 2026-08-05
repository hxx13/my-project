package com.example.demo.modules.telemetry.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.telemetry.dto.TelemetryAlarmConfigTreeDto;
import com.example.demo.modules.telemetry.dto.watchlist.TelemetryWatchlistTagAlarmOverridePatchDto;
import com.example.demo.modules.telemetry.entity.TelemetryAlarmPreset;
import com.example.demo.modules.telemetry.entity.TelemetryFloorAlarmConfig;
import com.example.demo.modules.telemetry.entity.TelemetrySuiteAlarmConfig;
import com.example.demo.modules.telemetry.mapper.TelemetryAlarmPresetMapper;
import com.example.demo.modules.telemetry.mapper.TelemetryWatchlistTagMapper;
import com.example.demo.modules.telemetry.service.TelemetryAlarmConfigService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/telemetry/alarm-config")
@Tag(name = "动物房报警配置", description = "楼层/套间报警开关与阈值管理")
public class TelemetryAlarmConfigController {

    private final TelemetryAlarmConfigService configService;
    private final TelemetryWatchlistTagMapper tagMapper;
    private final TelemetryAlarmPresetMapper presetMapper;

    public TelemetryAlarmConfigController(TelemetryAlarmConfigService configService,
                                          TelemetryWatchlistTagMapper tagMapper,
                                          TelemetryAlarmPresetMapper presetMapper) {
        this.configService = configService;
        this.tagMapper = tagMapper;
        this.presetMapper = presetMapper;
    }

    // ── 楼层 ──

    @GetMapping("/floors")
    @Operation(summary = "列出所有楼层报警配置")
    public Result<List<TelemetryFloorAlarmConfig>> listFloors() {
        return Result.success(configService.listFloors());
    }

    @GetMapping("/floors/{floorCode}")
    @Operation(summary = "获取单个楼层报警配置")
    public Result<TelemetryFloorAlarmConfig> getFloor(@PathVariable String floorCode) {
        return Result.success(configService.getFloorByCode(floorCode));
    }

    @PutMapping("/floors")
    @Operation(summary = "保存楼层报警配置（新增或更新）")
    public Result<TelemetryFloorAlarmConfig> saveFloor(@RequestBody TelemetryFloorAlarmConfig config) {
        return Result.success(configService.saveFloor(config));
    }

    @PutMapping("/floors/{id}/enabled")
    @Operation(summary = "切换楼层报警开关")
    public Result<Void> setFloorEnabled(@PathVariable Long id, @RequestParam boolean enabled) {
        configService.setFloorEnabled(id, enabled);
        return Result.success();
    }

    // ── 套间 ──

    @GetMapping("/floors/{floorCode}/suites")
    @Operation(summary = "列出某楼层下所有套间报警配置")
    public Result<List<TelemetrySuiteAlarmConfig>> listSuites(@PathVariable String floorCode) {
        return Result.success(configService.listSuitesByFloor(floorCode));
    }

    @GetMapping("/suites/{suiteNorm}")
    @Operation(summary = "获取单个套间报警配置")
    public Result<TelemetrySuiteAlarmConfig> getSuite(@PathVariable String suiteNorm) {
        return Result.success(configService.getSuiteByNorm(suiteNorm));
    }

    @PutMapping("/suites")
    @Operation(summary = "保存套间报警配置（新增或更新）")
    public Result<TelemetrySuiteAlarmConfig> saveSuite(@RequestBody TelemetrySuiteAlarmConfig config) {
        return Result.success(configService.saveSuite(config));
    }

    @PutMapping("/suites/{id}/enabled")
    @Operation(summary = "切换套间报警开关")
    public Result<Void> setSuiteEnabled(@PathVariable Long id, @RequestParam boolean enabled) {
        configService.setSuiteEnabled(id, enabled);
        return Result.success();
    }

    // ── 聚合树（供前端一次性加载） ──

    @GetMapping("/full-tree")
    @Operation(summary = "报警配置全量树：楼层 → 套间 → 变量（含逐点阈值与有效值解析）")
    public Result<TelemetryAlarmConfigTreeDto> fullTree() {
        return Result.success(configService.buildConfigTree());
    }

    // ── 汇总（供前端一次性加载） ──

    /**
     * 返回前端需要的全部报警配置数据：
     * floors: 楼层列表（含开关、冷却时间等）
     * suites: 按 floor_code 分组的套间列表（含开关、阈值覆盖等）
     */
    @GetMapping("/full")
    @Operation(summary = "一次性返回楼层 + 套间全部报警配置")
    public Result<Map<String, Object>> fullConfig() {
        List<TelemetryFloorAlarmConfig> floors = configService.listFloors();
        java.util.Map<String, List<TelemetrySuiteAlarmConfig>> suitesByFloor = new java.util.LinkedHashMap<>();
        for (TelemetryFloorAlarmConfig f : floors) {
            suitesByFloor.put(f.getFloorCode(), configService.listSuitesByFloor(f.getFloorCode()));
        }
        return Result.success(Map.of("floors", floors, "suitesByFloor", suitesByFloor));
    }

    // ── 逐变量报警开关 ──

    @PatchMapping("/tags/{tagId}/alarm-enabled")
    @Operation(summary = "切换单个变量的报警开关（alarm_enabled：null=继承, 0=禁用, 1=启用）")
    public Result<Void> setTagAlarmEnabled(@PathVariable Long tagId,
                                           @RequestParam(required = false) Boolean enabled) {
        Integer val = enabled == null ? null : (enabled ? 1 : 0);
        tagMapper.updateAlarmEnabled(tagId, val);
        return Result.success();
    }

    // ── 逐测点报警限覆盖 ──

    @PatchMapping("/tags/{tagId}/alarm-overrides")
    @Operation(summary = "设置逐测点报警限覆盖 + 冷却时间")
    public Result<Void> setTagAlarmOverrides(@PathVariable Long tagId,
                                             @RequestBody TelemetryWatchlistTagAlarmOverridePatchDto body) {
        tagMapper.updateAlarmOverridesById(tagId, body.getAlarmOverrideMin(), body.getAlarmOverrideMax());
        if (body.getAlarmCooldownMinutes() != null) {
            tagMapper.updateAlarmCooldown(tagId, body.getAlarmCooldownMinutes());
        }
        return Result.success();
    }

    @PatchMapping("/tags/batch-alarm-overrides")
    @Operation(summary = "批量设置逐测点报警限覆盖")
    public Result<Integer> batchSetTagAlarmOverrides(@RequestBody List<TelemetryWatchlistTagAlarmOverridePatchDto> batch) {
        int count = 0;
        for (var body : batch) {
            if (body.getTagId() == null) continue;
            tagMapper.updateAlarmOverridesById(body.getTagId(),
                    body.getAlarmOverrideMin(), body.getAlarmOverrideMax());
            if (body.getAlarmCooldownMinutes() != null) {
                tagMapper.updateAlarmCooldown(body.getTagId(), body.getAlarmCooldownMinutes());
            }
            count++;
        }
        return Result.success(count);
    }

    // ── 报警预设模板 CRUD ──

    @GetMapping("/presets")
    @Operation(summary = "列出报警预设模板")
    public Result<List<TelemetryAlarmPreset>> listPresets(@RequestParam(required = false) String floorCode) {
        return Result.success(presetMapper.findAll(floorCode));
    }

    @PostMapping("/presets")
    @Operation(summary = "创建报警预设模板")
    public Result<TelemetryAlarmPreset> createPreset(@RequestBody TelemetryAlarmPreset preset) {
        presetMapper.insert(preset);
        return Result.success(presetMapper.findById(preset.getId()));
    }

    @PutMapping("/presets/{id}")
    @Operation(summary = "更新报警预设模板")
    public Result<TelemetryAlarmPreset> updatePreset(@PathVariable Long id, @RequestBody TelemetryAlarmPreset preset) {
        preset.setId(id);
        presetMapper.update(preset);
        return Result.success(presetMapper.findById(id));
    }

    @DeleteMapping("/presets/{id}")
    @Operation(summary = "删除报警预设模板")
    public Result<Void> deletePreset(@PathVariable Long id) {
        presetMapper.deleteById(id);
        return Result.success();
    }
}
