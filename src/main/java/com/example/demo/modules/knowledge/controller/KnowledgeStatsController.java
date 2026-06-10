package com.example.demo.modules.knowledge.controller;

import com.example.demo.common.config.AdminAuthInterceptor;
import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.knowledge.model.StatsResponse;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;

@RestController
@RequestMapping("/api/admin/knowledge")
public class KnowledgeStatsController {

    private final JdbcTemplate jdbcTemplate;

    public KnowledgeStatsController(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @GetMapping("/stats")
    public Result<StatsResponse> getStats(HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.STAFF);
        if (denied != null) return Result.error(denied.getMessage());

        int totalPages = jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM knowledge_pages", Integer.class);
        int totalCategories = jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM knowledge_categories", Integer.class);

        // Count distinct tags
        int totalTags = 0;
        List<String> tagRows = jdbcTemplate.queryForList(
            "SELECT tags FROM knowledge_pages WHERE tags IS NOT NULL AND tags != '[]'",
            String.class);
        for (String row : tagRows) {
            String cleaned = row.replaceAll("[\\[\\]\"]", "");
            for (String tag : cleaned.split(",")) {
                if (!tag.trim().isEmpty()) totalTags++;
            }
        }

        LocalDateTime lastUpdated = jdbcTemplate.queryForObject(
            "SELECT MAX(updated_at) FROM knowledge_pages", LocalDateTime.class);

        StatsResponse stats = new StatsResponse();
        stats.setTotalPages(totalPages);
        stats.setTotalCategories(totalCategories);
        stats.setTotalTags(totalTags);
        stats.setLastUpdated(lastUpdated);

        return Result.success(stats);
    }

    private Result<?> requireMinRole(HttpServletRequest request, RoleEnum minRole) {
        Object attr = request.getAttribute(AdminAuthInterceptor.CURRENT_ADMIN_USER_ATTR);
        if (!(attr instanceof User currentUser)) {
            return Result.error("当前登录信息无效");
        }
        RoleEnum currentRole = currentUser.getRole() == null ? RoleEnum.STUDENT : currentUser.getRole();
        if (currentRole.getLevel() < minRole.getLevel()) {
            return Result.error("无权限访问");
        }
        return null;
    }
}
