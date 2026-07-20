package com.example.demo.modules.twin.dashboard.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.notification.service.NotificationSettingsService;
import com.example.demo.modules.twin.dashboard.dto.DashboardViolationBoardItemDTO;
import com.example.demo.modules.twin.dashboard.service.TwinStudentViolationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 违规惩戒公示接口。
 * 必须登录后才能查看，未登录用户无法获取任何数据。
 */
@RestController
@RequestMapping("/api/public/dashboard/violation-board")
@Tag(name = "大屏惩戒公示", description = "需登录的违规公示列表")
public class PublicDashboardViolationBoardController {

    private final TwinStudentViolationService violationService;
    private final NotificationSettingsService settingsService;
    private final AuthContextService authContextService;

    public PublicDashboardViolationBoardController(TwinStudentViolationService violationService,
                                                   NotificationSettingsService settingsService,
                                                   AuthContextService authContextService) {
        this.violationService = violationService;
        this.settingsService = settingsService;
        this.authContextService = authContextService;
    }

    @GetMapping
    @Operation(summary = "获取大屏惩戒公示列表（enabled/items），需登录")
    public Result<Map<String, Object>> board(
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        // 未登录用户不允许查看任何违规公告数据
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null) {
            return Result.fail(401, "请先登录");
        }

        Map<String, String> cfg = settingsService.getPublicRuntimeConfig();
        boolean enabled = parseBool(cfg.get("dashboard.codex.violation_board_enabled"), false);
        int limit = parseInt(cfg.get("dashboard.codex.violation_board_max_items"), 100);
        int summaryMaxLen = parseInt(cfg.get("dashboard.codex.violation_board_summary_max_len"), 60);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("enabled", enabled);
        if (!enabled) {
            body.put("items", Collections.emptyList());
            return Result.success(body);
        }
        List<DashboardViolationBoardItemDTO> items = violationService.listDashboardBoard(limit, summaryMaxLen);
        body.put("items", items);
        return Result.success(body);
    }

    private static boolean parseBool(String v, boolean fallback) {
        if (v == null) return fallback;
        String s = v.trim().toLowerCase();
        if (s.isEmpty()) return fallback;
        return "true".equals(s) || "1".equals(s) || "yes".equals(s) || "on".equals(s);
    }

    private static int parseInt(String v, int fallback) {
        if (v == null || v.isBlank()) return fallback;
        try {
            return Integer.parseInt(v.trim());
        } catch (NumberFormatException ignored) {
            return fallback;
        }
    }
}
