package com.example.demo.modules.nhp.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.nhp.entity.CrfFieldDictionary;
import com.example.demo.modules.nhp.service.NhpFieldDictionaryService;
import com.example.demo.modules.nhp.service.NhpTemplateService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** NHP 字段字典套（猪/猴等目录壳）。 */
@RestController
@RequestMapping("/api/nhp/field-dictionaries")
@Tag(name = "NHP 字段字典套", description = "字典套列表/新建/更新/软删；字段归属某套，互不覆盖")
public class NhpFieldDictionaryController {

    private final NhpFieldDictionaryService service;
    private final NhpTemplateService templateService;

    public NhpFieldDictionaryController(NhpFieldDictionaryService service, NhpTemplateService templateService) {
        this.service = service;
        this.templateService = templateService;
    }

    @GetMapping
    @Operation(summary = "字典套列表")
    public Result<List<CrfFieldDictionary>> list() {
        return Result.success(service.list());
    }

    @GetMapping("/{dictKey}")
    @Operation(summary = "字典套详情")
    public Result<CrfFieldDictionary> get(@PathVariable String dictKey) {
        CrfFieldDictionary d = service.getByKey(dictKey);
        if (d == null) return Result.error("字段字典不存在");
        return Result.success(d);
    }

    @PostMapping
    @Operation(summary = "新建字典套")
    public Result<CrfFieldDictionary> create(@RequestBody Map<String, Object> body) {
        return service.create(body);
    }

    @PutMapping("/{dictKey}")
    @Operation(summary = "更新字典套元数据")
    public Result<CrfFieldDictionary> update(@PathVariable String dictKey, @RequestBody Map<String, Object> body) {
        return service.update(dictKey, body);
    }

    @DeleteMapping("/{dictKey}")
    @Operation(summary = "软删字典套（有字段/原子须 cascade；含 FROZEN 字段拒绝；不硬删猪种子行）")
    public Result<Map<String, Object>> delete(
            @PathVariable String dictKey,
            @RequestParam(defaultValue = "false") boolean cascade) {
        return service.delete(dictKey, cascade);
    }

    @GetMapping("/{dictKey}/structure")
    @Operation(summary = "字典套域/子模块结构（大纲 ∪ 字段推导）")
    public Result<Map<String, Object>> structure(@PathVariable String dictKey) {
        return service.getStructure(dictKey);
    }

    @PostMapping("/{dictKey}/structure/domains")
    @Operation(summary = "新建数据域（可先于字段）")
    public Result<Map<String, Object>> addDomain(@PathVariable String dictKey, @RequestBody Map<String, Object> body) {
        return service.addDomain(dictKey, body);
    }

    @PostMapping("/{dictKey}/structure/submodules")
    @Operation(summary = "在数据域下新建子模块")
    public Result<Map<String, Object>> addSubmodule(@PathVariable String dictKey, @RequestBody Map<String, Object> body) {
        return service.addSubmodule(dictKey, body);
    }

    @PatchMapping("/{dictKey}/structure/domains/{domainCode}")
    @Operation(summary = "更新套内数据域显示名（写入 structure_json；默认同步到该套原子/组合章节 label）")
    public Result<Map<String, Object>> renameDomain(
            @PathVariable String dictKey,
            @PathVariable String domainCode,
            @RequestBody Map<String, Object> body,
            @RequestParam(defaultValue = "true") boolean syncAtoms) {
        return withOptionalAtomSync(service.renameDomain(dictKey, domainCode, body), dictKey, syncAtoms);
    }

    @PutMapping("/{dictKey}/structure/domains/{domainCode}")
    @Operation(summary = "更新套内数据域显示名（PUT，同 PATCH）")
    public Result<Map<String, Object>> renameDomainPut(
            @PathVariable String dictKey,
            @PathVariable String domainCode,
            @RequestBody Map<String, Object> body,
            @RequestParam(defaultValue = "true") boolean syncAtoms) {
        return withOptionalAtomSync(service.renameDomain(dictKey, domainCode, body), dictKey, syncAtoms);
    }

    @PatchMapping("/{dictKey}/structure/submodules/{submoduleCode:.+}")
    @Operation(summary = "更新子模块显示名（写入 structure_json；默认同步到该套原子/组合章节 label）")
    public Result<Map<String, Object>> renameSubmodule(
            @PathVariable String dictKey,
            @PathVariable String submoduleCode,
            @RequestBody Map<String, Object> body,
            @RequestParam(defaultValue = "true") boolean syncAtoms) {
        return withOptionalAtomSync(service.renameSubmodule(dictKey, submoduleCode, body), dictKey, syncAtoms);
    }

    @PutMapping("/{dictKey}/structure/submodules/{submoduleCode:.+}")
    @Operation(summary = "更新子模块显示名（PUT，同 PATCH）")
    public Result<Map<String, Object>> renameSubmodulePut(
            @PathVariable String dictKey,
            @PathVariable String submoduleCode,
            @RequestBody Map<String, Object> body,
            @RequestParam(defaultValue = "true") boolean syncAtoms) {
        return withOptionalAtomSync(service.renameSubmodule(dictKey, submoduleCode, body), dictKey, syncAtoms);
    }

    @PostMapping("/{dictKey}/structure/sync-atom-labels")
    @Operation(summary = "将大纲中文名同步到本套原子/组合模板章节 label（不改字段）")
    public Result<Map<String, Object>> syncAtomLabels(@PathVariable String dictKey) {
        return templateService.syncOutlineNamesFromStructure(dictKey);
    }

    @DeleteMapping("/{dictKey}/structure/domains/{domainCode}")
    @Operation(summary = "删除套内数据域（空域直接删；有字段须 cascade，含 FROZEN 则拒绝）")
    public Result<Map<String, Object>> deleteDomain(
            @PathVariable String dictKey,
            @PathVariable String domainCode,
            @RequestParam(defaultValue = "false") boolean cascade) {
        return service.deleteDomain(dictKey, domainCode, cascade);
    }

    @DeleteMapping("/{dictKey}/structure/submodules/{submoduleCode:.+}")
    @Operation(summary = "删除子模块（空壳直接删；有字段须 cascade，含 FROZEN 则拒绝）")
    public Result<Map<String, Object>> deleteSubmodule(
            @PathVariable String dictKey,
            @PathVariable String submoduleCode,
            @RequestParam(defaultValue = "false") boolean cascade) {
        return service.deleteSubmodule(dictKey, submoduleCode, cascade);
    }

    @PostMapping("/{dictKey}/structure/clone-from/{sourceDictKey}")
    @Operation(summary = "从另一数据域套克隆域/子模块大纲（不复制字段；须显式调用，不会自动带猪 D1–D10）")
    public Result<Map<String, Object>> cloneStructure(
            @PathVariable String dictKey,
            @PathVariable String sourceDictKey) {
        return service.cloneStructureFrom(dictKey, sourceDictKey);
    }

    private Result<Map<String, Object>> withOptionalAtomSync(
            Result<Map<String, Object>> renameResult, String dictKey, boolean syncAtoms) {
        if (!Boolean.TRUE.equals(renameResult.getSuccess()) || !syncAtoms) {
            return renameResult;
        }
        Result<Map<String, Object>> sync = templateService.syncOutlineNamesFromStructure(dictKey);
        Map<String, Object> data = renameResult.getData() != null
                ? new LinkedHashMap<>(renameResult.getData())
                : new LinkedHashMap<>();
        if (Boolean.TRUE.equals(sync.getSuccess()) && sync.getData() != null) {
            data.put("sectionsUpdated", sync.getData().get("sectionsUpdated"));
            data.put("formsTouched", sync.getData().get("formsTouched"));
        }
        return Result.success(data);
    }
}
