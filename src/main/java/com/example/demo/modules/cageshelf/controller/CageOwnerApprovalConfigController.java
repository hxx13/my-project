package com.example.demo.modules.cageshelf.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.cageshelf.entity.CageOwnerApprovalConfig;
import com.example.demo.modules.cageshelf.service.CageOwnerApprovalConfigService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletRequest;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 所属人审核配置：到位确认 / 分笼审核 / 转移审核三个开关，按所属人维护。
 * 入口在笼架信息「设置中心」。权限：本人可配自己的（普通账号也允许），
 * 配别人/看总览要求 ADMIN 及以上。
 */
@RestController
@RequestMapping("/api/cage-owner-approval-config")
@Tag(name = "所属人审核配置")
public class CageOwnerApprovalConfigController {

    private final AuthContextService authContextService;
    private final CageOwnerApprovalConfigService configService;

    public CageOwnerApprovalConfigController(AuthContextService authContextService,
                                             CageOwnerApprovalConfigService configService) {
        this.authContextService = authContextService;
        this.configService = configService;
    }

    /**
     * 能否操作某所属人的配置：本人放行，否则要求 ADMIN 及以上。
     * 两侧都先折成 canonical（STAFF_* → ARO 编号）再比 —— owner_account_id 存的是 canonical，
     * 拿 u.getId() 裸比会漏判，把本人误挡在门外、或让越权漏过去。
     */
    private boolean canManage(User u, String ownerAccountId) {
        if (u == null) return false;
        if (u.getRole() != null && u.getRole().getLevel() >= RoleEnum.ADMIN.getLevel()) return true;
        String me = configService.canonical(u.getId());
        String target = configService.canonical(ownerAccountId);
        return me != null && me.equals(target);
    }

    /** 已配置的所属人总览（否则只有空表，看不出给谁配过）。仅 ADMIN 及以上，避免普通账号枚举他人开关。 */
    @GetMapping
    @Operation(summary = "已配置的所属人列表")
    public Result<List<Map<String, Object>>> listAll(HttpServletRequest request) {
        User u = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (u == null) return Result.fail(401, "未登录");
        if (u.getRole() == null || u.getRole().getLevel() < RoleEnum.ADMIN.getLevel()) {
            return Result.fail(403, "无权限查看全部所属人配置");
        }
        return Result.success(configService.listDetailed());
    }

    /** 某所属人的生效配置（没配过返回三个 true 的默认值）。本人或 ADMIN 及以上可读。 */
    @GetMapping("/{ownerAccountId}")
    @Operation(summary = "查某所属人的审核配置")
    public Result<Map<String, Object>> get(@PathVariable String ownerAccountId, HttpServletRequest request) {
        User u = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (u == null) return Result.fail(401, "未登录");
        if (!canManage(u, ownerAccountId)) return Result.fail(403, "只能查看自己的审核配置");
        CageOwnerApprovalConfig c = configService.effective(ownerAccountId);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("ownerAccountId", c.getOwnerAccountId());
        m.put("confirmRequired", Boolean.TRUE.equals(c.getConfirmRequired()));
        m.put("divideApprovalRequired", Boolean.TRUE.equals(c.getDivideApprovalRequired()));
        m.put("transferApprovalRequired", Boolean.TRUE.equals(c.getTransferApprovalRequired()));
        return Result.success(m);
    }

    /** body: { confirmRequired, divideApprovalRequired, transferApprovalRequired }，整体覆盖。本人或 ADMIN 及以上可写。 */
    @PutMapping("/{ownerAccountId}")
    @Operation(summary = "保存某所属人的审核配置")
    public Result<?> save(@PathVariable String ownerAccountId,
                          @RequestBody Map<String, Object> body,
                          HttpServletRequest request) {
        User u = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (u == null) {
            return Result.fail(401, "未登录");
        }
        if (!canManage(u, ownerAccountId)) return Result.fail(403, "只能配置自己的审核开关");
        configService.save(ownerAccountId,
                asBool(body.get("confirmRequired")),
                asBool(body.get("divideApprovalRequired")),
                asBool(body.get("transferApprovalRequired")),
                u.getId());
        return Result.success(Map.of("ok", true));
    }

    private static Boolean asBool(Object v) {
        if (v == null) return null;
        if (v instanceof Boolean b) return b;
        return "true".equalsIgnoreCase(String.valueOf(v).trim());
    }
}
