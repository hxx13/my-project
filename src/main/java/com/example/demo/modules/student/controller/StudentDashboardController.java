package com.example.demo.modules.student.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.student.dto.StudentDashboardResponse;
import com.example.demo.modules.student.service.StudentDashboardService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletRequest;

@RestController
@RequestMapping("/api/student")
@Tag(name = "学生仪表盘", description = "学生端仪表盘数据聚合接口")
public class StudentDashboardController {

    private final AuthContextService authContextService;
    private final StudentDashboardService studentDashboardService;

    public StudentDashboardController(AuthContextService authContextService,
                                       StudentDashboardService studentDashboardService) {
        this.authContextService = authContextService;
        this.studentDashboardService = studentDashboardService;
    }

    @GetMapping("/dashboard")
    @Operation(summary = "获取学生仪表盘聚合数据")
    public Result<StudentDashboardResponse> getDashboard(HttpServletRequest request) {
        User user = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (user == null) {
            return Result.fail(401, "未登录或登录已过期");
        }
        StudentDashboardResponse dashboard = studentDashboardService.buildDashboard(user);
        return Result.success(dashboard);
    }

    @GetMapping("/ai-profile")
    @Operation(summary = "获取当前学生的 AI 行为预测画像")
    public Result<?> getAiProfile(HttpServletRequest request) {
        User user = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (user == null) {
            return Result.fail(401, "未登录或登录已过期");
        }
        return Result.success(studentDashboardService.getAiPredictions(user.getId()));
    }

    @GetMapping("/activity")
    @Operation(summary = "获取学生所在课题组的活跃度概览 + 个人活跃度")
    public Result<?> getActivity(HttpServletRequest request) {
        User user = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (user == null) {
            return Result.fail(401, "未登录或登录已过期");
        }
        return Result.success(studentDashboardService.getStudentActivity(user));
    }
}
