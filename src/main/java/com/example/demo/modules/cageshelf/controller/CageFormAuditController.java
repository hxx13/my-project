package com.example.demo.modules.cageshelf.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.cageshelf.entity.CageFormTemplateVersion;
import com.example.demo.modules.cageshelf.service.CageFormAuditService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import jakarta.servlet.http.HttpServletRequest;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 笼位表单审计 + 发布版本查询。
 */
@RestController
@RequestMapping("/api/admin/cage-form")
@Tag(name = "笼位表单审计")
public class CageFormAuditController {

    private final AuthContextService authContextService;
    private final CageFormAuditService auditService;

    public CageFormAuditController(AuthContextService authContextService,
                                   CageFormAuditService auditService) {
        this.authContextService = authContextService;
        this.auditService = auditService;
    }

    private User resolveUser(HttpServletRequest req) {
        User u = authContextService.resolveUserFromBearer(req.getHeader("Authorization"));
        if (u == null) return null;
        if (u.getRole() == null) u.setRole(RoleEnum.MEMBER);
        return u;
    }

    private Result<?> requireMinRole(User u, RoleEnum minRole) {
        if (u == null) return Result.error("未登录");
        if (u.getStatus() != null && u.getStatus() == 0) return Result.error("账号已禁用");
        if (u.getRole().getLevel() < minRole.getLevel()) return Result.error("无权限");
        return null;
    }

    @GetMapping("/audit")
    @Operation(summary = "笼位表单审计分页（data / dict）")
    public Result<Map<String, Object>> audit(
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String changeType,
            @RequestParam(required = false) String entity,
            @RequestParam(required = false) String operatorId,
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "50") int pageSize,
            HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireMinRole(u, RoleEnum.STAFF);
        if (denied != null) return Result.fail(403, denied.getMessage());
        return Result.success(auditService.pageAudit(category, keyword, changeType, entity,
                operatorId, dateFrom, dateTo, page, pageSize));
    }

    @GetMapping("/versions")
    @Operation(summary = "表单发布版本（最新 + 历史列表）")
    public Result<Map<String, Object>> versions(
            @RequestParam(required = false, defaultValue = CageFormAuditService.FORM_KEY_DEFAULT) String formKey,
            HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireMinRole(u, RoleEnum.STAFF);
        if (denied != null) return Result.fail(403, denied.getMessage());
        CageFormTemplateVersion latest = auditService.getLatestVersion(formKey);
        List<CageFormTemplateVersion> all = auditService.listVersions(formKey);
        List<Map<String, Object>> versionRows = new ArrayList<>();
        for (CageFormTemplateVersion v : all) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("versionNo", v.getVersionNo());
            row.put("fieldCount", v.getFieldCount());
            row.put("publishedAt", v.getPublishedAt());
            row.put("publishedBy", v.getPublishedBy());
            versionRows.add(row);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("formKey", formKey);
        out.put("versionNo", latest == null ? 0 : latest.getVersionNo());
        out.put("fieldCount", latest == null ? 0 : latest.getFieldCount());
        out.put("publishedAt", latest == null ? null : latest.getPublishedAt());
        out.put("publishedBy", latest == null ? null : latest.getPublishedBy());
        out.put("versions", versionRows);
        return Result.success(out);
    }

    @GetMapping("/cage-history/{animalCageId}")
    @Operation(summary = "某笼位历史记录（按笼盒分组）")
    public Result<Map<String, Object>> cageHistory(@PathVariable Long animalCageId, HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireMinRole(u, RoleEnum.STAFF);
        if (denied != null) return Result.fail(403, denied.getMessage());
        return Result.success(auditService.cageHistory(animalCageId));
    }
}
