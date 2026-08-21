package com.example.demo.modules.nhp.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.nhp.service.NhpTemplateService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * NHP 模板：原子模板（DOMAIN/MODULE）与组合模板（TEMPLATE）。
 * 原子可独立发布为可填表单；组合可选——钉住多原子快照后发布。填写实例挂已发布原子或组合。
 */
@RestController
@RequestMapping("/api/nhp/templates")
@Tag(name = "NHP 表单模板", description = "原子/组合模板列表、组合、版本、发布")
public class NhpTemplateController {

    private final NhpTemplateService service;

    public NhpTemplateController(NhpTemplateService service) {
        this.service = service;
    }

    @GetMapping
    @Operation(summary = "模板列表（kind=COMPOSITE|ATOM|ALL；dictKey 过滤套；组合按是否钉住该套任一原子）")
    public Result<List<Map<String, Object>>> list(
            @RequestParam(value = "kind", required = false, defaultValue = "COMPOSITE") String kind,
            @RequestParam(value = "dictKey", required = false) String dictKey) {
        return Result.success(service.list(kind, dictKey));
    }

    @GetMapping("/by-id/{formId}")
    @Operation(summary = "按 formId 取模板结构（填写实例续填用，钉住历史版本）")
    public Result<Object> getById(@PathVariable Long formId) {
        return service.getById(formId);
    }

    @GetMapping("/{formKey}/versions")
    @Operation(summary = "某 formKey 的历史版本列表（原子含 referencedBy）")
    public Result<List<Map<String, Object>>> versions(@PathVariable String formKey) {
        return Result.success(service.listVersions(formKey));
    }

    @GetMapping("/{formKey}")
    @Operation(summary = "模板详情（优先草稿，否则最新）")
    public Result<Object> get(@PathVariable String formKey) {
        return service.get(formKey);
    }

    @PostMapping("/atom")
    @Operation(summary = "新建原子模板（数据域模块；可随后发布为独立表单，或纳入组合）")
    public Result<Object> createAtom(@RequestBody Map<String, Object> body) {
        return service.createAtom(body);
    }

    @PostMapping("/actions/cleanup-seed-composites")
    @Operation(summary = "强制软删无填写实例的 SEED/AUTO_COMPOSE 组合版本，解除对原子的钉住")
    public Result<?> cleanupSeedComposites() {
        return service.cleanupUnusedSeedComposites();
    }

    @PostMapping("/actions/ensure-missing-atoms")
    @Operation(summary = "检测套内有 FROZEN 字段却无活跃原子的域；generate=true 时从字典补生成（可复活软删原子）")
    public Result<Map<String, Object>> ensureMissingAtoms(
            @RequestParam(value = "dictKey", required = false, defaultValue = "pig") String dictKey,
            @RequestParam(value = "generate", required = false, defaultValue = "true") boolean generate) {
        return service.ensureMissingAtomsFromDict(dictKey, generate);
    }

    @PostMapping("/{formKey}")
    @Operation(summary = "保存草稿（整表 FormTemplate JSON；组合已发布须先新建草稿；原子被引用则锁）")
    public Result<Object> save(@PathVariable String formKey, @RequestBody Map<String, Object> template) {
        return service.save(formKey, template);
    }

    @PostMapping("/compose")
    @Operation(summary = "组合：按数据域钉住原子版本并快照；已发布组合自动升草稿")
    public Result<Object> compose(@RequestBody Map<String, Object> body) {
        return service.compose(body);
    }

    @PostMapping("/generate")
    @Operation(summary = "从指定数据域套生成原子（formKey=域码如 D1/DD1，写入 pig 或 monkey__DD1）；或组合该套全部原子。dictKey 指定套（默认猪）")
    public Result<Object> generate(@RequestBody Map<String, Object> body) {
        return service.generate(str(body.get("formKey")), str(body.get("title")), str(body.get("dictKey")));
    }

    @PostMapping("/{formKey}/publish")
    @Operation(summary = "发布/冻结模板（原子=独立可填表单；组合=多原子快照）")
    public Result<?> publish(@PathVariable String formKey) {
        return service.publish(formKey);
    }

    @PostMapping("/{formKey}/unfreeze")
    @Operation(summary = "解冻（FROZEN→DRAFT；无活跃填写实例且原子无组合钉住时可解冻）")
    public Result<?> unfreeze(@PathVariable String formKey) {
        return service.unfreeze(formKey, null);
    }

    @PostMapping("/{formKey}/draft")
    @Operation(summary = "新建版本（原子：克隆最新；组合：基于已发布/最新；版号按活跃最小空缺补位）")
    public Result<Object> createDraft(@PathVariable String formKey) {
        return service.createDraftVersion(formKey);
    }

    @DeleteMapping("/by-id/{formId}")
    @Operation(summary = "软删单个模板版本；填写实例引用或原子被组合钉住时返回 409（含钉住方 formKey/version）")
    public Result<?> deleteVersion(@PathVariable Long formId) {
        return service.deleteVersion(formId);
    }

    @DeleteMapping("/{formKey}")
    @Operation(summary = "软删该 formKey 下全部活跃版本（清理乱版本）；被引用版本跳过并汇总")
    public Result<?> deleteAllVersions(@PathVariable String formKey) {
        return service.deleteAllVersions(formKey);
    }

    private String str(Object v) {
        return v == null ? null : String.valueOf(v);
    }
}
