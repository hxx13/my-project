package com.example.demo.modules.nhp.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.nhp.service.NhpSeedService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/** NHP 种子数据手动触发（幂等）。 */
@RestController
@RequestMapping("/api/nhp")
@Tag(name = "NHP 种子数据", description = "配置表 + 码表 + 联动 幂等灌入")
public class NhpSeedController {

    private final NhpSeedService seedService;

    public NhpSeedController(NhpSeedService seedService) {
        this.seedService = seedService;
    }

    @PostMapping("/seed")
    @Operation(summary = "执行种子数据（幂等，重复调用无副作用）")
    public Result<Map<String, Integer>> seed() {
        return Result.success(seedService.seedAll());
    }

    @PostMapping("/seed/pig-dictionary")
    @Operation(summary = "重导入内置猪字段字典（同步/冻结种子字段、按字段重建 D1–D10 大纲、清理误种 DD* 原子）")
    public Result<Map<String, Object>> reimportPigDictionary() {
        return Result.success(seedService.reimportPigDictionary());
    }

    @PostMapping("/seed/atoms")
    @Operation(summary = "导入内置原子种子（nhp-atoms.json：套/字段/45 域原子 DRAFT + 题目模板；幂等补缺失）")
    public Result<Map<String, Integer>> seedAtoms() {
        Map<String, Integer> stat = new java.util.LinkedHashMap<>();
        stat.put("atoms", seedService.seedAtomsFromPriorityJson());
        return Result.success(stat);
    }

    @PostMapping("/seed/composite")
    @Operation(summary = "导入内置组合模板 nhp-crf（钉住全部原子并发布；幂等补缺失结构）")
    public Result<Map<String, Integer>> seedComposite() {
        Map<String, Integer> stat = new java.util.LinkedHashMap<>();
        stat.put("composite", seedService.seedCompositeTemplate());
        return Result.success(stat);
    }
}
