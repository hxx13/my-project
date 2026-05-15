package com.example.demo.modules.twin.controller;

import com.example.demo.modules.aro.dto.RpgStatsDto;
import com.example.demo.modules.twin.service.RpgDatabaseService;
import com.example.demo.modules.twin.service.RpgEngineService;
import com.example.demo.modules.twin.service.JobExecutionRegistry;
import com.example.demo.modules.twin.service.JobSchedulerService;
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

    // 💥 注入刚才新建的专属服务
    @Autowired
    private RpgDatabaseService rpgDatabaseService;
    @Autowired
    private JobSchedulerService jobSchedulerService;

    @GetMapping("/exp/{userId}")
    @Operation(summary = "查询用户经验值")
    public RpgStatsDto getUserExp(@PathVariable String userId) {
        // 使用专属服务查库
        double historicalExp = rpgDatabaseService.getUserTotalExp(userId);
        return rpgEngineService.calculateRealtimeExp(userId, historicalExp);
    }

    // 💥 新增：一键触发历史大结算
    @GetMapping("/recalculate-all")
    @Operation(summary = "重算全量历史经验")
    public String recalculateAll() {
        jobSchedulerService.runManual(JobExecutionRegistry.JOB_RPG_RECALC, "manual-api");
        return "全量经验重算已执行";
    }

    // 💥 暴露给前端的“全量同步人员库”核弹按钮接口
    @PostMapping("/personnel/sync-all") // 注意对应你前端写的路径，如果前面有类级别的 @RequestMapping 请留意拼接
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
}