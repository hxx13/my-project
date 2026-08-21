package com.example.demo.modules.nhp.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.nhp.entity.CrfField;
import com.example.demo.modules.nhp.service.NhpFieldDictionaryService;
import com.example.demo.modules.nhp.service.NhpFieldService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/** NHP 字段字典管理。 */
@RestController
@RequestMapping("/api/nhp/fields")
@Tag(name = "NHP 字段字典", description = "字段 CRUD + 校对流（提交/通过/驳回）")
public class NhpFieldController {

    /** 校对通过/驳回：与内容管理壳一致，ADMIN+（PI 角色绑定落地前由管理员代行）。 */
    private static final RoleEnum REVIEW_MIN_ROLE = RoleEnum.ADMIN;

    private final NhpFieldService service;
    private final NhpFieldDictionaryService dictionaryService;
    private final AuthContextService authContextService;

    public NhpFieldController(NhpFieldService service,
                              NhpFieldDictionaryService dictionaryService,
                              AuthContextService authContextService) {
        this.service = service;
        this.dictionaryService = dictionaryService;
        this.authContextService = authContextService;
    }

    private Result<?> requireMinRole(String authHeader, RoleEnum minRole) {
        User user = authContextService.resolveUserFromBearer(authHeader);
        if (user == null) {
            return Result.fail(401, "未登录或 Token 无效");
        }
        RoleEnum role = user.getRole() == null ? RoleEnum.MEMBER : user.getRole();
        if (role.getLevel() < minRole.getLevel()) {
            return Result.fail(403, "无权限：需要 " + minRole.getCode()
                    + " 及以上（字段校对由管理员代行，待 PI 身份标签落地）");
        }
        return null;
    }

    private String operatorLabel(User user) {
        if (user == null) {
            return "unknown";
        }
        if (user.getName() != null && !user.getName().isBlank()) {
            return user.getName().trim();
        }
        if (user.getDisplayNickname() != null && !user.getDisplayNickname().isBlank()) {
            return user.getDisplayNickname().trim();
        }
        return user.getUsername() != null ? user.getUsername() : String.valueOf(user.getId());
    }

    private Long resolveDictId(Long dictionaryId, String dictKey) {
        if (dictionaryId != null) {
            return dictionaryId;
        }
        if (dictKey != null && !dictKey.isBlank()) {
            var d = dictionaryService.getByKey(dictKey.trim());
            return d == null ? null : d.getId();
        }
        return null;
    }

    @GetMapping
    @Operation(summary = "字段列表（按字典套/域/码表；status=PENDING_REVIEW 可筛待校对）")
    public Result<List<CrfField>> list(
            @RequestParam(value = "domain", required = false) String domain,
            @RequestParam(value = "codelistId", required = false) Long codelistId,
            @RequestParam(value = "dictionaryId", required = false) Long dictionaryId,
            @RequestParam(value = "dictKey", required = false) String dictKey,
            @RequestParam(value = "status", required = false) String status) {
        Long dictId = resolveDictId(dictionaryId, dictKey);
        if (dictId == null && dictKey != null && !dictKey.isBlank()) {
            return Result.error("字段字典不存在: " + dictKey);
        }
        if (status != null && "PENDING_REVIEW".equalsIgnoreCase(status.trim())) {
            return Result.success(service.listPendingReview(dictId));
        }
        List<CrfField> rows = service.list(domain, codelistId, dictId);
        if (status != null && !status.isBlank()) {
            String st = status.trim().toUpperCase();
            rows = rows.stream().filter(f -> st.equalsIgnoreCase(f.getStatus())).toList();
        }
        return Result.success(rows);
    }

    @GetMapping("/pending-review")
    @Operation(summary = "待校对字段队列")
    public Result<List<CrfField>> pendingReview(
            @RequestParam(value = "dictionaryId", required = false) Long dictionaryId,
            @RequestParam(value = "dictKey", required = false) String dictKey) {
        Long dictId = resolveDictId(dictionaryId, dictKey);
        if (dictId == null && dictKey != null && !dictKey.isBlank()) {
            return Result.error("字段字典不存在: " + dictKey);
        }
        return Result.success(service.listPendingReview(dictId));
    }

    @PostMapping
    @Operation(summary = "新建字段")
    public Result<CrfField> create(@RequestBody CrfField field) {
        return service.create(field);
    }

    @PutMapping("/{fieldId}")
    @Operation(summary = "更新字段")
    public Result<?> update(@PathVariable Long fieldId, @RequestBody CrfField patch) {
        return service.update(fieldId, patch);
    }

    @PostMapping("/{fieldId}/submit-review")
    @Operation(summary = "提交字段校对（DRAFT→PENDING_REVIEW）")
    public Result<?> submitReview(@PathVariable Long fieldId) {
        return service.submitReview(fieldId);
    }

    @PostMapping("/{fieldId}/approve")
    @Operation(summary = "校对通过并冻结（PENDING_REVIEW→FROZEN）")
    public Result<?> approve(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable Long fieldId,
            @RequestBody(required = false) Map<String, Object> body) {
        Result<?> denied = requireMinRole(auth, REVIEW_MIN_ROLE);
        if (denied != null) {
            return denied;
        }
        User user = authContextService.resolveUserFromBearer(auth);
        String comment = body != null && body.get("comment") != null
                ? String.valueOf(body.get("comment")) : null;
        return service.approveReview(fieldId, operatorLabel(user), comment);
    }

    @PostMapping("/{fieldId}/reject")
    @Operation(summary = "校对驳回（PENDING_REVIEW→DRAFT）")
    public Result<?> reject(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable Long fieldId,
            @RequestBody(required = false) Map<String, Object> body) {
        Result<?> denied = requireMinRole(auth, REVIEW_MIN_ROLE);
        if (denied != null) {
            return denied;
        }
        User user = authContextService.resolveUserFromBearer(auth);
        String comment = body != null && body.get("comment") != null
                ? String.valueOf(body.get("comment")) : null;
        return service.rejectReview(fieldId, operatorLabel(user), comment);
    }

    @PostMapping("/{fieldId}/unfreeze")
    @Operation(summary = "解冻（FROZEN→DRAFT；无发布模板引用且无活跃填写取值时可解冻）")
    public Result<?> unfreeze(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable Long fieldId) {
        Result<?> denied = requireMinRole(auth, REVIEW_MIN_ROLE);
        if (denied != null) {
            return denied;
        }
        User user = authContextService.resolveUserFromBearer(auth);
        return service.unfreeze(fieldId, operatorLabel(user));
    }

    @GetMapping("/{fieldId}/published-usage")
    @Operation(summary = "查询字段在已发布/冻结模板中的使用")
    public Result<List<Map<String, Object>>> publishedUsage(@PathVariable Long fieldId) {
        return Result.success(service.publishedTemplateUsage(fieldId));
    }

    @DeleteMapping("/{fieldId}")
    @Operation(summary = "删除字段（软删）。已发布模板中使用时需 force=true")
    public Result<?> delete(@PathVariable Long fieldId,
                            @RequestParam(value = "force", defaultValue = "false") boolean force) {
        return service.delete(fieldId, force);
    }
}
