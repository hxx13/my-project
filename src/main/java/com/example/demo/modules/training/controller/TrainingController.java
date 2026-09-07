package com.example.demo.modules.training.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.training.service.TrainingService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.util.Collections;
import java.util.List;
import java.util.Map;

/** 培训管理（管理端）。写操作在 service 内按所属人/平台所有者校验。 */
@RestController
@RequestMapping("/api/admin/training")
public class TrainingController {

    private final TrainingService service;
    private final AuthContextService authContextService;
    private final HttpServletRequest request;

    public TrainingController(TrainingService service,
                              AuthContextService authContextService,
                              HttpServletRequest request) {
        this.service = service;
        this.authContextService = authContextService;
        this.request = request;
    }

    @GetMapping
    public Result<?> list(@RequestParam(defaultValue = "1") int page,
                          @RequestParam(defaultValue = "20") int pageSize,
                          @RequestParam(required = false) String keyword) {
        if (resolveUser() == null) return Result.fail(401, "未登录");
        List<Map<String, Object>> all = service.list(keyword);
        int total = all.size();
        int from = Math.max(0, (page - 1) * pageSize);
        int to = Math.min(from + pageSize, total);
        List<Map<String, Object>> slice = from < total ? all.subList(from, to) : List.of();
        return Result.success(Map.of("list", slice, "total", total,
                "page", (int) Math.ceil((double) total / pageSize)));
    }

    @PostMapping
    public Result<?> create(@RequestBody Map<String, Object> body) {
        User user = resolveUser();
        if (user == null) return Result.fail(401, "未登录");
        return Result.success(service.create(body, user.getId()));
    }

    @GetMapping("/{id}")
    public Result<?> get(@PathVariable Long id) {
        if (resolveUser() == null) return Result.fail(401, "未登录");
        Map<String, Object> data = service.get(id);
        if (data == null) return Result.fail(404, "培训不存在");
        return Result.success(data);
    }

    @PutMapping("/{id}")
    public Result<?> update(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        User user = resolveUser();
        if (user == null) return Result.fail(401, "未登录");
        return Result.success(service.update(id, body, user));
    }

    @PostMapping("/{id}/publish")
    public Result<?> publish(@PathVariable Long id) {
        User user = resolveUser();
        if (user == null) return Result.fail(401, "未登录");
        return Result.success(service.publish(id, user));
    }

    @DeleteMapping("/{id}")
    public Result<?> delete(@PathVariable Long id) {
        User user = resolveUser();
        if (user == null) return Result.fail(401, "未登录");
        int rows = service.delete(id, user);
        return Result.success(Map.of("ok", rows > 0, "rows", rows));
    }

    // ========================================================================
    // 场次
    // ========================================================================

    @PostMapping("/{id}/occurrences")
    public Result<?> addOccurrence(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        User user = resolveUser();
        if (user == null) return Result.fail(401, "未登录");
        return Result.success(service.addOccurrence(id, body, user));
    }

    @PutMapping("/occurrences/{occurrenceId}")
    public Result<?> updateOccurrence(@PathVariable Long occurrenceId, @RequestBody Map<String, Object> body) {
        User user = resolveUser();
        if (user == null) return Result.fail(401, "未登录");
        return Result.success(service.updateOccurrence(occurrenceId, body, user));
    }

    @DeleteMapping("/occurrences/{occurrenceId}")
    public Result<?> deleteOccurrence(@PathVariable Long occurrenceId) {
        User user = resolveUser();
        if (user == null) return Result.fail(401, "未登录");
        int rows = service.deleteOccurrence(occurrenceId, user);
        return Result.success(Map.of("ok", rows > 0, "rows", rows));
    }

    // ========================================================================
    // 报名
    // ========================================================================

    @GetMapping("/occurrences/{occurrenceId}/enrollments")
    public Result<?> listEnrollments(@PathVariable Long occurrenceId) {
        if (resolveUser() == null) return Result.fail(401, "未登录");
        return Result.success(service.listEnrollments(occurrenceId));
    }

    @PostMapping("/occurrences/{occurrenceId}/enrollments")
    public Result<?> addEnrollments(@PathVariable Long occurrenceId, @RequestBody Map<String, Object> body) {
        User user = resolveUser();
        if (user == null) return Result.fail(401, "未登录");
        List<Map<String, Object>> rows = listOf(body.get("rows"));
        return Result.success(service.addEnrollments(occurrenceId, rows, user));
    }

    @DeleteMapping("/enrollments/{enrollmentId}")
    public Result<?> deleteEnrollment(@PathVariable Long enrollmentId) {
        User user = resolveUser();
        if (user == null) return Result.fail(401, "未登录");
        int rows = service.deleteEnrollment(enrollmentId, user);
        return Result.success(Map.of("ok", rows > 0, "rows", rows));
    }

    @PostMapping("/enrollments/{enrollmentId}/audit")
    public Result<?> audit(@PathVariable Long enrollmentId, @RequestBody Map<String, Object> body) {
        User user = resolveUser();
        if (user == null) return Result.fail(401, "未登录");
        Integer state = toInt(body.get("state"));
        if (state == null) return Result.fail(400, "缺少 state");
        int rows = service.audit(enrollmentId, state, user);
        return Result.success(Map.of("ok", rows > 0, "rows", rows));
    }

    @PostMapping("/enrollments/{enrollmentId}/score")
    public Result<?> score(@PathVariable Long enrollmentId, @RequestBody Map<String, Object> body) {
        User user = resolveUser();
        if (user == null) return Result.fail(401, "未登录");
        Integer state = toInt(body.get("state"));
        if (state == null) return Result.fail(400, "缺少 state");
        int rows = service.score(enrollmentId, state, user);
        return Result.success(Map.of("ok", rows > 0, "rows", rows));
    }

    @PostMapping("/enrollments/{enrollmentId}/rooms")
    public Result<?> setRooms(@PathVariable Long enrollmentId, @RequestBody Map<String, Object> body) {
        User user = resolveUser();
        if (user == null) return Result.fail(401, "未登录");
        List<String> roomIds = strList(body.get("roomIds"));
        return Result.success(service.setRooms(enrollmentId, roomIds, user));
    }

    // ========================================================================
    // 内部工具
    // ========================================================================

    private User resolveUser() {
        return authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> listOf(Object o) {
        if (!(o instanceof List<?> list)) return Collections.emptyList();
        return (List<Map<String, Object>>) list.stream()
                .filter(item -> item instanceof Map<?, ?>)
                .map(item -> (Map<String, Object>) item)
                .toList();
    }

    private List<String> strList(Object o) {
        if (!(o instanceof List<?> list)) return Collections.emptyList();
        return list.stream().map(String::valueOf).toList();
    }

    private Integer toInt(Object v) {
        return v instanceof Number n ? n.intValue() : null;
    }
}
