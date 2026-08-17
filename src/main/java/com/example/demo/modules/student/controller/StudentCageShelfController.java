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
import java.util.List;
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

    // ---- 收藏（置顶） ----

    @PutMapping("/{shelveId}/pin")
    @Operation(summary = "切换笼架收藏状态（shelveId 全局唯一，无需 roomId）")
    public Result<?> togglePin(HttpServletRequest request,
                                @PathVariable String shelveId) {
        User user = resolveUser(request);
        if (user == null) return Result.fail(401, "未登录");
        log.info("[CageShelf-Pin-Controller] togglePin userId={} shelveId={}",
                user.getId(), shelveId);
        studentCageShelfService.togglePin(user, shelveId);
        boolean pinned = studentCageShelfService.isPinned(user, shelveId);
        log.info("[CageShelf-Pin-Controller] togglePin RESULT shelveId={} isPinned={}", shelveId, pinned);
        return Result.success(Map.of("shelveId", shelveId, "isPinned", pinned));
    }

    @GetMapping("/pinned")
    @Operation(summary = "获取当前用户收藏的笼架详情列表（含 roomId + grid 数据）")
    public Result<?> getPinnedShelves(HttpServletRequest request) {
        User user = resolveUser(request);
        if (user == null) return Result.fail(401, "未登录");
        log.info("[CageShelf-Pin-Controller] getPinnedShelves userId={}", user.getId());
        List<Map<String, Object>> result = studentCageShelfService.getPinnedShelves(user);
        log.info("[CageShelf-Pin-Controller] getPinnedShelves DONE userId={} resultCount={}",
                user.getId(), result.size());
        return Result.success(result);
    }

    private User resolveUser(HttpServletRequest request) {
        return authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
    }
}
