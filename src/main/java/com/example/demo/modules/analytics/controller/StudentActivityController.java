package com.example.demo.modules.analytics.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.analytics.service.StudentActivityService;
import com.example.demo.modules.auth.entity.User;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api/v1/analytics/student-activity")
@Tag(name = "学生活跃度统计", description = "课题组维度成员活跃度报表")
public class StudentActivityController {

    private final AuthContextService authContextService;
    private final StudentActivityService studentActivityService;

    public StudentActivityController(AuthContextService authContextService,
                                     StudentActivityService studentActivityService) {
        this.authContextService = authContextService;
        this.studentActivityService = studentActivityService;
    }

    @GetMapping("/groups")
    @Operation(summary = "课题组分页列表（按活跃度占比降序）")
    public Result<Map<String, Object>> listGroups(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @RequestParam(required = false) String keyword,
            @RequestParam String startTime,
            @RequestParam String endTime,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "1") int size) {
        Result<?> denied = requireStaff(auth);
        if (denied != null) return Result.error(denied.getMessage());
        return Result.success(studentActivityService.listGroupsPaged(keyword, startTime, endTime, page, size));
    }

    @GetMapping("/members")
    @Operation(summary = "成员活跃度分页查询")
    public Result<Map<String, Object>> members(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @RequestParam String groupName,
            @RequestParam String startTime,
            @RequestParam String endTime,
            @RequestParam(defaultValue = "entries") String sortBy,
            @RequestParam(defaultValue = "desc") String order,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size) {
        Result<?> denied = requireStaff(auth);
        if (denied != null) return Result.error(denied.getMessage());
        Map<String, Object> data = studentActivityService.queryMemberActivity(
                groupName, startTime, endTime, sortBy, order, page, size);
        return Result.success(data);
    }

    @GetMapping("/heatmap")
    @Operation(summary = "时段热力图数据")
    public Result<List<Map<String, Object>>> heatmap(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @RequestParam String groupName,
            @RequestParam String startTime,
            @RequestParam String endTime) {
        Result<?> denied = requireStaff(auth);
        if (denied != null) return Result.error(denied.getMessage());
        return Result.success(studentActivityService.heatmap(groupName, startTime, endTime));
    }

    @GetMapping("/daily-trend")
    @Operation(summary = "日趋势数据")
    public Result<List<Map<String, Object>>> dailyTrend(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @RequestParam String groupName,
            @RequestParam String startTime,
            @RequestParam String endTime) {
        Result<?> denied = requireStaff(auth);
        if (denied != null) return Result.error(denied.getMessage());
        return Result.success(studentActivityService.dailyTrend(groupName, startTime, endTime));
    }

    private Result<?> requireStaff(String authorization) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null) {
            return Result.error("未登录");
        }
        RoleEnum role = user.getRole() != null ? user.getRole() : RoleEnum.STUDENT;
        if (role.getLevel() < RoleEnum.STAFF.getLevel()) {
            return Result.error("需要教职工及以上权限");
        }
        return null;
    }
}
