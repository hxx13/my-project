package com.example.demo.modules.material.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.material.service.MaterialAutoApproveService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/material/admin/auto-approve")
@Tag(name = "物资申领自动审批")
public class MaterialAutoApproveController {

    private final MaterialAutoApproveService autoApproveService;
    private final AuthContextService authContextService;

    public MaterialAutoApproveController(
            MaterialAutoApproveService autoApproveService,
            AuthContextService authContextService
    ) {
        this.autoApproveService = autoApproveService;
        this.authContextService = authContextService;
    }

    @GetMapping("/trust-rules")
    @Operation(summary = "按人信任规则列表")
    public Result<List<Map<String, Object>>> listTrust(
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        User user = resolveStaff(authorization);
        if (user == null) return Result.error("需要教职工权限");
        return Result.success(autoApproveService.listTrustRules(user.getId()));
    }

    @PutMapping("/trust-rules")
    @Operation(summary = "保存按人信任规则")
    public Result<Map<String, Object>> saveTrust(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody Map<String, Object> body) {
        User user = resolveStaff(authorization);
        if (user == null) return Result.error("需要教职工权限");
        try {
            return Result.success(autoApproveService.saveTrustRule(user.getId(), body));
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    @DeleteMapping("/trust-rules/{id}")
    public Result<Void> deleteTrust(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable long id) {
        User user = resolveStaff(authorization);
        if (user == null) return Result.error("需要教职工权限");
        autoApproveService.deleteTrustRule(user.getId(), id);
        return Result.success(null);
    }

    @GetMapping("/batch-rules")
    public Result<List<Map<String, Object>>> listBatch(
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        User user = resolveStaff(authorization);
        if (user == null) return Result.error("需要教职工权限");
        return Result.success(autoApproveService.listBatchRules(user.getId()));
    }

    @PutMapping("/batch-rules")
    public Result<Map<String, Object>> saveBatch(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody Map<String, Object> body) {
        User user = resolveStaff(authorization);
        if (user == null) return Result.error("需要教职工权限");
        try {
            return Result.success(autoApproveService.saveBatchRule(user.getId(), body));
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    @DeleteMapping("/batch-rules/{id}")
    public Result<Void> deleteBatch(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable long id) {
        User user = resolveStaff(authorization);
        if (user == null) return Result.error("需要教职工权限");
        autoApproveService.deleteBatchRule(user.getId(), id);
        return Result.success(null);
    }

    @GetMapping("/candidates")
    @Operation(summary = "可选申请人（待审+历史，按姓名锁定）")
    public Result<List<Map<String, Object>>> candidates(
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        User user = resolveStaff(authorization);
        if (user == null) return Result.error("需要教职工权限");
        return Result.success(autoApproveService.listCandidates(user.getId()));
    }

    @GetMapping("/suggestions")
    @Operation(summary = "历史通过统计（仅建议，不自动生效）")
    public Result<List<Map<String, Object>>> suggestions(
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        User user = resolveStaff(authorization);
        if (user == null) return Result.error("需要教职工权限");
        return Result.success(autoApproveService.listSuggestions(user.getId()));
    }

    @PostMapping("/run-now")
    @Operation(summary = "立即执行一次定时自动审批逻辑")
    public Result<Map<String, Object>> runNow(
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        User user = resolveStaff(authorization);
        if (user == null) return Result.error("需要教职工权限");
        return Result.success(autoApproveService.runScheduledJobForOwner(user.getId()));
    }

    private User resolveStaff(String authorization) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null || user.getRole() == RoleEnum.MEMBER) {
            return null;
        }
        return user;
    }
}
