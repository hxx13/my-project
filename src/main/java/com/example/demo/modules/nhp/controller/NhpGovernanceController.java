package com.example.demo.modules.nhp.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.nhp.service.NhpGovernanceQueryService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * NHP 治理侧全局读接口：审计日志 / 快照 / 总览 / 通知。
 * 与既有 per-record 审计、快照接口并存。
 */
@RestController
@RequestMapping("/api/nhp")
@Tag(name = "NHP 治理读侧", description = "全局审计/快照/总览/通知")
public class NhpGovernanceController {

    private final NhpGovernanceQueryService service;

    public NhpGovernanceController(NhpGovernanceQueryService service) {
        this.service = service;
    }

    @GetMapping("/data-audit-log")
    @Operation(summary = "数据变更审计（全局）")
    public Result<List<Map<String, Object>>> dataAuditLog(
            @RequestParam(value = "limit", required = false, defaultValue = "200") int limit) {
        return Result.success(service.listDataAuditLog(limit));
    }

    @GetMapping("/dict-change-log")
    @Operation(summary = "字典变更审计（全局）")
    public Result<List<Map<String, Object>>> dictChangeLog(
            @RequestParam(value = "limit", required = false, defaultValue = "200") int limit) {
        return Result.success(service.listDictChangeLog(limit));
    }

    @GetMapping("/snapshots")
    @Operation(summary = "快照列表（可带 recordId）")
    public Result<List<Map<String, Object>>> snapshots(
            @RequestParam(value = "recordId", required = false) Long recordId,
            @RequestParam(value = "limit", required = false, defaultValue = "200") int limit) {
        return Result.success(service.listSnapshots(recordId, limit));
    }

    @GetMapping("/snapshots/{id}/diff")
    @Operation(summary = "快照字段级对比")
    public Result<List<Map<String, Object>>> snapshotDiff(
            @PathVariable Long id,
            @RequestParam Long otherId) {
        return service.diffSnapshots(id, otherId);
    }

    @GetMapping("/overview")
    @Operation(summary = "研究总览驾驶舱聚合")
    public Result<Map<String, Object>> overview() {
        return Result.success(service.overview());
    }

    @GetMapping("/subjects/board")
    @Operation(summary = "病例墙卡片聚合")
    public Result<List<Map<String, Object>>> subjectBoard(
            @RequestParam(value = "armCode", required = false) String armCode) {
        return Result.success(service.listSubjectBoard(armCode));
    }

    @GetMapping("/notifications")
    @Operation(summary = "通知消息流")
    public Result<List<Map<String, Object>>> notifications(
            @RequestParam(value = "userId", required = false) String userId,
            @RequestParam(value = "limit", required = false, defaultValue = "100") int limit) {
        return Result.success(service.listNotifications(userId, limit));
    }
}
