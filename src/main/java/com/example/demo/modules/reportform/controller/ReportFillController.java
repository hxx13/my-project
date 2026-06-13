package com.example.demo.modules.reportform.controller;

import com.example.demo.common.config.AdminAuthInterceptor;
import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.reportform.dto.SubmissionRequest;
import com.example.demo.modules.reportform.entity.ReportFormDefinition;
import com.example.demo.modules.reportform.entity.ReportFormSubmission;
import com.example.demo.modules.reportform.mapper.ReportFormDefinitionMapper;
import com.example.demo.modules.reportform.mapper.ReportFormSubmissionMapper;
import com.example.demo.modules.reportform.service.ReportFillService;
import com.example.demo.modules.reportform.service.ReportFormExportService;
import com.example.demo.modules.reportform.service.ReportFormWordService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin/report-fill")
@CrossOrigin("*")
@Tag(name = "报表填报")
public class ReportFillController {

    private static final Logger log = LoggerFactory.getLogger(ReportFillController.class);

    private final ReportFillService reportFillService;
    private final ReportFormSubmissionMapper submissionMapper;
    private final ReportFormExportService exportService;
    private final ReportFormDefinitionMapper definitionMapper;
    private final ReportFormWordService wordService;

    public ReportFillController(ReportFillService reportFillService,
                                ReportFormSubmissionMapper submissionMapper,
                                ReportFormExportService exportService,
                                ReportFormDefinitionMapper definitionMapper,
                                ReportFormWordService wordService) {
        this.reportFillService = reportFillService;
        this.submissionMapper = submissionMapper;
        this.exportService = exportService;
        this.definitionMapper = definitionMapper;
        this.wordService = wordService;
    }

    @GetMapping("/available")
    @Operation(summary = "获取当前用户可填报的表单列表")
    public Result<List<ReportFormDefinition>> available(HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.STUDENT);
        if (denied != null) return Result.error(denied.getMessage());
        User currentUser = getCurrentUser(request);
        String role = currentUser.getRole() != null ? currentUser.getRole().name() : "STUDENT";
        Long userId = parseUserId(currentUser.getId());
        return Result.success(reportFillService.getAvailable(role, userId));
    }

    @GetMapping("/forms/{id}/my-submission")
    @Operation(summary = "获取当前用户对指定报表的填报表单")
    public Result<?> getMySubmission(@PathVariable Long id, HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.STUDENT);
        if (denied != null) return denied;
        try {
            Long userId = parseUserId(getCurrentUser(request).getId());
            var sub = reportFillService.getOrCreateSubmission(id, userId);
            return Result.success(sub);
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }

    @PutMapping("/forms/{id}/my-submission")
    @Operation(summary = "保存当前用户对指定报表的填报表单")
    public Result<?> saveMySubmission(@PathVariable Long id, @RequestBody SubmissionRequest req,
                                      HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.STUDENT);
        if (denied != null) return denied;
        try {
            Long userId = parseUserId(getCurrentUser(request).getId());
            var sub = reportFillService.saveSubmission(id, userId, req.getFieldValuesJson(), req.getExpectedVersion());
            return Result.success(sub);
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }

    @PostMapping("/forms/{id}/my-submission/submit")
    @Operation(summary = "提交当前用户对指定报表的填报表单")
    public Result<?> submitMySubmission(@PathVariable Long id, HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.STUDENT);
        if (denied != null) return denied;
        try {
            Long userId = parseUserId(getCurrentUser(request).getId());
            var sub = reportFillService.submitSubmission(id, userId);
            return Result.success(sub);
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }

    @GetMapping("/forms/{id}/submissions")
    @Operation(summary = "获取指定报表的所有提交记录（管理员）")
    public Result<?> listSubmissions(@PathVariable Long id, HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.ADMIN);
        if (denied != null) return denied;
        return Result.success(submissionMapper.selectByFormId(id));
    }

    @GetMapping("/forms/{id}/export")
    @Operation(summary = "导出报表（单条或批量）")
    public ResponseEntity<byte[]> exportSingle(@PathVariable Long id, @RequestParam(required = false) Long submissionId) {
        try {
            byte[] data;
            String filename;
            if (submissionId != null) {
                data = exportService.exportSingle(id, submissionId);
                filename = "report-form-" + id + "-submission-" + submissionId + ".xlsx";
            } else {
                data = exportService.exportBatch(id);
                filename = "report-form-" + id + "-batch.xlsx";
            }
            return ResponseEntity.ok()
                .header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
                .header("Content-Disposition", "attachment; filename=\"" + filename + "\"")
                .body(data);
        } catch (Exception e) {
            throw new RuntimeException("导出失败: " + e.getMessage());
        }
    }

    @GetMapping("/forms/{id}/export-pdf")
    @Operation(summary = "导出报表为 PDF")
    public ResponseEntity<byte[]> exportPdf(@PathVariable Long id,
                                            @RequestParam(required = false) Long submissionId) throws Exception {
        byte[] data;
        String filename;
        if (submissionId != null) {
            data = exportService.exportSinglePdf(id, submissionId);
            filename = "report-form-" + id + "-submission-" + submissionId + ".pdf";
        } else {
            data = exportService.exportBatchPdf(id);
            filename = "report-form-" + id + "-batch.pdf";
        }
        return ResponseEntity.ok()
            .header("Content-Type", "application/pdf")
            .header("Content-Disposition", "attachment; filename=\"" + filename + "\"")
            .body(data);
    }

    @GetMapping("/forms/{id}/export-word/{wtId}")
    @Operation(summary = "Word 模板注入导出")
    public ResponseEntity<byte[]> exportWord(@PathVariable Long id, @PathVariable String wtId,
                                             @RequestParam Long submissionId) throws Exception {
        var form = definitionMapper.selectById(id);
        if (form == null) throw new RuntimeException("报表不存在");

        var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
        var templates = mapper.readTree(form.getWordTemplateIdsJson());
        com.fasterxml.jackson.databind.JsonNode target = null;
        for (var t : templates) {
            if (t.get("id").asText().equals(wtId)) { target = t; break; }
        }
        if (target == null) throw new RuntimeException("Word模板不存在");

        byte[] templateBytes = java.util.Base64.getDecoder().decode(target.get("data").asText());
        var bookmarkMapping = new java.util.HashMap<String, String>();
        var bmMap = target.get("bookmarkMapping");
        if (bmMap != null) {
            var iter = bmMap.fields();
            while (iter.hasNext()) {
                var e = iter.next();
                bookmarkMapping.put(e.getKey(), e.getValue().asText());
            }
        }

        byte[] data = wordService.exportWord(id, submissionId, templateBytes, bookmarkMapping);
        return ResponseEntity.ok()
            .header("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
            .header("Content-Disposition", "attachment; filename=\"report-form-" + id + ".docx\"")
            .body(data);
    }

    @PostMapping("/forms/{id}/print")
    @Operation(summary = "打印报表（接口预留）")
    public Result<?> printForm(@PathVariable Long id, @RequestBody Map<String, Object> body, HttpServletRequest request) {
        var denied = requireMinRole(request, RoleEnum.ADMIN);
        if (denied != null) return denied;
        log.info("[report-form] 打印请求 form={} params={}", id, body);
        return Result.success(Map.of("status", "submitted", "message", "打印任务已提交（接口预留）"));
    }

    private User getCurrentUser(HttpServletRequest request) {
        return (User) request.getAttribute(AdminAuthInterceptor.CURRENT_ADMIN_USER_ATTR);
    }

    private Long parseUserId(String id) {
        if (id == null) return null;
        try {
            return Long.parseLong(id);
        } catch (NumberFormatException e) {
            return null;
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
}
