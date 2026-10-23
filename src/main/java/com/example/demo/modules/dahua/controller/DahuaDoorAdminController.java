package com.example.demo.modules.dahua.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.dahua.service.DahuaDoorAdminService;
import com.example.demo.modules.dahua.service.DahuaOpenApiService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 门组分配 / 按人授权。读写都直接到大华平台。
 */
@RestController
@RequestMapping("/api/v1/dahua/door-admin")
@Tag(name = "大华门禁管理", description = "门组分配与按人授权")
public class DahuaDoorAdminController {
    private final DahuaDoorAdminService doorAdminService;
    private final DahuaOpenApiService openApiService;
    private final AuthContextService authContextService;

    public DahuaDoorAdminController(DahuaDoorAdminService doorAdminService,
                                    DahuaOpenApiService openApiService,
                                    AuthContextService authContextService) {
        this.doorAdminService = doorAdminService;
        this.openApiService = openApiService;
        this.authContextService = authContextService;
    }

    @GetMapping("/door-groups")
    @Operation(summary = "门组列表（含通道明细）")
    public Result<?> listDoorGroups(@RequestHeader(value = "Authorization", required = false) String authorization) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        try {
            return Result.success(doorAdminService.listDoorGroups());
        } catch (Exception ex) {
            return Result.error(ex.getMessage() == null ? "获取门组失败" : ex.getMessage());
        }
    }

    @PostMapping("/door-groups")
    @Operation(summary = "新建门组")
    public Result<?> createDoorGroup(@RequestHeader(value = "Authorization", required = false) String authorization,
                                     @RequestBody Map<String, Object> body) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        try {
            Map<String, Object> resp = doorAdminService.saveDoorGroup(
                    null,
                    stringOf(body.get("name")),
                    stringOf(body.get("memo")),
                    stringOf(body.get("orgCode")),
                    stringList(body.get("channelCodes")));
            return wrap(resp);
        } catch (IllegalArgumentException ex) {
            return Result.error(ex.getMessage());
        } catch (Exception ex) {
            return Result.error(ex.getMessage() == null ? "新建门组失败" : ex.getMessage());
        }
    }

    @PutMapping("/door-groups/{id}")
    @Operation(summary = "修改门组")
    public Result<?> updateDoorGroup(@RequestHeader(value = "Authorization", required = false) String authorization,
                                     @PathVariable long id,
                                     @RequestBody Map<String, Object> body) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        try {
            Map<String, Object> resp = doorAdminService.saveDoorGroup(
                    id,
                    stringOf(body.get("name")),
                    stringOf(body.get("memo")),
                    stringOf(body.get("orgCode")),
                    stringList(body.get("channelCodes")));
            return wrap(resp);
        } catch (IllegalArgumentException ex) {
            return Result.error(ex.getMessage());
        } catch (Exception ex) {
            return Result.error(ex.getMessage() == null ? "修改门组失败" : ex.getMessage());
        }
    }

    @DeleteMapping("/door-groups/{id}")
    @Operation(summary = "删除门组")
    public Result<?> deleteDoorGroup(@RequestHeader(value = "Authorization", required = false) String authorization,
                                     @PathVariable long id) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        try {
            return wrap(doorAdminService.deleteDoorGroup(id));
        } catch (Exception ex) {
            return Result.error(ex.getMessage() == null ? "删除门组失败" : ex.getMessage());
        }
    }

    @GetMapping("/orgs")
    @Operation(summary = "设备组织（门组归属）")
    public Result<?> listOrgs(@RequestHeader(value = "Authorization", required = false) String authorization) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        try {
            return Result.success(doorAdminService.listOrgs());
        } catch (Exception ex) {
            return Result.error(ex.getMessage() == null ? "获取组织失败" : ex.getMessage());
        }
    }

    @GetMapping("/departments")
    @Operation(summary = "部门树（本地缓存）")
    public Result<?> listDepartments(@RequestHeader(value = "Authorization", required = false) String authorization) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        return Result.success(doorAdminService.listDepartments());
    }

    @GetMapping("/persons")
    @Operation(summary = "按部门/关键字检索人员")
    public Result<?> listPersons(@RequestHeader(value = "Authorization", required = false) String authorization,
                                 @RequestParam(required = false) Long deptId,
                                 @RequestParam(required = false) String keyword,
                                 @RequestParam(defaultValue = "1") int page,
                                 @RequestParam(defaultValue = "20") int pageSize) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        try {
            Map<String, Object> resp = doorAdminService.listPersons(deptId, keyword, page, pageSize);
            if (!openApiService.isSuccess(resp)) {
                return Result.error(errMsg(resp, "获取人员列表失败"));
            }
            return Result.success(resp.get("data"));
        } catch (Exception ex) {
            return Result.error(ex.getMessage() == null ? "获取人员列表失败" : ex.getMessage());
        }
    }

    @GetMapping("/persons/{personCode}/authorities")
    @Operation(summary = "人员当前门禁权限")
    public Result<?> personAuthorities(@RequestHeader(value = "Authorization", required = false) String authorization,
                                       @PathVariable String personCode) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        try {
            Map<String, Object> resp = doorAdminService.personAuthorities(personCode);
            if (!openApiService.isSuccess(resp)) {
                return Result.error(errMsg(resp, "获取权限失败"));
            }
            return Result.success(resp.get("data"));
        } catch (Exception ex) {
            return Result.error(ex.getMessage() == null ? "获取权限失败" : ex.getMessage());
        }
    }

    @PostMapping("/persons")
    @Operation(summary = "新增人员（最小必填 + 可选手机/邮箱/性别/生日）")
    public Result<?> createPerson(@RequestHeader(value = "Authorization", required = false) String authorization,
                                  @RequestBody Map<String, Object> body) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        try {
            return Result.success(doorAdminService.createPerson(
                    stringOf(body.get("name")),
                    stringOf(body.get("code")),
                    longOf(body.get("departmentId")),
                    stringOf(body.get("phone")),
                    stringOf(body.get("email")),
                    intOf(body.get("sex")),
                    stringOf(body.get("birthday")),
                    intOf(body.get("paperType")),
                    stringOf(body.get("paperNumber")),
                    stringOf(body.get("cardNumber"))));
        } catch (IllegalArgumentException ex) {
            return Result.error(ex.getMessage());
        } catch (Exception ex) {
            return Result.error(ex.getMessage() == null ? "新增人员失败" : ex.getMessage());
        }
    }

    @GetMapping("/persons/deleted")
    @Operation(summary = "已删除人员（回收站）")
    public Result<?> listDeletedPersons(@RequestHeader(value = "Authorization", required = false) String authorization,
                                        @RequestParam(required = false) Long deptId,
                                        @RequestParam(required = false) String keyword,
                                        @RequestParam(defaultValue = "1") int page,
                                        @RequestParam(defaultValue = "20") int pageSize) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        try {
            Map<String, Object> resp = doorAdminService.listDeletedPersons(deptId, keyword, page, pageSize);
            if (!openApiService.isSuccess(resp)) {
                return Result.error(errMsg(resp, "获取已删除人员失败"));
            }
            return Result.success(resp.get("data"));
        } catch (Exception ex) {
            return Result.error(ex.getMessage() == null ? "获取已删除人员失败" : ex.getMessage());
        }
    }

    @PostMapping("/persons/restore")
    @Operation(summary = "恢复已删除人员")
    public Result<?> restorePersons(@RequestHeader(value = "Authorization", required = false) String authorization,
                                    @RequestBody Map<String, Object> body) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        try {
            return wrap(doorAdminService.restorePersons(longList(body.get("ids"))));
        } catch (IllegalArgumentException ex) {
            return Result.error(ex.getMessage());
        } catch (Exception ex) {
            return Result.error(ex.getMessage() == null ? "恢复人员失败" : ex.getMessage());
        }
    }

    @PostMapping("/persons/purge")
    @Operation(summary = "彻底删除已删除人员（不可恢复）")
    public Result<?> purgePersons(@RequestHeader(value = "Authorization", required = false) String authorization,
                                  @RequestBody Map<String, Object> body) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        try {
            return wrap(doorAdminService.purgePersons(longList(body.get("ids"))));
        } catch (IllegalArgumentException ex) {
            return Result.error(ex.getMessage());
        } catch (Exception ex) {
            return Result.error(ex.getMessage() == null ? "彻底删除失败" : ex.getMessage());
        }
    }

    @PutMapping("/persons/{personId}/department")
    @Operation(summary = "修改人员所属部门")
    public Result<?> updatePersonDepartment(@RequestHeader(value = "Authorization", required = false) String authorization,
                                            @PathVariable Long personId,
                                            @RequestBody Map<String, Object> body) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        try {
            return Result.success(doorAdminService.updatePersonDepartment(
                    personId,
                    stringOf(body.get("name")),
                    stringOf(body.get("code")),
                    longOf(body.get("departmentId"))));
        } catch (IllegalArgumentException ex) {
            return Result.error(ex.getMessage());
        } catch (Exception ex) {
            return Result.error(ex.getMessage() == null ? "修改部门失败" : ex.getMessage());
        }
    }

    @PostMapping("/persons/{personId}/cards")
    @Operation(summary = "给已有人员补录一张卡")
    public Result<?> addPersonCard(@RequestHeader(value = "Authorization", required = false) String authorization,
                                   @PathVariable Long personId,
                                   @RequestBody Map<String, Object> body) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        try {
            return Result.success(doorAdminService.addPersonCard(
                    personId, longOf(body.get("departmentId")), stringOf(body.get("cardNumber"))));
        } catch (IllegalArgumentException ex) {
            return Result.error(ex.getMessage());
        } catch (Exception ex) {
            return Result.error(ex.getMessage() == null ? "录卡失败" : ex.getMessage());
        }
    }

    @PutMapping("/persons/{personId}/cards/main")
    @Operation(summary = "设为主卡（自动降级原主卡）")
    public Result<?> setMainCard(@RequestHeader(value = "Authorization", required = false) String authorization,
                                 @PathVariable Long personId,
                                 @RequestBody Map<String, Object> body) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        try {
            return Result.success(doorAdminService.setMainCard(
                    personId,
                    longOf(body.get("departmentId")),
                    stringOf(body.get("cardNumber")),
                    stringOf(body.get("oldMainCardNumber"))));
        } catch (IllegalArgumentException ex) {
            return Result.error(ex.getMessage());
        } catch (Exception ex) {
            return Result.error(ex.getMessage() == null ? "设为主卡失败" : ex.getMessage());
        }
    }

    @PostMapping("/persons/{personId}/cards/delete")
    @Operation(summary = "删除人员的某张卡")
    public Result<?> deletePersonCard(@RequestHeader(value = "Authorization", required = false) String authorization,
                                      @PathVariable Long personId,
                                      @RequestBody Map<String, Object> body) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        try {
            return Result.success(doorAdminService.deletePersonCard(stringOf(body.get("cardNumber"))));
        } catch (IllegalArgumentException ex) {
            return Result.error(ex.getMessage());
        } catch (Exception ex) {
            return Result.error(ex.getMessage() == null ? "删卡失败" : ex.getMessage());
        }
    }

    @PostMapping("/persons/delete")
    @Operation(summary = "删除人员（可选连带删除卡片）")
    public Result<?> deletePersons(@RequestHeader(value = "Authorization", required = false) String authorization,
                                   @RequestBody Map<String, Object> body) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        try {
            Map<String, Object> resp = doorAdminService.deletePersons(
                    longList(body.get("ids")),
                    boolOf(body.get("deleteCard")),
                    stringOf(body.get("departmentId")));
            if (resp != null && !openApiService.isSuccess(resp)) {
                String code = String.valueOf(resp.getOrDefault("code", ""));
                if ("28160017".equals(code)) {
                    // 人员库里已不存在，门禁侧仍残留记录：按“已删除”处理，前端把该行隐掉
                    Map<String, Object> gone = new HashMap<>();
                    gone.put("alreadyDeleted", true);
                    gone.put("message", "该人员已不在人员库中，门禁侧残留记录已隐藏");
                    return Result.success(gone);
                }
                return Result.error(errMsg(resp, "删除人员失败"));
            }
            return Result.success(resp);
        } catch (IllegalArgumentException ex) {
            return Result.error(ex.getMessage());
        } catch (Exception ex) {
            return Result.error(ex.getMessage() == null ? "删除人员失败" : ex.getMessage());
        }
    }

    @PostMapping("/authorize")
    @Operation(summary = "按人授权（通道 + 门组）")
    public Result<?> authorize(@RequestHeader(value = "Authorization", required = false) String authorization,
                               @RequestBody Map<String, Object> body) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        try {
            Map<String, Object> resp = doorAdminService.authorize(
                    stringOf(body.get("personCode")),
                    stringList(body.get("channelCodes")),
                    longList(body.get("doorGroupIds")),
                    stringOf(body.get("startDate")),
                    stringOf(body.get("endDate")));
            return wrap(resp);
        } catch (IllegalArgumentException ex) {
            return Result.error(ex.getMessage());
        } catch (Exception ex) {
            return Result.error(ex.getMessage() == null ? "授权失败" : ex.getMessage());
        }
    }

    @PostMapping("/revoke")
    @Operation(summary = "按人回收权限（通道 + 门组）")
    public Result<?> revoke(@RequestHeader(value = "Authorization", required = false) String authorization,
                            @RequestBody Map<String, Object> body) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        try {
            Map<String, Object> resp = doorAdminService.revoke(
                    stringOf(body.get("personCode")),
                    stringList(body.get("channelCodes")),
                    longList(body.get("doorGroupIds")));
            return wrap(resp);
        } catch (IllegalArgumentException ex) {
            return Result.error(ex.getMessage());
        } catch (Exception ex) {
            return Result.error(ex.getMessage() == null ? "回收失败" : ex.getMessage());
        }
    }

    @GetMapping("/channel-groups")
    @Operation(summary = "门禁通道编组列表")
    public Result<?> listChannelGroups(@RequestHeader(value = "Authorization", required = false) String authorization) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        return Result.success(doorAdminService.listChannelGroups());
    }

    @PostMapping("/channel-groups")
    @Operation(summary = "保存门禁通道编组（同名覆盖）")
    public Result<?> saveChannelGroup(@RequestHeader(value = "Authorization", required = false) String authorization,
                                      @RequestBody Map<String, Object> body) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        try {
            doorAdminService.saveChannelGroup(stringOf(body.get("name")), stringList(body.get("channelCodes")));
            return Result.success();
        } catch (IllegalArgumentException ex) {
            return Result.error(ex.getMessage());
        } catch (Exception ex) {
            return Result.error(ex.getMessage() == null ? "保存编组失败" : ex.getMessage());
        }
    }

    @DeleteMapping("/channel-groups/{id}")
    @Operation(summary = "删除门禁通道编组")
    public Result<?> deleteChannelGroup(@RequestHeader(value = "Authorization", required = false) String authorization,
                                        @PathVariable long id) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        try {
            doorAdminService.deleteChannelGroup(id);
            return Result.success();
        } catch (Exception ex) {
            return Result.error(ex.getMessage() == null ? "删除编组失败" : ex.getMessage());
        }
    }

    @PutMapping("/channels/name")
    @Operation(summary = "修改单个通道名称（门禁/视频通用）")
    public Result<?> renameChannel(@RequestHeader(value = "Authorization", required = false) String authorization,
                                   @RequestBody Map<String, Object> body) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        try {
            return wrap(doorAdminService.renameChannel(
                    stringOf(body.get("channelCode")),
                    stringOf(body.get("channelName"))));
        } catch (IllegalArgumentException ex) {
            return Result.error(ex.getMessage());
        } catch (Exception ex) {
            return Result.error(ex.getMessage() == null ? "修改通道名称失败" : ex.getMessage());
        }
    }

    @PostMapping("/channels/batch-rename")
    @Operation(summary = "批量修改通道名称（门禁/视频通用）")
    public Result<?> batchRenameChannels(@RequestHeader(value = "Authorization", required = false) String authorization,
                                         @RequestBody Map<String, Object> body) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        try {
            List<Map<String, String>> items = new ArrayList<>();
            Object raw = body.get("items");
            if (raw instanceof List<?> list) {
                for (Object it : list) {
                    if (it instanceof Map<?, ?> m) {
                        Map<String, String> row = new HashMap<>();
                        row.put("channelCode", stringOf(m.get("channelCode")));
                        row.put("channelName", stringOf(m.get("channelName")));
                        items.add(row);
                    }
                }
            }
            if (items.isEmpty()) return Result.error("请至少提交一个通道");
            if (items.size() > 200) return Result.error("单次最多修改 200 个通道");
            return Result.success(doorAdminService.batchRenameChannels(items));
        } catch (Exception ex) {
            return Result.error(ex.getMessage() == null ? "批量改名失败" : ex.getMessage());
        }
    }

    private Result<?> wrap(Map<String, Object> resp) {
        if (resp == null) return Result.error("大华平台无响应");
        if (openApiService.isSuccess(resp)) return Result.success(resp);
        return Result.error(errMsg(resp, "大华平台返回失败"));
    }

    private static String errMsg(Map<String, Object> resp, String fallback) {
        if (resp == null) return fallback;
        Object msg = resp.get("errMsg");
        if (msg == null) msg = resp.get("message");
        String s = msg == null ? "" : String.valueOf(msg).trim();
        return s.isEmpty() ? fallback : s;
    }

    private static String stringOf(Object v) {
        return v == null ? null : String.valueOf(v);
    }

    private static Long longOf(Object v) {
        if (v == null) return null;
        if (v instanceof Number n) return n.longValue();
        try { return Long.parseLong(String.valueOf(v).trim()); } catch (Exception e) { return null; }
    }

    private static Integer intOf(Object v) {
        if (v == null) return null;
        if (v instanceof Number n) return n.intValue();
        try { return Integer.parseInt(String.valueOf(v).trim()); } catch (Exception e) { return null; }
    }

    private static boolean boolOf(Object v) {
        if (v instanceof Boolean b) return b;
        String s = v == null ? "" : String.valueOf(v);
        return "true".equalsIgnoreCase(s) || "1".equals(s);
    }

    private static List<String> stringList(Object v) {
        List<String> out = new ArrayList<>();
        if (v instanceof List<?> list) {
            for (Object x : list) {
                if (x != null && !String.valueOf(x).isBlank()) out.add(String.valueOf(x).trim());
            }
        }
        return out;
    }

    private static List<Long> longList(Object v) {
        List<Long> out = new ArrayList<>();
        if (v instanceof List<?> list) {
            for (Object x : list) {
                Long n = DahuaOpenApiService.parseLong(x);
                if (n != null) out.add(n);
            }
        }
        return out;
    }

    private Result<?> requireAdmin(String authorization) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null) return Result.error("未登录或令牌无效");
        if (user.getStatus() != null && user.getStatus() == 0) return Result.error("账号已禁用");
        RoleEnum role = user.getRole() != null ? user.getRole() : RoleEnum.MEMBER;
        if (role.getLevel() < RoleEnum.ADMIN.getLevel()) return Result.error("无权限访问");
        return null;
    }
}
