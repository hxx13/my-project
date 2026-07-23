package com.example.demo.modules.analytics.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.twin.common.mapper.TwinDashboardMapper;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/analytics")
@Tag(name = "订单统计", description = "订单数据统计看板")
public class OrderAnalyticsController {

    private final TwinDashboardMapper dashboardMapper;
    private final AuthContextService authContextService;

    public OrderAnalyticsController(TwinDashboardMapper dashboardMapper, AuthContextService authContextService) {
        this.dashboardMapper = dashboardMapper;
        this.authContextService = authContextService;
    }

    @GetMapping("/order-analytics/report")
    @Operation(summary = "订单统计看板全量数据")
    public Result<Map<String, Object>> getReport(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @RequestParam(required = false) String piName,
            @RequestParam(required = false) String departmentName,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate,
            @RequestParam(required = false) String consumeType,
            @RequestParam(required = false) String room,
            @RequestParam(required = false) String areaName,
            @RequestParam(required = false) List<String> orderStates) {

        Result<?> err = requireStaff(auth);
        if (err != null) {
            return Result.error(err.getMessage());
        }

        Map<String, Object> result = new HashMap<>();
        result.put("summary", dashboardMapper.getOrderAnalyticsSummary(
                piName, departmentName, startDate, endDate, consumeType, room, areaName, orderStates));
        result.put("supplierStrainSpec", dashboardMapper.getOrderAnalyticsSupplierStrainSpec(
                piName, departmentName, startDate, endDate, consumeType, room, areaName, orderStates));
        result.put("byPiCollectors", dashboardMapper.getOrderAnalyticsByPiCollectors(
                piName, departmentName, startDate, endDate, consumeType, room, areaName, orderStates));
        result.put("departmentStrain", dashboardMapper.getOrderAnalyticsDepartmentStrain(
                piName, departmentName, startDate, endDate, consumeType, room, areaName, orderStates));
        result.put("projectStrain", dashboardMapper.getOrderAnalyticsProjectStrain(
                piName, departmentName, startDate, endDate, consumeType, room, areaName, orderStates));
        return Result.success(result);
    }

    @GetMapping("/order-analytics/filters")
    @Operation(summary = "筛选器选项")
    public Result<Map<String, Object>> getFilterOptions(
            @RequestHeader(value = "Authorization", required = false) String auth) {

        Result<?> err = requireStaff(auth);
        if (err != null) {
            return Result.error(err.getMessage());
        }

        Map<String, Object> result = new HashMap<>();
        result.put("piNames", dashboardMapper.getOrderAnalyticsDistinctPis());
        result.put("departments", dashboardMapper.getOrderAnalyticsDistinctDepartments());
        result.put("consumeTypes", dashboardMapper.getOrderAnalyticsDistinctConsumeTypes());
        result.put("rooms", dashboardMapper.getOrderAnalyticsDistinctRooms());
        result.put("areaNames", dashboardMapper.getOrderAnalyticsDistinctAreas());
        result.put("orderStates", dashboardMapper.getOrderAnalyticsDistinctOrderStates());
        return Result.success(result);
    }

    private User resolveUser(String authorization) {
        return authContextService.resolveUserFromBearer(authorization);
    }

    private Result<?> requireStaff(String authorization) {
        User user = resolveUser(authorization);
        if (user == null) {
            return Result.error("未登录");
        }
        RoleEnum role = user.getRole() != null ? user.getRole() : RoleEnum.MEMBER;
        if (role.getLevel() < RoleEnum.STAFF.getLevel()) {
            return Result.error("需要教职工及以上权限");
        }
        return null;
    }
}
