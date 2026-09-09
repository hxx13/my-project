package com.example.demo.modules.training.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.adminfile.AdminFileTemplateService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.training.entity.HealthSurveyResponse;
import com.example.demo.modules.training.entity.LearningMaterial;
import com.example.demo.modules.training.entity.PersonQualification;
import com.example.demo.modules.training.mapper.HealthSurveyResponseMapper;
import com.example.demo.modules.training.mapper.LearningMaterialMapper;
import com.example.demo.modules.training.mapper.PersonQualificationMapper;
import com.example.demo.modules.training.service.TrainingService;
import com.fasterxml.jackson.databind.ObjectMapper;
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
    private final LearningMaterialMapper learningMaterialMapper;
    private final AdminFileTemplateService adminFileTemplateService;
    private final HealthSurveyResponseMapper healthSurveyMapper;
    private final ObjectMapper objectMapper;

    public StudentTrainingController(TrainingService service,
                                     AuthContextService authContextService,
                                     HttpServletRequest request,
                                     PersonQualificationMapper qualificationMapper,
                                     LearningMaterialMapper learningMaterialMapper,
                                     AdminFileTemplateService adminFileTemplateService,
                                     HealthSurveyResponseMapper healthSurveyMapper,
                                     ObjectMapper objectMapper) {
        this.service = service;
        this.authContextService = authContextService;
        this.request = request;
        this.qualificationMapper = qualificationMapper;
        this.learningMaterialMapper = learningMaterialMapper;
        this.adminFileTemplateService = adminFileTemplateService;
        this.healthSurveyMapper = healthSurveyMapper;
        this.objectMapper = objectMapper;
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

    /** 已上架的学习资料。 */
    @GetMapping("/learning-materials")
    public Result<?> learningMaterials() {
        User user = resolveUser();
        if (user == null) return Result.fail(401, "未登录");
        return Result.success(learningMaterialMapper.listActive());
    }

    /** 在线查看学习资料 PDF（仅已上架，inline 不下载）。 */
    @GetMapping("/learning-materials/{id}/file")
    public ResponseEntity<byte[]> learningMaterialFile(@PathVariable Long id) {
        User user = resolveUser();
        if (user == null) return ResponseEntity.status(401).build();
        LearningMaterial m = learningMaterialMapper.findById(id);
        if (m == null || m.getActive() == null || m.getActive() != 1) {
            return ResponseEntity.status(404).build();
        }
        try {
            var row = adminFileTemplateService.findForDownload(m.getFileId());
            if (row.isEmpty()) return ResponseEntity.status(404).build();
            String storageKey = String.valueOf(row.get().get("storageKey"));
            java.io.InputStream in = adminFileTemplateService.openDownloadStream(storageKey);
            return ResponseEntity.ok()
                    .header("Content-Type", "application/pdf")
                    .header("Content-Disposition", "inline; filename=\"material.pdf\"")
                    .body(in.readAllBytes());
        } catch (Exception e) {
            return ResponseEntity.status(404).build();
        }
    }

    /** 我的健康调查表答卷（未提交返回 null）。 */
    @GetMapping("/health-survey")
    public Result<?> myHealthSurvey() {
        User user = resolveUser();
        if (user == null) return Result.fail(401, "未登录");
        HealthSurveyResponse row = healthSurveyMapper.findByPersonId(user.getId());
        if (row == null) return Result.success(null);
        try {
            return Result.success(Map.of(
                    "data", objectMapper.readValue(row.getDataJson(), Map.class),
                    "submittedAt", String.valueOf(row.getSubmittedAt())));
        } catch (Exception e) {
            return Result.error("答卷解析失败");
        }
    }

    /** 提交健康调查表（覆盖式；已合格的保留合格状态）。 */
    @PutMapping("/health-survey")
    public Result<?> submitHealthSurvey(@RequestBody Map<String, Object> body) {
        User user = resolveUser();
        if (user == null) return Result.fail(401, "未登录");
        Object data = body.get("data");
        if (data == null) return Result.fail(400, "缺少 data");
        try {
            HealthSurveyResponse row = new HealthSurveyResponse();
            row.setPersonId(user.getId());
            row.setDataJson(objectMapper.writeValueAsString(data));
            healthSurveyMapper.upsert(row);

            PersonQualification existing = qualificationMapper.findByPersonAndItem(user.getId(), "health_report");
            boolean alreadyPassed = existing != null && existing.getState() != null && existing.getState() == 1;
            PersonQualification q = new PersonQualification();
            q.setPersonId(user.getId());
            q.setItemKey("health_report");
            q.setState(alreadyPassed ? 1 : 0);
            q.setFileRef("survey");
            qualificationMapper.upsert(q);
            return Result.success(Map.of("ok", true));
        } catch (Exception e) {
            return Result.error("提交失败: " + e.getMessage());
        }
    }

    private User resolveUser() {
        return authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
    }
}
