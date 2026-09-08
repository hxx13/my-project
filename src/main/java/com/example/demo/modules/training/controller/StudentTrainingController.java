package com.example.demo.modules.training.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.training.service.TrainingService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/** 学生端培训报名。trainee_id 一律由 token 反解，前端不传。 */
@RestController
@RequestMapping("/api/student/training")
public class StudentTrainingController {

    private final TrainingService service;
    private final AuthContextService authContextService;
    private final HttpServletRequest request;

    public StudentTrainingController(TrainingService service,
                                     AuthContextService authContextService,
                                     HttpServletRequest request) {
        this.service = service;
        this.authContextService = authContextService;
        this.request = request;
    }

    @GetMapping
    public Result<?> list() {
        User user = resolveUser();
        if (user == null) return Result.fail(401, "未登录");
        return Result.success(service.listPublishedForStudent(user.getId()));
    }

    @GetMapping("/{id}/eligibility")
    public Result<?> eligibility(@PathVariable Long id) {
        User user = resolveUser();
        if (user == null) return Result.fail(401, "未登录");
        return Result.success(service.checkEnroll(user.getId(), id));
    }

    @PostMapping("/occurrences/{occurrenceId}/enroll")
    public Result<?> enroll(@PathVariable Long occurrenceId) {
        User user = resolveUser();
        if (user == null) return Result.fail(401, "未登录");
        return Result.success(service.enroll(occurrenceId, user.getId()));
    }

    @GetMapping("/my")
    public Result<?> my() {
        User user = resolveUser();
        if (user == null) return Result.fail(401, "未登录");
        return Result.success(service.myEnrollments(user.getId()));
    }

    @DeleteMapping("/enrollments/{enrollmentId}")
    public Result<?> cancel(@PathVariable Long enrollmentId) {
        User user = resolveUser();
        if (user == null) return Result.fail(401, "未登录");
        return Result.success(Map.of("ok", service.cancelEnrollment(enrollmentId, user.getId()) > 0));
    }

    private User resolveUser() {
        return authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
    }
}
