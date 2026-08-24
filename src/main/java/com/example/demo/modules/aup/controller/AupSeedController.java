package com.example.demo.modules.aup.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.aup.service.AupSeedService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/** AUP 种子数据手动触发（幂等）。 */
@RestController
@RequestMapping("/api/aup-seed")
@Tag(name = "AUP 种子数据")
public class AupSeedController {

    private final AupSeedService seedService;

    public AupSeedController(AupSeedService seedService) {
        this.seedService = seedService;
    }

    @PostMapping("/seed")
    @Operation(summary = "执行种子数据（码表 + 字段 + 原子域 + 组合域；幂等，重复调用无副作用）")
    public Result<Map<String, Integer>> seed() {
        return Result.success(seedService.seedAll());
    }

    @PostMapping("/seed/codelists")
    @Operation(summary = "导入码表种子（dict/dict_item；幂等）")
    public Result<Map<String, Integer>> seedCodelists() {
        Map<String, Integer> stat = new LinkedHashMap<>();
        stat.put("codelists", seedService.seedCodelists());
        return Result.success(stat);
    }

    @PostMapping("/seed/fields")
    @Operation(summary = "导入字段字典种子（aup_field_def；幂等）")
    public Result<Map<String, Integer>> seedFields() {
        Map<String, Integer> stat = new LinkedHashMap<>();
        stat.put("fields", seedService.seedFields());
        return Result.success(stat);
    }

    @PostMapping("/seed/atoms")
    @Operation(summary = "导入原子域种子（form_template kind=ATOM + 结构；幂等）")
    public Result<Map<String, Integer>> seedAtoms() {
        Map<String, Integer> stat = new LinkedHashMap<>();
        stat.put("atoms", seedService.seedAtoms());
        return Result.success(stat);
    }

    @PostMapping("/seed/composite")
    @Operation(summary = "组装组合域 aup（钉住全部原子并发布；幂等）")
    public Result<Map<String, Integer>> seedComposite() {
        Map<String, Integer> stat = new LinkedHashMap<>();
        stat.put("composite", seedService.seedComposite());
        return Result.success(stat);
    }
}
