package com.example.demo.modules.reportform.controller;

import com.example.demo.common.config.AdminAuthInterceptor;
import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.mapper.UserMapper;
import com.example.demo.modules.reportform.dto.CreateSubmissionInstanceRequest;
import com.example.demo.modules.reportform.dto.SubmissionRequest;
import com.example.demo.modules.reportform.entity.ReportFormDefinition;
import com.example.demo.modules.reportform.entity.ReportFormSubmission;
import com.example.demo.modules.reportform.mapper.ReportFormDefinitionMapper;
import com.example.demo.modules.reportform.mapper.ReportFormSubmissionMapper;
import com.example.demo.modules.reportform.service.ReportFillService;
import com.example.demo.modules.reportform.service.ReportFormExportService;
import com.example.demo.modules.reportform.service.ReportFormWordService;
import com.example.demo.modules.reportform.util.ReportFormExportFilename;
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
    private final UserMapper userMapper;

    public ReportFillController(ReportFillService reportFillService,
                                UserMapper userMapper,
                                ReportFormSubmissionMapper submissionMapper,
                                ReportFormExportService exportService,
                                ReportFormDefinitionMapper definitionMapper,
                                ReportFormWordService wordService) {
        this.reportFillService = reportFillService;
        this.submissionMapper = submissionMapper;
        this.exportService = exportService;
        this.definitionMapper = definitionMapper;
        this.wordService = wordService;
        this.userMapper = userMapper;
    }

    @GetMapping("/users/search")
    @Operation(summary = "搜索用户（昵称/用户名）")
    public Result<?> searchUsers(@RequestParam String keyword) {
        List<User> users = userMapper.searchByKeyword(keyword);
        var list = users.stream().map(u -> {
            var m = new java.util.HashMap<String, Object>();
            m.put("id", u.getId());
            m.put("username", u.getUsername());
            m.put("displayNickname", u.getDisplayNickname() != null ? u.getDisplayNickname() : "");
            return m;
        }).toList();
        return Result.success(list);
    }

    @GetMapping("/forms/{id}/can-edit")
    @Operation(summary = "检查当前用户是否有该表单的编辑权限")
    public Result<?> canEdit(@PathVariable Long id,
                             @RequestParam(required = false) Long submissionId,
                             HttpServletRequest request) {
        User currentUser = getCurrentUser(request);
        String role = currentUser.getRole() != null ? currentUser.getRole().name() : "MEMBER";
        Long userId = parseUserId(currentUser.getId());
        ReportFormDefinition form = definitionMapper.selectById(id);
        if (form == null) return Result.error("表单不存在");
        boolean canEdit;
        if (submissionId != null) {
            ReportFormSubmission sub = submissionMapper.selectById(submissionId);
            canEdit = reportFillService.canEditSubmission(form, role, userId, currentUser, sub);
        } else {
            canEdit = reportFillService.canEdit(form, role, userId)
                    || reportFillService.isFormPublisher(form, currentUser);
        }
        var result = new java.util.HashMap<String, Object>();
        result.put("canEdit", canEdit);
        result.put("role", role);
        result.put("publisher", reportFillService.isFormPublisher(form, currentUser));
        return Result.success(result);
    }

    @GetMapping("/available")
    @Operation(summary = "获取当前用户可填报的表单列表")
    public Result<?> available(HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.MEMBER);
        if (denied != null) return Result.error(denied.getMessage());
        User currentUser = getCurrentUser(request);
        String role = currentUser.getRole() != null ? currentUser.getRole().name() : "MEMBER";
        Long userId = parseUserId(currentUser.getId());
        return Result.success(reportFillService.getAvailableEnriched(role, userId, currentUser));
    }

    @GetMapping("/forms/{id}/my-submissions")
    @Operation(summary = "当前用户在某报表下的全部子文件")
    public Result<?> listMySubmissions(@PathVariable Long id, HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.MEMBER);
        if (denied != null) return denied;
        Long userId = parseUserId(getCurrentUser(request).getId());
        return Result.success(reportFillService.listMySubmissions(id, userId));
    }

    @PostMapping("/forms/{id}/instances")
    @Operation(summary = "创建个人多份子文件")
    public Result<?> createInstance(@PathVariable Long id,
                                    @RequestBody(required = false) CreateSubmissionInstanceRequest req,
                                    HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.MEMBER);
        if (denied != null) return denied;
        try {
            Long userId = parseUserId(getCurrentUser(request).getId());
            String label = req != null ? req.getInstanceLabel() : null;
            return Result.success(reportFillService.createSubmissionInstance(id, userId, label));
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }

    @GetMapping("/forms/{id}/publisher-overview")
    @Operation(summary = "发布者视角：按填报人分组的子文件列表")
    public Result<?> publisherOverview(@PathVariable Long id, HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.MEMBER);
        if (denied != null) return denied;
        User currentUser = getCurrentUser(request);
        ReportFormDefinition form = definitionMapper.selectById(id);
        if (form == null) return Result.error("表单不存在");
        if (!reportFillService.isFormPublisher(form, currentUser)) {
            return Result.error("仅发布者可查看全部填报记录");
        }
        return Result.success(reportFillService.listPublisherOverview(id));
    }

    @DeleteMapping("/forms/{formId}/submissions/{submissionId}")
    @Operation(summary = "删除个人多份子文件")
    public Result<?> deleteSubmission(@PathVariable Long formId,
                                      @PathVariable Long submissionId,
                                      HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.MEMBER);
        if (denied != null) return denied;
        try {
            User currentUser = getCurrentUser(request);
            String role = currentUser.getRole() != null ? currentUser.getRole().name() : "MEMBER";
            Long userId = parseUserId(currentUser.getId());
            reportFillService.deleteSubmissionInstance(formId, submissionId, role, userId, currentUser);
            return Result.success(null);
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }

    @GetMapping("/forms/{id}/my-submission")
    @Operation(summary = "获取当前用户对指定报表的填报表单")
    public Result<?> getMySubmission(@PathVariable Long id,
                                     @RequestParam(required = false) Long submissionId,
                                     HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.MEMBER);
        if (denied != null) return denied;
        try {
            User currentUser = getCurrentUser(request);
            Long userId = parseUserId(currentUser.getId());
            String role = currentUser.getRole() != null ? currentUser.getRole().name() : "MEMBER";
            ReportFormDefinition form = definitionMapper.selectById(id);
            if (form == null) return Result.error("表单不存在");
            if (submissionId != null) {
                ReportFormSubmission sub = reportFillService.requireAccessibleSubmission(
                        id, submissionId, role, userId, currentUser);
                return Result.success(sub);
            }
            String mode = getFillMode(form);
            Long effectiveUserId = "individual".equals(mode) ? userId : 0L;
            if ("individual".equals(mode) && reportFillService.readAllowMultipleInstances(form)) {
                return Result.error("多份子文件模式请指定 submissionId 或从填报中心创建");
            }
            var sub = reportFillService.getOrCreateSubmission(id, effectiveUserId);
            return Result.success(sub);
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }

    private String getFillMode(ReportFormDefinition form) {
        try {
            if (form.getFillPolicyJson() != null) {
                var node = new com.fasterxml.jackson.databind.ObjectMapper().readTree(form.getFillPolicyJson());
                if (node.has("mode")) return node.get("mode").asText();
            }
        } catch (Exception ignored) {}
        return "shared";
    }

    @PutMapping("/forms/{id}/my-submission")
    @Operation(summary = "保存当前用户对指定报表的填报表单")
    public Result<?> saveMySubmission(@PathVariable Long id, @RequestBody SubmissionRequest req,
                                      HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.MEMBER);
        if (denied != null) return denied;
        try {
            User cu = getCurrentUser(request);
            Long userId = parseUserId(cu.getId());
            String nick = cu.getDisplayNickname();
            String role = cu.getRole() != null ? cu.getRole().name() : "MEMBER";
            if (req.getSubmissionId() != null) {
                var sub = reportFillService.saveSubmissionById(
                        req.getSubmissionId(), userId, req.getFieldValuesJson(), req.getExpectedVersion(), nick, role, cu);
                return Result.success(sub);
            }
            ReportFormDefinition form = definitionMapper.selectById(id);
            String mode = getFillMode(form);
            Long effectiveUserId = "individual".equals(mode) ? userId : 0L;
            var sub = reportFillService.saveSubmission(id, effectiveUserId, req.getFieldValuesJson(), req.getExpectedVersion(), nick);
            return Result.success(sub);
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }

    @PostMapping("/forms/{id}/my-submission/submit")
    @Operation(summary = "提交当前用户对指定报表的填报表单")
    public Result<?> submitMySubmission(@PathVariable Long id, HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.MEMBER);
        if (denied != null) return denied;
        try {
            User cu = getCurrentUser(request);
            Long userId = parseUserId(cu.getId());
            String role = cu.getRole() != null ? cu.getRole().name() : "MEMBER";
            Long submissionId = null;
            if (request.getParameter("submissionId") != null) {
                submissionId = Long.parseLong(request.getParameter("submissionId"));
            }
            if (submissionId != null) {
                var sub = reportFillService.submitSubmissionById(submissionId, userId, role, cu);
                return Result.success(sub);
            }
            ReportFormDefinition form = definitionMapper.selectById(id);
            String mode = getFillMode(form);
            Long effectiveUserId = "individual".equals(mode) ? userId : 0L;
            var sub = reportFillService.submitSubmission(id, effectiveUserId);
            return Result.success(sub);
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }

    @GetMapping("/forms/{id}/submissions")
    @Operation(summary = "获取指定报表的所有提交记录（发布者或管理员）")
    public Result<?> listSubmissions(@PathVariable Long id, HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.MEMBER);
        if (denied != null) return denied;
        User currentUser = getCurrentUser(request);
        ReportFormDefinition form = definitionMapper.selectById(id);
        if (form == null) return Result.error("表单不存在");
        boolean admin = currentUser.getRole() != null && currentUser.getRole().getLevel() >= RoleEnum.ADMIN.getLevel();
        if (!admin && !reportFillService.isFormPublisher(form, currentUser)) {
            return Result.error("无权查看全部提交记录");
        }
        return Result.success(reportFillService.listSubmissionsWithUserDisplay(id));
    }

    @GetMapping("/forms/{id}/export")
    @Operation(summary = "导出报表（单条或批量）")
    public ResponseEntity<byte[]> exportSingle(@PathVariable Long id, @RequestParam(required = false) Long submissionId) {
        try {
            ReportFormDefinition form = definitionMapper.selectById(id);
            if (form == null) throw new IllegalArgumentException("表单不存在");
            ReportFormSubmission submission = submissionId != null ? submissionMapper.selectById(submissionId) : null;
            byte[] data;
            boolean batch = submissionId == null;
            if (submissionId != null) {
                data = exportService.exportSingle(id, submissionId);
            } else {
                data = exportService.exportBatch(id);
            }
            String filename = ReportFormExportFilename.build(form, submission, batch, "xlsx");
            return ResponseEntity.ok()
                .headers(ReportFormExportFilename.attachmentHeaders(filename))
                .header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
                .body(data);
        } catch (Exception e) {
            log.error("[report-form] Excel 导出失败: form={} submission={}", id, submissionId, e);
            throw new IllegalArgumentException("Excel 导出失败: " + e.getMessage());
        }
    }

    @GetMapping("/forms/{id}/export-pdf")
    @Operation(summary = "导出报表为 PDF")
    public ResponseEntity<byte[]> exportPdf(@PathVariable Long id,
                                            @RequestParam(required = false) Long submissionId) throws Exception {
        try {
            ReportFormDefinition form = definitionMapper.selectById(id);
            if (form == null) throw new IllegalArgumentException("表单不存在");
            ReportFormSubmission submission = submissionId != null ? submissionMapper.selectById(submissionId) : null;
            byte[] data;
            boolean batch = submissionId == null;
            if (submissionId != null) {
                data = exportService.exportSinglePdf(id, submissionId);
            } else {
                data = exportService.exportBatchPdf(id);
            }
            String filename = ReportFormExportFilename.build(form, submission, batch, "pdf");
            return ResponseEntity.ok()
                .headers(ReportFormExportFilename.attachmentHeaders(filename))
                .header("Content-Type", "application/pdf")
                .body(data);
        } catch (Exception e) {
            log.error("[report-form] PDF 导出失败: form={} submission={}", id, submissionId, e);
            throw new IllegalArgumentException("PDF 导出失败: " + e.getMessage());
        }
    }

    @GetMapping("/forms/{id}/export-word/{wtId}")
    @Operation(summary = "Word 模板注入导出")
    public ResponseEntity<byte[]> exportWord(@PathVariable Long id, @PathVariable String wtId,
                                             @RequestParam Long submissionId) throws Exception {
        return doExportWord(id, wtId, submissionId, null);
    }

    @PostMapping("/forms/{id}/export-word/{wtId}")
    @Operation(summary = "Word 模板注入导出（可附带最新 fieldValues）")
    public ResponseEntity<byte[]> exportWordPost(@PathVariable Long id, @PathVariable String wtId,
                                                 @RequestBody(required = false) Map<String, Object> body) throws Exception {
        if (body == null || body.get("submissionId") == null) {
            throw new IllegalArgumentException("缺少 submissionId");
        }
        long submissionId = ((Number) body.get("submissionId")).longValue();
        String fieldValuesJson = body.get("fieldValuesJson") != null
                ? String.valueOf(body.get("fieldValuesJson")) : null;
        return doExportWord(id, wtId, submissionId, fieldValuesJson);
    }

    private ResponseEntity<byte[]> doExportWord(Long id, String wtId, Long submissionId,
                                                String fieldValuesOverrideJson) throws Exception {
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
        var bookmarkMapping = new java.util.LinkedHashMap<String, String>();
        var bmMap = target.get("bookmarkMapping");
        if (bmMap != null) {
            var iter = bmMap.fields();
            while (iter.hasNext()) {
                var e = iter.next();
                bookmarkMapping.put(e.getKey(), e.getValue().asText());
            }
        }
        var templateBookmarks = wordService.parseBookmarks(templateBytes);
        var suggested = wordService.suggestBookmarkMapping(form.getLayoutJson(), templateBookmarks);
        suggested.forEach(bookmarkMapping::putIfAbsent);

        byte[] data = wordService.exportWord(id, submissionId, templateBytes, bookmarkMapping, fieldValuesOverrideJson);
        ReportFormSubmission submission = submissionMapper.selectById(submissionId);
        String filename = ReportFormExportFilename.build(form, submission, false, "docx");
        return ResponseEntity.ok()
            .headers(ReportFormExportFilename.attachmentHeaders(filename))
            .header("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
            .body(data);
    }

    @RequestMapping(value = "/forms/{id}/print", method = { RequestMethod.GET, RequestMethod.POST })
    @Operation(summary = "打印报表（生成 PDF 返回，GET/POST 均可）")
    public ResponseEntity<byte[]> printForm(@PathVariable Long id,
                                            @RequestParam(required = false) Long submissionId,
                                            @RequestBody(required = false) Map<String, Object> body) throws Exception {
        Long sid = submissionId;
        if (sid == null && body != null && body.get("submissionId") != null) {
            sid = ((Number) body.get("submissionId")).longValue();
        }
        ReportFormDefinition form = definitionMapper.selectById(id);
        if (form == null) throw new IllegalArgumentException("表单不存在");
        ReportFormSubmission submission = sid != null ? submissionMapper.selectById(sid) : null;
        byte[] data;
        boolean batch = sid == null;
        if (sid != null) {
            data = exportService.exportSinglePdf(id, sid);
        } else {
            data = exportService.exportBatchPdf(id);
        }
        String filename = ReportFormExportFilename.build(form, submission, batch, "pdf");
        log.info("[report-form] 打印: form={} submission={} size={}", id, sid, data.length);
        return ResponseEntity.ok()
            .headers(ReportFormExportFilename.inlineHeaders(filename))
            .header("Content-Type", "application/pdf")
            .body(data);
    }

    private User getCurrentUser(HttpServletRequest request) {
        return (User) request.getAttribute(AdminAuthInterceptor.CURRENT_ADMIN_USER_ATTR);
    }

    private Long parseUserId(String id) {
        if (id == null) return 0L;
        try {
            return Long.parseLong(id);
        } catch (NumberFormatException e) {
            // 非数字 ID（如 admin 等），用 hashCode 映射到 Long 范围
            return (long) Math.abs(id.hashCode() % 1_000_000);
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
}
