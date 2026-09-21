package com.example.demo.modules.personnel.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.dao.DuplicateKeyException;
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

    @PostMapping("/departments")
    @Operation(summary = "新建部门")
    public Result<?> createDepartment(@RequestHeader(value = "Authorization", required = false) String authorization,
                                      @RequestBody Map<String, Object> body) {
        User u = resolveUser(authorization);
        if (u == null) return Result.fail(401, "未登录");
        Result<?> denied = requireSuperAdmin(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        String name = str(body.get("name"));
        if (name.isEmpty()) return Result.error("部门名称不能为空");
        Integer isSchool = toInt(body.get("isSchool"));
        try {
            jdbcTemplate.update("INSERT INTO department(name, is_school, active) VALUES(?, ?, 1)",
                    name, isSchool == null ? 0 : isSchool);
        } catch (DuplicateKeyException e) {
            return Result.error("已存在同名部门：" + name);
        }
        return Result.success(Map.of("ok", true));
    }

    @PutMapping("/departments/{id}/rename")
    @Operation(summary = "重命名部门（成员显示会自动跟随，无需改人员表）")
    public Result<?> renameDepartment(@RequestHeader(value = "Authorization", required = false) String authorization,
                                      @PathVariable Long id,
                                      @RequestBody Map<String, Object> body) {
        User u = resolveUser(authorization);
        if (u == null) return Result.fail(401, "未登录");
        Result<?> denied = requireSuperAdmin(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        String name = str(body.get("name"));
        if (name.isEmpty()) return Result.error("部门名称不能为空");
        try {
            int n = jdbcTemplate.update("UPDATE department SET name = ? WHERE id = ?", name, id);
            if (n <= 0) return Result.error("部门不存在");
        } catch (DuplicateKeyException e) {
            return Result.error("已存在同名部门：" + name);
        }
        return Result.success(Map.of("ok", true));
    }

    @DeleteMapping("/departments/{id}")
    @Operation(summary = "删除部门（有人属于它时拒绝）")
    public Result<?> deleteDepartment(@RequestHeader(value = "Authorization", required = false) String authorization,
                                      @PathVariable Long id) {
        User u = resolveUser(authorization);
        if (u == null) return Result.fail(401, "未登录");
        Result<?> denied = requireSuperAdmin(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        List<Map<String, Object>> rows = jdbcTemplate.queryForList("SELECT name FROM department WHERE id = ?", id);
        if (rows.isEmpty()) return Result.error("部门不存在");
        String name = str(rows.get(0).get("name"));
        // 两个判据都要看：改名后人员身上的文本快照可能还是旧名，但 department_id 已锚定
        Integer cnt = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM personnel WHERE department_id = ? OR department_name = ?", Integer.class, id, name);
        if (cnt != null && cnt > 0) {
            return Result.error("该部门下还有 " + cnt + " 名人员，请先把他们迁到别的部门再删除");
        }
        jdbcTemplate.update("DELETE FROM department WHERE id = ?", id);
        return Result.success(Map.of("ok", true));
    }

    @PostMapping("/project-groups")
    @Operation(summary = "新建课题组")
    public Result<?> createProjectGroup(@RequestHeader(value = "Authorization", required = false) String authorization,
                                        @RequestBody Map<String, Object> body) {
        User u = resolveUser(authorization);
        if (u == null) return Result.fail(401, "未登录");
        Result<?> denied = requireSuperAdmin(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        String name = str(body.get("name"));
        if (name.isEmpty()) return Result.error("课题组名称不能为空");
        Long departmentId = toLong(body.get("departmentId"));
        try {
            jdbcTemplate.update("INSERT INTO project_group(name, department_id, active) VALUES(?, ?, 1)", name, departmentId);
        } catch (DuplicateKeyException e) {
            return Result.error("已存在同名课题组：" + name);
        }
        return Result.success(Map.of("ok", true));
    }

    @PutMapping("/project-groups/{id}/rename")
    @Operation(summary = "重命名课题组（成员显示会自动跟随，无需改人员表）")
    public Result<?> renameProjectGroup(@RequestHeader(value = "Authorization", required = false) String authorization,
                                        @PathVariable Long id,
                                        @RequestBody Map<String, Object> body) {
        User u = resolveUser(authorization);
        if (u == null) return Result.fail(401, "未登录");
        Result<?> denied = requireSuperAdmin(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        String name = str(body.get("name"));
        if (name.isEmpty()) return Result.error("课题组名称不能为空");
        try {
            int n = jdbcTemplate.update("UPDATE project_group SET name = ? WHERE id = ?", name, id);
            if (n <= 0) return Result.error("课题组不存在");
        } catch (DuplicateKeyException e) {
            return Result.error("已存在同名课题组：" + name);
        }
        return Result.success(Map.of("ok", true));
    }

    @DeleteMapping("/project-groups/{id}")
    @Operation(summary = "删除课题组（有人属于它时拒绝）")
    public Result<?> deleteProjectGroup(@RequestHeader(value = "Authorization", required = false) String authorization,
                                        @PathVariable Long id) {
        User u = resolveUser(authorization);
        if (u == null) return Result.fail(401, "未登录");
        Result<?> denied = requireSuperAdmin(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        List<Map<String, Object>> rows = jdbcTemplate.queryForList("SELECT name FROM project_group WHERE id = ?", id);
        if (rows.isEmpty()) return Result.error("课题组不存在");
        String name = str(rows.get(0).get("name"));
        // FIND_IN_SET 兜住「一人同时属于多个课题组」的行（它们的 project_group_id 为空，文本是逗号串）
        Integer cnt = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM personnel WHERE project_group_id = ? " +
                        "OR FIND_IN_SET(?, REPLACE(project_group_name, ', ', ',')) > 0",
                Integer.class, id, name);
        if (cnt != null && cnt > 0) {
            return Result.error("该课题组下还有 " + cnt + " 名人员，请先把他们迁到别的课题组再删除");
        }
        jdbcTemplate.update("DELETE FROM project_group WHERE id = ?", id);
        return Result.success(Map.of("ok", true));
    }

    private static String str(Object v) {
        return v == null ? "" : String.valueOf(v).trim();
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
