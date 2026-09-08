package com.example.demo.modules.training.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.training.mapper.PersonQualificationMapper;
import com.example.demo.modules.training.service.QualificationReportService;
import com.example.demo.modules.training.service.TrainingService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/** 学生端培训报名。trainee_id 一律由 token 反解，前端不传。 */
@RestController
@RequestMapping("/api/student/training")
public class StudentTrainingController {

    private final TrainingService service;
    private final AuthContextService authContextService;
    private final HttpServletRequest request;
    private final PersonQualificationMapper qualificationMapper;
    private final QualificationReportService reportService;

    public StudentTrainingController(TrainingService service,
                                     AuthContextService authContextService,
                                     HttpServletRequest request,
                                     PersonQualificationMapper qualificationMapper,
                                     QualificationReportService reportService) {
        this.service = service;
        this.authContextService = authContextService;
        this.request = request;
        this.qualificationMapper = qualificationMapper;
        this.reportService = reportService;
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

    /** 我的资格（含健康报告是否已归档）。 */
    @GetMapping("/qualifications")
    public Result<?> myQualifications() {
        User user = resolveUser();
        if (user == null) return Result.fail(401, "未登录");
        return Result.success(qualificationMapper.listByItem("health_report", List.of(user.getId())));
    }

    /** 预览我自己的资格报告 PDF。 */
    @GetMapping("/qualifications/{itemKey}/report")
    public ResponseEntity<byte[]> myReport(@PathVariable String itemKey) {
        User user = resolveUser();
        if (user == null) return ResponseEntity.status(401).build();
        try {
            byte[] pdf = reportService.load(user.getId(), itemKey);
            return ResponseEntity.ok()
                    .header("Content-Type", "application/pdf")
                    .header("Content-Disposition", "inline; filename=\"report.pdf\"")
                    .body(pdf);
        } catch (IllegalStateException e) {
            return ResponseEntity.status(404).build();
        }
    }

    private User resolveUser() {
        return authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
    }
}
