package com.example.demo.modules.personnel.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.personnel.dto.PersonnelFilter;
import com.example.demo.modules.personnel.service.PersonnelMergeService;
import com.example.demo.modules.personnel.service.PersonnelProfileService;
import com.example.demo.modules.personnel.service.PersonnelService;
import com.example.demo.modules.personnel.service.PersonnelSignatureService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
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
    private final PersonnelMergeService personnelMergeService;
    private final PersonnelProfileService personnelProfileService;
    private final PersonnelSignatureService personnelSignatureService;

    public PersonnelController(AuthContextService authContextService,
                               PersonnelService personnelService,
                               JdbcTemplate jdbcTemplate,
                               PersonnelMergeService personnelMergeService,
                               PersonnelProfileService personnelProfileService,
                               PersonnelSignatureService personnelSignatureService) {
        this.authContextService = authContextService;
        this.personnelService = personnelService;
        this.jdbcTemplate = jdbcTemplate;
        this.personnelMergeService = personnelMergeService;
        this.personnelProfileService = personnelProfileService;
        this.personnelSignatureService = personnelSignatureService;
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
                                            @RequestParam(required = false) Boolean trashOnly,
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
        // 同时带上 id：字典改名后人员身上的文本快照仍是 ARO 旧名，只有 id 认得出归属
        // （见 PersonnelSqlProvider.where 的 id 分支 —— 缺了这两行那条分支永远不可达）
        filter.setProjectGroupId(groupId);
        filter.setDepartmentId(departmentId);
        filter.setRole(trimToNull(role));
        filter.setStatus(status);
        filter.setIsSchool(isSchool);
        filter.setRoomName(trimToNull(roomName));
        filter.setIdentityTagId(identityTagId);
        filter.setTrashOnly(trashOnly);
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

    @PostMapping("/{id}/sync")
    @Operation(summary = "只同步这一个人员的信息（不触碰他人）")
    public Result<?> syncOne(@RequestHeader(value = "Authorization", required = false) String authorization,
                             @PathVariable Long id) {
        User u = resolveUser(authorization);
        if (u == null) return Result.fail(401, "未登录");
        Result<?> denied = requireAdmin(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        try {
            return Result.success(personnelService.syncOne(id));
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }

    @PostMapping("/merge")
    @Operation(summary = "人工合并两个人员档案（同一自然人的教职工行与学生行）")
    public Result<?> merge(@RequestHeader(value = "Authorization", required = false) String authorization,
                           @RequestBody Map<String, Object> body) {
        User u = resolveUser(authorization);
        if (u == null) return Result.fail(401, "未登录");
        Result<?> denied = requireSuperAdmin(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        Long survivorId = toLong(body.get("survivorId"));
        Long mergedId = toLong(body.get("mergedId"));
        if (survivorId == null || mergedId == null) return Result.error("survivorId / mergedId 必填");
        try {
            personnelMergeService.merge(survivorId, mergedId, u.getId());
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
        return Result.success(Map.of("ok", true));
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "删除人员到回收站（软删除，可恢复）")
    public Result<?> moveToTrash(@RequestHeader(value = "Authorization", required = false) String authorization,
                                 @PathVariable Long id) {
        User u = resolveUser(authorization);
        if (u == null) return Result.fail(401, "未登录");
        Result<?> denied = requireSuperAdmin(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        try {
            personnelService.moveToTrash(id, u.getId());
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
        return Result.success(Map.of("ok", true));
    }

    @PostMapping("/{id}/restore")
    @Operation(summary = "从回收站恢复人员")
    public Result<?> restoreFromTrash(@RequestHeader(value = "Authorization", required = false) String authorization,
                                      @PathVariable Long id) {
        User u = resolveUser(authorization);
        if (u == null) return Result.fail(401, "未登录");
        Result<?> denied = requireSuperAdmin(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        try {
            personnelService.restoreFromTrash(id);
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
        return Result.success(Map.of("ok", true));
    }

    @DeleteMapping("/{id}/purge")
    @Operation(summary = "彻底删除人员（连同 ARO 侧人员行与登录账号；不可逆）")
    public Result<?> purge(@RequestHeader(value = "Authorization", required = false) String authorization,
                           @PathVariable Long id) {
        User u = resolveUser(authorization);
        if (u == null) return Result.fail(401, "未登录");
        Result<?> denied = requireSuperAdmin(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        try {
            personnelService.purge(id);
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
        return Result.success(Map.of("ok", true));
    }

    @GetMapping("/{id}/signature")
    @Operation(summary = "查看某人的电子签名")
    public Result<?> getSignature(@RequestHeader(value = "Authorization", required = false) String authorization,
                                  @PathVariable Long id) {
        User u = resolveUser(authorization);
        if (u == null) return Result.fail(401, "未登录");
        Result<?> denied = requireAdmin(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        try {
            return Result.success(personnelSignatureService.signatureByPersonnel(id));
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }

    @DeleteMapping("/{id}/signature")
    @Operation(summary = "重置某人的电子签名（清空后本人可重签）")
    public Result<?> resetSignature(@RequestHeader(value = "Authorization", required = false) String authorization,
                                    @PathVariable Long id) {
        User u = resolveUser(authorization);
        if (u == null) return Result.fail(401, "未登录");
        Result<?> denied = requireSuperAdmin(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        try {
            int n = personnelSignatureService.reset(id, u.getId());
            return Result.success(Map.of("ok", true, "removed", n));
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }

    @PutMapping("/{id}/head")
    @Operation(summary = "设置人员头像（本地覆盖层）")
    public Result<?> updateHead(@RequestHeader(value = "Authorization", required = false) String authorization,
                                @PathVariable Long id,
                                @RequestBody Map<String, Object> body) {
        User u = resolveUser(authorization);
        if (u == null) return Result.fail(401, "未登录");
        Result<?> denied = requireAdmin(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        try {
            personnelService.updateHeadOverride(id, body.get("url") == null ? null : String.valueOf(body.get("url")));
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
        return Result.success(Map.of("ok", true));
    }

    @DeleteMapping("/{id}/head")
    @Operation(summary = "重置人员头像（清空本地覆盖层，回落 ARO 原图）")
    public Result<?> resetHead(@RequestHeader(value = "Authorization", required = false) String authorization,
                               @PathVariable Long id) {
        User u = resolveUser(authorization);
        if (u == null) return Result.fail(401, "未登录");
        Result<?> denied = requireAdmin(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        try {
            personnelService.updateHeadOverride(id, null);
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
        return Result.success(Map.of("ok", true));
    }

    @PutMapping("/me/head")
    @Operation(summary = "设置当前登录者自己的头像")
    public Result<?> updateMyHead(@RequestHeader(value = "Authorization", required = false) String authorization,
                                  @RequestBody Map<String, Object> body) {
        User u = resolveUser(authorization);
        if (u == null) return Result.fail(401, "未登录");
        String pid = personnelService.resolveIdByAccount(u.getId());
        if (pid == null) return Result.error("未找到人员档案");
        try {
            personnelService.updateHeadOverride(Long.parseLong(pid),
                    body.get("url") == null ? null : String.valueOf(body.get("url")));
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
        return Result.success(Map.of("ok", true));
    }

    @PutMapping("/me/profile")
    @Operation(summary = "完善当前登录者本人资料（姓名/手机号/性别/部门，非空才更新）")
    public Result<?> updateMyProfile(@RequestHeader(value = "Authorization", required = false) String authorization,
                                     @RequestBody Map<String, Object> body) {
        User u = resolveUser(authorization);
        if (u == null) return Result.fail(401, "未登录");
        try {
            personnelProfileService.updateMyProfile(
                    u.getId(),
                    strOrNull(body.get("name")),
                    strOrNull(body.get("mobilePhone")),
                    intOrNull(body.get("gender")),
                    strOrNull(body.get("departmentName")));
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
        return Result.success(Map.of("ok", true));
    }

    /** 合并不可逆，门槛高于 requireAdmin。 */
    private Result<?> requireSuperAdmin(User u) {
        if (u == null) return Result.error("未登录");
        if (u.getRole() == null || u.getRole().getLevel() < RoleEnum.SUPER_ADMIN.getLevel()) {
            return Result.error("无权限");
        }
        return null;
    }

    private static Long toLong(Object v) {
        if (v == null) return null;
        try {
            return Long.parseLong(String.valueOf(v).trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static String strOrNull(Object v) {
        if (v == null) return null;
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }

    private static Integer intOrNull(Object v) {
        if (v == null) return null;
        if (v instanceof Number n) return n.intValue();
        try {
            return Integer.parseInt(String.valueOf(v).trim());
        } catch (NumberFormatException e) {
            return null;
        }
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

    @PutMapping("/{id}/org")
    @Operation(summary = "设置人员的部门或课题组归属（写 id，文本快照一并写）")
    public Result<?> updateOrg(@RequestHeader(value = "Authorization", required = false) String authorization,
                               @PathVariable Long id,
                               @RequestBody Map<String, Object> body) {
        User u = resolveUser(authorization);
        if (u == null) return Result.fail(401, "未登录");
        Result<?> denied = requireAdmin(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        String kind = String.valueOf(body.get("kind"));
        if (!"department".equals(kind) && !"group".equals(kind)) {
            return Result.error("kind 必须是 department 或 group");
        }
        try {
            personnelService.updateOrgRef(id, "department".equals(kind), toLong(body.get("refId")),
                    body.get("name") == null ? null : String.valueOf(body.get("name")));
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
        return Result.success(Map.of("ok", true));
    }

    @PutMapping("/{id}/name")
    @Operation(summary = "修改真实姓名（personnel.name；不改登录账号 username）")
    public Result<?> updateName(@RequestHeader(value = "Authorization", required = false) String authorization,
                                 @PathVariable Long id,
                                 @RequestBody Map<String, Object> body) {
        User u = resolveUser(authorization);
        if (u == null) return Result.fail(401, "未登录");
        Result<?> denied = requireAdmin(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        Object raw = body == null ? null : body.get("name");
        String name = raw == null ? null : String.valueOf(raw);
        try {
            personnelService.updateName(id, name);
            return Result.success();
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }

    @GetMapping("/{id}/room-authorization")
    @Operation(summary = "读取人员的房间授权（本地覆盖层优先，否则回官方 allowed_rooms_json）")
    public Result<Map<String, Object>> getRoomAuthorization(@RequestHeader(value = "Authorization", required = false) String authorization,
                                                            @PathVariable Long id) {
        User u = resolveUser(authorization);
        if (u == null) return Result.fail(401, "未登录");
        Result<?> denied = requireAdmin(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        try {
            return Result.success(personnelService.getRoomAuthorization(String.valueOf(id)));
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }

    @PutMapping("/{id}/room-authorization")
    @Operation(summary = "写入人员的本地房间授权（本地覆盖层，roomIds 为空 = 撤销全部）")
    public Result<?> updateRoomAuthorization(@RequestHeader(value = "Authorization", required = false) String authorization,
                                            @PathVariable Long id,
                                            @RequestBody Map<String, Object> body) {
        User u = resolveUser(authorization);
        if (u == null) return Result.fail(401, "未登录");
        Result<?> denied = requireAdmin(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        List<String> roomIds = extractStringList(body == null ? null : body.get("roomIds"));
        String operatorId = u.getId() != null ? u.getId() : (u.getUsername() != null ? u.getUsername() : "");
        try {
            return Result.success(personnelService.updateRoomAuthorization(String.valueOf(id), roomIds, operatorId));
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }

    private static List<String> extractStringList(Object raw) {
        if (!(raw instanceof List<?> list)) return List.of();
        List<String> result = new ArrayList<>();
        for (Object o : list) {
            if (o != null && !String.valueOf(o).isBlank()) result.add(String.valueOf(o));
        }
        return result;
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
