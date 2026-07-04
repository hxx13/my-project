package com.example.demo.modules.twin.rpg.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.aro.dto.RpgStatsDto;
import com.example.demo.modules.twin.rpg.service.RpgEngineService;
import com.example.demo.modules.twin.rpg.service.TwinExpReconcileService;
import com.example.demo.modules.twin.rpg.service.TwinExpStatsService;
import com.example.demo.modules.twin.common.service.JobExecutionRegistry;
import com.example.demo.modules.twin.common.service.JobSchedulerService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/twin/rpg")
@Tag(name = "RPG经验系统", description = "经验值计算与人员同步接口")
public class RpgController {

    @Autowired
    private RpgEngineService rpgEngineService;

    @Autowired
    private JobSchedulerService jobSchedulerService;
    @Autowired
    private TwinExpStatsService twinExpStatsService;

    @Autowired
    private TwinExpReconcileService twinExpReconcileService;

    @GetMapping("/exp/{userId}")
    @Operation(summary = "查询用户经验值")
    public RpgStatsDto getUserExp(@PathVariable String userId) {
        return rpgEngineService.calculateFullExpFromAccessLogs(userId);
    }

    // 💥 重算全量历史经验：逐日对账 aro_access_log → 写入 twin_exp_record + 更新 aro_personnel
    @GetMapping("/recalculate-all")
    @Operation(summary = "重算全量历史经验（逐日对账→写入流水→更新全员档案）")
    public Result<Map<String, Object>> recalculateAll() {
        return Result.success(twinExpReconcileService.reconcileAllHistorical());
    }

    @PostMapping("/reconcile-catch-up")
    @Operation(summary = "增量补漏经验（从已有流水最大业务日继续对账，不清空全表）")
    public Result<Map<String, Object>> reconcileCatchUp() {
        return Result.success(twinExpReconcileService.reconcileCatchUp());
    }

    // 暴露给前端的"全量同步人员库"核弹按钮接口
    @PostMapping("/personnel/sync-all")
    @Operation(summary = "全量同步ARO人员")
    public Map<String, Object> syncAllPersonnel() {
        Map<String, Object> response = new HashMap<>();
        try {
            jobSchedulerService.runManual(JobExecutionRegistry.JOB_PERSONNEL_SYNC, "manual-api");
            response.put("code", 200);
            response.put("msg", "人员全量同步已执行");
        } catch (Exception e) {
            response.put("code", 500);
            response.put("msg", "同步异常: " + e.getMessage());
        }
        return response;
    }

    @GetMapping("/exp/summary")
    @Operation(summary = "经验值统计总览")
    public Result<Map<String, Object>> getExpSummary() {
        return Result.success(twinExpStatsService.getSummary());
    }

    @GetMapping("/exp/records")
    @Operation(summary = "经验值流水明细（分页，支持异常/审核/来源筛选）")
    public Result<Map<String, Object>> getExpRecords(
            @RequestParam(defaultValue = "1") int pageNum,
            @RequestParam(defaultValue = "20") int pageSize,
            @RequestParam(required = false) String userId,
            @RequestParam(required = false) String sourceType,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate,
            @RequestParam(required = false) Integer anomalyFlag,
            @RequestParam(required = false) Integer reviewStatus,
            @RequestParam(required = false) String feedSource) {
        return Result.success(twinExpStatsService.getRecordsPageWithFilters(
                pageNum, pageSize, userId, sourceType, startDate, endDate,
                anomalyFlag, reviewStatus, feedSource));
    }
}