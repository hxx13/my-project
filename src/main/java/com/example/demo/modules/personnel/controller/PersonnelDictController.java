package com.example.demo.modules.personnel.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 部门/课题组字典配置（部门 = 院校）。列表登录可读，写操作需 SUPER_ADMIN。
 */
@RestController
@RequestMapping("/api/personnel-dict")
@Tag(name = "人员字典配置")
public class PersonnelDictController {

    private final AuthContextService authContextService;
    private final JdbcTemplate jdbcTemplate;

    public PersonnelDictController(AuthContextService authContextService, JdbcTemplate jdbcTemplate) {
        this.authContextService = authContextService;
        this.jdbcTemplate = jdbcTemplate;
    }

    private User resolveUser(String authorization) {
        User u = authContextService.resolveUserFromBearer(authorization);
        if (u == null) return null;
        if (u.getRole() == null) u.setRole(RoleEnum.MEMBER);
        return u;
    }

    private Result<?> requireSuperAdmin(User u) {
        if (u == null) return Result.error("未登录");
        if (u.getRole() == null || u.getRole().getLevel() < RoleEnum.SUPER_ADMIN.getLevel()) {
            return Result.error("无权限（仅超级管理员）");
        }
        return null;
    }

    @GetMapping("/departments")
    @Operation(summary = "部门字典列表")
    public Result<List<Map<String, Object>>> departments(@RequestHeader(value = "Authorization", required = false) String authorization) {
        User u = resolveUser(authorization);
        if (u == null) return Result.fail(401, "未登录");
        return Result.success(jdbcTemplate.queryForList(
                "SELECT id, name, is_school AS isSchool, active, sort_order AS sortOrder FROM department ORDER BY id ASC"));
    }

    @PutMapping("/departments/{id}")
    @Operation(summary = "更新部门（校内/校外归属、启用状态）")
    public Result<?> updateDepartment(@RequestHeader(value = "Authorization", required = false) String authorization,
                                      @PathVariable Long id,
                                      @RequestBody Map<String, Object> body) {
        User u = resolveUser(authorization);
        Result<?> denied = requireSuperAdmin(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        Integer isSchool = toInt(body.get("isSchool"));
        Integer active = toInt(body.get("active"));
        StringBuilder sql = new StringBuilder("UPDATE department SET ");
        if (isSchool != null) { sql.append("is_school=").append(isSchool).append(", "); }
        if (active != null) { sql.append("active=").append(active).append(", "); }
        if (sql.toString().endsWith(", ")) {
            sql.setLength(sql.length() - 2);
            sql.append(" WHERE id=").append(id);
            jdbcTemplate.update(sql.toString());
        }
        return Result.success();
    }

    @GetMapping("/project-groups")
    @Operation(summary = "课题组字典列表")
    public Result<List<Map<String, Object>>> projectGroups(@RequestHeader(value = "Authorization", required = false) String authorization) {
        User u = resolveUser(authorization);
        if (u == null) return Result.fail(401, "未登录");
        return Result.success(jdbcTemplate.queryForList(
                "SELECT pg.id, pg.name, pg.department_id AS departmentId, d.name AS departmentName, pg.active " +
                        "FROM project_group pg LEFT JOIN department d ON d.id = pg.department_id ORDER BY pg.id ASC"));
    }

    @PutMapping("/project-groups/{id}")
    @Operation(summary = "更新课题组（归属部门、启用状态）")
    public Result<?> updateProjectGroup(@RequestHeader(value = "Authorization", required = false) String authorization,
                                        @PathVariable Long id,
                                        @RequestBody Map<String, Object> body) {
        User u = resolveUser(authorization);
        Result<?> denied = requireSuperAdmin(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        Long departmentId = toLong(body.get("departmentId"));
        Integer active = toInt(body.get("active"));
        StringBuilder sql = new StringBuilder("UPDATE project_group SET ");
        if (departmentId != null) { sql.append("department_id=").append(departmentId).append(", "); }
        if (active != null) { sql.append("active=").append(active).append(", "); }
        if (sql.toString().endsWith(", ")) {
            sql.setLength(sql.length() - 2);
            sql.append(" WHERE id=").append(id);
            jdbcTemplate.update(sql.toString());
        }
        return Result.success();
    }

    private static Integer toInt(Object v) {
        if (v == null) return null;
        if (v instanceof Number n) return n.intValue();
        try { return Integer.parseInt(String.valueOf(v).trim()); } catch (Exception e) { return null; }
    }

    private static Long toLong(Object v) {
        if (v == null) return null;
        if (v instanceof Number n) return n.longValue();
        try { return Long.parseLong(String.valueOf(v).trim()); } catch (Exception e) { return null; }
    }
}
