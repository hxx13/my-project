package com.example.demo.modules.training.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.training.entity.HealthSurveyResponse;
import com.example.demo.modules.training.mapper.HealthSurveyResponseMapper;
import com.example.demo.modules.training.mapper.PersonQualificationMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.util.Collections;
import java.util.List;
import java.util.Map;

/** 报名资格占位（健康报告等）：人工查看/赋值合格·不合格。接口仅校验登录。 */
@RestController
@RequestMapping("/api/admin/training/qualifications")
public class PersonQualificationController {

    private static final String HEALTH_REPORT = "health_report";

    private final PersonQualificationMapper mapper;
    private final AuthContextService authContextService;
    private final HttpServletRequest request;
    private final HealthSurveyResponseMapper healthSurveyMapper;
    private final ObjectMapper objectMapper;

    public PersonQualificationController(PersonQualificationMapper mapper,
                                         AuthContextService authContextService,
                                         HttpServletRequest request,
                                         HealthSurveyResponseMapper healthSurveyMapper,
                                         ObjectMapper objectMapper) {
        this.mapper = mapper;
        this.authContextService = authContextService;
        this.request = request;
        this.healthSurveyMapper = healthSurveyMapper;
        this.objectMapper = objectMapper;
    }

    /** 批量查健康报告资格（按人）。personIds 逗号分隔。 */
    @GetMapping
    public Result<?> list(@RequestParam(required = false) String personIds) {
        if (resolveUser() == null) return Result.fail(401, "未登录");
        List<String> ids = personIds == null || personIds.isBlank()
                ? Collections.emptyList()
                : List.of(personIds.split(","));
        return Result.success(mapper.listByItem(HEALTH_REPORT, ids));
    }

    /** 人工赋值：{personId, state(1合格/2不合格)}；只改状态，不碰 file_ref */
    @PostMapping
    public Result<?> upsert(@RequestBody Map<String, Object> body) {
        if (resolveUser() == null) return Result.fail(401, "未登录");
        String personId = str(body.get("personId"));
        Integer state = body.get("state") instanceof Number n ? n.intValue() : null;
        if (personId == null || state == null) return Result.fail(400, "缺少 personId/state");
        mapper.updateStateOnly(personId, HEALTH_REPORT, state);
        return Result.success(Map.of("ok", true));
    }

    /** 查看某人的健康调查表答卷（未提交返回 null）。 */
    @GetMapping("/health-survey/{personId}")
    public Result<?> healthSurvey(@PathVariable String personId) {
        if (resolveUser() == null) return Result.fail(401, "未登录");
        HealthSurveyResponse row = healthSurveyMapper.findByPersonId(personId);
        if (row == null) return Result.success(null);
        try {
            return Result.success(Map.of(
                    "data", objectMapper.readValue(row.getDataJson(), Map.class),
                    "submittedAt", String.valueOf(row.getSubmittedAt())));
        } catch (Exception e) {
            return Result.error("答卷解析失败");
        }
    }

    private Object resolveUser() {
        return authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
    }

    private String str(Object v) {
        if (v == null) return null;
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }
}
