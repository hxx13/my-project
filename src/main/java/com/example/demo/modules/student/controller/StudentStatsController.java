package com.example.demo.modules.student.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.student.dto.StudentStatsResponse;
import com.example.demo.modules.student.service.StudentStatsService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletRequest;

@RestController
@RequestMapping("/api/student")
@Tag(name = "学生统计")
public class StudentStatsController {

    private final AuthContextService authContextService;
    private final StudentStatsService studentStatsService;

    public StudentStatsController(AuthContextService authContextService,
                                   StudentStatsService studentStatsService) {
        this.authContextService = authContextService;
        this.studentStatsService = studentStatsService;
    }

    @GetMapping("/stats")
    @Operation(summary = "获取学生统计数据")
    public Result<StudentStatsResponse> getStats(@RequestParam(defaultValue = "30d") String period,
                                                  HttpServletRequest request) {
        User user = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (user == null) {
            return Result.fail(401, "未登录或登录已过期");
        }
        StudentStatsResponse stats = studentStatsService.buildStats(user, period);
        return Result.success(stats);
    }
}
