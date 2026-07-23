package com.example.demo.modules.student.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.student.dto.StudentProfileResponse;
import com.example.demo.modules.student.service.StudentProfileService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;

@RestController
@RequestMapping("/api/student")
@Tag(name = "学生档案", description = "学生个人档案与数据接口")
public class StudentProfileController {

    private final AuthContextService authContextService;
    private final StudentProfileService studentProfileService;

    public StudentProfileController(AuthContextService authContextService,
                                    StudentProfileService studentProfileService) {
        this.authContextService = authContextService;
        this.studentProfileService = studentProfileService;
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
}
