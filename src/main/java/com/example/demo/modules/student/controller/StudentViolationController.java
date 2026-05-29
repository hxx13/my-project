package com.example.demo.modules.student.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.student.service.StudentViolationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;

@RestController
@RequestMapping("/api/student")
@Tag(name = "学生违规记录")
public class StudentViolationController {

    private final AuthContextService authContextService;
    private final StudentViolationService studentViolationService;

    public StudentViolationController(AuthContextService authContextService,
                                       StudentViolationService studentViolationService) {
        this.authContextService = authContextService;
        this.studentViolationService = studentViolationService;
    }

    @GetMapping("/violations")
    @Operation(summary = "获取学生违规记录列表")
    public Result<Map<String, Object>> getViolations(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(defaultValue = "") String startDate,
            @RequestParam(defaultValue = "") String endDate,
            HttpServletRequest request) {
        User user = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (user == null) {
            return Result.fail(401, "未登录或登录已过期");
        }
        Map<String, Object> data = studentViolationService.getViolations(user, page, size, startDate, endDate);
        return Result.success(data);
    }
}
