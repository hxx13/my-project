package com.example.demo.modules.nhp.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.nhp.entity.CrfQualityEvent;
import com.example.demo.modules.nhp.service.NhpQualityService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/** NHP 数据质量中心。 */
@RestController
@RequestMapping("/api/nhp/quality")
@Tag(name = "NHP 数据质量", description = "质量事件队列 + 月报 KPI")
public class NhpQualityController {

    private final NhpQualityService qualityService;

    public NhpQualityController(NhpQualityService qualityService) {
        this.qualityService = qualityService;
    }

    @GetMapping("/events")
    @Operation(summary = "质量事件队列")
    public Result<List<CrfQualityEvent>> events() {
        return Result.success(qualityService.listEvents());
    }

    @GetMapping("/monthly-report")
    @Operation(summary = "质控月报五 KPI")
    public Result<Map<String, Object>> monthlyReport() {
        return Result.success(qualityService.monthlyReport());
    }
}
