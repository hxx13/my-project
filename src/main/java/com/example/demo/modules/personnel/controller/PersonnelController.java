package com.example.demo.modules.personnel.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.personnel.dto.PersonnelFilter;
import com.example.demo.modules.personnel.service.PersonnelService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 统一人员表接口（以姓名为中心 + 双 id）。
 */
@RestController
@RequestMapping("/api/personnel")
@Tag(name = "统一人员表")
public class PersonnelController {

    private final AuthContextService authContextService;
    private final PersonnelService personnelService;
    private final JdbcTemplate jdbcTemplate;

    public PersonnelController(AuthContextService authContextService,
                               PersonnelService personnelService,
                               JdbcTemplate jdbcTemplate) {
        this.authContextService = authContextService;
        this.personnelService = personnelService;
        this.jdbcTemplate = jdbcTemplate;
    }

    private User resolveUser(String authorization) {
        User u = authContextService.resolveUserFromBearer(authorization);
        if (u == null) return null;
        if (u.getRole() == null) u.setRole(RoleEnum.MEMBER);
        return u;
    }

    private Result<?> requireAdmin(User u) {
        if (u == null) return Result.error("未登录");
        if (u.getRole() == null || u.getRole().getLevel() < RoleEnum.ADMIN.getLevel()) {
            return Result.error("无权限");
        }
        return null;
    }

    @GetMapping
    @Operation(summary = "统一人员查询（keyword/分区/课题组/部门/角色/状态/校内校外/房间/身份标签）")
    public Result<Map<String, Object>> list(@RequestHeader(value = "Authorization", required = false) String authorization,
                                            @RequestParam(required = false) String keyword,
                                            @RequestParam(required = false) String accountType,
                                            @RequestParam(required = false) Long groupId,
                                            @RequestParam(required = false) Long departmentId,
                                            @RequestParam(required = false) String role,
                                            @RequestParam(required = false) Integer status,
                                            @RequestParam(required = false) Integer isSchool,
                                            @RequestParam(required = false) String roomName,
                                            @RequestParam(required = false) Long identityTagId,
                                            @RequestParam(defaultValue = "1") int page,
                                            @RequestParam(defaultValue = "20") int pageSize) {
        User u = resolveUser(authorization);
        if (u == null) return Result.fail(401, "未登录");
        Result<?> denied = requireAdmin(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        PersonnelFilter filter = new PersonnelFilter();
        filter.setKeyword(trimToNull(keyword));
        filter.setAccountType(normalizeAccountType(accountType));
        filter.setProjectGroupName(resolveName("project_group", groupId));
        filter.setDepartmentName(resolveName("department", departmentId));
        filter.setRole(trimToNull(role));
        filter.setStatus(status);
        filter.setIsSchool(isSchool);
        filter.setRoomName(trimToNull(roomName));
        filter.setIdentityTagId(identityTagId);
        filter.setPage(page);
        filter.setPageSize(pageSize);
        return Result.success(personnelService.listUnified(filter));
    }

    @GetMapping("/rooms")
    @Operation(summary = "房间字典（从人员授权去重拆分）")
    public Result<List<String>> rooms(@RequestHeader(value = "Authorization", required = false) String authorization) {
        User u = resolveUser(authorization);
        if (u == null) return Result.fail(401, "未登录");
        Result<?> denied = requireAdmin(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        return Result.success(personnelService.listRooms());
    }

    @PostMapping("/sync")
    @Operation(summary = "手动触发统一人员聚合（aro_personnel + sys_user → personnel）")
    public Result<Map<String, Object>> sync(@RequestHeader(value = "Authorization", required = false) String authorization) {
        User u = resolveUser(authorization);
        if (u == null) return Result.fail(401, "未登录");
        Result<?> denied = requireAdmin(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        return Result.success(personnelService.syncUnified());
    }

    @PutMapping("/{id}/field")
    @Operation(summary = "更新单个本地字段（部门/课题组/工号等，白名单）")
    public Result<?> updateField(@RequestHeader(value = "Authorization", required = false) String authorization,
                                 @PathVariable Long id,
                                 @RequestBody Map<String, Object> body) {
        User u = resolveUser(authorization);
        if (u == null) return Result.fail(401, "未登录");
        Result<?> denied = requireAdmin(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        String field = String.valueOf(body.get("field"));
        String value = body.get("value") == null ? null : String.valueOf(body.get("value"));
        try {
            personnelService.updateField(id, field, value);
            return Result.success();
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }

    private static String trimToNull(String s) {
        if (s == null) return null;
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }

    private static String normalizeAccountType(String v) {
        if (v == null) return null;
        String t = v.trim().toLowerCase();
        return ("sys".equals(t) || "nosys".equals(t)) ? t : null;
    }

    /** 解析课题组/部门字典 id → 名称；查不到返回 null（不参与过滤）。 */
    private String resolveName(String table, Long id) {
        if (id == null) return null;
        try {
            return jdbcTemplate.queryForObject(
                    "SELECT name FROM " + table + " WHERE id = ?", String.class, id);
        } catch (EmptyResultDataAccessException e) {
            return null;
        }
    }
}
