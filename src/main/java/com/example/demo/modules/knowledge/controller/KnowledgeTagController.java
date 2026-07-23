package com.example.demo.modules.knowledge.controller;

import com.example.demo.common.config.AdminAuthInterceptor;
import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.knowledge.model.TagStatsResponse;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/admin/knowledge")
public class KnowledgeTagController {

    private final JdbcTemplate jdbcTemplate;

    public KnowledgeTagController(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @GetMapping("/tags")
    public Result<List<TagStatsResponse>> getTags(
            @RequestParam(required = false) Long categoryId,
            HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.STAFF);
        if (denied != null) return Result.error(denied.getMessage());

        String sql = categoryId != null
            ? "SELECT tags FROM knowledge_pages WHERE tags IS NOT NULL AND category_id = ?"
            : "SELECT tags FROM knowledge_pages WHERE tags IS NOT NULL";

        List<String> tagRows;
        if (categoryId != null) {
            tagRows = jdbcTemplate.queryForList(sql, String.class, categoryId);
        } else {
            tagRows = jdbcTemplate.queryForList(sql, String.class);
        }

        Map<String, Long> tagCounts = new HashMap<>();
        for (String row : tagRows) {
            if (row == null || row.isEmpty() || row.equals("[]")) continue;
            // Simple JSON array parsing: ["tag1","tag2"]
            String cleaned = row.replaceAll("[\\[\\]\"]", "");
            for (String tag : cleaned.split(",")) {
                String trimmed = tag.trim();
                if (!trimmed.isEmpty()) {
                    tagCounts.merge(trimmed, 1L, Long::sum);
                }
            }
        }

        List<TagStatsResponse> result = tagCounts.entrySet().stream()
            .sorted(Map.Entry.<String, Long>comparingByValue().reversed())
            .map(e -> {
                TagStatsResponse ts = new TagStatsResponse();
                ts.setName(e.getKey());
                ts.setCount(e.getValue());
                return ts;
            })
            .collect(Collectors.toList());

        return Result.success(result);
    }

    private Result<?> requireMinRole(HttpServletRequest request, RoleEnum minRole) {
        Object attr = request.getAttribute(AdminAuthInterceptor.CURRENT_ADMIN_USER_ATTR);
        if (!(attr instanceof User currentUser)) {
            return Result.error("当前登录信息无效");
        }
        RoleEnum currentRole = currentUser.getRole() == null ? RoleEnum.MEMBER : currentUser.getRole();
        if (currentRole.getLevel() < minRole.getLevel()) {
            return Result.error("无权限访问");
        }
        return null;
    }
}
