package com.example.demo.modules.student.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.student.service.StudentNotificationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;

@RestController
@RequestMapping("/api/student")
@Tag(name = "学生通知")
public class StudentNotificationController {

    private final AuthContextService authContextService;
    private final StudentNotificationService studentNotificationService;

    public StudentNotificationController(AuthContextService authContextService,
                                          StudentNotificationService studentNotificationService) {
        this.authContextService = authContextService;
        this.studentNotificationService = studentNotificationService;
    }

    @GetMapping("/notifications")
    @Operation(summary = "获取学生通知列表")
    public Result<Map<String, Object>> getNotifications(@RequestParam(defaultValue = "") String type,
                                                         @RequestParam(defaultValue = "1") int page,
                                                         @RequestParam(defaultValue = "20") int size,
                                                         HttpServletRequest request) {
        User user = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (user == null) {
            return Result.fail(401, "未登录或登录已过期");
        }
        Map<String, Object> data = studentNotificationService.getNotifications(user, type, page, size);
        return Result.success(data);
    }

    @PutMapping("/notifications/{id}/read")
    @Operation(summary = "标记通知为已读")
    public Result<Void> markRead(@PathVariable Long id,
                                  HttpServletRequest request) {
        User user = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (user == null) {
            return Result.fail(401, "未登录或登录已过期");
        }
        studentNotificationService.markRead(user, id);
        return Result.success();
    }
}
