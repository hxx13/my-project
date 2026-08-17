package com.example.demo.modules.aup.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.aup.dto.TemplateCreateRequest;
import com.example.demo.modules.aup.dto.TemplateDetailVO;
import com.example.demo.modules.aup.dto.TemplateSaveRequest;
import com.example.demo.modules.aup.dto.TemplateVersionBriefVO;
import com.example.demo.modules.aup.dto.TemplateVersionVO;
import com.example.demo.modules.aup.service.AupDefaultTemplateSeeder;
import com.example.demo.modules.aup.service.AupTemplateService;
import com.example.demo.modules.auth.entity.User;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** AUP 表单模板配置 + 发布版本 + 整树节点 CRUD（管理员）。 */
@RestController
@RequestMapping("/api/aup-template")
@Tag(name = "AUP 模板", description = "表单模板配置、发布版本、结构树")
public class AupTemplateController {

    private final AupTemplateService service;
    private final AupDefaultTemplateSeeder defaultTemplateSeeder;
    private final AuthContextService authContextService;

    public AupTemplateController(AupTemplateService service,
                                 AupDefaultTemplateSeeder defaultTemplateSeeder,
                                 AuthContextService authContextService) {
        this.service = service;
        this.defaultTemplateSeeder = defaultTemplateSeeder;
        this.authContextService = authContextService;
    }

    private String resolveUserId(String authHeader) {
        if (authHeader == null || authHeader.isBlank()) {
            return null;
        }
        User user = authContextService.resolveUserFromBearer(authHeader);
        return user != null ? user.getId() : null;
    }

    @GetMapping
    @Operation(summary = "版本列表")
    public Result<List<TemplateVersionVO>> list() {
        return Result.success(service.listTemplates());
    }

    @GetMapping("/published")
    @Operation(summary = "当前 PUBLISHED 版本结构（未发布时 data 为 null，HTTP 200）")
    public Result<TemplateDetailVO> published(@RequestParam(value = "formKey", required = false) String formKey) {
        // 未发布是正常状态，返回 success(null)，前端据此秒识别「未发布」，而非靠 error 判定
        return Result.success(service.getPublished(formKey));
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

    @GetMapping("/default-seed")
    @Operation(summary = "内置默认模板（供「导入内置模板」按钮填充当前草稿）")
    public Result<TemplateSaveRequest> defaultSeed() {
        TemplateSaveRequest seed = defaultTemplateSeeder.loadSeedRequest();
        if (seed == null) {
            return Result.error("内置默认模板不存在或无法解析");
        }
        return Result.success(seed);
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "删除版本（含整树结构；任意状态可删）")
    public Result<Void> remove(@PathVariable Long id) {
        return service.deleteDraft(id);
    }

    @PostMapping("/{id}/copy")
    @Operation(summary = "复制版本为新的 DRAFT")
    public Result<TemplateVersionBriefVO> copy(@PathVariable Long id,
                                               @RequestHeader(value = "Authorization", required = false) String auth) {
        return service.copy(id, resolveUserId(auth));
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
        return Result.success(service.createDraft(body, resolveUserId(auth)));
    }

    @PutMapping("/{id}")
    @Operation(summary = "整树快照式保存")
    public Result<TemplateDetailVO> save(@PathVariable Long id, @RequestBody TemplateSaveRequest body) {
        return service.saveTree(id, body);
    }

    @PutMapping("/{id}/meta")
    @Operation(summary = "更新名称/描述（不触碰结构树）")
    public Result<TemplateDetailVO> updateMeta(@PathVariable Long id, @RequestBody TemplateSaveRequest body) {
        return service.updateMeta(id, body.getName(), body.getDescription());
    }

    @PostMapping("/{id}/publish")
    @Operation(summary = "发布版本")
    public Result<TemplateVersionBriefVO> publish(@PathVariable Long id) {
        return service.publish(id);
    }

    @PostMapping("/{id}/archive")
    @Operation(summary = "归档已发布版本")
    public Result<Void> archive(@PathVariable Long id) {
        return service.archive(id);
    }
}
