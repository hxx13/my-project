package com.example.demo.modules.student.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.student.dto.StudentProfileResponse;
import com.example.demo.modules.student.service.StudentProfileService;
import com.example.demo.modules.twin.dashboard.mapper.TwinStudentViolationMapper;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Collections;
import java.util.Map;

@RestController
@RequestMapping("/api/student")
@Tag(name = "学生档案", description = "学生个人档案与数据接口")
public class StudentProfileController {

    private final AuthContextService authContextService;
    private final StudentProfileService studentProfileService;
    // TODO: connect to real violation data
    private final TwinStudentViolationMapper twinStudentViolationMapper;

    public StudentProfileController(AuthContextService authContextService,
                                    StudentProfileService studentProfileService,
                                    TwinStudentViolationMapper twinStudentViolationMapper) {
        this.authContextService = authContextService;
        this.studentProfileService = studentProfileService;
        this.twinStudentViolationMapper = twinStudentViolationMapper;
    }

    @GetMapping("/profile")
    @Operation(summary = "获取学生个人聚合档案")
    public Result<StudentProfileResponse> getProfile(HttpServletRequest request) {
        User user = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (user == null) {
            return Result.fail(401, "未登录或登录已过期");
        }
        StudentProfileResponse profile = studentProfileService.buildProfile(user);
        return Result.success(profile);
    }

    @GetMapping("/access-records")
    @Operation(summary = "获取学生门禁记录（占位）")
    public Result<Map<String, Object>> getAccessRecords(@RequestParam(defaultValue = "1") int page,
                                                        @RequestParam(defaultValue = "20") int size) {
        Map<String, Object> data = Map.of(
                "data", Collections.emptyList(),
                "total", 0
        );
        return Result.success(data);
    }

    @GetMapping("/permissions")
    @Operation(summary = "获取学生房间权限（占位）")
    public Result<Map<String, Object>> getPermissions() {
        Map<String, Object> data = Map.of(
                "rooms", Collections.emptyList()
        );
        return Result.success(data);
    }

    @GetMapping("/violations")
    @Operation(summary = "获取学生违规记录")
    public Result<Map<String, Object>> getViolations(@RequestParam(defaultValue = "1") int page,
                                                     @RequestParam(defaultValue = "20") int size,
                                                     @RequestParam(required = false) String startDate,
                                                     @RequestParam(required = false) String endDate,
                                                     HttpServletRequest request) {
        User user = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (user == null) {
            return Result.fail(401, "未登录或登录已过期");
        }
        Map<String, Object> data = Map.of(
                "data", Collections.emptyList(),
                "total", 0
        );
        return Result.success(data);
    }
}
