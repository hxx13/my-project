package com.example.demo.modules.knowledge.controller;

import com.example.demo.common.config.AdminAuthInterceptor;
import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.knowledge.entity.KnowledgeHistory;
import com.example.demo.modules.knowledge.entity.KnowledgePage;
import com.example.demo.modules.knowledge.mapper.KnowledgeHistoryMapper;
import com.example.demo.modules.knowledge.mapper.KnowledgePageMapper;
import com.example.demo.modules.knowledge.model.TimelineResponse;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.List;

@RestController
@RequestMapping("/api/admin/knowledge")
public class KnowledgeTimelineController {

    private final KnowledgeHistoryMapper historyMapper;
    private final KnowledgePageMapper pageMapper;

    public KnowledgeTimelineController(KnowledgeHistoryMapper historyMapper,
                                        KnowledgePageMapper pageMapper) {
        this.historyMapper = historyMapper;
        this.pageMapper = pageMapper;
    }

    @GetMapping("/timeline")
    public Result<List<TimelineResponse>> getTimeline(
            @RequestParam(defaultValue = "50") int limit,
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String author,
            @RequestParam(required = false) String since,
            HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.STAFF);
        if (denied != null) return Result.error(denied.getMessage());

        List<KnowledgeHistory> histories = historyMapper.findAll(limit, 0);

        List<TimelineResponse> timeline = new ArrayList<>();
        for (KnowledgeHistory h : histories) {
            KnowledgePage page = pageMapper.findById(h.getPageId());
            if (page == null) continue;

            TimelineResponse tr = new TimelineResponse();
            tr.setId(h.getId());
            tr.setPageId(h.getPageId());
            tr.setPageTitle(page.getTitle());
            tr.setAuthor(h.getAuthor());
            tr.setSummary(h.getSummary());
            tr.setCreatedAt(h.getCreatedAt());

            // Infer event type
            String eventType = "edited";
            if (h.getVersion() == 1 && "imported".equals(page.getSource())) {
                eventType = "imported";
            } else if (h.getVersion() == 1) {
                eventType = "created";
            } else if (h.getSummary() != null && h.getSummary().contains("回滚")) {
                eventType = "rollback";
            }
            tr.setType(eventType);

            timeline.add(tr);
        }

        // Filter by type if specified
        if (type != null && !type.equals("all")) {
            timeline = timeline.stream()
                .filter(t -> t.getType().equals(type))
                .toList();
        }

        // Filter by author
        if (author != null && !author.isEmpty()) {
            timeline = timeline.stream()
                .filter(t -> author.equals(t.getAuthor()))
                .toList();
        }

        return Result.success(timeline);
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
