package com.example.demo.modules.exam.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.exam.service.ExamPaperService;
import com.example.demo.modules.exam.service.ExamSubmissionService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.util.Collections;
import java.util.Map;

/** 学生答题（独立业务）。答卷提交由后端按 config 答案评分，前端不可信。 */
@RestController
@RequestMapping("/api/student/exam")
public class StudentExamController {

    private final ExamSubmissionService submissionService;
    private final ExamPaperService paperService;
    private final AuthContextService authContextService;
    private final HttpServletRequest request;

    public StudentExamController(ExamSubmissionService submissionService,
                                 ExamPaperService paperService,
                                 AuthContextService authContextService,
                                 HttpServletRequest request) {
        this.submissionService = submissionService;
        this.paperService = paperService;
        this.authContextService = authContextService;
        this.request = request;
    }

    @GetMapping("/papers")
    public Result<?> listPapers() {
        User user = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (user == null) return Result.fail(401, "未登录");
        return Result.success(paperService.listForStudent(user.getId()));
    }

    @GetMapping("/papers/{paperId}")
    public Result<?> getPaper(@PathVariable Long paperId) {
        User user = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (user == null) return Result.fail(401, "未登录");
        Map<String, Object> paper = paperService.getForStudent(paperId, user.getId());
        if (paper == null) return Result.fail(404, "试卷不存在");
        return Result.success(paper);
    }

    @PostMapping("/papers/{paperId}/submit")
    public Result<?> submit(@PathVariable Long paperId, @RequestBody Map<String, Object> body) {
        User user = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (user == null) return Result.fail(401, "未登录");
        Map<String, Object> answers = asMap(body.get("answers"));
        String filesJson = body.get("files") == null ? null : String.valueOf(body.get("files"));
        return Result.success(submissionService.submit(paperId, user.getId(), answers, filesJson));
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> asMap(Object o) {
        if (!(o instanceof Map<?, ?> m)) return Collections.emptyMap();
        return (Map<String, Object>) m;
    }
}
