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
        Result<?> denied = requireMinRole(request, RoleEnum.ADMIN);
        if (denied != null) return denied;
        try {
            String username = getCurrentUsername(request);
            reportFormService.update(id, body, username);
            return Result.success(null);
        } catch (Exception e) {
            log.error("更新报表失败", e);
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
