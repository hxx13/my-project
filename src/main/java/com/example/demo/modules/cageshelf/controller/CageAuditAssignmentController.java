package com.example.demo.modules.cageshelf.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.cageshelf.entity.CageAuditAssignment;
import com.example.demo.modules.cageshelf.service.CageAuditAssignmentService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletRequest;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 笼位申请审核人归属：审核人 → 楼层/房间。配置入口在笼架信息右上角设置弹窗。
 * 写权限由网关/切面控制（平台所有者）。
 */
@RestController
@RequestMapping("/api/cage-audit-assignment")
@Tag(name = "笼位申请审核人归属")
public class CageAuditAssignmentController {

    private final AuthContextService authContextService;
    private final CageAuditAssignmentService assignmentService;

    public CageAuditAssignmentController(AuthContextService authContextService, CageAuditAssignmentService assignmentService) {
        this.authContextService = authContextService;
        this.assignmentService = assignmentService;
    }

    @GetMapping("/{reviewerUserId}")
    @Operation(summary = "查某审核人的负责楼层/房间/校区")
    public Result<List<Map<String, Object>>> list(@PathVariable String reviewerUserId, HttpServletRequest request) {
        if (authContextService.resolveUserFromBearer(request.getHeader("Authorization")) == null) {
            return Result.fail(401, "未登录");
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (CageAuditAssignment a : assignmentService.listByReviewer(reviewerUserId)) {
            out.add(Map.of("scopeType", a.getScopeType(), "scopeId", a.getScopeId()));
        }
        return Result.success(out);
    }

    /** body: [{ "scopeType": "FLOOR"|"ROOM"|"CAMPUS", "scopeId": "123" }, ...]，全量替换。 */
    @PutMapping("/{reviewerUserId}")
    @Operation(summary = "全量替换某审核人的负责楼层/房间/校区")
    public Result<?> replace(@PathVariable String reviewerUserId, @RequestBody List<Map<String, String>> body, HttpServletRequest request) {
        User u = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (u == null) return Result.fail(401, "未登录");
        List<CageAuditAssignment> assignments = new ArrayList<>();
        for (Map<String, String> item : body) {
            CageAuditAssignment a = new CageAuditAssignment();
            a.setScopeType(item.get("scopeType"));
            a.setScopeId(item.get("scopeId"));
            assignments.add(a);
        }
        assignmentService.replaceByReviewer(reviewerUserId, assignments);
        return Result.success(Map.of("ok", true));
    }
}
