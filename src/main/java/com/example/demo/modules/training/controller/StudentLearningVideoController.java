package com.example.demo.modules.training.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.training.service.LearningVideoService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/** 学生端学习视频：列表带我的进度 + 观看心跳上报。人员身份一律由 token 反解。 */
@RestController
@RequestMapping("/api/student/learning-videos")
public class StudentLearningVideoController {

    private final LearningVideoService service;
    private final AuthContextService authContextService;
    private final HttpServletRequest request;

    public StudentLearningVideoController(LearningVideoService service,
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
        return Result.success(service.listForStudent(user.getId()));
    }

    /** 心跳：{position, watchedDelta, duration, ended} */
    @PostMapping("/{videoId}/progress")
    public Result<?> report(@PathVariable Long videoId, @RequestBody Map<String, Object> body) {
        User user = resolveUser();
        if (user == null) return Result.fail(401, "未登录");
        try {
            return Result.success(service.report(
                    user.getId(),
                    videoId,
                    intOf(body.get("position")),
                    intOf(body.get("watchedDelta")),
                    intOf(body.get("duration")),
                    Boolean.TRUE.equals(body.get("ended"))));
        } catch (IllegalArgumentException e) {
            return Result.fail(404, e.getMessage());
        }
    }

    private static Integer intOf(Object v) {
        if (v instanceof Number n) return n.intValue();
        if (v instanceof String s && !s.isBlank()) {
            try { return Integer.parseInt(s.trim()); } catch (NumberFormatException ignored) { return null; }
        }
        return null;
    }

    private User resolveUser() {
        return authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
    }
}
