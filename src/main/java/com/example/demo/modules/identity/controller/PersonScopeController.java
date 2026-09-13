package com.example.demo.modules.identity.controller;

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
 * 区域负责分配：把「校区/楼层/房间」分配给**饲养组长**，写入 {@code cage_region_grant} 的
 * {@code grant_role='LEADER'} 行。组长据此获得该区域的可见范围，并可在「我的区域」页里管理组员。
 *
 * <p>2026-09-15 起本页写 {@code LEADER}；此前写的是 {@code SCOPE}（二期从 person_scope 迁来的
 * 「补充可见范围」，**不含组长语义**）。老 SCOPE 行仍被可见范围读取消费，只是不再由本页维护。
 *
 * <p>HTTP 契约不变（路径仍为 /api/person-scope）——它只是个名字，改路径要波及前端调用点而无收益。
 */
@RestController
@RequestMapping("/api/person-scope")
@Tag(name = "区域负责分配")
public class PersonScopeController {

    private final AuthContextService authContextService;
    private final CageRegionGrantService regionGrantService;

    public PersonScopeController(AuthContextService authContextService, CageRegionGrantService regionGrantService) {
        this.authContextService = authContextService;
        this.regionGrantService = regionGrantService;
    }

    /**
     * 鉴权：本控制器**不在任何拦截器里**——WebMvcConfig 的 catch-all 只挂了 metrics 拦截器，
     * /api/person-scope 不在 /api/admin/** 之下也不在 AUP 门禁里。原注释写「admin 权限在外部
     * 网关/切面控制」是**不成立的**（CageAuditAssignmentController 踩过同一个坑）。
     * 所以这里显式判一次：**读要 ADMIN+，写要 SUPER_ADMIN**（设计 5.2：LEADER 行只有超管能写）。
     */
    private User requireRole(HttpServletRequest request, RoleEnum min) {
        User u = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (u == null || u.getRole() == null) return null;
        return u.getRole().getLevel() >= min.getLevel() ? u : null;
    }

    /** 已分配过的人，供分配页左栏列表（点击查看/编辑其负责区域）。 */
    @GetMapping("/assignees")
    @Operation(summary = "已分配区域负责人的人员列表")
    public Result<List<Map<String, Object>>> assignees(HttpServletRequest request) {
        if (requireRole(request, RoleEnum.ADMIN) == null) {
            return Result.fail(403, "无权限查看区域负责分配");
        }
        return Result.success(regionGrantService.listAssignees(CageRegionGrant.ROLE_LEADER));
    }

    @GetMapping("/{userId}")
    @Operation(summary = "查某人负责的区域（校区/楼层/房间）")
    public Result<List<Map<String, Object>>> list(@PathVariable String userId, HttpServletRequest request) {
        if (requireRole(request, RoleEnum.ADMIN) == null) {
            return Result.fail(403, "无权限查看区域负责分配");
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (CageRegionGrant s : regionGrantService.listByAccount(userId, CageRegionGrant.ROLE_LEADER)) {
            out.add(Map.of("scopeType", s.getRegionType(), "scopeId", s.getRegionId()));
        }
        return Result.success(out);
    }

    /** 撤销某人的全部区域负责（整条移除，不再出现在已分配列表里）。 */
    @DeleteMapping("/{userId}")
    @Operation(summary = "撤销某人的全部区域负责")
    public Result<?> remove(@PathVariable String userId, HttpServletRequest request) {
        User u = requireRole(request, RoleEnum.SUPER_ADMIN);
        if (u == null) {
            return Result.fail(403, "无权限修改区域负责分配");
        }
        regionGrantService.clearByAccount(userId, CageRegionGrant.ROLE_LEADER);
        return Result.success(Map.of("ok", true));
    }

    /** body: [{ "scopeType": "FLOOR"|"ROOM"|"CAMPUS", "scopeId": "123" }, ...]，全量替换。 */
    @PutMapping("/{userId}")
    @Operation(summary = "全量替换某人负责的区域")
    public Result<?> replace(@PathVariable String userId, @RequestBody List<Map<String, String>> body, HttpServletRequest request) {
        User u = requireRole(request, RoleEnum.SUPER_ADMIN);
        if (u == null) {
            return Result.fail(403, "无权限修改区域负责分配");
        }
        List<CageRegionGrant> grants = new ArrayList<>();
        for (Map<String, String> item : body) {
            CageRegionGrant g = new CageRegionGrant();
            g.setRegionType(item.get("scopeType"));
            g.setRegionId(item.get("scopeId"));
            grants.add(g);
        }
        try {
            regionGrantService.replaceByAccount(userId, CageRegionGrant.ROLE_LEADER, grants, u.getId());
            return Result.success(Map.of("ok", true));
        } catch (IllegalArgumentException e) {
            return Result.fail(400, e.getMessage());
        }
    }
}
