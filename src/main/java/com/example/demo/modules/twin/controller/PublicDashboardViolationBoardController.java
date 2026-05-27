package com.example.demo.modules.twin.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.notification.service.NotificationSettingsService;
import com.example.demo.modules.twin.dto.DashboardViolationBoardItemDTO;
import com.example.demo.modules.twin.service.TwinStudentViolationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 主页大屏「违规惩戒公示」公开只读接口；
 * 大屏未登录可访问，受 dashboard.codex.violation_board_* 配置控制。
 */
@RestController
@RequestMapping("/api/public/dashboard/violation-board")
@Tag(name = "大屏惩戒公示", description = "未登录可读的违规公示列表")
public class PublicDashboardViolationBoardController {

    private final TwinStudentViolationService violationService;
    private final NotificationSettingsService settingsService;

    public PublicDashboardViolationBoardController(TwinStudentViolationService violationService,
                                                   NotificationSettingsService settingsService) {
        this.violationService = violationService;
        this.settingsService = settingsService;
    }

    @GetMapping
    @Operation(summary = "获取大屏惩戒公示列表（enabled/items）")
    public Result<Map<String, Object>> board() {
        Map<String, String> cfg = settingsService.getPublicRuntimeConfig();
        boolean enabled = parseBool(cfg.get("dashboard.codex.violation_board_enabled"), true);
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
