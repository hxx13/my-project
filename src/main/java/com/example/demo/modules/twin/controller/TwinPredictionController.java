package com.example.demo.modules.twin.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.twin.mapper.TwinDashboardMapper;
import com.example.demo.modules.twin.service.JobExecutionRegistry;
import com.example.demo.modules.twin.service.JobSchedulerService;
import com.example.demo.modules.twin.service.RoomConfigService;
import com.example.demo.modules.twin.service.TwinPredictionEngineService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.TemporalAdjusters;
import java.util.*;

@RestController
@RequestMapping("/api/v1/twin/prediction")
@CrossOrigin("*")
@Tag(name = "预测中心", description = "预测面板与容量配置接口")
public class TwinPredictionController {

    @Autowired
    private TwinPredictionEngineService predictionEngine;

    @Autowired
    private TwinDashboardMapper dashboardMapper; // 确保引入了 Mapper

    @Autowired
    private TwinPredictionEngineService predictionEngineService;

    @Autowired
    private RoomConfigService roomConfigService;
    @Autowired
    private JobSchedulerService jobSchedulerService;

    /**
     * 🛠️ 接口 1：手动触发模型重算 (后台调试用)
     * @param userId 可选，传具体的 ID 算单人，不传或传 "ALL" 算所有人
     */
    @GetMapping("/admin/trigger")  // ✅ 改成 GetMapping，让浏览器能直接访问！
    @Operation(summary = "触发预测模型计算")
    public Map<String, Object> triggerModelCalculation(@RequestParam(defaultValue = "ALL") String userId) {
        Map<String, Object> response = new HashMap<>();
        jobSchedulerService.runManual(JobExecutionRegistry.JOB_MODEL_RECALC, "manual-api");
        response.put("code", 200);
        response.put("msg", "预测模型已在后台启动计算，请查看服务器日志");
        return response;
    }

    /**
     * 📊 接口 2：获取大屏智能分析面板全量数据 (极速接口，直读结果表)
     * @param userId 必填，当前扫码用户的 ID
     * @param roomId 必填，当前所在的房间 ID
     */
    @GetMapping("/dashboard")
    @Operation(summary = "获取预测看板数据")
    public Map<String, Object> getPredictionDashboard(@RequestParam String userId, @RequestParam String roomId) {
        Map<String, Object> response = new HashMap<>();

        String dayType = "ALL_DAYS";

        // 从高性能表里极速捞取对应模型数据
        List<Map<String, Object>> records = dashboardMapper.getPredictionDashboardRecords(userId, roomId, dayType);

        if (records.isEmpty()) {
            response.put("code", 404);
            response.put("msg", "暂无该人员在此房间的预测模型数据");
            return response;
        }

        Map<String, Object> row = records.get(0);
        Map<String, Object> data = new HashMap<>();

        // 🎯 核心预测：时长与极值
        data.put("medianDurationMins", row.get("median_duration_mins"));
        data.put("peakEntryTime", row.get("peak_entry_time"));

        // 🎯 风险预警模块
        double overtimeProb = row.get("overtime_prob") != null ? ((Number) row.get("overtime_prob")).doubleValue() : 0.0;
        data.put("overtimeProb", overtimeProb);
        if (overtimeProb > 0.6) {
            data.put("alertMsg", "基于历史概率(" + (int)(overtimeProb * 100) + "%)，该人员今日极可能推迟离开，请注意空间能耗。");
        } else {
            data.put("alertMsg", "按时离开概率较高。");
        }

        // 曲线：仅由「当日进+当日离」成对会话统计；07–19 为条件概率质量（和为 1），其余小时为 0
        data.put("entryCurve", row.get("entry_curve_json"));
        data.put("exitCurve", row.get("exit_curve_json"));
        data.put("curveHourWindow", "07-19");
        data.put("sessionPairing", "same_day_fifo");

        // 周一至周日：加权平均入场/离场时刻（0-24），用于「两条线 + 带状区域」展示
        data.put("weeklyEntryCurve", row.get("weekly_entry_curve_json"));
        data.put("weeklyExitCurve", row.get("weekly_exit_curve_json"));
        data.put("weeklyCurveKind", "weekday_avg_time_band");
        LocalDate weeklyClosedTo = LocalDate.now().with(TemporalAdjusters.previous(DayOfWeek.MONDAY)).minusDays(1);
        data.put("weeklyClosedTo", weeklyClosedTo.toString());

        // 🎯 轨迹推演 (马尔可夫链结果)
        data.put("nextRoomPrediction", row.get("next_room_prob_json"));

        // 🎯 标注是否为算法推算出来的替身数据
        data.put("isColdStart", row.get("is_cold_start"));

        response.put("code", 200);
        response.put("data", data);
        return response;
    }

    /**
     * 查询某用户在预测快照表里的可用房间列表（与 day_type 口径一致）。
     */
    @GetMapping("/rooms")
    @Operation(summary = "查询用户可用预测房间")
    public Result<?> getPredictionRoomsByUser(@RequestParam String userId) {
        String dayType = "ALL_DAYS";
        List<Map<String, Object>> rooms = dashboardMapper.getPredictionRoomsByUser(userId, dayType);
        return Result.success(rooms);
    }

    /**
     * 👁️ 接口：在控制台打印预测结果（调试验毒专用）
     */
    @GetMapping("/admin/print-console")
    @Operation(summary = "打印预测结果到控制台")
    public String printPredictionToConsole(@RequestParam(defaultValue = "10") int limit) {
        // 调用 Service 中的打印方法
        predictionEngineService.printPredictionResultsToConsole(limit);
        return "请查看 IDEA / 服务器后端控制台，预测面板已生成！";
    }
    /**
     * 🖥️ 接口 3：为前端控制台提供预测数据分页列表
     */
    @GetMapping("/admin/list")
    @Operation(summary = "分页查询预测结果")
    public Map<String, Object> getPredictionList(@RequestParam(defaultValue = "1") int page,
                                                 @RequestParam(defaultValue = "100") int size,
                                                 @RequestParam(required = false, defaultValue = "") String keyword) {
        int offset = (page - 1) * size;
        // 把 keyword 传给 Mapper
        List<Map<String, Object>> list = dashboardMapper.getDebugPredictionList(keyword, size, offset);
        int total = dashboardMapper.getPredictionTotalCount(keyword);

        Map<String, Object> result = new HashMap<>();
        result.put("data", list);
        result.put("total", total);

        Map<String, Object> response = new HashMap<>();
        response.put("code", 200);
        response.put("msg", "success");
        response.put("data", result);
        return response;
    }

    /**
     * 1. 触发手动重算宏观课题组热力图 (上帝按钮)
     */
    @GetMapping("/admin/recalc-group")
    @Operation(summary = "触发课题组重算")
    public Result<?> triggerGroupRecalc(@RequestParam(defaultValue = "ALL") String groupName) {
        jobSchedulerService.runManual(JobExecutionRegistry.JOB_GROUP_RECALC, "manual-api");
        return Result.success("已在后台启动宏观课题组空间测算流水线，请查看控制台日志！");
    }

    @GetMapping("/room-list")
    @Operation(summary = "查询可选房间列表")
    public Result<?> getRoomList() {
        // 💥 下拉列表只显示真正的物理单间（比如 201A），隐藏虚拟套间
        List<Map<String, Object>> list = dashboardMapper.getRoomListForPrediction();
        return Result.success(list);
    }

    @GetMapping("/group-heatmap")
    @Operation(summary = "查询房间与套间热力图")
    public Result<?> getRoomGroupHeatmap(@RequestParam String roomId) {
        // 1. 根据前端传来的 201A，查出它的名字 "[浦东] 201A"
        String fullRoomName = "";
        try { fullRoomName = dashboardMapper.getGroupRoomNameById(roomId); } catch (Exception e) {}

        // 2. 智能反向推导套间 ID (SUITE_浦东_201)
        String areaName = "未知校区";
        String baseName = fullRoomName;
        if (fullRoomName.startsWith("[")) {
            int endBracket = fullRoomName.indexOf("]");
            areaName = fullRoomName.substring(1, endBracket);
            baseName = fullRoomName.substring(endBracket + 1).trim();
        }
        // 💥 保持与计算引擎绝对一致的提取逻辑
        String suiteName = baseName;
        if (suiteName.contains("地下E11C")) {
            suiteName = "地下E11C";
        } else if (suiteName.contains("-")) {
            String[] parts = suiteName.split("-");
            if (parts[0].matches(".*[a-zA-Z].*") && parts[parts.length - 1].matches(".*[0-9].*")) {
                suiteName = parts[parts.length - 1].replaceAll("(?i)([A-Z]*[0-9]+)[A-Z]*.*", "$1");
            } else {
                suiteName = parts[0].replaceAll("(?i)([A-Z]*[0-9]+)[A-Z]*.*", "$1");
            }
        } else {
            suiteName = suiteName.replaceAll("(?i)([A-Z]*[0-9]+)[A-Z]*.*", "$1");
        }
        String suiteId = "SUITE_" + areaName + "_" + suiteName;
        String suiteNameDisplay = "[" + areaName + "] " + suiteName + "套间总量控制";

        // 3. 一次性把 单间 和 母套间 的数据全部拉出来！
        List<Map<String, Object>> data = dashboardMapper.getGroupHeatmapByRoomIds(roomId, suiteId);

        List<Map<String, Object>> roomData = new ArrayList<>();
        List<Map<String, Object>> suiteData = new ArrayList<>();

        for (Map<String, Object> row : data) {
            String json = (String) row.get("heatmap_matrix_json");
            if (json != null) {
                row.put("heatmapMatrix", com.alibaba.fastjson2.JSON.parseArray(json, double[].class));
                row.remove("heatmap_matrix_json");
            }
            if (suiteId.equals(row.get("room_id"))) suiteData.add(row);
            else roomData.add(row);
        }

        // 4. 打包给前端
        Map<String, Object> result = new HashMap<>();
        result.put("roomData", roomData);
        result.put("suiteData", suiteData);
        result.put("suiteId", suiteId);
        result.put("suiteName", suiteNameDisplay);
        return Result.success(result);
    }

    /**
     * 🚪 4. 获取指定房间的人数上限 (默认给 15 人)
     */
    @GetMapping("/room-capacity")
    @Operation(summary = "查询房间容量")
    public Result<?> getRoomCapacity(
            @RequestParam String roomId,
            @RequestParam(required = false) String physicalRoomName) {
        try {
            Integer fromConfig = roomConfigService.resolveCapacityForHeatmap(roomId, physicalRoomName);
            if (fromConfig != null && fromConfig > 0) {
                return Result.success(fromConfig);
            }
            Integer cap = dashboardMapper.getRoomCapacityByRoomId(roomId);
            if (cap != null && cap > 0) {
                return Result.success(cap);
            }
            return Result.success(15);
        } catch (Exception e) {
            return Result.success(15);
        }
    }

    /**
     * 🚪 5. 前端写入：动态修改房间人数上限
     */
    @PostMapping("/room-capacity")
    @Operation(summary = "设置房间容量")
    public Result<?> setRoomCapacity(@RequestBody Map<String, Object> payload) {
        String roomId = payload.get("roomId").toString();
        Integer capacity = Integer.parseInt(payload.get("capacity").toString());
        String physicalRoomName = payload.get("physicalRoomName") != null
                ? String.valueOf(payload.get("physicalRoomName"))
                : null;
        roomConfigService.updateCapacityFromHeatmap(roomId, physicalRoomName, capacity);
        return Result.success("容量更新成功！");
    }


}