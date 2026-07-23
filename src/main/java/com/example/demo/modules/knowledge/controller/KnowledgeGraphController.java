package com.example.demo.modules.knowledge.controller;

import com.example.demo.common.config.AdminAuthInterceptor;
import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.knowledge.model.GraphResponse;
import com.example.demo.modules.knowledge.service.GraphService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin/knowledge")
public class KnowledgeGraphController {

    private final GraphService graphService;

    public KnowledgeGraphController(GraphService graphService) {
        this.graphService = graphService;
    }

    @GetMapping("/graph")
    public Result<GraphResponse> getGraph(
            @RequestParam(required = false) Long categoryId,
            @RequestParam(required = false) String tag,
            HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.STAFF);
        if (denied != null) return Result.error(denied.getMessage());
        return Result.success(graphService.buildGraph(categoryId, tag));
    }

    @GetMapping("/pages/{id}/backlinks")
    public Result<List<Map<String, Object>>> getBacklinks(
            @PathVariable Long id,
            HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.STAFF);
        if (denied != null) return Result.error(denied.getMessage());
        // Backlinks are already part of graph data; filter for target
        GraphResponse graph = graphService.buildGraph(null, null);
        List<Map<String, Object>> backlinks = graph.getEdges().stream()
            .filter(e -> e.getTarget().equals(id))
            .map(e -> {
                String title = graph.getNodes().stream()
                    .filter(n -> n.getId().equals(e.getSource()))
                    .findFirst()
                    .map(GraphResponse.GraphNode::getTitle)
                    .orElse("未知");
                return Map.<String, Object>of(
                    "pageId", e.getSource(),
                    "title", title,
                    "type", e.getType()
                );
            })
            .toList();
        return Result.success(backlinks);
    }

    @PostMapping("/graph/rebuild")
    public Result<String> rebuild(HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.SUPER_ADMIN);
        if (denied != null) return Result.error(denied.getMessage());
        // Graph is computed on-the-fly; rebuild simply triggers fresh analysis
        return Result.success("ok");
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
