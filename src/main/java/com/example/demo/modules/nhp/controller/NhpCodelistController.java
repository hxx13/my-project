package com.example.demo.modules.nhp.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.nhp.entity.CrfCodelistItem;
import com.example.demo.modules.nhp.entity.CrfCodelistLink;
import com.example.demo.modules.nhp.service.NhpCodelistService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/** NHP 码表管理（整表版本 + 校对/冻结发布）。 */
@RestController
@RequestMapping("/api/nhp/codelists")
@Tag(name = "NHP 码表", description = "码表版本 + 校对（提交/通过/驳回）+ 引用链")
public class NhpCodelistController {

    /** 校对通过/驳回：与字段页一致，ADMIN+（PI 角色绑定落地前由管理员代行）。 */
    private static final RoleEnum REVIEW_MIN_ROLE = RoleEnum.ADMIN;

    private final NhpCodelistService service;
    private final AuthContextService authContextService;

    public NhpCodelistController(NhpCodelistService service, AuthContextService authContextService) {
        this.service = service;
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
                    + " 及以上（码表校对由管理员代行，待 PI 身份标签落地）");
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

    @GetMapping
    @Operation(summary = "码表列表头（每 code 最新版，含 refCount / versionCount）")
    public Result<List<Map<String, Object>>> list() {
        return Result.success(service.list());
    }

    @PostMapping
    @Operation(summary = "新建码表（首版 v1 草稿）")
    public Result<Map<String, Object>> create(@RequestBody Map<String, Object> body) {
        String code = body != null && body.get("code") != null ? String.valueOf(body.get("code")) : null;
        String name = body != null && body.get("name") != null ? String.valueOf(body.get("name")) : null;
        String folder = body != null && body.get("folder") != null ? String.valueOf(body.get("folder")) : null;
        return service.createCodelist(code, name, folder);
    }

    @PutMapping("/{code}")
    @Operation(summary = "更新码表元数据（name / folder，同步全部活跃版本）")
    public Result<Map<String, Object>> updateMeta(@PathVariable String code, @RequestBody Map<String, Object> body) {
        String name = body != null && body.get("name") != null ? String.valueOf(body.get("name")) : null;
        String folder = null;
        if (body != null && body.containsKey("folder")) {
            folder = body.get("folder") == null ? "" : String.valueOf(body.get("folder"));
        }
        return service.updateCodelistMeta(code, name, folder);
    }

    @GetMapping("/published-options")
    @Operation(summary = "字段挂接选项：每 code 仅最新已发布（FROZEN）版本 id")
    public Result<List<Map<String, Object>>> publishedOptions() {
        return Result.success(service.listPublishedOptions());
    }

    @GetMapping("/id/{id}")
    @Operation(summary = "按主键取码表详情（字段绑定的具体版本）")
    public Result<Map<String, Object>> detailById(@PathVariable Long id) {
        return service.detailById(id);
    }

    @GetMapping("/id/{id}/usage")
    @Operation(summary = "单版本引用链：字段→字典套→原子→组合")
    public Result<Map<String, Object>> usageById(@PathVariable Long id) {
        return service.usageGraphById(id);
    }

    @GetMapping("/{code}/versions")
    @Operation(summary = "某 code 的历史版本列表")
    public Result<List<Map<String, Object>>> versions(@PathVariable String code) {
        return Result.success(service.listVersions(code));
    }

    @GetMapping("/{code}/usage")
    @Operation(summary = "完整引用链（按版本）：字段→字典套→原子模板→组合模板")
    public Result<Map<String, Object>> usage(@PathVariable String code) {
        return Result.success(service.usageGraph(code));
    }

    @GetMapping("/{code}")
    @Operation(summary = "码表详情（含项）；?version= 指定版本，缺省为可编辑或最新")
    public Result<Map<String, Object>> detail(@PathVariable String code,
                                              @RequestParam(required = false) Integer version) {
        return service.detail(code, version);
    }

    @PostMapping("/{code}/submit-review")
    @Operation(summary = "提交校对（DRAFT→PENDING_REVIEW）")
    public Result<?> submitReview(@PathVariable String code) {
        return service.submitReview(code);
    }

    @PostMapping("/{code}/approve")
    @Operation(summary = "校对通过并冻结发布（PENDING_REVIEW→FROZEN；占用版本保留）")
    public Result<?> approve(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable String code,
            @RequestBody(required = false) Map<String, Object> body) {
        Result<?> denied = requireMinRole(auth, REVIEW_MIN_ROLE);
        if (denied != null) {
            return denied;
        }
        User user = authContextService.resolveUserFromBearer(auth);
        String comment = body != null && body.get("comment") != null
                ? String.valueOf(body.get("comment")) : null;
        return service.approveReview(code, operatorLabel(user), comment);
    }

    @PostMapping("/{code}/reject")
    @Operation(summary = "校对驳回（PENDING_REVIEW→DRAFT）")
    public Result<?> reject(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable String code,
            @RequestBody(required = false) Map<String, Object> body) {
        Result<?> denied = requireMinRole(auth, REVIEW_MIN_ROLE);
        if (denied != null) {
            return denied;
        }
        User user = authContextService.resolveUserFromBearer(auth);
        String comment = body != null && body.get("comment") != null
                ? String.valueOf(body.get("comment")) : null;
        return service.rejectReview(code, operatorLabel(user), comment);
    }

    @PostMapping("/{code}/unfreeze")
    @Operation(summary = "解冻（FROZEN→DRAFT；无活跃字段引用本版时可解冻）")
    public Result<?> unfreeze(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable String code) {
        Result<?> denied = requireMinRole(auth, REVIEW_MIN_ROLE);
        if (denied != null) {
            return denied;
        }
        User user = authContextService.resolveUserFromBearer(auth);
        return service.unfreeze(code, operatorLabel(user));
    }

    @PostMapping("/{code}/restore-archived")
    @Operation(summary = "恢复已归档版本为已发布（ARCHIVED→FROZEN，不进入草稿编辑态）")
    public Result<?> restoreArchived(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable String code) {
        Result<?> denied = requireMinRole(auth, REVIEW_MIN_ROLE);
        if (denied != null) {
            return denied;
        }
        User user = authContextService.resolveUserFromBearer(auth);
        return service.restoreArchived(code, operatorLabel(user));
    }

    @GetMapping("/{code}/review-items")
    @Operation(summary = "码表项审核列表（含 verdict）")
    public Result<List<Map<String, Object>>> reviewItems(@PathVariable String code) {
        return service.listReviewItems(code);
    }

    @PostMapping("/{code}/items/{itemId}/verdict")
    @Operation(summary = "提交码表项 verdict")
    public Result<?> itemVerdict(
            @PathVariable String code,
            @PathVariable Long itemId,
            @RequestBody Map<String, Object> body) {
        String verdict = body != null && body.get("verdict") != null
                ? String.valueOf(body.get("verdict")) : null;
        String note = body != null && body.get("verdictNote") != null
                ? String.valueOf(body.get("verdictNote")) : null;
        return service.submitItemVerdict(code, itemId, verdict, note);
    }

    @PostMapping("/{code}/freeze")
    @Operation(summary = "冻结（契约 alias：approve/publish）")
    public Result<?> freeze(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable String code) {
        Result<?> denied = requireMinRole(auth, REVIEW_MIN_ROLE);
        if (denied != null) {
            return denied;
        }
        User user = authContextService.resolveUserFromBearer(auth);
        return service.freeze(code, operatorLabel(user));
    }

    @PostMapping("/actions/unfreeze-unused")
    @Operation(summary = "批量解冻无字段引用的已冻结码表（软删字段不计占用）")
    public Result<?> unfreezeUnused(
            @RequestHeader(value = "Authorization", required = false) String auth) {
        Result<?> denied = requireMinRole(auth, REVIEW_MIN_ROLE);
        if (denied != null) {
            return denied;
        }
        User user = authContextService.resolveUserFromBearer(auth);
        return service.unfreezeUnused(operatorLabel(user));
    }

    @PostMapping("/{code}/publish")
    @Operation(summary = "兼容：草稿直接冻结（内部走校对通过；新 UI 请用 approve）")
    public Result<?> publish(@PathVariable String code) {
        return service.publish(code);
    }

    @PostMapping("/{code}/draft")
    @Operation(summary = "基于最新冻结版克隆新草稿（版号按活跃最小空缺补位）")
    public Result<Map<String, Object>> createDraft(@PathVariable String code) {
        return service.createDraftVersion(code);
    }

    @DeleteMapping("/id/{id}")
    @Operation(summary = "软删单个码表版本（有字段引用时 409；版号可补位）")
    public Result<?> deleteVersion(@PathVariable Long id) {
        return service.deleteVersion(id);
    }

    @DeleteMapping("/{code}")
    @Operation(summary = "清理某 code 下全部活跃版本（被字段引用的跳过并说明）")
    public Result<?> delete(@PathVariable String code) {
        return service.deleteCodelist(code);
    }

    @PostMapping("/{code}/items")
    @Operation(summary = "新增码表项（仅草稿）")
    public Result<CrfCodelistItem> addItem(@PathVariable String code, @RequestBody CrfCodelistItem item) {
        return service.addItem(code, item);
    }

    @PutMapping("/{code}/items/{itemId}")
    @Operation(summary = "更新码表项（仅草稿）")
    public Result<?> updateItem(@PathVariable String code, @PathVariable Long itemId,
                                @RequestBody CrfCodelistItem patch) {
        return service.updateItem(code, itemId, patch);
    }

    @DeleteMapping("/{code}/items/{itemId}")
    @Operation(summary = "删除码表项（仅草稿）")
    public Result<?> deleteItem(@PathVariable String code, @PathVariable Long itemId) {
        return service.deleteItem(code, itemId);
    }

    @PostMapping("/{code}/items/{itemId}/links")
    @Operation(summary = "建字典联动（项→子字典，仅草稿）")
    public Result<CrfCodelistLink> addLink(@PathVariable String code, @PathVariable Long itemId,
                                           @RequestBody Map<String, Object> body) {
        return service.addLink(code, itemId, body == null ? null : (String) body.get("childCodelistCode"));
    }

    @DeleteMapping("/{code}/items/{itemId}/links/{linkId}")
    @Operation(summary = "删除字典联动（仅草稿）")
    public Result<?> removeLink(@PathVariable String code, @PathVariable Long itemId,
                                @PathVariable Long linkId) {
        return service.removeLink(code, itemId, linkId);
    }
}
