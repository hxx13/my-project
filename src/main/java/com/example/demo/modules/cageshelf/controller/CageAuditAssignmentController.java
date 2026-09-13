package com.example.demo.modules.cageshelf.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.cageshelf.entity.CageRegionGrant;
import com.example.demo.modules.cageshelf.service.CageRegionGrantService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletRequest;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 笼位申请审核人归属：审核人 → 楼层/房间。
 *
 * <p><b>2026-09-13 起这条不再是主路径 —— 审核归属从「区域负责分配」推导</b>：
 * 把区域分给饲养组长（`grant_role=LEADER`）即自带该区域的审核权（矩阵能力
 * `cage.review.region` + 作用域 = 可见范围），组长还能把审核权逐人下放给组员。
 * 设置中心里那个「审核人归属」分类已随之退役。
 *
 * <p>本控制器保留为**迁移遗留数据的维护出口**：二期从 `cage_audit_assignment` 搬来的
 * `grant_role=REVIEWER` 行仍被 {@code CageRegionGrantService.canReview} 认作显式授权，
 * 这里只让超管能改。写门槛与「区域负责分配」对齐到 SUPER_ADMIN —— 此前只要求 ADMIN，
 * 出现「无权分区域、却有权指认任意区域的审核人」的权限倒挂。
 */
@RestController
@RequestMapping("/api/cage-audit-assignment")
@Tag(name = "笼位申请审核人归属（迁移遗留）")
public class CageAuditAssignmentController {

    private final AuthContextService authContextService;
    private final CageRegionGrantService regionGrantService;

    public CageAuditAssignmentController(AuthContextService authContextService, CageRegionGrantService regionGrantService) {
        this.authContextService = authContextService;
        this.regionGrantService = regionGrantService;
    }

    /** 全部归属，按审核人分组 —— 设置中心总览（哪些位置已分配、归谁）。 */
    @GetMapping
    @Operation(summary = "全部审核归属总览（按审核人分组）")
    public Result<List<Map<String, Object>>> listAll(HttpServletRequest request) {
        if (authContextService.resolveUserFromBearer(request.getHeader("Authorization")) == null) {
            return Result.fail(401, "未登录");
        }
        return Result.success(regionGrantService.listAllGrouped());
    }

    @GetMapping("/{reviewerUserId}")
    @Operation(summary = "查某审核人的负责楼层/房间/校区")
    public Result<List<Map<String, Object>>> list(@PathVariable String reviewerUserId, HttpServletRequest request) {
        if (authContextService.resolveUserFromBearer(request.getHeader("Authorization")) == null) {
            return Result.fail(401, "未登录");
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (CageRegionGrant a : regionGrantService.listByAccount(reviewerUserId, CageRegionGrant.ROLE_REVIEWER)) {
            out.add(Map.of("scopeType", a.getRegionType(), "scopeId", a.getRegionId()));
        }
        return Result.success(out);
    }

    /** body: [{ "scopeType": "FLOOR"|"ROOM"|"CAMPUS", "scopeId": "123" }, ...]，全量替换。 */
    @PutMapping("/{reviewerUserId}")
    @Operation(summary = "全量替换某审核人的负责楼层/房间/校区")
    public Result<?> replace(@PathVariable String reviewerUserId, @RequestBody List<Map<String, String>> body, HttpServletRequest request) {
        User u = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (u == null) return Result.fail(401, "未登录");
        // 写权限在控制器里显式判一次：类注释说"由网关/切面控制"，但 WebMvcConfig 的拦截器
        // pathPatterns 并不含本路径，实际是裸接口 —— 不判就能被任何登录账号覆盖他人归属。
        // 门槛对齐「区域负责分配」（PersonScopeController 写 LEADER 也要 SUPER_ADMIN），
        // 否则会出现「无权分区域、却有权指认任意区域的审核人」的权限倒挂。
        if (u.getRole() == null || u.getRole().getLevel() < RoleEnum.SUPER_ADMIN.getLevel()) {
            return Result.fail(403, "无权限配置审核人归属");
        }
        List<CageRegionGrant> grants = new ArrayList<>();
        for (Map<String, String> item : body) {
            CageRegionGrant a = new CageRegionGrant();
            a.setRegionType(item.get("scopeType"));
            a.setRegionId(item.get("scopeId"));
            grants.add(a);
        }
        regionGrantService.replaceByAccount(reviewerUserId, CageRegionGrant.ROLE_REVIEWER, grants, u.getId());
        return Result.success(Map.of("ok", true));
    }
}
