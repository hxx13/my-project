package com.example.demo.modules.cageshelf.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.cageshelf.entity.CagePermissionCapability;
import com.example.demo.modules.cageshelf.entity.CagePermissionGrant;
import com.example.demo.modules.cageshelf.service.CagePermissionService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletRequest;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 笼架身份权限矩阵：读矩阵 + 单格勾选/取消。
 * 编辑门槛 SUPER_ADMIN——与它替换掉的「模式可见性」配置一致（那是 SUPER_ADMIN 分类）。
 */
@RestController
@RequestMapping("/api/cage-permission")
@Tag(name = "笼架权限矩阵")
public class CagePermissionController {

    private final AuthContextService authContextService;
    private final CagePermissionService permissionService;

    public CagePermissionController(AuthContextService authContextService, CagePermissionService permissionService) {
        this.authContextService = authContextService;
        this.permissionService = permissionService;
    }

    private User requireSuperAdmin(HttpServletRequest request) {
        User u = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (u == null) return null;
        if (u.getRole() == null || u.getRole().getLevel() < RoleEnum.SUPER_ADMIN.getLevel()) return null;
        return u;
    }

    /** 矩阵全量：能力列（含 view_group 分组信息）+ 授权行 + 空列清单。 */
    @GetMapping("/matrix")
    @Operation(summary = "笼架权限矩阵")
    public Result<Map<String, Object>> matrix(HttpServletRequest request) {
        if (requireSuperAdmin(request) == null) return Result.fail(403, "无权限查看权限矩阵");
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("capabilities", permissionService.listCapabilities().stream().map(c -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("code", c.getCode());
            m.put("label", c.getLabel());
            m.put("viewGroup", c.getViewGroup());
            m.put("leaderExclusive", c.getLeaderExclusive());
            return m;
        }).toList());
        out.put("grants", permissionService.listGrants().stream().map(g -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("capabilityCode", g.getCapabilityCode());
            m.put("identityCode", g.getIdentityCode());
            return m;
        }).toList());
        out.put("emptyCapabilities", permissionService.emptyCapabilities());
        return Result.success(out);
    }

    /** body: { capabilityCode, identityCode, granted } —— 单格勾选/取消。 */
    @PutMapping("/grant")
    @Operation(summary = "勾选或取消一格")
    public Result<?> grant(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        if (requireSuperAdmin(request) == null) return Result.fail(403, "无权限修改权限矩阵");
        String cap = body.get("capabilityCode") == null ? null : String.valueOf(body.get("capabilityCode"));
        String identity = body.get("identityCode") == null ? null : String.valueOf(body.get("identityCode"));
        if (cap == null || cap.isBlank() || identity == null || identity.isBlank()) {
            return Result.fail(400, "capabilityCode 与 identityCode 必填");
        }
        boolean granted = Boolean.TRUE.equals(body.get("granted"))
                || "true".equalsIgnoreCase(String.valueOf(body.get("granted")));
        if (granted) permissionService.grant(cap, identity);
        else permissionService.revoke(cap, identity);
        return Result.success(Map.of("ok", true));
    }
}
