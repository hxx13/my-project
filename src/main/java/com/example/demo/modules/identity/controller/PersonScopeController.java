package com.example.demo.modules.identity.controller;

import com.example.demo.common.dto.Result;
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
 * 人员负责范围：逐人挂载「校区/楼层/房间」，用于笼架数据范围收口。
 * 写接口由管理端负责范围分配页调用（admin 权限在外部网关/切面控制）。
 *
 * <p>数据落在 {@code cage_region_grant}，以 {@code grant_role=SCOPE} 区分于审核人归属（REVIEWER）。
 * HTTP 契约与合并前一致，只是背后的服务从 PersonScopeService 换成了 CageRegionGrantService。
 */
@RestController
@RequestMapping("/api/person-scope")
@Tag(name = "人员负责范围")
public class PersonScopeController {

    private final AuthContextService authContextService;
    private final CageRegionGrantService regionGrantService;

    public PersonScopeController(AuthContextService authContextService, CageRegionGrantService regionGrantService) {
        this.authContextService = authContextService;
        this.regionGrantService = regionGrantService;
    }

    /** 已分配过的人，供分配页左栏列表（点击查看/编辑其可见范围）。 */
    @GetMapping("/assignees")
    @Operation(summary = "已分配可见范围的人员列表")
    public Result<List<Map<String, Object>>> assignees(HttpServletRequest request) {
        if (authContextService.resolveUserFromBearer(request.getHeader("Authorization")) == null) {
            return Result.fail(401, "未登录");
        }
        return Result.success(regionGrantService.listAssignees(CageRegionGrant.ROLE_SCOPE));
    }

    @GetMapping("/{userId}")
    @Operation(summary = "查某人的全部负责范围（校区/楼层/房间）")
    public Result<List<Map<String, Object>>> list(@PathVariable String userId, HttpServletRequest request) {
        if (authContextService.resolveUserFromBearer(request.getHeader("Authorization")) == null) {
            return Result.fail(401, "未登录");
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (CageRegionGrant s : regionGrantService.listByAccount(userId, CageRegionGrant.ROLE_SCOPE)) {
            out.add(Map.of("scopeType", s.getRegionType(), "scopeId", s.getRegionId()));
        }
        return Result.success(out);
    }

    /** 撤销某人的全部分配（整条移除，不再出现在已分配列表里）。 */
    @DeleteMapping("/{userId}")
    @Operation(summary = "撤销某人的全部可见范围分配")
    public Result<?> remove(@PathVariable String userId, HttpServletRequest request) {
        User u = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (u == null) {
            return Result.fail(401, "未登录");
        }
        regionGrantService.clearByAccount(userId, CageRegionGrant.ROLE_SCOPE);
        return Result.success(Map.of("ok", true));
    }

    /** body: [{ "scopeType": "FLOOR"|"ROOM"|"CAMPUS", "scopeId": "123" }, ...]，全量替换。 */
    @PutMapping("/{userId}")
    @Operation(summary = "全量替换某人的负责范围")
    public Result<?> replace(@PathVariable String userId, @RequestBody List<Map<String, String>> body, HttpServletRequest request) {
        User u = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (u == null) {
            return Result.fail(401, "未登录");
        }
        List<CageRegionGrant> grants = new ArrayList<>();
        for (Map<String, String> item : body) {
            CageRegionGrant g = new CageRegionGrant();
            g.setRegionType(item.get("scopeType"));
            g.setRegionId(item.get("scopeId"));
            grants.add(g);
        }
        try {
            regionGrantService.replaceByAccount(userId, CageRegionGrant.ROLE_SCOPE, grants, u.getId());
            return Result.success(Map.of("ok", true));
        } catch (IllegalArgumentException e) {
            return Result.fail(400, e.getMessage());
        }
    }
}
