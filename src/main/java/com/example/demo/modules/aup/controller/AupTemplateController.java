package com.example.demo.modules.aup.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.aup.dto.AtomCreateRequest;
import com.example.demo.modules.aup.dto.ComposeRequest;
import com.example.demo.modules.aup.dto.ImportAtomsRequest;
import com.example.demo.modules.aup.dto.TemplateCreateRequest;
import com.example.demo.modules.aup.dto.TemplateDetailVO;
import com.example.demo.modules.aup.dto.TemplateReviewRequest;
import com.example.demo.modules.aup.dto.TemplateSaveRequest;
import com.example.demo.modules.aup.dto.TemplateUsageVO;
import com.example.demo.modules.aup.dto.TemplateVersionBriefVO;
import com.example.demo.modules.aup.dto.TemplateVersionVO;
import com.example.demo.modules.aup.service.AupTemplateService;
import com.example.demo.modules.auth.entity.User;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** AUP 表单模板配置 + 发布版本 + 整树节点 CRUD + 原子域/组合域（管理员）。 */
@RestController
@RequestMapping("/api/aup-template")
@Tag(name = "AUP 模板", description = "表单模板配置、发布版本、结构树、原子域/组合域")
public class AupTemplateController {

    private final AupTemplateService service;
    private final AuthContextService authContextService;

    public AupTemplateController(AupTemplateService service,
                                 AuthContextService authContextService) {
        this.service = service;
        this.authContextService = authContextService;
    }

    private User resolveUser(String authHeader) {
        if (authHeader == null || authHeader.isBlank()) {
            return null;
        }
        return authContextService.resolveUserFromBearer(authHeader);
    }

    @GetMapping
    @Operation(summary = "版本列表（默认全部 kind：PROTOCOL + ATOM + COMPOSITE 混排）")
    public Result<List<TemplateVersionVO>> list(@RequestParam(value = "kind", required = false) String kind) {
        return Result.success(service.listTemplates(kind));
    }

    @GetMapping("/published")
    @Operation(summary = "当前 PUBLISHED 版本结构（未发布时 data 为 null，HTTP 200）")
    public Result<TemplateDetailVO> published(@RequestParam(value = "formKey", required = false) String formKey,
                                              @RequestParam(value = "kind", required = false) String kind) {
        // 未发布是正常状态，返回 success(null)，前端据此秒识别「未发布」，而非靠 error 判定
        return Result.success(service.getPublished(formKey, kind == null || kind.isBlank() ? "PROTOCOL" : kind));
    }

    @GetMapping("/resolve")
    @Operation(summary = "按 formKey + version 反查结构")
    public Result<TemplateDetailVO> resolve(@RequestParam(value = "formKey", required = false) String formKey,
                                            @RequestParam(value = "version", required = false) Integer version) {
        TemplateDetailVO vo = service.resolve(formKey, version);
        return vo != null ? Result.success(vo) : Result.error("模板版本不存在");
    }

    @GetMapping("/{id}")
    @Operation(summary = "模板结构详情")
    public Result<TemplateDetailVO> detail(@PathVariable Long id) {
        TemplateDetailVO vo = service.getDetail(id);
        return vo != null ? Result.success(vo) : Result.error("模板不存在");
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "删除版本（含整树结构；任意状态可删）")
    public Result<Void> remove(@RequestHeader(value = "Authorization", required = false) String auth,
                               @PathVariable Long id) {
        return service.deleteDraft(id, resolveUser(auth));
    }

    @PostMapping("/{id}/copy")
    @Operation(summary = "复制版本为新的 DRAFT")
    public Result<TemplateVersionBriefVO> copy(@RequestHeader(value = "Authorization", required = false) String auth,
                                               @PathVariable Long id) {
        return service.copy(id, resolveUser(auth));
    }

    @GetMapping("/{id}/versions")
    @Operation(summary = "版本历史")
    public Result<List<TemplateVersionBriefVO>> versions(@PathVariable Long id) {
        return Result.success(service.listVersions(id));
    }

    @PostMapping
    @Operation(summary = "新建 DRAFT 版本（从上一 PUBLISHED 深拷贝）")
    public Result<TemplateVersionBriefVO> create(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @RequestBody TemplateCreateRequest body) {
        return Result.success(service.createDraft(body, resolveUser(auth)));
    }

    @PutMapping("/{id}")
    @Operation(summary = "整树快照式保存")
    public Result<TemplateDetailVO> save(@RequestHeader(value = "Authorization", required = false) String auth,
                                         @PathVariable Long id, @RequestBody TemplateSaveRequest body) {
        return service.saveTree(id, body, resolveUser(auth));
    }

    @PutMapping("/{id}/meta")
    @Operation(summary = "更新名称/描述（不触碰结构树）")
    public Result<TemplateDetailVO> updateMeta(@RequestHeader(value = "Authorization", required = false) String auth,
                                               @PathVariable Long id, @RequestBody TemplateSaveRequest body) {
        return service.updateMeta(id, body.getName(), body.getDescription(), resolveUser(auth));
    }

    @PostMapping("/{id}/publish")
    @Operation(summary = "发布版本")
    public Result<TemplateVersionBriefVO> publish(@RequestHeader(value = "Authorization", required = false) String auth,
                                                  @PathVariable Long id) {
        return service.publish(id, resolveUser(auth));
    }

    @PostMapping("/{id}/archive")
    @Operation(summary = "归档已发布版本")
    public Result<Void> archive(@RequestHeader(value = "Authorization", required = false) String auth,
                                @PathVariable Long id) {
        return service.archive(id, resolveUser(auth));
    }

    /* ── 原子域 / 组合域 / 状态机 ── */

    @PostMapping("/atom")
    @Operation(summary = "新建原子域")
    public Result<TemplateVersionBriefVO> atom(@RequestHeader(value = "Authorization", required = false) String auth,
                                               @RequestBody AtomCreateRequest body) {
        return service.createAtom(body, resolveUser(auth));
    }

    @PostMapping("/compose")
    @Operation(summary = "新建组合域并钉住原子域版本")
    public Result<TemplateVersionBriefVO> compose(@RequestHeader(value = "Authorization", required = false) String auth,
                                                  @RequestBody ComposeRequest body) {
        return service.compose(body, resolveUser(auth));
    }

    @PostMapping("/{id}/import-atoms")
    @Operation(summary = "把若干原子域字段整段插入当前草稿")
    public Result<TemplateDetailVO> importAtoms(@RequestHeader(value = "Authorization", required = false) String auth,
                                                @PathVariable Long id, @RequestBody ImportAtomsRequest body) {
        return service.importAtoms(id, body, resolveUser(auth));
    }

    @PostMapping("/{id}/submit-review")
    @Operation(summary = "提交审核")
    public Result<Void> submitReview(@RequestHeader(value = "Authorization", required = false) String auth,
                                     @PathVariable Long id) {
        return service.submitReview(id, resolveUser(auth));
    }

    @PostMapping("/{id}/reject")
    @Operation(summary = "驳回（意见必填）")
    public Result<Void> reject(@RequestHeader(value = "Authorization", required = false) String auth,
                               @PathVariable Long id, @RequestBody(required = false) TemplateReviewRequest body) {
        return service.reject(id, body != null ? body.getComment() : null, resolveUser(auth));
    }

    @PostMapping("/{id}/unfreeze")
    @Operation(summary = "解冻")
    public Result<Void> unfreeze(@RequestHeader(value = "Authorization", required = false) String auth,
                                 @PathVariable Long id) {
        return service.unfreeze(id, resolveUser(auth));
    }

    @GetMapping("/{id}/usage")
    @Operation(summary = "原子域被哪些组合域钉住")
    public Result<TemplateUsageVO> usage(@PathVariable Long id) {
        return Result.success(service.usage(id));
    }
}
