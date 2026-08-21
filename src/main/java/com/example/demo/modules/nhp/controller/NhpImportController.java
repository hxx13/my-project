package com.example.demo.modules.nhp.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.nhp.entity.CrfImportBatch;
import com.example.demo.modules.nhp.service.NhpImportService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/** NHP 数据导入（双轨采集 + 仪器 CSV）。 */
@RestController
@RequestMapping("/api/nhp/imports")
@Tag(name = "NHP 数据导入", description = "导入批次 + 校验 + 执行")
public class NhpImportController {

    private final NhpImportService service;

    public NhpImportController(NhpImportService service) {
        this.service = service;
    }

    @PostMapping("/batches")
    @Operation(summary = "创建导入批次")
    public Result<CrfImportBatch> createBatch(@RequestBody Map<String, Object> body) {
        return service.createBatch(body);
    }

    @PostMapping("/batches/{batchId}/validate")
    @Operation(summary = "校验（复用规则引擎）")
    public Result<?> validate(@PathVariable Long batchId) {
        return service.validate(batchId);
    }

    @PostMapping("/batches/{batchId}/import")
    @Operation(summary = "执行导入")
    public Result<?> execute(@PathVariable Long batchId) {
        return service.execute(batchId);
    }
}
