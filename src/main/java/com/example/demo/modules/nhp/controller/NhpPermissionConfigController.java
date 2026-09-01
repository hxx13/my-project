package com.example.demo.modules.nhp.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.nhp.service.NhpPermissionService;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * NHP 权限矩阵配置：能力字典(crf_capability) + 授权矩阵(crf_permission) CRUD。
 * 仅平台所有者可配置（全局权限，数据驱动自配置）。
 */
@RestController
@RequestMapping("/api/nhp/permissions")
public class NhpPermissionConfigController {

    private final JdbcTemplate jdbcTemplate;
    private final AuthContextService authContextService;
    private final NhpPermissionService permissionService;

    public NhpPermissionConfigController(JdbcTemplate jdbcTemplate,
                                         AuthContextService authContextService,
                                         NhpPermissionService permissionService) {
        this.jdbcTemplate = jdbcTemplate;
        this.authContextService = authContextService;
        this.permissionService = permissionService;
    }

    private void requirePlatformOwner(String auth) {
        User user = authContextService.resolveUserFromBearer(auth);
        if (user == null) {
            throw new TwinBusinessException(401, "未登录或 Token 无效");
        }
        if (!permissionService.isPlatformOwner(user)) {
            throw new TwinBusinessException(403, "无权限：需平台所有者");
        }
    }

    private void requireConfigTeam(String auth, Long teamId) {
        User user = authContextService.resolveUserFromBearer(auth);
        if (user == null) {
            throw new TwinBusinessException(401, "未登录或 Token 无效");
        }
        if (!permissionService.canConfigTeam(user, teamId)) {
            throw new TwinBusinessException(403, "无权限：需团队负责人或配置权限");
        }
    }

    private String str(Object v) {
        if (v == null) return null;
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }

    // ── 能力字典 crf_capability ──

    @GetMapping("/capabilities")
    public Result<List<Map<String, Object>>> listCapabilities() {
        return Result.success(jdbcTemplate.queryForList(
                "SELECT id, code, label, scope, active FROM crf_capability ORDER BY id"));
    }

    @PostMapping("/capabilities")
    public Result<?> createCapability(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @RequestBody Map<String, Object> body) {
        requirePlatformOwner(auth);
        String code = str(body.get("code"));
        String label = str(body.get("label"));
        if (code == null || label == null) {
            return Result.fail(400, "code 与 label 必填");
        }
        try {
            jdbcTemplate.update("INSERT INTO crf_capability (code, label, scope, active) VALUES (?, ?, ?, 1)",
                    code, label, str(body.get("scope")));
        } catch (Exception e) {
            return Result.fail(409, "能力码已存在或非法: " + code);
        }
        return Result.success();
    }

    @PutMapping("/capabilities/{id}")
    public Result<?> updateCapability(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable Long id,
            @RequestBody Map<String, Object> body) {
        requirePlatformOwner(auth);
        String label = str(body.get("label"));
        String scope = str(body.get("scope"));
        Integer active = body.get("active") == null ? null
                : (Boolean.parseBoolean(String.valueOf(body.get("active"))) ? 1 : 0);
        jdbcTemplate.update("UPDATE crf_capability SET label = COALESCE(?, label), "
                        + "scope = COALESCE(?, scope), active = COALESCE(?, active) WHERE id = ?",
                label, scope, active, id);
        return Result.success();
    }

    @DeleteMapping("/capabilities/{id}")
    public Result<?> deleteCapability(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable Long id) {
        requirePlatformOwner(auth);
        int refs = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM crf_permission WHERE capability_code = "
                        + "(SELECT code FROM crf_capability WHERE id = ?)",
                Integer.class, id);
        if (refs > 0) {
            return Result.fail(409, "该能力已被 " + refs + " 条授权引用，无法删除");
        }
        jdbcTemplate.update("DELETE FROM crf_capability WHERE id = ?", id);
        return Result.success();
    }

    // ── 授权矩阵 crf_permission ──

    @GetMapping
    public Result<List<Map<String, Object>>> listPermissions() {
        return Result.success(jdbcTemplate.queryForList(
                "SELECT p.id, p.subject_type AS subjectType, p.subject_code AS subjectCode, "
                        + "p.resource_type AS resourceType, p.resource_id AS resourceId, "
                        + "p.capability_code AS capabilityCode, p.team_id AS teamId, "
                        + "c.label AS capabilityLabel, t.name AS teamName "
                        + "FROM crf_permission p "
                        + "LEFT JOIN crf_capability c ON c.code = p.capability_code "
                        + "LEFT JOIN team t ON t.id = p.team_id ORDER BY p.id"));
    }

    @PostMapping
    public Result<?> createPermission(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @RequestBody Map<String, Object> body) {
        Long teamId = body.get("teamId") == null || String.valueOf(body.get("teamId")).isBlank()
                ? null : Long.valueOf(String.valueOf(body.get("teamId")).trim());
        requireConfigTeam(auth, teamId);
        String subjectType = str(body.get("subjectType"));
        String subjectCode = str(body.get("subjectCode"));
        String resourceType = str(body.get("resourceType"));
        String capabilityCode = str(body.get("capabilityCode"));
        if (subjectType == null || subjectCode == null || resourceType == null || capabilityCode == null) {
            return Result.fail(400, "subjectType/subjectCode/resourceType/capabilityCode 必填");
        }
        if ("team_role".equals(subjectType)
                && !permissionService.canModifyRole(authContextService.resolveUserFromBearer(auth), teamId, subjectCode)) {
            return Result.fail(403, "不能修改自己角色或 OWNER 角色的权限");
        }
        Long resourceId = body.get("resourceId") == null || String.valueOf(body.get("resourceId")).isBlank()
                ? null : Long.valueOf(String.valueOf(body.get("resourceId")).trim());
        try {
            jdbcTemplate.update("INSERT INTO crf_permission "
                            + "(subject_type, subject_code, resource_type, resource_id, capability_code, team_id) "
                            + "VALUES (?, ?, ?, ?, ?, ?)",
                    subjectType, subjectCode, resourceType, resourceId, capabilityCode, teamId);
        } catch (Exception e) {
            return Result.fail(409, "授权已存在或参数非法");
        }
        return Result.success();
    }

    @DeleteMapping("/{id}")
    public Result<?> deletePermission(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable Long id) {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT subject_type, subject_code, team_id FROM crf_permission WHERE id = ?", id);
        if (rows.isEmpty()) {
            return Result.fail(404, "授权不存在或已被删除");
        }
        String subjectType = str(rows.get(0).get("subject_type"));
        String subjectCode = str(rows.get(0).get("subject_code"));
        Long teamId = rows.get(0).get("team_id") == null ? null : ((Number) rows.get(0).get("team_id")).longValue();
        requireConfigTeam(auth, teamId);
        if ("team_role".equals(subjectType)
                && !permissionService.canModifyRole(authContextService.resolveUserFromBearer(auth), teamId, subjectCode)) {
            return Result.fail(403, "不能修改自己角色或 OWNER 角色的权限");
        }
        jdbcTemplate.update("DELETE FROM crf_permission WHERE id = ?", id);
        return Result.success();
    }

    /** 当前用户可配置权限的团队列表（OWNER 或持有 config:manage 能力），供权限页下拉。 */
    @GetMapping("/config-teams")
    public Result<List<Map<String, Object>>> configTeams(
            @RequestHeader(value = "Authorization", required = false) String auth) {
        return Result.success(permissionService.configurableTeams(authContextService.resolveUserFromBearer(auth)));
    }
}
