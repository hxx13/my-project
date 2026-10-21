package com.example.demo.modules.training.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.training.service.LearningVideoService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/** 管理端学习视频库：上传后的登记、播放规则配置、上下架。 */
@RestController
@RequestMapping("/api/admin/learning-videos")
public class LearningVideoAdminController {

    private final LearningVideoService service;
    private final AuthContextService authContextService;
    private final HttpServletRequest request;

    public LearningVideoAdminController(LearningVideoService service,
                                        AuthContextService authContextService,
                                        HttpServletRequest request) {
        this.service = service;
        this.authContextService = authContextService;
        this.request = request;
    }

    @GetMapping
    public Result<?> list() {
        if (resolveUser() == null) return Result.fail(401, "未登录");
        return Result.success(service.listAll());
    }

    @PostMapping
    public Result<?> create(@RequestBody Map<String, Object> body) {
        User user = resolveUser();
        if (user == null) return Result.fail(401, "未登录");
        try {
            return Result.success(service.create(body, user.getId()));
        } catch (IllegalArgumentException e) {
            return Result.fail(400, e.getMessage());
        }
    }

    @PutMapping("/{id}")
    public Result<?> update(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        if (resolveUser() == null) return Result.fail(401, "未登录");
        var updated = service.update(id, body);
        return updated == null ? Result.fail(404, "视频不存在") : Result.success(updated);
    }

    @DeleteMapping("/{id}")
    public Result<?> delete(@PathVariable Long id) {
        if (resolveUser() == null) return Result.fail(401, "未登录");
        return Result.success(Map.of("ok", service.delete(id) > 0));
    }

    private User resolveUser() {
        return authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
    }
}
