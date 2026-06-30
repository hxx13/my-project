package com.example.demo.modules.reportform.controller;

import com.example.demo.common.config.AdminAuthInterceptor;
import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.reportform.entity.ReportFormDefinition;
import com.example.demo.modules.auth.AuthProfileConstants;
import com.example.demo.modules.reportform.entity.ReportFormOptionSet;
import com.example.demo.modules.reportform.service.ReportFormImportService;
import com.example.demo.modules.reportform.service.ReportFormService;
import com.example.demo.modules.reportform.service.ReportFormExportService;
import com.example.demo.modules.reportform.service.ReportFormWordService;
import com.example.demo.modules.reportform.service.ReportFillService;
import com.example.demo.modules.reportform.mapper.ReportFormDefinitionMapper;
import com.example.demo.modules.reportform.util.ReportFormExportFilename;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;
import java.util.Objects;

@RestController
@RequestMapping("/api/admin/report-form")
@CrossOrigin("*")
@Tag(name = "报表表单管理")
public class ReportFormController {

    private static final Logger log = LoggerFactory.getLogger(ReportFormController.class);
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    private final ReportFormService reportFormService;
    private final ReportFormImportService importService;
    private final ReportFormExportService exportService;
    private final ReportFormDefinitionMapper definitionMapper;
    private final ReportFormWordService wordService;
    private final ReportFillService reportFillService;

    public ReportFormController(ReportFormService reportFormService,
                                ReportFormImportService importService,
                                ReportFormExportService exportService,
                                ReportFormDefinitionMapper definitionMapper,
                                ReportFormWordService wordService,
                                ReportFillService reportFillService) {
        this.reportFormService = reportFormService;
        this.importService = importService;
        this.exportService = exportService;
        this.definitionMapper = definitionMapper;
        this.wordService = wordService;
        this.reportFillService = reportFillService;
    }

    @GetMapping("/forms/page")
    @Operation(summary = "分页查询表单定义列表")
    public Result<List<ReportFormDefinition>> page(HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.STAFF);
        if (denied != null) return Result.error(denied.getMessage());
        String username = getCurrentUsername(request);
        String role = getCurrentUserRole(request);
        return Result.success(reportFormService.page(role, username));
    }

    @GetMapping("/forms/{id}")
    @Operation(summary = "按ID查询表单定义")
    public Result<ReportFormDefinition> getById(@PathVariable Long id,
                                                HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.STAFF);
        if (denied != null) return Result.error(denied.getMessage());
        return Result.success(reportFormService.getById(id));
    }

    @GetMapping("/forms/{id}/export-excel")
    @Operation(summary = "导出报表模板为 Excel（不含填报数据）")
    public ResponseEntity<byte[]> exportExcelTemplate(@PathVariable Long id, HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.STAFF);
        if (denied != null) {
            throw new IllegalArgumentException(denied.getMessage());
        }
        try {
            ReportFormDefinition form = definitionMapper.selectById(id);
            if (form == null) throw new IllegalArgumentException("表单不存在");
            byte[] data = exportService.exportTemplate(id);
            String filename = ReportFormExportFilename.build(form, null, false, "xlsx");
            return ResponseEntity.ok()
                    .headers(ReportFormExportFilename.attachmentHeaders(filename))
                    .header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
                    .body(data);
        } catch (Exception e) {
            log.error("[report-form] 模板 Excel 导出失败: form={}", id, e);
            throw new IllegalArgumentException("Excel 导出失败: " + e.getMessage());
        }
    }

    @GetMapping("/forms/{id}/export-word-filled/{wtId}")
    @Operation(summary = "导出 Word（注入设计器 layout 静态内容，无需发布/填报）")
    public ResponseEntity<byte[]> exportWordFilledTemplate(@PathVariable Long id,
                                                           @PathVariable String wtId,
                                                           HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.STAFF);
        if (denied != null) {
            throw new IllegalArgumentException(denied.getMessage());
        }
        try {
            ReportFormDefinition form = definitionMapper.selectById(id);
            if (form == null) throw new IllegalArgumentException("表单不存在");
            byte[] data = wordService.exportWordLayoutPreview(id, wtId);
            String wtName = resolveWordTemplateName(form, wtId);
            String filename = ReportFormExportFilename.buildWordTemplate(form, wtName, "docx");
            return ResponseEntity.ok()
                    .headers(ReportFormExportFilename.attachmentHeaders(filename))
                    .header("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
                    .body(data);
        } catch (Exception e) {
            log.error("[report-form] Word 布局导出失败: form={} wtId={}", id, wtId, e);
            throw new IllegalArgumentException("Word 导出失败: " + e.getMessage());
        }
    }

    @PostMapping("/forms/create-blank")
    @Operation(summary = "创建空白报表表单")
    public Result<?> createBlank(HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.STAFF);
        if (denied != null) return denied;
        try {
            String username = getCurrentUsername(request);
            var form = reportFormService.createBlank(username);
            return Result.success(form);
        } catch (Exception e) {
            log.error("创建空白报表失败", e);
            return Result.error(e.getMessage());
        }
    }

    @PostMapping("/forms/from-excel")
    @Operation(summary = "从 Excel 导入创建报表表单")
    public Result<?> createFromExcel(@RequestParam("file") MultipartFile file,
                                     HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.STAFF);
        if (denied != null) return denied;
        try {
            String name = Objects.requireNonNullElse(file.getOriginalFilename(), "未命名报表")
                    .replaceAll("\\.(xlsx|xls)$", "");
            var result = importService.importFromExcel(file, name);
            String username = getCurrentUsername(request);
            var form = reportFormService.createFromImport(result, username);
            log.info("[report-form] 表单已创建: id={} name={} cells={}", form.getId(), form.getName(), result.getCellCount());
            return Result.success(form);
        } catch (Exception e) {
            log.error("Excel 导入失败", e);
            return Result.error("Excel 导入失败: " + e.getMessage());
        }
    }

    @PutMapping("/forms/{id}")
    @Operation(summary = "更新报表表单定义（保存草稿）")
    public Result<?> update(@PathVariable Long id,
                            @RequestBody Map<String, Object> body,
                            HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.STAFF);
        if (denied != null) return denied;
        try {
            String username = getCurrentUsername(request);
            reportFormService.update(id, body, username);
            return Result.success(null);
        } catch (Exception e) {
            log.error("更新报表失败 form={}: {}", id, e.getMessage());
            return Result.error(e.getMessage());
        }
    }

    // ──────────────── 发布/撤回 ────────────────

    @PostMapping("/forms/{id}/publish")
    @Operation(summary = "发布报表表单")
    public Result<?> publish(@PathVariable Long id, HttpServletRequest request) {
        Result<?> denied = requireFormManager(request, id);
        if (denied != null) return denied;
        try {
            String username = getCurrentUsername(request);
            var form = reportFormService.publish(id, username);
            return Result.success(form);
        } catch (Exception e) {
            log.error("发布失败 form={}: {}", id, e.getMessage());
            return Result.error(e.getMessage());
        }
    }

    @PostMapping("/forms/{id}/unpublish")
    @Operation(summary = "撤回已发布报表")
    public Result<?> unpublish(@PathVariable Long id, HttpServletRequest request) {
        Result<?> denied = requireFormManager(request, id);
        if (denied != null) return denied;
        try {
            String username = getCurrentUsername(request);
            reportFormService.unpublish(id, username);
            return Result.success(null);
        } catch (Exception e) {
            log.error("撤回失败 form={}: {}", id, e.getMessage());
            return Result.error(e.getMessage());
        }
    }

    // ──────────────── 归档 / 取消归档 ────────────────

    @PostMapping("/forms/{id}/archive")
    @Operation(summary = "归档报表表单")
    public Result<?> archive(@PathVariable Long id, HttpServletRequest request) {
        Result<?> denied = requireFormManager(request, id);
        if (denied != null) return denied;
        try {
            reportFormService.archive(id, getCurrentUsername(request));
            return Result.success(null);
        } catch (Exception e) {
            log.error("归档失败 form={}: {}", id, e.getMessage());
            return Result.error(e.getMessage());
        }
    }

    @PostMapping("/forms/{id}/unarchive")
    @Operation(summary = "取消归档报表表单")
    public Result<?> unarchive(@PathVariable Long id, HttpServletRequest request) {
        Result<?> denied = requireFormManager(request, id);
        if (denied != null) return denied;
        try {
            reportFormService.unarchive(id, getCurrentUsername(request));
            return Result.success(null);
        } catch (Exception e) {
            log.error("取消归档失败 form={}: {}", id, e.getMessage());
            return Result.error(e.getMessage());
        }
    }

    // ──────────────── 删除 / 重命名 / 复制 ────────────────

    @DeleteMapping("/forms/{id}")
    @Operation(summary = "删除报表表单")
    public Result<?> deleteForm(@PathVariable Long id, HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.ADMIN);
        if (denied != null) return denied;
        try {
            reportFormService.deleteForm(id);
            return Result.success(null);
        } catch (Exception e) {
            log.error("删除失败 form={}: {}", id, e.getMessage());
            return Result.error(e.getMessage());
        }
    }

    @PostMapping("/forms/batch-delete")
    @Operation(summary = "批量删除报表表单")
    public Result<?> batchDelete(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.ADMIN);
        if (denied != null) return denied;
        try {
            @SuppressWarnings("unchecked")
            List<Integer> ids = (List<Integer>) body.get("ids");
            if (ids == null || ids.isEmpty()) return Result.error("ids 不能为空");
            for (Integer i : ids) reportFormService.deleteForm(i.longValue());
            return Result.success(null);
        } catch (Exception e) {
            log.error("批量删除失败: {}", e.getMessage());
            return Result.error(e.getMessage());
        }
    }

    @PutMapping("/forms/{id}/rename")
    @Operation(summary = "重命名报表表单")
    public Result<?> renameForm(@PathVariable Long id, @RequestBody Map<String, Object> body,
                                 HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.ADMIN);
        if (denied != null) return denied;
        try {
            String name = (String) body.get("name");
            if (name == null || name.isBlank()) return Result.error("名称不能为空");
            reportFormService.renameForm(id, name);
            return Result.success(null);
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }

    @PostMapping("/forms/{id}/pin")
    @Operation(summary = "置顶/取消置顶报表")
    public Result<?> togglePin(@PathVariable Long id, HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.ADMIN);
        if (denied != null) return denied;
        try {
            reportFormService.togglePin(id);
            return Result.success(null);
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }

    @PostMapping("/forms/{id}/duplicate")
    @Operation(summary = "复制报表表单")
    public Result<?> duplicateForm(@PathVariable Long id, HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.ADMIN);
        if (denied != null) return denied;
        try {
            String username = getCurrentUsername(request);
            var dup = reportFormService.duplicateForm(id, username);
            return Result.success(dup);
        } catch (Exception e) {
            log.error("复制失败 form={}: {}", id, e.getMessage());
            return Result.error(e.getMessage());
        }
    }

    // ──────────────── 版本快照 ────────────────

    @GetMapping("/forms/{id}/versions")
    @Operation(summary = "查询版本快照历史")
    public Result<?> listVersions(@PathVariable Long id, HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.ADMIN);
        if (denied != null) return Result.error(denied.getMessage());
        try {
            var form = reportFormService.getById(id);
            if (form == null) return Result.error("报表不存在");
            return Result.success(form.getVersionSnapshotsJson());
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }

    // ──────────────── 模板操作 ────────────────

    @PostMapping("/forms/{id}/save-as-template")
    @Operation(summary = "保存为模板")
    public Result<?> saveAsTemplate(@PathVariable Long id, @RequestBody Map<String, Object> body,
                                     HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.ADMIN);
        if (denied != null) return denied;
        try {
            String username = getCurrentUsername(request);
            boolean shared = body.containsKey("shared") && (Boolean) body.get("shared");
            var template = reportFormService.saveAsTemplate(id, shared, username);
            return Result.success(template);
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }

    @GetMapping("/templates")
    @Operation(summary = "查询共享模板列表")
    public Result<?> listTemplates() {
        return Result.success(reportFormService.listTemplates());
    }

    @PostMapping("/forms/from-word")
    @Operation(summary = "从 Word 文档导入创建报表")
    public Result<?> createFromWord(@RequestParam("file") MultipartFile file,
                                    HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.STAFF);
        if (denied != null) return denied;
        try {
            String name = Objects.requireNonNullElse(file.getOriginalFilename(), "未命名报表")
                    .replaceAll("\\.(docx|doc)$", "");
            var result = importService.importFromWord(file, name);
            String username = getCurrentUsername(request);
            var form = reportFormService.createFromImport(result, username);
            log.info("[report-form] Word 导入创建: id={} name={}", form.getId(), form.getName());
            return Result.success(form);
        } catch (Exception e) {
            log.error("Word 导入失败", e);
            return Result.error("Word 导入失败: " + e.getMessage());
        }
    }

    @PostMapping("/forms/from-template/{templateId}")
    @Operation(summary = "从模板创建报表")
    public Result<?> createFromTemplate(@PathVariable Long templateId, HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.ADMIN);
        if (denied != null) return denied;
        try {
            String username = getCurrentUsername(request);
            var form = reportFormService.duplicateForm(templateId, username);
            form.setName(form.getName().replace(" (副本)", ""));
            form.setUpdatedAt(java.time.LocalDateTime.now());
            definitionMapper.update(form);
            return Result.success(form);
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }

    // ──────────────── Word 模板管理 ────────────────

    @PostMapping("/forms/{id}/word-templates")
    @Operation(summary = "上传并绑定 Word 打印模板")
    public Result<?> uploadWordTemplate(@PathVariable Long id,
                                        @RequestParam("file") MultipartFile file,
                                        @RequestParam(value = "name", required = false) String templateName,
                                        HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.ADMIN);
        if (denied != null) return denied;
        try {
            var form = reportFormService.getById(id);
            if (form == null) return Result.error("报表不存在");

            // 解析书签，并按 layout fieldKey 自动建立映射
            var bookmarks = wordService.parseBookmarks(file.getBytes());
            Map<String, String> autoMapping = wordService.suggestBookmarkMapping(form.getLayoutJson(), bookmarks);
            String name = templateName != null ? templateName
                : Objects.requireNonNullElse(file.getOriginalFilename(), "未命名模板")
                    .replaceAll("\\.(docx|doc)$", "");

            // 存储模板字节到 form 的 word_template_ids_json
            String wtId = "wt_" + java.util.UUID.randomUUID().toString().substring(0, 8);
            var binding = new java.util.HashMap<String, Object>();
            binding.put("id", wtId);
            binding.put("name", name);
            binding.put("bookmarks", bookmarks);
            binding.put("bookmarkMapping", autoMapping);

            // 追加到 word_template_ids_json
            var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            com.fasterxml.jackson.databind.node.ArrayNode templates;
            String existing = form.getWordTemplateIdsJson();
            if (existing != null && !existing.isEmpty()) {
                templates = (com.fasterxml.jackson.databind.node.ArrayNode) mapper.readTree(existing);
            } else {
                templates = mapper.createArrayNode();
            }
            templates.add(mapper.valueToTree(binding));
            form.setWordTemplateIdsJson(templates.toString());

            // 存储模板文件（使用外部目录或内存）
            // 简化：将模板字节存储为 base64 在 binding 中（生产环境应使用文件存储）
            String base64 = java.util.Base64.getEncoder().encodeToString(file.getBytes());
            ((com.fasterxml.jackson.databind.node.ObjectNode) templates.get(templates.size() - 1))
                .put("data", base64);

            form.setWordTemplateIdsJson(templates.toString());
            reportFormService.update(id, java.util.Map.of("wordTemplateIdsJson", templates.toString()),
                getCurrentUsername(request));

            return Result.success(binding);
        } catch (Exception e) {
            log.error("Word模板上传失败", e);
            return Result.error("Word模板上传失败: " + e.getMessage());
        }
    }

    @GetMapping("/forms/{id}/word-templates")
    @Operation(summary = "查看已绑定的 Word 模板列表")
    public Result<?> listWordTemplates(@PathVariable Long id, HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.ADMIN);
        if (denied != null) return Result.error(denied.getMessage());
        var form = reportFormService.getById(id);
        if (form == null) return Result.error("报表不存在");
        return Result.success(form.getWordTemplateIdsJson());
    }

    @DeleteMapping("/forms/{id}/word-templates/{wtId}")
    @Operation(summary = "解绑 Word 模板")
    public Result<?> unbindWordTemplate(@PathVariable Long id, @PathVariable String wtId,
                                        HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.ADMIN);
        if (denied != null) return denied;
        try {
            var form = reportFormService.getById(id);
            var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            var templates = mapper.readTree(form.getWordTemplateIdsJson());
            var filtered = mapper.createArrayNode();
            for (var t : templates) {
                if (!t.get("id").asText().equals(wtId)) filtered.add(t);
            }
            form.setWordTemplateIdsJson(filtered.toString());
            reportFormService.update(id, java.util.Map.of("wordTemplateIdsJson", filtered.toString()),
                getCurrentUsername(request));
            return Result.success(null);
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }

    // ──────────────── 选项集 CRUD ────────────────

    @GetMapping("/option-sets")
    @Operation(summary = "查询可见选项集（按账号体系与创建人过滤）")
    public Result<List<ReportFormOptionSet>> listOptionSets(
            @RequestParam(required = false) Long formId,
            HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.ADMIN);
        if (denied != null) return Result.error(denied.getMessage());
        String username = getCurrentUsername(request);
        String authProfile = resolveAuthProfile(request);
        return Result.success(reportFormService.listOptionSets(username, authProfile, formId));
    }

    @GetMapping("/option-sets/{id}")
    @Operation(summary = "查询单个选项集")
    public Result<?> getOptionSet(@PathVariable Long id, HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.ADMIN);
        if (denied != null) return Result.error(denied.getMessage());
        return Result.success(reportFormService.getOptionSet(id));
    }

    @PostMapping("/option-sets")
    @Operation(summary = "创建选项集")
    public Result<?> createOptionSet(@RequestBody Map<String, Object> body,
                                     HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.ADMIN);
        if (denied != null) return denied;
        try {
            String name = (String) body.get("name");
            String scope = (String) body.getOrDefault("scope", "global");
            Long formId = body.containsKey("formId") ? ((Number) body.get("formId")).longValue() : null;
            String itemsJson = (String) body.get("itemsJson");
            String username = getCurrentUsername(request);
            String authProfile = resolveAuthProfile(request);
            var os = reportFormService.createOptionSet(name, scope, formId, itemsJson, username, authProfile);
            return Result.success(os);
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }

    @PutMapping("/option-sets/{id}")
    @Operation(summary = "更新选项集")
    public Result<?> updateOptionSet(@PathVariable Long id,
                                     @RequestBody Map<String, Object> body,
                                     HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.ADMIN);
        if (denied != null) return denied;
        try {
            String name = (String) body.get("name");
            String itemsJson = (String) body.get("itemsJson");
            String username = getCurrentUsername(request);
            reportFormService.updateOptionSet(id, name, itemsJson, username);
            return Result.success(null);
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }

    @DeleteMapping("/option-sets/{id}")
    @Operation(summary = "删除选项集")
    public Result<?> deleteOptionSet(@PathVariable Long id,
                                     HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.ADMIN);
        if (denied != null) return denied;
        try {
            String username = getCurrentUsername(request);
            reportFormService.deleteOptionSet(id, username);
            return Result.success(null);
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }

    private Result<?> requireMinRole(HttpServletRequest request, RoleEnum minRole) {
        Object attr = request.getAttribute(AdminAuthInterceptor.CURRENT_ADMIN_USER_ATTR);
        if (!(attr instanceof User currentUser)) {
            return Result.error("当前登录信息无效");
        }
        RoleEnum currentRole = currentUser.getRole() == null ? RoleEnum.MEMBER : currentUser.getRole();
        if (currentRole.getLevel() < minRole.getLevel()) {
            return Result.error("无权限访问");
        }
        return null;
    }

    /** 管理员或该报表发布者/创建者可操作 */
    private Result<?> requireFormManager(HttpServletRequest request, Long formId) {
        Result<?> denied = requireMinRole(request, RoleEnum.STAFF);
        if (denied != null) return denied;
        User currentUser = getCurrentUser(request);
        RoleEnum currentRole = currentUser.getRole() == null ? RoleEnum.MEMBER : currentUser.getRole();
        if (currentRole.getLevel() >= RoleEnum.ADMIN.getLevel()) {
            return null;
        }
        ReportFormDefinition form = definitionMapper.selectById(formId);
        if (form == null) {
            return Result.error("报表不存在");
        }
        if (reportFillService.isFormPublisher(form, currentUser)) {
            return null;
        }
        return Result.error("仅发布者或管理员可执行此操作");
    }

    private User getCurrentUser(HttpServletRequest request) {
        Object attr = request.getAttribute(AdminAuthInterceptor.CURRENT_ADMIN_USER_ATTR);
        if (attr instanceof User user) {
            return user;
        }
        throw new IllegalStateException("当前登录信息无效");
    }

    private String getCurrentUsername(HttpServletRequest request) {
        Object attr = request.getAttribute(AdminAuthInterceptor.CURRENT_ADMIN_USER_ATTR);
        if (attr instanceof User user) {
            return user.getUsername();
        }
        return "unknown";
    }

    private String resolveAuthProfile(HttpServletRequest request) {
        Object attr = request.getAttribute(AdminAuthInterceptor.CURRENT_ADMIN_USER_ATTR);
        if (attr instanceof User user) {
            String p = user.getAuthProfile();
            if (p != null && !p.isBlank()) {
                return p.trim();
            }
        }
        return AuthProfileConstants.WEB_PASSWORD;
    }

    private String getCurrentUserRole(HttpServletRequest request) {
        Object attr = request.getAttribute(AdminAuthInterceptor.CURRENT_ADMIN_USER_ATTR);
        if (attr instanceof User user && user.getRole() != null) {
            return user.getRole().name();
        }
        return "MEMBER";
    }

    private String resolveWordTemplateName(ReportFormDefinition form, String wtId) {
        if (form == null || form.getWordTemplateIdsJson() == null || form.getWordTemplateIdsJson().isBlank()) {
            return "";
        }
        try {
            JsonNode templates = OBJECT_MAPPER.readTree(form.getWordTemplateIdsJson());
            if (!templates.isArray()) return "";
            for (JsonNode node : templates) {
                if (wtId.equals(node.path("id").asText(""))) {
                    return node.path("name").asText("");
                }
            }
        } catch (Exception ignored) {
            // fall through
        }
        return "";
    }
}
