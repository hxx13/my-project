package com.example.demo.modules.training.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.aro.service.AroTrainingSyncService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.training.service.TrainingService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Collections;
import java.util.List;
import java.util.Map;

/** 培训管理（管理端）。写操作在 service 内按所属人/平台所有者校验。 */
@RestController
@RequestMapping("/api/admin/training")
public class TrainingController {

    private final TrainingService service;
    private final AroTrainingSyncService syncService;
    private final AuthContextService authContextService;
    private final HttpServletRequest request;

    public TrainingController(TrainingService service,
                              AroTrainingSyncService syncService,
                              AuthContextService authContextService,
                              HttpServletRequest request) {
        this.service = service;
        this.syncService = syncService;
        this.authContextService = authContextService;
        this.request = request;
    }

    /** 手动触发一次 ARO 培训同步（拉取场次/学员写入本地 training 表） */
    @PostMapping("/sync")
    public Result<?> sync() {
        if (resolveUser() == null) return Result.fail(401, "未登录");
        try {
            syncService.syncAll();
            return Result.success(Map.of("ok", true));
        } catch (Exception e) {
            return Result.fail(500, "同步失败: " + e.getMessage());
        }
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

    @GetMapping("/pending")
    public Result<?> listPending() {
        if (resolveUser() == null) return Result.fail(401, "未登录");
        return Result.success(service.listPending());
    }

    @GetMapping("/favorites")
    public Result<?> listFavorites() {
        User user = resolveUser();
        if (user == null) return Result.fail(401, "未登录");
        return Result.success(service.listFavorites(user.getId()));
    }

    @PostMapping("/{id}/favorite")
    public Result<?> star(@PathVariable Long id) {
        User user = resolveUser();
        if (user == null) return Result.fail(401, "未登录");
        service.star(id, user.getId());
        return Result.success(Map.of("ok", true));
    }

    @DeleteMapping("/{id}/favorite")
    public Result<?> unstar(@PathVariable Long id) {
        User user = resolveUser();
        if (user == null) return Result.fail(401, "未登录");
        service.unstar(id, user.getId());
        return Result.success(Map.of("ok", true));
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

    @PostMapping("/{id}/unpublish")
    public Result<?> unpublish(@PathVariable Long id) {
        User user = resolveUser();
        if (user == null) return Result.fail(401, "未登录");
        return Result.success(service.unpublish(id, user));
    }

    @PostMapping("/{id}/schedule-publish")
    public Result<?> schedulePublish(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        User user = resolveUser();
        if (user == null) return Result.fail(401, "未登录");
        LocalDateTime publishAt = toDateTime(body.get("publishAt"));
        if (publishAt == null) return Result.fail(400, "缺少 publishAt（yyyy-MM-dd HH:mm:ss）");
        return Result.success(service.schedulePublish(id, publishAt, user));
    }

    // ========================================================================
    // 地点预设库
    // ========================================================================

    @GetMapping("/locations")
    public Result<?> listLocations() {
        if (resolveUser() == null) return Result.fail(401, "未登录");
        return Result.success(service.listLocations());
    }

    @PostMapping("/locations")
    public Result<?> addLocation(@RequestBody Map<String, Object> body) {
        if (resolveUser() == null) return Result.fail(401, "未登录");
        String name = str(body.get("name"));
        String address = str(body.get("address"));
        if (name == null || address == null) return Result.fail(400, "缺少 name/address");
        return Result.success(service.addLocation(name, address));
    }

    @DeleteMapping("/locations/{id}")
    public Result<?> deleteLocation(@PathVariable Long id) {
        if (resolveUser() == null) return Result.fail(401, "未登录");
        int rows = service.deleteLocation(id);
        return Result.success(Map.of("ok", rows > 0, "rows", rows));
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

    private String str(Object v) {
        if (v == null) return null;
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }

    private static final DateTimeFormatter SPACE_DT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private LocalDateTime toDateTime(Object v) {
        if (v == null) return null;
        if (v instanceof LocalDateTime ldt) return ldt;
        String s = String.valueOf(v).trim();
        if (s.isEmpty()) return null;
        try {
            return LocalDateTime.parse(s.replace('T', ' '), SPACE_DT);
        } catch (Exception e) {
            return null;
        }
    }
}
