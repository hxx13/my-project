package com.example.demo.modules.telemetry.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.telemetry.animalroom.dto.FacilityLayoutRulesV1;
import com.example.demo.modules.telemetry.service.TelemetryFacilityLayoutRulesService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 动物房设施布局规则（与系统设置 telemetry_facility 同源）；供 Web 与 Hub 侧 Java 服务缓存一致。
 */
@RestController
@RequestMapping("/api/v1/telemetry")
@CrossOrigin(origins = "*")
@Tag(name = "动物房设施布局", description = "折叠与标题分级等 JSON 配置")
public class TelemetryFacilityLayoutController {

    private final TelemetryFacilityLayoutRulesService facilityLayoutRulesService;

    public TelemetryFacilityLayoutController(TelemetryFacilityLayoutRulesService facilityLayoutRulesService) {
        this.facilityLayoutRulesService = facilityLayoutRulesService;
    }

    @GetMapping("/facility-layout-rules")
    @Operation(summary = "获取设施布局有效规则（已合并默认）")
    public Result<FacilityLayoutRulesV1> getEffectiveRules() {
        return Result.success(facilityLayoutRulesService.getEffectiveRulesV1());
    }
}
