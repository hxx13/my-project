package com.example.demo.modules.analytics.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.analytics.service.StudentActivityService;
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
    @Operation(summary = "课题组搜索建议")
    public Result<Map<String, Object>> listGroups(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @RequestParam(required = false) String keyword) {
        if (authContextService.resolveUserFromBearer(auth) == null) return Result.error("未登录");
        List<Map<String, Object>> groups = studentActivityService.listGroups(keyword);
        Map<String, Object> data = new HashMap<>();
        data.put("groups", groups);
        return Result.success(data);
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
        if (authContextService.resolveUserFromBearer(auth) == null) return Result.error("未登录");
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
        if (authContextService.resolveUserFromBearer(auth) == null) return Result.error("未登录");
        return Result.success(studentActivityService.heatmap(groupName, startTime, endTime));
    }

    @GetMapping("/daily-trend")
    @Operation(summary = "日趋势数据")
    public Result<List<Map<String, Object>>> dailyTrend(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @RequestParam String groupName,
            @RequestParam String startTime,
            @RequestParam String endTime) {
        if (authContextService.resolveUserFromBearer(auth) == null) return Result.error("未登录");
        return Result.success(studentActivityService.dailyTrend(groupName, startTime, endTime));
    }
}
