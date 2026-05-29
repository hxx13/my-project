package com.example.demo.modules.student.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.student.service.StudentCageShelfService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;

@RestController
@RequestMapping("/api/student/cage-shelves")
@Tag(name = "学生笼架信息")
public class StudentCageShelfController {

    private static final Logger log = LoggerFactory.getLogger(StudentCageShelfController.class);

    private final AuthContextService authContextService;
    private final StudentCageShelfService studentCageShelfService;

    public StudentCageShelfController(AuthContextService authContextService,
                                      StudentCageShelfService studentCageShelfService) {
        this.authContextService = authContextService;
        this.studentCageShelfService = studentCageShelfService;
    }

    @GetMapping("/filter-options")
    @Operation(summary = "获取学生可访问的笼架筛选选项（级联：传上级ID则仅返回下游选项）")
    public Result<Map<String, Object>> getFilterOptions(
            @RequestParam(required = false) Integer campusId,
            @RequestParam(required = false) String areaId,
            @RequestParam(required = false) String floorId,
            @RequestParam(required = false) String roomId,
            HttpServletRequest request) {
        User user = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (user == null) {
            return Result.fail(401, "未登录或登录已过期");
        }
        try {
            Map<String, Object> data = studentCageShelfService.getFilterOptions(user, campusId, areaId, floorId, roomId);
            return Result.success(data);
        } catch (Exception e) {
            log.warn("[student-cage-shelf] 筛选选项查询失败 userId={} err={}", user.getId(), e.getMessage());
            return Result.error(e.getMessage());
        }
    }

    @GetMapping("/{shelveId}/detail")
    @Operation(summary = "获取笼架网格详情（缓存快照）")
    public Result<Map<String, Object>> getShelfDetail(
            @PathVariable String shelveId,
            HttpServletRequest request) {
        User user = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (user == null) {
            return Result.fail(401, "未登录或登录已过期");
        }
        try {
            Map<String, Object> data = studentCageShelfService.getShelfDetail(user, shelveId);
            return Result.success(data);
        } catch (IllegalArgumentException e) {
            return Result.fail(400, e.getMessage());
        } catch (Exception e) {
            log.warn("[student-cage-shelf] 笼架详情查询失败 userId={} shelveId={} err={}", user.getId(), shelveId, e.getMessage());
            return Result.error(e.getMessage());
        }
    }

    @PostMapping("/refresh")
    @Operation(summary = "手动刷新笼架数据快照")
    public Result<Map<String, Object>> refreshShelves(HttpServletRequest request) {
        User user = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (user == null) {
            return Result.fail(401, "未登录或登录已过期");
        }
        try {
            Map<String, Object> data = studentCageShelfService.refreshShelves(user);
            return Result.success(data);
        } catch (IllegalStateException e) {
            return Result.fail(429, e.getMessage());
        } catch (Exception e) {
            log.warn("[student-cage-shelf] 刷新快照失败 userId={} err={}", user.getId(), e.getMessage());
            return Result.error(e.getMessage());
        }
    }

    @GetMapping("/{shelveId}/cells/{x}/{y}/annotation")
    @Operation(summary = "获取笼位标注信息")
    public Result<Map<String, Object>> getAnnotation(
            @PathVariable String shelveId,
            @PathVariable int x,
            @PathVariable int y,
            HttpServletRequest request) {
        User user = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (user == null) return Result.fail(401, "未登录或登录已过期");
        try {
            Map<String, Object> data = studentCageShelfService.getAnnotation(user, shelveId, x, y);
            return Result.success(data);
        } catch (Exception e) {
            log.warn("[student-cage-shelf] 读取标注失败 userId={} shelveId={} pos={}-{} err={}",
                    user.getId(), shelveId, x, y, e.getMessage());
            return Result.error(e.getMessage());
        }
    }

    @PutMapping("/{shelveId}/cells/{x}/{y}/annotation")
    @Operation(summary = "保存笼位标注（图片、富文本、ARO数据）")
    public Result<?> saveAnnotation(
            @PathVariable String shelveId,
            @PathVariable int x,
            @PathVariable int y,
            @RequestBody Map<String, String> body,
            HttpServletRequest request) {
        User user = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (user == null) return Result.fail(401, "未登录或登录已过期");
        try {
            String position = body.getOrDefault("position", toPositionLabel(x, y));
            String richText = body.getOrDefault("richText", null);
            String images = body.getOrDefault("images", null);
            String aroRawData = body.getOrDefault("aroRawData", null);
            studentCageShelfService.upsertAnnotation(user, shelveId, x, y, position, richText, images, aroRawData);
            return Result.success();
        } catch (IllegalStateException e) {
            return Result.fail(403, e.getMessage());
        } catch (Exception e) {
            log.warn("[student-cage-shelf] 保存标注失败 userId={} shelveId={} pos={}-{} err={}",
                    user.getId(), shelveId, x, y, e.getMessage());
            return Result.error(e.getMessage());
        }
    }

    private static String toPositionLabel(int x, int y) {
        char col = (char) ('A' + x - 1);
        return col + "-" + y;
    }
}
