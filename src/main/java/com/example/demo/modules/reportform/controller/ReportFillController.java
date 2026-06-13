package com.example.demo.modules.reportform.controller;

import com.example.demo.common.config.AdminAuthInterceptor;
import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.reportform.dto.SubmissionRequest;
import com.example.demo.modules.reportform.entity.ReportFormDefinition;
import com.example.demo.modules.reportform.entity.ReportFormSubmission;
import com.example.demo.modules.reportform.mapper.ReportFormSubmissionMapper;
import com.example.demo.modules.reportform.service.ReportFillService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/admin/report-fill")
@CrossOrigin("*")
@Tag(name = "报表填报")
public class ReportFillController {

    private static final Logger log = LoggerFactory.getLogger(ReportFillController.class);

    private final ReportFillService reportFillService;
    private final ReportFormSubmissionMapper submissionMapper;

    public ReportFillController(ReportFillService reportFillService,
                                ReportFormSubmissionMapper submissionMapper) {
        this.reportFillService = reportFillService;
        this.submissionMapper = submissionMapper;
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
