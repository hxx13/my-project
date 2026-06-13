package com.example.demo.modules.reportform.controller;

import com.example.demo.common.config.AdminAuthInterceptor;
import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.reportform.entity.ReportFormDefinition;
import com.example.demo.modules.reportform.entity.ReportFormOptionSet;
import com.example.demo.modules.reportform.service.ReportFormImportService;
import com.example.demo.modules.reportform.service.ReportFormService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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

    private final ReportFormService reportFormService;
    private final ReportFormImportService importService;

    public ReportFormController(ReportFormService reportFormService,
                                ReportFormImportService importService) {
        this.reportFormService = reportFormService;
        this.importService = importService;
    }

    @GetMapping("/forms/page")
    @Operation(summary = "分页查询表单定义列表")
    public Result<List<ReportFormDefinition>> page(HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.STAFF);
        if (denied != null) return Result.error(denied.getMessage());
        return Result.success(reportFormService.page());
    }

    @GetMapping("/forms/{id}")
    @Operation(summary = "按ID查询表单定义")
    public Result<ReportFormDefinition> getById(@PathVariable Long id,
                                                HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.STAFF);
        if (denied != null) return Result.error(denied.getMessage());
        return Result.success(reportFormService.getById(id));
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
        Result<?> denied = requireMinRole(request, RoleEnum.ADMIN);
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
        Result<?> denied = requireMinRole(request, RoleEnum.ADMIN);
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
        Result<?> denied = requireMinRole(request, RoleEnum.ADMIN);
        if (denied != null) return denied;
        try {
            reportFormService.archive(id);
            return Result.success(null);
        } catch (Exception e) {
            log.error("归档失败 form={}: {}", id, e.getMessage());
            return Result.error(e.getMessage());
        }
    }

    @PostMapping("/forms/{id}/unarchive")
    @Operation(summary = "取消归档报表表单")
    public Result<?> unarchive(@PathVariable Long id, HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.ADMIN);
        if (denied != null) return denied;
        try {
            reportFormService.unarchive(id);
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

    // ──────────────── 选项集 CRUD ────────────────

    @GetMapping("/option-sets")
    @Operation(summary = "查询所有选项集")
    public Result<List<ReportFormOptionSet>> listOptionSets(HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.ADMIN);
        if (denied != null) return Result.error(denied.getMessage());
        return Result.success(reportFormService.listOptionSets());
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
            var os = reportFormService.createOptionSet(name, scope, formId, itemsJson);
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
            reportFormService.updateOptionSet(id, name, itemsJson);
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
            reportFormService.deleteOptionSet(id);
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
        RoleEnum currentRole = currentUser.getRole() == null ? RoleEnum.STUDENT : currentUser.getRole();
        if (currentRole.getLevel() < minRole.getLevel()) {
            return Result.error("无权限访问");
        }
        return null;
    }

    private String getCurrentUsername(HttpServletRequest request) {
        Object attr = request.getAttribute(AdminAuthInterceptor.CURRENT_ADMIN_USER_ATTR);
        if (attr instanceof User user) {
            return user.getUsername();
        }
        return "unknown";
    }
}
