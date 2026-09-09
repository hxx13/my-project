package com.example.demo.modules.exam.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.exam.service.ExamSubmissionService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

/** 答卷成绩管理（管理端，exam-papers 页「成绩管理」tab）。接口仅校验登录。 */
@RestController
@RequestMapping("/api/admin/exam-submissions")
public class ExamSubmissionController {

    private final ExamSubmissionService submissionService;
    private final AuthContextService authContextService;
    private final HttpServletRequest request;

    public ExamSubmissionController(ExamSubmissionService submissionService,
                                    AuthContextService authContextService,
                                    HttpServletRequest request) {
        this.submissionService = submissionService;
        this.authContextService = authContextService;
        this.request = request;
    }

    @GetMapping
    public Result<?> list(@RequestParam(required = false) Long paperId) {
        if (resolveUser() == null) return Result.fail(401, "未登录");
        return Result.success(paperId != null ? submissionService.listByPaper(paperId) : submissionService.listAll());
    }

    @GetMapping("/{id}")
    public Result<?> get(@PathVariable Long id) {
        if (resolveUser() == null) return Result.fail(401, "未登录");
        return Result.success(submissionService.get(id));
    }

    private Object resolveUser() {
        return authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
    }
}
